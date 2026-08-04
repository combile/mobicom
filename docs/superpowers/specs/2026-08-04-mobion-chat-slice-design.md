# Mobi:ON Chat Slice — Design

## Context

Phase 0 (auth bridge: our own login, invite-based Huly account provisioning, `/api/mobion/huly/ping` acceptance check) is complete and deployed on the lab server, backed by a real self-hosted Huly instance. `/mobion` is currently a static "coming soon" placeholder.

This is the first slice of the previously-deferred custom Slack-style frontend: a logged-in user should be able to see their real Huly channels and DMs, read messages, and send messages, with new messages from others appearing live.

Direction confirmed earlier in the project: Huly is backend-only; we build our own frontend rather than embedding/linking to Huly's stock web UI, and Huly credentials stay server-side — the browser only ever talks to our own API.

## Scope

In scope:
- List the logged-in user's Huly `Channel`s and `DirectMessage`s (chunter plugin spaces)
- Show messages (`ChatMessage`) for the selected channel/DM, oldest-first, with live updates when others post
- Send a message from the UI
- Basic connect/reconnect error handling

Out of scope (future slices): threads, reactions, mentions, file attachments, presence/online status, message editing/deleting, channel creation, professor dashboard.

## Architecture

Server-side Huly connection + SSE relay to the browser. The browser never receives Huly credentials or tokens — it only talks to our own `/api/mobion/*` routes, consistent with the auth bridge's existing security boundary (Huly credentials are stored encrypted server-side and were deliberately kept off the client during Phase 0).

Rejected alternative: browser connects directly to Huly via `@hcengineering/api-client`. This would need us to hand the browser a Huly session token or password, which breaks the boundary above and adds real client bundle weight for a single chat slice. The SSE relay costs one persistent Huly connection per active mobion session on our own already-persistent Node server (via pm2, not serverless), which is an acceptable trade for a small lab.

## Components

1. **`src/lib/mobion-huly.ts`** (modify, existing file from Phase 0) — add `getWorkspaceClient(hulyLink): Promise<HulyWorkspaceClient>` alongside the existing `provisionHulyAccount`/`pingAsUser`. Connects using the user's stored encrypted Huly credentials (reuses `decryptSecret` from `mobion-crypto.ts`), caches the live connection per Huly account email in a process-global `Map` so repeated requests/reconnects for the same user reuse one Huly session instead of opening a new one per request. Callers use it to run `findAll`/`addCollection` against chunter's `Channel`, `DirectMessage`, `ChatMessage` classes.

2. **`GET /api/mobion/chat/stream`** (new) — SSE endpoint, requires an authenticated mobion session (`requireCurrentUser()`). On open: fetches the user's channels/DMs and their most recent messages via `getWorkspaceClient`, writes an initial `snapshot` event. Then registers a Huly tx listener scoped to this workspace client; whenever a relevant `ChatMessage`/`Channel` tx arrives, writes a `delta` event. Cleans up the tx listener when the client disconnects (SSE `request.signal` abort).

3. **`POST /api/mobion/chat/messages`** (new) — body `{ channelId, text }`. Requires auth. Uses `getWorkspaceClient` + Huly `TxOperations` to create a `ChatMessage` attached to the channel. No response body needed beyond `{ ok: true }` — the sender sees their own message via the same SSE stream as everyone else, so there is exactly one code path that renders a sent message, not two.

4. **`src/components/MobiOnContent.tsx`** (rewrite) — two-column layout: channel/DM list on the left (name, unread-agnostic for this slice), message thread + composer on the right. Opens an `EventSource` to `/api/mobion/chat/stream` on mount, applies `snapshot`/`delta` events to local state, reconnects with exponential backoff (capped, e.g. 1s → 2s → 4s → ... → 30s) if the connection drops, and shows a small "재연결 중..." banner while doing so.

## Data Flow

Login → `/mobion` → `EventSource` opens `/api/mobion/chat/stream` → server connects to Huly (or reuses cached connection) → initial snapshot (channel list + recent messages per channel) streamed down → user selects a channel → UI filters already-loaded messages for that channel (no extra round-trip, since the snapshot carries all of them for this slice's expected small channel counts) → user types and sends → `POST /api/mobion/chat/messages` → Huly applies the tx → every open SSE connection watching that channel (including the sender's own) receives a `delta` event → UI appends the message.

## Error Handling

- Huly connect failure when opening the SSE stream (e.g. huly_unavailable, matching the existing `pingAsUser` failure mode): stream emits an `error` event with a user-facing message and closes; UI shows a "Huly 연결 실패, 잠시 후 다시 시도해 주세요" banner instead of the chat view.
- SSE connection drop (network blip, server restart): browser-side `EventSource` reconnects automatically with exponential backoff; UI shows the reconnecting banner but keeps already-loaded messages visible rather than clearing them.
- Send failure (`POST /api/mobion/chat/messages` non-200): show an inline error near the composer, keep the typed text so the user doesn't lose it, don't optimistically render the message (avoids a duplicate once the real delta arrives).

## Testing

No existing test suite in this repo (Next.js app, no test runner configured). Verification is manual: log in as two different mobion users in two browser sessions, confirm messages sent by one appear live for the other, confirm channel list matches what's visible in Huly's own web UI for the same account, confirm a killed/restarted server reconnects the SSE stream without a full page reload.
