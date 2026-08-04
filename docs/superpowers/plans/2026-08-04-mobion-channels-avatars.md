# Mobi:ON Channel Creation & Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in Mobi:ON user create public or private Huly channels (with a professor-visibility toggle), and upload a profile picture shown next to their chat messages.

**Architecture:** Extends the already-deployed chat slice. Channel creation goes through the same server-side Huly connection layer (`getWorkspaceClient`) the chat slice already uses, with a new `createDoc` wrapper alongside the existing `addCollection` one. Avatars are plain files on the production server's local disk (no cloud storage, no new dependency) served by Next.js's existing static file handling from `public/`.

**Tech Stack:** Next.js API routes, Node's built-in `fs/promises` for avatar writes, the browser's `<canvas>` API for client-side image resize (no new npm dependency anywhere in this plan).

## Global Constraints

- Avatar uploads accept up to 10MB (the raw upload, before the client-side 128×128 canvas resize shrinks what's actually sent).
- Every new failure mode (duplicate channel name, oversized/non-image avatar, empty channel name) surfaces a Korean message to the user inline — never a silent failure or a raw English/technical string. Network-level failures get a generic `"요청에 실패했습니다. 다시 시도해 주세요."` fallback.
- No new npm dependencies for this plan.
- Follow the existing pattern: `requireCurrentUser()` first in every route, `mobionApiError(error, fallback)` for the catch-all, `query()` from `mobion-db.ts` for all Postgres access.
- Public channel `members` array content is irrelevant to visibility — only `private === false` matters. Verified live against the deployed server: `general`/`random` (both public) actually have non-empty `members` arrays already, so never assume an empty array means public or vice versa.

---

### Task 1: Schema v6 — `is_professor` and `avatar_url` columns

**Files:**
- Modify: `src/lib/mobion-db.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mobion_users.is_professor BOOLEAN NOT NULL DEFAULT false` and `mobion_users.avatar_url TEXT` (nullable), both usable by every later task in this plan via plain SQL — no new query helpers needed for schema access.

- [ ] **Step 1: Bump the schema version and add the two columns**

In `src/lib/mobion-db.ts`, change line 10:

```typescript
const MOBION_SCHEMA_VERSION = 6;
```

Then add these two `ALTER TABLE` calls right after the existing `mobion_huly_link` `huly_social_id` migration (after the block ending at line 98 in the current file — the one with the comment starting "Huly's per-workspace PersonId"):

```typescript
      // Exactly one account in the lab is the professor — set directly via SQL on
      // that account, the same one-time-bootstrap pattern already used for is_admin.
      // Used by channel creation to auto-add the professor when a private channel's
      // creator toggles "교수님에게 공개".
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS is_professor BOOLEAN NOT NULL DEFAULT false`,
      );
      // Relative path under public/ (e.g. /uploads/avatars/<userId>.png), NULL until
      // the user uploads one. See mobion-avatar.ts.
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
      );
```

- [ ] **Step 2: Verify the migration runs**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors (this is a pure SQL/string change, no type surface).

Then, with the local dev server running against the local Postgres (`DATABASE_URL` in `.env`), hit any existing Mobi:ON API route once to trigger `ensureMobionSchema()` (e.g. `curl -s http://localhost:3000/api/mobion/auth/me`), then confirm the columns exist:

```bash
psql "$DATABASE_URL" -c "\d mobion_users"
```

Expected: both `is_professor` (boolean, not null, default false) and `avatar_url` (text, nullable) appear in the output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mobion-db.ts
git commit -m "feat: add is_professor and avatar_url columns (schema v6)"
```

---

### Task 2: `GET /api/mobion/users` — member picker data

**Files:**
- Create: `src/app/api/mobion/users/route.ts`

**Interfaces:**
- Consumes: `requireCurrentUser` (existing, `mobion-auth.ts`), `query` (existing, `mobion-db.ts`).
- Produces: `GET /api/mobion/users` → `200 { users: Array<{ id: string; name: string }> }` for any authenticated caller. Consumed by Task 5's channel-creation modal for the member checkbox list.

Only returns users who actually have a working Huly link (`huly_social_id IS NOT NULL`) — someone who signed up but never successfully connected to Huly can't be added to a Huly channel's `members` array anyway. Excludes the professor (`is_professor = true`) — the professor is offered via a separate single toggle in the UI (Task 5), not mixed into the regular member list. No email, no admin flag, no credentials — just what a member picker needs.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/users/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type UserRow = { id: string; name: string };

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<UserRow>(
      `SELECT u.id, u.name
       FROM mobion_users u
       JOIN mobion_huly_link l ON l.user_id = u.id
       WHERE l.huly_social_id IS NOT NULL AND u.is_professor = false
       ORDER BY u.name`,
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    return mobionApiError(error, "사용자 목록 조회 실패");
  }
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running and a valid session cookie (log in via `POST /api/mobion/auth/login` first, save the cookie):

```bash
curl -s -b cookies.txt http://localhost:3000/api/mobion/users
```

Expected: `{"users":[...]}` listing every locally-seeded test account that has a Huly link and isn't flagged as professor (none should be yet, since Task 1 just added the column defaulting to `false`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobion/users/route.ts
git commit -m "feat: add member-picker endpoint for channel creation"
```

