## Audio Loader Encore v1.5.1

New in **Effects → Muffled Music (Low-Pass Filter)**:

- **Volume**: the music is muffled while you change the volume, and for a moment after.
- **Microphone** *(experimental)*: the music is muffled while the microphone is on.

Both use the existing Filter Strength slider and are off by default.

**Please test the Microphone toggle** and report back. It depends on Steam's undocumented audio API.
If it does nothing, open an issue and paste the log line that starts with
"Low-pass filter: could not read the microphone state", plus **Copy Debug Info** from the Info tab.

Install from Decky: Developer mode → Install Plugin from URL →
`https://github.com/jwvdqx/SDH-AudioLoader-Encore/releases/latest/download/Audio-Loader-Encore.zip`

Full list of changes: see CHANGELOG.md.
