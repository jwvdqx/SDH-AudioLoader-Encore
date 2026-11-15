import json, tempfile, asyncio, hashlib
import ssl
import urllib.request
import shutil
import time
import os, sys
from logging import getLogger

sys.path.append(os.path.dirname(__file__))

from audio_utils import store_read as util_store_read, store_write as util_store_write, get_steam_path, get_pack_path, AUDIO_LOADER_VERSION, DECKY_HOME, DECKY_USER_HOME
from audio_remoteinstall import install
import steam_music
import downloader_tools
import storage
import find_music

starter_config_data = {
  "selected_pack": "Default",
  "selected_music": "None",
  "sound_volume": 1,
  "music_volume": 0.5,
  "legacy_enabled": False,
  "daily_random_music": False,
  "daily_music_date": "",
  "daily_music_pick": "",
  "random_music_every_replay": False,
  "pure_random_music": False,
  "wait_for_startup_movie": False,
  "normalize_volume": False,
  "show_now_playing": False,
  "low_pass_steam_menu": False,
  "low_pass_quick_access": False,
  "low_pass_game_loading": False,
  "low_pass_popups": False,
  "low_pass_volume": False,
  "low_pass_microphone": False,
  "low_pass_strength": 50,
  "loudness_cache": {},
  "recent_music": []
}
starter_config_string = json.dumps(starter_config_data)

logger = getLogger("AUDIO_LOADER")

def Log(text : str):
    logger.info(text)

async def create_symlink(src : str, dst : str):
    if os.path.exists(dst):
        Log("Audio Loader - {} symlink already exists".format(dst))
        return
    os.symlink(src, dst, True)
    Log("Audio Loader - Symlink created".format(dst))

async def create_folder(path):
    if os.path.exists(path):
        Log("Audio Loader - {} folder already exists".format(path))
        return
    os.mkdir(path)
    Log("Audio Loader - {} folder created".format(path))

async def create_config(path):
    if os.path.exists(path):
        Log("Audio Loader - Config file already exists at {}".format(path))
        return
    with open(path, 'w') as fp:
        fp.write(starter_config_string)

def read_plugin_version() -> str:
    # The version written in package.json next to this file
    try:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "package.json")
        with open(path, "r") as fp:
            return str(json.load(fp).get("version", ""))
    except Exception as e:
        Log("Audio Loader - Could not read the plugin version: {}".format(e))
        return ""

def tools_folder() -> str:
    # Decky's data folder for this plugin: a new Encore version does not replace it
    folder = os.environ.get("DECKY_PLUGIN_RUNTIME_DIR") or os.path.join(DECKY_HOME, "data", "Audio Loader Encore")
    os.makedirs(folder, exist_ok=True)
    return folder

_tools = None

def get_tools():
    global _tools
    if _tools is None:
        _tools = downloader_tools.Tools(tools_folder())
    return _tools

_downloads = None

def get_downloads():
    global _downloads
    if _downloads is None:
        _downloads = find_music.Downloads(get_tools(), get_pack_path())
    return _downloads

def log_folder():
    return os.environ.get("DECKY_PLUGIN_LOG_DIR") or ""

def read_config_file(path: str) -> dict:
    # A damaged file (cut off by a power loss, for example) is kept as config.json.broken and the
    # defaults are used, so the plugin still starts and the next save does not lose everything else
    try:
        with open(path, "r") as fp:
            data = json.load(fp)
        if isinstance(data, dict):
            return data
        raise ValueError("not a settings object")
    except FileNotFoundError:
        return dict(starter_config_data)
    except Exception as e:
        Log("Audio Loader - The config file is damaged ({}), starting from the defaults. A copy is kept as config.json.broken".format(e))
        try:
            shutil.copyfile(path, path + ".broken")
        except Exception:
            pass
        return dict(starter_config_data)

def write_config_file(path: str, data: dict):
    # Written to a temporary file first, then swapped in: a power loss never leaves a half-written file
    tmp = path + ".tmp"
    with open(tmp, "w") as fp:
        fp.write(json.dumps(data))
        fp.flush()
        os.fsync(fp.fileno())
    os.replace(tmp, path)

class Result:
    def __init__(self, success : bool, message : str = "Success"):
        self.success = success
        self.message = message

        if not self.success:
            Log(f"Result failed! {message}")
    
    def raise_on_failure(self):
        if not self.success:
            raise Exception(self.message)

    def to_dict(self):
        return {"success": self.success, "message": self.message}

