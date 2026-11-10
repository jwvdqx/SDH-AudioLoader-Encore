"""Steam Music: finds the soundtracks you own in Steam (steamapps/music on every library drive) and
turns each track into a music "pack" that can be picked as menu music.

Track information (title, artist, album, track and disc number, cover) is read from the files'
tags (MP3 ID3, FLAC, Ogg Vorbis/Opus, M4A). What is missing is filled in from the soundtrack's
Steam name, the folder and file names, or a placeholder.

The Steam screen can only load files below steamui/sounds_custom (= the packs folder), so every
found track gets a link (symlink) there, with a short safe name:
    <packs>/steam_music_links/<album key>/<track key>.<ext>  ->  the real file
    <packs>/steam_music_links/<album key>/cover.<ext>        ->  the cover (saved or linked)
Nothing in the Steam folders is ever changed.
"""
import base64
import hashlib
import json
import os
import re
import shutil
import struct
from logging import getLogger

logger = getLogger("AUDIO_LOADER")

# (no leading dot: Steam's file server might not serve hidden folders)
LINK_FOLDER = "steam_music_links"
INDEX_FILE = "index.json"
AUDIO_EXTS = (".mp3", ".ogg", ".opus", ".m4a", ".flac", ".wav")
# When a soundtrack has the same track in several formats, this one is used (smaller files first:
# they load faster, and "Normalize Music Volume" can measure them)
FORMAT_ORDER = {".mp3": 0, ".ogg": 1, ".opus": 2, ".m4a": 3, ".flac": 4, ".wav": 5}
IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp")
MAX_DEPTH = 4
# Tags bigger than this are not read (a huge embedded picture)
MAX_TAG_BYTES = 16 * 1024 * 1024

PLACEHOLDER_ARTIST = "Unknown Artist"
PLACEHOLDER_ALBUM = "Unknown Album"
PLACEHOLDER_TITLE = "Unknown Track"


def Log(text):
    logger.info("Audio Loader - Steam Music: {}".format(text))


# ---------------------------------------------------------------- tags

def _text(data, encoding):
    """Text of an ID3 frame (encoding byte already removed)."""
    try:
        if encoding == 0:
            s = data.decode("latin-1")
        elif encoding == 1:
            s = data.decode("utf-16")
        elif encoding == 2:
            s = data.decode("utf-16-be")
        else:
            s = data.decode("utf-8")
    except Exception:
        s = data.decode("latin-1", "replace")
    return s.replace("\x00", "/").strip("/ ").strip()


def _split_terminated(data, encoding):
    """Splits off a 0-terminated string (2 zero bytes for UTF-16). Returns (string bytes, rest)."""
    if encoding in (1, 2):
        i = 0
        while i + 1 < len(data):
            if data[i] == 0 and data[i + 1] == 0:
                return data[:i], data[i + 2:]
            i += 2
        return data, b""
    i = data.find(b"\x00")
    return (data, b"") if i < 0 else (data[:i], data[i + 1:])


def _unsync(data):
    return data.replace(b"\xff\x00", b"\xff")


