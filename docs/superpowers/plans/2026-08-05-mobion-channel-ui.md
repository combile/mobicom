# Mobi:ON Channel UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Mobi:ON channel sidebar (collapsible section, sort/refresh menu, tag filter chips), add description + free-text tags to channel creation, restyle the creation modal's checkboxes/radios, and show the active channel's name/description at the top of the chat pane.

**Architecture:** Extends the already-deployed chat + channel-creation slice. Tags live in a new mobicom-owned Postgres table (Huly's `Channel` type has no tags field and we can't extend the installed `@hcengineering/*` package schema), joined by Huly channel id at read time. Everything else is UI-only work in the existing `MobiOnContent.tsx`, reusing the SSE stream's existing `snapshot`/`channel_added` events with two new fields.

**Tech Stack:** Next.js API routes, Postgres via the existing `query()` helper, plain Emotion `styled` components, `localStorage` for the sidebar's collapsed-state persistence. No new npm dependencies.

## Global Constraints

- No new npm dependencies for this plan.
- Follow the existing pattern: `requireCurrentUser()` first in every route, `mobionApiError(error, fallback)` for the catch-all, `query()` from `mobion-db.ts` for all Postgres access.
- No test runner is configured in this repo — verification is `npx tsc --noEmit -p tsconfig.json` plus manual curl/browser checks, consistent with every prior plan in this project.
- The accepted tag-visibility race described in the design spec (a brand-new channel's tags can briefly show as empty to *other* users' live push before a page refresh) is intentional — do not add channel-id pre-generation or other complexity to close it.
- Every task that touches `src/components/MobiOnContent.tsx` must be applied against the file state left by the previous task in this plan — read the current file before editing rather than assuming the plan's quoted "find" text is byte-exact after earlier tasks' changes.

---

### Task 1: Schema v8 — `mobion_channel_tags` table

**Files:**
- Modify: `src/lib/mobion-db.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `mobion_channel_tags(channel_id TEXT, tag TEXT, PRIMARY KEY(channel_id, tag))`, usable by every later task via plain SQL.

- [ ] **Step 1: Bump the schema version and add the table**

In `src/lib/mobion-db.ts`, change:

```typescript
const MOBION_SCHEMA_VERSION = 7;
```

to:

```typescript
const MOBION_SCHEMA_VERSION = 8;
```

Then add this right after the existing `avatar_url` migration block (the last statement in `ensureMobionSchema`, right before the closing `})().catch(...)`):

```typescript
      // Huly's Channel type has no tags field and we can't extend the installed
      // @hcengineering/* package schema, so channel tags live here instead, keyed
      // by the Huly channel id (chunter:class:Channel's _id — a plain string, not
      // a foreign key into any table we own).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_channel_tags (
          channel_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (channel_id, tag)
        )
      `);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 3: Verify against the live database**

With the local dev server running (which calls `ensureMobionSchema()` on its first Postgres query), hit any existing Mobi:ON endpoint once (e.g. `curl -s http://localhost:3000/api/mobion/auth/me`), then confirm the table exists:

```bash
psql "$DATABASE_URL" -c "\d mobion_channel_tags"
```

Expected: a table with columns `channel_id` (text) and `tag` (text), primary key on both.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-db.ts
git commit -m "feat: add mobion_channel_tags table (schema v8)"
```

---

### Task 2: Channel creation backend — description + tags

**Files:**
- Modify: `src/app/api/mobion/chat/channels/route.ts`

**Interfaces:**
- Consumes: `mobion_channel_tags` (Task 1), the existing `client.createDoc(...)` (already returns the created doc's id as a `string` — see `src/lib/mobion-huly.ts`'s `createDoc` wrapper).
- Produces: `POST /api/mobion/chat/channels` accepts two new optional body fields, `description: string` and `tags: string[]`, on top of the existing `name`/`isPrivate`/`memberIds`/`visibleToProfessor`. Response shape is unchanged (`{ok: true}`).

- [ ] **Step 1: Parse and normalize the new fields**

In `src/app/api/mobion/chat/channels/route.ts`, find:

```typescript
    const name = String(body.name ?? "").trim();
    const isPrivate = Boolean(body.isPrivate);
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const visibleToProfessor = Boolean(body.visibleToProfessor);
```

Replace with:

```typescript
    const name = String(body.name ?? "").trim();
    const isPrivate = Boolean(body.isPrivate);
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
    const visibleToProfessor = Boolean(body.visibleToProfessor);
    const description = String(body.description ?? "").trim();
    const tags: string[] = Array.isArray(body.tags)
      ? [...new Set(body.tags.map((t: unknown) => String(t).trim()).filter(Boolean))]
      : [];
