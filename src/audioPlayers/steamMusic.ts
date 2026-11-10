import { Pack } from "../classes";
import { settings } from "../settings";

// Steam Music: the tracks of the Steam soundtracks you own come from the Python side as music
// packs with a "steam" field (see steam_music.py). They can be picked as menu music like any pack.
// There can be hundreds of them, so they only join the random picks (daily, every replay, skip)
// when "Use in Random Picks" is on.

export function isSteamTrack(pack: Pack | undefined): boolean {
  return !!pack?.steam;
}

/** Music packs that the random picks may choose. */
export function inRotation(pack: Pack): boolean {
  return pack.music && (!pack.steam || settings.steam_music_in_rotation);
}

export function rotationMusicNames(soundPacks: Pack[]): string[] {
  return soundPacks.filter(inRotation).map((p) => p.name);
}

export interface SteamAlbum {
  key: string;
  album: string;
  artist: string;
  cover: string;
  tracks: Pack[];
}

/** The Steam tracks grouped by album (soundtrack), in album order, tracks in track order. */
export function steamAlbums(soundPacks: Pack[]): SteamAlbum[] {
  const albums = new Map<string, SteamAlbum>();
  for (const p of soundPacks) {
    const s = p.steam;
    if (!s) continue;
    const key = `${s.albumKey}|${s.album}`;
    let a = albums.get(key);
    if (!a) {
      a = { key, album: s.album, artist: s.artist, cover: s.cover, tracks: [] };
      albums.set(key, a);
    }
    if (a.artist !== s.artist) a.artist = "Various Artists";
    if (!a.cover && s.cover) a.cover = s.cover;
    a.tracks.push(p);
  }
  const num = (v: number | null | undefined) => (typeof v === "number" ? v : 9999);
  const list = Array.from(albums.values());
  for (const a of list) {
    a.tracks.sort(
      (x, y) =>
        num(x.steam!.disc ?? 1) - num(y.steam!.disc ?? 1) ||
        num(x.steam!.track) - num(y.steam!.track) ||
        x.steam!.title.localeCompare(y.steam!.title)
    );
  }
  return list.sort((x, y) => x.album.localeCompare(y.album));
}

// Shown when a soundtrack has no cover at all
export const PLACEHOLDER_COVER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#5a3a8a"/><stop offset="1" stop-color="#1e1e3a"/></linearGradient></defs>' +
      '<rect width="64" height="64" rx="6" fill="url(#g)"/>' +
      '<path d="M26 18v20.5a6 6 0 1 0 4 5.6V26l14-3v12.5a6 6 0 1 0 4 5.6V14z" fill="#c9a0ff" opacity="0.85"/>' +
      "</svg>"
  );
