# Changelog

All notable changes to Audio Loader Encore. Newest first.

## 1.7.0

Performance. Includes 1.6.9 (never released on its own).

### Changed
- **The muffled-music watcher does far less.** It used to read Steam's menu state, look for dialogs on the
  screen and check the volume and microphone timers 4 times a second, all the time, including during
  games and with every muffled-music toggle off. Now:
  - with every muffled-music toggle off, it does not read anything;
  - while the music is not playing (a game is running, or it is paused), Steam's menu state and the
    screen are read every 2 seconds instead of 4 times a second, and the microphone is not read at
    all. The timers still end on time, and the first check after the music plays again is immediate.
- **Settings are saved in batches.** Changes made close together (dragging a slider, one action changing
  several settings) are merged and written once, 0.4 seconds later. Before, every slider step rewrote the
  whole settings file, which is over 100 KB with a large library, and forced it to disk. Waiting changes
  are written when the plugin is unloaded.
- **Pack lists open without resending everything.** Opening a pack list asked the backend for every pack
  again: about 600 KB for 1,000 Steam tracks. The backend now sends the list only when it changed, and an
  unchanged list no longer re-draws the menus or drops the chosen "Up next".

### Fixed (from 1.6.9)
- A damaged settings file no longer breaks the plugin: settings are written safely (temporary file, then
  swapped in), and a damaged file is kept as `config.json.broken` while the plugin starts with defaults.
- Uninstalling a pack that was already gone gave an error instead of a clear message.
- When Check for Updates fails inside the plugin, the error now says why.

## 1.6.9

### Fixed
- **A damaged settings file no longer breaks the plugin.** If `config.json` was cut off (for example by a
  power loss while it was being saved, which happens each time a track starts), the plugin could not load
  its settings, so the music never started, and the next save replaced the file with one setting, losing
  all the others. Settings are now saved safely (written to a temporary file, then swapped in), and a
  damaged file is kept as `config.json.broken` while the plugin starts with the default settings.
- Uninstalling a pack that was already gone gave an error instead of a clear message.
- When Check for Updates fails inside the plugin, the error now says why.

## 1.6.8

### Fixed
- **Check for Updates always failed.** The check crashed inside the plugin before it reached GitHub
  (it called another plugin method in a way Decky does not support), so the Info tab showed an error
  every time. It now works, and a test calls it exactly the way Decky does.

## 1.6.7

### Fixed
- **Too many repeats with a large library** (for example many Steam soundtrack tracks). In a test with 300
  tracks, the old rules repeated about 10 tracks in every 100 plays; now none do. Causes and fixes:
  - **Smart Shuffle** only avoided the last 12 packs, whatever the size of the library. At Variety 100 it now
    avoids the last 75% of the library (lower Variety avoids proportionally less). The saved play history
    now holds 600 entries instead of 30.
  - **Shuffle** had no memory at all. It is still random, but now skips everything from the last half of
    the library.
  - Every album (series) had the same chance, so each track of a 2-track album played up to 30 times more
    often than a track of a 60-track album. Albums now count by the square root of their size.
  - **Music by Time of Day** played its pack again every time Gaming Mode started (switching back from
    Desktop Mode) and after every wake-up. It now plays once per part of the day, and that is saved.

## 1.6.6

### Added
- **Skip Now Playing Notifications** (Effects tab, under Pop-ups and Notifications): a separate switch so
  that Encore's own Now Playing notification does not muffle the music. Other notifications (messages,
  achievements) still do. It only has an effect when **Pop-ups and Notifications** is on, and it is off by
  default. The Now Playing sound is recognised for 2.5 seconds after Encore shows its notification.
- Tests for it.

## 1.6.5

Everything since 1.6.1 (versions 1.6.2 to 1.6.4 were never released on their own).

### Fixed
- **Music looping by itself in the shuffle modes.** Two causes:
  - With **Music by Time of Day** on, every replay picked the time-of-day pack again, so the same
    music played over and over for the whole part of the day. Now that pack plays once when the part of
    the day starts (or when the Deck starts); after that the shuffle goes on. The **Up next** line and
    **Skip** follow the same rule.
  - If the music ended and the next one did not start by itself, the "music went silent" repair pressed
    play on the same, ended music again. In a shuffle mode it now starts the next music instead.
- **Muffled Music: Microphone** was rebuilt. The old version looked for a "muted" flag that Steam does not
  provide, so it most likely never worked. Now it reads the input side of Steam's audio devices twice a
  second (and right away when Steam announces a device or volume change). When something there changes
  (the microphone is switched on or off, muted, its volume or the chosen input changes), the music is
  muffled for 1.5 seconds, like the Volume toggle. It can never stay on by itself. The Decky log shows
  what Steam reports ("reading the microphone works (...)"), to help if it still does nothing. The
  microphone watcher also can no longer get stuck if Steam never answers one reading.
