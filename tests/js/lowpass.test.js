// The muffled-music filter: when it is on, and how strong it is.
const test = require("node:test");
const assert = require("node:assert/strict");
const lp = require("../../src/audioPlayers/lowPass.ts");
const { loadSettings } = require("../../src/settings.ts");

// A clock the tests can move, so one test's sounds do not leak into the next one
let clock = 1_800_000_000_000;
Date.now = () => clock;
// The filter's own watcher checks four times a second; after moving the clock, wait for one check
let stopMonitor = null;
test.before(() => { stopMonitor = lp.startMusicLowPassContextMonitor(); });
test.after(() => { if (stopMonitor) stopMonitor(); });
const tick = async (ms) => {
  clock += ms;
  await new Promise((resolve) => setTimeout(resolve, 320));
};

const base = { steamMenu: false, quickAccess: false, gameLoading: false, popups: false, volume: false, microphone: false, strength: 50 };

test("nothing is filtered while every toggle is off", async () => {
  lp.configureMusicLowPass(base);
  lp.lowPassForSound("deck_ui_volume.wav");
  lp.lowPassForSound("deck_ui_show_modal.wav");
  lp.lowPassForSound("deck_ui_toast.wav");
  assert.equal(lp.shouldFilter(), false);
  lp.lowPassForSound("deck_ui_hide_modal.wav");
  await tick(10_000);
});

test("strength 0 is almost no change, 100 is strong, and it only goes one way", async () => {
  assert.ok(lp.cutoffForStrength(0) >= 19000);
  assert.ok(lp.cutoffForStrength(100) <= 600);
  let last = Infinity;
  for (let s = 0; s <= 100; s += 10) {
    const c = lp.cutoffForStrength(s);
    assert.ok(c < last, "cutoff must fall as strength rises: " + s);
    last = c;
  }
});

test("volume toggle: the filter turns on with Steam's volume sound", async () => {
  lp.configureMusicLowPass({ ...base, volume: true });
  assert.equal(lp.shouldFilter(), false);
  lp.lowPassForSound("deck_ui_volume.wav");
  assert.equal(lp.shouldFilter(), true);
  await tick(1000);
  assert.equal(lp.shouldFilter(), true, "still on shortly after the last change");
  await tick(1000);
  assert.equal(lp.shouldFilter(), false, "ends by itself 1.5 s after the last change");
  lp.lowPassForSound("deck_ui_volume.wav");
  lp.configureMusicLowPass({ ...base, volume: false });
  assert.equal(lp.shouldFilter(), false, "turning the toggle off ends it");
  await tick(10_000);
});

test("pop-up toggle: a dialog opening turns the filter on, closing turns it off", async () => {
  lp.configureMusicLowPass({ ...base, popups: true });
  lp.lowPassForSound("deck_ui_show_modal.wav");
  assert.equal(lp.shouldFilter(), true);
  lp.lowPassForSound("deck_ui_hide_modal.wav");
  assert.equal(lp.shouldFilter(), false);
});

test("pop-up toggle: a notification sound muffles the music for a moment", async () => {
  lp.configureMusicLowPass({ ...base, popups: true });
  lp.lowPassForSound("deck_ui_toast.wav");
  assert.equal(lp.shouldFilter(), true);
  await tick(2000);
  assert.equal(lp.shouldFilter(), true, "still muffled 2 s later");
  await tick(2000);
  assert.equal(lp.shouldFilter(), false, "back to normal after about 3.5 s");
  lp.configureMusicLowPass(base);
});

test("other Steam sounds change nothing", async () => {
  lp.configureMusicLowPass({ ...base, popups: true, volume: true });
  lp.lowPassForSound("deck_ui_tab_transition_01.wav");
  assert.equal(lp.shouldFilter(), false);
  lp.configureMusicLowPass(base);
});

// ---- microphone: a change of the input side muffles the music for a moment ----
const devices = (inputVolume, extra = {}) => ({
  activeOutputDeviceId: 1, activeInputDeviceId: 2, overrideOutputDeviceId: -1, overrideInputDeviceId: -1,
  vecDevices: [
    { id: 1, sName: "Speakers", bHasOutput: true, bHasInput: false, bIsDefaultOutputDevice: true, bIsDefaultInputDevice: false, flOutputVolume: 0.7, flInputVolume: 0 },
    { id: 2, sName: "Microphone", bHasOutput: false, bHasInput: true, bIsDefaultOutputDevice: false, bIsDefaultInputDevice: true, flOutputVolume: 0, flInputVolume: inputVolume, ...extra },
  ],
});

test("microphone: the signature ignores speakers and changes with the input", () => {
  const a = lp.micSignature(devices(0.8));
  assert.equal(lp.micSignature(devices(0.8)), a, "the same state gives the same text");
  assert.notEqual(lp.micSignature(devices(0)), a, "volume (or mute) changes it");
  assert.notEqual(lp.micSignature(devices(0.8, { bMuted: true })), a, "a mute flag changes it");
  const speakersChanged = devices(0.8);
  speakersChanged.vecDevices[0].flOutputVolume = 0.2;
  assert.equal(lp.micSignature(speakersChanged), a, "output volume is not the microphone");
  assert.equal(lp.micSignature(undefined), undefined);
});