```

- [ ] **Step 2: Use the real description, capture the created channel's id, and insert its tags**

Find:

```typescript
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
```

Replace with:

```typescript
    const channelId = await client.createDoc({
      _class: CHUNTER_CLASS.Channel,
      space: HULY_CORE_SPACE,
      attributes: {
        name,
        description,
        private: isPrivate,
        members,
        archived: false,
        topic: "",
      },
    });

    if (tags.length > 0) {
      await query(
        `INSERT INTO mobion_channel_tags (channel_id, tag)
         SELECT $1, tag FROM unnest($2::text[]) AS tag
         ON CONFLICT DO NOTHING`,
        [channelId, tags],
      );
    }

    return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Verify against the live server**

With the local dev server running and logged in as a seeded test account:

```bash
curl -s -b cookies.txt -X POST http://localhost:3000/api/mobion/chat/channels \
  -H "Content-Type: application/json" \
  -d '{"name":"verify-tags-channel","isPrivate":false,"memberIds":[],"visibleToProfessor":false,"description":"태그 테스트용 채널","tags":["프로젝트","2학년","프로젝트"]}'
```

Expected: `{"ok":true}`. Then confirm both the description and the deduplicated tags landed:

```bash
psql "$DATABASE_URL" -c "SELECT channel_id, tag FROM mobion_channel_tags ORDER BY tag"
```

Expected: exactly two rows for this channel (`프로젝트`, `2학년` — the duplicate `프로젝트` collapsed). Description isn't queryable from Postgres (it lives in Huly) — confirm it via Task 3's stream output once that task is done, or by checking Huly directly if convenient.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobion/chat/channels/route.ts
git commit -m "feat: accept description and tags on channel creation"
```

---

### Task 3: SSE stream — expose description + tags

**Files:**
- Modify: `src/app/api/mobion/chat/stream/route.ts`

**Interfaces:**
- Consumes: `mobion_channel_tags` (Task 1), Huly's `Channel.description` (already returned by `findAll`, just not selected into the outgoing payload yet).
- Produces: both the `snapshot` event's `channels` array and each `channel_added` event gain `description: string` and `tags: string[]`, alongside the existing `id`/`name`/`kind`.

- [ ] **Step 1: Extend `ChunterSpace` and select `description`**

In `src/app/api/mobion/chat/stream/route.ts`, find:

```typescript
type ChunterSpace = { _id: string; name: string; private: boolean; members: string[] };
```

Replace with:

```typescript
type ChunterSpace = {
  _id: string;
  name: string;
  description: string;
  private: boolean;
  members: string[];
};
```

- [ ] **Step 2: Query tags for the snapshot and build a lookup map**

Find:

```typescript
        // Best-effort: an author name we can't resolve just falls back to the
        // raw Huly id client-side, it never blocks the stream from opening.
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name, u.avatar_url
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
        const authorAvatars = new Map(authorRows.map((r) => [r.huly_social_id, r.avatar_url]));

        const spaces = [
          ...visibleChannels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const })),
          ...dms.map((d) => ({ id: d._id, name: d.name, kind: "dm" as const })),
        ];
