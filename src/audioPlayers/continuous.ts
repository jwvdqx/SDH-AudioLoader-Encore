import * as python from "../python";
import { settings } from "../settings";

// Continuous Playback: the music carries on where it was, after a game, after the Deck sleeps, and
// after Steam restarts (Desktop Mode, a reboot). Encore remembers the music, the exact file of the
// pack (a pack can have several songs) and the second, every few seconds, in a small file of its own.
// While it is on, it goes before New Music Every Day, Time of Day and the shuffle modes when the music
// starts again; those still choose what comes next when a song ends.
//
// It depends on how Steam pauses, sleeps and restarts. A SteamOS, Steam or Decky update can change that;
// if resuming stops working, the music simply starts from the beginning as before.

export interface Position {
  music: string;
  file: string;
  time: number;
  at: number;
}

const TRACK_MS = 5000;
const SAVE_MS = 15000;

let position: Position | null = null;
let savedAt = 0;
let savedText = "";

export function continuousOn(): boolean {
  return settings.continuous_playback === true;
}

/** The file name the player is playing (the last part of its address). */
export function fileOf(el: any): string {
  try {
    const src = decodeURIComponent(String(el?.src || ""));
    return src.split("?")[0].split("/").pop() || "";
  } catch {
    return "";
  }
}

/** Where a player is now, or null (no music, the intro, nothing played yet). */
export function positionOf(el: any, music: string): Position | null {
  if (!el || !music || music === "None" || el.alIntro) return null;
  const file = fileOf(el);
  const time = Number(el.currentTime) || 0;
  if (!file) return null;
  return { music, file, time, at: Date.now() };
}

/** The place to resume a music from, when it is the one remembered. */
export function resumeFor(music: string): { file: string; time: number } | null {
  if (!continuousOn() || !position || position.music !== music) return null;
  return { file: position.file, time: position.time };
}

export function rememberPosition(p: Position | null, save = false): void {
  if (!p) return;
  position = p;
  if (save || Date.now() - savedAt >= SAVE_MS) persist();
}

function persist(): void {
  if (!position) return;
  const text = JSON.stringify([position.music, position.file, Math.round(position.time)]);
  if (text === savedText) return;
  savedText = text;
  savedAt = Date.now();
  python.savePosition(position);
}

/** Reads the remembered place (at startup). */
export async function loadPosition(): Promise<Position | null> {
  const p: any = await python.loadPosition();
  if (p && typeof p.music === "string" && p.music && typeof p.file === "string") {
    position = { music: p.music, file: p.file, time: Number(p.time) || 0, at: Number(p.at) || 0 };
    savedText = JSON.stringify([position.music, position.file, Math.round(position.time)]);
  }
  return position;
}

export function rememberedPosition(): Position | null {
  return position;
}

/** Saves where the music is right now (before a game, when the plugin is unloaded). */
export function savePositionNow(el: any, music: string): void {
  if (!continuousOn()) return;
  rememberPosition(positionOf(el, music), true);
}

/** Keeps the place up to date while music plays. Returns a function that stops it. */
export function startPositionTracker(getState: () => any): () => void {
  const timer = setInterval(() => {
    if (!continuousOn()) return;
    const s = getState();
    const el = s.menuMusic;
    if (el && !el.paused && !el.ended) rememberPosition(positionOf(el, s.selectedMusic));
  }, TRACK_MS);
  return () => clearInterval(timer);
}
