import { findSP } from "decky-frontend-lib";
import * as python from "../python";
import { settings } from "../settings";
import { GlobalState } from "../state/GlobalState";
import { changeMenuMusic, menuMusicControl } from "./changeMenuMusic";
import { recentMusic } from "./dailyMusic";
import { pauseMusicSmooth, resumeMusicSmooth } from "./fade";
import { endSleepTimerPause } from "./limits";
import { skipMusic } from "./musicGuard";

// Media keys: Play, Stop, Next and Prev control the menu music. Steam Input can send these keys from
// any controller button (a layout's "Numpad" keyboard page has them), for example through Steam's
// Guide Button Chord Layout (Steam + a button, everywhere in Steam). Real keyboards with media keys
// work too. Encore listens to the key presses in Steam's windows, and also offers the actions to the
// browser's media session (some systems send media keys that way instead).

export type MediaAction = "next" | "previous" | "playpause" | "stop";

const KEY_ACTIONS: Record<string, MediaAction> = {
  MediaTrackNext: "next",
  MediaNextTrack: "next",
  MediaTrackPrevious: "previous",
  MediaPreviousTrack: "previous",
  MediaPlayPause: "playpause",
  MediaPlay: "playpause",
  MediaPause: "playpause",
  MediaStop: "stop",
};

export function actionForKey(key: string | undefined): MediaAction | null {
  return (key && KEY_ACTIONS[key]) || null;
}

// The same press can arrive twice (as a key and through the media session): count it once
const REPEAT_MS = 300;

/**
 * "Prev": the music that played before. Pressing it again goes further back. The way back is
 * remembered while only Prev is pressed; any other change starts it again from the newest.
 */
export function previousMusic(recent: string[], current: string, stepped: string[], exists: (name: string) => boolean): string | null {
  const skip = new Set([current, ...stepped]);
  for (let i = recent.length - 1; i >= 0; i--) {
    const name = recent[i];
    if (!skip.has(name) && exists(name)) return name;
  }
  return null;
}

export function startMediaKeys(state: GlobalState): () => void {
  let lastAt = 0;
  let lastAction: MediaAction | null = null;
  let stepped: string[] = [];
  let lastPrevTarget = "";

  const run = (action: MediaAction, source: string) => {
    if (!settings.media_keys) return;
    const now = Date.now();
    if (action === lastAction && now - lastAt < REPEAT_MS) return;
    lastAction = action;
    lastAt = now;
    const s = state.getPublicState();
    // In a game the music is paused, and the keys belong to the game
    if (!s.legacyEnabled || s.gamesRunning.length > 0 || s.selectedMusic === "None") return;
    python.logEvent(`Media key (${source}): ${action}`);
    if (s.selectedMusic !== lastPrevTarget) stepped = [];

    if (action === "next") {
      skipMusic(state);
    } else if (action === "previous") {
      const exists = (name: string) => s.soundPacks.some((p) => p.music && p.name === name);
      const back = previousMusic(recentMusic, s.selectedMusic, stepped, exists);
      if (!back) return;
      stepped = [...stepped, s.selectedMusic];
      lastPrevTarget = back;
      python.setConfig({ selected_music: back });
      changeMenuMusic(back, s.menuMusic, state.setGlobalState.bind(state), s.gamesRunning, s.soundPacks, s.musicVolume);
    } else {
      const el = s.menuMusic;
      if (!el) return;
      if (el.paused && action === "playpause") {
        menuMusicControl.pausedByOtherPlugin = false;
        if (menuMusicControl.pausedByLimit === "sleepTimer") endSleepTimerPause(state);
        Promise.resolve(resumeMusicSmooth(el)).catch(() => {});
      } else if (!el.paused) {
        // Paused on purpose: the music guard must not start it again
        menuMusicControl.pausedByOtherPlugin = true;
        pauseMusicSmooth(el);
      }
    }
  };

  // Key presses, in every Steam window Encore can reach
  const onKey = (e: KeyboardEvent) => {
    const action = actionForKey(e.key) || actionForKey(e.code);
    if (action && !e.repeat) run(action, "key");
  };
  const windows = new Set<Window>();
  const addWindow = (w: any) => {
    if (!w || windows.has(w) || typeof w.addEventListener !== "function") return;
    windows.add(w);
    w.addEventListener("keydown", onKey, true);
  };
  const findWindows = () => {
    addWindow(typeof window !== "undefined" ? window : null);
    try {
      addWindow(findSP?.());
    } catch {
      // not on this Steam version
    }
    try {
      addWindow((window as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow);
    } catch {
      // not on this Steam version
    }
  };
  findWindows();
  // Steam's main window can appear after Encore starts
  const lookAgain = setTimeout(findWindows, 15000);

  // The media session (media keys handled by the browser itself)
  const sessions: any[] = [];
  const handlers: [string, MediaAction][] = [
    ["nexttrack", "next"],
    ["previoustrack", "previous"],
    ["play", "playpause"],
    ["pause", "playpause"],
    ["stop", "stop"],
  ];
  for (const w of Array.from(windows)) {
    const ms = (w as any).navigator?.mediaSession;
    if (!ms || typeof ms.setActionHandler !== "function" || sessions.includes(ms)) continue;
    sessions.push(ms);
    for (const [name, action] of handlers) {
      try {
        ms.setActionHandler(name, () => run(action, "media session"));
      } catch {
        // this action is not supported here
      }
    }
  }

  return () => {
    clearTimeout(lookAgain);
    for (const w of Array.from(windows)) w.removeEventListener("keydown", onKey, true);
    for (const ms of sessions) {
      for (const [name] of handlers) {
        try {
          ms.setActionHandler(name, null);
        } catch {
          // nothing to undo
        }
      }
    }
  };
}
