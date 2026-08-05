# Mobi:ON Slack-style Sidebar + Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Mobi:ON's chat sidebar into 채널/직접 메시지 sections with live online-status dots, add an `@` mention feature (autocomplete while typing, highlighted rendering, self-mention row highlight), and group consecutive same-author messages into a compact Slack-style block.

**Architecture:** Presence reuses Huly's existing `core:class:UserStatus` docs through the chat feature's single existing SSE connection (`src/app/api/mobion/chat/stream/route.ts`) — no new endpoints or polling. Mentions are plain `@[userId:이름]` markers embedded directly in the message text sent to Huly (no schema change); parsing/formatting logic lives in a new framework-free `src/lib/mobion-mentions.ts`, consumed by a new `src/components/MentionInput.tsx` (composer autocomplete) and by `MobiOnContent.tsx` (rendering). Message grouping is a pure client-side render transform with no data model change.

**Tech Stack:** Next.js App Router, React, Emotion `styled`, Huly `@hcengineering/*` client libraries already wired through `mobion-huly.ts`. No new npm dependencies.

## Global Constraints

- No new npm dependencies — everything here uses what's already installed.
- Every new user-facing string is Korean, matching every other feature in this app.
- Mention marker format is exactly `@[userId:이름]`, parsed with `/@\[([^:]+):([^\]]+)\]/g` — `userId` is `mobion_users.id` (mobicom's own id), not a Huly account id.
- Mention autocomplete's data source is `GET /api/mobion/users/all` (unfiltered — includes professors and non-Huly-linked users), **not** `GET /api/mobion/users` (which excludes both).
- Self-mention row highlight color is `rgba(0, 181, 255, 0.08)` — the site's existing accent color at low opacity.
- Message grouping window is 5 minutes (`5 * 60 * 1000` ms), grouped by matching `authorId` only.
- Presence has zero new real-time infrastructure — it rides the existing `/api/mobion/chat/stream` SSE connection only.
- After every task: run `npx tsc --noEmit -p tsconfig.json` and expect no errors before committing.

---

### Task 1: Presence — SSE stream backend (Huly `UserStatus`)

**Files:**
- Modify: `src/lib/mobion-huly.ts` (add `CORE_CLASS` export, near `CHUNTER_CLASS` at line 15-19)
- Modify: `src/app/api/mobion/chat/stream/route.ts`

**Interfaces:**
- Produces: `CORE_CLASS.UserStatus` (string `"core:class:UserStatus"`), exported from `mobion-huly.ts` alongside `CHUNTER_CLASS`.
- Produces: a new SSE event type `presence` with payload `{ channelId: string; online: boolean }`, where `channelId` is a DM channel's id.
- Produces: the `snapshot` event's `channels` array now includes `online: boolean` on every entry with `kind: "dm"` (channel entries are unaffected).

- [ ] **Step 1: Add the `CORE_CLASS` export to `mobion-huly.ts`**

Insert immediately after the existing `CHUNTER_CLASS` block (after line 19, `} as const;`):

```ts
// core plugin's own top-level class (not chunter-specific) for presence status,
// confirmed by reading @hcengineering/core/src/classes.ts (`UserStatus extends Doc
// { online: boolean; user: AccountUuid }`) and component.ts (`coreId = 'core'`,
// `UserStatus` inside the `core` plugin's class map) — same `${pluginId}:${category}:${Key}`
// id pattern as CHUNTER_CLASS above.
export const CORE_CLASS = {
  UserStatus: "core:class:UserStatus",
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Import `CORE_CLASS` in the stream route and add the `UserStatusDoc` type**

In `src/app/api/mobion/chat/stream/route.ts`, change the import on line 2:

```ts
import { getWorkspaceClient, CHUNTER_CLASS, CORE_CLASS } from "@/lib/mobion-huly";
```

Add a new type after the existing `ChatMessage` type (after line 25):

```ts
type UserStatusDoc = { _id: string; user: string; online: boolean };
```

Extend `RawTx`'s `attributes` field (lines 38-44) to add the two fields a `UserStatus` tx can carry:

```ts
  attributes?: {
    message?: string;
    name?: string;
    description?: string;
    private?: boolean;
    members?: string[];
    online?: boolean;
    user?: string;
  };
```

Add a new helper function after `isNewChannel` (after line 70):

```ts
// A UserStatus doc's `online` flag can change via either TxCreateDoc (the first
// time this account's status doc is created) or TxUpdateDoc (an existing doc's
// `online` flipping) — unlike chat messages and channels, which only ever
// arrive as TxCreateDoc. Unverified against the live server until this task's
// manual verification step below; if the live shape differs, adjust the
// attribute reads in the notify handler accordingly and update this comment.
function isUserStatusTx(tx: RawTx) {
  return (
    (tx._class === "core:class:TxCreateDoc" || tx._class === "core:class:TxUpdateDoc") &&
    tx.objectClass === CORE_CLASS.UserStatus
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 5: Fetch the UserStatus snapshot and resolve each DM's presence**

After the existing required `Promise.all` block (after line 132's closing `}`), and after `myAccountUuid`/`channelPrivacy` are defined (after line 145), insert:

```ts
        // Best-effort, same reasoning as authorRows/tagRows below: a presence
        // lookup failure must never block the stream from opening — DMs just
        // render with no online dot until the next successful snapshot.
        const userStatuses = await client
          .findAll<UserStatusDoc>(CORE_CLASS.UserStatus, {})
          .catch(() => [] as UserStatusDoc[]);
        const onlineByAccountUuid = new Map(userStatuses.map((s) => [s.user, s.online]));
        // Maps a UserStatus doc's own _id back to the AccountUuid it's about —
        // needed because a later TxUpdateDoc's objectId is the status doc's id,
        // not the account it describes. Mutated (via .set) as new UserStatus
        // docs are created, in the notify handler below.
        const statusDocToAccount = new Map(userStatuses.map((s) => [s._id, s.user]));
        // Maps an AccountUuid to the one DM channel (in this connection's own
        // dms list) it's the "other" participant of — this app's DM model is
        // strictly 1:1, so there's at most one match per account.
        const dmByOtherAccount = new Map<string, string>();
        for (const d of dms) {
          const other = d.members.find((m) => m !== myAccountUuid);
          if (other) dmByOtherAccount.set(other, d._id);
        }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 7: Include `online` on each DM entry in the snapshot**

Replace the `dms.map` line inside the `spaces` array construction (line 179-185):

```ts
          ...dms.map((d) => {
            const other = d.members.find((m) => m !== myAccountUuid);
            return {
              id: d._id,
              name: d.name,
              description: d.description,
              tags: [] as string[],
              kind: "dm" as const,
              online: other ? onlineByAccountUuid.get(other) ?? false : false,
            };
          }),
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 9: Handle live UserStatus tx in the notify handler**

Inside `setNotifyHandler`'s `for (const tx of txes as RawTx[])` loop, insert a new branch right after the existing `isNewChannel(tx)` block's `continue;` (after line 237) and before `if (!isNewChatMessage(tx)) continue;` (line 239):

```ts
            if (isUserStatusTx(tx)) {
              let accountUuid: string | undefined;
              if (tx._class === "core:class:TxCreateDoc") {
                accountUuid = tx.attributes?.user;
                if (accountUuid) statusDocToAccount.set(tx.objectId, accountUuid);
              } else {
                accountUuid = statusDocToAccount.get(tx.objectId);
              }
              if (!accountUuid) continue;
              const dmId = dmByOtherAccount.get(accountUuid);
              if (!dmId) continue; // not a DM partner of this connection
              const online = tx.attributes?.online;
              if (online === undefined) continue; // this update didn't touch `online`
              send("presence", { channelId: dmId, online });
              continue;
            }
```

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 11: Manual live verification**

With the local dev server running, log in as `sdd-tester1@mobicom.local` in one browser and open a `curl` stream in a terminal as the same user:

```bash
curl -N -s -b cookies-tester1.txt http://localhost:3000/api/mobion/chat/stream | head -c 4000
```

Confirm the `snapshot` event's `channels` array has `"kind":"dm"` entries carrying an `"online"` boolean field (`true`/`false`, not missing).

If tester1 has an existing DM with `sdd-tester2@mobicom.local` visible in the sidebar: with the curl stream still open, log in as `sdd-tester2@mobicom.local` in a second browser (or incognito window) and load `/mobion` there — this opens tester2's own SSE connection, which flips their `UserStatus.online` to `true`. Confirm a `presence` event `{"channelId":"<the DM id>","online":true}` arrives on tester1's stream within a few seconds. Then close tester2's browser tab and confirm a second `presence` event with `"online":false` arrives (Huly's own disconnect handling should flip it back — if it doesn't fire within ~30s, note this as a concern in the task report rather than blocking on it, since the disconnect-side timing is outside this app's control).

If no DM exists yet between the two test accounts, note in the task report that only the snapshot's `online` field was verified (not the live update), and mark that as a follow-up concern for the final review.

- [ ] **Step 12: Commit**

```bash
git add src/lib/mobion-huly.ts src/app/api/mobion/chat/stream/route.ts
git commit -m "feat: expose Huly UserStatus presence over the chat SSE stream"
```

---

### Task 2: Sidebar — channel/DM section split + presence dots

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: the `online?: boolean` field on `dm`-kind channel entries and the `presence` SSE event, both produced by Task 1.
- Produces: no new exports — this is a leaf UI change.

- [ ] **Step 1: Add `online` to the `Channel` type**

Change the `Channel` type (lines 6-12):

```ts
type Channel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  kind: "channel" | "dm";
  online?: boolean;
};
```

- [ ] **Step 2: Handle the new `presence` SSE event**

Inside the `connect()` function, after the existing `channel_added` listener (after line 117) and before the `error` listener (line 119), add:

```ts
      es.addEventListener("presence", (e) => {
        const { channelId, online } = JSON.parse((e as MessageEvent).data);
        setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, online } : c)));
      });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Split `visibleChannels` into channel-only and DM-only lists**

