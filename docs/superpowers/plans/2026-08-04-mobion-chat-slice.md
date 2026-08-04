# Mobi:ON Chat Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in Mobi:ON user see their real Huly channels/DMs and messages, send messages, and see others' messages live.

**Architecture:** The Next.js server holds a live Huly connection per active mobion session (via `@hcengineering/client-resources`, not the simplified `api-client` wrapper, because only the lower-level `Client` exposes a `notify` hook for live tx updates) and relays channel/message state to the browser over Server-Sent Events. The browser never sees Huly credentials — same boundary Phase 0 already established.

**Tech Stack:** Next.js API routes (SSE via a `ReadableStream` response), `@hcengineering/client-resources` + `@hcengineering/core`'s `TxOperations` for the Huly side, plain `EventSource` in the browser (no new npm dependency).

## Global Constraints

- Do not add `@hcengineering/chunter` as a dependency: it pulls in `@hcengineering/ui` and `@hcengineering/workbench` (Huly's own Svelte frontend) for three string constants we can hardcode. Huly's `plugin()` helper (`node_modules/@hcengineering/platform/lib/platform.js`) generates class IDs as `<pluginId>:class:<Key>`, so chunter's IDs are exactly:
  - `chunter:class:Channel`
  - `chunter:class:DirectMessage`
  - `chunter:class:ChatMessage`
- `@hcengineering/client-resources` and `@hcengineering/core` are already installed (transitive deps of `@hcengineering/api-client`/`@hcengineering/account-client`) — no `npm install` needed for this plan.
- Same version-pinning gotcha as Phase 0: the deployed Huly server is `v0.7.423`, matching our npm packages. Don't let this drift (see `.env.example`'s existing comment).
- Follow the existing pattern in `src/lib/mobion-huly.ts`: `env()` helper for required env vars, `decryptSecret`/`encryptSecret` from `mobion-crypto.ts` for the stored per-user Huly password.

---

### Task 1: Live Huly workspace client with channel/message reads

**Files:**
- Modify: `src/lib/mobion-huly.ts`
- Modify: `src/types/hcengineering-shims.d.ts`

**Interfaces:**
- Consumes: `decryptSecret` (existing, `mobion-crypto.ts`), `env()` (existing, same file).
- Produces:
  - `CHUNTER_CLASS = { Channel: "chunter:class:Channel", DirectMessage: "chunter:class:DirectMessage", ChatMessage: "chunter:class:ChatMessage" }` (exported const)
  - `type HulyWorkspaceClient = { findAll: <T>(_class: string, query: Record<string, unknown>) => Promise<T[]>; addCollection: (params: {...}) => Promise<string>; account: { primarySocialId: string }; setNotifyHandler: (fn: (txes: unknown[]) => void) => void; close: () => Promise<void> }`
  - `getWorkspaceClient(link: HulyLink): Promise<HulyWorkspaceClient>` — Task 2 and Task 3 both call this per-request; it internally caches by `link.huly_account_email` so repeated calls within the same process reuse one live connection instead of opening a new one each time.

This task has no automated test (no live Huly connection in CI) — verification is a manual script run against the real deployed server, same pattern as Phase 0's Task 5.

- [ ] **Step 1: Add the chunter class ID constants**

In `src/lib/mobion-huly.ts`, near the top (after the existing imports):

```typescript
// Hand-picked chunter class IDs instead of depending on @hcengineering/chunter,
// which pulls in @hcengineering/ui + @hcengineering/workbench (Huly's own
// Svelte frontend) for three string constants. Huly's plugin() helper
// (node_modules/@hcengineering/platform/lib/platform.js) generates IDs as
// `${pluginId}:${category}:${Key}`, so these are exact and stable as long as
// chunter's plugin id ('chunter') and class key names don't change upstream.
export const CHUNTER_CLASS = {
  Channel: "chunter:class:Channel",
  DirectMessage: "chunter:class:DirectMessage",
  ChatMessage: "chunter:class:ChatMessage",
} as const;
```