def _syncsafe(b):
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def read_id3(f):
    """ID3v2 (2.2 / 2.3 / 2.4) at the start of the file, then ID3v1 at the end as a fallback."""
    tags, picture = {}, None
    f.seek(0)
    header = f.read(10)
    if len(header) == 10 and header[:3] == b"ID3":
        major, flags = header[3], header[5]
        size = _syncsafe(header[6:10])
        if size <= MAX_TAG_BYTES:
            data = f.read(size)
            if flags & 0x80 and major < 4:
                data = _unsync(data)
            pos = 0
            if flags & 0x40 and major >= 3:
                ext = struct.unpack(">I", data[0:4])[0] if len(data) >= 4 else 0
                pos = _syncsafe(data[0:4]) if major == 4 else ext + 4
            names = {
                "TIT2": "title", "TT2": "title", "TPE1": "artist", "TP1": "artist",
                "TPE2": "albumartist", "TP2": "albumartist", "TALB": "album", "TAL": "album",
                "TRCK": "track", "TRK": "track", "TPOS": "disc", "TPA": "disc",
            }
            while pos < len(data):
                if major == 2:
                    if pos + 6 > len(data):
                        break
                    fid = data[pos:pos + 3].decode("latin-1", "replace")
                    fsize = (data[pos + 3] << 16) | (data[pos + 4] << 8) | data[pos + 5]
                    fflags = 0
                    pos += 6
                else:
                    if pos + 10 > len(data):
                        break
                    fid = data[pos:pos + 4].decode("latin-1", "replace")
                    raw = data[pos + 4:pos + 8]
                    fsize = _syncsafe(raw) if major == 4 else struct.unpack(">I", raw)[0]
                    fflags = (data[pos + 8] << 8) | data[pos + 9]
                    pos += 10
                if not fid.strip("\x00") or fsize <= 0 or pos + fsize > len(data):
                    break
                body = data[pos:pos + fsize]
                pos += fsize
                if major == 4:
                    if fflags & 0x0002:
                        body = _unsync(body)
                    if fflags & 0x0001:  # data length indicator
                        body = body[4:]
                    if fflags & 0x000C:  # compressed or encrypted: skip
                        continue
                if not body:
                    continue
                if fid in names:
                    value = _text(body[1:], body[0])
                    if value and names[fid] not in tags:
                        tags[names[fid]] = value
                elif fid in ("APIC", "PIC") and picture is None:
                    enc = body[0]
                    if fid == "APIC":
                        mime, rest = _split_terminated(body[1:], 0)
                        mime = mime.decode("latin-1", "replace").lower()
                    else:
                        fmt = body[1:4].decode("latin-1", "replace").lower()
                        mime, rest = "image/" + ("jpeg" if fmt == "jpg" else fmt), body[4:]
                    if rest:
                        _desc, img = _split_terminated(rest[1:], enc)
                        if img:
                            picture = (mime, img)
    # ID3v1
    try:
        f.seek(-128, os.SEEK_END)
        v1 = f.read(128)
        if v1[:3] == b"TAG":
            field = lambda a, b: v1[a:b].split(b"\x00")[0].decode("latin-1", "replace").strip()
            for key, a, b in (("title", 3, 33), ("artist", 33, 63), ("album", 63, 93)):
                if key not in tags and field(a, b):
                    tags[key] = field(a, b)
            if "track" not in tags and v1[125] == 0 and v1[126] > 0:
                tags["track"] = str(v1[126])
    except OSError:
        pass
    return tags, picture


VORBIS_NAMES = {
    "TITLE": "title", "ARTIST": "artist", "ALBUMARTIST": "albumartist", "ALBUM ARTIST": "albumartist",
    "ALBUM": "album", "TRACKNUMBER": "track", "DISCNUMBER": "disc",
}


def _flac_picture(data):
    """A FLAC PICTURE block (also used base64-encoded in Ogg files)."""
    try:
        pos = 4
        mlen = struct.unpack(">I", data[pos:pos + 4])[0]
        pos += 4
        mime = data[pos:pos + mlen].decode("latin-1", "replace").lower()
        pos += mlen
        dlen = struct.unpack(">I", data[pos:pos + 4])[0]
        pos += 4 + dlen + 16
        ilen = struct.unpack(">I", data[pos:pos + 4])[0]
        pos += 4
        img = data[pos:pos + ilen]
        return (mime, img) if img else None
    except Exception:
        return None


def _vorbis_comments(data, tags):
    """Vorbis comment list (little-endian lengths). Returns a picture if one is in it."""
    picture = None
    try:
        pos = 0
        vlen = struct.unpack("<I", data[pos:pos + 4])[0]
        pos += 4 + vlen
        count = struct.unpack("<I", data[pos:pos + 4])[0]
        pos += 4
        for _ in range(min(count, 10000)):
            clen = struct.unpack("<I", data[pos:pos + 4])[0]
            pos += 4
            entry = data[pos:pos + clen].decode("utf-8", "replace")
            pos += clen
            if "=" not in entry:
                continue
            key, value = entry.split("=", 1)
            key = key.upper()
            value = value.strip()
            if key in VORBIS_NAMES and value and VORBIS_NAMES[key] not in tags:
                tags[VORBIS_NAMES[key]] = value
            elif key == "METADATA_BLOCK_PICTURE" and picture is None:
                try:
                    picture = _flac_picture(base64.b64decode(value))
                except Exception:
                    pass
    except Exception:
        pass
    return picture


