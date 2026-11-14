"""Tests for downloader_tools.py and storage.py (no internet: releases and programs are faked).
Run with:  python3 tests/test_downloader.py"""
import hashlib, importlib.util, json, os, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


dt = load("downloader_tools", "downloader_tools.py")
storage = load("storage", "storage.py")
ASSET = dt.tool_specs()["yt-dlp"]["asset"]


def program(version, ok=True, stderr="ERROR: [youtube] abc: Unable to extract player response"):
    # A fake yt-dlp: answers --version, and either works or fails like a site change
    body = "#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then echo %s; exit 0; fi\n" % version
    body += "echo done; exit 0\n" if ok else "echo '%s' >&2; exit 1\n" % stderr
    return body.encode()


class FakeGitHub:
    """Releases for the stable and nightly channels; each has a program and a checksum file."""
    def __init__(self):
        self.releases = {}
        self.gets = 0
        self.offline = False
        self.bad_sum = False
        self.foreign = False

    def publish(self, repo, tag, data):
        self.releases[repo] = (tag, data)

    def get(self, url):
        if self.offline:
            raise OSError("no network")
        self.gets += 1
        for repo, (tag, data) in self.releases.items():
            base = "https://github.com/%s/releases/download/%s/" % (repo, tag)
            if url == dt.API.format(repo):
                host = "https://evil.example/" if self.foreign else base
                return json.dumps({"tag_name": tag, "assets": [
                    {"name": ASSET, "browser_download_url": host + ASSET},
                    {"name": "SHA2-256SUMS", "browser_download_url": base + "SHA2-256SUMS"}]}).encode()
            if url == base + "SHA2-256SUMS":
                digest = "0" * 64 if self.bad_sum else hashlib.sha256(data).hexdigest()
                return ("%s  %s\n%s  other_file\n" % (digest, ASSET, "1" * 64)).encode()
        raise OSError("404 " + url)

    def download(self, url, path):
        for repo, (tag, data) in self.releases.items():
            if url.endswith("/%s/%s" % (tag, ASSET)):
                with open(path, "wb") as f:
                    f.write(data)
                return
        raise OSError("404 " + url)


class Clock:
    def __init__(self):
        self.t = 1_800_000_000.0

    def __call__(self):
        return self.t


def site_error(stderr):
    return "Unable to extract" in stderr