---

### Task 3: Channel visibility filtering in the SSE stream

**Files:**
- Modify: `src/app/api/mobion/chat/stream/route.ts`

**Interfaces:**
- Consumes: `getWorkspaceClient` (existing, returns `client.account.primarySocialId` — the connected user's own Huly PersonId, already exposed by `mobion-huly.ts`), `CHUNTER_CLASS` (existing).
- Produces: the `snapshot` event's `channels` array now excludes private channels the requesting user isn't a member of. A new `channel_added` SSE event type: `{ id: string; name: string; kind: "channel" }`, sent only to connections whose user can see the new channel. Task 5's UI (dispatched after Task 4) will need to listen for this event type in addition to the existing `snapshot`/`delta`/`error`.

This is the real gap the design spec found: today's route fetches every channel unconditionally, so "private" has never actually restricted anything. This task fixes reads; Task 4 adds the write path (channel creation) that will rely on this filtering actually working.

- [ ] **Step 1: Extend `ChunterSpace` and add the visibility check**

In `src/app/api/mobion/chat/stream/route.ts`, replace the `ChunterSpace` type (currently `type ChunterSpace = { _id: string; name: string };`) with:

```typescript
type ChunterSpace = { _id: string; name: string; private: boolean; members: string[] };
```

Add this function right after the `isNewChatMessage` function (which currently ends the block starting at `// A single message post fires TxCreateDoc...`):

```typescript
function canSeeChannel(channel: { private: boolean; members: string[] }, mySocialId: string) {
  return !channel.private || channel.members.includes(mySocialId);
}

// A channel-creation tx: same TxCreateDoc shape as a chat message (see
// isNewChatMessage above), but for the Channel class itself, with the full
// Channel doc's fields as attributes instead of just a message string.
function isNewChannel(tx: RawTx) {
  return (
    tx._class === "core:class:TxCreateDoc" &&
    tx.objectClass === CHUNTER_CLASS.Channel
  );
}
```

Extend the `RawTx` type's `attributes` field (currently `attributes?: { message?: string };`) to also carry the fields a Channel-creation tx has:

```typescript
type RawTx = {
  _class: string;
  objectId: string;
  objectClass: string;
  attachedTo: string;
  createdBy: string;
  createdOn?: number;
  modifiedOn: number;
  attributes?: { message?: string; name?: string; private?: boolean; members?: string[] };
};
```

- [ ] **Step 2: Filter the snapshot's channel list and track privacy per channel**

Find this block (the `findAll` calls inside the `try`):

```typescript
        try {
          [channels, dms] = await Promise.all([
            client.findAll<ChunterSpace>(CHUNTER_CLASS.Channel, {}),
            client.findAll<ChunterSpace>(CHUNTER_CLASS.DirectMessage, {}),
          ]);
          messages = await client.findAll<ChatMessage>(CHUNTER_CLASS.ChatMessage, {});
        } catch {
```

Right after that `try` block closes (after the `catch { ... }` for it, before the `// Best-effort: an author name...` comment), add:

```typescript
        const mySocialId = client.account.primarySocialId;
        const visibleChannels = channels.filter((c) => canSeeChannel(c, mySocialId));
        // Tracked for the lifetime of this connection so a later ChatMessage delta
        // can be checked against the channel it belongs to without a re-query —
        // a channel's own privacy doesn't change after creation in this app (no
        // edit-channel feature), so a snapshot-time map stays accurate.
        const channelPrivacy = new Map(
          channels.map((c) => [c._id, { private: c.private, members: c.members }]),
        );
```

Then update the `spaces` construction (currently `...channels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const }))`) to use `visibleChannels` instead of `channels`:

```typescript
        const spaces = [
          ...visibleChannels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const })),
          ...dms.map((d) => ({ id: d._id, name: d.name, kind: "dm" as const })),
        ];
```

- [ ] **Step 3: Filter deltas and forward `channel_added` events**

Find the `setNotifyHandler` block:

```typescript
        unsubscribe = client.setNotifyHandler((txes) => {
          for (const tx of txes as RawTx[]) {
            if (!isNewChatMessage(tx)) continue;
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              createdOn: tx.createdOn ?? tx.modifiedOn,
            });
          }
        });
```

Replace it with:

```typescript
        unsubscribe = client.setNotifyHandler((txes) => {
          for (const tx of txes as RawTx[]) {
            if (isNewChannel(tx)) {
              const isPrivate = tx.attributes?.private ?? false;
              const members = tx.attributes?.members ?? [];
              channelPrivacy.set(tx.objectId, { private: isPrivate, members });
              if (!canSeeChannel({ private: isPrivate, members }, mySocialId)) continue;
              send("channel_added", {
                id: tx.objectId,
                name: tx.attributes?.name ?? "",
                kind: "channel" as const,
              });
              continue;
            }
            if (!isNewChatMessage(tx)) continue;
            const owningChannel = channelPrivacy.get(tx.attachedTo);
            // A message in a channel this connection was never told about (created
            // before this connection opened, or a privacy check that somehow
            // missed it) is treated as not visible — fail closed, not open.
            if (owningChannel && !canSeeChannel(owningChannel, mySocialId)) continue;
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              createdOn: tx.createdOn ?? tx.modifiedOn,
            });
          }
        });
```

- [ ] **Step 4: Verify against the live server with a throwaway private-channel script**

This can't be verified through the UI yet (Task 4 hasn't built the creation endpoint), so verify the read-side filtering directly, the same way Task 1 verified the notify tx shape: write a throwaway `.mjs` script (delete it before committing) that logs in as one seeded test account (decrypt its real Huly password from `mobion_huly_link.huly_credential_encrypted` using `MOBION_HULY_ENCRYPTION_KEY` from `.env` and the AES-256-GCM format in `src/lib/mobion-crypto.ts` — the exact approach used earlier this session to inspect live channel data), and uses `TxOperations` directly (bypassing this app entirely) to `createDoc(CHUNTER_CLASS.Channel, "core:space:Space", { name: "verify-private-<timestamp>", description: "", private: true, members: [<that account's own socialId>], archived: false, topic: "" })`.