- [ ] **Step 2: Extend the ambient shims for `@hcengineering/client-resources` and the low-level `@hcengineering/core` pieces**

Append to `src/types/hcengineering-shims.d.ts`:

```typescript
declare module "@hcengineering/client-resources" {
  export interface RawClient {
    findAll: <T>(_class: string, query: Record<string, unknown>) => Promise<T[]>;
    findOne: <T>(_class: string, query: Record<string, unknown>) => Promise<T | undefined>;
    close: () => Promise<void>;
    notify?: (...tx: unknown[]) => void;
  }
  export interface ClientFactoryOptions {
    onUpgrade?: () => void;
  }
  const clientResources: () => Promise<{
    function: {
      GetClient: (token: string, endpoint: string, opt?: ClientFactoryOptions) => Promise<RawClient>;
    };
  }>;
  export default clientResources;
}
```

`@hcengineering/core`'s `TxOperations` already ships real (non-shimmed) types since `@hcengineering/core` is a direct dependency with its own `src/` — no shim needed for it. Import it normally: `import { TxOperations, type Doc, type Ref, type Space } from "@hcengineering/core"`.

- [ ] **Step 3: Implement `getWorkspaceClient`**

In `src/lib/mobion-huly.ts`, add below `provisionHulyAccount`:

```typescript
import getClientResources from "@hcengineering/client-resources";
import { TxOperations } from "@hcengineering/core";

const workspaceClients = new Map<string, ReturnType<typeof buildWorkspaceClient>>();

type HulyWorkspaceClient = Awaited<ReturnType<typeof buildWorkspaceClient>>;

/**
 * Connects as the linked user via the low-level client-resources Client
 * (not api-client's connect()), because only this layer exposes a settable
 * `notify` hook for live tx updates — api-client's PlatformClient wraps it
 * privately and doesn't re-expose it. Cached per email: repeated calls (one
 * per SSE connection, one per send-message request) reuse the same live
 * connection instead of opening a new one each time.
 */
export async function getWorkspaceClient(link: HulyLink): Promise<HulyWorkspaceClient> {
  const cached = workspaceClients.get(link.huly_account_email);
  if (cached) return cached;
  const built = buildWorkspaceClient(link);
  workspaceClients.set(link.huly_account_email, built);
  return built;
}

async function buildWorkspaceClient(link: HulyLink) {
  const password = decryptSecret(link.huly_credential_encrypted);
  const accountsUrl = env("HULY_ACCOUNTS_URL");
  const anon = getAccountClient(accountsUrl);
  const login = await anon.login(link.huly_account_email, password);
  if (!login.token) throw new Error("Huly login did not return a token");
  const wsClient = getAccountClient(accountsUrl, login.token);
  const wsLogin = await wsClient.selectWorkspace(link.huly_workspace);

  const resources = await getClientResources();
  const raw = await resources.function.GetClient(wsLogin.token, wsLogin.endpoint);
  const tx = new TxOperations(raw as any, wsLogin.account as any);

  return {
    findAll: <T,>(_class: string, query: Record<string, unknown>) =>
      raw.findAll<T>(_class as any, query as any),
    addCollection: (params: {
      _class: string;
      space: string;
      attachedTo: string;
      attachedToClass: string;
      collection: string;
      attributes: Record<string, unknown>;
    }) =>
      tx.addCollection(
        params._class as any,
        params.space as any,
        params.attachedTo as any,
        params.attachedToClass as any,
        params.collection,
        params.attributes as any,
      ),
    account: { primarySocialId: wsLogin.account as string },
    setNotifyHandler: (fn: (txes: unknown[]) => void) => {
      raw.notify = (...txes: unknown[]) => fn(txes);
    },
    close: () => raw.close(),
  };
}
```

Note: `getAccountClient`, `env`, `decryptSecret`, `HulyLink` type are all already defined earlier in this same file (from Phase 0) — reuse them, don't redefine.

- [ ] **Step 4: Manual verification against the real server**

Run from the repo root (not through Next.js — a standalone script, same style as the Phase 0 verification scripts):