def read_flac(f):
    tags, picture = {}, None
    f.seek(0)
    if f.read(4) != b"fLaC":
        return tags, picture
    while True:
        head = f.read(4)
        if len(head) < 4:
            break
        last, btype = head[0] & 0x80, head[0] & 0x7F
        size = (head[1] << 16) | (head[2] << 8) | head[3]
        if btype == 4 and size <= MAX_TAG_BYTES:
            pic = _vorbis_comments(f.read(size), tags)
            picture = picture or pic
        elif btype == 6 and picture is None and size <= MAX_TAG_BYTES:
            picture = _flac_picture(f.read(size))
        else:
            f.seek(size, os.SEEK_CUR)
        if last:
            break
    return tags, picture


def read_ogg(f):
    """Ogg Vorbis or Opus: the comment packet is the second packet of the stream."""
    tags = {}
    f.seek(0)
    packets, current, read = [], b"", 0
    while len(packets) < 2 and read < MAX_TAG_BYTES:
        header = f.read(27)
        if len(header) < 27 or header[:4] != b"OggS":
            break
        lacing = f.read(header[26])
        body = f.read(sum(lacing))
        read += 27 + len(lacing) + len(body)
        pos = 0
        for lace in lacing:
            current += body[pos:pos + lace]
            pos += lace
            if lace < 255:
                packets.append(current)
                current = b""
                if len(packets) >= 2:
                    break
    if len(packets) < 2:
        return tags, None
    packet = packets[1]
    if packet[:7] == b"\x03vorbis":
        picture = _vorbis_comments(packet[7:], tags)
    elif packet[:8] == b"OpusTags":
        picture = _vorbis_comments(packet[8:], tags)
    else:
        picture = None
    return tags, picture


def read_m4a(f):
    """MP4 / M4A: moov > udta > meta > ilst."""
    tags, picture = {}, None
    names = {b"\xa9nam": "title", b"\xa9ART": "artist", b"aART": "albumartist", b"\xa9alb": "album"}

    def atoms(start, end):
        pos = start
        while pos + 8 <= end:
            f.seek(pos)
            head = f.read(8)
            if len(head) < 8:
                return
            size, kind = struct.unpack(">I", head[:4])[0], head[4:8]
            header = 8
            if size == 1:
                size = struct.unpack(">Q", f.read(8))[0]
                header = 16
            elif size == 0:
                size = end - pos
            if size < header:
                return
            yield kind, pos + header, pos + size
            pos += size

    f.seek(0, os.SEEK_END)
    end = f.tell()

    def find(path, start, stop):
        for kind, a, b in atoms(start, stop):
            if kind == path[0]:
                if len(path) == 1:
                    return a, b
                if kind == b"meta":
                    a += 4  # version and flags
                return find(path[1:], a, b)
        return None

    found = find([b"moov", b"udta", b"meta", b"ilst"], 0, end)
    if not found:
        return tags, picture
    for kind, a, b in atoms(*found):
        if b - a > MAX_TAG_BYTES:
            continue
        for dkind, da, db in atoms(a, b):
            if dkind != b"data":
                continue
            f.seek(da)
            raw = f.read(db - da)
            payload = raw[8:]
            if kind in names and names[kind] not in tags:
                value = payload.decode("utf-8", "replace").strip()
                if value:
                    tags[names[kind]] = value
            elif kind in (b"trkn", b"disk") and len(payload) >= 4:
                number = struct.unpack(">H", payload[2:4])[0]
                if number:
                    tags["track" if kind == b"trkn" else "disc"] = str(number)
            elif kind == b"covr" and picture is None and payload:
                mime = "image/png" if payload[:4] == b"\x89PNG" else "image/jpeg"
                picture = (mime, payload)
            break
    return tags, picture


