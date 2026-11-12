import { Pack } from "../classes";
import { settings } from "../settings";
import { pickReplayMusic, timeOfDayPack } from "./dailyMusic";
import { rotationMusicNames } from "./steamMusic";

// "Up Next": the music that comes after the current one is chosen ahead of time and remembered,
// so what the menu shows is what really plays, both when the music ends and when Skip is pressed.
// The choice is dropped when anything that decides it changes (the music, the play mode, variety,
// favorites, blocked packs, the installed packs).

interface Queued {
  current: string;
  key: string;
  name: string;
}

let queued: Queued | null = null;

function stateKey(packs: Pack[]): string {
  return [
    settings.play_mode,
    settings.variety_level,
    settings.steam_music_in_rotation,
    settings.favorite_music.join("|"),
    settings.blocked_music.join("|"),
    packs.length,
  ].join("#");
}

/** Forget the chosen next music (a new one is chosen the next time it is needed). */
export function invalidateQueue(): void {
  queued = null;
}

function queuedPick(packs: Pack[], current: string): string | null {
  if (!current || current === "None") return null;
  const key = stateKey(packs);
  if (
    queued &&
    queued.current === current &&
    queued.key === key &&
    rotationMusicNames(packs).includes(queued.name)
  ) {
    return queued.name;
  }
  const name = pickReplayMusic(packs, current);
  queued = name ? { current, key, name } : null;
  return name;
}

/**
 * What plays when the current music ends. null in Repeat mode (the same music plays again).
 * "Music by Time of Day" decides first, like it does for every replay.
 */
export function peekAutoNext(packs: Pack[], current: string): string | null {
  if (settings.play_mode === "repeat") return null;
  return timeOfDayPack(packs) ?? queuedPick(packs, current);
}

/** What the Skip button plays (also in Repeat mode: skipping always goes somewhere else). */
export function peekSkip(packs: Pack[], current: string): string | null {
  const tod = settings.play_mode === "repeat" ? null : timeOfDayPack(packs);
  if (tod && tod !== current) return tod;
  return queuedPick(packs, current);
}

/** The chosen next music, used up: the following one is chosen fresh. */
export function takeQueued(packs: Pack[], current: string): string | null {
  const name = queuedPick(packs, current);
  queued = null;
  return name;
}

export function takeSkip(packs: Pack[], current: string): string | null {
  const name = peekSkip(packs, current);
  queued = null;
  return name;
}