```bash
node -e "
const { getWorkspaceClient, CHUNTER_CLASS } = require('./src/lib/mobion-huly.ts');
" 2>&1 || echo "expected: .ts can't be required directly, see below"
```

Since `mobion-huly.ts` is TypeScript, write a throwaway `.mjs` verification script instead that inlines the same logic against the real deployed server (reuse the working credentials from Phase 0's manual test: `test-member3@mobicom.local` or re-provision a fresh test account first via the existing activate flow). Confirm:
1. `getWorkspaceClient` resolves without throwing.
2. `client.findAll(CHUNTER_CLASS.Channel, {})` returns an array (empty is fine — a fresh Huly workspace may have zero channels beyond the default `general`).
3. `client.setNotifyHandler(fn)` followed by sending a message from Huly's own web UI (https://203.230.103.35:8087) triggers `fn` within a few seconds.

If step 3 doesn't fire, the most likely cause is `raw.notify` needing to be set *before* `GetClient` finishes its initial handshake rather than after — check `client-resources/src/index.ts`'s `handler` wiring (already fetched to `/private/tmp/.../index.ts` during planning) for the exact ordering and adjust `buildWorkspaceClient` accordingly. Do not proceed to Task 2 until this fires reliably.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobion-huly.ts src/types/hcengineering-shims.d.ts
git commit -m "feat: add live Huly workspace client for channel/message reads"
```

---

### Task 2: Chat SSE stream endpoint

**Files:**
- Create: `src/app/api/mobion/chat/stream/route.ts`

**Interfaces:**
- Consumes: `requireCurrentUser` (existing, `mobion-auth.ts`), `getWorkspaceClient`, `CHUNTER_CLASS` (Task 1, `mobion-huly.ts`), `query` (existing, `mobion-db.ts`, to look up the user's `mobion_huly_link` row).
- Produces: `GET /api/mobion/chat/stream` — SSE stream. Event `snapshot` (once, on connect): `{ channels: Array<{ id: string; name: string; kind: "channel" | "dm" }>, messages: Array<{ id: string; channelId: string; text: string; authorId: string; createdOn: number }> }`. Event `delta`: same message shape, one at a time, as they arrive. Consumed by Task 4's `EventSource` client.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/chat/stream/route.ts
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS } from "@/lib/mobion-huly";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

type ChunterSpace = { _id: string; name: string; _class: string };
type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
};

export async function GET() {
  const user = await requireCurrentUser();
  const result = await query<HulyLinkRow>(
    `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
     FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
    [user.id],
  );
  const link = result.rows[0];
  if (!link) {
    return new Response("Huly 계정이 연결되어 있지 않습니다.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      let client;
      try {
        client = await getWorkspaceClient(link);
      } catch {
        send("error", { message: "huly_unavailable" });
        controller.close();
        return;
      }

      const [channels, dms] = await Promise.all([
        client.findAll<ChunterSpace>(CHUNTER_CLASS.Channel, {}),
        client.findAll<ChunterSpace>(CHUNTER_CLASS.DirectMessage, {}),
      ]);
      const spaces = [
        ...channels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const })),
        ...dms.map((d) => ({ id: d._id, name: d.name, kind: "dm" as const })),
      ];
      const messages = await client.findAll<ChatMessage>(CHUNTER_CLASS.ChatMessage, {});

      send("snapshot", {
        channels: spaces,
        messages: messages.map((m) => ({
          id: m._id,
          channelId: m.attachedTo,
          text: m.message,
          authorId: m.createdBy,
          createdOn: m.createdOn,
        })),
      });

      client.setNotifyHandler((txes) => {
        for (const tx of txes as Array<Record<string, unknown>>) {
          const createDoc = (tx as { tx?: Record<string, unknown> }).tx ?? tx;
          if (createDoc?.objectClass !== CHUNTER_CLASS.ChatMessage) continue;
          const attrs = createDoc.attributes as ChatMessage | undefined;
          if (!attrs) continue;
          send("delta", {
            id: createDoc.objectId,
            channelId: createDoc.objectSpace,
            text: attrs.message,
            authorId: createDoc.modifiedBy,
            createdOn: createDoc.createdOn ?? Date.now(),
          });
        }
      });
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

