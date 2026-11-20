// 2.0.1: the sleep/wake and resume fixes, and the shared notification sound list.
const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../src/audioPlayers/continuous.ts");
const { loadSettings } = require("../../src/settings.ts");
const python = require("../../src/python.ts");
const mk = require("../../src/audioPlayers/mediaKeys.ts");
const ns = require("../../src/audioPlayers/notificationSounds.ts");
const fade = require("../../src/audioPlayers/fade.ts");
const { musicFx } = require("../../src/audioPlayers/loudness.ts");

const saved = [];
python.setServer({ callPluginMethod: (name, args) => { if (name === "save_position") saved.push(args.data); return Promise.resolve({ success: true, result: true }); } });

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Continuous Playback ----

test("a player reset to second 0 does not replace a good remembered place", () => {
  loadSettings({ continuous_playback: true });
  c.rememberPosition({ music: "W", file: "a.mp3", time: 120, at: 1 }, true);
  saved.length = 0;
  c.savePositionNow({ src: "/sounds_custom/W/a.mp3", currentTime: 0 }, "W"); // what a reset player reports after sleep
  assert.deepEqual(c.resumeFor("W"), { file: "a.mp3", time: 120 });
  assert.equal(saved.length, 0, "nothing was written");
  loadSettings({});
});

test("a place that really moved is still saved (also back to the start of a new song)", () => {
  loadSettings({ continuous_playback: true });
  c.rememberPosition({ music: "W", file: "a.mp3", time: 120, at: 1 }, true);
  c.savePositionNow({ src: "/sounds_custom/W/a.mp3", currentTime: 131 }, "W");
  assert.equal(c.resumeFor("W").time, 131);
  c.savePositionNow({ src: "/sounds_custom/W/b.mp3", currentTime: 0 }, "W"); // another song of the pack
  assert.deepEqual(c.resumeFor("W"), { file: "b.mp3", time: 0 });
  loadSettings({});
});

test("keepsOldPosition only protects the same song of the same music", () => {
  const old = { music: "W", file: "a.mp3", time: 50, at: 1 };
  assert.equal(c.keepsOldPosition(old, { music: "W", file: "a.mp3", time: 0, at: 2 }), true);
  assert.equal(c.keepsOldPosition(old, { music: "W", file: "a.mp3", time: 0.4, at: 2 }), true);
  assert.equal(c.keepsOldPosition(old, { music: "W", file: "a.mp3", time: 3, at: 2 }), false);
  assert.equal(c.keepsOldPosition(old, { music: "W", file: "b.mp3", time: 0, at: 2 }), false);
  assert.equal(c.keepsOldPosition(old, { music: "X", file: "a.mp3", time: 0, at: 2 }), false);
  assert.equal(c.keepsOldPosition(null, { music: "W", file: "a.mp3", time: 0, at: 2 }), false);
  assert.equal(c.keepsOldPosition({ ...old, time: 0.5 }, { music: "W", file: "a.mp3", time: 0, at: 2 }), false);
});

test("resumePlan: seek in the song, move on at its very end, start from the beginning otherwise", () => {
  assert.equal(c.resumePlan(0, 200), "start");
  assert.equal(c.resumePlan(-3, 200), "start");
  assert.equal(c.resumePlan(60, 200), "seek");
  assert.equal(c.resumePlan(60, 0), "seek", "length not known: the place is trusted");
  assert.equal(c.resumePlan(197.9, 200), "seek");
  assert.equal(c.resumePlan(198, 200), "next");
  assert.equal(c.resumePlan(200, 200), "next");
});

// ---- Media keys ----

test("media keys: Play and Pause are explicit, only Play/Pause toggles", () => {
  assert.equal(mk.actionForKey("MediaPlay"), "play");
  assert.equal(mk.actionForKey("MediaPause"), "pause");
  assert.equal(mk.actionForKey("MediaPlayPause"), "playpause");
});

// ---- Notification sounds ----

test("one list of notification sounds, with the toasts and the chat and friends sounds", () => {
  for (const name of [
    "deck_ui_toast.wav",
    "deck_ui_message_toast.wav",
    "deck_ui_achievement_toast.wav",
    "steam_at_mention.m4a",
    "steam_chatroom_notification.m4a",
    "ui_steam_message_old_smooth.m4a",
    "ui_steam_smoother_friend_join.m4a",
    "ui_steam_smoother_friend_online.m4a",
  ]) {
    assert.ok(ns.NOTIFICATION_SOUNDS.has(name), name);
  }
  assert.equal(ns.NOTIFICATION_SOUNDS.has("steam_chatroom_notification.wav"), false, "that file does not exist");
  assert.equal(ns.NOTIFICATION_SOUNDS.has("deck_ui_volume.wav"), false);
});

test("lower the music for notifications: a chat sound ducks, Encore's own Now Playing sound does not", async () => {
  loadSettings({ duck_notifications: true });
  musicFx.duck = 1;
  fade.maybeDuckForSound("steam_at_mention.m4a");
  await pause(400);
  assert.ok(musicFx.duck < 0.5, `ducked (${musicFx.duck})`);
  fade.stopFx();
  musicFx.duck = 1;

  ns.markOwnToast();
  fade.maybeDuckForSound("deck_ui_toast.wav");
  await pause(400);
  assert.equal(musicFx.duck, 1, "the own notification does not dip the music");
  fade.stopFx();
  loadSettings({});
});

test("lower the music for notifications: off means off", async () => {
  loadSettings({ duck_notifications: false });
  musicFx.duck = 1;
  fade.maybeDuckForSound("deck_ui_toast.wav");
  await pause(300);
  assert.equal(musicFx.duck, 1);
  fade.stopFx();
  loadSettings({});
});

// ---- Resume: where to carry on (resume.ts) ----
const { placeToResume } = require("../../src/audioPlayers/resume.ts");
const player = (music, file, time, extra = {}) => ({ alMusic: music, src: `/sounds_custom/p/${file}`, currentTime: time, ...extra });

test("resume carries on where the player was", () => {
  assert.deepEqual(placeToResume(player("A", "song.mp3", 73.5), "A", null, false), { file: "song.mp3", time: 73.5 });
});

test("a player the Deck reset to 0 does not replace a good remembered place", () => {
  const remembered = { music: "A", file: "song.mp3", time: 120, at: 1 };
  assert.deepEqual(placeToResume(player("A", "song.mp3", 0), "A", remembered, true), { file: "song.mp3", time: 120 });
});

test("the place of another pack's player is never carried over", () => {
  assert.equal(placeToResume(player("B", "menu_music.mp3", 50), "A", null, false), null);
  const remembered = { music: "A", file: "a.mp3", time: 30, at: 1 };
  assert.deepEqual(placeToResume(player("B", "menu_music.mp3", 50), "A", remembered, true), { file: "a.mp3", time: 30 });
});

test("no place inside an intro, and without a player only Continuous Playback remembers", () => {
  assert.equal(placeToResume(player("A", "intro.mp3", 5, { alIntro: true }), "A", null, false), null);
  const remembered = { music: "A", file: "a.mp3", time: 30, at: 1 };
  assert.equal(placeToResume(null, "A", remembered, false), null);
  assert.deepEqual(placeToResume(null, "A", remembered, true), { file: "a.mp3", time: 30 });
});
