// Continuous Playback: the jump to the remembered second is checked, and a long file is loaded whole.
const test = require("node:test");
const assert = require("node:assert/strict");
const python = require("../../src/python.ts");
const logs = [];
python.setServer({ callPluginMethod: (n, a) => { logs.push(JSON.stringify(a)); return Promise.resolve({ success: true, result: true }); } });
const s = require("../../src/audioPlayers/seekResume.ts");
const c = require("../../src/audioPlayers/continuous.ts");
const T = { pollMs: 5, fallbackMs: 30, giveUpMs: 200 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function player({ duration = 3600, reach = 3600, src = "https://steamloopback.host/sounds_custom/P/mix.mp3" } = {}) {
  const el = {
    src, duration, paused: false, muted: false, _t: 0, listeners: {},
    seekable: { get length() { return 1; }, start: () => 0, end: () => el._reach },
    _reach: reach,
    get currentTime() { return this._t; },
    // a jump the file server cannot reach starts over at 0
    set currentTime(v) { this._t = v <= this._reach ? v : 0; },
    addEventListener(n, f) { (this.listeners[n] ||= []).push(f); },
    removeEventListener(n, f) { this.listeners[n] = (this.listeners[n] || []).filter((x) => x !== f); },
    play() { return Promise.resolve(); },
  };
  return el;
}

test("a reachable second is jumped to, the player is silent meanwhile, the place is kept", async () => {
  const el = player();
  s.seekToResume(el, 1800, "mix.mp3", null, T);
  assert.equal(el.muted, true);
  assert.equal(c.positionOf(el, "P").time, 1800);
  await wait(30);
  assert.equal(el.currentTime, 1800);
  assert.equal(el.muted, false);
  assert.equal(el.alResumeAt, undefined);
});

test("an unreachable second: tried again while the file loads", async () => {
  const el = player({ reach: 100 });
  s.seekToResume(el, 1800, "mix.mp3", null, T);
  await wait(15);
  assert.notEqual(el.currentTime, 1800);
  assert.equal(c.positionOf(el, "P").time, 1800, "the place is not lost while waiting");
  el._reach = 3600; // more of the file loaded
  await wait(20);
  assert.equal(el.currentTime, 1800);
});

test("the whole file is loaded when the server never lets it jump, and the file name stays", async () => {
  const el = player({ reach: 10 });
  globalThis.fetch = async () => ({ ok: true, blob: async () => "BLOB" });
  globalThis.URL.createObjectURL = () => "blob:abc";
  globalThis.URL.revokeObjectURL = () => {};
  const realSet = Object.getOwnPropertyDescriptor(el, "src");
  let srcValue = el.src;
  Object.defineProperty(el, "src", { get: () => srcValue, set: (v) => { srcValue = v; if (v.startsWith("blob:")) el._reach = 3600; } });
  s.seekToResume(el, 1800, "mix.mp3", null, T);
  await wait(80);
  assert.equal(el.src, "blob:abc");
  assert.equal(el.currentTime, 1800);
  assert.equal(c.fileOf(el), "mix.mp3");
  s.freeWholeFile(el);
  assert.equal(el.alBlobUrl, "");
  void realSet;
});

test("gives up in the end and lets the music be heard", async () => {
  const el = player({ reach: 10 });
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  s.seekToResume(el, 1800, "mix.mp3", null, T);
  await wait(260);
  assert.equal(el.muted, false);
  assert.equal(el.alResumeAt, undefined);
});

test("the very end of the song: the next one comes", async () => {
  const el = player({ duration: 100 });
  let over = 0;
  s.seekToResume(el, 99.5, "mix.mp3", () => over++, T);
  await wait(20);
  assert.equal(over, 1);
});

test("a stopped player is left alone", async () => {
  const el = player({ reach: 10 });
  el.alStopped = true;
  s.seekToResume(el, 1800, "mix.mp3", null, T);
  await wait(20);
  assert.equal(el.alResumeAt, undefined);
});