The exact shape of the tx object passed to `notify` (`TxCollectionCUD` wrapping a `TxCreateDoc`) needs confirming against what Task 1's Step 4 actually observed — adjust the field access (`tx.tx`, `objectClass`, `objectSpace`, `attributes`) to match. Task 1's manual verification script is the source of truth here, not this task's guess.

- [ ] **Step 2: Manual verification**

```bash
npm run build && npm start &
sleep 3
curl -N -H "Cookie: mobion_session=<a real session cookie from logging in>" \
  http://localhost:3000/api/mobion/chat/stream
```

Expected: a `snapshot` event within a couple seconds, connection stays open (no immediate close). Send a message from Huly's own web UI in another tab, confirm a `delta` event appears in the curl output within a few seconds. Kill the background server (`kill %1`) when done.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobion/chat/stream/route.ts
git commit -m "feat: add SSE endpoint streaming Huly channels and messages"
```

---

### Task 3: Send-message endpoint

**Files:**
- Create: `src/app/api/mobion/chat/messages/route.ts`

**Interfaces:**
- Consumes: `requireCurrentUser`, `getWorkspaceClient`, `CHUNTER_CLASS` (as Task 2), `query` (existing).
- Produces: `POST /api/mobion/chat/messages` body `{ channelId: string, channelClass: "channel" | "dm", text: string }` → `{ ok: true }` on success. No message payload in the response — the sender receives their own message back through the same `delta` stream as everyone else (per the spec's "exactly one render path" requirement).

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/chat/messages/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const channelId = String(body.channelId ?? "");
    const channelClass = body.channelClass === "dm" ? CHUNTER_CLASS.DirectMessage : CHUNTER_CLASS.Channel;
    const text = String(body.text ?? "").trim();

    if (!channelId || !text) {
      return NextResponse.json({ error: "채널과 메시지 내용이 필요합니다." }, { status: 400 });
    }

    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    await client.addCollection({
      _class: CHUNTER_CLASS.ChatMessage,
      space: channelId,
      attachedTo: channelId,
      attachedToClass: channelClass,
      collection: "messages",
      attributes: { message: text },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "메시지 전송 실패");
  }
}
```

- [ ] **Step 2: Manual verification**

With the SSE curl from Task 2 Step 2 still running in one terminal:

```bash
curl -s -X POST http://localhost:3000/api/mobion/chat/messages \
  -H "Content-Type: application/json" \
  -H "Cookie: mobion_session=<same session cookie>" \
  -d '{"channelId":"<a real channel id from the snapshot event>","channelClass":"channel","text":"test from mobion"}'
```

Expected: `{"ok":true}`, and the SSE curl in the other terminal shows a matching `delta` event within a couple seconds. Also confirm the message shows up in Huly's own web UI for that channel.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobion/chat/messages/route.ts
git commit -m "feat: add endpoint to send a Huly chat message"
```

---

### Task 4: Mobi:ON chat UI

**Files:**
- Modify: `src/components/MobiOnContent.tsx` (full rewrite, replacing the placeholder)

**Interfaces:**
- Consumes: `GET /api/mobion/chat/stream` (Task 2, SSE events `snapshot`/`delta`/`error`), `POST /api/mobion/chat/messages` (Task 3).
- Produces: nothing consumed elsewhere — this is the leaf UI component rendered by `src/app/mobion/page.tsx` (unchanged, already imports `MobiOnContent`).

- [ ] **Step 1: Write the component**

```typescript
// src/components/MobiOnContent.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";

type Channel = { id: string; name: string; kind: "channel" | "dm" };
type Message = { id: string; channelId: string; text: string; authorId: string; createdOn: number };

