// The Now Playing notification switch must silence only Encore's track-change toast.
const test = require("node:test");
const assert = require("node:assert/strict");
const python = require("../../src/python.ts");
const notifications = [];
const originalToast = python.toast;
python.toast = (...args) => notifications.push(args);

const { nowPlayingSettings, announceMusic } = require("../../src/audioPlayers/nowPlaying.tsx");

test("disabling Now Playing notifications suppresses only those popups", () => {
  const pack = { name: "Pack", author: "Test Author", music: true, mappings: {} };

  nowPlayingSettings.enabled = false;
  announceMusic(pack);
  assert.equal(notifications.length, 0, "disabled Now Playing notifications must not create a toast");

  // Other plugin notifications use python.toast directly and are not gated by this setting.
  python.toast("Other plugin message", "This notification must still appear.");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], "Other plugin message");

  nowPlayingSettings.enabled = true;
  announceMusic(pack);
  assert.equal(notifications.length, 2, "enabling the option should restore the Now Playing toast");
  assert.equal(notifications[1][0], "Now Playing: Pack");

  nowPlayingSettings.enabled = false;
  python.toast = originalToast;
});
