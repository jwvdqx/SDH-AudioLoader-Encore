// Saving the settings: changes close together are merged into one write.
const test = require("node:test");
const assert = require("node:assert/strict");
const python = require("../../src/python.ts");

test("many changes in a row (a slider being dragged) become one save with the last values", async () => {
  const calls = [];
  python.setServer({ callPluginMethod: (name, args) => { calls.push([name, args]); return Promise.resolve({ success: true }); } });
  for (let i = 0; i <= 20; i++) python.setConfig({ music_volume: i / 20 });
  python.setConfig({ sound_volume: 0.4 });
  const done = python.setConfig({ smooth_fades: true });
  assert.equal(calls.length, 0, "nothing is written right away");
  await done;
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["set_config", { configObj: { music_volume: 1, sound_volume: 0.4, smooth_fades: true } }]);
});

test("flushConfig writes waiting changes at once (used when the plugin is unloaded)", async () => {
  const calls = [];
  python.setServer({ callPluginMethod: (name, args) => { calls.push(args); return Promise.resolve({ success: true }); } });
  python.setConfig({ a: 1 });
  await python.flushConfig();
  assert.deepEqual(calls, [{ configObj: { a: 1 } }]);
  await python.flushConfig();
  assert.equal(calls.length, 1, "nothing left to write");
});