```

Replace with:

```typescript
        // Best-effort: an author name we can't resolve just falls back to the
        // raw Huly id client-side, it never blocks the stream from opening.
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name, u.avatar_url
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));
        const authorAvatars = new Map(authorRows.map((r) => [r.huly_social_id, r.avatar_url]));

        // Best-effort, same reasoning as authorRows above: a tag lookup failure
        // must never block the stream from opening, it just means an empty tag
        // list until the next successful snapshot.
        const tagRows = await query<{ channel_id: string; tag: string }>(
          `SELECT channel_id, tag FROM mobion_channel_tags
           WHERE channel_id = ANY($1::text[])`,
          [visibleChannels.map((c) => c._id)],
        ).then((r) => r.rows).catch(() => []);
        const tagsByChannel = new Map<string, string[]>();
        for (const row of tagRows) {
          const list = tagsByChannel.get(row.channel_id) ?? [];
          list.push(row.tag);
          tagsByChannel.set(row.channel_id, list);
        }

        const spaces = [
          ...visibleChannels.map((c) => ({
            id: c._id,
            name: c.name,
            description: c.description,
            tags: tagsByChannel.get(c._id) ?? [],
            kind: "channel" as const,
          })),
          ...dms.map((d) => ({
            id: d._id,
            name: d.name,
            description: d.description,
            tags: [] as string[],
            kind: "dm" as const,
          })),
        ];
```

- [ ] **Step 3: Include description + tags on `channel_added`**

Find:

```typescript
            if (isNewChannel(tx)) {
              const isPrivate = tx.attributes?.private ?? false;
              const members = tx.attributes?.members ?? [];
              channelPrivacy.set(tx.objectId, { private: isPrivate, members });
              if (!canSeeChannel({ private: isPrivate, members }, myAccountUuid)) continue;
              send("channel_added", {
                id: tx.objectId,
                name: tx.attributes?.name ?? "",
                kind: "channel" as const,
              });
              continue;
            }
```

Replace with:

```typescript
            if (isNewChannel(tx)) {
              const isPrivate = tx.attributes?.private ?? false;
              const members = tx.attributes?.members ?? [];
              channelPrivacy.set(tx.objectId, { private: isPrivate, members });
              if (!canSeeChannel({ private: isPrivate, members }, myAccountUuid)) continue;
              const channelId = tx.objectId;
              const name = tx.attributes?.name ?? "";
              const description = tx.attributes?.description ?? "";
              // Best-effort, fire-and-forget: a tag lookup here races the creating
              // request's own tag insert (see the design spec's "accepted race").
              // Never await this inline — it must not block delivery of other
              // unrelated tx's in the same notify() batch to this connection.
              query<{ tag: string }>(
                `SELECT tag FROM mobion_channel_tags WHERE channel_id = $1`,
                [channelId],
              )
                .then((r) =>
                  send("channel_added", {
                    id: channelId,
                    name,
                    description,
                    tags: r.rows.map((row) => row.tag),
                    kind: "channel" as const,
                  }),
                )
                .catch(() =>
                  send("channel_added", {
                    id: channelId,
                    name,
                    description,
                    tags: [],
                    kind: "channel" as const,
                  }),
                );
              continue;
            }
```

- [ ] **Step 4: Extend `RawTx`'s attributes type**

Find:

```typescript
  attributes?: { message?: string; name?: string; private?: boolean; members?: string[] };
```

Replace with:

```typescript
  attributes?: {
    message?: string;
    name?: string;
    description?: string;
    private?: boolean;
    members?: string[];
  };
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 6: Verify against the live server**

With the local dev server running, using the `verify-tags-channel` channel created in Task 2's verification (or create a fresh one the same way):

```bash
curl -N -s -b cookies.txt http://localhost:3000/api/mobion/chat/stream | head -c 2000
```

