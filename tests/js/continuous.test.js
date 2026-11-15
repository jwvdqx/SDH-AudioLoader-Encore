// Continuous Playback: where the music was, and when it is used.
const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../src/audioPlayers/continuous.ts");
const { loadSettings } = require("../../src/settings.ts");
const python = require("../../src/python.ts");

const saved = [];
python.setServer({ callPluginMethod: (name, args) => { if (name === "save_position") saved.push(args.data); return Promise.resolve({ success: true, result: true }); } });

test("the file is taken from the player's address", () => {
  assert.equal(c.fileOf({ src: "https://steamloopback.host/sounds_custom/Halo%203/menu%20music.mp3" }), "menu music.mp3");
  assert.equal(c.fileOf({ src: "" }), "");
});

test("no place is remembered for the intro or when no music is chosen", () => {
  const el = { src: "/sounds_custom/P/intro_music.mp3", currentTime: 12, alIntro: true };
  assert.equal(c.positionOf(el, "P"), null);
  assert.equal(c.positionOf({ src: "/x/a.mp3", currentTime: 3 }, "None"), null);
  const p = c.positionOf({ src: "/sounds_custom/P/b.mp3", currentTime: 42.5 }, "P");
  assert.equal(p.file, "b.mp3");
  assert.equal(p.time, 42.5);
});

test("the place is only used when Continuous Playback is on, and only for the same music", () => {
  loadSettings({ continuous_playback: false });
  c.rememberPosition({ music: "P", file: "b.mp3", time: 42, at: 1 }, true);
  assert.equal(c.resumeFor("P"), null);
  loadSettings({ continuous_playback: true });
  assert.deepEqual(c.resumeFor("P"), { file: "b.mp3", time: 42 });
  assert.equal(c.resumeFor("Other"), null);
  loadSettings({});
});

test("saving right away writes the place, the same place is not written twice", () => {
  saved.length = 0;
  loadSettings({ continuous_playback: true });
  c.savePositionNow({ src: "/sounds_custom/Q/song.m4a", currentTime: 100.2 }, "Q");
  c.savePositionNow({ src: "/sounds_custom/Q/song.m4a", currentTime: 100.4 }, "Q");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].file, "song.m4a");
  loadSettings({});
});
