# Mobi:ON Channel Creation & Avatars — Design

## Context

The chat slice (channel/DM list, message read/send, live SSE updates, author name + timestamp) is deployed and working. This adds two independent pieces the user asked for next: creating new channels (public and private, with a professor-visibility option) and profile picture uploads shown next to chat messages.

## Scope

In scope:
- Create a channel from the UI: name, public/private, member picker (private only), a separate "교수님에게 공개" toggle (private only)
- Server-side enforcement of channel visibility by membership — a real gap found while designing this: the current SSE route fetches all channels unconditionally, so "private" has no actual effect yet
- Duplicate channel name rejected with a clear Korean error
- Profile picture upload via a new `/profile` page (up to 10MB), shown as a circular avatar next to each chat message; users without one get an initials-based fallback avatar (no upload required)
- User-facing Korean error messages for every new failure mode introduced here (duplicate name, oversized file, non-image file, empty name)

Out of scope (unchanged from the chat slice spec): threads, reactions, channel archiving/editing/deletion, message editing/deleting, avatar cropping UI (resize is automatic, not user-adjustable).

## Data Model Changes (schema v6)

- `mobion_users.is_professor BOOLEAN NOT NULL DEFAULT false` — sets which single account (there is exactly one professor in this lab) gets auto-added to a private channel when its creator toggles "교수님에게 공개". Set directly via SQL on the professor's own account, the same one-time-bootstrap pattern already used for `is_admin`.
- `mobion_users.avatar_url TEXT` — relative path (e.g. `/uploads/avatars/<userId>.png`) to the uploaded avatar, `NULL` until the user uploads one.

## Channel Visibility Model

Every chunter `Channel` doc already has a `private: boolean` and `members: PersonId[]` field (Huly's own `Space` type). Today's SSE route ignores both and returns every channel unconditionally — that must change:

- **Snapshot** (`GET /api/mobion/chat/stream`): a channel is included if `channel.private === false`, OR the requesting user's `huly_social_id` appears in `channel.members`.
- **Delta** (new channel created, or a message posted in an existing channel): before forwarding to a given SSE connection, the server checks the same rule against that connection's own user — a private channel's `TxCreateDoc`/message events must not reach a browser tab whose user isn't a member. This is a defensive check on *our* side: whether Huly's own live-push already scopes delivery by space membership is unverified, and this feature is the first time channel privacy actually matters, so we do not assume it and filter regardless.
- DM channels (`chunter:class:DirectMessage`) already behave as implicitly private in practice (only ever created between two specific accounts elsewhere) and are unaffected by this — this filter only changes `Channel` (not `DirectMessage`) handling.

## Channel Creation

`POST /api/mobion/chat/channels`, body `{ name: string, isPrivate: boolean, memberIds: string[], visibleToProfessor: boolean }` (`memberIds` are `mobion_users.id` values from the member-picker checkboxes, resolved server-side to `huly_social_id`s before writing to Huly; `visibleToProfessor` is only meaningful when `isPrivate` is true).

- Reject empty/whitespace-only `name` with 400.
- Query existing channels (`findAll(Channel, {name})`) and reject a case-sensitive duplicate with 409 + `"중복된 채널 이름입니다."`.
- Build the Huly `members` array: for a public channel, `[]`. (Verified against the live server: the existing `general`/`random` channels actually have non-empty `members` — Huly appears to auto-populate membership for some channels independent of our own logic. That's irrelevant here: our own visibility filter, defined below, treats a channel as visible-to-everyone purely from `private === false` and never inspects `members` for a public channel, so an empty `members` array on a newly-created public channel is harmless.) For a private channel, the selected users' `huly_social_id`s, plus the professor's `huly_social_id` (looked up via `is_professor = true`) when `visibleToProfessor` is checked. A `memberIds` entry for a user with no `huly_social_id` yet (never connected to Huly) is skipped rather than erroring — best-effort, matches the existing best-effort backfill pattern.
- `createDoc(CHUNTER_CLASS.Channel, HULY_CORE_SPACE, { name, description: "", private: isPrivate, members, archived: false, topic: "" })` via the existing `getWorkspaceClient`'s `TxOperations` (needs a new `createDoc` wrapper method alongside the existing `addCollection` one, same `evictOnFailure` treatment).
- On success, the creator's own SSE stream picks up the new channel via the normal live-tx delta path (`TxCreateDoc` / `objectClass: Channel` is a new case the delta filter must recognize and forward as a `channel_added` event, distinct from a `delta` message event) — no separate response payload needed, matching the "exactly one render path" principle already used for messages.

## Channel Creation UI

Sidebar gets a "+ 채널 추가" control opening a small modal: name field, public/private radio, and (private only) a scrollable checkbox list of all `mobion_users` who have a linked Huly account (fetched via a small new `GET /api/mobion/users` — id/name only, no emails/credentials) plus a single "교수님에게 공개" toggle below the list, not mixed into it. Submit errors (duplicate name, network failure) render inline in the modal, not as a silent failure — the modal stays open with the typed values intact so the user doesn't retype everything.

## Avatar Upload

`PATCH /api/mobion/profile` gains an optional `avatarBase64` field (data URL, e.g. `data:image/png;base64,...`) alongside the existing `name`/`currentPassword`/`newPassword` fields it already handles. Client-side: `/profile`'s file input reads the chosen file, draws it into an offscreen `<canvas>` cropped to a centered square and downscaled to 128×128, and sends that as the base64 payload — keeping the actual bytes sent small regardless of the original file size. Server-side validation, in order: reject non-image content-type strings in the data URL prefix (400, `"이미지 파일만 업로드할 수 있습니다."`), reject a decoded byte length over 10MB (400, `"파일 크기는 10MB 이하여야 합니다."` — generous relative to what the 128×128 canvas output will actually be, since the limit guards the upload itself, not the stored file), then write to `public/uploads/avatars/<userId>.png` (directory created if missing) and `UPDATE mobion_users SET avatar_url = ...`.

`public/uploads/` is added to `.gitignore` — user-uploaded content must never be committed. The directory needs to exist on the production server (created on first upload, not a deploy-time step).

## Avatar Display

The SSE route's existing author-name join (added in the chat-slice fix round) is extended to also select `avatar_url`, included in both the `snapshot` and `delta` message payloads as `authorAvatarUrl: string | null`. `MobiOnContent.tsx` renders a small circular `<img>` when present; when `null`, an initials-based colored circle (first character of `authorName`, a deterministic color derived from `authorId` so the same person always gets the same color) — no extra network request either way.

## Header Change

The logged-in user's name in the header currently doubles as the logout button. That's ambiguous once there's a profile page to link to. Split it: the name becomes a link to `/profile`, and a separate small icon-only logout control sits next to it.

## Error Handling

Every new failure mode surfaces a Korean message to the user, inline near the relevant control (channel creation modal, avatar upload button, profile name/password fields) — never a silent failure or a raw English/technical string. Network-level failures (fetch throwing) get a generic `"요청에 실패했습니다. 다시 시도해 주세요."` fallback.

## Testing

No test suite in this repo (Next.js app, no test runner configured), consistent with the chat slice. Verification is manual: create a public channel, confirm it appears live for a second logged-in user; create a private channel with one member and the professor toggle on, confirm only that member + the professor account (not a third uninvolved user) see it; attempt a duplicate name and confirm the Korean error; upload an avatar and confirm it appears next to that user's messages for other users without a page reload; upload a >10MB file and a non-image file and confirm both are rejected with the expected message.
