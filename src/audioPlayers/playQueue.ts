import { Pack } from "../classes";
import { settings } from "../settings";
import { pickReplayMusic, slotForHour, timeOfDayPack } from "./dailyMusic";
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

// "Music by Time of Day" and the music that follows an ending piece: the pack chosen for this part of
// the day is played once when the part of the day starts (or when the Deck starts). After that the
// shuffle goes on as normal. Without this rule, every replay would pick the same time-of-day pack
// again, and that music seemed to loop by itself.
let todAppliedSlot: string | null = null;

const currentSlot = (): string => slotForHour(new Date().getHours());

/** The time-of-day pack that should play next (it was not played yet in this part of the day), or null. */
function todForReplay(packs: Pack[], current: string): string | null {
  const tod = timeOfDayPack(packs);
  if (!tod || tod === current) return null;
  return todAppliedSlot === currentSlot() ? null : tod;
}

/**
 * What plays when the current music ends. null in Repeat mode (the same music plays again).
 * "Music by Time of Day" decides first, but only once for each part of the day.
 */
export function peekAutoNext(packs: Pack[], current: string): string | null {
  if (settings.play_mode === "repeat") return null;
  return todForReplay(packs, current) ?? queuedPick(packs, current);
}

/** What the Skip button plays (also in Repeat mode: skipping always goes somewhere else). */
export function peekSkip(packs: Pack[], current: string): string | null {
  const tod = settings.play_mode === "repeat" ? null : todForReplay(packs, current);
  return tod ?? queuedPick(packs, current);
}

// Called when the time-of-day pack is what plays now (for example right after the Deck started)
function noteTimeOfDayPlaying(packs: Pack[], current: string): void {
  if (timeOfDayPack(packs) === current) todAppliedSlot = currentSlot();
}

/** The chosen next music, used up: the following one is chosen fresh. */
export function takeQueued(packs: Pack[], current: string): string | null {
  noteTimeOfDayPlaying(packs, current);
  const tod = todForReplay(packs, current);
  if (tod) {
    todAppliedSlot = currentSlot();
    queued = null;
    return tod;
  }
  const name = queuedPick(packs, current);
  queued = null;
  return name;
}

export function takeSkip(packs: Pack[], current: string): string | null {
  noteTimeOfDayPlaying(packs, current);
  const name = peekSkip(packs, current);
  if (name && name === timeOfDayPack(packs)) todAppliedSlot = currentSlot();
  queued = null;
  return name;
}
