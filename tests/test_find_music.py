"""Tests for find_music.py (search, auto-fill, duplicates, downloads). No internet: yt-dlp is faked.
Run with:  python3 tests/test_find_music.py"""
import importlib.util, json, os, stat, subprocess, sys, tempfile, time, types, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("find_music", os.path.join(ROOT, "find_music.py"))
fm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fm)


def track(i, **extra):
    info = {"id": str(1000 + i), "title": "Artist %d - Song %d (Official Video) [HD]" % (i, i), "uploader": "Uploader %d" % i,
            "duration": 180, "webpage_url": "https://soundcloud.com/a/song-%d" % i,
            "thumbnails": [{"url": "https://i1.sndcdn.com/a-%d-t50x50.jpg" % i, "width": 50, "height": 50},
                           {"url": "https://i1.sndcdn.com/a-%d-t500x500.jpg" % i, "width": 500, "height": 500}],
            "formats": [{"format_id": "http_mp3_128", "url": "https://cf-media.sndcdn.com/x.mp3"}]}
    info.update(extra)
    return info


class FakeTools:
    def __init__(self, folder, results=None, rc=0, stderr="", broken=None, script=None):
        self.results, self.rc, self.stderr = results or [], rc, stderr
        self.broken = broken or {}
        self.calls = []
        self.ok = []
        self.bin = os.path.join(folder, "yt-dlp")
        if script:
            with open(self.bin, "w") as f:
                f.write(script)
            os.chmod(self.bin, os.stat(self.bin).st_mode | stat.S_IXUSR)

    def run_with_recovery(self, args, site, is_site_error, timeout=120):
        self.calls.append(args)
        out = "\n".join(json.dumps(r) for r in self.results)
        return types.SimpleNamespace(returncode=self.rc, stdout=out, stderr=self.stderr)

    def status(self):
        return {"broken": self.broken}

    def ensure(self, name):
        return "current"

    def path(self, name):
        return self.bin

    def mark_ok(self, name, site=None):
        self.ok.append(site)


class AutoFill(unittest.TestCase):
    def test_noise_is_removed_from_titles(self):
        self.assertEqual(fm.clean_title("Song (Official Music Video) [4K]"), "Song")
        self.assertEqual(fm.clean_title("Song [Lyrics] | Free Download"), "Song")
        self.assertEqual(fm.clean_title("Song (Remix)"), "Song (Remix)", "real parts of a title stay")

    def test_artist_from_the_title_when_the_site_gives_none(self):
        f = fm.fill(track(1), "soundcloud")
        self.assertEqual(f["artist"], "Artist 1")
        self.assertEqual(f["name"], "Artist 1 - Song 1")
        self.assertIn("https://soundcloud.com/a/song-1", f["description"])
        self.assertTrue(f["cover"].endswith("t500x500.jpg"), "the larger picture is chosen")

    def test_the_sites_own_artist_wins_and_is_not_repeated(self):
        f = fm.fill(track(2, title="Big Name - Hit", artist="Big Name", album="The Album"), "soundcloud")
        self.assertEqual(f["name"], "Big Name - Hit")
        self.assertTrue(f["description"].startswith("The Album"))

    def test_the_uploader_is_the_last_resort(self):
        f = fm.fill(track(3, title="Just A Title"), "soundcloud")
        self.assertEqual(f["artist"], "Uploader 3")

    def test_preview_only_tracks_are_recognised(self):
        self.assertTrue(fm.preview_only(track(4, formats=[{"format_id": "hls_mp3_128_preview"}])))
        self.assertTrue(fm.preview_only(track(4, formats=[], policy="SNIP")))
        self.assertFalse(fm.preview_only(track(4)))

    def test_site_errors_and_network_errors_are_told_apart(self):
        self.assertTrue(fm.is_site_error("ERROR: [soundcloud] 123: Unable to extract client id"))
        self.assertFalse(fm.is_site_error("ERROR: Unable to download webpage: ('Unable to connect to proxy', ...)"))
        self.assertFalse(fm.is_site_error("ERROR: This track is private"))


