# Changelog

All notable changes to Audio Loader Encore. Newest first.

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
