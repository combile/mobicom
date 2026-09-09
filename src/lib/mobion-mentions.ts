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

/**
 * Turns the "@이름" a person typed into the "@[id:이름]" that gets stored.
 *
 * The input box shows plain "@이름" while typing, because an <input> renders
 * text literally and putting the stored form in it means watching a uuid sit in
 * the middle of your own sentence. The id is attached here instead, on the way
 * out.
 *
 * Longest names first: with "김철" and "김철수" both in the lab, replacing the
 * short one first would eat the prefix of the long one and leave a stray "수".
 */
export function encodeMentions(text: string, users: { id: string; name: string }[]): string {
  const byLongestName = [...users].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const u of byLongestName) {
    // split/join rather than a regex: a name is arbitrary user text and would
    // otherwise need escaping to be safe as a pattern.
    out = out.split(`@${u.name}`).join(`@[${u.id}:${u.name}]`);
  }
  return out;
}

/**
 * Splits typed text into plain runs and "@이름" runs that match a real person.
 *
 * Used both to paint the mentions inside the input box and to decide what a
 * Backspace should swallow, so the highlight and the deletion can never
 * disagree about where a mention starts and ends.
 *
 * Longest names first, for the same reason encodeMentions sorts: with "김철"
 * and "김철수" present, the short name would otherwise match inside the long
 * one and highlight only half of it.
 */
export function splitTypedMentions(
  text: string,
  users: { id: string; name: string }[],
): { type: "text" | "mention"; content: string }[] {
  const names = [...users].map((u) => u.name).sort((a, b) => b.length - a.length);
  const out: { type: "text" | "mention"; content: string }[] = [];
  let buffer = "";

  for (let i = 0; i < text.length; ) {
    if (text[i] === "@") {
      const name = names.find((n) => text.startsWith(n, i + 1));
      if (name) {
        if (buffer) {
          out.push({ type: "text", content: buffer });
          buffer = "";
        }
        out.push({ type: "mention", content: `@${name}` });
        i += name.length + 1;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  if (buffer) out.push({ type: "text", content: buffer });
  return out;
}

/**
 * The "@이름" the caret is sitting immediately after, or null.
 *
 * A trailing space counts as part of it: selecting a mention inserts
 * "@이름 ", so one Backspace should undo exactly what one selection did.
 */
export function mentionEndingAt(
  textBeforeCaret: string,
  users: { id: string; name: string }[],
): string | null {
  const withoutTrailingSpace = textBeforeCaret.endsWith(" ")
    ? textBeforeCaret.slice(0, -1)
    : textBeforeCaret;
  const trailingSpace = textBeforeCaret.length - withoutTrailingSpace.length;

  const byLongestName = [...users].sort((a, b) => b.name.length - a.name.length);
  for (const u of byLongestName) {
    const token = `@${u.name}`;
    if (withoutTrailingSpace.endsWith(token)) return token + " ".repeat(trailingSpace);
  }
  return null;
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
  const assert = (await import("node:assert")).default as any;
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

  const lab = [
    { id: "u1", name: "김철" },
    { id: "u2", name: "김철수" },
  ];
  assert.strictEqual(encodeMentions("@김철수 확인 부탁", lab), "@[u2:김철수] 확인 부탁");
  assert.strictEqual(encodeMentions("@김철 확인", lab), "@[u1:김철] 확인");
  assert.strictEqual(encodeMentions("멘션 없음", lab), "멘션 없음");
  // a name that is not in the list stays plain text rather than becoming a
  // broken mention
  assert.strictEqual(encodeMentions("@없는사람 안녕", lab), "@없는사람 안녕");
  // round trip: what encode produces must be what parse understands
  assert.deepStrictEqual(parseMentionSegments(encodeMentions("@김철수!", lab)), [
    { type: "mention", userId: "u2", name: "김철수" },
    { type: "text", content: "!" },
  ]);
  // Backspace deletes a whole mention, so getting its length wrong eats
  // neighbouring characters — worth pinning down.
  assert.strictEqual(mentionEndingAt("안녕 @김철수 ", lab), "@김철수 ");
  assert.strictEqual(mentionEndingAt("안녕 @김철수", lab), "@김철수");
  assert.strictEqual(mentionEndingAt("안녕 @김철", lab), "@김철");
  // mid-name, not a real person: leave it to normal one-character deletion
  assert.strictEqual(mentionEndingAt("안녕 @김", lab), null);
  assert.strictEqual(mentionEndingAt("그냥 문장", lab), null);

  assert.deepStrictEqual(splitTypedMentions("@김철수 안녕", lab), [
    { type: "mention", content: "@김철수" },
    { type: "text", content: " 안녕" },
  ]);
  // the short name must not match inside the long one
  assert.deepStrictEqual(splitTypedMentions("@김철수", lab), [
    { type: "mention", content: "@김철수" },
  ]);
  assert.deepStrictEqual(splitTypedMentions("@없는사람", lab), [
    { type: "text", content: "@없는사람" },
  ]);

  console.log("mobion-mentions self-check passed");
}
