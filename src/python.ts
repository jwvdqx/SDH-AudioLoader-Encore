// Code from https://github.com/NGnius/PowerTools/blob/dev/src/python.ts
import { ServerAPI } from "decky-frontend-lib";
import { Pack } from "./classes";
import { GlobalState } from "./state/GlobalState";

var server: ServerAPI | undefined = undefined;
var globalState: GlobalState | undefined = undefined;

export function setServer(s: ServerAPI) {
  server = s;
}
export function setStateClass(s: GlobalState): void {
  globalState = s;
}

// The title and message can also be React elements (the "Now Playing" title scrolls this way)
export function toast(title: any, message: any, duration: number = 8000) {
  // This is a weirdo self-invoking function, but it works.
  return (() => {
    try {
      return server?.toaster.toast({
        title: title,
        body: message,
        duration: duration,
      } as any);
    } catch (e) {
      console.log("CSSLoader Toaster Error", e);
    }
  })();
}

// Writes a line to the Decky log (in the Audio Loader log folder) and to the browser console,
// to help find problems. Logging must never break the plugin.
export function logEvent(message: string): void {
  console.log("Audio Loader -", message);
  try {
    server?.callPluginMethod("log_message", { message: message }).catch(() => {});
  } catch {
    // ignore
  }
}

export function resolve(promise: Promise<any>, setter: any) {
  (async function () {
    let data = await promise;
    if (data.success) {
      console.debug("Got resolved", data, "promise", promise);
      setter(data.result);
    } else {
      console.warn("Resolve failed:", data, "promise", promise);
    }
  })();
}

export function execute(promise: Promise<any>) {
  (async function () {
    let data = await promise;
    if (data.success) {
      console.debug("Got executed", data, "promise", promise);
    } else {
      console.warn("Execute failed:", data, "promise", promise);
    }
  })();
}

// The version of the pack list the screen has. Opening a pack list asks again; the backend only
// sends the list when it changed (with hundreds of Steam tracks it is several hundred KB, and setting
// an unchanged list would re-draw every menu and throw away the chosen "Up next" for nothing).
let packsVersion = "";

export function getAndSetSoundPacks(): Promise<any> {
  const setGlobalState = globalState!.setGlobalState.bind(globalState);
  return server!
    .callPluginMethod<{ known: string }, { version: string; packs: Pack[] | null }>("get_sound_packs_if_changed", {
      known: packsVersion,
    })
    .then((data) => {
      if (data.success && data.result && Array.isArray(data.result.packs)) {
        packsVersion = data.result.version;
        setGlobalState("soundPacks", data.result.packs);
        return;
      }
      if (data.success) return; // unchanged
      // An older backend (or an error): the plain list
      return server!.callPluginMethod<{}, Pack[]>("get_sound_packs", {}).then((plain) => {
        if (plain.success) setGlobalState("soundPacks", plain.result);
      });
    });
}

// getSoundPacks just fetches the packs already stored in python memory, you need to call this reload function to re-fetch the folder list
// The Steam soundtracks are only looked up again every 30 seconds, unless forceSteam is true ("Scan Again")
export function reloadBackend(forceSteam: boolean = false): Promise<void> {
  return server!.callPluginMethod("parse_packs", { force_steam: forceSteam }).then(() => {
    getAndSetSoundPacks();
  });
}

export function dummyFuncTest(): void {
  const setGlobalState = globalState!.setGlobalState.bind(globalState);
  server!.callPluginMethod<{}, boolean>("dummy_function", {}).then((res) => {
    if (res.success) {
      setGlobalState("dummyFuncResult", res.result);
      return;
    }
    setGlobalState("dummyFuncResult", false);
  });
}

export async function getBackendVersion(): Promise<any> {
  return server!.callPluginMethod("get_loader_version", {});
}

export async function fetchPackDb(): Promise<any> {
  return server!.fetchNoCors("https://api.deckthemes.com/themes/legacy/audio", {
    method: "GET",
  });
}

export function downloadThemeFromUrl(themeId: string): Promise<any> {
  const { apiUrl } = globalState!.getPublicState();
  return server!.callPluginMethod("download_theme_from_url", {
    id: themeId,
    url: apiUrl,
  });
}

export function storeRead(key: string) {
  return server!.callPluginMethod("store_read", { key: key });
}

export function storeWrite(key: string, value: string) {
  return server!.callPluginMethod("store_write", { key: key, val: value });
}

export function downloadPack(uuid: string): Promise<any> {
  return server!.callPluginMethod("download_pack", { uuid: uuid });
}

export function deletePack(name: string): Promise<any> {
  return server!.callPluginMethod("delete_pack", { name: name });
}

export function getConfig(): Promise<any> {
  return server!.callPluginMethod("get_config", {});
}

// Saving is batched: changes that come close together (a slider being dragged, several settings
// changed by one action) are merged and written in one go. With a large library the settings file
// is over 100 KB, and every save rewrites all of it.
const SAVE_DELAY_MS = 400;
let pendingConfig: Record<string, any> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWaiters: (() => void)[] = [];

/** Writes the waiting changes now (also used when the plugin is unloaded). */
export function flushConfig(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const data = pendingConfig;
  const waiters = pendingWaiters;
  pendingConfig = null;
  pendingWaiters = [];
  if (!data) return Promise.resolve();
  return Promise.resolve(server?.callPluginMethod("set_config", { configObj: data }))
    .catch((e) => console.warn("Audio Loader: could not save the settings", e))
    .then(() => waiters.forEach((w) => w()));
}

export function setConfig(configObj: object): Promise<void> {
  pendingConfig = { ...(pendingConfig || {}), ...configObj };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushConfig(), SAVE_DELAY_MS);
  return new Promise((resolve) => pendingWaiters.push(resolve));
}

export function listPackFiles(packPath: string): Promise<any> {
  return server!.callPluginMethod("list_pack_files", { pack_path: packPath });
}

export function dummyFunction(): Promise<any> {
  return server!.callPluginMethod("dummy_function", {});
}

export function getPluginVersion(): Promise<any> {
  return server!.callPluginMethod("get_plugin_version", {});
}

export function checkForUpdate(): Promise<any> {
  return server!.callPluginMethod("check_for_update", {});
}
