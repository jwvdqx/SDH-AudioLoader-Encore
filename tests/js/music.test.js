// Music picking and the loading of saved settings.
const test = require("node:test");
const assert = require("node:assert/strict");
const { chooseVaried, seriesOf } = require("../../src/audioPlayers/dailyMusic.ts");
const { settings, loadSettings, DEFAULT_SETTINGS } = require("../../src/settings.ts");

const names = [
  "Borderlands - Track A", "Borderlands - Track B", "Borderlands 2 - Track C",
  "Persona 5 - Last Surprise", "Persona 4 - Pursuing My True Self",
  "Halo - Theme", "Doom - E1M1", "Portal - Still Alive", "Skyrim - Dragonborn", "Fallout - Main Theme",
];
const opts = (o) => ({ variety: 100, favorites: [], blocked: [], ...o });
const many = (n, fn) => Array.from({ length: n }, fn);

test("the pack that plays right now is never picked again", () => {
  for (const variety of [0, 50, 100]) {
    const picks = many(300, () => chooseVaried(names, "Halo - Theme", [], Math.random, opts({ variety })));
    assert.ok(!picks.includes("Halo - Theme"), "variety " + variety);
  }
});

test("blocked packs are never picked", () => {
  const blocked = ["Halo - Theme", "Doom - E1M1", "Portal - Still Alive"];
  const picks = many(500, () => chooseVaried(names, "Skyrim - Dragonborn", [], Math.random, opts({ blocked, variety: 50 })));
  assert.ok(picks.every((p) => !blocked.includes(p)));
});

test("favorites come up more often than other packs", () => {
  const favorites = ["Doom - E1M1"];
  const picks = many(4000, () => chooseVaried(names, "Halo - Theme", [], Math.random, opts({ favorites, variety: 0 })));
  const fav = picks.filter((p) => p === "Doom - E1M1").length;
  const other = picks.filter((p) => p === "Portal - Still Alive").length;
  assert.ok(fav > other * 1.8, `favorite ${fav} vs normal ${other}`);
});

test("at full variety, recent packs and recent series are avoided", () => {
  const recent = ["Persona 5 - Last Surprise", "Halo - Theme", "Doom - E1M1"];
  const picks = many(500, () => chooseVaried(names, "Doom - E1M1", recent, Math.random, opts({ variety: 100 })));
  for (const p of picks) {
    assert.ok(!recent.includes(p), "repeated " + p);
    assert.notEqual(seriesOf(p), seriesOf("Persona 5 - Last Surprise"));
  }
});

test("with a single pack it still returns something", () => {
  assert.equal(chooseVaried(["Only One"], "Only One", [], Math.random, opts({ variety: 100 })), "Only One");
});

test("packs of one series share a series name", () => {
  assert.equal(seriesOf("Borderlands - Track A"), seriesOf("Borderlands 2 - Track C"));
  assert.notEqual(seriesOf("Halo - Theme"), seriesOf("Doom - E1M1"));
});

test("saved settings: missing or broken values get their defaults", () => {
  loadSettings(undefined);
  assert.equal(settings.variety_level, DEFAULT_SETTINGS.variety_level);
  loadSettings({ variety_level: "abc", favorite_music: "nope", battery_threshold: 9999, sleep_timer_minutes: -5 });
  assert.equal(settings.variety_level, DEFAULT_SETTINGS.variety_level);
  assert.deepEqual(settings.favorite_music, []);
  assert.equal(settings.battery_threshold, 50);
  assert.equal(settings.sleep_timer_minutes, 1);
});

test("saved settings: the Now Playing filter switch is off unless saved on", () => {
  loadSettings({});
  assert.equal(settings.lowpass_skip_now_playing, false);
  loadSettings({ lowpass_skip_now_playing: true });
  assert.equal(settings.lowpass_skip_now_playing, true);
  loadSettings({ lowpass_skip_now_playing: "yes" });
  assert.equal(settings.lowpass_skip_now_playing, false);
  loadSettings({});
});

test("saved settings: the old 'Pure Random' switch becomes variety 0", () => {
  loadSettings({ pure_random_music: true });
  assert.equal(settings.variety_level, 0);
  loadSettings({ pure_random_music: true, variety_level: 70 });
  assert.equal(settings.variety_level, 70);
});