Replace the existing `visibleChannels` useMemo (lines 199-203):

```ts
  const visibleChannelsOnly = useMemo(
    () =>
      sortedChannels.filter(
        (c) => c.kind === "channel" && activeTagFilters.every((t) => c.tags.includes(t)),
      ),
    [sortedChannels, activeTagFilters],
  );
  // DMs are never affected by the channel tag filter (DMs carry no tags) —
  // filtering them through the same .every() would hide every DM whenever any
  // tag filter is active, since an empty tags array never satisfies a
  // non-empty filter list.
  const visibleDms = useMemo(
    () => sortedChannels.filter((c) => c.kind === "dm"),
    [sortedChannels],
  );
```

- [ ] **Step 5: Add DM section collapse state, mirroring the existing channel collapse state**

After the existing `channelsCollapsed` state and its restore effect (after line 70), add:

```ts
  const [dmsCollapsed, setDmsCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("mobion-dms-collapsed") === "true") {
      setDmsCollapsed(true);
    }
  }, []);
```

After the existing `toggleChannelsCollapsed` function (after line 89), add:

```ts
  function toggleDmsCollapsed() {
    setDmsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mobion-dms-collapsed", String(next));
      return next;
    });
  }
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 7: Split the sidebar JSX into two sections**

Replace the sidebar's channel list rendering (lines 377-386, the `{!channelsCollapsed && visibleChannels.map(...)}` block) with the channel-only list, then add a second section for DMs right after it (still inside `<Sidebar>`, before its closing tag on line 387):

```tsx
          {!channelsCollapsed &&
            visibleChannelsOnly.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                # {c.name}
              </ChannelItem>
            ))}

          <SectionHeader>
            <SectionTitle type="button" onClick={toggleDmsCollapsed}>
              <Chevron data-collapsed={dmsCollapsed || undefined}>
                <span className="material-symbols-outlined">expand_more</span>
              </Chevron>
              직접 메시지
            </SectionTitle>
          </SectionHeader>
          {!dmsCollapsed &&
            visibleDms.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                <PresenceDot data-online={c.online || undefined} />
                {c.name}
              </ChannelItem>
            ))}