def read_tags(path):
    """Returns (tags, picture). tags may have title, artist, albumartist, album, track, disc.
    picture is (mime type, bytes) or None. Never raises."""
    ext = os.path.splitext(path)[1].lower()
    try:
        with open(path, "rb") as f:
            if ext == ".mp3":
                return read_id3(f)
            if ext == ".flac":
                return read_flac(f)
            if ext in (".ogg", ".opus"):
                return read_ogg(f)
            if ext == ".m4a":
                return read_m4a(f)
    except Exception as e:
        Log("could not read the tags of {}: {}".format(path, e))
    return {}, None


# ---------------------------------------------------------------- names

def _number(value):
    m = re.match(r"\s*(\d+)", str(value or ""))
    return int(m.group(1)) if m else None


def title_from_filename(name):
    """'01 - Main Theme.mp3' -> (1, 'Main Theme'). The number is None when there is none."""
    stem = os.path.splitext(os.path.basename(name))[0]
    stem = stem.replace("_", " ").strip()
    m = re.match(r"^(?:(\d{1,2})[-.](?=\d))?(\d{1,3})(?:\s*[-.)_]\s*|\s+)(.+)$", stem)
    if m and m.group(3).strip():
        return int(m.group(2)), m.group(3).strip()
    return None, stem


def track_info(path, tags, album_fallback):
    """Fills in everything for one track.
    guessed: fields taken from the file, folder or Steam names (not from the tags).
    missing: fields that only have a placeholder."""
    number_from_name, title_from_name = title_from_filename(path)
    guessed, missing = [], []
    title = tags.get("title")
    if not title:
        title = title_from_name
        if title:
            guessed.append("title")
        else:
            title = PLACEHOLDER_TITLE
            missing.append("title")
    artist = tags.get("artist") or tags.get("albumartist")
    if not artist:
        artist = PLACEHOLDER_ARTIST
        missing.append("artist")
    album = tags.get("album")
    if not album:
        album = album_fallback
        if album:
            guessed.append("album")
        else:
            album = PLACEHOLDER_ALBUM
            missing.append("album")
    track = _number(tags.get("track"))
    if track is None:
        track = number_from_name
        (guessed if track is not None else missing).append("track")
    disc = _number(tags.get("disc"))
    return {"title": title, "artist": artist, "album": album, "track": track, "disc": disc,
            "guessed": guessed, "missing": missing}


# ---------------------------------------------------------------- Steam folders

def _vdf_values(text, key):
    return re.findall(r'"{}"\s+"((?:[^"\\]|\\.)*)"'.format(re.escape(key)), text, re.IGNORECASE)


def library_folders(steam_path):
    """Every Steam library folder (the internal drive and SD cards / other drives)."""
    folders = [steam_path]
    try:
        with open(os.path.join(steam_path, "steamapps", "libraryfolders.vdf"), "r", encoding="utf-8", errors="replace") as fp:
            for p in _vdf_values(fp.read(), "path"):
                folders.append(p.replace("\\\\", "\\"))
    except OSError:
        pass
    seen, result = set(), []
    for p in folders:
        real = os.path.realpath(p)
        if real not in seen and os.path.isdir(os.path.join(real, "steamapps")):
            seen.add(real)
            result.append(real)
    return result


def soundtrack_apps(steamapps):
    """installdir -> (appid, name), from the app manifests of one library."""
    apps = {}
    try:
        for name in os.listdir(steamapps):
            if not (name.startswith("appmanifest_") and name.endswith(".acf")):
                continue
            try:
                with open(os.path.join(steamapps, name), "r", encoding="utf-8", errors="replace") as fp:
                    text = fp.read()
                appid = (_vdf_values(text, "appid") or [""])[0]
                title = (_vdf_values(text, "name") or [""])[0]
                folder = (_vdf_values(text, "installdir") or [""])[0]
                if folder:
                    apps[folder.lower()] = (appid, title)
            except OSError:
                continue
    except OSError:
        pass
    return apps


def library_cover(steam_path, appid):
    """Steam's own picture of the soundtrack (from the library cache), or None."""
    if not appid:
        return None
    cache = os.path.join(steam_path, "appcache", "librarycache")
    wanted = ("library_600x900.jpg", "library_capsule.jpg", "header.jpg", "library_header.jpg")
    for name in wanted:
        old = os.path.join(cache, "{}_{}".format(appid, name))
        if os.path.isfile(old):
            return old
    folder = os.path.join(cache, str(appid))
    if os.path.isdir(folder):
        found = {}
        for root, _dirs, files in os.walk(folder):
            for name in files:
                if name.lower() in wanted and name.lower() not in found:
                    found[name.lower()] = os.path.join(root, name)
        for name in wanted:
            if name in found:
                return found[name]
    return None


