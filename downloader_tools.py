"""Downloader tools for Find Music: yt-dlp (and Deno, which yt-dlp needs for YouTube).

Encore does not download from YouTube or SoundCloud itself. It uses yt-dlp, a free open-source
downloader. These tools change often (YouTube changes its site, yt-dlp follows), so Encore keeps
them up to date by itself:

- They are downloaded only from the projects' official GitHub releases, and each file's SHA-256
  checksum is checked against the one the project publishes. Encore runs as root, so nothing else is
  ever accepted.
- They live in Decky's data folder for the plugin, not in the plugin folder, so a new Encore version
  does not replace them.
- A new version is tried before it is used (it must start and report its version). The version
  before it is kept, so a bad release can be undone.
- Encore looks for a new version at most once a day (more often never: no constant traffic), and
  right away when a download fails ("fix on failure").
- yt-dlp has a stable and a nightly channel. Nightly often fixes YouTube days earlier: when stable
  fails, nightly is tried.

Nothing is downloaded until the user presses Set up (Find Music is off and greyed out before that),
and Remove deletes the tools again.

When every way fails, the tools are marked broken for that site, and the screen shows a warning
until a later run works again.
"""
import hashlib
import json
import os
import platform
import shutil
import ssl
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from logging import getLogger

logger = getLogger("AUDIO_LOADER")

CHECK_EVERY_S = 24 * 60 * 60
# The previous version is only offered for clean-up once the current one has worked this long
KEEP_PREVIOUS_S = 7 * 24 * 60 * 60
USER_AGENT = "AudioLoaderEncore"
API = "https://api.github.com/repos/{}/releases/latest"


class NotSetUp(Exception):
    pass


def Log(text):
    logger.info("Audio Loader - Downloader: {}".format(text))


def _arch():
    machine = platform.machine().lower()
    return "aarch64" if machine in ("aarch64", "arm64") else "x86_64"


# What each tool is, where it comes from, and how its files are named
def tool_specs():
    arch = _arch()
    ytdlp_asset = "yt-dlp_linux_aarch64" if arch == "aarch64" else "yt-dlp_linux"
    return {
        "yt-dlp": {
            "channels": {"stable": "yt-dlp/yt-dlp", "nightly": "yt-dlp/yt-dlp-nightly-builds"},
            "asset": ytdlp_asset,
            "sums": "SHA2-256SUMS",
            "zip": False,
            "version_args": ["--version"],
        },
        "deno": {
            "channels": {"stable": "denoland/deno"},
            "asset": "deno-{}-unknown-linux-gnu.zip".format(arch),
            "sums": "deno-{}-unknown-linux-gnu.zip.sha256sum".format(arch),
            "zip": True,
            "version_args": ["--version"],
        },
    }


# ---------------------------------------------------------------- network (replaceable in tests)

def _ssl_context():
    # Decky's own Python may not know the system certificates, so point it at them when they exist
    for cafile in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ca-certificates/extracted/tls-ca-bundle.pem"):
        if os.path.isfile(cafile):
            return ssl.create_default_context(cafile=cafile)
    return ssl.create_default_context()


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        return resp.read()


def http_download(url, path, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp, open(path, "wb") as out:
        shutil.copyfileobj(resp, out, 1024 * 1024)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_redirect_target(url, timeout=30):
    """Where a URL redirects to, without following it (None when it does not redirect)."""
    opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=_ssl_context()))
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="HEAD")
    try:
        with opener.open(req, timeout=timeout) as resp:
            return None
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            return e.headers.get("Location")
        raise


def _official(url, repo):
    # Release files of the project itself, and nothing else
    return url.startswith("https://github.com/{}/releases/download/".format(repo))


# ---------------------------------------------------------------- the manager