```

The channel header's `⋮` menu and tag-filter row (lines 300-376) are untouched — they stay attached only to the 채널 section, per the design spec.

- [ ] **Step 8: Add the `PresenceDot` styled component**

Add near the other small styled components, after `ChannelItem` (after line 606):

```ts
const PresenceDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  background: #767676;

  &[data-online] {
    background: #4ade80;
    box-shadow: 0 0 4px rgba(74, 222, 128, 0.6);
  }
`;
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 10: Manual browser verification**

Start the dev server, log in, open `/mobion`. Confirm: a "채널" section (with its existing ⋮/+ icons and tag chips) and a separate "직접 메시지" section both render, each independently collapsible via its chevron; DM entries show a gray dot when offline; if a linked test account is online (per Task 1's verification), its dot renders green with a soft glow.

- [ ] **Step 11: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: split sidebar into channel/DM sections with online presence dots"
```

---

### Task 3: Mention parsing utilities

**Files:**
- Create: `src/lib/mobion-mentions.ts`

**Interfaces:**
- Produces: `MENTION_REGEX`, `MessageSegment` type, `parseMentionSegments(text: string): MessageSegment[]`, `messageContainsMentionOf(text: string, userId: string): boolean`, `detectMentionTrigger(text: string, caret: number): { start: number; query: string } | null` — all consumed by Task 4 (`MentionInput.tsx`) and Task 6 (message rendering in `MobiOnContent.tsx`).

