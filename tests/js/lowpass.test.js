// The muffled-music filter: when it is on, and how strong it is.
const test = require("node:test");
const assert = require("node:assert/strict");
const lp = require("../../src/audioPlayers/lowPass.ts");

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
