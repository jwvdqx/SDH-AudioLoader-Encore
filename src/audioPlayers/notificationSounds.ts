// One list of the Steam sounds that announce a notification. Both "Lower the Music For: Notifications"
// (fade.ts) and "Muffled Music: Pop-ups and Notifications" (lowPass.ts) use it, so they can never
// disagree about what counts as a notification.
export const NOTIFICATION_SOUNDS: ReadonlySet<string> = new Set([
  // toasts (.wav)
  "deck_ui_toast.wav",
  "deck_ui_message_toast.wav",
  "deck_ui_achievement_toast.wav",
  // chat and friends (.m4a)
  "steam_at_mention.m4a",
  "steam_chatroom_notification.m4a",
  "ui_steam_message_old_smooth.m4a",
  "ui_steam_smoother_friend_join.m4a",
  "ui_steam_smoother_friend_online.m4a",
]);

// Encore's own Now Playing notification plays Steam's notification sound a moment after it is shown.
// That sound is not a notification from outside: neither the muffling nor the ducking should react to it.
export const NOW_PLAYING_SOUND_WINDOW_MS = 2500;
let ownToastUntil = 0;

/** Call right before Encore shows its own Now Playing notification. */
export function markOwnToast(): void {
  ownToastUntil = Date.now() + NOW_PLAYING_SOUND_WINDOW_MS;
}

/** True while the sound of Encore's own Now Playing notification may still be playing. */
export function ownToastSoundExpected(): boolean {
  return Date.now() < ownToastUntil;
}