Then:
1. Open an SSE connection (`curl -sN` with that account's session cookie) to `GET /api/mobion/chat/stream` and confirm the new private channel appears in the `channels` array of the `snapshot` event (the creator is a member).
2. Open a second SSE connection as a *different* seeded test account (one not in that channel's `members`) and confirm the private channel does **not** appear in their `snapshot`.
3. While both connections are open, run the script again to create a second private channel (still only the first account as a member) and confirm only the first account's SSE connection receives a `channel_added` event — the second account's connection receives nothing for it.

Expected: exactly the behavior described in steps 1-3. If Huly's own tx broadcast turns out to already be scoped by space membership (so the second account's connection never even receives the raw tx for a channel it's not in), that's fine too — it just means this task's filter is defense-in-depth rather than the only thing blocking leakage; note whichever is observed in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobion/chat/stream/route.ts
git commit -m "fix: filter private channels by membership in SSE stream"
```

---

### Task 4: `createDoc` wrapper + `POST /api/mobion/chat/channels`

**Files:**
- Modify: `src/lib/mobion-huly.ts`
- Create: `src/app/api/mobion/chat/channels/route.ts`

**Interfaces:**
- Consumes: `getWorkspaceClient`, `CHUNTER_CLASS`, `HULY_CORE_SPACE` (existing, `mobion-huly.ts`), `requireCurrentUser`, `mobionApiError`, `query` (existing).
- Produces: `HulyWorkspaceClient.createDoc(params: { _class: string; space: string; attributes: Record<string, unknown> }): Promise<string>` (the created doc's id) — a new method on the object `getWorkspaceClient` resolves to, alongside the existing `findAll`/`addCollection`. `POST /api/mobion/chat/channels` body `{ name: string; isPrivate: boolean; memberIds: string[]; visibleToProfessor: boolean }` → `200 { ok: true }` on success (no channel payload — the creator's own SSE stream picks it up via Task 3's `channel_added` event, same "exactly one render path" principle already used for messages), `400` for empty name, `409` for a duplicate name.

- [ ] **Step 1: Add `createDoc` to `mobion-huly.ts`**

In `src/lib/mobion-huly.ts`, inside `buildWorkspaceClient`'s returned object (the object with `findAll`, `addCollection`, `account`, `setNotifyHandler`, `close`), add a `createDoc` method next to `addCollection`:

```typescript
    createDoc: (params: {
      _class: string;
      space: string;
      attributes: Record<string, unknown>;
    }) =>
      evictOnFailure(
        tx.createDoc(params._class as any, params.space as any, params.attributes as any),
      ),
```

- [ ] **Step 2: Write the channel-creation route**

```typescript
// src/app/api/mobion/chat/channels/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS, HULY_CORE_SPACE } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
  huly_social_id: string | null;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const isPrivate = Boolean(body.isPrivate);
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const visibleToProfessor = Boolean(body.visibleToProfessor);

    if (!name) {
      return NextResponse.json({ error: "채널 이름을 입력해 주세요." }, { status: 400 });
    }

    const linkResult = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace, huly_social_id
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = linkResult.rows[0];
    if (!link || !link.huly_social_id) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);

    const existing = await client.findAll<{ _id: string }>(CHUNTER_CLASS.Channel, { name });
    if (existing.length > 0) {
      return NextResponse.json({ error: "중복된 채널 이름입니다." }, { status: 409 });
    }

    let members: string[] = [link.huly_social_id];
    if (isPrivate) {
      if (memberIds.length > 0) {
        const memberRows = await query<{ huly_social_id: string | null }>(
          `SELECT l.huly_social_id
           FROM mobion_huly_link l
           WHERE l.user_id = ANY($1::uuid[]) AND l.huly_social_id IS NOT NULL`,
          [memberIds],
        );
        members.push(...memberRows.rows.map((r) => r.huly_social_id as string));
      }
      if (visibleToProfessor) {
        const professorRow = await query<{ huly_social_id: string | null }>(
          `SELECT l.huly_social_id
           FROM mobion_users u
           JOIN mobion_huly_link l ON l.user_id = u.id
           WHERE u.is_professor = true AND l.huly_social_id IS NOT NULL
           LIMIT 1`,
        );
        const professorSocialId = professorRow.rows[0]?.huly_social_id;
        if (professorSocialId) members.push(professorSocialId);
      }
      members = [...new Set(members)];
    } else {
      members = [];
    }

    await client.createDoc({
      _class: CHUNTER_CLASS.Channel,
      space: HULY_CORE_SPACE,
      attributes: {
        name,
        description: "",
        private: isPrivate,
        members,
        archived: false,
        topic: "",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "채널 생성 실패");
  }
}
```

Note: a public channel (`isPrivate === false`) still sends `members: []` to Huly — per the Global Constraints section, this is harmless since Task 3's `canSeeChannel` only checks `private` for a non-private channel, never `members`.

- [ ] **Step 3: Verify against the live server**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running and logged in as a seeded test account:

```bash
# Public channel
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/chat/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"verify-public-channel","isPrivate":false,"memberIds":[],"visibleToProfessor":false}'
```

Expected: `{"ok":true}`. Then confirm it appears in `GET /api/mobion/chat/stream`'s snapshot for *any* logged-in account, and via a `channel_added` event on an already-open connection.

```bash
# Duplicate name
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/chat/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"verify-public-channel","isPrivate":false,"memberIds":[],"visibleToProfessor":false}'
```

Expected: `409` with `{"error":"중복된 채널 이름입니다."}`.

```bash
# Private channel, no explicit members, professor visible
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/chat/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"verify-private-professor","isPrivate":true,"memberIds":[],"visibleToProfessor":true}'
```

Expected: `{"ok":true}`. Confirm the creator sees it in their own snapshot (creator is always in `members`, per Step 2's `members: [link.huly_social_id]` base case). Set one seeded test account's `is_professor = true` via `psql "$DATABASE_URL" -c "UPDATE mobion_users SET is_professor = true WHERE email = '<a seeded test account email>'"` first if none is flagged yet, then confirm that account's own SSE snapshot also includes `verify-private-professor`, and a third, uninvolved seeded account's snapshot does not.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-huly.ts src/app/api/mobion/chat/channels/route.ts
git commit -m "feat: add channel creation endpoint with public/private and professor visibility"
```