export default function MobiOnContent() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      es = new EventSource("/api/mobion/chat/stream");

      es.addEventListener("snapshot", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setChannels(data.channels);
        setMessages(data.messages);
        setActiveChannelId((prev) => prev ?? data.channels[0]?.id ?? null);
        setConnectionError(null);
        setReconnecting(false);
        retryDelay.current = 1000;
      });

      es.addEventListener("delta", (e) => {
        const msg = JSON.parse((e as MessageEvent).data) as Message;
        setMessages((prev) => [...prev, msg]);
      });

      es.addEventListener("error", (e) => {
        const raw = (e as MessageEvent).data;
        if (raw) {
          const data = JSON.parse(raw);
          setConnectionError(data.message === "huly_unavailable" ? "Huly 연결 실패, 잠시 후 다시 시도해 주세요." : data.message);
          es?.close();
          return;
        }
        // Browser-level connection drop (not a server-sent error event): reconnect.
        es?.close();
        if (cancelled) return;
        setReconnecting(true);
        retryTimer = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30000);
          connect();
        }, retryDelay.current);
      });
    }

    connect();
    return () => {
      cancelled = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  async function handleSend() {
    const text = draft.trim();
    if (!text || !activeChannelId) return;
    setSendError(null);
    const activeChannel = channels.find((c) => c.id === activeChannelId);
    const res = await fetch("/api/mobion/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: activeChannelId,
        channelClass: activeChannel?.kind ?? "channel",
        text,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSendError(data.error ?? "전송 실패");
      return;
    }
    setDraft("");
  }

  if (connectionError) {
    return (
      <Root>
        <ErrorBanner>{connectionError}</ErrorBanner>
      </Root>
    );
  }

  const activeMessages = messages
    .filter((m) => m.channelId === activeChannelId)
    .sort((a, b) => a.createdOn - b.createdOn);

  return (
    <Root>
      {reconnecting && <ReconnectBanner>재연결 중...</ReconnectBanner>}
      <Layout>
        <Sidebar>
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
        <Main>
          <MessageList>
            {activeMessages.map((m) => (
              <MessageRow key={m.id}>{m.text}</MessageRow>
            ))}
          </MessageList>
          <Composer>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="메시지 입력..."
            />
            <button onClick={handleSend}>보내기</button>
          </Composer>
          {sendError && <SendErrorText>{sendError}</SendErrorText>}
        </Main>
      </Layout>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: 100px 24px 24px;
`;

const ErrorBanner = styled.div`
  text-align: center;
  color: #ff6767;
  padding: 40px;
`;

const ReconnectBanner = styled.div`
  text-align: center;
  color: #9a9a9a;
  font-size: 13px;
  padding: 8px;
`;

const Layout = styled.div`
  display: flex;
  height: calc(100vh - 160px);
  max-width: 1100px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const Sidebar = styled.div`
  width: 220px;
  background: rgba(20, 20, 20, 0.6);
  padding: 12px;
  overflow-y: auto;
`;

const ChannelItem = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 10, 0.5);
`;

const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const MessageRow = styled.div`
  color: #e4e4e4;
  font-size: 14px;
`;

const Composer = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);

  input {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    outline: none;
  }

  button {
    padding: 10px 18px;
    border-radius: 10px;
    border: none;
    background: #00b5ff;
    color: #061018;
    font-weight: 700;
    cursor: pointer;
  }
`;

const SendErrorText = styled.p`
  padding: 0 12px 12px;
  color: #ff6767;
  font-size: 12px;
`;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual verification**

```bash
npm run build && npm start &
sleep 3
```

Open `http://localhost:3000/login` in two different browser profiles (or one normal + one incognito), log in as two different mobion users who both have Huly accounts linked (use the activate flow to create a second test user if needed). Confirm:
1. Both see the same channel list.
2. A message sent by one appears in the other's window within a few seconds, without a page reload.
3. Restarting the server (`kill %1` then `npm start &` again) causes the "재연결 중..." banner to show briefly, then the connection recovers on its own.

Kill the background server when done: `kill %1`.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobiOnContent.tsx
git commit -m "feat: build Mobi:ON chat UI with live channels and messages"
```

---

### Task 5: Deploy

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

Open `http://203.230.103.35:3300/login`, log in, confirm the chat UI loads with real channels and a test message sent from Huly's own web UI shows up live.