class Pack:
    def __init__(self, packPath : str, json : dict, truncatedPackPath: str):
        self.name = json["name"]
        self.description = json["description"] if ("description" in json) else ""
        self.version = json["version"] if ("version" in json) else "v1.0"
        self.author = json["author"] if ("author" in json) else "Unknown"
        self.require = int(json["manifest_version"]) if ("manifest_version" in json) else 1
        self.ignore = json["ignore"] if ("ignore" in json) else []
        self.mappings = json["mappings"] if ("mappings" in json) else {}
        self.music = bool(json["music"]) if ("music" in json) else False
        self.id = json["id"] if ("id" in json) else self.name
        # Packs made by Find Music: where the song came from (site, id, link, cover)
        source = json.get("encore_source")
        self.source = source if isinstance(source, dict) else None
        

        if (AUDIO_LOADER_VERSION < self.require):
            raise Exception("Audio Loader - {} requires Audio Loader version {} but only version {} is installed".format(self.name, self.require, AUDIO_LOADER_VERSION))
        
        self.packPath = packPath
        self.truncatedPackPath = truncatedPackPath

        self.has_intro = False
        if (self.music == True):
            self.has_intro = "intro_music.mp3" in self.mappings or os.path.exists(os.path.join(packPath, "intro_music.mp3"))

    async def delete(self) -> Result:
        try:
            shutil.rmtree(self.packPath)
        except Exception as e:
            return Result(False, str(e))

        return Result(True)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "ignore": self.ignore,
            "mappings": self.mappings,
            "music": self.music,
            "hasIntro": self.has_intro,
            "packPath": self.packPath,
            "truncatedPackPath": self.truncatedPackPath,
            "id": self.id,
            "source": self.source
        }

