export const MENTION_REGEX = /@\[([^:]+):([^\]]+)\]/g;

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "mention"; userId: string; name: string };

export function parseMentionSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", userId: match[1], name: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }
  return segments;
}

export function messageContainsMentionOf(text: string, userId: string): boolean {
  return parseMentionSegments(text).some(
    (s) => s.type === "mention" && s.userId === userId,
  );
}

/**
 * Finds the in-progress "@query" the caret is currently inside of — e.g.
 * typing "hi @eun" with the caret at the end returns { start: 3, query: "eun" }.
 * Returns null when the caret isn't inside an @-trigger: no "@" found before
 * it on the current word, or the word already contains whitespace or a
 * closed mention marker's "]".
 */
export function detectMentionTrigger(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;
  const between = upToCaret.slice(at + 1);
  if (/[\s\]]/.test(between)) return null;
  return { start: at, query: between };
}

// Runnable self-check (no test framework in this repo — run directly with
// `node --experimental-strip-types src/lib/mobion-mentions.ts`). Guarded with
// `typeof process !== "undefined"` because this module is also imported by
// client components and bundled for the browser, where `process` may be
// absent or a stub with no `argv` — the check must stay false there, never throw.
if (typeof process !== "undefined" && process.argv?.[1] && import.meta.url === `file://${process.argv[1]}`) {
  const assert: typeof import("node:assert").strict = (await import("node:assert")).strict;
  assert.deepStrictEqual(parseMentionSegments("no mentions here"), [
    { type: "text", content: "no mentions here" },
  ]);
  assert.deepStrictEqual(parseMentionSegments("hi @[u1:철수]!"), [
    { type: "text", content: "hi " },
    { type: "mention", userId: "u1", name: "철수" },
    { type: "text", content: "!" },
  ]);
  assert.deepStrictEqual(parseMentionSegments("@[a:x]@[b:y]"), [
    { type: "mention", userId: "a", name: "x" },
    { type: "mention", userId: "b", name: "y" },
  ]);
  assert.strictEqual(messageContainsMentionOf("hi @[u1:철수]", "u1"), true);
  assert.strictEqual(messageContainsMentionOf("hi @[u1:철수]", "u2"), false);
  assert.deepStrictEqual(detectMentionTrigger("hi @eun", 7), { start: 3, query: "eun" });
  assert.strictEqual(detectMentionTrigger("hi @eun there", 13), null);
  assert.strictEqual(detectMentionTrigger("no trigger", 5), null);
  console.log("mobion-mentions self-check passed");
}