Expected: the `snapshot` event's `channels` array contains an entry for `verify-tags-channel` with `"description":"태그 테스트용 채널"` and `"tags":["프로젝트","2학년"]` (order may vary). Then, with that connection still open in one terminal, create a *new* tagged channel via `curl` (Task 2's command with a different name) from a second terminal and confirm a `channel_added` event arrives on the first with the same `description`/`tags` fields populated (allow a moment for the best-effort tag query to resolve — it may show `"tags":[]` if it lands before Task 2's insert commits, which is the accepted race documented in the design spec; a `snapshot` on a fresh connection afterward must show the tags correctly either way).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/mobion/chat/stream/route.ts
git commit -m "feat: expose channel description and tags over SSE"
```

---

### Task 4: Creation modal — custom checkbox/radio, description + tag inputs

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `POST /api/mobion/chat/channels`'s new `description`/`tags` fields (Task 2).
- Produces: nothing new consumed by later tasks in this plan (Task 5/6/7 touch different parts of this same file and don't depend on these specific additions), but must not remove or rename anything Task 5/6/7 rely on (`showCreateChannel`, `openCreateChannel`, `handleCreateChannel`, the `Field`/`ModalCard`/`ModalOverlay` styled components).

- [ ] **Step 1: Add state for description and tags**

In `src/components/MobiOnContent.tsx`, find:

```typescript
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
```

Replace with:

```typescript
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelTags, setNewChannelTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
```

- [ ] **Step 2: Reset the new fields when the modal opens, and add tag add/remove handlers**

Find:

```typescript
  function openCreateChannel() {
    setCreateChannelError(null);
    setNewChannelName("");
    setNewChannelPrivate(false);
```

Replace with:

```typescript
  function openCreateChannel() {
    setCreateChannelError(null);
    setNewChannelName("");
    setNewChannelDescription("");
    setNewChannelTags([]);
    setNewTagInput("");
    setNewChannelPrivate(false);
```

Then, right after the existing `toggleMember` function (find `function toggleMember(id: string) {` through its closing `}`), add:

```typescript
  function addTag() {
    const tag = newTagInput.trim();
    setNewTagInput("");
    if (!tag || newChannelTags.includes(tag)) return;
    setNewChannelTags((prev) => [...prev, tag]);
  }

  function removeTag(tag: string) {
    setNewChannelTags((prev) => prev.filter((t) => t !== tag));
  }
```

- [ ] **Step 3: Send the new fields on submit**

Find:

```typescript
        body: JSON.stringify({
          name: newChannelName.trim(),
          isPrivate: newChannelPrivate,
          memberIds: newChannelMemberIds,
          visibleToProfessor: newChannelProfessor,
        }),
```

Replace with:

```typescript
        body: JSON.stringify({
          name: newChannelName.trim(),
          isPrivate: newChannelPrivate,
          memberIds: newChannelMemberIds,
          visibleToProfessor: newChannelProfessor,
          description: newChannelDescription.trim(),
          tags: newChannelTags,
        }),
```

- [ ] **Step 4: Add the description + tag fields to the modal, and swap in custom checkbox/radio markup**

Find the whole modal body (from the name `Field` through the professor checkbox, just before `{createChannelError && ...}`):

```typescript
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
```

Replace with:

```typescript
            <Field>
              <label htmlFor="new-channel-name">채널 이름</label>
              <input
                id="new-channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-channel-description">설명</label>
              <input
                id="new-channel-description"
                value={newChannelDescription}
                onChange={(e) => setNewChannelDescription(e.target.value)}
                placeholder="채널 설명 (선택)"
              />
            </Field>
            <Field>
              <label htmlFor="new-channel-tags">태그</label>
              <input
                id="new-channel-tags"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="태그 입력 후 Enter"
              />
              {newChannelTags.length > 0 && (
                <TagChipRow>
                  {newChannelTags.map((tag) => (
                    <TagChip key={tag}>
                      {tag}
                      <TagChipRemove type="button" onClick={() => removeTag(tag)}>
                        ×
                      </TagChipRemove>
                    </TagChip>
                  ))}
                </TagChipRow>
              )}
            </Field>
            <RadioRow>
              <CheckRow>
                <HiddenInput
                  type="radio"
                  checked={!newChannelPrivate}
                  onChange={() => setNewChannelPrivate(false)}
                />
                <RadioBox />
                공개
              </CheckRow>
              <CheckRow>
                <HiddenInput
                  type="radio"
                  checked={newChannelPrivate}
                  onChange={() => setNewChannelPrivate(true)}
                />
                <RadioBox />
                비공개
              </CheckRow>
            </RadioRow>
            {newChannelPrivate && (
              <>
                <MemberList>
                  {allUsers.map((u) => (
                    <CheckRow key={u.id}>
                      <HiddenInput
                        type="checkbox"
                        checked={newChannelMemberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      <CheckboxBox />
                      {u.name}
                    </CheckRow>
                  ))}
                </MemberList>
                <CheckRow>
                  <HiddenInput
                    type="checkbox"
                    checked={newChannelProfessor}
                    onChange={(e) => setNewChannelProfessor(e.target.checked)}
                  />
                  <CheckboxBox />
                  교수님에게 공개
                </CheckRow>
              </>
            )}
```

- [ ] **Step 5: Add the new styled components**

Add these after the existing `MemberList` styled component (find `const MemberList = styled.div` through its closing backtick-semicolon):

```typescript
const CheckRow = styled.label`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: #d4d4d4;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
`;

const HiddenInput = styled.input`
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
`;

const CheckboxBox = styled.span`
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;

  &::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: #061018;
    opacity: 0;
    transform: scale(0.6);
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  ${HiddenInput}:checked + & {
    background: #00b5ff;
    border-color: #00b5ff;
  }

  ${HiddenInput}:checked + &::after {
    opacity: 1;
    transform: scale(1);
  }
`;

const RadioBox = styled(CheckboxBox)`
  border-radius: 50%;

  &::after {
    border-radius: 50%;
  }
`;

const TagChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const TagChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 181, 255, 0.15);
  color: #00b5ff;
  font-size: 12px;
`;

const TagChipRemove = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
`;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 7: Verify in the browser**

With the local dev server running, log in, open the channel creation modal, confirm the public/private radios and (when private is selected) the member checkboxes and professor toggle all render as filled blue boxes/circles when checked, not native browser controls. Add a description and two tags (typing one, pressing Enter, typing another, pressing Enter), confirm both render as removable chips, remove one with its `×`, then submit and confirm the channel appears with the remaining tag (check via `psql` as in Task 2's verification, or wait for Task 6 to see it rendered in the sidebar).

- [ ] **Step 8: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: add description/tag inputs and custom checkbox styling to channel creation modal"
```

---

### Task 5: Sidebar — collapsible section header with sort/refresh menu

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `sortedChannels` array (channels sorted per the active sort mode) that Task 6 filters further by tag before rendering — Task 6 must use `sortedChannels`, not the raw `channels` state, as its filter input.

- [ ] **Step 1: Add collapse/sort/menu state and the sort helper**

Find:

```typescript
  const [creatingChannel, setCreatingChannel] = useState(false);
  const retryDelay = useRef(1000);
```

Replace with:

```typescript
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const [sortMode, setSortMode] = useState<"name" | "recent">("name");
  const [showChannelMenu, setShowChannelMenu] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const retryDelay = useRef(1000);

  useEffect(() => {
    if (localStorage.getItem("mobion-channels-collapsed") === "true") {
      setChannelsCollapsed(true);
    }
  }, []);

  function toggleChannelsCollapsed() {
    setChannelsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("mobion-channels-collapsed", String(next));
      return next;
    });
  }
```

- [ ] **Step 2: Make the connection effect restart on refresh, and compute sorted channels**

Find the closing of the main connection `useEffect` (the one starting with `useEffect(() => {\n    let es: EventSource | null = null;`):

```typescript
    connect();
    return () => {
      cancelled = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);
```

Replace with:

```typescript
    connect();
    return () => {
      cancelled = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [refreshToken]);
```

Then, right after the `handleSend` function's closing `}` (before `function openCreateChannel() {`), add:

```typescript
  const lastActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      const prev = map.get(m.channelId) ?? 0;
      if (m.createdOn > prev) map.set(m.channelId, m.createdOn);
    }
    return map;
  }, [messages]);

  const sortedChannels = useMemo(() => {
    const copy = [...channels];
    if (sortMode === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else {
      copy.sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0));
    }
    return copy;
  }, [channels, sortMode, lastActivity]);
