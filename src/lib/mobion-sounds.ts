"use client";

/**
 * Notification sounds.
 *
 * Served from public/ rather than bundled into the desktop shell: the window
 * loads a remote page, and a remote page cannot read files off the local disk.
 * Coming from the same origin as everything else, they also work in a plain
 * browser tab once the person has interacted with it.
 */

export type ChatSound = "message" | "mention" | "task" | "error" | "sent" | "reconnected";

const SOUND_FILES: Record<ChatSound, string> = {
  message: "/sounds/message.mp3",
  mention: "/sounds/mention.mp3",
  task: "/sounds/task.mp3",
  error: "/sounds/error.mp3",
  sent: "/sounds/sent.mp3",
  reconnected: "/sounds/reconnected.mp3",
};

const STORAGE_KEY = "mobion-sound-muted";

// One Audio element per sound, reused. Creating a new one per play leaks
// elements in long-lived tabs, and this app is meant to stay open all day.
const cache = new Map<ChatSound, HTMLAudioElement>();

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // Private windows and blocked site data throw on access; not being able to
    // read the preference is not a reason to go silent.
    return false;
  }
}

export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(muted));
  } catch {
    // Nothing to do — the setting simply will not survive a reload.
  }
}

/**
 * Plays a sound, unless muted.
 *
 * Failures are swallowed deliberately. A browser that refuses to play before
 * the person has clicked anything (autoplay policy), a missing file, a device
 * with no audio output — none of these are worth an error in front of someone
 * who was just told they have a new message.
 */
export function playChatSound(sound: ChatSound): void {
  if (typeof window === "undefined" || isMuted()) return;

  let audio = cache.get(sound);
  if (!audio) {
    audio = new Audio(SOUND_FILES[sound]);
    audio.preload = "auto";
    cache.set(sound, audio);
  }

  // Rewind rather than waiting: two messages arriving a second apart should
  // both be heard, and the second would otherwise be dropped while the first
  // is still playing.
  audio.currentTime = 0;
  void audio.play().catch(() => {});
}
