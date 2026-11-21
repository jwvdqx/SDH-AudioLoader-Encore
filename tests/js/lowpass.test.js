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

// ---- 2.0.1: the chat and friends sounds are notifications too ----

test("pop-ups: the chat and friends sounds (.m4a) muffle the music like the toasts do", async () => {
  lp.configureMusicLowPass({ ...base, popups: true });
  for (const name of ["steam_chatroom_notification.m4a", "steam_at_mention.m4a", "ui_steam_smoother_friend_online.m4a"]) {
    lp.lowPassForSound(name);
    assert.equal(lp.shouldFilter(), true, name);
    await tick(4000);
    assert.equal(lp.shouldFilter(), false, `${name} ends by itself`);
  }
  lp.configureMusicLowPass(base);
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

// ---- 2.0.3: all menus, the volume indicator, Big Picture windows ----

test("the focused tree is sorted into main screen, keyboard or a menu on top", () => {
  assert.equal(lp.classifyFocusedTree("root_1_"), "main");
  assert.equal(lp.classifyFocusedTree("VirtualKeyboard_3"), "keyboard");
  assert.equal(lp.classifyFocusedTree("ContextMenu_power"), "other");
  assert.equal(lp.classifyFocusedTree(undefined), null);
});

// A fake piece of Steam's screen: elements that know their parent, and a document with a focused element
function fakeScreen() {
  const doc = { activeElement: null, hasFocus: () => true };
  const el = (parent) => {
    const e = { parentElement: parent, ownerDocument: doc, getBoundingClientRect: () => ({ width: 100, height: 100 }) };
    e.contains = (x) => { for (let n = x; n; n = n.parentElement) if (n === e) return true; return false; };
    return e;
  };
  const body = el(null);
  const main = el(body);
  const page = el(main); // a page inside the main screen, with a tree of its own
  const powerMenu = el(body); // drawn on top, outside the main screen
  const keyboard = el(body);
  const trees = [
    { m_ID: "root_1_", Root: { Element: main } },
    { m_ID: "LibraryPage", Root: { Element: page } },
    { m_ID: "PowerMenu", Root: { Element: powerMenu } },
    { m_ID: "VirtualKeyboard", Root: { Element: keyboard } },
  ];
  return { doc, main, page, powerMenu, keyboard, trees };
}

test("All menus: the power menu muffles; pages of the main screen and the keyboard do not", async () => {
  const sc = fakeScreen();
  global.window = global.window || {};
  const oldNav = window.FocusNavController;
  window.FocusNavController = { m_ActiveContext: { m_rgGamepadNavigationTrees: sc.trees } };
  const oldStore = window.SteamUIStore;
  window.SteamUIStore = { WindowStore: { GamepadUIMainWindowInstance: { MenuStore: { GetOpenSideMenu: () => 0 } } } };
  lp.setMusicLowPassPlayer({ paused: false, ended: false, volume: 1 });
  lp.configureMusicLowPass({ ...base, otherMenus: true });

  sc.doc.activeElement = sc.page;
  await tick(300);
  assert.equal(lp.shouldFilter(), false, "a page of the main screen is not a menu");
  sc.doc.activeElement = sc.powerMenu;
  await tick(300);
  assert.equal(lp.shouldFilter(), true, "the power menu muffles the music");
  sc.doc.activeElement = sc.keyboard;
  await tick(300);
  assert.equal(lp.shouldFilter(), false, "the on-screen keyboard does not");
  // the volume indicator never counts as a menu
  sc.doc.activeElement = sc.powerMenu;
  lp.lowPassForSound("deck_ui_volume.wav");
  await tick(300);
  assert.equal(lp.shouldFilter(), false, "while the volume changes, nothing on top counts (Volume Changes is off)");
  await tick(2000);
  assert.equal(lp.shouldFilter(), true);
  sc.doc.activeElement = sc.main;
  await tick(300);
  assert.equal(lp.shouldFilter(), false);

  lp.configureMusicLowPass(base);
  lp.setMusicLowPassPlayer(null);
  window.FocusNavController = oldNav;
  window.SteamUIStore = oldStore;
});

test("the side menus are also read from Big Picture's window (Desktop Mode)", () => {
  global.window = global.window || {};
  const oldStore = window.SteamUIStore;
  window.SteamUIStore = {
    WindowStore: {
      GamepadUIMainWindowInstance: undefined,
      SteamUIWindows: [{ MenuStore: { GetOpenSideMenu: () => 0 } }, { MenuStore: { GetOpenSideMenu: () => 2 } }],
    },
  };
  assert.equal(lp.readOpenSideMenu(), 2);
  window.SteamUIStore = { WindowStore: { SteamUIWindows: [{ MenuStore: { GetOpenSideMenu: () => 0 } }] } };
  assert.equal(lp.readOpenSideMenu(), 0);
  window.SteamUIStore = oldStore;
});

test("Volume Changes is independent of notifications", async () => {
  lp.configureMusicLowPass({ ...base, popups: true });
  lp.lowPassForSound("deck_ui_volume.wav");
  assert.equal(lp.shouldFilter(), false, "a volume change is not a notification");
  await tick(5000); // the volume change above is over
  lp.configureMusicLowPass({ ...base, volume: true });
  lp.lowPassForSound("deck_ui_toast.wav");
  assert.equal(lp.shouldFilter(), false, "a notification is not a volume change");
  lp.lowPassForSound("deck_ui_volume.wav");
  assert.equal(lp.shouldFilter(), true);
  lp.configureMusicLowPass(base);
  await tick(5000);
});

test("Gaming Mode's full-screen root is the main screen, not a menu (the muffle got stuck there)", async () => {
  assert.equal(lp.classifyFocusedTree("GamepadUI_Full_Root"), "main");
  assert.equal(lp.classifyFocusedTree("MainNavMenuContainer"), "other");
  // a tree that holds the main screen counts as the main screen too
  const sc = fakeScreen();
  const fullRoot = { m_ID: "SomeFutureRoot", Root: { Element: sc.main.parentElement } };
  global.window = global.window || {};
  const oldNav = window.FocusNavController;
  const oldStore = window.SteamUIStore;
  window.FocusNavController = { m_ActiveContext: { m_rgGamepadNavigationTrees: [...sc.trees, fullRoot] } };
  window.SteamUIStore = { WindowStore: { GamepadUIMainWindowInstance: { MenuStore: { GetOpenSideMenu: () => 0 } } } };
  sc.doc.hasFocus = () => false; // the focus is not inside the main screen's document check
  sc.doc.activeElement = sc.main.parentElement; // focus on the full-screen root itself
  lp.setMusicLowPassPlayer({ paused: false, ended: false, volume: 1 });
  lp.configureMusicLowPass({ ...base, otherMenus: true });
  await tick(300);
  assert.equal(lp.shouldFilter(), false);
  lp.configureMusicLowPass(base);
  lp.setMusicLowPassPlayer(null);
  window.FocusNavController = oldNav;
  window.SteamUIStore = oldStore;
});