```

Add `useMemo` to the existing React import:

```typescript
import { useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 3: Replace the sidebar's add-channel button with the section header**

Find:

```typescript
        <Sidebar>
          <AddChannelButton type="button" onClick={openCreateChannel}>
            + 채널 추가
          </AddChannelButton>
          {channels.map((c) => (
            <ChannelItem
              key={c.id}
              data-active={c.id === activeChannelId || undefined}
              onClick={() => setActiveChannelId(c.id)}
            >
              {c.kind === "dm" ? "@" : "#"} {c.name}
            </ChannelItem>
          ))}
        </Sidebar>
```

Replace with:

```typescript
        <Sidebar>
          <SectionHeader>
            <SectionTitle type="button" onClick={toggleChannelsCollapsed}>
              <Chevron data-collapsed={channelsCollapsed || undefined}>▾</Chevron>
              채널
            </SectionTitle>
            <SectionActions>
              <IconButton
                type="button"
                onClick={() => setShowChannelMenu((v) => !v)}
                aria-label="채널 메뉴"
              >
                ⋮
              </IconButton>
              <IconButton type="button" onClick={openCreateChannel} aria-label="채널 추가">
                +
              </IconButton>
            </SectionActions>
            {showChannelMenu && (
              <ChannelMenu>
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setSortMode("name");
                    setShowChannelMenu(false);
                  }}
                >
                  {sortMode === "name" ? "✓ " : ""}이름순
                </ChannelMenuItem>
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setSortMode("recent");
                    setShowChannelMenu(false);
                  }}
                >
                  {sortMode === "recent" ? "✓ " : ""}최근 활동순
                </ChannelMenuItem>
                <ChannelMenuDivider />
                <ChannelMenuItem
                  type="button"
                  onClick={() => {
                    setRefreshToken((n) => n + 1);
                    setShowChannelMenu(false);
                  }}
                >
                  새로고침
                </ChannelMenuItem>
              </ChannelMenu>
            )}
          </SectionHeader>
          {!channelsCollapsed &&
            sortedChannels.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                {c.kind === "dm" ? "@" : "#"} {c.name}
              </ChannelItem>
            ))}
        </Sidebar>
```

- [ ] **Step 4: Replace `AddChannelButton` with the new styled components**

Find the `AddChannelButton` styled component (`const AddChannelButton = styled.button` through its closing backtick-semicolon) and replace it with:

```typescript
const SectionHeader = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`;

const SectionTitle = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px 0;

  &:hover {
    color: #d4d4d4;
  }
`;

const Chevron = styled.span`
  display: inline-block;
  transition: transform 0.15s ease;

  &[data-collapsed] {
    transform: rotate(-90deg);
  }
`;

const SectionActions = styled.div`
  display: flex;
  gap: 4px;
`;

const IconButton = styled.button`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #9a9a9a;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    color: #00b5ff;
    background: rgba(255, 255, 255, 0.06);
  }