// ---- Steam Music ----
const { chooseDailyMusic, getTodayKey, pickReplayMusic } = require("../../src/audioPlayers/dailyMusic.ts");
const { steamAlbums, rotationMusicNames } = require("../../src/audioPlayers/steamMusic.ts");

const pack = (name, steam) => ({ name, music: true, mappings: {}, ...(steam ? { steam } : {}) });
const track = (album, title, n) => ({ title, artist: "A", album, track: n, disc: null, cover: "", appid: "", albumKey: album, guessed: [], missing: [], file: "" });
const library = [
  pack("Halo - Theme"),
  pack("Doom - E1M1"),
  pack("OST - Two", track("OST", "Two", 2)),
  pack("OST - One", track("OST", "One", 1)),
  pack("Other - Song", track("Other", "Song", null)),
];

test("Steam tracks are only in the random picks when that is on", () => {
  loadSettings({});
  assert.deepEqual(rotationMusicNames(library), ["Halo - Theme", "Doom - E1M1"]);
  for (let i = 0; i < 100; i++) assert.ok(!pickReplayMusic(library, "Halo - Theme").startsWith("OST"));
  loadSettings({ steam_music_in_rotation: true });
  assert.equal(rotationMusicNames(library).length, 5);
  loadSettings({});
});

test("a Steam track picked by hand today stays today's music", () => {
  loadSettings({});
  const choice = chooseDailyMusic(library, getTodayKey(), "OST - One");
  assert.equal(choice.pick, "OST - One");
  assert.equal(choice.isNew, false);
});

test("Steam tracks are grouped by soundtrack, in track order", () => {
  const albums = steamAlbums(library);
  assert.deepEqual(albums.map((a) => a.album), ["OST", "Other"]);
  assert.deepEqual(albums[0].tracks.map((p) => p.steam.title), ["One", "Two"]);
});

// ---- Play modes and Up Next ----
const { resolvePlayMode } = require("../../src/settings.ts");
const queue = require("../../src/audioPlayers/playQueue.ts");

test("play mode: older saved settings become Repeat or Smart Shuffle", () => {
  assert.equal(resolvePlayMode({}), "repeat");
  assert.equal(resolvePlayMode({ random_music_every_replay: false }), "repeat");
  assert.equal(resolvePlayMode({ random_music_every_replay: true }), "smart");
  assert.equal(resolvePlayMode({ play_mode: "shuffle", random_music_every_replay: false }), "shuffle");
  assert.equal(resolvePlayMode({ play_mode: "nonsense", random_music_every_replay: true }), "smart");
  loadSettings({ random_music_every_replay: true });
  assert.equal(settings.play_mode, "smart");
  loadSettings({});
  assert.equal(settings.play_mode, "repeat");
});

test("Shuffle ignores favorites and variety, but never picks blocked packs", () => {
  loadSettings({ play_mode: "shuffle", favorite_music: ["Doom - E1M1"], blocked_music: ["Portal - Still Alive"] });
  const lib = names.map((n) => pack(n));
  const picks = many(3000, () => pickReplayMusic(lib, "Halo - Theme"));
  assert.ok(!picks.includes("Halo - Theme"));
  assert.ok(!picks.includes("Portal - Still Alive"));
  const fav = picks.filter((p) => p === "Doom - E1M1").length;
  const other = picks.filter((p) => p === "Skyrim - Dragonborn").length;
  assert.ok(fav < other * 1.5, `favorite ${fav} vs normal ${other}: shuffle should not favor`);
  loadSettings({});
});

