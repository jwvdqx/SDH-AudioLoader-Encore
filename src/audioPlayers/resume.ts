import * as python from "../python";
import { GlobalState } from "../state/GlobalState";
import { changeMenuMusic, menuMusicControl } from "./changeMenuMusic";
import { continuousOn, fileOf, Position, rememberedPosition } from "./continuous";
import { resumeMusicSmooth } from "./fade";
import { audioClockMoves, bypassMusicGraph, ensureLiveContext, musicGraphFor, resetMusicContext } from "./musicGraph";
import { note } from "./stats";

// Resuming the music, the same way everywhere: after a game, the Play button, the media keys, the end
// of a preview, Battery Saver / Sleep Timer, and the music guard (after sleep, or when it went silent).
//
// Why it is done this way: the music can be "playing" and still not be heard. When it goes through
// Encore's audio chain (Normalize Music Volume, Muffled Music) and the chain's sound output died (after
// sleep, or when the audio device changed), every player connected to that chain stays silent, even a
// brand new one. So a resume:
//   1. finds the place to continue from (the song and second where the music was),
//   2. makes sure the audio chain is alive, and replaces it when its clock stands still,
//   3. tries the same player first (quick, keeps everything as it was) and checks that it is heard,
//   4. otherwise builds a new player at that place and checks again; when that stays silent, once more on
//      a fresh chain; and as a last resort without the chain at all, so there is always music.
// "Heard" means: the player's clock moves, and, when it is in the audio chain, the chain's clock moves too.

export interface Place {
  file: string;
  time: number;
}

const HEAR_MS = 3000;
const POLL_MS = 250;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Where to continue `music`: where its player was. A player the Deck reset to second 0 does not replace
 * a good place remembered by Continuous Playback. A player of another pack gives no place (its song
 * would be the wrong one). Without a player, Continuous Playback's remembered place (when it is on).
 */
export function placeToResume(old: any, music: string, remembered: Position | null, continuous: boolean): Place | null {
  const rememberedHere = remembered && remembered.music === music && remembered.time > 0 ? remembered : null;
  if (old && old.alMusic === music && !old.alIntro) {
    const file = fileOf(old);
    const time = Number(old.currentTime) || 0;
    if (file) {
      if (time < 1 && rememberedHere && rememberedHere.file === file) return { file, time: rememberedHere.time };
      if (time > 0) return { file, time };
      return { file, time: 0 };
    }
  }
  return continuous && rememberedHere ? { file: rememberedHere.file, time: rememberedHere.time } : null;
}

/** Is this player heard? Its clock moves, and the audio chain's too when it is in it. */
async function isHeard(el: any, ms = HEAR_MS): Promise<boolean> {
  if (!el) return false;
  const start = Number(el.currentTime) || 0;
  const until = Date.now() + ms;
  while (Date.now() < until) {
    await wait(POLL_MS);
    if (el.error) return false;
    if (!el.paused && !el.ended && el.currentTime - start >= 0.25) {
      if (!musicGraphFor(el)) return true;
      return (await audioClockMoves(250)) !== false;
    }
  }
  return false;
}

/** play() can stay unanswered forever after sleep: never wait for it longer than this. */
function playWithin(promise: Promise<void> | void, ms: number): Promise<void> {
  return Promise.race([Promise.resolve(promise).catch(() => {}), wait(ms)]);
}

let running: Promise<boolean> | null = null;

/**
 * Resumes the music (or starts `target`, when another music was picked meanwhile). Returns true when it is
 * heard. Calls that come while one is running share its result.
 */
export function resumeMusic(state: GlobalState, why: string, target?: string, onSongOver?: () => void): Promise<boolean> {
  if (running) return running;
  running = resumeNow(state, why, target, onSongOver).finally(() => {
    running = null;
  });
  return running;
}

async function resumeNow(state: GlobalState, why: string, target?: string, onSongOver?: () => void): Promise<boolean> {
  let s = state.getPublicState();
  const music = target ?? s.selectedMusic;
  if (!s.legacyEnabled || s.gamesRunning.length > 0 || !music || music === "None") return false;
  if (menuMusicControl.pausedByLimit === "battery") return false;
  menuMusicControl.pausedByOtherPlugin = false;
  (menuMusicControl as any).pausedByMediaSession = false;

  const old: any = s.menuMusic;
  const place = placeToResume(old, music, rememberedPosition(), continuousOn());
  const chain = await ensureLiveContext();

  // The same player, when it can still be heard (not after waking: then its output may be gone)
  if (old && old.alMusic === music && !old.error && !old.ended && chain !== "reset" && why !== "wake") {
    await playWithin(resumeMusicSmooth(old), 4000);
    if (await isHeard(old)) {
      note(`Music resumed (${why})`);
      return true;
    }
  }

  // A new player at the same place, checked; then on a fresh chain; then without the chain
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) resetMusicContext(`a new player was not heard (${why})`);
    if (attempt === 2) bypassMusicGraph(`a fresh chain was not heard either (${why})`);
    s = state.getPublicState();
    if (!s.legacyEnabled || s.gamesRunning.length > 0) return false;
    if (s.selectedMusic !== music && target === undefined) return false; // someone picked other music
    changeMenuMusic(
      music,
      s.menuMusic,
      state.setGlobalState.bind(state),
      s.gamesRunning,
      s.soundPacks,
      s.musicVolume,
      place,
      onSongOver ?? null
    );
    const el = state.getPublicState().menuMusic;
    if (await isHeard(el)) {
      note(`Music resumed with a new player${place ? ` at ${Math.round(place.time)}s` : ""} (${why}${attempt ? `, try ${attempt + 1}` : ""})`);
      return true;
    }
  }
  python.logEvent(`Resume failed (${why}): no player could be heard`);
  return false;
}
