# SDH Audio Loader Encore

> **Unofficial fork** of [DeckThemes/SDH-AudioLoader](https://github.com/DeckThemes/SDH-AudioLoader) by EMERALD0874 and Beebles. All the original work belongs to them. This fork is **not** supported by the DeckThemes team. Please do not ask them about problems with it; open an issue here instead.

Custom Steam Deck UI sounds and menu music, with a full music player around it: shuffle modes, continuous playback, loudness normalizing, a muffled-music filter for menus and pop-ups, your Steam soundtracks, and songs from SoundCloud and YouTube.

- [Install](#install)
- [The side menu](#the-side-menu)
- [The Pack Manager](#the-pack-manager)
- [How the options work together](#how-the-options-work-together)
- [Good to know (disclaimers)](#good-to-know-disclaimers)
- [Status and testing](#status-and-testing)
- [Building](#building)
- [Credits and license](#credits-and-license)

## Install

Encore is not in the Decky plugin store, but Decky can install it from a link:

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. **Uninstall the original Audio Loader first** (in Decky's plugin list): the two would fight over the same sounds. Your packs and settings stay.
3. Decky menu > **Settings** (gear) > **General**: turn on **Developer Mode**.
4. Open the **Developer** page > **Install Plugin from URL**, paste this link and install:
   `https://github.com/jwvdqx/SDH-AudioLoader-Encore/releases/latest/download/Audio-Loader-Encore.zip`
5. If the plugin does not show up, restart Decky Loader or the Deck.

You can also download the zip from the [Releases page](../../releases) and copy the `Audio Loader Encore` folder into `/home/deck/homebrew/plugins/`.

Music needs **Enable Legacy Features** (Music tab) to be on.

## The side menu

Six tabs. Settings are grouped (groups open and close), and **Hide Descriptions** (Info tab) makes the menu shorter. Settings with a few choices are dropdowns.

### Music
- **Now Playing card**: the music, its credits (title, artist and cover for Steam tracks), a progress bar, **Up next**, and **Play/Pause**, **Skip** and **Play Mode** buttons.
- **Music Pack**, **Music Volume**, **Normalize Music Volume** and a **Library** button.
- **Normalize Music Volume**: every pack about equally loud, measured the way the ear hears it (LUFS: deep bass counts less, silence and quiet intros are left out). Quiet music is boosted (up to +20 dB, past the normal maximum), loud music turned down (up to -30 dB), and a gentle leveler evens out loud parts and keeps boosted music from distorting. Each song is measured once.
- **Rotation**
  - **New Music Every Day**: a different pack each day.
  - **Play Mode**: **Repeat** loops the music. **Shuffle** is random, but nothing from the last half of your library. **Smart Shuffle** also avoids recent packs and series (**Variety**: at 100, the last 75% of your library and the last 3 series) and plays favorites 3 times as often; large albums come up more than small ones (by the square root of their size). Skip follows the mode.
  - **Music by Time of Day**: a pack for the morning (5:00-11:59), afternoon (12:00-17:59) and night (18:00-4:59), played once when that part of the day begins.
- **Playback**
  - **Continuous Playback**: the music carries on where it left off after a game, after sleep, and after Steam restarts or the Deck is turned off and on. See [Good to know](#good-to-know-disclaimers).
  - **Controller Buttons**: the Deck's own buttons control the music while you are in Steam's menus (never in a game). **Back buttons**: L4 previous, R4 next, R5 play/pause. **Hold L5 + D-pad**: Left previous, Right next, Down play/pause. Encore reads the buttons straight from Steam, so nothing has to be set up in Steam Input. **Show Debug Info** says whether Steam offers the buttons.
  - **Media Keys Control the Music**: the **Next**, **Prev**, **Play** and **Stop** keys of a keyboard or Bluetooth headphones skip, go back, pause and resume. Media keys bound in Steam Input usually do not reach Steam's own screen; use Controller Buttons for the Deck's buttons.
  - **Show Now Playing Notifications**, **Wait for Startup Movie**, **Smooth Fades** (equal-power crossfades, so the loudness stays even while one music fades into the next).
  - **Lower the Music For**: notifications, a new audio device (headphones, Bluetooth), both, or nothing.
- **Battery & Sleep Timer**: **Battery Saver** (off, or pause below 10-50%) and a **Sleep Timer**.

### Steam Music
Every track of the Steam soundtracks you own and have downloaded (all library drives), grouped by soundtrack with cover, title, artist and track number. Pick a track to play it as menu music. Information comes from the files' tags (MP3, FLAC, Ogg, Opus, M4A), else from Steam's soundtrack name and the file names, else a placeholder (shown dimmed). A track in several formats is listed once. **Use in Random Picks** (off by default) lets the shuffle modes choose them. Nothing in the Steam folders is changed: Encore links to the files from its own folder.

### Sounds
**Sound Pack**, **Sound Volume**, **Normalize Sound Effect Volume** (with a limiter, so boosted packs do not distort) and a **Library** button.

### Effects: Muffled Music (low-pass filter)
The menu music is smoothly muffled while:
- **Menus**: the Steam menu, Quick Access, both, or **All menus** (also the power menu, the Options (≡) menus and any other menu on top of the screen; the on-screen keyboard and the volume indicator do not count).
- **Game Loading**: until the game has started and the music has stopped.
- **Pop-ups and Notifications**: dialogs, and for 3 seconds after a notification sound (all, or all but Encore's own Now Playing). The same list of notification sounds and the same 3 seconds are used by **Lower the Music For: Notifications**.
- **Volume Changes**: while you change the volume and a moment after. Separate from notifications: the volume indicator never counts as a pop-up or notification.
- **Microphone** (experimental): a moment after the microphone is switched on or off.

**Filter Strength** sets how muffled. Only Encore's music is filtered. The menus are read in Gaming Mode and in Big Picture Mode on the desktop.

### Library
A summary of your packs, the **Play Stats**, and buttons to **My Packs**, **Find Music** and **Browse New Packs**.

### Info
Installed version and **Check for Updates** (also automatic, at most every 6 hours; nothing is installed by itself), **Recent Music Decisions**, **Copy Debug Info** / **Show Debug Info**, and **Hide Descriptions**.

## The Pack Manager

Full screen, four pages, all in the same card style.

### My Packs
Every installed pack as a card (Music and Sounds sections): picture, name, author, version, plays, and badges (**Playing** / **Paused**, **In use**, ★ favorite, **Never pick**, **Update**, **SoundCloud** / **YouTube**). Buttons on each card: **Play now** or **Use these sounds**, **Favorite**, **Never pick automatically**, **Update**, **Details**, **Uninstall**. One row of options: search, **Type** (all, music, sounds), **Show** (favorites, never pick, updates, from Find Music, from the pack website, added by hand) and **Sort** (name A-Z or Z-A, author, most or least played, recently added). A **Steam Default Sounds** card switches back to Steam's own sounds.

### Find Music
Search **SoundCloud** or **YouTube** and add a song as a music pack.
- Off and greyed out until you press **Set Up Find Music**, which downloads **yt-dlp** (about 40 MB), a free open-source downloader, from its official GitHub releases (checksum checked). **Deno** (about 90 MB, needed for YouTube) is downloaded the first time you use YouTube. Both update themselves (once a day, and right away when a download fails), keep the previous version for **Undo**, and can be **Removed**.
- Options (dropdowns): **Per page** (5, 10, 20 or 50, up to 100 results), **Sort** (best match, shortest, longest, title, uploader, most viewed), **Length** and **Show** (everything, not added yet, can be added). Sorting and filters apply to the page shown.
- **Listen** plays a song before you add it (the menu music pauses meanwhile). **Download** fills in the details automatically and shows the card as it will look in My Packs, with **OK** and **Edit** (clear buttons per field, Clear All). Nothing is downloaded before OK.
- Page numbers like a search engine: moving down onto them selects the page you most likely want next (forward or back, following your direction). The last page hides a small surprise.
- Downloads run in the background, pause during games (unless **Keep Downloading While a Game Runs** is on) and continue afterwards. The same song is never added twice (Encore remembers each song's site and track id, whatever the link looked like).
- When a site changes and no yt-dlp version works, a warning explains that Encore depends on yt-dlp and is waiting for its fix. When YouTube asks to "confirm you're not a bot", a separate warning explains that it is a temporary block of the network. Encore never signs in to your accounts.

### Browse
The packs of [deckthemes.com](https://deckthemes.com): search, sort, type, and a details page to install or update a pack (and star it, with the optional account).

### Settings
**Storage** (how much space each part of Encore uses, with a bar for the drive and one for Encore, and a **Clean Up** that only deletes files that are safe to delete, after asking), the optional pack website account, and the credits.

## How the options work together
- **When the music starts again** (after a game, after waking, at startup): **Continuous Playback** first (the same music, from where it was), then **Time of Day** (once per part of the day), then **New Music Every Day**, then the **Play Mode**. When a song ends, the Play Mode picks what comes next.
- The play history and the Time of Day state are saved, so switching to Desktop Mode and back does not reset them. Settings and the place of the music are also saved the moment Steam shuts down (switching to Desktop Mode, turning off) or the Deck goes to sleep, so nothing changed just before is lost.
- While the music goes through Encore's audio chain (Normalize Music Volume or a muffled-music option is on), stopping it takes a very short fade so it never clicks.
- **Resuming** (after a game, the Play button or key, a preview, sleep, or when the music went silent) always carries on from the song and second where the music was, and checks that it is really heard. When Encore's audio chain (used by Normalize Music Volume and Muffled Music) lost its sound output, for example after sleep or when the audio device changed, Encore notices that its clock stands still and replaces it with a fresh one. As a last resort it plays the music without the chain, so there is always music. It leaves the music alone during games and when it was paused on purpose.

## Good to know (disclaimers)
- **Encore depends on Steam, SteamOS and Decky.** It reads Steam's menus, pop-ups, game launches, sleep and audio devices, and plays its music through Steam's screen. A Steam, SteamOS or Decky update can change any of that. When something stops working after an update, please open an issue with the **Copy Debug Info** text.
- **Continuous Playback** relies on how Steam pauses, sleeps and restarts. If an update changes that, the music simply starts from the beginning instead.
- **Find Music** depends on **yt-dlp** and on YouTube and SoundCloud, which change often. Encore keeps yt-dlp up to date, but there can be days where a site does not work until yt-dlp's team releases a fix. Only download music you have the right to use and follow the sites' terms. Songs stay on your Deck.
- **The microphone part of Muffled Music** depends on what Steam reports about its audio devices and is not confirmed on every Deck.

## Status and testing
Encore is used on one Steam Deck by its author and checked with automatic tests (run by every build) and simulated players. Parts that depend on Steam's own events are the most likely to need fixes.

Quick checklist:
1. Enable Legacy Features, pick a music pack: music plays. Info tab shows the version.
2. **Skip** on the Now Playing card switches music; in Shuffle, closing a game plays something else (with Continuous Playback, the same music carries on).
3. Sleep and wake the Deck: the music comes back.
4. Effects: set **Menus** to Both and press the Steam button: the music is muffled.
5. Library > **My Packs**: play a pack, favorite one, try the filters.
6. Library > **Find Music**: Set Up, search, Listen, Download > OK.
7. Steam Music: a downloaded soundtrack is listed and plays.

## Building
`pnpm install`, then `pnpm build` creates `dist/index.js`. `pnpm test` runs the automatic tests (JavaScript and Python). The GitHub Action in `.github/workflows/build.yml` tests, builds and collects the files the Deck needs, and attaches the zip to a published release. Changes per version are in [CHANGELOG.md](CHANGELOG.md), release texts in `docs/release-notes/`.

## Credits and license
Based on Audio Loader by SuchMeme, EMERALD0874 and Beebles. Encore changes by jwvdqx, made with the help of Claude (Anthropic). Pack creation guide: [docs.deckthemes.com](https://docs.deckthemes.com/#/AudioLoader/README).

**License:** the project is under the **MIT license**, like the original Audio Loader (its copyright notice is kept in `LICENSE`). `LICENSE` also contains the **BSD 3-Clause license of Steam Deck Homebrew**, which covers the parts that come from the plugin template the original was built from (the basic project and build setup); its terms require the notice to stay. Encore's own additions are MIT like the rest.