---

### Task 5: Channel creation UI

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `GET /api/mobion/users` (Task 2), `POST /api/mobion/chat/channels` (Task 4), the `channel_added` SSE event (Task 3).
- Produces: nothing consumed elsewhere — this is UI-only, the leaf of this sub-feature.

- [ ] **Step 1: Add a `channel_added` listener**

In `src/components/MobiOnContent.tsx`, inside the `connect()` function, right after the existing `es.addEventListener("delta", ...)` block, add:

```typescript
      es.addEventListener("channel_added", (e) => {
        const channel = JSON.parse((e as MessageEvent).data) as Channel;
        setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]));
      });
```

- [ ] **Step 2: Add channel-creation modal state and handler**

Add these near the top of the component, alongside the existing `useState` calls (after `const [sendError, setSendError] = useState<string | null>(null);`):

```typescript
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newChannelMemberIds, setNewChannelMemberIds] = useState<string[]>([]);
  const [newChannelProfessor, setNewChannelProfessor] = useState(false);
  const [createChannelError, setCreateChannelError] = useState<string | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
```

Add this function near `handleSend`:

```typescript
  function openCreateChannel() {
    setCreateChannelError(null);
    setNewChannelName("");
    setNewChannelPrivate(false);
    setNewChannelMemberIds([]);
    setNewChannelProfessor(false);
    setShowCreateChannel(true);
    fetch("/api/mobion/users")
      .then((res) => res.json())
      .then((data) => setAllUsers(data.users ?? []))
      .catch(() => setAllUsers([]));
  }

  async function handleCreateChannel() {
    setCreateChannelError(null);
    setCreatingChannel(true);
    try {
      const res = await fetch("/api/mobion/chat/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          isPrivate: newChannelPrivate,
          memberIds: newChannelMemberIds,
          visibleToProfessor: newChannelProfessor,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateChannelError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateChannel(false);
    } catch {
      setCreateChannelError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingChannel(false);
    }
  }

  function toggleMember(id: string) {
    setNewChannelMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }
```

