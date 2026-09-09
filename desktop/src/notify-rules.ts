export type NotifySettings = {
  /** The tray switch. Off silences everything, mentions included. */
  enabled: boolean;
  otherMessages: boolean;
  taskAssigned: boolean;
};

export type NotifyInput = {
  kind: "message" | "mention" | "task";
  /** Huly PersonId of the author, or null for events with no author. */
  authorId: string | null;
  channelId: string | null;
  mySocialId: string | null;
  activeChannelId: string | null;
  windowFocused: boolean;
  settings: NotifySettings;
};

/**
 * Whether this event is worth interrupting someone for.
 *
 * Four conditions overlap here, and getting it wrong is not symmetric: too
 * strict and people miss what they were told, too loose and the app becomes
 * the thing they mute. Pure, so it can be checked without an Electron window.
 */
export function shouldNotify(input: NotifyInput): boolean {
  if (!input.settings.enabled) return false;

  // Own messages come back down the same stream they were sent on.
  if (input.authorId !== null && input.authorId === input.mySocialId) return false;

  // Already reading it. Both halves matter: an open channel is not enough if
  // the window is behind something else.
  const readingThisChannel =
    input.channelId !== null &&
    input.channelId === input.activeChannelId &&
    input.windowFocused;
  if (readingThisChannel) return false;

  if (input.kind === "task") return input.settings.taskAssigned;
  // A mention is never silenced by the ordinary-message setting — being named
  // is the case that setting exists to let through.
  if (input.kind === "mention") return true;
  return input.settings.otherMessages;
}

// Runnable self-check (no test framework in this repo — the web app's
// mobion-mentions.ts uses the same pattern). Run with:
//   npx --yes tsx desktop/src/notify-rules.ts
if (require.main === module) {
  const assert = require("node:assert") as typeof import("node:assert");

  const on: NotifySettings = { enabled: true, otherMessages: true, taskAssigned: true };
  const base: NotifyInput = {
    kind: "message",
    authorId: "someone-else",
    channelId: "c1",
    mySocialId: "me",
    activeChannelId: "c2",
    windowFocused: false,
    settings: on,
  };

  // the ordinary case: someone else posted in a channel I am not looking at
  assert.strictEqual(shouldNotify(base), true);

  // my own message comes back down the stream it was sent on
  assert.strictEqual(shouldNotify({ ...base, authorId: "me" }), false);

  // the channel I am reading, with the window in front of me
  assert.strictEqual(
    shouldNotify({ ...base, activeChannelId: "c1", windowFocused: true }),
    false,
  );
  // same channel, but the window is behind something else — not reading it
  assert.strictEqual(
    shouldNotify({ ...base, activeChannelId: "c1", windowFocused: false }),
    true,
  );

  // "other messages" off silences ordinary posts
  assert.strictEqual(
    shouldNotify({ ...base, settings: { ...on, otherMessages: false } }),
    false,
  );
  // ...but never a mention
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", settings: { ...on, otherMessages: false } }),
    true,
  );
  // a mention in the channel already being read is still redundant
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", activeChannelId: "c1", windowFocused: true }),
    false,
  );

  // the tray master switch beats everything, mentions included
  assert.strictEqual(
    shouldNotify({ ...base, kind: "mention", settings: { ...on, enabled: false } }),
    false,
  );

  // a task has no channel; null === null must not count as "already reading"
  assert.strictEqual(
    shouldNotify({ ...base, kind: "task", channelId: null, activeChannelId: null }),
    true,
  );
  assert.strictEqual(
    shouldNotify({
      ...base,
      kind: "task",
      channelId: null,
      activeChannelId: null,
      settings: { ...on, taskAssigned: false },
    }),
    false,
  );

  console.log("notify-rules self-check passed");
}