test("Up Next: stays the same until something changes, and Repeat has none", () => {
  const lib = names.map((n) => pack(n));
  loadSettings({ play_mode: "smart" });
  queue.invalidateQueue();
  const first = queue.peekAutoNext(lib, "Halo - Theme");
  assert.ok(first && first !== "Halo - Theme");
  for (let i = 0; i < 50; i++) assert.equal(queue.peekAutoNext(lib, "Halo - Theme"), first);
  assert.equal(queue.peekSkip(lib, "Halo - Theme"), first);
  // a different current music: a new choice, never the current one
  const other = queue.peekAutoNext(lib, "Doom - E1M1");
  assert.notEqual(other, "Doom - E1M1");
  // Repeat: no Up Next, but Skip still goes somewhere else
  loadSettings({ play_mode: "repeat" });
  assert.equal(queue.peekAutoNext(lib, "Halo - Theme"), null);
  const skip = queue.peekSkip(lib, "Halo - Theme");
  assert.ok(skip && skip !== "Halo - Theme");
  loadSettings({});
});

test("Up Next: taking it uses it up, and a blocked pack is dropped from the queue", () => {
  const lib = names.map((n) => pack(n));
  loadSettings({ play_mode: "smart" });
  queue.invalidateQueue();
  const shown = queue.peekAutoNext(lib, "Halo - Theme");
  assert.equal(queue.takeQueued(lib, "Halo - Theme"), shown);
  // blocking the shown pack changes the queue key: it is never played
  const shown2 = queue.peekAutoNext(lib, "Halo - Theme");
  loadSettings({ play_mode: "smart", blocked_music: [shown2] });
  for (let i = 0; i < 30; i++) assert.notEqual(queue.peekAutoNext(lib, "Halo - Theme"), shown2);
  loadSettings({});
});

test("Up Next: Music by Time of Day decides when it has a choice", () => {
  const lib = names.map((n) => pack(n));
  const slots = ["tod_morning", "tod_afternoon", "tod_night"];
  const all = {};
  for (const s of slots) all[s] = "Portal - Still Alive";
  loadSettings({ play_mode: "shuffle", tod_enabled: true, ...all });
  assert.equal(queue.peekAutoNext(lib, "Halo - Theme"), "Portal - Still Alive");
  loadSettings({});
});

test("Time of Day plays its pack once for each part of the day, then the shuffle goes on", () => {
  const lib = names.map((n) => pack(n));
  const all = {};
  for (const s of ["tod_morning", "tod_afternoon", "tod_night"]) all[s] = "Portal - Still Alive";
  loadSettings({ play_mode: "shuffle", tod_enabled: true, ...all });

  // the time-of-day pack is already what plays: the next music is something else
  for (let i = 0; i < 40; i++) {
    const next = queue.takeQueued(lib, "Portal - Still Alive");
    assert.notEqual(next, "Portal - Still Alive", "it must not start the same music again");
  }
  // later pieces keep shuffling: the time-of-day pack does not come back every time
  let portal = 0;
  let current = "Halo - Theme";
  for (let i = 0; i < 60; i++) {
    current = queue.takeQueued(lib, current);
    if (current === "Portal - Still Alive") portal++;
  }
  assert.ok(portal < 30, "the time-of-day pack came back too often: " + portal + " of 60");
  loadSettings({});
});

test("Time of Day: the Up Next line never shows the music that is playing now", () => {
  const lib = names.map((n) => pack(n));
  const all = {};
  for (const s of ["tod_morning", "tod_afternoon", "tod_night"]) all[s] = "Doom - E1M1";
  loadSettings({ play_mode: "smart", tod_enabled: true, ...all });
  for (let i = 0; i < 40; i++) {
    assert.notEqual(queue.peekAutoNext(lib, "Doom - E1M1"), "Doom - E1M1");
    assert.notEqual(queue.peekSkip(lib, "Doom - E1M1"), "Doom - E1M1");
  }
  loadSettings({});
});

// ---- Repeats with a large library ----
const daily = require("../../src/audioPlayers/dailyMusic.ts");

// 300 tracks in 30 albums of very different sizes (like Steam soundtracks)
function bigLibrary() {
  const names = [];
  const sizes = [2, 3, 4, 5, 40, 60, 2, 3, 30, 8, 2, 2, 25, 6, 10, 12, 3, 4, 20, 9, 2, 5, 7, 11, 3, 2, 6, 15, 4, 0];
  sizes[29] = 300 - sizes.reduce((a, b) => a + b, 0);
  sizes.forEach((n, a) => { for (let i = 0; i < n; i++) names.push(`Album ${a} - Track ${i}`); });
  return names;
}

