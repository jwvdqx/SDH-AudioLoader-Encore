// Controller buttons: which press does what, and both of Steam's message formats.
const test = require("node:test");
const assert = require("node:assert/strict");
const python = require("../../src/python.ts");
python.setServer({ callPluginMethod: () => Promise.resolve({ success: true, result: true }) });
const { loadSettings } = require("../../src/settings.ts");
const mk = require("../../src/audioPlayers/mediaKeys.ts");
const cb = require("../../src/audioPlayers/controllerButtons.ts");

test("back buttons: L4 previous, R4 next, R5 play/pause", () => {
  const none = new Set();
  assert.equal(cb.actionFor("back", 44, none), "previous");
  assert.equal(cb.actionFor("back", 45, none), "next");
  assert.equal(cb.actionFor("back", 33, none), "playpause");
  assert.equal(cb.actionFor("back", 0, none), null);
  assert.equal(cb.actionFor("off", 45, none), null);
});

test("L5 + D-pad only while L5 is held, old and new D-pad ids", () => {
  assert.equal(cb.actionFor("l5dpad", 23, new Set()), null);
  const l5 = new Set([32]);
  assert.equal(cb.actionFor("l5dpad", 23, l5), "next");
  assert.equal(cb.actionFor("l5dpad", 5, l5), "next");
  assert.equal(cb.actionFor("l5dpad", 22, l5), "previous");
  assert.equal(cb.actionFor("l5dpad", 7, l5), "previous");
  assert.equal(cb.actionFor("l5dpad", 21, l5), "playpause");
  assert.equal(cb.actionFor("l5dpad", 20, l5), null);
});

function withSteam(input, fn) {
  const runs = [];
  const fakeState = { getPublicState: () => ({ legacyEnabled: true, gamesRunning: [1], selectedMusic: "P" }) };
  // a game "runs" so the action stops right after it was counted: only the log shows it
  const logs = [];
  python.setServer({ callPluginMethod: (name, args) => { if (name === "log_event" || name === "logEvent") logs.push(JSON.stringify(args)); return Promise.resolve({ success: true, result: true }); } });
  globalThis.window = globalThis.window || globalThis;
  globalThis.SteamClient = { Input: input };
  window.SteamClient = globalThis.SteamClient;
  const stopKeys = mk.startMediaKeys(fakeState);
  const stop = cb.startControllerButtons();
  try { fn(runs); } finally { stop(); stopKeys(); }
}

test("new format: (controller, button, pressed) is read, a held button counts once", () => {
  let cbk; let unreg = 0;
  loadSettings({ controller_buttons: "back" });
  withSteam({ RegisterForControllerInputMessages: (f) => { cbk = f; return { unregister: () => unreg++ }; } }, () => {
    assert.equal(cb.controllerButtonsMethod(), "input messages");
    cbk(0, 45, true);
    cbk(0, 45, true);
    cbk(0, 45, false);
  });
  assert.equal(unreg, 1);
});

test("old format and the state fallback are read", () => {
  let cbk;
  loadSettings({ controller_buttons: "back" });
  withSteam({ RegisterForControllerInputMessages: (f) => { cbk = f; return () => {}; } }, () => {
    cbk([{ nA: 44, bS: true }]);
    cbk([{ nA: 44, bS: false }]);
  });
  let st;
  withSteam({ RegisterForControllerStateChanges: (f) => { st = f; return () => {}; } }, () => {
    assert.equal(cb.controllerButtonsMethod(), "controller state");
    st([{ ulButtons: 0, ulUpperButtons: 1 << (45 - 32) }]);
    st([{ ulButtons: 0, ulUpperButtons: 0 }]);
  });
  withSteam({}, () => assert.equal(cb.controllerButtonsMethod(), ""));
});

test("a press runs the same action as the media key (R5 pauses), and nothing when off", () => {
  const { menuMusicControl } = require("../../src/audioPlayers/changeMenuMusic.ts");
  const el = { paused: false, ended: false, volume: 1, pause() { this.paused = true; } };
  const state = { getPublicState: () => ({ legacyEnabled: true, gamesRunning: [], selectedMusic: "P", menuMusic: el }) };
  let cbk;
  globalThis.SteamClient = { Input: { RegisterForControllerInputMessages: (f) => { cbk = f; return () => {}; } } };
  window.SteamClient = globalThis.SteamClient;
  const stopKeys = mk.startMediaKeys(state);
  const stop = cb.startControllerButtons();
  try {
    loadSettings({ controller_buttons: "off", media_keys: false });
    menuMusicControl.pausedByOtherPlugin = false;
    cbk(0, 33, true); cbk(0, 33, false);
    assert.equal(menuMusicControl.pausedByOtherPlugin, false);
    // works even with the media keys setting off
    loadSettings({ controller_buttons: "back", media_keys: false });
    cbk(0, 33, true);
    assert.equal(menuMusicControl.pausedByOtherPlugin, true);
  } finally { stop(); stopKeys(); menuMusicControl.pausedByOtherPlugin = false; }
});