def folder_cover(folder, album_root):
    """A picture file next to the tracks (cover.jpg, folder.jpg, front.png...), or None."""
    for place in (folder, album_root):
        try:
            images = [n for n in os.listdir(place) if n.lower().endswith(IMAGE_EXTS) and os.path.isfile(os.path.join(place, n))]
        except OSError:
            continue
        if not images:
            continue
        def rank(n):
            low = n.lower()
            for i, word in enumerate(("cover", "front", "folder", "album", "art")):
                if word in low:
                    return (i, low)
            return (9, low)
        return os.path.join(place, sorted(images, key=rank)[0])
    return None


def find_audio(album_root):
    files = []
    root_depth = album_root.rstrip(os.sep).count(os.sep)
    for root, dirs, names in os.walk(album_root, followlinks=True):
        if root.count(os.sep) - root_depth >= MAX_DEPTH:
            dirs[:] = []
        dirs.sort()
        for n in sorted(names):
            if n.lower().endswith(AUDIO_EXTS) and not n.startswith("."):
                files.append(os.path.join(root, n))
    return files


def key_for(text):
    return hashlib.sha1(text.encode("utf-8", "replace")).hexdigest()[:12]


# ---------------------------------------------------------------- scan

def _link(target, link):
    """Makes link point to target (replacing an old link). Returns False if links do not work."""
    try:
        if os.path.islink(link):
            if os.readlink(link) == target:
                return True
            os.unlink(link)
        elif os.path.exists(link):
            os.unlink(link)
        os.symlink(target, link)
        return True
    except OSError as e:
        Log("could not link {}: {}".format(target, e))
        return False


def _save_picture(picture, folder):
    mime, data = picture
    ext = ".png" if "png" in mime else ".webp" if "webp" in mime else ".jpg"
    path = os.path.join(folder, "cover" + ext)
    try:
        with open(path, "wb") as fp:
            fp.write(data)
        return path
    except OSError:
        return None


