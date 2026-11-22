import * as python from "../python";
import { resumePlan } from "./continuous";

// Continuous Playback: jumping to the remembered second of a song. A jump only works where the player can
// reach: Steam's local file server may not let a player jump far into a file it has not loaded yet (a long
// file, like an hour-long mix, is loaded bit by bit), and the player then simply plays from the start.
// So the jump is checked: the player stays silent until it is at the right second, the jump is tried again
// while more of the file loads, and when that does not work the whole file is loaded into memory (a player
// can jump anywhere in that). Until then the remembered second is kept (the place is not lost to the
// "second 0" of the player).

export interface SeekTimings {
  /** how often the jump is tried again */
  pollMs: number;
  /** how long to wait for the file server before loading the whole file */
  fallbackMs: number;
  /** when to give up and let the music play from where it is */
  giveUpMs: number;
}

const DEFAULT_TIMINGS: SeekTimings = { pollMs: 400, fallbackMs: 4000, giveUpMs: 12000 };

// The last whole file loaded into memory: freed when the next one is loaded or its player is stopped
let lastBlobUrl = "";

/** Can the player jump to `at` right now? */
export function canReach(el: any, at: number): boolean {
  const r = el?.seekable;
  try {
    if (r && typeof r.length === "number") {
      for (let i = 0; i < r.length; i++) if (r.start(i) <= at && at <= r.end(i)) return true;
    }
  } catch {
    // not readable
  }
  return false;
}

/** Is the player at the second it should be (it may have played on a little since)? */
export function isAt(el: any, at: number): boolean {
  const t = Number(el?.currentTime) || 0;
  return t >= at - 1.5 && t <= at + 15;
}

/** Frees the memory of a whole file loaded for a player (when that player is stopped for good). */
export function freeWholeFile(el: any): void {
  const url = el?.alBlobUrl;
  if (!url) return;
  el.alBlobUrl = "";
  if (url === lastBlobUrl) lastBlobUrl = "";
  try {
    URL.revokeObjectURL(url);
  } catch {
    // already freed
  }
}

/**
 * Jumps the player to `at` (once its length is known) and makes sure the jump really happened.
 * onSongOver: the remembered second is the very end of the song.
 */
export function seekToResume(
  el: any,
  at: number,
  file: string,
  onSongOver?: (() => void) | null,
  timings: SeekTimings = DEFAULT_TIMINGS
): void {
  if (!(at > 0)) return;
  el.alResumeAt = at;
  el.alFile = file;
  const wasMuted = !!el.muted;
  el.muted = true;
  const started = Date.now();
  let timer: any = null;
  let triedWhole = false;
  let done = false;

  const finish = (how: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.removeEventListener?.("loadedmetadata", onMeta);
    delete el.alResumeAt;
    el.muted = wasMuted;
    python.logEvent(`Continuous Playback: ${how}`);
  };

  const tryJump = () => {
    if (done) return;
    if (el.alStopped) return finish("the player was stopped before the jump");
    const length = isFinite(el.duration) ? el.duration : 0;
    if (length > 0 || canReach(el, at)) {
      const plan = resumePlan(at, length);
      if (plan === "next") {
        finish(`the song was over (remembered ${Math.round(at)} s, length ${Math.round(length)} s), the next one comes`);
        if (onSongOver) setTimeout(onSongOver, 0);
        return;
      }
      if (plan === "start") return finish("nothing to jump to");
      if (isAt(el, at)) return finish(`carried on at ${Math.round(at)} s of ${Math.round(length)} s${triedWhole ? " (from the whole file)" : ""}`);
      if (canReach(el, at)) {
        try {
          el.currentTime = at;
        } catch {
          // tried again
        }
      }
    }
    const waited = Date.now() - started;
    if (waited >= timings.giveUpMs) return finish(`could not jump to ${Math.round(at)} s, the song plays from where it is`);
    if (!triedWhole && waited >= timings.fallbackMs) {
      triedWhole = true;
      void loadWhole();
    }
    timer = setTimeout(tryJump, timings.pollMs);
  };

  const loadWhole = async () => {
    const src = String(el.src || "");
    if (!src || src.startsWith("blob:") || typeof fetch !== "function") return;
    python.logEvent(`Continuous Playback: the player could not jump to ${Math.round(at)} s, loading the whole file`);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (done || el.alStopped) return;
      if (lastBlobUrl) {
        try {
          URL.revokeObjectURL(lastBlobUrl);
        } catch {
          // already freed
        }
      }
      const url = URL.createObjectURL(blob);
      lastBlobUrl = url;
      el.alBlobUrl = url;
      const wasPlaying = !el.paused;
      el.src = url;
      if (wasPlaying) Promise.resolve(el.play?.()).catch(() => {});
    } catch (e) {
      python.logEvent(`Continuous Playback: could not load the whole file: ${e}`);
    }
  };

  const onMeta = () => tryJump();
  el.addEventListener?.("loadedmetadata", onMeta);
  timer = setTimeout(tryJump, 0);
}
