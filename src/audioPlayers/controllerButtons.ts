import * as python from "../python";
import { settings } from "../settings";
import { MediaAction, runMusicAction } from "./mediaKeys";

// Controller buttons for the music: Encore reads the Deck's buttons itself (Steam Input's media keys do
// not reach Steam's screen in Gaming Mode). Steam only sends button events to its own screen while the
// Steam UI has the focus (never during a game), which is exactly when the menu music plays.
//
// Steam's input API changed between versions, so both message formats are read:
//   - newer builds call back with (controllerIndex, buttonId, pressed)
//   - older builds call back with a list of { nA: buttonId, bS: pressed }
//   - without that API, the older RegisterForControllerStateChanges (button bit masks) is used
// Button ids are Steam's EGamepadButton numbers. After sleep Steam stops sending the events, so the
// listening is started again after a wake-up.

export type ButtonPreset = "off" | "back" | "l5dpad";

const BTN = {
  L5: 32,
  R5: 33,
  L4: 44,
  R4: 45,
  // the D-pad: newer builds send 20-23, older ones 4-7
  UP: [20, 4],
  DOWN: [21, 6],
  LEFT: [22, 7],
  RIGHT: [23, 5],
};

/** What a press does with the chosen preset (held: the buttons held at that moment). null: nothing. */
export function actionFor(preset: ButtonPreset, button: number, held: Set<number>): MediaAction | null {
  if (preset === "back") {
    if (button === BTN.L4) return "previous";
    if (button === BTN.R4) return "next";
    if (button === BTN.R5) return "playpause";
    return null;
  }
  if (preset === "l5dpad" && held.has(BTN.L5)) {
    if (BTN.LEFT.includes(button)) return "previous";
    if (BTN.RIGHT.includes(button)) return "next";
    if (BTN.DOWN.includes(button)) return "playpause";
  }
  return null;
}

const held = new Set<number>();
let registration: any = null;
let how = "";

function onButton(button: number, down: boolean): void {
  if (!down) {
    held.delete(button);
    return;
  }
  if (held.has(button)) return; // still held: a press counts once
  held.add(button);
  const preset = (settings.controller_buttons || "off") as ButtonPreset;
  const action = preset === "off" ? null : actionFor(preset, button, held);
  if (action) runMusicAction(action, "controller");
}

function unregister(): void {
  try {
    if (typeof registration === "function") registration();
    else registration?.unregister?.();
  } catch {
    // already gone
  }
  registration = null;
  held.clear();
}

/** Starts listening (again). Returns how it listens, or "" when Steam offers no way. */
function register(): string {
  unregister();
  const input = (window as any).SteamClient?.Input ?? (globalThis as any).SteamClient?.Input;
  try {
    if (typeof input?.RegisterForControllerInputMessages === "function") {
      registration = input.RegisterForControllerInputMessages((...args: any[]) => {
        if (Array.isArray(args[0])) {
          for (const m of args[0]) if (m && typeof m.nA === "number") onButton(m.nA, !!m.bS);
        } else if (typeof args[1] === "number") {
          onButton(args[1], !!args[2]);
        }
      });
      return "input messages";
    }
    if (typeof input?.RegisterForControllerStateChanges === "function") {
      let last = new Set<number>();
      registration = input.RegisterForControllerStateChanges((changes: any[]) => {
        for (const c of changes || []) {
          const now = new Set<number>();
          const lower = Number(c?.ulButtons) >>> 0;
          const upper = Number(c?.ulUpperButtons) >>> 0;
          for (let b = 0; b < 32; b++) {
            if (lower & (1 << b)) now.add(b);
            if (upper & (1 << b)) now.add(b + 32);
          }
          now.forEach((b) => !last.has(b) && onButton(b, true));
          last.forEach((b) => !now.has(b) && onButton(b, false));
          last = now;
        }
      });
      return "controller state";
    }
  } catch (e) {
    python.logEvent(`Controller buttons: could not listen: ${e}`);
  }
  return "";
}

/** Starts the controller buttons. Returns a function that stops them. */
export function startControllerButtons(): () => void {
  how = register();
  python.logEvent(how ? `Controller buttons: listening (${how})` : "Controller buttons: Steam offers no way to read the buttons here");
  // After sleep Steam stops sending the events: listen again after a wake-up (a long gap between ticks)
  let lastTick = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    if (now - lastTick > 30000 && how) {
      register();
      python.logEvent("Controller buttons: listening again after a wake-up");
    }
    lastTick = now;
  }, 10000);
  return () => {
    clearInterval(timer);
    unregister();
  };
}

/** For the debug info: how the buttons are read ("" when they cannot be). */
export function controllerButtonsMethod(): string {
  return how;
}