class ToolsTests(unittest.TestCase):
    def setUp(self):
        self.gh = FakeGitHub()
        self.clock = Clock()
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01"))
        self.tools = dt.Tools(tempfile.mkdtemp(), get=self.gh.get, download=self.gh.download, now=self.clock)

    def test_nothing_is_downloaded_before_set_up(self):
        with self.assertRaises(dt.NotSetUp):
            self.tools.ensure("yt-dlp")
        self.assertEqual(self.gh.gets, 0)
        self.assertFalse(self.tools.status()["setup"])

    def test_set_up_installs_a_checked_working_version(self):
        self.assertEqual(self.tools.setup(), "updated")
        st = self.tools.status()
        self.assertTrue(st["setup"])
        self.assertEqual(st["tools"]["yt-dlp"]["version"], "2026.11.01")
        self.assertTrue(os.access(self.tools.path("yt-dlp"), os.X_OK))

    def test_a_wrong_checksum_installs_nothing(self):
        self.gh.bad_sum = True
        with self.assertRaises(RuntimeError):
            self.tools.setup()
        self.assertFalse(self.tools.installed("yt-dlp"))

    def test_downloads_from_anywhere_but_the_official_releases_are_refused(self):
        self.gh.foreign = True
        with self.assertRaises(RuntimeError):
            self.tools.setup()
        self.assertFalse(self.tools.installed("yt-dlp"))

    def test_new_versions_are_looked_for_at_most_once_a_day(self):
        self.tools.setup()
        n = self.gh.gets
        self.clock.t += 3600
        self.assertEqual(self.tools.ensure("yt-dlp"), "current")
        self.assertEqual(self.gh.gets, n, "no request within a day")
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.20", program("2026.11.20"))
        self.clock.t += 24 * 3600
        self.assertEqual(self.tools.ensure("yt-dlp"), "updated")
        self.assertEqual(self.tools.info("yt-dlp")["version"], "2026.11.20")
        self.assertTrue(self.tools.status()["tools"]["yt-dlp"]["has_previous"])

    def test_without_internet_the_installed_version_is_used(self):
        self.tools.setup()
        self.clock.t += 2 * 24 * 3600
        self.gh.offline = True
        self.assertEqual(self.tools.ensure("yt-dlp"), "current")

    def test_undo_goes_back_to_the_version_before(self):
        self.tools.setup()
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.20", program("2026.11.20"))
        self.tools.install("yt-dlp")
        self.assertEqual(self.tools.undo("yt-dlp"), "2026.11.01")
        self.assertEqual(self.tools.undo("yt-dlp"), "2026.11.20", "undo again goes forward again")

    def test_recovery_new_stable_fixes_it(self):
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01", ok=False))
        self.tools.setup()
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.02", program("2026.11.02"))
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.tools.info("yt-dlp")["version"], "2026.11.02")
        self.assertEqual(self.tools.status()["broken"], {})

    def test_recovery_falls_back_to_nightly(self):
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01", ok=False))
        self.gh.publish("yt-dlp/yt-dlp-nightly-builds", "2026.11.03.1", program("2026.11.03.1"))
        self.tools.setup()
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.tools.info("yt-dlp")["channel"], "nightly")

    def test_recovery_falls_back_to_the_version_before(self):
        self.gh.publish("yt-dlp/yt-dlp", "2026.10.01", program("2026.10.01"))
        self.tools.setup()
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01", ok=False))
        self.tools.install("yt-dlp")  # the new one is broken; 2026.10.01 is kept as previous
        self.gh.publish("yt-dlp/yt-dlp-nightly-builds", "2026.11.03.1", program("2026.11.03.1", ok=False))
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.tools.info("yt-dlp")["version"], "2026.10.01")

    def test_when_nothing_works_the_site_is_marked_broken_and_cleared_later(self):
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01", ok=False))
        self.gh.publish("yt-dlp/yt-dlp-nightly-builds", "2026.11.03.1", program("2026.11.03.1", ok=False))
        self.tools.setup()
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertNotEqual(r.returncode, 0)
        broken = self.tools.status()["broken"]
        self.assertIn("youtube", broken)
        self.assertIn("Unable to extract", broken["youtube"]["error"])
        # a fix is published: the next run works and the warning goes away
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.05", program("2026.11.05"))
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.tools.status()["broken"], {})

    def test_a_normal_failure_is_not_blamed_on_yt_dlp(self):
        self.gh.publish("yt-dlp/yt-dlp", "2026.11.01", program("2026.11.01", ok=False, stderr="ERROR: Private video"))
        self.tools.setup()
        n = self.gh.gets
        r = self.tools.run_with_recovery(["x"], "youtube", site_error)
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(self.gh.gets, n, "no update for a private video")
        self.assertEqual(self.tools.status()["broken"], {})

    def test_when_the_api_is_blocked_the_release_page_link_is_used(self):
        real_get = self.gh.get

        def no_api(url):
            if url.startswith("https://api.github.com/"):
                raise OSError("HTTP Error 403: Forbidden")
            return real_get(url)

        def redirect(url):
            self.assertEqual(url, "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS")
            return "https://github.com/yt-dlp/yt-dlp/releases/download/2026.11.01/SHA2-256SUMS"

        tools = dt.Tools(tempfile.mkdtemp(), get=no_api, download=self.gh.download, now=self.clock, redirect=redirect)
        self.assertEqual(tools.setup(), "updated")
        self.assertEqual(tools.info("yt-dlp")["tag"], "2026.11.01")

    def test_remove_deletes_everything_and_switches_off(self):
        self.tools.setup()
        self.assertGreater(self.tools.remove(), 0)
        self.assertFalse(self.tools.status()["setup"])
        self.assertEqual(os.listdir(self.tools.bin), [])


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.packs = os.path.join(self.root, "sounds")
        self.logs = os.path.join(self.root, "logs")
        os.makedirs(self.logs)

        def pack(name, data, files):
            d = os.path.join(self.packs, name)
            os.makedirs(d)
            with open(os.path.join(d, "pack.json"), "w") as f:
                json.dump(data, f)
            for fn, size in files.items():
                with open(os.path.join(d, fn), "wb") as f:
                    f.write(b"x" * size)
        pack("Halo", {"name": "Halo", "music": True}, {"menu_music.mp3": 5000})
        pack("PS2", {"name": "PS2"}, {"a.wav": 700})
        pack("Song", {"name": "Song", "music": True, "encore_source": {"site": "soundcloud", "id": "1"}}, {"song.m4a": 3000, "song.m4a.part": 400})
        os.makedirs(os.path.join(self.packs, "steam_music_links"))
        os.symlink("/nonexistent/track.mp3", os.path.join(self.packs, "steam_music_links", "t.mp3"))
        for n in ("config.json", "config.json.broken", "config.json.tmp"):
            with open(os.path.join(self.packs, n), "w") as f:
                f.write("{}")
        for i, n in enumerate(("old.log", "current.log")):
            p = os.path.join(self.logs, n)
            with open(p, "w") as f:
                f.write("log" * 100)
            os.utime(p, (1000 + i, 1000 + i))
        self.config = {"loudness_cache": {"Halo/menu_music.mp3": {"lufs": -14}, "Gone/x.mp3": {"lufs": -10}}}

    def test_usage_is_split_by_part(self):
        u = storage.usage(self.packs, None, self.logs, "steam_music_links")
        p = u["parts"]
        self.assertGreaterEqual(p["music"], 5000)
        self.assertGreaterEqual(p["downloaded"], 3400)
        self.assertGreaterEqual(p["sounds"], 700)
        self.assertLess(p["steam_links"], 200, "links count as links, not as Steam's files")
        self.assertEqual(u["counts"], {"music": 1, "downloaded": 1, "sounds": 1})
        self.assertGreater(p["leftovers"], 0)
        self.assertGreater(u["drive"]["total"], 0)

    def test_cleanup_offers_only_safe_things(self):
        plan = storage.cleanup_plan(self.packs, None, self.logs, self.config)
        ids = [i["id"] for i in plan]
        self.assertIn("file:" + os.path.join(self.packs, "config.json.broken"), ids)
        self.assertIn("file:" + os.path.join(self.packs, "config.json.tmp"), ids)
        self.assertIn("file:" + os.path.join(self.packs, "Song", "song.m4a.part"), ids)
        self.assertIn("file:" + os.path.join(self.logs, "old.log"), ids)
        self.assertIn("loudness", ids)
        self.assertNotIn("file:" + os.path.join(self.logs, "current.log"), ids)
        for i in ids:
            self.assertFalse(i.endswith(("config.json", "pack.json", ".mp3", ".wav", "song.m4a")), i)

    def test_cleanup_deletes_only_what_is_on_the_plan(self):
        written = {}
        victim = os.path.join(self.packs, "Halo", "menu_music.mp3")
        freed, done = storage.run_cleanup(
            ["file:" + os.path.join(self.packs, "config.json.broken"), "loudness", "file:" + victim],
            self.packs, None, self.logs, self.config, lambda c: written.update(c))
        self.assertTrue(os.path.exists(victim), "a pack file is never deleted, even when asked")
        self.assertFalse(os.path.exists(os.path.join(self.packs, "config.json.broken")))
        self.assertEqual(list(written["loudness_cache"]), ["Halo/menu_music.mp3"])
        self.assertEqual(len(done), 2)
        self.assertGreater(freed, 0)


if __name__ == "__main__":
    unittest.main(verbosity=1)
