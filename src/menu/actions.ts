import { changeMenuMusic, getTodayKey, refreshEffectVolume } from "../audioPlayers";
import * as python from "../python";

// Actions shared by the menu (Music, Steam Music) and the My Packs page, so they behave the same.
// "g" is what useGlobalState() returns.

/** Plays a music pack now, as if it was picked by hand. Returns false when it cannot play. */
export function playMusicByHand(g: any, name: string): boolean {
  if (!g.legacyEnabled) {
    python.toast("Music is off", "Turn on Enable Legacy Features (Music tab) to play music.", 4000);
    return false;
  }
  python.setConfig({ selected_music: name });
  // With "New Music Every Day" on, music picked by hand becomes today's music
  if (g.dailyRandomMusic) {
    const today = getTodayKey();
    g.setGlobalState("dailyMusicDate", today);
    g.setGlobalState("dailyMusicPick", name);
    python.setConfig({ daily_music_date: today, daily_music_pick: name });
  }
  changeMenuMusic(name, g.menuMusic, (k: string, v: any) => g.setGlobalState(k, v), g.gamesRunning, g.soundPacks, g.musicVolume);
  return true;
}

/** Makes a sound pack the active one ("Default" for Steam's own sounds). */
export function useSoundPack(g: any, name: string): void {
  g.setGlobalState("activeSound", name);
  refreshEffectVolume();
  python.setConfig({ selected_pack: name });
}