class Search(unittest.TestCase):
    def setUp(self):
        self.packs = tempfile.mkdtemp()
        self.dir = tempfile.mkdtemp()

    def test_a_full_page_and_the_right_items_are_asked_for(self):
        tools = FakeTools(self.dir, results=[track(i) for i in range(10)])
        r = fm.search(tools, "soundcloud", "lofi", 3, self.packs)
        self.assertEqual(len(r["results"]), 10)
        self.assertFalse(r["last_page"])
        args = tools.calls[0]
        self.assertIn("21-30", args)
        self.assertEqual(args[-1], "scsearch100:lofi")

    def test_a_short_page_is_the_last_one_and_page_10_is_the_end(self):
        r = fm.search(FakeTools(self.dir, results=[track(i) for i in range(4)]), "soundcloud", "x", 2, self.packs)
        self.assertTrue(r["last_page"])
        r = fm.search(FakeTools(self.dir, results=[track(i) for i in range(10)]), "soundcloud", "x", 10, self.packs)
        self.assertTrue(r["last_page"])

    def test_installed_tracks_are_marked_by_site_and_id(self):
        os.makedirs(os.path.join(self.packs, "Mine"))
        with open(os.path.join(self.packs, "Mine", "pack.json"), "w") as f:
            json.dump({"name": "Mine", "encore_source": {"site": "soundcloud", "id": "1002", "url": "https://soundcloud.com/x?utm=1"}}, f)
        r = fm.search(FakeTools(self.dir, results=[track(i) for i in range(5)]), "soundcloud", "x", 1, self.packs)
        marked = {x["id"]: x["installed"] for x in r["results"]}
        self.assertEqual(marked["1002"], "Mine", "same id, even though the saved link differs")
        self.assertEqual(marked["1001"], "")

    def test_a_broken_site_is_reported(self):
        tools = FakeTools(self.dir, rc=1, stderr="ERROR: Unable to extract", broken={"soundcloud": {"since": 1}})
        self.assertEqual(fm.search(tools, "soundcloud", "x", 1, self.packs)["error"], "broken")
        tools = FakeTools(self.dir, rc=1, stderr="ERROR: no network here")
        self.assertEqual(fm.search(tools, "soundcloud", "x", 1, self.packs)["error"], "ERROR: no network here")

    def test_an_empty_search_does_not_run_yt_dlp(self):
        tools = FakeTools(self.dir)
        fm.search(tools, "soundcloud", "   ", 1, self.packs)
        self.assertEqual(tools.calls, [])


# A fake yt-dlp download: 5 steps of progress (slow enough to pause), then the file
DOWNLOAD_SCRIPT = """#!/bin/sh
out=""
while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; shift; fi; shift; done
file=$(echo "$out" | sed 's/%(ext)s/m4a/')
for p in 20 40 60 80 100; do echo "[download]  $p.0% of 3.00MiB"; sleep 0.15; done
echo audio > "$file"
"""


class Download(unittest.TestCase):
    def setUp(self):
        self.packs = tempfile.mkdtemp()
        self.tools = FakeTools(tempfile.mkdtemp(), script=DOWNLOAD_SCRIPT)
        self.covers = []
        self.dl = fm.Downloads(self.tools, self.packs, get_cover=lambda url: self.covers.append(url) or b"jpgdata")
        self.details = {"name": "Artist - Song", "artist": "Artist", "description": "From SoundCloud", "cover": "https://i1.sndcdn.com/a.jpg"}

    def wait(self, states, limit=10):
        end = time.time() + limit
        while time.time() < end:
            s = self.dl.status()
            if s and s["state"] in states:
                return s
            time.sleep(0.05)
        self.fail("still %s" % self.dl.status())

    def test_a_song_becomes_a_music_pack(self):
        self.assertTrue(self.dl.start("soundcloud", "77", "https://soundcloud.com/a/b", self.details)["ok"])
        s = self.wait(("done", "failed"))
        self.assertEqual(s["state"], "done", s.get("error"))
        folder = os.path.join(self.packs, s["folder"])
        with open(os.path.join(folder, "pack.json")) as f:
            data = json.load(f)
        self.assertTrue(data["music"])
        self.assertEqual(data["mappings"]["menu_music.mp3"], ["audio.m4a"])
        self.assertEqual(data["author"], "Artist")
        self.assertEqual(data["encore_source"]["id"], "77")
        self.assertEqual(data["encore_source"]["cover"], "cover.jpg")
        self.assertTrue(os.path.isfile(os.path.join(folder, "cover.jpg")))
        # the same track again is refused
        r = self.dl.start("soundcloud", "77", "https://soundcloud.com/a/b?in=playlist", self.details)
        self.assertFalse(r["ok"])
        self.assertEqual(r["duplicate"], s["folder"])

    def test_a_download_pauses_for_a_game_and_continues_afterwards(self):
        self.dl.start("soundcloud", "78", "https://soundcloud.com/a/c", self.details)
        self.wait(("downloading",))
        time.sleep(0.2)
        self.dl.pause(True)
        s = self.wait(("paused",))
        time.sleep(0.4)
        self.assertEqual(self.dl.status()["state"], "paused", "nothing happens during the game")
        self.dl.pause(False)
        s = self.wait(("done", "failed"))
        self.assertEqual(s["state"], "done", s.get("error"))

    def test_cancel_leaves_nothing_behind(self):
        self.dl.start("soundcloud", "79", "https://soundcloud.com/a/d", self.details)
        s = self.wait(("downloading",))
        self.dl.cancel()
        time.sleep(0.6)
        self.assertEqual(self.dl.status()["state"], "cancelled")
        self.assertFalse(os.path.exists(os.path.join(self.packs, s["folder"])))

    def test_only_one_download_at_a_time(self):
        self.dl.start("soundcloud", "80", "https://soundcloud.com/a/e", self.details)
        r = self.dl.start("soundcloud", "81", "https://soundcloud.com/a/f", self.details)
        self.assertFalse(r["ok"])
        self.wait(("done", "failed"))

    def test_folder_names_are_safe_and_unique(self):
        os.makedirs(os.path.join(self.packs, "Artist_-_Song"))
        self.assertEqual(fm.folder_name("Artist - Song", self.packs), "Artist_-_Song_2")
        self.assertNotIn("/", fm.folder_name("../../etc/passwd", self.packs))


if __name__ == "__main__":
    unittest.main(verbosity=1)