- [ ] **Step 1: Write the module**

```ts
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
  const assert = (await import("node:assert")).default;
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
```

- [ ] **Step 2: Run the self-check**

Run: `node --experimental-strip-types src/lib/mobion-mentions.ts`
Expected: `mobion-mentions self-check passed` printed, no assertion errors (an `ExperimentalWarning` line is expected and harmless).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-mentions.ts
git commit -m "feat: add mention marker parsing utilities"
```

---

### Task 4: Mention autocomplete input + composer integration

**Files:**
- Create: `src/components/MentionInput.tsx`
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `detectMentionTrigger` from `src/lib/mobion-mentions.ts` (Task 3).
- Produces: default-exported `MentionInput` component with props `{ value: string; onChange: (value: string) => void; onSend: () => void; users: { id: string; name: string }[] }`, consumed by `MobiOnContent.tsx`'s `Composer`.

- [ ] **Step 1: Write `MentionInput.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { detectMentionTrigger } from "@/lib/mobion-mentions";

type MentionUser = { id: string; name: string };

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  users: MentionUser[];
};

const MAX_CANDIDATES = 8;

export default function MentionInput({ value, onChange, onSend, users }: MentionInputProps) {
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const candidates = trigger
    ? users
        .filter((u) => u.name.toLowerCase().includes(trigger.query.toLowerCase()))
        .slice(0, MAX_CANDIDATES)
    : [];

  useEffect(() => {
    if (!trigger) return;
    function handleClickOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setTrigger(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [trigger]);

  function updateTrigger(nextValue: string, caret: number) {
    setTrigger(detectMentionTrigger(nextValue, caret));
    setActiveIndex(0);
  }

  function selectCandidate(user: MentionUser) {
    if (!trigger) return;
    const before = value.slice(0, trigger.start);
    const after = value.slice(trigger.start + 1 + trigger.query.length);
    onChange(`${before}@[${user.id}:${user.name}] ${after}`);
    setTrigger(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (trigger && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectCandidate(candidates[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setTrigger(null);
        return;
      }
    }
    if (e.key === "Enter") onSend();
  }

  return (
    <Root ref={rootRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        placeholder="메시지 입력... (@로 멘션)"
      />
      {trigger && candidates.length > 0 && (
        <Dropdown role="listbox">
          {candidates.map((u, i) => (
            <Candidate
              key={u.id}
              type="button"
              data-active={i === activeIndex || undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                selectCandidate(u);
              }}
            >
              {u.name}
            </Candidate>
          ))}
        </Dropdown>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  flex: 1;
`;

const Dropdown = styled.div`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const Candidate = styled.button`
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;

  &:hover,
  &[data-active] {
    background: rgba(255, 255, 255, 0.08);
    color: #00b5ff;
  }
`;
```

Note on `onMouseDown` with `preventDefault()` on `Candidate`: this stops the input's blur (which would otherwise close the dropdown via the outside-click handler first) from beating the click's `onClick` — a standard fix for this exact race, so it's `onMouseDown` rather than `onClick`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Fetch the mention candidate list on mount, in `MobiOnContent.tsx`**

Add a new state near the existing `allUsers` state (after line 49):

```ts
  const [mentionUsers, setMentionUsers] = useState<{ id: string; name: string }[]>([]);
```

Add a mount-time fetch effect near the existing `channelsCollapsed` restore effect (after line 70):

```ts
  useEffect(() => {
    fetch("/api/mobion/users/all")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setMentionUsers(data.users ?? []))
      .catch(() => {}); // best-effort — autocomplete just won't open on failure
  }, []);
```

- [ ] **Step 4: Swap the composer's plain `<input>` for `<MentionInput>`**

Add the import at the top of the file, alongside the existing imports:

```ts
import MentionInput from "./MentionInput";
```

Replace the `Composer` block (lines 425-433):

```tsx
          <Composer>
            <MentionInput
              value={draft}
              onChange={setDraft}
              onSend={handleSend}
              users={mentionUsers}
            />
            <button onClick={handleSend}>보내기</button>
          </Composer>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 6: Manual browser verification**

In `/mobion`, type `@` followed by part of a known user's name in the composer. Confirm a dropdown appears above the input, filtered to matching names; confirm arrow keys move the highlighted candidate, Enter or a click inserts `@[id:이름] ` into the draft and closes the dropdown, and `Escape` closes it without inserting anything. Confirm sending a message containing a marker still sends successfully (the existing send path is untouched — it just sees a longer string).

- [ ] **Step 7: Commit**

```bash
git add src/components/MentionInput.tsx src/components/MobiOnContent.tsx
git commit -m "feat: add @ mention autocomplete to the message composer"
```

---

### Task 5: Message list grouping (Slack-style compact layout)

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Produces: a `groupMessages(list: Message[]): MessageGroup[]` module-level helper and `MessageGroup` type, both local to this file (not exported — Task 6 extends the same rendering block in this same file).

- [ ] **Step 1: Add the grouping helper**

Add near the top-level `avatarColor` function (after line 38):

```ts
const GROUP_WINDOW_MS = 5 * 60 * 1000;

type MessageGroup = {
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  messages: Message[];
};

function groupMessages(list: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const m of list) {
    const last = groups[groups.length - 1];
    const lastMessage = last?.messages[last.messages.length - 1];
    if (
      last &&
      last.authorId === m.authorId &&
      lastMessage &&
      m.createdOn - lastMessage.createdOn < GROUP_WINDOW_MS
    ) {
      last.messages.push(m);
    } else {
      groups.push({
        authorId: m.authorId,
        authorName: m.authorName,
        authorAvatarUrl: m.authorAvatarUrl,
        messages: [m],
      });
    }
  }
  return groups;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Compute the groups alongside `activeMessages`**

`activeMessages`/`activeChannel` are plain consts (not `useMemo`) because they're computed after the component's early `if (connectionError) return` — hooks can't follow a conditional return, so this new derived value must stay a plain const too, in the same spot. After the existing `activeChannel` line (line 293), add:

```ts
  const messageGroups = groupMessages(activeMessages);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 5: Replace the message-list rendering with grouped blocks**

Replace the `MessageList` block (lines 405-424):

```tsx
          <MessageList ref={messageListRef}>
            {messageGroups.map((g, gi) => (
              <MessageGroupBlock key={gi}>
                {g.authorAvatarUrl ? (
                  <Avatar src={g.authorAvatarUrl} alt="" />
                ) : (
                  <AvatarFallback style={{ background: avatarColor(g.authorId) }}>
                    {(g.authorName ?? "?").charAt(0)}
                  </AvatarFallback>
                )}
                <MessageBody>
                  <MessageMeta>
                    <MessageAuthor>{g.authorName ?? "알 수 없음"}</MessageAuthor>
                    <MessageTime>{formatTime(g.messages[0].createdOn)}</MessageTime>
                  </MessageMeta>
                  {g.messages.map((m, mi) => (
                    <GroupedMessageRow key={m.id}>
                      {mi > 0 && <GroupedTimestamp>{formatTime(m.createdOn)}</GroupedTimestamp>}
                      <MessageText>{m.text}</MessageText>
                    </GroupedMessageRow>
                  ))}
                </MessageBody>
              </MessageGroupBlock>
            ))}
          </MessageList>
```

- [ ] **Step 6: Rename `MessageRow` to `MessageGroupBlock` and add the new grouped-row styled components**

Rename the existing `MessageRow` styled component (lines 671-675) to `MessageGroupBlock` (same body, no other changes):

```ts
const MessageGroupBlock = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;
```

Add two new styled components after `MessageText` (after line 725):

```ts
const GroupedMessageRow = styled.div`
  position: relative;
`;

const GroupedTimestamp = styled.span`
  position: absolute;
  left: -46px;
  top: 1px;
  font-size: 10px;
  color: #767676;
  opacity: 0;
  transition: opacity 0.1s ease;

  ${GroupedMessageRow}:hover & {
    opacity: 1;
  }
`;
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 8: Manual browser verification**

Send three messages in a row as the same user within a few seconds of each other. Confirm they render as one block: avatar/name/time shown once at the top, each message line below it with no repeated header, and hovering a non-first line fades in a small timestamp to its left without shifting any layout.

- [ ] **Step 9: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: group consecutive same-author messages into compact blocks"
```

---

### Task 6: Mention rendering + self-mention highlight

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `parseMentionSegments`, `messageContainsMentionOf` from `src/lib/mobion-mentions.ts` (Task 3); the `GroupedMessageRow`/`MessageText` structure from Task 5.

- [ ] **Step 1: Fetch the current user's id**

Add a new state near `mentionUsers` (added in Task 4):

```ts
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
```

Add a mount-time fetch effect near the `mentionUsers` fetch effect added in Task 4:

```ts
  useEffect(() => {
    fetch("/api/mobion/auth/me")
      .then((res) => res.json())
      .then((data) => setCurrentUserId(data.user?.id ?? null))
      .catch(() => {});
  }, []);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Import the mention utilities**

Add to the existing imports at the top of the file:

```ts
import { parseMentionSegments, messageContainsMentionOf } from "@/lib/mobion-mentions";
```

- [ ] **Step 4: Add a render helper for mention-highlighted text**

An unresolvable marker — a `userId` no longer present in `mobion_users` (e.g. a deleted account) — must fall back to the literal `이름` text, un-highlighted, rather than rendering as a styled mention. `mentionUsers` (fetched in Task 4) is the full current user list, so it doubles as the resolution check here.

Add near `groupMessages` (added in Task 5):

```tsx
function renderMessageText(text: string, knownUserIds: Set<string>) {
  return parseMentionSegments(text).map((seg, i) => {
    if (seg.type === "text") return <span key={i}>{seg.content}</span>;
    if (!knownUserIds.has(seg.userId)) return <span key={i}>@{seg.name}</span>;
    return <Mention key={i}>@{seg.name}</Mention>;
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 6: Use the helper in the grouped message rows, and mark self-mentioned rows**

Add a derived `knownUserIds` set right after `messageGroups` (added in Task 5, after line 293's `activeChannel` line):

```ts
  const knownUserIds = new Set(mentionUsers.map((u) => u.id));
```

Replace the inner `g.messages.map(...)` block from Task 5:

```tsx
                  {g.messages.map((m, mi) => (
                    <GroupedMessageRow
                      key={m.id}
                      data-mentions-me={
                        (currentUserId && messageContainsMentionOf(m.text, currentUserId)) ||
                        undefined
                      }
                    >
                      {mi > 0 && <GroupedTimestamp>{formatTime(m.createdOn)}</GroupedTimestamp>}
                      <MessageText>{renderMessageText(m.text, knownUserIds)}</MessageText>
                    </GroupedMessageRow>
                  ))}
```

- [ ] **Step 7: Add the `Mention` styled component and the self-mention highlight rule**

Add after `MessageText` (after line 725, alongside the `GroupedMessageRow`/`GroupedTimestamp` components added in Task 5):

```ts
const Mention = styled.span`
  color: #00b5ff;
  font-weight: 700;
`;
```

Extend `GroupedMessageRow` (from Task 5) with the highlight rule:

```ts
const GroupedMessageRow = styled.div`
  position: relative;

  &[data-mentions-me] {
    background: rgba(0, 181, 255, 0.08);
  }
`;
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 9: Manual browser verification**

Log in as `sdd-tester1`, send a message mentioning `sdd-tester2` via the autocomplete (Task 4). Confirm the mention renders as bold blue `@이름` text (not the raw `@[id:이름]` marker) for both senders and readers. Then log in as `sdd-tester2` and confirm that specific message row has a subtle blue-tinted background, while other messages in the same group (or channel) don't.

- [ ] **Step 10: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: render highlighted mentions and self-mention row highlight"
```