class Plugin:
    async def dummy_function(self) -> bool:
        return True

    async def get_loader_version(self) -> int:
        return AUDIO_LOADER_VERSION

    async def get_plugin_version(self) -> str:
        return read_plugin_version()

    async def check_for_update(self) -> dict:
        # Asks GitHub for the newest Encore release. Never raises: problems come back as "error".
        # (Decky calls these methods on the class itself, so "self.other_method()" would fail here)
        current = read_plugin_version()
        url = "https://api.github.com/repos/jwvdqx/SDH-AudioLoader-Encore/releases/latest"

        def fetch():
            req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "AudioLoaderEncore"})
            # Decky's own Python may not know the system certificates, so point it at them when they exist
            ctx = ssl.create_default_context()
            for cafile in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ca-certificates/extracted/tls-ca-bundle.pem"):
                if os.path.isfile(cafile):
                    ctx = ssl.create_default_context(cafile=cafile)
                    break
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                return json.loads(resp.read().decode("utf-8"))

        try:
            data = await asyncio.get_event_loop().run_in_executor(None, fetch)
            latest = str(data.get("tag_name", "")).lstrip("vV")
            return {"current": current, "latest": latest, "url": data.get("html_url", ""), "error": ""}
        except Exception as e:
            Log("Audio Loader - Update check failed: {}".format(e))
            return {"current": current, "latest": "", "url": "", "error": str(e)}

    # ---- Find Music: the downloader tools (see downloader_tools.py). Nothing runs before Set up.

    async def tools_status(self) -> dict:
        try:
            return get_tools().status()
        except Exception as e:
            return {"setup": False, "tools": {}, "broken": {}, "error": str(e)}

    async def tools_action(self, action: str, name: str = "yt-dlp") -> dict:
        # action: "setup", "update", "undo", "remove". Slow work runs outside the event loop.
        tools = get_tools()
        jobs = {
            "setup": lambda: tools.setup(),
            "update": lambda: tools.install(name, tools.info(name).get("channel") or "stable"),
            "undo": lambda: tools.undo(name),
            "remove": lambda: tools.remove(),
        }
        if action not in jobs:
            return {"ok": False, "error": "unknown action"}
        try:
            result = await asyncio.get_event_loop().run_in_executor(None, jobs[action])
            return {"ok": True, "result": result, "status": tools.status()}
        except Exception as e:
            Log("Audio Loader - Downloader {} failed: {}".format(action, e))
            return {"ok": False, "error": str(e), "status": tools.status()}

    # ---- Find Music: search and download (see find_music.py)

    async def find_music_search(self, site: str, query: str, page: int = 1) -> dict:
        tools = get_tools()
        if not tools.is_set_up():
            return {"results": [], "page": page, "last_page": True, "error": "not set up"}
        def work():
            return find_music.search(tools, site, query, page, get_pack_path())
        try:
            return await asyncio.get_event_loop().run_in_executor(None, work)
        except Exception as e:
            Log("Audio Loader - Find Music search failed: {}".format(e))
            return {"results": [], "page": page, "last_page": True, "error": str(e)}

    async def find_music_download(self, site: str, track_id: str, url: str, details: dict) -> dict:
        if not get_tools().is_set_up():
            return {"ok": False, "error": "Find Music is not set up."}
        try:
            return get_downloads().start(site, str(track_id), url, dict(details or {}))
        except Exception as e:
            return {"ok": False, "error": str(e)}

    async def find_music_job(self) -> dict:
        return {"job": get_downloads().status()}

    async def find_music_control(self, action: str) -> dict:
        # "pause", "resume" (a game started or ended), "cancel", "clear" (forget a finished job)
        d = get_downloads()
        if action == "pause":
            d.pause(True)
        elif action == "resume":
            d.pause(False)
        elif action == "cancel":
            d.cancel()
        elif action == "clear":
            d.clear()
        return {"job": d.status()}

    # ---- Continuous Playback: where the music was (a small file of its own, written often)

    async def save_position(self, data: dict) -> bool:
        try:
            if not isinstance(data, dict):
                return False
            clean = {
                "music": str(data.get("music", ""))[:300],
                "file": os.path.basename(str(data.get("file", "")))[:300],
                "time": max(0.0, float(data.get("time", 0) or 0)),
                "at": float(data.get("at", 0) or 0),
            }
            write_config_file(os.path.join(get_pack_path(), "playback_position.json"), clean)
            return True
        except Exception as e:
            Log("Audio Loader - Could not save the playback position: {}".format(e))
            return False

    async def load_position(self) -> dict:
        path = os.path.join(get_pack_path(), "playback_position.json")
        try:
            with open(path, "r") as fp:
                data = json.load(fp)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    # ---- Storage (see storage.py)

    async def storage_usage(self) -> dict:
        def work():
            return storage.usage(get_pack_path(), get_tools(), log_folder(), steam_music.LINK_FOLDER)
        return await asyncio.get_event_loop().run_in_executor(None, work)

    async def storage_cleanup_plan(self) -> list:
        config = read_config_file(os.path.join(get_pack_path(), "config.json"))
        return storage.cleanup_plan(get_pack_path(), get_tools(), log_folder(), config)

    async def storage_cleanup(self, ids: list) -> dict:
        path = os.path.join(get_pack_path(), "config.json")
        config = read_config_file(path)
        freed, done = storage.run_cleanup(list(ids or []), get_pack_path(), get_tools(), log_folder(), config,
                                          lambda c: write_config_file(path, c))
        Log("Audio Loader - Clean-up freed {} bytes ({} items)".format(freed, len(done)))
        return {"freed": freed, "done": done}

    async def log_message(self, message: str) -> bool:
        # Lets the screen side write into the Decky log, to help find problems
        Log("Audio Loader (screen) - {}".format(message))
        return True

    async def list_pack_files(self, pack_path: str) -> dict:
        # Lists the audio files of one pack (name -> size in bytes). The screen side uses it
        # for "Normalize Volume".
        try:
            base = os.path.realpath(get_pack_path())
            folder = os.path.realpath(os.path.join(base, pack_path))
            if not folder.startswith(base + os.sep):
                return {}
            files = {}
            for name in sorted(os.listdir(folder)):
                full = os.path.join(folder, name)
                if os.path.isfile(full) and name.lower().endswith((".mp3", ".ogg", ".wav", ".flac", ".m4a", ".opus")):
                    files[name] = os.path.getsize(full)
            return files
        except Exception as e:
            Log("Audio Loader - Could not list the files of {}: {}".format(pack_path, e))
            return {}

    async def get_sound_packs(self) -> list:
        # The installed packs, then the tracks of the Steam soundtracks (see steam_music.py)
        return [x.to_dict() for x in self.soundPacks] + list(getattr(self, "steamPacks", []))

    async def get_sound_packs_if_changed(self, known: str = "") -> dict:
        # The same list as get_sound_packs, but only sent when it changed since the version the screen
        # already has ("known"). With hundreds of Steam tracks the list is several hundred KB, and it is
        # asked for every time a pack list is opened.
        packs = [x.to_dict() for x in self.soundPacks] + list(getattr(self, "steamPacks", []))
        version = hashlib.sha1(json.dumps(packs, sort_keys=True).encode("utf-8")).hexdigest()
        if version == known:
            return {"version": version, "packs": None}
        return {"version": version, "packs": packs}

    async def download_theme_from_url(self, id : str, url : str) -> dict:
        return (await install(id, url)).to_dict()

    async def get_config(self) -> object:
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Fetching config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            data = read_config_file(configPath)
            self.config = data
            return data

    async def set_config(self, configObj: object):
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Setting config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            # Merge into the saved config so settings the caller did not send
            # (like the daily music settings) are never lost
            merged = read_config_file(configPath)
            merged.update(configObj)
            self.config = merged
            write_config_file(configPath, merged)
            return True

    # async def download_pack(self, uuid: str) -> dict:
    #     return (await self.remote.install(uuid)).to_dict()

    async def delete_pack(self, name: str) -> Result:
        pack = None

        for x in self.soundPacks:
            if x.name == name:
                pack = x
                break
        
        if (pack == None):
            return Result(False, f"Could not find {name}").to_dict()
        
        result = await pack.delete()
        if not result.success:
            return result.to_dict()
        
        self.soundPacks.remove(pack)
        return Result(True).to_dict()

    async def parse_packs(self, force_steam: bool = False):
        packsDir = get_pack_path()
        self.soundPacks = []
        possiblePacks = [str(p) for p in os.listdir(packsDir)]

        for p in possiblePacks:
            if not os.path.isdir(os.path.join(packsDir, p)):
                continue

            packPath = os.path.join(packsDir, p)
            packDataPath = os.path.join(packPath, "pack.json")

            if not os.path.exists(packDataPath):
                continue

            Log("Audio Loader - Analyzing sound pack {}".format(p))

            try:
                with open(packDataPath, "r") as f:
                    pack = json.load(f)
                
                packData = Pack(packPath, pack, p)

                if (packData.name not in [p.name for p in self.soundPacks]):
                    self.soundPacks.append(packData)
                    Log("Audio Loader - Sound pack {} added".format(packData.name))
            except Exception as e:
                Log("Audio Loader - Error parsing sound pack: {}".format(e))

        # Steam Music: every track of the soundtracks you own becomes a music pack. Looking through the
        # Steam folders (an SD card can be slow) is done at most every 30 seconds, because this method
        # runs every time a pack list is opened; "Scan Again" forces it.
        try:
            now = time.monotonic()
            if steam_music.scan_due(getattr(self, "steamScannedAt", None), now, force_steam):
                self.steamTracks = await asyncio.get_event_loop().run_in_executor(None, steam_music.scan, get_steam_path(), packsDir)
                self.steamScannedAt = time.monotonic()
                Log("Audio Loader - Steam Music: {} tracks found".format(len(self.steamTracks)))
            self.steamPacks = steam_music.pack_dicts(getattr(self, "steamTracks", []), packsDir, [p.name for p in self.soundPacks])
        except Exception as e:
            self.steamTracks = []
            self.steamPacks = []
            self.steamScannedAt = None
            Log("Audio Loader - Steam Music: could not look for soundtracks: {}".format(e))

    async def store_read(self, key : str) -> str:
        return util_store_read(key)
    
    async def store_write(self, key : str, val : str) -> dict:
        util_store_write(key, val)
        return Result(True).to_dict()

    async def _load(self):
        packsPath = get_pack_path()
        
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Finding sound packs...")
        self.soundPacks = []

        if (not os.path.exists(packsPath)):
            await create_folder(packsPath)

        if (not os.path.exists(os.path.join(get_steam_path(), 'steamui', 'sounds_custom'))):
            await create_symlink(get_pack_path(), os.path.join(get_steam_path(), 'steamui', 'sounds_custom'))

        if (not os.path.exists(configPath)):
            await create_config(configPath)

        await self.parse_packs(self)
        await self.get_config(self)

        
        Log("Audio Loader - Config existing is {}".format(os.path.exists(configPath)))


    async def _main(self):
        self.soundPacks = []
        self.steamPacks = []
        self.steamTracks = []
        self.steamScannedAt = None
        self.config = {
            "selected_pack": "Default", 
            "selected_music": "None",
            "sound_volume": 1,
            "music_volume": 0.5,
            "legacy_enabled": False,
            "daily_random_music": False,
            "daily_music_date": "",
            "daily_music_pick": "",
            "random_music_every_replay": False,
            "pure_random_music": False,
            "wait_for_startup_movie": False,
            "normalize_volume": False,
            "show_now_playing": False,
            "low_pass_steam_menu": False,
            "low_pass_quick_access": False,
            "low_pass_game_loading": False,
            "low_pass_popups": False,
            "low_pass_volume": False,
            "low_pass_microphone": False,
            "low_pass_strength": 50,
            "loudness_cache": {},
            "recent_music": []
        }

        Log("Initializing Audio Loader...")
        await self._load(self)
        Log("Audio Loader initialized.")
        Log(str(self.soundPacks))
