"""Storage: how much space each part of Encore takes, and a clean-up of files that are safe to delete.

The clean-up never deletes a pack, the settings, or the tools in use. It only offers:
- half-finished downloads and temporary files
- copies of a damaged settings file (config.json.broken)
- old log files (the newest one is kept)
- the previous version of a downloader tool, once the current one has worked for a week
- loudness measurements of files that no longer exist (they live inside the settings file)
What will be deleted is always computed again right before deleting, so only files on that list go.
"""
import json
import os
import shutil
import time

AUDIO_EXTS = (".mp3", ".ogg", ".opus", ".m4a", ".flac", ".wav", ".webm")
LEFTOVER_ENDINGS = (".tmp", ".part", ".ytdl", ".swap", ".fallback")


def tree_size(path):
    """Bytes of a file or folder. Links are counted as links (not what they point to)."""
    try:
        if os.path.islink(path) or os.path.isfile(path):
            return os.lstat(path).st_size
    except OSError:
        return 0
    total = 0
    for root, dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def _pack_kind(folder):
    """"music", "sounds" or "downloaded" (made by Find Music), from the pack's pack.json."""
    try:
        with open(os.path.join(folder, "pack.json"), "r") as fp:
            data = json.load(fp)
    except Exception:
        return None
    if isinstance(data.get("encore_source"), dict):
        return "downloaded"
    return "music" if data.get("music") else "sounds"


def usage(packs_dir, tools, log_dir, links_folder):
    """Sizes by part, plus the drive. tools: downloader_tools.Tools or None."""
    parts = {"music": 0, "downloaded": 0, "sounds": 0, "steam_links": 0, "tools": 0, "tools_previous": 0,
             "logs": 0, "settings": 0, "leftovers": 0}
    counts = {"music": 0, "downloaded": 0, "sounds": 0}
    try:
        names = os.listdir(packs_dir)
    except OSError:
        names = []
    for name in names:
        full = os.path.join(packs_dir, name)
        if name == links_folder:
            parts["steam_links"] += tree_size(full)
            continue
        if os.path.isdir(full) and not os.path.islink(full):
            kind = _pack_kind(full)
            if kind:
                parts[kind] += tree_size(full)
                counts[kind] += 1
            continue
        if os.path.isfile(full):
            if name.endswith(LEFTOVER_ENDINGS) or ".broken" in name:
                parts["leftovers"] += tree_size(full)
            else:
                parts["settings"] += tree_size(full)  # config.json, STORE
    if tools is not None:
        for tool, info in tools.status()["tools"].items():
            parts["tools"] += _file_size(tools.path(tool))
            parts["tools_previous"] += _file_size(tools.previous_path(tool))
        parts["settings"] += _file_size(tools.state_path)
        for name in os.listdir(tools.bin):
            if name.endswith(LEFTOVER_ENDINGS):
                parts["leftovers"] += tree_size(os.path.join(tools.bin, name))
    if log_dir and os.path.isdir(log_dir):
        parts["logs"] = tree_size(log_dir)
    try:
        disk = shutil.disk_usage(packs_dir)
        drive = {"total": disk.total, "used": disk.used, "free": disk.free}
    except OSError:
        drive = {"total": 0, "used": 0, "free": 0}
    return {"parts": parts, "counts": counts, "drive": drive}


def _file_size(path):
    try:
        return os.path.getsize(path)
    except OSError:
        return 0


def cleanup_plan(packs_dir, tools, log_dir, config, now=None):
    """What the clean-up would delete: [{"id", "label", "bytes"}]. config: the loaded settings."""
    now = now or time.time()
    items = []

    def add(item_id, label, size):
        if size > 0:
            items.append({"id": item_id, "label": label, "bytes": size})

    try:
        names = sorted(os.listdir(packs_dir))
    except OSError:
        names = []
    for name in names:
        full = os.path.join(packs_dir, name)
        if os.path.isfile(full) and (name.endswith(LEFTOVER_ENDINGS) or ".broken" in name):
            add("file:" + full, "Damaged settings copy: " + name if ".broken" in name else "Temporary file: " + name, tree_size(full))
        elif os.path.isdir(full) and not os.path.islink(full):
            # Half-finished downloads inside a pack folder
            for sub in sorted(os.listdir(full)):
                if sub.endswith(LEFTOVER_ENDINGS):
                    p = os.path.join(full, sub)
                    add("file:" + p, "Unfinished download: {}/{}".format(name, sub), tree_size(p))
    if tools is not None:
        for name in sorted(os.listdir(tools.bin)):
            if name.endswith(LEFTOVER_ENDINGS):
                p = os.path.join(tools.bin, name)
                add("file:" + p, "Temporary file: " + name, tree_size(p))
        for tool in tools.status()["tools"]:
            prev = tools.previous_path(tool)
            info = tools.info(tool)
            if os.path.isfile(prev) and now - info.get("last_ok", 0) < 7 * 24 * 3600 and now - info.get("installed_at", now) >= 7 * 24 * 3600:
                add("file:" + prev, "Previous {} version ({}), the current one has worked for a week".format(tool, (info.get("previous") or {}).get("version") or "?"), tree_size(prev))
    if log_dir and os.path.isdir(log_dir):
        logs = sorted((os.path.join(log_dir, n) for n in os.listdir(log_dir) if os.path.isfile(os.path.join(log_dir, n))), key=os.path.getmtime)
        for p in logs[:-1]:
            add("file:" + p, "Old log: " + os.path.basename(p), tree_size(p))
    stale = stale_loudness(packs_dir, config)
    if stale:
        add("loudness", "Loudness measurements of {} file{} that no longer exist".format(len(stale), "" if len(stale) == 1 else "s"),
            len(json.dumps({k: config["loudness_cache"][k] for k in stale})))
    return items


def stale_loudness(packs_dir, config):
    cache = (config or {}).get("loudness_cache")
    if not isinstance(cache, dict):
        return []
    return [k for k in cache if not os.path.exists(os.path.join(packs_dir, k))]


def run_cleanup(chosen_ids, packs_dir, tools, log_dir, config, write_config):
    """Deletes what is on a fresh plan and was chosen. Returns (bytes freed, items done)."""
    plan = {i["id"]: i for i in cleanup_plan(packs_dir, tools, log_dir, config)}
    freed, done = 0, []
    for item_id in chosen_ids:
        item = plan.get(item_id)
        if not item:
            continue  # not on the plan (any more): never deleted
        if item_id == "loudness":
            stale = stale_loudness(packs_dir, config)
            for k in stale:
                config["loudness_cache"].pop(k, None)
            write_config(config)
        else:
            path = item_id[len("file:"):]
            try:
                os.remove(path)
            except OSError:
                continue
        freed += item["bytes"]
        done.append(item_id)
    return freed, done
