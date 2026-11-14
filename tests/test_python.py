"""Tests for the Python side: zip validation (pack installer) and saving settings (set_config).
Run with:  python3 tests/test_python.py"""
import asyncio, importlib.util, io, json, os, shutil, ssl, struct, sys, tempfile, types, unittest, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# On the Deck, Decky provides these. Here, stand-ins are enough (nothing is downloaded).
sys.modules.setdefault("aiohttp", types.ModuleType("aiohttp"))
HOME = tempfile.mkdtemp(prefix="audioloader_test_")
for name in ("DECKY_HOME", "DECKY_USER_HOME", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_SETTINGS_DIR"):
    os.environ.setdefault(name, HOME)
os.makedirs(os.path.join(os.environ["DECKY_HOME"], "sounds"), exist_ok=True)
sys.path.insert(0, ROOT)


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("audio_remoteinstall", "audio_remoteinstall.py")
main = load("al_main", "main.py")
steam_music = load("steam_music", "steam_music.py")


def make_zip(names):
    path = os.path.join(tempfile.mkdtemp(), "pack.zip")
    with zipfile.ZipFile(path, "w") as f:
        for n in names:
            f.writestr(n, "x")
    return path


class ZipValidation(unittest.TestCase):
    def test_normal_pack_is_unzipped(self):
        target = tempfile.mkdtemp()
        with zipfile.ZipFile(make_zip(["Pack/pack.json", "Pack/music/a.mp3"])) as f:
            installer.safe_extract(f, target)
        self.assertTrue(os.path.isfile(os.path.join(target, "Pack", "music", "a.mp3")))

    def test_unsafe_paths_are_refused_and_nothing_is_written(self):
        for bad in ("../evil.txt", "Pack/../../evil.txt", "/tmp/evil_abs.txt"):
            with self.subTest(path=bad):
                outer = tempfile.mkdtemp()
                target = os.path.join(outer, "packs")
                os.makedirs(target)
                with zipfile.ZipFile(make_zip(["Pack/ok.txt", bad])) as f:
                    with self.assertRaises(Exception) as ctx:
                        installer.safe_extract(f, target)
                self.assertIn("Unsafe path", str(ctx.exception))
                self.assertEqual(os.listdir(target), [])
                self.assertFalse(os.path.exists(os.path.join(outer, "evil.txt")))

    def test_downloads_check_certificates(self):
        ctx = installer.make_ssl_context()
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(ctx.check_hostname)


class SettingsMerging(unittest.TestCase):
    def setUp(self):
        self.cfg_path = os.path.join(os.environ["DECKY_HOME"], "sounds", "config.json")
        self.plugin = main.Plugin
        self.run_async = lambda coro: asyncio.run(coro)

    def read(self):
        with open(self.cfg_path) as f:
            return json.load(f)

    def test_saving_the_usual_settings_keeps_the_other_ones(self):
        with open(self.cfg_path, "w") as f:
            json.dump({**main.starter_config_data, "daily_random_music": True,
                       "daily_music_date": "2026-11-07", "daily_music_pick": "Chill", "variety_level": 70}, f)
        usual = {"selected_pack": "Default", "selected_music": "Chill", "sound_volume": 0.8,
                 "music_volume": 0.3, "legacy_enabled": True}
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, usual)))
        c = self.read()
        self.assertTrue(c["daily_random_music"])
        self.assertEqual(c["daily_music_pick"], "Chill")
        self.assertEqual(c["variety_level"], 70)
        self.assertEqual(c["sound_volume"], 0.8)

    def test_a_partial_update_changes_only_what_it_sends(self):
        with open(self.cfg_path, "w") as f:
            json.dump({**main.starter_config_data, "music_volume": 0.3, "selected_pack": "Default"}, f)
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, {"daily_music_pick": "Jazz"})))
        c = self.read()
        self.assertEqual(c["daily_music_pick"], "Jazz")
        self.assertEqual(c["music_volume"], 0.3)
        self.assertEqual(c["selected_pack"], "Default")

    def test_an_old_config_file_is_upgraded(self):
        with open(self.cfg_path, "w") as f:
            json.dump({"selected_pack": "Default", "music_volume": 0.4}, f)
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, {"smooth_fades": True})))
        c = self.read()
        self.assertTrue(c["smooth_fades"])
        self.assertEqual(c["music_volume"], 0.4)


