# Mobi:ON Slack-style Sidebar + Mentions — Design

## Context

User feedback this session: overall chat design should feel more like Slack, plus a mention (@) feature, and a concrete visual bug on `/tasks` (already found, fixed, and committed locally as `45f7404`, unrelated to this spec). This spec covers the two design asks: (1) sidebar restructuring toward a Slack-like channel/DM split with presence, and (2) mentions. Scope was narrowed interactively: DM section shows existing DMs only (no "start new DM" UI), mentions cover autocomplete-while-typing + highlight-in-sent-messages only (no separate notification/badge system).

All work here is additive to `MobiOnContent.tsx` and its API routes; it does not touch the tasks/milestones feature or the channel-creation modal built earlier this session.

## Scope

In scope:
- Split the sidebar's single `visibleChannels` list into a "채널" section and a "직접 메시지" section.
- Online/offline presence dots next to each DM entry, sourced from Huly's existing `core:class:UserStatus`.
- `@` mention autocomplete while composing a message.
- Mention storage as an inline marker in the message text (no schema change to Huly).
- Rendering sent messages with mentions highlighted, plus a subtle background highlight on messages that mention the current user.
- Grouping consecutive messages from the same sender within 5 minutes into a single visual block (Slack-style compact list).

Out of scope (explicitly excluded per user's own scoping answers):
- "Start a new DM" picker/UI — this round only lists DMs that already exist.
- Mention notifications, unread badges, or a "mentions" inbox view.
- Any change to the channel-creation modal, tags, or `ChannelMenu` (⋮) built in the prior icon-redesign round.
- Message hover-toolbar actions (edit/delete/react) — not requested, would be new scope.

## Section 1 — Sidebar: channel/DM split + online status

Split the sidebar's `visibleChannels` render into two grouped sections instead of one flat list, keyed off the existing `c.kind` field (`"channel" | "dm"`, `MobiOnContent.tsx:11`):

```
▾ 채널              ⋮  +
(태그 칩들...)
# general
# random

▾ 직접 메시지
🟢 이은식
⚪ 박영희
```

- Both sections reuse the existing collapsible chevron pattern (already used once for the single channel list). Each section gets its own open/closed `useState<boolean>`.
- The `⋮` menu (정렬/새로고침, see `ChannelMenu` at `MobiOnContent.tsx:320`) and the tag filter chips stay attached to the 채널 section only — DMs have no sort criteria worth exposing and "새로고침" reconnects the whole SSE stream, which isn't section-specific.
- **Presence data source**: Huly's Tracker-adjacent `core` plugin already defines `UserStatus` (`{ online: boolean; user: AccountUuid }`, confirmed by reading `@hcengineering/core/src/classes.ts` and `component.ts` — class id is `core:class:UserStatus`). The existing SSE route (`src/app/api/mobion/chat/stream/route.ts:49`) already has a comment noting it receives "unrelated UserStatus/Collaborator noise" in the notify-handler tx stream and currently discards it.
  - Initial snapshot: on stream connect, `client.findAll(core:class:UserStatus, {})`, matched by `AccountUuid` against `mobion_huly_link.huly_account_uuid` to resolve to a `mobion_users.id`.
  - Live updates: the notify handler starts capturing (rather than ignoring) tx whose class is `core:class:UserStatus`, pushed to the client as a new SSE event type (e.g. `presence`), keyed by `mobion_users.id`.
  - **No new real-time infrastructure** — this reuses the single existing SSE connection.
  - A DM entry with no resolvable `AccountUuid` (user never linked to Huly) renders with a neutral/offline dot — this is the existing fallback state, not a new error path.

## Section 2 — Mention storage format + autocomplete

- **Storage format**: `@[userId:이름]` is written directly into the message text sent to Huly's `ChatMessage.message` field — no Huly schema change, since chunter messages are already plain text as far as this app's integration is concerned. `userId` here is mobicom's own `mobion_users.id` (a stable UUID), not a Huly `AccountUuid` — the marker is purely an internal reference used by this app's own renderer, so it works identically for users who have and haven't been linked to Huly yet.
- **Autocomplete data source**: `GET /api/mobion/users/all` (the unfiltered endpoint added for the task-assignee picker, `src/app/api/mobion/users/all/route.ts`) — not the older `GET /api/mobion/users`, which excludes professors and any user not yet Huly-linked (`WHERE l.huly_social_id IS NOT NULL AND u.is_professor = false`). Mentions should be able to tag anyone in the workspace, including professors, so the unfiltered list is the correct source here; using the filtered one would silently make professors un-mentionable.
- **Interaction**: typing `@` opens a dropdown filtered by subsequent characters (case-insensitive substring match against `name`); arrow keys move selection, `Enter` or click selects, `Escape` or clicking outside closes it (same outside-click/`Escape` pattern already used by `CustomSelect` and `ChannelMenu`). Selecting a candidate replaces the in-progress `@query` text with `@[userId:이름] ` (trailing space) and returns focus to the input.
- Candidate list is capped at a reasonable on-screen count (e.g. 8) with the rest reachable by continuing to type — no pagination UI, this is a lab-scale user list.

## Section 3 — Mention rendering

- On render, each message body is scanned with a regex (`/@\[([^:]+):([^\]]+)\]/g`) and split into text/mention segments. Each mention segment renders as a `<Mention>` inline element: bold, `#00b5ff` (matching the site's existing accent color used elsewhere for active states), no background by default.
- If the parsed `userId` equals the current logged-in user's id, the entire message row (`MessageRow`, `MobiOnContent.tsx:671`) gets `background: rgba(0, 181, 255, 0.08)` (the site's existing accent color at low opacity, matching the tint already used for hover/active states elsewhere) so a self-mention is visible while scanning the channel, without needing a separate notification system.
- This rendering logic applies uniformly regardless of who sent the message — no special-casing by author.
- Unresolvable markers (e.g. a `userId` no longer present in `mobion_users`, such as a deleted account) fall back to rendering the literal `이름` text from the marker, un-highlighted, rather than erroring — mirroring this app's existing pattern of graceful fallback over thrown errors in render paths.

## Section 4 — Message list grouping (Slack-style compact layout)

- Messages are grouped client-side (no data model change): consecutive messages are treated as one visual group when they share the same `authorId` AND the gap between them is under 5 minutes.
- Only the first message in a group renders the avatar, author name, and timestamp header (the existing `MessageRow` layout, `MobiOnContent.tsx:407`). Subsequent messages in the same group render with a narrower left margin (aligned under the name, not the avatar) and no repeated header.
- On hover over a grouped (header-less) message, a small timestamp fades in to the left of the message text (absolutely positioned, doesn't shift layout).
- Grouping is purely a render-time concern in `MobiOnContent.tsx` — the message list state and API responses are unchanged.

## Error Handling

- Presence: if `findAll(core:class:UserStatus, {})` fails or times out on stream connect, DM entries render with neutral/offline dots rather than blocking the sidebar from rendering (consistent with the "graceful fallback" pattern above).
- Mention autocomplete: if `GET /api/mobion/users/all` fails, the `@` dropdown simply doesn't open (typed `@text` stays as plain text) — this is a non-blocking enhancement, not a required part of sending a message.
- No new failure modes are introduced in the message-send path itself — mentions are just text content, so existing send/error handling (Korean error messages on send failure) is untouched.

## Testing Notes

- Sidebar split and grouping are pure render-logic changes, verifiable via component-level checks on grouping boundaries (same author within/over 5 minutes) and section-key filtering (`kind === "channel"` vs `"dm"`).
- Mention parsing regex should be tested against: no mentions, one mention, multiple mentions, a mention adjacent to punctuation, and an unresolvable `userId`.
- Presence and autocomplete are integration points against live Huly/DB state — verified manually in a real browser session (as done for the icon-redesign and tasks features earlier this session), not mocked.
