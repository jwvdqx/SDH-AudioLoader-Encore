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
// The file is tiny: written every 5 seconds at most, so a switch to Desktop Mode (Steam gives no warning
// for it) loses at most 5 seconds
const SAVE_MS = 5000;

let position: Position | null = null;
let savedAt = 0;
let savedText = "";

export function continuousOn(): boolean {
  return settings.continuous_playback === true;
}

/** The file name the player is playing (the last part of its address). */
export function fileOf(el: any): string {
  // a whole file loaded into memory has a "blob:" address: its file name is kept on the player
  if (el?.alFile && String(el?.src || "").startsWith("blob:")) return el.alFile;
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
  // while the jump to the remembered second is on its way, the place stays that second (see seekResume.ts)
  const time = typeof el.alResumeAt === "number" ? el.alResumeAt : Number(el.currentTime) || 0;
  if (!file) return null;
  return { music, file, time, at: Date.now() };
}

/** The place to resume a music from, when it is the one remembered. */
export function resumeFor(music: string): { file: string; time: number } | null {
  if (!continuousOn() || !position || position.music !== music) return null;
  return { file: position.file, time: position.time };
}

// A remembered place this close to the end of the song counts as "the song was over"
const END_MARGIN_S = 2;

/** What to do with a remembered place once the song's length is known. */
export function resumePlan(at: number, length: number): "seek" | "next" | "start" {
  if (!(at > 0)) return "start";
  if (!(length > 0)) return "seek";
  return at < length - END_MARGIN_S ? "seek" : "next";
}

/**
 * A player that was reset (for example by the Deck sleeping) reports second 0. That must not replace a
 * good place remembered for the same song.
 */
export function keepsOldPosition(old: Position | null, next: Position): boolean {
  return !!old && old.music === next.music && old.file === next.file && next.time < 1 && old.time >= 1;
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
  const p = positionOf(el, music);
  if (!p || keepsOldPosition(position, p)) return;
  rememberPosition(p, true);
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

/**
 * A new song started (not a resume): remember "this song, from the start" right away, so the place always
 * belongs to the music that plays now, even if Steam closes before the next save.
 */
export function noteSongStarted(music: string, file: string): void {
  if (!continuousOn() || !music || music === "None" || !file) return;
  rememberPosition({ music, file, time: 0, at: Date.now() }, true);
}

/** The place to use at startup: only when it belongs to the music saved as selected (that is written the
 * moment it changes, so it is the one to trust). */
export function startupPlace(saved: string, remembered: Position | null): Position | null {
  return remembered && remembered.music === saved ? remembered : null;
}
