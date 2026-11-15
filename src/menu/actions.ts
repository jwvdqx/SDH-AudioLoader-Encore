import { changeMenuMusic, getTodayKey, refreshEffectVolume } from "../audioPlayers";
import * as python from "../python";

// Actions shared by the menu (Music, Steam Music) and the My Packs page, so they behave the same.
// They always read the live state, not the copy a page got at its last redraw: with an old copy, the
// player that was really playing was not stopped, and two pieces of music played on top of each other.

const set = (k: string, v: any) => python.setGlobal(k, v);

/** Plays a music pack now, as if it was picked by hand. Returns false when it cannot play. */
export function playMusicByHand(_g: any, name: string): boolean {
  const s = python.liveState();
  if (!s.legacyEnabled) {
    python.toast("Music is off", "Turn on Enable Legacy Features (Music tab) to play music.", 4000);
    return false;
  }
  python.setConfig({ selected_music: name });
  // With "New Music Every Day" on, music picked by hand becomes today's music
  if (s.dailyRandomMusic) {
    const today = getTodayKey();
    set("dailyMusicDate", today);
    set("dailyMusicPick", name);
    python.setConfig({ daily_music_date: today, daily_music_pick: name });
  }
  changeMenuMusic(name, s.menuMusic, set, s.gamesRunning, s.soundPacks, s.musicVolume);
  return true;
}

/** Stops the music (when the pack that plays is uninstalled). */
export function stopMusic(): void {
  const s = python.liveState();
  changeMenuMusic("None", s.menuMusic, set, s.gamesRunning, s.soundPacks, s.musicVolume);
  python.setConfig({ selected_music: "None" });
}

/** Makes a sound pack the active one ("Default" for Steam's own sounds). */
export function useSoundPack(_g: any, name: string): void {
  set("activeSound", name);
  refreshEffectVolume();
  python.setConfig({ selected_pack: name });
}