`;

const ChannelMenu = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  padding: 6px;
  border-radius: 10px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ChannelMenuItem = styled.button`
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #00b5ff;
  }
`;

const ChannelMenuDivider = styled.div`
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.14);
`;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 6: Verify in the browser**

With the local dev server running and logged in: click the "채널" title, confirm the list collapses (chevron rotates) and reappears on a second click; reload the page and confirm the collapsed state persisted. Click "⋮", confirm the menu shows "이름순"/"최근 활동순"/"새로고침"; switch sort modes and confirm the channel order changes accordingly (post a message in a channel that's not first alphabetically, then check "최근 활동순" puts it first); click "새로고침" and confirm the channel list still matches the server (network tab shows the `EventSource` reconnecting). Confirm "+" still opens the creation modal.

- [ ] **Step 7: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: collapsible channel section with sort/refresh menu"
```

---

### Task 6: Tag filter chip row

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `sortedChannels` (Task 5), the stream's new `description`/`tags` fields (Task 3).
- Produces: `Channel` type gains `description: string` and `tags: string[]` — Task 7 relies on `description` being present on this type.

- [ ] **Step 1: Extend the `Channel` type**

Find:

```typescript
type Channel = { id: string; name: string; kind: "channel" | "dm" };
```

Replace with:

```typescript
type Channel = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  kind: "channel" | "dm";
};
```

- [ ] **Step 2: Add filter state, distinct-tags list, and the filtered list**

Right after the `sortedChannels` `useMemo` added in Task 5, add:

```typescript
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of channels) for (const t of c.tags) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [channels]);

  const visibleChannels = useMemo(
    () =>
      sortedChannels.filter((c) => activeTagFilters.every((t) => c.tags.includes(t))),
    [sortedChannels, activeTagFilters],
  );

  function toggleTagFilter(tag: string) {
    setActiveTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }
```

