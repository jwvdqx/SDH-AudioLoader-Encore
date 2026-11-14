# Audio Loader Encore

> **Unofficial fork** of [DeckThemes/SDH-AudioLoader](https://github.com/DeckThemes/SDH-AudioLoader) by EMERALD0874 and Beebles. All the original work belongs to them. This fork is **not** supported by the DeckThemes team. Please do not ask them about problems with it; open an issue here instead.

Encore adds new options to the "legacy" menu music of Audio Loader (turn on **Enable Legacy Features** in the plugin menu to see them). The menu has tabs: **Music**, **Sounds**, **Effects**, **Library** and **Info**, and the settings inside are grouped (the groups open and close, and **Hide Descriptions** in the Info tab makes the menu shorter).

**Music tab**
- **Now Playing card** at the top: the current pack and its credits, a **progress bar** with the time played and the length, an **Up next** line, and the **Pause/Play**, **Skip** and **play mode** buttons. The Up next music is chosen ahead of time and remembered, so it is what really plays when the music ends or when you press Skip. In Repeat mode it says the same music plays again, and a small line under it shows where Skip would go.
- **New Music Every Day**: picks a different music pack each day. Choosing "None" keeps the music off until the next day.
- **Play Mode** (Rotation group, and the button on the Now Playing card, which cycles through the modes): **Repeat** loops the current music. **Shuffle** is random: when the music ends, after a game closes, or after the Deck wakes up, a random pack plays, but nothing from the last half of your library (blocked packs are never picked, favorites get no extra weight). **Smart Shuffle** is the same, but it avoids recent packs and series (the **Variety** slider) and plays favorites more often. Skip also follows the mode. This replaces the old **New Music Every Replay** switch: if it was on, Encore starts in Smart Shuffle, which behaves exactly like before.
- **Variety** slider (shown in Smart Shuffle): 0 is completely random. Higher avoids packs played recently and packs from the same series (like several games of one franchise). At 100 it avoids everything played in the last 75% of your library (with 200 tracks, at least 150 others play before one comes back) and the last 3 series. Large albums come up more often than small ones (by the square root of their size), so the few tracks of a small album do not repeat over and over.
- **Music by Time of Day**: choose a music pack for the morning (5:00-11:59), afternoon (12:00-17:59) and night (18:00-4:59). It is used when the Deck starts or wakes up, and once when a new part of the day begins; after that the music shuffles as usual (before, every replay picked the same pack again, which sounded like a loop). A part of the day left on "Not set" follows the normal rules.
- **Show Now Playing Notifications**: an Encore popup with the music pack's name and credits whenever new music starts. Turn it off to suppress only these Now Playing popups; the Now Playing player card and all other Steam/Decky notifications are unaffected. A long pack name scrolls so it can be read completely.
- **Wait for Startup Movie**: the music waits until the startup or wake-up movie has finished.
- **Smooth Fades**: the music fades in when it starts, fades out when a game starts or you pause it, and blends into the next music.
- **Lower Music for Notifications**: briefly lowers the music when Steam plays a notification, message or achievement sound.
- **Soft Start for New Audio Device**: lowers the music for a moment when headphones or a Bluetooth speaker connect.
- **Battery Saver**: pauses the music when the battery is below a level you choose and the charger is not connected.
- **Sleep Timer**: stops the music after the time you set. It comes back when the Deck wakes up, a game closes, or you press Resume.

**Music tab** (below Music Volume)
- **Normalize Music Volume**: makes every music pack about equally loud. Loudness is measured the way the ear hears it (LUFS, the method streaming services use): deep bass counts less, and silence or quiet intros are left out, so they do not make a song look quieter than it is. Quiet music is boosted (up to +20 dB, even past the normal maximum volume) and loud music is turned down (up to -30 dB). A gentle leveler also evens out the loud parts inside a song and keeps boosted music from distorting. Each song is measured the first time it plays (a few seconds; the result is saved).

**Controller buttons for the music (media keys)**
- With **Media Keys Control the Music** on (Music tab > Playback, on by default), the keys **Next** (skip), **Prev** (the music before), **Play** (pause / resume) and **Stop** (pause) control the menu music.
- To put them on controller buttons: Steam Settings > Controller > **Guide Button Chord Layout** > Edit (works everywhere in Steam, with Steam held), or any game's controller layout. Pick a button, then **Keyboard > Numpad**: Play, Stop, Next, Prev. Example: Steam + R4 = Next, Steam + L4 = Play.
- Nothing happens while a game is running (the music is paused then, and the keys belong to the game).

**Steam Music tab**
- Lists every track of the Steam soundtracks you own and have downloaded (in `steamapps/music`, on the internal drive and on SD cards or other library drives). Download a soundtrack in Steam, then press **Scan Again**. The list is also refreshed each time the plugin starts.
- Tracks are grouped by soundtrack, with the cover, title, artist and track number. Pick a track to play it as menu music (Enable Legacy Features must be on). It then works with the other music options (Normalize Music Volume, Muffled Music, Now Playing, Smooth Fades...).
- The information comes from the files' tags (MP3, FLAC, Ogg Vorbis/Opus, M4A). Missing information is filled in from the soundtrack's Steam name, the folder and file names (like "03 - Boss Fight"), and otherwise a placeholder ("Unknown Artist", a generic cover). Filled-in values are shown dimmed. The cover is the picture inside the files, a picture in the soundtrack folder, or Steam's own picture of the soundtrack.
- When a soundtrack has the same track in several formats (MP3 and FLAC), it is listed once (the MP3).
- **Use in Random Picks**: off by default, so a large soundtrack collection does not crowd out your music packs. When on, Steam tracks can be chosen by New Music Every Day, Shuffle / Smart Shuffle and Skip.
- Nothing in the Steam folders is changed: Encore only makes links to the tracks in its own folder (`homebrew/sounds/steam_music_links`), because Steam's screen can only play files from there.

**Sounds tab**
- **Normalize Sound Effect Volume**: the same for sound packs, separate from the music. A limiter keeps boosted packs from distorting. Steam's own default sounds are not changed.

Settings from older versions: if the single **Normalize Volume** switch was on, both new switches start on. Songs measured by older versions are measured again once with the new method.

**Effects tab**
- **Muffled Music (Low-Pass Filter)**: seven separate toggles: **Steam Menu** (Steam button), **Quick Access Menu (...)**, **Game Loading** (from pressing play until the game has started and the music has stopped), **Pop-ups and Notifications** (while a pop-up such as a confirmation box is open, and for a few seconds when a notification comes in), **Skip Now Playing Notifications** (an extra switch: Encore's own Now Playing notification does not muffle the music, other notifications still do; it only matters when Pop-ups and Notifications is on), **Volume** (while the volume is being changed, and for 1.5 seconds after) and **Microphone** (for a moment, 1.5 seconds, each time the microphone is switched on or off or its volume changes; experimental, it reads Steam's audio devices twice a second). While one is active, the menu music is smoothly muffled; it opens up again a bit more slowly, so the change is not abrupt. A **Filter Strength** slider (0-100%) sets how muffled it is, and you hear the filter for a moment when you move it. Only Encore's menu music is filtered, not Steam's sound effects or the game.

**Library tab**
- A summary of your packs, and shortcuts to **My Packs** and **Browse New Packs**.

**My Packs** (first page of the Pack Manager)
- Every installed pack as a card, in a **Music** and a **Sounds** section: picture (from the pack website when it has one), name, author, version, how often it played, and badges for **Playing**, **In use**, **Favorite** (★), **Never pick** and **Update**.
- Quick buttons on each card: **Play now** (music) or **Use these sounds**, **Favorite** (comes up 3 times as often), **Never pick automatically** (you can still choose it by hand), **Update** (when a newer version exists), **Details**, and **Uninstall** (asks first). The selected button's name is shown on the card.
- Filter (All, Music, Sounds), sort (name, most played, least played) and search by name or author. A **Steam Default Sounds** card switches back to Steam's own sounds.
- This replaces the old Uninstall page, and the Favorites & Blocked dropdowns that were in the Library tab.
- **Play stats**: the most and least played packs.

**Info tab**
- **Updates**: shows the installed version and whether a newer release exists on GitHub (checked when the menu opens, at most every 6 hours, and you can turn it off). Nothing is installed automatically.
- **Recent Music Decisions**, **Copy Debug Info** and **Show Debug Info**: what the plugin decided lately (which music and why) and your settings, to paste when reporting a problem.

**Music after sleep**: the menu music did not come back after the Deck woke from sleep. Encore notices the wake-up and starts the music again. It also restarts the music if it should be playing but has gone silent, and it leaves it alone while a game is running or when another plugin paused it on purpose.

The toggles can be used together. With "New Music Every Day" on and a Shuffle mode chosen, the first music of a new day is the daily pick, and later replays rotate to other packs. Priority at startup and after waking: Time of Day, then Daily, then Replay. The Time of Day pack plays once per part of the day, even if you switch to Desktop Mode and back or the Deck sleeps. The play history is saved, so restarts do not reset it.

The two menu toggles of the low-pass filter read which side menu Steam has open. The game loading toggle uses Steam's game launch events; when the game process starts, the filter stays on until the music has stopped (at most 4 seconds), so the music is never heard unfiltered for a moment before it cuts. The pop-up toggle listens for Steam's "dialog opened/closed" and notification sounds and also looks for dialogs on the screen.

**No more pops when the music stops**: while the music goes through Encore's audio chain (when Normalize Music Volume or a low-pass toggle is on), stopping or pausing it always takes a very short fade (about 0.15 s), even with Smooth Fades off, so it does not click.

## Honest status
Encore is used and tested on one Steam Deck by its author, mainly the daily toggle, the sleep/wake fix and the new menu. Most other features were also checked with simulated players before release, so some of them may still behave differently on your Deck. Parts that depend on Steam's own events (menu and pop-up detection for the low-pass filter, game loading, battery, new audio devices, notification sounds, the startup movie wait) are the most likely to need fixes. Version 1.5.1 added the **Volume** and **Microphone** low-pass toggles: **Volume** is based on the sound Steam plays when the volume changes, but **Microphone** depends on what Steam reports about its audio devices and has not been confirmed on a real Deck (see the changelog). Version 1.3.1 fixed **Wait for Startup Movie**, which did not work in 1.3.0 (it is not confirmed on a real Deck yet), and 1.3.2 made the selected tab or group visible in the menu. If something does not work, please open an issue on GitHub, say which toggles you had on, and paste the **Copy Debug Info** text.

## Test checklist (for anyone trying Encore)
1. Install, turn on **Enable Legacy Features**, pick a music pack. Music plays.
2. Open the **Info** tab: the version is shown. Press **Show Debug Info**.
3. **Skip** (Now Playing card) switches to another pack.
4. Set **Play Mode** to Shuffle or Smart Shuffle (or press the mode button on the card), start and close a game: different music plays afterwards. The **Up next** line shows what comes next, and **Skip** plays exactly that. The progress bar moves while music plays. In Repeat the music loops.
5. Put the Deck to sleep and wake it: the music comes back.
6. **Effects** tab: turn on **Steam Menu**, press the Steam button: the music is muffled. Same for **Quick Access Menu (...)**, **Game Loading** and **Pop-ups and Notifications** (for example the "exit game?" confirmation box).
7. Turn on **Smooth Fades**: music fades in when it starts.
8. **Steam Music** tab: with a soundtrack downloaded in Steam, press **Scan Again**: its tracks are listed with cover and names. Pick one: it plays as menu music.
9. **Sleep Timer**: start a short timer (5 min): the music stops, and comes back after a wake-up or **Resume Music**.
10. Switch to Desktop Mode and back: the music should not be the same pack as before.

## Installation (from Decky Loader, no computer needed)
Encore is not in the Decky plugin store, but Decky can install it straight from a link:

1. Install [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
2. **Uninstall the original Audio Loader first** (in Decky's plugin list), because the two would fight over the same sounds. Your sound packs and settings stay where they are.
3. Open the Decky menu, go to **Settings** (the gear), then **General**, and turn on **Developer Mode**.
4. Open the new **Developer** page and choose **Install Plugin from URL**.
5. Paste this link and install: `https://github.com/jwvdqx/SDH-AudioLoader-Encore/releases/latest/download/Audio-Loader-Encore.zip`
6. Decky may ask you to confirm. Accept. If the plugin does not show up, restart Decky Loader or the Deck.

You can also download the zip from the [Releases page](../../releases) and copy the `Audio Loader Encore` folder into `/home/deck/homebrew/plugins/` yourself.

## Building it yourself
`pnpm install` and then `pnpm build` create `dist/index.js`. The GitHub Action in `.github/workflows/build.yml` does this automatically and collects the files the Deck needs. It also runs a small set of automatic tests first (`pnpm test`): music picking, volume math, saved settings and pack zip safety. If one fails, the build stops.

## Credits and license
Based on Audio Loader by EMERALD0874 and Beebles. Encore changes by jwvdqx, made with the help of Claude (Anthropic).

**Which license applies:** the whole project is released under the **MIT license**, the same as the original Audio Loader (the original copyright notice is kept in `LICENSE`). The `LICENSE` file also contains a second text, the **BSD 3-Clause license of Steam Deck Homebrew**. It belongs to the plugin template that the original Audio Loader was built from, so it covers the parts that come from that template (the basic project and build setup). It is kept because its terms require the notice to stay. It does not change the license of Encore's own additions, which are MIT like the rest.

---

# Original README (Audio Loader)
A plugin for the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) that allows users to replace Steam UI sounds and (eventually) add music when outside of a game.

# Overview
This plugin searches all folders in `/home/deck/homebrew/themes` for a `pack.json` file describing the music or sound pack. Users can install packs from the curated Pack Manager while connected to the internet or by manually adding folders (not recommended).

[Information on how to create, test, and upload a pack can be found here.](https://docs.deckthemes.com/#/AudioLoader/README)

# Installation
1. Install the [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader).
1. Use the bundled Plugin Store to download the Audio Loader.