- [ ] **Step 3: Add the "+ 채널 추가" button and modal to the JSX**

Find the `<Sidebar>` block:

```typescript
        <Sidebar>
          {channels.map((c) => (
```

Replace its opening with:

```typescript
        <Sidebar>
          <AddChannelButton type="button" onClick={openCreateChannel}>
            + 채널 추가
          </AddChannelButton>
          {channels.map((c) => (
```

Right after the closing `</Layout>` tag (still inside the outer `<Root>`, as a sibling of `<Layout>`), add the modal, rendered conditionally:

```typescript
      {showCreateChannel && (
        <ModalOverlay onClick={() => setShowCreateChannel(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 채널 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-channel-name">채널 이름</label>
              <input
                id="new-channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </Field>
            <RadioRow>
              <label>
                <input
                  type="radio"
                  checked={!newChannelPrivate}
                  onChange={() => setNewChannelPrivate(false)}
                />
                공개
              </label>
              <label>
                <input
                  type="radio"
                  checked={newChannelPrivate}
                  onChange={() => setNewChannelPrivate(true)}
                />
                비공개
              </label>
            </RadioRow>
            {newChannelPrivate && (
              <>
                <MemberList>
                  {allUsers.map((u) => (
                    <label key={u.id}>
                      <input
                        type="checkbox"
                        checked={newChannelMemberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      {u.name}
                    </label>
                  ))}
                </MemberList>
                <label>
                  <input
                    type="checkbox"
                    checked={newChannelProfessor}
                    onChange={(e) => setNewChannelProfessor(e.target.checked)}
                  />
                  교수님에게 공개
                </label>
              </>
            )}
            {createChannelError && <SendErrorText>{createChannelError}</SendErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateChannel(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateChannel} disabled={creatingChannel}>
                {creatingChannel ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
```

- [ ] **Step 4: Add the new styled components**

Add these at the end of the file, after the existing `SendErrorText` styled-component:

```typescript
const AddChannelButton = styled.button`
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: #00b5ff;
    border-color: #00b5ff;
  }
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
`;

const ModalCard = styled.div`
  width: min(360px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 14px;
    outline: none;
  }
`;

const RadioRow = styled.div`
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #d4d4d4;

  label {
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

const MemberList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 14px;
  color: #d4d4d4;

  label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  button:last-of-type {
    background: #00b5ff;
    color: #061018;
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
```

- [ ] **Step 5: Typecheck and manual verification**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running (`npm run dev`) and logged in as a seeded test account in a browser, navigate to `/mobion`, click "+ 채널 추가", create a public channel, confirm it appears immediately in the sidebar. Create a private channel with one member checked and the professor toggle on; log in as that member in a second browser session and confirm they see it; log in as an uninvolved third account and confirm they don't.

- [ ] **Step 6: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: add channel creation UI (public/private, member picker, professor toggle)"
```

---

### Task 6: Avatar upload backend

**Files:**
- Create: `src/lib/mobion-avatar.ts`
- Modify: `src/app/api/mobion/profile/route.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing new (pure `fs/promises` + the `avatar_url` column from Task 1).
- Produces: `saveAvatar(userId: string, dataUrl: string): Promise<string>` (throws an `Error` with a Korean message on validation failure, returns the relative URL to store on success) — used only by the `PATCH /api/mobion/profile` route in this task. `PATCH /api/mobion/profile` gains an optional `avatarBase64` field in its request body; on success the response's `user` object gains `avatarUrl: string | null`.

- [ ] **Step 1: Write the avatar save helper**

```typescript
// src/lib/mobion-avatar.ts
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10MB — guards the upload itself; the
// client always sends a 128x128 canvas-resized PNG, so the actual bytes are far
// smaller in practice, but a client that bypasses our own UI could send more.
const AVATAR_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
const DATA_URL_PATTERN = /^data:image\/png;base64,(.+)$/;

/**
 * Validates and writes a client-supplied avatar image, overwriting any previous
 * one for this user. Only accepts image/png — the client's canvas resize always
 * produces PNG (see ProfileContent.tsx), so anything else either bypassed our own
 * UI or is a corrupted upload; reject rather than guess at the real format.
 */
export async function saveAvatar(userId: string, dataUrl: string): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  const buffer = Buffer.from(match[1], "base64");
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error("파일 크기는 10MB 이하여야 합니다.");
  }
  await mkdir(AVATAR_DIR, { recursive: true });
  await writeFile(path.join(AVATAR_DIR, `${userId}.png`), buffer);
  return `/uploads/avatars/${userId}.png`;
}
```

- [ ] **Step 2: Wire it into the profile route**

In `src/app/api/mobion/profile/route.ts`, add the import:

```typescript
import { saveAvatar } from "@/lib/mobion-avatar";
```

Find this block:

```typescript
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = body.name == null ? null : String(body.name).trim();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
```

Add right after it:

```typescript
    const avatarBase64 = body.avatarBase64 == null ? null : String(body.avatarBase64);
