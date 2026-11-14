"""Find Music: search a site with yt-dlp, fill in the pack details, and download a song as a music pack.

- Search: 10 results per page, at most 10 pages. Each page is one yt-dlp run that resolves its tracks,
  so every result has its title, artist, length and picture.
- Auto-fill: a pack name without "(Official Video)", "[HD]", "Lyrics" and the like, the artist from the
  track's own data (or "Artist - Title" in the title, or the uploader), the album, the source link and
  the picture.
- Duplicates: every downloaded pack remembers its site and track id ("encore_source" in pack.json). The
  same track is recognised however its link was written; two different uploads are two different tracks.
- Download: runs in the background with progress. It can be paused (during a game) and continues where
  it stopped (yt-dlp keeps the unfinished file and resumes it).
The audio is kept as the site sends it (no conversion): the Steam screen plays m4a, mp3, ogg and opus.
"""
import json
import os
import re
import shutil
import signal
import subprocess
import threading
import time
import urllib.request

PAGE_SIZE = 10
MAX_PAGES = 10
SEARCH_PREFIX = {"soundcloud": "scsearch", "youtube": "ytsearch"}
SITE_NAMES = {"soundcloud": "SoundCloud", "youtube": "YouTube"}
# Results longer than this are marked (hour-long mixes make huge packs)
LONG_SECONDS = 15 * 60

# Errors that mean the site changed and yt-dlp needs a fix (not: no internet, a private track...)
SITE_ERROR_MARKERS = (
    "Unable to extract",
    "Unable to download JSON metadata",
    "unable to extract client id",
    "Unable to download API page",
    "HTTP Error 401",
    "HTTP Error 403: Forbidden",
    "Failed to parse JSON",
    "Signature extraction failed",
    "nsig extraction failed",
    "Requested format is not available",
)
NETWORK_MARKERS = ("Unable to connect to proxy", "Name or service not known", "Temporary failure in name resolution",
                   "Network is unreachable", "timed out", "Connection refused")


# YouTube sometimes asks to sign in "to confirm you're not a bot". That is a temporary block of the
# network (too many requests), not a broken yt-dlp: no update helps, only waiting (or another "client").
BOT_MARKERS = ("confirm you\u2019re not a bot", "confirm you're not a bot", "Sign in to confirm", "not a bot")


def is_bot_check(stderr):
    return any(m.lower() in (stderr or "").lower() for m in BOT_MARKERS)


# The ways yt-dlp can talk to YouTube (it can pretend to be different YouTube apps). Usually only one or
# two break at a time; the one that worked last is tried first.
YOUTUBE_CLIENTS = ("default", "tv", "web_safari", "mweb")


def site_args(tools, site, client=None):
    """Extra yt-dlp options a site needs: for YouTube, Deno (its challenge scripts need a JavaScript
    runtime) and the YouTube client to use."""
    if site != "youtube":
        return []
    args = []
    if tools.installed("deno"):
        args += ["--js-runtimes", "deno:" + tools.path("deno")]
    client = client or tools.pref("youtube_client", "default")
    if client and client != "default":
        args += ["--extractor-args", "youtube:player_client=" + client]
    return args


_YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def youtube_id(url):
    """The video id of any YouTube link (watch?v=, youtu.be/, shorts/, embed/, music.youtube.com, &t=...)."""
    url = (url or "").strip()
    if _YT_ID.match(url):
        return url
    m = re.search(r"(?:v=|youtu\.be/|/shorts/|/embed/|/live/|/v/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else ""


def is_site_error(stderr):
    if any(m in stderr for m in NETWORK_MARKERS) or is_bot_check(stderr):
        return False
    return any(m.lower() in stderr.lower() for m in SITE_ERROR_MARKERS)


# ---------------------------------------------------------------- auto-fill

_NOISE = re.compile(
    r"\s*[\(\[\{]\s*(official\s*(music\s*)?(video|audio|visualizer|lyric\s*video)|lyrics?(\s*video)?|audio|"
    r"hd|hq|4k|1080p|720p|full\s*(song|version)|free\s*download|out\s*now|explicit|clean|visualizer)\s*[\)\]\}]",
    re.IGNORECASE,
)
_TRAILING = re.compile(r"\s*[|•]\s*(official.*|lyrics?.*|free download.*)$", re.IGNORECASE)


def clean_title(title):
    t = _NOISE.sub("", title or "")
    t = _TRAILING.sub("", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" -|•")
    return t or (title or "").strip()


def fill(info, site):
    """The pack details Encore suggests for a track."""
    raw_title = info.get("track") or info.get("title") or ""
    title = clean_title(raw_title)
    artist = info.get("artist") or info.get("creator") or ""
    # "Artist - Title" in the title, when the site gives no artist
    if not artist and " - " in title:
        left, right = title.split(" - ", 1)
        if left.strip() and right.strip():
            artist, title = left.strip(), right.strip()
    elif artist and title.lower().startswith(artist.lower() + " - "):
        title = title[len(artist) + 3:].strip()
    if not artist:
        artist = info.get("uploader") or info.get("channel") or ""
    album = info.get("album") or ""
    url = info.get("webpage_url") or info.get("original_url") or info.get("url") or ""
    description = " · ".join(p for p in (album, "From {}: {}".format(SITE_NAMES.get(site, site), url) if url else "") if p)
    return {
        "name": "{} - {}".format(artist, title) if artist and title else (title or artist or "Untitled"),
        "artist": artist,
        "description": description,
        "cover": best_thumbnail(info),
    }


def best_thumbnail(info):
    thumbs = [t for t in (info.get("thumbnails") or []) if isinstance(t, dict) and str(t.get("url", "")).startswith("https://")]
    if thumbs:
        def size(t):
            w, h = t.get("width") or 0, t.get("height") or 0
            # Square-ish pictures of a few hundred pixels are best for a card
            return (min(w, h) if w and h else 0, -abs((w or 500) - 500))
        best = max(thumbs, key=size)
        return best["url"]
    t = info.get("thumbnail") or ""
    return t if t.startswith("https://") else ""


def preview_only(info):
    """SoundCloud Go+ tracks only give a 30 second preview to everyone else."""
    formats = info.get("formats") or []
    if formats and all("preview" in str(f.get("format_id", "")).lower() or "preview" in str(f.get("url", "")).lower() for f in formats):
        return True
    return str(info.get("policy", "")).upper() == "SNIP"


# ---------------------------------------------------------------- installed tracks

def source_key(site, track_id):
    return "{}:{}".format(site, track_id)


def installed_sources(packs_dir):
    """site:id -> pack folder name, for every pack Find Music made."""
    found = {}
    try:
        names = os.listdir(packs_dir)
    except OSError:
        return found
    for name in names:
        try:
            with open(os.path.join(packs_dir, name, "pack.json"), "r") as fp:
                src = json.load(fp).get("encore_source")
            if isinstance(src, dict) and src.get("site") and src.get("id"):
                found[source_key(src["site"], src["id"])] = name
        except Exception:
            continue
    return found


# ---------------------------------------------------------------- search

def search(tools, site, query, page, packs_dir, timeout=120):
    """One page of results: {"results": [...], "page", "last_page": bool, "error"?: text}."""
    if site not in SEARCH_PREFIX:
        return {"results": [], "page": page, "last_page": True, "error": "unknown site"}
    query = (query or "").strip()
    page = max(1, min(MAX_PAGES, int(page or 1)))
    if not query:
        return {"results": [], "page": page, "last_page": True}
    first = (page - 1) * PAGE_SIZE + 1
    last = page * PAGE_SIZE
    # YouTube's search list already has everything a card needs (and needs no JavaScript runtime);
    # SoundCloud's tracks are looked up one by one to get their details
    flat = ["--flat-playlist"] if site == "youtube" else []
    args = flat + ["--dump-json", "--skip-download", "--ignore-errors", "--no-warnings",
                   "--playlist-items", "{}-{}".format(first, last)] + site_args(tools, site) + [
                   "{}{}:{}".format(SEARCH_PREFIX[site], MAX_PAGES * PAGE_SIZE, query)]
    result = tools.run_with_recovery(args, site, is_site_error, timeout=timeout)
    if result.returncode != 0 and is_bot_check(result.stderr or ""):
        tools.mark_blocked(site, (result.stderr or "").strip()[-300:])
    installed = installed_sources(packs_dir)
    results = []
    for line in (result.stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            info = json.loads(line)
        except ValueError:
            continue
        track_id = str(info.get("id") or "")
        if site == "youtube":
            track_id = youtube_id(track_id) or youtube_id(info.get("url", ""))
        if not track_id:
            continue
        if site == "youtube" and not info.get("webpage_url"):
            info["webpage_url"] = "https://www.youtube.com/watch?v=" + track_id
        duration = info.get("duration") or 0
        results.append({
            "site": site,
            "id": track_id,
            "url": info.get("webpage_url") or info.get("original_url") or "",
            "title": info.get("title") or "",
            "views": info.get("view_count") or 0,
            "uploader": info.get("uploader") or info.get("channel") or "",
            "duration": duration,
            "thumbnail": best_thumbnail(info),
            "long": bool(duration and duration > LONG_SECONDS),
            "preview_only": preview_only(info),
            "installed": installed.get(source_key(site, track_id), ""),
            "fill": fill(info, site),
        })
    out = {"results": results, "page": page, "last_page": page >= MAX_PAGES or len(results) < PAGE_SIZE}
    if not results and result.returncode != 0:
        st = tools.status()
        if st.get("blocked", {}).get(site):
            out["error"] = "blocked"
        elif st["broken"].get(site):
            out["error"] = "broken"
        else:
            lines = (result.stderr or "").strip().splitlines()
            out["error"] = lines[-1][:300] if lines else "search failed"
    return out


# ---------------------------------------------------------------- the pack

def folder_name(name, packs_dir):
    base = re.sub(r"[^\w\- ]+", "", name, flags=re.UNICODE).strip().replace(" ", "_")[:60] or "Song"
    candidate, n = base, 2
    while os.path.exists(os.path.join(packs_dir, candidate)):
        candidate = "{}_{}".format(base, n)
        n += 1
    return candidate


def write_pack(folder, details, site, track_id, url, audio_file, cover_file):
    data = {
        "name": details.get("name") or "Untitled",
        "author": details.get("artist") or "Unknown",
        "description": details.get("description") or "",
        "version": "v1.0",
        "manifest_version": 2,
        "music": True,
        "mappings": {"menu_music.mp3": [audio_file]},
        "encore_source": {"site": site, "id": track_id, "url": url, "cover": cover_file or "", "added": int(time.time())},
    }
    with open(os.path.join(folder, "pack.json"), "w") as fp:
        json.dump(data, fp, indent=2, ensure_ascii=False)
    return data


def download_cover(url, path, get=None):
    if not url or not url.startswith("https://"):
        return False
    try:
        if get:
            data = get(url)
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "AudioLoaderEncore"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read(5 * 1024 * 1024 + 1)
        if not data or len(data) > 5 * 1024 * 1024:
            return False
        with open(path, "wb") as fp:
            fp.write(data)
        return True
    except Exception:
        return False


class Downloads:
    """One download at a time, in the background, with progress, pause and resume."""

    def __init__(self, tools, packs_dir, get_cover=None, on_done=None):
        self.tools = tools
        self.packs_dir = packs_dir
        self.get_cover = get_cover
        self.on_done = on_done
        self.lock = threading.Lock()
        self.job = None
        self.process = None
        self.paused = False

    def status(self):
        with self.lock:
            return dict(self.job) if self.job else None

    def _set(self, **changes):
        with self.lock:
            if self.job is not None:
                self.job.update(changes)

    def start(self, site, track_id, url, details):
        with self.lock:
            if self.job and self.job.get("state") in ("downloading", "paused", "starting", "preparing"):
                return {"ok": False, "error": "Another song is still downloading."}
        if not url.startswith("https://"):
            return {"ok": False, "error": "This result has no link."}
        existing = installed_sources(self.packs_dir).get(source_key(site, track_id))
        if existing:
            return {"ok": False, "error": "This track is already in My Packs.", "duplicate": existing}
        name = folder_name(details.get("name") or "Song", self.packs_dir)
        folder = os.path.join(self.packs_dir, name)
        os.makedirs(folder)
        with self.lock:
            self.job = {"state": "paused" if self.paused else "starting", "name": details.get("name") or name, "folder": name,
                        "site": site, "id": track_id, "url": url, "details": details, "progress": 0.0, "error": "", "started": time.time()}
        threading.Thread(target=self._work, daemon=True).start()
        return {"ok": True}

    def _work(self):
        job = self.status()
        site = job["site"]
        folder = os.path.join(self.packs_dir, job["folder"])
        base = ["-f", "bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best", "--no-playlist", "--newline", "--continue",
                "--no-warnings", "-o", os.path.join(folder, "audio.%(ext)s")]
        # YouTube needs Deno: downloaded the first time YouTube is used
        if site == "youtube":
            try:
                if not self.tools.installed("deno"):
                    self._set(state="preparing")
                self.tools.ensure("deno")
            except Exception as e:
                self._set(state="failed", error="Could not set up YouTube support (Deno): {}".format(e))
                return self._cleanup(folder)
        # YouTube "clients" to try, the one that worked last first
        clients = [None]
        if site == "youtube":
            last = self.tools.pref("youtube_client", "default")
            clients = [last] + [c for c in YOUTUBE_CLIENTS if c != last]
        client_index = 0
        bot_seen = False
        while True:
            if self.paused:
                self._set(state="paused")
                while self.paused:
                    time.sleep(0.5)
                    if self.status() and self.status().get("state") == "cancelled":
                        return self._cleanup(folder)
            self._set(state="downloading")
            client = clients[client_index]
            args = base + site_args(self.tools, site, client) + [job["url"]]
            try:
                self.tools.ensure("yt-dlp")
                # Its own process group: pause and cancel stop yt-dlp and anything it started
                proc = subprocess.Popen([self.tools.path("yt-dlp")] + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, start_new_session=True)
            except Exception as e:
                self._set(state="failed", error=str(e))
                return self._cleanup(folder)
            self.process = proc
            # A cancel or pause that came while yt-dlp was starting
            if self.paused or (self.status() or {}).get("state") == "cancelled":
                self._stop_process()
            for line in proc.stdout:
                m = re.search(r"\[download\]\s+([\d.]+)%", line)
                if m:
                    self._set(progress=min(99.0, float(m.group(1))))
            proc.wait()
            stderr = proc.stderr.read() if proc.stderr else ""
            for pipe in (proc.stdout, proc.stderr):
                if pipe:
                    pipe.close()
            self.process = None
            if self.paused:
                continue  # stopped for a game: start again later, the unfinished file is resumed
            if self.status().get("state") == "cancelled":
                return self._cleanup(folder)
            if proc.returncode != 0:
                bot = is_bot_check(stderr)
                bot_seen = bot_seen or bot
                # Another YouTube client often still works
                if (bot or is_site_error(stderr)) and client_index + 1 < len(clients):
                    client_index += 1
                    continue
                # The site may have changed: let the recovery find a working yt-dlp, then try once more
                if not bot and is_site_error(stderr) and not self.status().get("retried"):
                    self._set(retried=True)
                    check = self.tools.run_with_recovery(["--simulate", "--no-warnings"] + site_args(self.tools, site) + [job["url"]],
                                                         site, is_site_error)
                    if check.returncode == 0:
                        client_index = 0
                        continue
                    stderr = check.stderr or stderr
                if bot_seen and not is_site_error(stderr):
                    self.tools.mark_blocked(site, stderr.strip()[-300:])
                    self._set(state="failed", error="blocked", blocked=True)
                else:
                    self._set(state="failed", error=(stderr.strip().splitlines() or ["download failed"])[-1][:300])
                return self._cleanup(folder)
            if site == "youtube" and client:
                self.tools.set_pref("youtube_client", client)
            break
        audio = next((n for n in sorted(os.listdir(folder)) if n.startswith("audio.") and not n.endswith((".part", ".ytdl"))), None)
        if not audio:
            self._set(state="failed", error="the download finished without a file")
            return self._cleanup(folder)
        job = self.status()
        cover = "cover.jpg" if download_cover(job["details"].get("cover", ""), os.path.join(folder, "cover.jpg"), self.get_cover) else ""
        write_pack(folder, job["details"], job["site"], job["id"], job["url"], audio, cover)
        self.tools.mark_ok("yt-dlp", job["site"])
        self._set(state="done", progress=100.0)
        if self.on_done:
            try:
                self.on_done(job)
            except Exception:
                pass

    def _cleanup(self, folder):
        shutil.rmtree(folder, ignore_errors=True)

    def _stop_process(self):
        proc = self.process
        if proc and proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except Exception:
                try:
                    proc.terminate()
                except Exception:
                    pass

    def pause(self, on):
        self.paused = bool(on)
        if on:
            self._stop_process()
        return self.status()

    def cancel(self):
        with self.lock:
            if not self.job or self.job.get("state") not in ("downloading", "paused", "starting", "preparing"):
                return self.status()
            self.job["state"] = "cancelled"
        self._stop_process()
        return self.status()

    def clear(self):
        with self.lock:
            if self.job and self.job.get("state") in ("done", "failed", "cancelled"):
                self.job = None