# ---- Steam Music (steam_music.py) ----

steam_music = load("steam_music", "steam_music.py")

JPEG = b"\xff\xd8\xff\xe0fakejpeg"


def id3_frame(fid, body):
    return fid.encode() + struct.pack(">I", len(body)) + b"\x00\x00" + body


def mp3_with_tags(title=None, artist=None, album=None, track=None, cover=False):
    frames = b""
    for fid, value in (("TIT2", title), ("TPE1", artist), ("TALB", album), ("TRCK", track)):
        if value is not None:
            frames += id3_frame(fid, b"\x03" + value.encode("utf-8"))
    if cover:
        frames += id3_frame("APIC", b"\x00image/jpeg\x00\x03\x00" + JPEG)
    size = len(frames)
    syncsafe = bytes([(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127])
    return b"ID3\x03\x00\x00" + syncsafe + frames + b"\xff\xfb" + b"\x00" * 400


def flac_with_tags(comments):
    vendor = b"test"
    body = struct.pack("<I", len(vendor)) + vendor + struct.pack("<I", len(comments))
    for c in comments:
        c = c.encode("utf-8")
        body += struct.pack("<I", len(c)) + c
    streaminfo = b"\x00" * 34
    return (b"fLaC" + bytes([0]) + len(streaminfo).to_bytes(3, "big") + streaminfo
            + bytes([0x80 | 4]) + len(body).to_bytes(3, "big") + body)


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


class SteamMusic(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="steam_")
        self.steam = os.path.join(self.root, "Steam")
        self.sd = os.path.join(self.root, "sdcard")
        self.packs = os.path.join(self.root, "sounds")
        os.makedirs(self.packs)
        os.makedirs(os.path.join(self.sd, "steamapps", "music"))
        write(os.path.join(self.steam, "steamapps", "libraryfolders.vdf"),
              ('"libraryfolders"\n{\n "0" { "path" "%s" }\n "1" { "path" "%s" }\n}' % (self.steam, self.sd)).encode())
        # A tagged soundtrack in two formats on the internal drive
        ost = os.path.join(self.steam, "steamapps", "music", "Space Game OST")
        write(os.path.join(ost, "MP3", "01 - Opening.mp3"),
              mp3_with_tags("Opening", "Composer A", "Space Game Soundtrack", "1/12", cover=True))
        write(os.path.join(ost, "FLAC", "01 - Opening.flac"),
              flac_with_tags(["TITLE=Opening", "ARTIST=Composer A", "ALBUM=Space Game Soundtrack", "TRACKNUMBER=1"]))
        write(os.path.join(ost, "FLAC", "02 - Battle.flac"),
              flac_with_tags(["TITLE=Battle", "ARTIST=Composer A", "ALBUM=Space Game Soundtrack", "TRACKNUMBER=2"]))
        # A soundtrack without any tags on the SD card, with Steam's name and picture
        bare = os.path.join(self.sd, "steamapps", "music", "puzzle_ost")
        write(os.path.join(bare, "03 - Boss Fight.ogg"), b"not really ogg")
        write(os.path.join(bare, "Credits.mp3"), b"\xff\xfb" + b"\x00" * 200)
        write(os.path.join(self.sd, "steamapps", "appmanifest_999.acf"),
              b'"AppState"\n{\n "appid" "999"\n "name" "Puzzle Game Soundtrack"\n "installdir" "puzzle_ost"\n}')
        write(os.path.join(self.steam, "appcache", "librarycache", "999", "abc", "library_600x900.jpg"), JPEG)

    def scan(self):
        return steam_music.scan(self.steam, self.packs)

    def by_title(self, tracks):
        return {t["title"]: t for t in tracks}

    def test_tags_are_read(self):
        t = self.by_title(self.scan())
        self.assertEqual(t["Opening"]["artist"], "Composer A")
        self.assertEqual(t["Opening"]["album"], "Space Game Soundtrack")
        self.assertEqual(t["Opening"]["track"], 1)
        self.assertEqual(t["Battle"]["track"], 2)
        self.assertEqual(t["Opening"]["missing"], [])
        self.assertEqual(t["Opening"]["guessed"], [])

    def test_a_track_in_two_formats_is_listed_once_as_mp3(self):
        tracks = self.scan()
        openings = [x for x in tracks if x["title"] == "Opening"]
        self.assertEqual(len(openings), 1)
        self.assertTrue(openings[0]["path"].endswith(".mp3"))
        self.assertEqual(len(tracks), 4)

    def test_missing_information_is_filled_in(self):
        t = self.by_title(self.scan())
        boss = t["Boss Fight"]
        self.assertEqual(boss["track"], 3)
        self.assertEqual(boss["artist"], steam_music.PLACEHOLDER_ARTIST)
        self.assertEqual(boss["album"], "Puzzle Game Soundtrack")  # from Steam's app manifest
        self.assertEqual(set(boss["guessed"]), {"title", "album", "track"})
        self.assertEqual(boss["missing"], ["artist"])
        credits = t["Credits"]
        self.assertIsNone(credits["track"])
        self.assertIn("track", credits["missing"])

    def test_covers_embedded_and_from_steam(self):
        t = self.by_title(self.scan())
        self.assertIn("/cover.jpg", t["Opening"]["cover"])
        self.assertIn("/cover.jpg", t["Boss Fight"]["cover"])
        saved = os.path.join(self.packs, steam_music.LINK_FOLDER, t["Opening"]["albumKey"], "cover.jpg")
        with open(saved, "rb") as f:
            self.assertEqual(f.read(), JPEG)

    def test_tracks_are_linked_into_the_packs_folder(self):
        for track in self.scan():
            link = os.path.join(self.packs, steam_music.LINK_FOLDER, track["albumKey"], track["file"])
            self.assertTrue(os.path.islink(link))
            self.assertEqual(os.path.realpath(link), os.path.realpath(track["path"]))
            self.assertRegex(track["file"], r"^[0-9a-f]{12}\.[a-z0-9]+$")

    def test_a_second_scan_gives_the_same_result_and_cleans_up(self):
        first = self.scan()
        second = self.scan()
        self.assertEqual([t["file"] for t in first], [t["file"] for t in second])
        shutil.rmtree(os.path.join(self.sd, "steamapps", "music", "puzzle_ost"))
        third = self.scan()
        self.assertEqual(len(third), 2)
        folders = [n for n in os.listdir(os.path.join(self.packs, steam_music.LINK_FOLDER)) if n != "index.json"]
        self.assertEqual(len(folders), 1)

    def test_tracks_become_music_packs_with_unique_names(self):
        packs = steam_music.pack_dicts(self.scan(), self.packs, ["Space Game Soundtrack - Battle"])
        names = [p["name"] for p in packs]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn("Space Game Soundtrack - Battle (2)", names)
        p = packs[0]
        self.assertTrue(p["music"])
        self.assertTrue(p["truncatedPackPath"].startswith(steam_music.LINK_FOLDER + "/"))
        self.assertEqual(len(p["mappings"]["menu_music.mp3"]), 1)

    def test_file_names_give_number_and_title(self):
        f = steam_music.title_from_filename
        self.assertEqual(f("01 - Main Theme.mp3"), (1, "Main Theme"))
        self.assertEqual(f("12. Ending.flac"), (12, "Ending"))
        self.assertEqual(f("1-03 Disc Two Song.mp3"), (3, "Disc Two Song"))
        self.assertEqual(f("Main_Theme.ogg"), (None, "Main Theme"))
        self.assertEqual(f("1999.mp3"), (None, "1999"))

    def test_broken_files_never_raise(self):
        path = os.path.join(self.root, "broken.mp3")
        write(path, b"ID3\x04\x00\x00\x7f\x7f\x7f\x7f" + b"\xff" * 50)
        self.assertEqual(steam_music.read_tags(path)[0], {})
        write(path.replace(".mp3", ".m4a"), b"\x00\x00\x00\x10moovjunkjunk")
        self.assertEqual(steam_music.read_tags(path.replace(".mp3", ".m4a"))[0], {})

    def test_no_steam_folder_gives_no_tracks(self):
        self.assertEqual(steam_music.scan(os.path.join(self.root, "nothing"), self.packs), [])


class SteamMusicScan(unittest.TestCase):
    def make_library(self):
        steam = tempfile.mkdtemp()
        album = os.path.join(steam, "steamapps", "music", "Game OST", "Disc 1")
        os.makedirs(album)
        with open(os.path.join(album, "03 - Boss Fight.mp3"), "wb") as f:
            f.write(b"\xff\xfb\x90\x00" * 500)
        with open(os.path.join(album, "03 - Boss Fight.flac"), "wb") as f:
            f.write(b"fLaC" + b"\0" * 100)
        with open(os.path.join(steam, "steamapps", "appmanifest_5.acf"), "w") as f:
            f.write('"AppState" { "appid" "5" "name" "Game Soundtrack" "installdir" "Game OST" }')
        return steam

    def test_tracks_are_found_filled_in_and_listed_once(self):
        steam, packs = self.make_library(), tempfile.mkdtemp()
        tracks = steam_music.scan(steam, packs)
        self.assertEqual(len(tracks), 1, "the same track in MP3 and FLAC is listed once")
        t = tracks[0]
        self.assertEqual((t["title"], t["track"], t["album"]), ("Boss Fight", 3, "Game Soundtrack"))
        self.assertEqual(t["artist"], "Unknown Artist")
        self.assertTrue(t["file"].endswith(".mp3"), "the smaller MP3 is preferred")

    def test_links_stay_inside_the_packs_folder_and_nothing_in_steam_changes(self):
        steam, packs = self.make_library(), tempfile.mkdtemp()
        before = sorted(os.listdir(os.path.join(steam, "steamapps", "music", "Game OST", "Disc 1")))
        steam_music.scan(steam, packs)
        base = os.path.realpath(os.path.join(packs, steam_music.LINK_FOLDER))
        for root, _dirs, files in os.walk(base):
            self.assertTrue(os.path.realpath(root).startswith(base))
        after = sorted(os.listdir(os.path.join(steam, "steamapps", "music", "Game OST", "Disc 1")))
        self.assertEqual(before, after)

    def test_a_second_scan_gives_the_same_result(self):
        steam, packs = self.make_library(), tempfile.mkdtemp()
        first = steam_music.scan(steam, packs)
        second = steam_music.scan(steam, packs)
        self.assertEqual([t["file"] for t in first], [t["file"] for t in second])

    def test_a_removed_soundtrack_leaves_no_tracks_and_no_empty_folder(self):
        import shutil
        steam, packs = self.make_library(), tempfile.mkdtemp()
        steam_music.scan(steam, packs)
        shutil.rmtree(os.path.join(steam, "steamapps", "music", "Game OST"))
        os.makedirs(os.path.join(steam, "steamapps", "music", "Game OST"))
        self.assertEqual(steam_music.scan(steam, packs), [])
        self.assertEqual(os.listdir(os.path.join(packs, steam_music.LINK_FOLDER)), [steam_music.INDEX_FILE])

    def test_the_steam_folders_are_not_scanned_again_too_soon(self):
        due = steam_music.scan_due
        self.assertTrue(due(None, 100), "never scanned yet")
        self.assertFalse(due(100, 110), "10 s later: too soon")
        self.assertTrue(due(100, 131), "more than 30 s later")
        self.assertTrue(due(100, 105, force=True), "Scan Again always scans")
        self.assertTrue(due(100, 50), "a clock that went backwards scans again")

    def test_opening_pack_lists_repeatedly_scans_steam_only_once(self):
        calls = []
        real_scan = main.steam_music.scan
        main.steam_music.scan = lambda steam, packs: (calls.append(1) or [])
        try:
            plugin = main.Plugin
            plugin.steamScannedAt = None
            for _ in range(3):
                asyncio.run(plugin.parse_packs(plugin))
            self.assertEqual(len(calls), 1, "three quick reloads, one scan")
            asyncio.run(plugin.parse_packs(plugin, True))
            self.assertEqual(len(calls), 2, "a forced reload scans again")
        finally:
            main.steam_music.scan = real_scan

    def test_no_steam_music_folder_is_fine(self):
        steam = tempfile.mkdtemp()
        os.makedirs(os.path.join(steam, "steamapps"))
        self.assertEqual(steam_music.scan(steam, tempfile.mkdtemp()), [])



class DamagedConfig(unittest.TestCase):
    def setUp(self):
        self.path = os.path.join(tempfile.mkdtemp(), "config.json")

    def test_a_damaged_file_gives_the_defaults_and_is_kept(self):
        with open(self.path, "w") as f:
            f.write('{"music_volume": 0.3, "selec')
        data = main.read_config_file(self.path)
        self.assertEqual(data["music_volume"], main.starter_config_data["music_volume"])
        self.assertTrue(os.path.isfile(self.path + ".broken"))

    def test_writing_leaves_no_temporary_file_and_reads_back(self):
        main.write_config_file(self.path, {"a": 1})
        self.assertEqual(main.read_config_file(self.path), {"a": 1})
        self.assertFalse(os.path.exists(self.path + ".tmp"))

    def test_saving_after_damage_keeps_all_default_settings(self):
        with open(self.path, "w") as f:
            f.write("not json")
        merged = main.read_config_file(self.path)
        merged.update({"music_volume": 0.2})
        main.write_config_file(self.path, merged)
        with open(self.path) as f:
            saved = json.load(f)
        self.assertEqual(saved["music_volume"], 0.2)
        self.assertIn("selected_pack", saved)


class UpdateCheck(unittest.TestCase):
    # Decky calls plugin methods on the class, with the class as "self"
    def test_update_check_works_the_way_decky_calls_it(self):
        def fake_urlopen(req, timeout=None, context=None):
            class Resp(io.BytesIO):
                def __enter__(self): return self
                def __exit__(self, *a): return False
            return Resp(json.dumps({"tag_name": "v9.9.9", "html_url": "https://example.invalid/r"}).encode())
        old = main.urllib.request.urlopen
        main.urllib.request.urlopen = fake_urlopen
        try:
            r = asyncio.run(main.Plugin.check_for_update(main.Plugin))
        finally:
            main.urllib.request.urlopen = old
        self.assertEqual(r["error"], "")
        self.assertEqual(r["latest"], "9.9.9")
        with open(os.path.join(ROOT, "package.json")) as f:
            self.assertEqual(r["current"], json.load(f)["version"])

    def test_a_network_problem_comes_back_as_an_error_text(self):
        def broken(*a, **k):
            raise OSError("no network")
        old = main.urllib.request.urlopen
        main.urllib.request.urlopen = broken
        try:
            r = asyncio.run(main.Plugin.check_for_update(main.Plugin))
        finally:
            main.urllib.request.urlopen = old
        self.assertIn("no network", r["error"])
        self.assertNotEqual(r["current"], "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