```

Find the final `query` call and `return`:

```typescript
    const result = await query<{ id: string; name: string; email: string }>(
      `UPDATE mobion_users
       SET name = COALESCE($2, name),
           password_hash = COALESCE($3, password_hash)
       WHERE id = $1
       RETURNING id, name, email`,
      [user.id, name, passwordHash],
    );

    return NextResponse.json({ user: result.rows[0] });
```

Replace it with:

```typescript
    let avatarUrl: string | null = null;
    if (avatarBase64) {
      try {
        avatarUrl = await saveAvatar(user.id, avatarBase64);
      } catch (error) {
        const message = error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const result = await query<{ id: string; name: string; email: string; avatar_url: string | null }>(
      `UPDATE mobion_users
       SET name = COALESCE($2, name),
           password_hash = COALESCE($3, password_hash),
           avatar_url = COALESCE($4, avatar_url)
       WHERE id = $1
       RETURNING id, name, email, avatar_url`,
      [user.id, name, passwordHash, avatarUrl],
    );

    const updated = result.rows[0];
    return NextResponse.json({
      user: { id: updated.id, name: updated.name, email: updated.email, avatarUrl: updated.avatar_url },
    });
```

- [ ] **Step 3: Gitignore uploaded content**

Append to `.gitignore`:

```
# user-uploaded content — never commit
/public/uploads/
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running and logged in:

```bash
node -e "console.log('data:image/png;base64,' + Buffer.from('not a real png but fine for byte-size testing').toString('base64'))" > /tmp/fake.txt
```

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/profile \
  -H "Content-Type: application/json" \
  -d "{\"avatarBase64\":\"$(cat /tmp/fake.txt)\"}"
```

Expected: `200` with `"avatarUrl":"/uploads/avatars/<userId>.png"` in the response, and the file actually exists at `public/uploads/avatars/<userId>.png`. Then:

```bash
curl -s -b cookies.txt -X PATCH http://localhost:3000/api/mobion/profile \
  -H "Content-Type: application/json" \
  -d '{"avatarBase64":"data:text/plain;base64,aGVsbG8="}'
```

Expected: `400` with `{"error":"이미지 파일만 업로드할 수 있습니다."}`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobion-avatar.ts src/app/api/mobion/profile/route.ts .gitignore
git commit -m "feat: add avatar upload to profile endpoint"
```

---

### Task 7: `/profile` page UI

**Files:**
- Create: `src/app/profile/page.tsx`
- Create: `src/components/ProfileContent.tsx`

**Interfaces:**
- Consumes: `PATCH /api/mobion/profile` (existing + Task 6's `avatarBase64`/`avatarUrl` extension), `getCurrentUser` (existing, `mobion-auth.ts`, for the server-side auth gate matching `/mobion`'s pattern).
- Produces: nothing consumed elsewhere — leaf UI page.

- [ ] **Step 1: Write the page (server component, auth-gated like `/mobion`)**

```typescript
// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import ProfileContent from "@/components/ProfileContent";
import styles from "../page.module.css";

export const metadata = {
  title: "프로필 — MOBICOM",
  description: "Mobi:ON 프로필 설정",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <ProfileContent initialName={user.name} />
    </main>
  );
}
```

- [ ] **Step 2: Write the client component**

```typescript
// src/components/ProfileContent.tsx
"use client";

import { useRef, useState } from "react";
import styled from "@emotion/styled";

const AVATAR_SIZE = 128;

function resizeToSquarePng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("이미지를 처리할 수 없습니다."));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("이미지 파일만 업로드할 수 있습니다."));
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfileContent({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }
    try {
      const dataUrl = await resizeToSquarePng(file);
      setAvatarPreview(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/mobion/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
          avatarBase64: avatarPreview,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setSuccess("저장되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Root>
      <Card onSubmit={handleSubmit}>
        <Title>프로필</Title>

        <AvatarRow>
          <AvatarPreview onClick={() => fileInputRef.current?.click()}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" />
            ) : (
              <span>{name.charAt(0) || "?"}</span>
            )}
          </AvatarPreview>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            hidden
          />
          <AvatarHint>클릭해서 사진 변경 (최대 10MB)</AvatarHint>
        </AvatarRow>

        <Field>
          <label htmlFor="profile-name">이름</label>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field>
          <label htmlFor="profile-current-password">현재 비밀번호</label>
          <input
            id="profile-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>

        <Field>
          <label htmlFor="profile-new-password">새 비밀번호 (변경 시에만 입력)</label>
          <input
            id="profile-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        {error && <Error>{error}</Error>}
        {success && <Success>{success}</Success>}

        <Submit type="submit" disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Submit>
      </Card>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
`;

const Card = styled.form`
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 40px 32px;
  border-radius: 24px;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: #fff;
  text-align: center;
  margin-bottom: 8px;
`;

const AvatarRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const AvatarPreview = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 181, 255, 0.15);
  color: #00b5ff;
  font-size: 28px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const AvatarHint = styled.span`
  font-size: 12px;
  color: #9a9a9a;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: #00b5ff;
    }
  }
`;

const Error = styled.p`
  font-size: 13px;
  color: #ff6767;
  text-align: center;
`;

const Success = styled.p`
  font-size: 13px;
  color: #4ade80;
  text-align: center;
`;

const Submit = styled.button`
  padding: 12px 0;
  border-radius: 12px;
  border: none;
  background: #00b5ff;
  color: #061018;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
`;
```

- [ ] **Step 3: Typecheck and manual verification**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running and logged in, navigate to `/profile`, click the avatar circle, pick an image file, confirm the preview updates, click 저장, confirm the success message appears and `public/uploads/avatars/<userId>.png` exists on disk. Try a >10MB file and confirm the client-side rejection message appears without a network request.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/page.tsx src/components/ProfileContent.tsx
git commit -m "feat: add /profile page for name, password, and avatar"
```

---

### Task 8: Avatar display in chat

**Files:**
- Modify: `src/app/api/mobion/chat/stream/route.ts`
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `mobion_users.avatar_url` (Task 1).
- Produces: the `snapshot` and `delta` (and now `channel_added` is unaffected — this only touches message payloads) SSE message payloads gain `authorAvatarUrl: string | null`.

- [ ] **Step 1: Extend the author lookup query**

In `src/app/api/mobion/chat/stream/route.ts`, find:

```typescript
type AuthorRow = { huly_social_id: string | null; name: string };
```

Replace with:

```typescript
type AuthorRow = { huly_social_id: string | null; name: string; avatar_url: string | null };
```

Find:

```typescript
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
```

Replace with:

```typescript
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name, u.avatar_url
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
        const authorAvatars = new Map(authorRows.map((r) => [r.huly_social_id, r.avatar_url]));
```

Find the `snapshot` message-mapping block:

```typescript
          messages: messages.map((m) => ({
            id: m._id,
            channelId: m.attachedTo,
            text: m.message,
            authorId: m.createdBy,
            authorName: authorNames.get(m.createdBy) ?? null,
            createdOn: m.createdOn,
          })),
```

Replace with:

```typescript
          messages: messages.map((m) => ({
            id: m._id,
            channelId: m.attachedTo,
            text: m.message,
            authorId: m.createdBy,
            authorName: authorNames.get(m.createdBy) ?? null,
            authorAvatarUrl: authorAvatars.get(m.createdBy) ?? null,
            createdOn: m.createdOn,
          })),
```

Find the `delta` send inside `setNotifyHandler`:

```typescript
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              createdOn: tx.createdOn ?? tx.modifiedOn,
            });
```

Replace with:

```typescript
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              authorAvatarUrl: authorAvatars.get(tx.createdBy) ?? null,
              createdOn: tx.createdOn ?? tx.modifiedOn,
            });
```

- [ ] **Step 2: Render the avatar in the chat UI**

In `src/components/MobiOnContent.tsx`, extend the `Message` type:

```typescript
type Message = {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdOn: number;
};
```

Add this function near `formatTime`:

```typescript
const AVATAR_COLORS = ["#00b5ff", "#ff9d5c", "#8b7cf6", "#4ade80", "#ff6767", "#e5c76b"];

function avatarColor(authorId: string) {
  let hash = 0;
  for (let i = 0; i < authorId.length; i++) hash = (hash * 31 + authorId.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
```

Find the message row rendering:

```typescript
              <MessageRow key={m.id}>
                <MessageMeta>
                  <MessageAuthor>{m.authorName ?? "알 수 없음"}</MessageAuthor>
                  <MessageTime>{formatTime(m.createdOn)}</MessageTime>
                </MessageMeta>
                <MessageText>{m.text}</MessageText>
              </MessageRow>
```

Replace with:

```typescript
              <MessageRow key={m.id}>
                {m.authorAvatarUrl ? (
                  <Avatar src={m.authorAvatarUrl} alt="" />
                ) : (
                  <AvatarFallback style={{ background: avatarColor(m.authorId) }}>
                    {(m.authorName ?? "?").charAt(0)}
                  </AvatarFallback>
                )}
                <MessageBody>
                  <MessageMeta>
                    <MessageAuthor>{m.authorName ?? "알 수 없음"}</MessageAuthor>
                    <MessageTime>{formatTime(m.createdOn)}</MessageTime>
                  </MessageMeta>
                  <MessageText>{m.text}</MessageText>
                </MessageBody>
              </MessageRow>
```

- [ ] **Step 3: Update styled components for the new layout**

Find the `MessageRow` styled component:

```typescript
const MessageRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;
```

Replace with:

```typescript
const MessageRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const MessageBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const Avatar = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
`;

const AvatarFallback = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #061018;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
`;
```

- [ ] **Step 4: Typecheck and manual verification**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running: as a seeded test account with no avatar uploaded, send a chat message, confirm it shows a colored initials circle. Upload an avatar via `/profile` (Task 7), send another message, confirm the real image now appears next to it (both the freshly-sent message and, after a page refresh, the earlier snapshot-loaded messages).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobion/chat/stream/route.ts src/components/MobiOnContent.tsx
git commit -m "feat: show sender avatar (or initials fallback) on chat messages"
```

---

### Task 9: Header — split profile link from logout

**Files:**
- Modify: `src/components/Header.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Split the combined name/logout button**

In `src/components/Header.tsx`, find:

```typescript
      {userName ? (
        <LoginButton type="button" data-magnetic onClick={handleLogout}>
          <span className="material-symbols-outlined">person</span>
          {userName}
        </LoginButton>
      ) : (
```

Replace with:

```typescript
      {userName ? (
        <UserActions>
          <Link href="/profile" style={{ textDecoration: "none" }}>
            <LoginButton type="button" data-magnetic>
              <span className="material-symbols-outlined">person</span>
              {userName}
            </LoginButton>
          </Link>
          <LogoutButton type="button" onClick={handleLogout} aria-label="로그아웃">
            <span className="material-symbols-outlined">logout</span>
          </LogoutButton>
        </UserActions>
      ) : (
```

- [ ] **Step 2: Add the new styled components**

Add after the existing `LoginButton` styled component (at the end of the file):

```typescript
const UserActions = styled.div`
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
`;

const LogoutButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: #9a9a9a;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;

  .material-symbols-outlined {
    font-size: 18px;
  }

  &:hover {
    color: #ff6767;
    border-color: #ff6767;
  }
`;
```

- [ ] **Step 3: Typecheck and manual verification**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

With the local dev server running and logged in, confirm clicking the name in the header navigates to `/profile`, and the separate small logout icon still logs out and redirects home.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: split header's name link (/profile) from its logout action"
```

---

### Task 10: Deploy

**Files:** none (infrastructure step, no source changes)

- [ ] **Step 1: Push and pull on the server**

```bash
git push origin dev
```

Then on the server (`ssh mobicom@203.230.103.35`):

```bash
cd ~/mobicom-app && git pull origin dev
export NVM_DIR=/home/mobicom/.nvm; . /home/mobicom/.nvm/nvm.sh
npm run build
pm2 restart mobicom-app
```

- [ ] **Step 2: Verify on the real deployment**

Open `http://203.230.103.35:3300/mobion`, log in, create a public and a private channel, confirm both behave as verified locally (public visible to all, private only to chosen members + optional professor). Open `http://203.230.103.35:3300/profile`, upload an avatar, confirm it appears next to new chat messages. Confirm `public/uploads/avatars/` exists under `~/mobicom-app/` on the server after the first upload (created on demand by `mobion-avatar.ts`, not a deploy step).