- Steam Music: a soundtrack with no playable tracks no longer leaves an empty folder of links behind.
- A wording fix in the Steam Music tab (it still named the old "New Music Every Replay").

### Changed
- **Faster pack lists:** opening a pack list (the Sound Pack dropdown, the Pack Manager pages) no longer
  looks through all Steam soundtrack folders every time. It is done at most every 30 seconds; **Scan Again**
  (Steam Music tab) always scans. This matters most when soundtracks are on a slow SD card.
- **Music by Time of Day** now plays its pack once for each part of the day instead of on every replay.

### Project
- More automatic tests (the build runs them): the muffled-music filter, the microphone detection, the
  Steam Music scan and its timing, and the time-of-day rule.
- Release notes moved to `docs/release-notes`, compiled Python files removed from the repository.

## 1.6.1

### Changed
- Renamed **Show Now Playing** to **Show Now Playing Notifications** and clarified its scope.
- Turning this option off suppresses only Encore's track-change Now Playing popups. The persistent Now Playing card remains visible, and unrelated Steam/Decky notifications are unaffected.
- The existing `show_now_playing` setting is retained, so saved preferences migrate without changes.

## 1.6.0

### Added
- **Progress bar** on the Now Playing card: time played, length and a bar. It is only shown when the music's length is known.
- **Up next** on the Now Playing card. The next music is now chosen ahead of time and remembered, so what
  the card shows is what plays when the music ends and what **Skip** plays. The choice is dropped when
  the music, the play mode, Variety, favorites, blocked packs or the installed packs change.
- **Play Mode** with three modes, as a button on the Now Playing card (cycles) and a dropdown in the
  Rotation group:
  - **Repeat**: loops the current music.
  - **Shuffle**: purely random. Blocked packs are never picked; favorites and Variety are ignored.
  - **Smart Shuffle**: random with Variety (avoids recent packs and series) and favorites. This is how
    "New Music Every Replay" always worked.
- Tests for the play modes, the settings migration and Up next.

### Changed
- **"New Music Every Replay" is replaced by Play Mode.** Saved settings are migrated: if the switch was on
  you start in Smart Shuffle (same behavior as before), otherwise in Repeat. The old
  `random_music_every_replay` key is still written, so nothing else changes.
- The **Variety** slider is only shown in Smart Shuffle (Shuffle ignores it).
- **Skip** now follows the play mode and uses the Up next choice (it used to always pick a new random
  pack). In Repeat mode it still goes to a different pack. With **Music by Time of Day** on, Skip goes to the
  chosen time-of-day pack when that is a different one.
- The Now Playing card refreshes twice a second (it was every 5 seconds) for the progress bar.
- New settings key: `play_mode` (`repeat`, `shuffle` or `smart`). **Copy Debug Info** shows the play mode.

### Known limits
- The progress bar is display only (no seeking).
- The progress bar shows the position in the current file; a pack's intro counts as its own part.

## 1.5.1

### Added
- **Muffled Music: Volume toggle** (Effects tab). The menu music is muffled while the volume is being
  changed (volume buttons or slider) and for 1.5 seconds after the last change, so it does not flutter
  while you press the buttons. It follows the sound Steam plays on every volume change
  (`deck_ui_volume.wav`).
- **Muffled Music: Microphone toggle** (Effects tab, experimental). The menu music is muffled while the
  microphone is on (not muted). Steam has no documented event for this, so the plugin reads Steam's audio
  devices about once a second, only while the toggle is on.
  - If the microphone state cannot be read, the plugin writes one line to the log ("could not read the
    microphone state") with the names of Steam's audio functions and a short sample of the device data.
    Open an issue and paste it, so the exact fields can be added.
- Both new toggles share the existing **Filter Strength** slider and the existing fade in/out.
- The new toggles are listed in **Copy Debug Info**.
- New settings keys: `low_pass_volume`, `low_pass_microphone` (both off by default). The existing
  `low_pass_popups` key is now also in the default settings (no change in behavior).

### Changed
- README: the low-pass filter now has six toggles, and the status section mentions what is unconfirmed.

### Known limits
- The Microphone toggle is not confirmed on a real Steam Deck yet.
- The Volume toggle only reacts to volume changes that make Steam play its volume sound.

## 1.5.0 and earlier

See the commit history. Highlights: New Music Every Day / Replay, Variety, Music by Time of Day,
Now Playing, Smooth Fades, Battery Saver, Sleep Timer, Steam Music, volume normalization, the four
original low-pass toggles (Steam Menu, Quick Access, Game Loading, Pop-ups), and the fix for music
not coming back after sleep.