- [ ] **Step 3: Render the chip row and switch the list to `visibleChannels`**

Find (as left by Task 5):

```typescript
          {!channelsCollapsed &&
            sortedChannels.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                {c.kind === "dm" ? "@" : "#"} {c.name}
              </ChannelItem>
            ))}
```

Replace with:

```typescript
          {!channelsCollapsed && allTags.length > 0 && (
            <TagFilterRow>
              {allTags.map((tag) => (
                <TagFilterChip
                  key={tag}
                  type="button"
                  data-active={activeTagFilters.includes(tag) || undefined}
                  onClick={() => toggleTagFilter(tag)}
                >
                  {tag}
                </TagFilterChip>
              ))}
            </TagFilterRow>
          )}
          {!channelsCollapsed &&
            visibleChannels.map((c) => (
              <ChannelItem
                key={c.id}
                data-active={c.id === activeChannelId || undefined}
                onClick={() => setActiveChannelId(c.id)}
              >
                {c.kind === "dm" ? "@" : "#"} {c.name}
              </ChannelItem>
            ))}
```

- [ ] **Step 4: Add the new styled components**

Add after the `ChannelItem` styled component (find `const ChannelItem = styled.div` through its closing backtick-semicolon):

```typescript
const TagFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
`;

const TagFilterChip = styled.button`
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 11px;
  cursor: pointer;

  &:hover {
    border-color: #00b5ff;
    color: #00b5ff;
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.2);
    border-color: #00b5ff;
    color: #00b5ff;
  }
`;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 6: Verify in the browser**

Using the tagged channels created in earlier tasks' verification, confirm the tag chip row appears above the channel list showing every distinct tag currently in use. Click one chip, confirm only channels carrying that tag remain listed and the chip highlights; click a second chip, confirm the list narrows further (AND semantics — a channel must have both); click both again to clear, confirm the full list returns.

- [ ] **Step 7: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: filter channel list by tag chips"
```

---

### Task 7: Message pane header — active channel name + description

**Files:**
- Modify: `src/components/MobiOnContent.tsx`

**Interfaces:**
- Consumes: `Channel.description` (Task 6).
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Derive the active channel and render the header**

Find:

```typescript
        <Main>
          <MessageList ref={messageListRef}>
```

Replace with:

```typescript
        <Main>
          <ChannelHeader>
            {activeChannel ? (
              <>
                <ChannelHeaderTitle>
                  {activeChannel.kind === "dm" ? "@" : "#"} {activeChannel.name}
                </ChannelHeaderTitle>
                {activeChannel.description && (
                  <ChannelHeaderDescription>
                    {activeChannel.description}
                  </ChannelHeaderDescription>
                )}
              </>
            ) : (
              <ChannelHeaderTitle>채널을 선택하거나 새로 만들어 보세요</ChannelHeaderTitle>
            )}
          </ChannelHeader>
          <MessageList ref={messageListRef}>
```

Then add the `activeChannel` derivation right before the `return (` that starts the component's JSX (i.e., right after the `const activeMessages = ...` line):

```typescript
  const activeChannel = channels.find((c) => c.id === activeChannelId) ?? null;
```

- [ ] **Step 2: Add the new styled components**

Add after the `Main` styled component (find `const Main = styled.div` through its closing backtick-semicolon):

```typescript
const ChannelHeader = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
`;

const ChannelHeaderTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #fff;
`;

const ChannelHeaderDescription = styled.div`
  margin-top: 2px;
  font-size: 12px;
  color: #9a9a9a;
`;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no errors.

- [ ] **Step 4: Verify in the browser**

With no channel selected yet (e.g. a fresh account with zero visible channels, or by temporarily clearing `activeChannelId` via React devtools), confirm the "채널을 선택하거나 새로 만들어 보세요" prompt shows instead of a blank pane. Select a channel with a description (from earlier tasks' verification) and confirm both the `#name` title and the description line render; select one with no description and confirm only the title renders (no empty second line).

- [ ] **Step 5: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: show active channel name and description above the message list"
```

---