function playMany(pick, names, count) {
  let recent = [];
  let current = names[0];
  const played = [];
  for (let i = 0; i < count; i++) {
    current = pick(names, current, recent);
    played.push(current);
    recent = [...recent.filter((n) => n !== current), current].slice(-600);
  }
  return played;
}

test("Smart Shuffle: with 300 tracks, 200 plays in a row have no repeats", () => {
  loadSettings({ variety_level: 100 });
  const names = bigLibrary();
  const played = playMany((n, c, r) => chooseVaried(n, c, r), names, 200);
  assert.equal(new Set(played).size, played.length);
});

test("Shuffle: with 300 tracks, 150 plays in a row have no repeats", () => {
  loadSettings({});
  const names = bigLibrary();
  const played = playMany((n, c, r) => daily.shufflePick(n, c, r), names, 150);
  assert.equal(new Set(played).size, played.length);
});

test("tracks of small albums do not come up far more often than others", () => {
  loadSettings({ variety_level: 0 });
  const names = bigLibrary();
  const counts = {};
  for (let i = 0; i < 20000; i++) {
    const p = chooseVaried(names, "", [], Math.random, { variety: 50, favorites: [], blocked: [] });
    counts[p] = (counts[p] || 0) + 1;
  }
  const small = counts["Album 0 - Track 0"] || 0; // album of 2
  const big = counts["Album 5 - Track 0"] || 0; // album of 60
  // equal album chances gave a 30x difference; now about sqrt(60/2) = 5.5x
  assert.ok(small < big * 9, `small album track ${small}, big album track ${big}`);
  loadSettings({});
});

test("the time-of-day pack plays once per part of the day, also after a restart", () => {
  const packs = [{ name: "Morning Pack", music: true, mappings: {} }, { name: "Other", music: true, mappings: {} }];
  const nine = new Date(2026, 10, 13, 9, 0);
  loadSettings({ tod_enabled: true, tod_morning: "Morning Pack" });
  assert.equal(daily.timeOfDayDue(packs, nine), "Morning Pack");
  daily.markTimeOfDayPlayed(nine);
  const saved = daily.timeOfDaySlotKey(nine);
  // a restart (Desktop Mode and back) loads the saved settings again
  loadSettings({ tod_enabled: true, tod_morning: "Morning Pack", tod_played: saved });
  assert.equal(daily.timeOfDayDue(packs, new Date(2026, 10, 13, 11, 30)), null);
  // the next morning it plays again
  assert.equal(daily.timeOfDayDue(packs, new Date(2026, 10, 14, 9, 0)), "Morning Pack");
  // 01:00 still belongs to the night that started the day before
  assert.equal(daily.timeOfDaySlotKey(new Date(2026, 10, 14, 1, 0)), daily.timeOfDaySlotKey(new Date(2026, 10, 13, 22, 0)));
  loadSettings({});
});

// ---- Media keys ----
const mk = require("../../src/audioPlayers/mediaKeys.ts");

test("media keys: the key names Steam Input and keyboards send are understood", () => {
  assert.equal(mk.actionForKey("MediaTrackNext"), "next");
  assert.equal(mk.actionForKey("MediaTrackPrevious"), "previous");
  assert.equal(mk.actionForKey("MediaPlayPause"), "playpause");
  assert.equal(mk.actionForKey("MediaStop"), "stop");
  assert.equal(mk.actionForKey("a"), null);
  assert.equal(mk.actionForKey(undefined), null);
});

test("media keys: Prev goes back through the music played before, step by step", () => {
  const recent = ["A", "B", "Gone", "C", "D"]; // D plays now, "Gone" was uninstalled
  const exists = (n) => n !== "Gone";
  const first = mk.previousMusic(recent, "D", [], exists);
  assert.equal(first, "C");
  // the history now ends with C (it plays again); pressing Prev again goes further back
  const recent2 = ["A", "B", "Gone", "D", "C"];
  assert.equal(mk.previousMusic(recent2, "C", ["D"], exists), "B");
  assert.equal(mk.previousMusic(["A"], "A", [], exists), null);
});