test("microphone: music is muffled for a moment after a change, never while nothing changes", async () => {
  lp.configureMusicLowPass({ ...base, microphone: true });
  lp.feedMicrophoneState(lp.micSignature(devices(0.8)));
  assert.equal(lp.shouldFilter(), false, "the first reading is only the starting point");
  lp.feedMicrophoneState(lp.micSignature(devices(0.8)));
  assert.equal(lp.shouldFilter(), false, "no change, no filter");
  lp.feedMicrophoneState(lp.micSignature(devices(0)));
  assert.equal(lp.shouldFilter(), true, "microphone switched off: muffled");
  await tick(1000);
  assert.equal(lp.shouldFilter(), true);
  await tick(1000);
  assert.equal(lp.shouldFilter(), false, "ends by itself after 1.5 s");
  lp.feedMicrophoneState(lp.micSignature(devices(0.8)));
  assert.equal(lp.shouldFilter(), true, "microphone switched on: muffled again");
  lp.configureMusicLowPass(base);
  assert.equal(lp.shouldFilter(), false, "turning the toggle off ends it");
  await tick(10_000);
});

test("microphone: a missing reading changes nothing", () => {
  lp.configureMusicLowPass({ ...base, microphone: true });
  lp.feedMicrophoneState(undefined);
  assert.equal(lp.shouldFilter(), false);
  lp.configureMusicLowPass(base);
});

// ---- Skip Now Playing Notifications ----

test("skip Now Playing: its own notification sound does not muffle the music, other notifications still do", async () => {
  loadSettings({ lowpass_skip_now_playing: true });
  lp.configureMusicLowPass({ ...base, popups: true });

  lp.lowPassNowPlayingToast(); // Encore is about to show its Now Playing notification
  lp.lowPassForSound("deck_ui_toast.wav"); // Steam plays the notification sound
  assert.equal(lp.shouldFilter(), false, "Now Playing's own sound is ignored");

  await tick(3000); // the Now Playing moment is over
  lp.lowPassForSound("deck_ui_toast.wav"); // a real notification (a message, an achievement)
  assert.equal(lp.shouldFilter(), true, "other notifications still muffle");
  await tick(4000);
  assert.equal(lp.shouldFilter(), false);
  lp.configureMusicLowPass(base);
});

test("skip Now Playing: switched off, the notification muffles as before", async () => {
  loadSettings({ lowpass_skip_now_playing: false });
  lp.configureMusicLowPass({ ...base, popups: true });
  lp.lowPassNowPlayingToast();
  lp.lowPassForSound("deck_ui_toast.wav");
  assert.equal(lp.shouldFilter(), true);
  await tick(4000);
  lp.configureMusicLowPass(base);
  loadSettings({});
});

// ---- 1.7: the watcher does less while the music is not playing ----
test("while the music is paused, Steam's menu state is read only every 2 seconds", async () => {
  let reads = 0;
  const menu = { GetOpenSideMenu: () => { reads++; return 0; } };
  global.window = global.window || {};
  const oldStore = window.SteamUIStore;
  window.SteamUIStore = { WindowStore: { GamepadUIMainWindowInstance: { MenuStore: menu } } };
  const player = { paused: false, ended: false, volume: 1 };
  lp.setMusicLowPassPlayer(player);
  lp.configureMusicLowPass({ ...base, steamMenu: true });
  reads = 0;
  await new Promise((r) => setTimeout(r, 1100));
  const playing = reads;
  player.paused = true;
  reads = 0;
  await new Promise((r) => setTimeout(r, 2100));
  const paused = reads;
  assert.ok(playing >= 3, `reads while playing: ${playing}`);
  assert.ok(paused <= 2, `reads while paused: ${paused}`);
  // the filter still ends on time while paused (the volume timer)
  lp.configureMusicLowPass({ ...base, volume: true });
  lp.lowPassForSound("deck_ui_volume.wav");
  assert.equal(lp.shouldFilter(), true);
  await tick(2000);
  assert.equal(lp.shouldFilter(), false);
  lp.configureMusicLowPass(base);
  lp.setMusicLowPassPlayer(null);
  window.SteamUIStore = oldStore;
});

test("with every toggle off, Steam's menu state is not read at all", async () => {
  let reads = 0;
  global.window = global.window || {};
  const oldStore = window.SteamUIStore;
  window.SteamUIStore = { WindowStore: { GamepadUIMainWindowInstance: { MenuStore: { GetOpenSideMenu: () => { reads++; return 0; } } } } };
  lp.setMusicLowPassPlayer({ paused: false, ended: false, volume: 1 });
  lp.configureMusicLowPass(base);
  reads = 0;
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(reads, 0);
  lp.setMusicLowPassPlayer(null);
  window.SteamUIStore = oldStore;
});