def scan(steam_path, packs_path):
    """Finds every soundtrack track. Returns a list of track dicts (see the end of this function)."""
    base = os.path.join(packs_path, LINK_FOLDER)
    os.makedirs(base, exist_ok=True)
    index_path = os.path.join(base, INDEX_FILE)
    try:
        with open(index_path, "r") as fp:
            index = json.load(fp)
        if not isinstance(index, dict):
            index = {}
    except Exception:
        index = {}
    new_index = {}
    tracks = []
    used_albums = set()

    for library in library_folders(steam_path):
        steamapps = os.path.join(library, "steamapps")
        music = os.path.join(steamapps, "music")
        if not os.path.isdir(music):
            continue
        apps = soundtrack_apps(steamapps)
        for folder_name in sorted(os.listdir(music)):
            album_root = os.path.join(music, folder_name)
            if not os.path.isdir(album_root):
                continue
            appid, app_name = apps.get(folder_name.lower(), ("", ""))
            album_key = key_for(os.path.realpath(album_root))
            link_dir = os.path.join(base, album_key)
            os.makedirs(link_dir, exist_ok=True)
            used_albums.add(album_key)

            chosen = {}  # same track in several formats: keep one
            picture = None
            for path in find_audio(album_root):
                try:
                    stat = os.stat(path)
                except OSError:
                    continue
                old = index.get(path)
                if old and old.get("mtime") == stat.st_mtime and old.get("size") == stat.st_size:
                    info = old["info"]
                    has_picture = old.get("picture", False)
                else:
                    tags, pic = read_tags(path)
                    info = track_info(path, tags, app_name or folder_name)
                    has_picture = pic is not None
                    if pic and picture is None:
                        picture = pic
                new_index[path] = {"mtime": stat.st_mtime, "size": stat.st_size, "info": info, "picture": has_picture}
                ext = os.path.splitext(path)[1].lower()
                same = (info.get("disc") or 1, info.get("track"), info["title"].lower())
                if same in chosen and FORMAT_ORDER.get(chosen[same][1], 9) <= FORMAT_ORDER.get(ext, 9):
                    continue
                chosen[same] = (path, ext, info, has_picture)

            if not chosen:
                continue

            # Cover: embedded picture > picture file in the folder > Steam's library picture
            cover = None
            for name in os.listdir(link_dir):
                if name.startswith("cover."):
                    cover = os.path.join(link_dir, name)
            if cover is None or os.path.islink(cover):
                if picture is None:
                    for path, _ext, _info, has_pic in chosen.values():
                        if has_pic:
                            picture = read_tags(path)[1]
                            if picture:
                                break
                if picture is not None:
                    if cover and os.path.islink(cover):
                        os.unlink(cover)
                    cover = _save_picture(picture, link_dir)
                else:
                    source = folder_cover(os.path.dirname(next(iter(chosen.values()))[0]), album_root) or library_cover(steam_path, appid)
                    if source:
                        if cover and os.path.basename(cover) != "cover" + os.path.splitext(source)[1].lower():
                            os.unlink(cover)
                        cover = os.path.join(link_dir, "cover" + os.path.splitext(source)[1].lower())
                        if not _link(source, cover):
                            cover = None
                    else:
                        cover = None
            cover_url = ""
            if cover and os.path.exists(cover):
                cover_url = "/sounds_custom/{}/{}/{}?v={}".format(LINK_FOLDER, album_key, os.path.basename(cover), int(os.path.getmtime(cover)))

            wanted_links = set()
            for path, ext, info, _has in chosen.values():
                file_name = key_for(path) + ext
                if not _link(path, os.path.join(link_dir, file_name)):
                    continue
                wanted_links.add(file_name)
                tracks.append({
                    "path": path,
                    "file": file_name,
                    "albumKey": album_key,
                    "albumFolder": folder_name,
                    "appid": appid,
                    "cover": cover_url,
                    **info,
                })
            # Links of tracks that are gone
            for name in os.listdir(link_dir):
                if not name.startswith("cover.") and name not in wanted_links:
                    try:
                        os.unlink(os.path.join(link_dir, name))
                    except OSError:
                        pass

    # Folders of soundtracks that are gone (they only hold links and saved covers)
    for name in os.listdir(base):
        full = os.path.join(base, name)
        if name != INDEX_FILE and os.path.isdir(full) and not os.path.islink(full) and name not in used_albums:
            shutil.rmtree(full, ignore_errors=True)
    try:
        with open(index_path, "w") as fp:
            json.dump(new_index, fp)
    except OSError:
        pass

    tracks.sort(key=lambda t: (t["album"].lower(), t.get("disc") or 1, t["track"] if t["track"] is not None else 9999, t["title"].lower()))
    return tracks


def pack_dicts(tracks, packs_path, taken_names):
    """The tracks as music packs (the same shape as Pack.to_dict in main.py)."""
    result = []
    names = set(taken_names)
    for t in tracks:
        name = "{} - {}".format(t["album"], t["title"])
        unique, n = name, 2
        while unique in names:
            unique = "{} ({})".format(name, n)
            n += 1
        names.add(unique)
        result.append({
            "name": unique,
            "description": "{} - {}".format(t["artist"], t["album"]),
            "version": "",
            "author": t["artist"],
            "ignore": [],
            "mappings": {"menu_music.mp3": [t["file"]]},
            "music": True,
            "hasIntro": False,
            "packPath": os.path.join(packs_path, LINK_FOLDER, t["albumKey"]),
            "truncatedPackPath": "{}/{}".format(LINK_FOLDER, t["albumKey"]),
            "id": "steam:" + key_for(t["path"]),
            "steam": {
                "title": t["title"],
                "artist": t["artist"],
                "album": t["album"],
                "track": t["track"],
                "disc": t["disc"],
                "cover": t["cover"],
                "appid": t["appid"],
                "albumKey": t["albumKey"],
                "guessed": t.get("guessed", []),
                "missing": t["missing"],
                "file": t["path"],
            },
        })
    return result