class Tools:
    def __init__(self, folder, get=None, download=None, run=None, now=None, redirect=None):
        self.folder = folder
        self.bin = os.path.join(folder, "bin")
        self.state_path = os.path.join(folder, "tools.json")
        self.get = get or http_get
        self.download = download or http_download
        self.redirect = redirect or http_redirect_target
        self.run = run or (lambda args, timeout: subprocess.run(args, capture_output=True, text=True, timeout=timeout))
        self.now = now or time.time
        os.makedirs(self.bin, exist_ok=True)
        self.state = self._load()

    # ---- state

    def _load(self):
        try:
            with open(self.state_path, "r") as fp:
                data = json.load(fp)
            if isinstance(data, dict):
                data.setdefault("tools", {})
                data.setdefault("broken", {})
                data.setdefault("setup", False)
                return data
        except Exception:
            pass
        return {"tools": {}, "broken": {}, "setup": False}

    def _save(self):
        tmp = self.state_path + ".tmp"
        with open(tmp, "w") as fp:
            json.dump(self.state, fp)
        os.replace(tmp, self.state_path)

    def info(self, name):
        return self.state["tools"].setdefault(name, {})

    def path(self, name):
        return os.path.join(self.bin, name)

    def previous_path(self, name):
        return os.path.join(self.bin, name + ".previous")

    def installed(self, name):
        return os.path.isfile(self.path(name)) and os.access(self.path(name), os.X_OK)

    # ---- install / update

    def _release(self, repo, spec=None):
        try:
            data = json.loads(self.get(API.format(repo)).decode("utf-8"))
            assets = {a.get("name"): a.get("browser_download_url", "") for a in data.get("assets", [])}
            return str(data.get("tag_name", "")), assets
        except Exception as api_error:
            # GitHub's API allows only 60 requests an hour without an account, and some networks block
            # it. The "latest download" link of the release page also tells the newest version.
            if not spec:
                raise
            target = self.redirect("https://github.com/{}/releases/latest/download/{}".format(repo, spec["sums"]))
            marker = "https://github.com/{}/releases/download/".format(repo)
            if not target or not target.startswith(marker):
                raise api_error
            tag = target[len(marker):].split("/")[0]
            return tag, {name: marker + tag + "/" + name for name in (spec["asset"], spec["sums"])}

    def _expected_sha(self, sums_text, asset):
        for line in sums_text.splitlines():
            parts = line.strip().split()
            if len(parts) >= 2 and parts[-1].lstrip("*") == asset:
                return parts[0].lower()
            if len(parts) == 1 and len(parts[0]) == 64:  # a file with only the checksum
                return parts[0].lower()
        return None

    def _version_of(self, path, spec):
        result = self.run([path] + spec["version_args"], 30)
        if result.returncode != 0:
            raise RuntimeError("the new version does not start: {}".format((result.stderr or "").strip()[:200]))
        return (result.stdout or "").strip().splitlines()[0] if (result.stdout or "").strip() else "?"

    def install(self, name, channel="stable", force=False):
        """Downloads the newest release of a tool, checks it, tries it, and swaps it in.
        Returns "updated", "current" or raises with a readable reason."""
        spec = tool_specs()[name]
        repo = spec["channels"].get(channel) or spec["channels"]["stable"]
        tag, assets = self._release(repo, spec)
        info = self.info(name)
        if not force and self.installed(name) and info.get("tag") == tag and info.get("channel") == channel:
            info["last_check"] = self.now()
            self._save()
            return "current"
        url, sums_url = assets.get(spec["asset"]), assets.get(spec["sums"])
        if not url or not sums_url:
            raise RuntimeError("the release {} has no {} for this Deck".format(tag, spec["asset"]))
        if not _official(url, repo) or not _official(sums_url, repo):
            raise RuntimeError("refused a download that is not from {}'s own releases".format(repo))
        work = tempfile.mkdtemp(dir=self.folder)
        try:
            raw = os.path.join(work, spec["asset"])
            self.download(url, raw)
            expected = self._expected_sha(self.get(sums_url).decode("utf-8", "replace"), spec["asset"])
            actual = _sha256(raw)
            if not expected or actual != expected:
                raise RuntimeError("the checksum of {} does not match, it was not installed".format(spec["asset"]))
            new = os.path.join(work, name)
            if spec["zip"]:
                with zipfile.ZipFile(raw) as z:
                    member = next((m for m in z.namelist() if os.path.basename(m) == name), None)
                    if not member:
                        raise RuntimeError("{} is not in the download".format(name))
                    with z.open(member) as src, open(new, "wb") as dst:
                        shutil.copyfileobj(src, dst)
            else:
                os.replace(raw, new)
            os.chmod(new, os.stat(new).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            version = self._version_of(new, spec)
            # Swap: the current one becomes the previous one
            if self.installed(name):
                os.replace(self.path(name), self.previous_path(name))
                info["previous"] = {"tag": info.get("tag"), "version": info.get("version"), "channel": info.get("channel")}
            os.replace(new, self.path(name))
        finally:
            shutil.rmtree(work, ignore_errors=True)
        info.update({"tag": tag, "version": version, "channel": channel, "installed_at": self.now(), "last_check": self.now(), "sha256": actual})
        self._save()
        Log("{} {} ({}) installed".format(name, version, channel))
        return "updated"

    def is_set_up(self):
        return bool(self.state.get("setup")) and self.installed("yt-dlp")

    def setup(self):
        """Set up, pressed by the user: installs yt-dlp (Deno comes later, only for YouTube)."""
        result = self.install("yt-dlp", "stable", force=not self.installed("yt-dlp"))
        self.state["setup"] = True
        self._save()
        return result

    def remove(self):
        """Deletes every downloaded tool and switches Find Music off again."""
        freed = 0
        for name in os.listdir(self.bin):
            full = os.path.join(self.bin, name)
            freed += _size(full)
            try:
                os.remove(full)
            except OSError:
                pass
        self.state = {"tools": {}, "broken": {}, "setup": False}
        self._save()
        return freed

    def ensure(self, name, channel=None):
        """Makes sure the tool exists, and looks for a new version once a day. Never raises when an
        installed version exists (no internet: the installed one is used)."""
        if not self.state.get("setup"):
            raise NotSetUp("Find Music is not set up")
        info = self.info(name)
        channel = channel or info.get("channel") or "stable"
        if not self.installed(name):
            return self.install(name, channel)
        if self.now() - info.get("last_check", 0) < CHECK_EVERY_S:
            return "current"
        try:
            return self.install(name, channel)
        except Exception as e:
            info["last_check"] = self.now()
            self._save()
            Log("could not look for a new {}: {}".format(name, e))
            return "current"

    def undo(self, name):
        """Goes back to the version before the last update."""
        if not os.path.isfile(self.previous_path(name)):
            raise RuntimeError("there is no earlier version of {} to go back to".format(name))
        info = self.info(name)
        current = {"tag": info.get("tag"), "version": info.get("version"), "channel": info.get("channel")}
        prev = info.get("previous") or {}
        tmp = self.path(name) + ".swap"
        os.replace(self.path(name), tmp)
        os.replace(self.previous_path(name), self.path(name))
        os.replace(tmp, self.previous_path(name))
        info.update({"tag": prev.get("tag"), "version": prev.get("version"), "channel": prev.get("channel") or "stable",
                     "previous": current, "installed_at": self.now(), "last_check": self.now()})
        self._save()
        return info.get("version")

    def mark_ok(self, name, site=None):
        info = self.info(name)
        info["last_ok"] = self.now()
        if site:
            self.state["broken"].pop(site, None)
        self._save()

    def mark_broken(self, site, error):
        self.state["broken"][site] = {"since": self.state["broken"].get(site, {}).get("since", self.now()), "error": str(error)[:500],
                                      "version": self.info("yt-dlp").get("version")}
        self._save()

    def status(self):
        out = {}
        for name in tool_specs():
            info = dict(self.info(name))
            info["installed"] = self.installed(name)
            info["has_previous"] = os.path.isfile(self.previous_path(name))
            info["bytes"] = _size(self.path(name)) + _size(self.previous_path(name))
            out[name] = info
        return {"setup": self.is_set_up(), "tools": out, "broken": self.state["broken"]}

    def run_with_recovery(self, args, site, is_site_error, timeout=120):
        """Runs yt-dlp. When it fails because the site changed (is_site_error decides), tries, in order:
        a new stable version, the nightly channel, the version before. Marks the site broken when
        nothing works, and clears that mark when something does. Returns the finished process."""
        tried = []

        def attempt(label):
            result = self.run([self.path("yt-dlp")] + args, timeout)
            tried.append(label)
            return result

        self.ensure("yt-dlp")
        result = attempt("installed")
        if result.returncode == 0:
            self.mark_ok("yt-dlp", site)
            return result
        if not is_site_error(result.stderr or ""):
            return result  # a normal problem (no internet, private video...): not yt-dlp's fault
        last = result
        # The version before the installed one, saved now: the steps below replace "previous"
        fallback = self.path("yt-dlp") + ".fallback"
        fallback_info = dict(self.info("yt-dlp").get("previous") or {})
        if os.path.isfile(self.previous_path("yt-dlp")):
            shutil.copy2(self.previous_path("yt-dlp"), fallback)

        def use_fallback():
            if not os.path.isfile(fallback):
                return False
            info = self.info("yt-dlp")
            os.replace(self.path("yt-dlp"), self.previous_path("yt-dlp"))
            info["previous"] = {"tag": info.get("tag"), "version": info.get("version"), "channel": info.get("channel")}
            os.replace(fallback, self.path("yt-dlp"))
            info.update({"tag": fallback_info.get("tag"), "version": fallback_info.get("version"),
                         "channel": fallback_info.get("channel") or "stable", "installed_at": self.now()})
            self._save()
            return True

        steps = [("new stable", lambda: self.install("yt-dlp", "stable") == "updated"),
                 ("nightly", lambda: self.install("yt-dlp", "nightly") == "updated"),
                 ("version before", use_fallback)]
        try:
            for label, prepare in steps:
                try:
                    if not prepare():
                        continue
                except Exception as e:
                    Log("recovery step {} not possible: {}".format(label, e))
                    continue
                last = attempt(label)
                if last.returncode == 0:
                    Log("{} works again with {}".format(site, label))
                    self.mark_ok("yt-dlp", site)
                    return last
        finally:
            if os.path.isfile(fallback):
                os.remove(fallback)
        self.mark_broken(site, (last.stderr or "").strip()[-400:])
        Log("{} does not work with any version (tried: {})".format(site, ", ".join(tried)))
        return last


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _size(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0
