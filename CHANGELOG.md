# Changelog

All notable changes to Audio Loader Encore. Newest first.

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
