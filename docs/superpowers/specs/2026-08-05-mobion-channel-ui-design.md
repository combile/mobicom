# Mobi:ON Channel UI Redesign — Design

## Context

Channel creation (public/private, member picker, professor visibility) and avatar
display shipped and were verified live on the production server. Live use surfaced
four rough edges: the sidebar's channel-creation control looks like a plain
dashed-border button rather than a real UI section, the creation modal uses unstyled
native checkboxes/radios that clash with the rest of the app, there's no way to add a
description or organize channels beyond a flat name list, and the chat pane shows
nothing at the top when first opened — which can read as broken rather than empty.

## Scope

In scope:
- Sidebar section header for the channel list: collapse/expand chevron, a "⋮" menu
  (sort order, refresh), and a "+" button that opens the existing creation modal
- A tag-chip filter row above the channel list, built from tags actually in use
- Channel creation: new `description` and free-text `tags` fields
- Custom-styled checkboxes/radios and general layout cleanup in the creation modal
- A header bar at the top of the message pane showing the active channel's name (and
  description, if set), replacing the current "nothing shown" state

Out of scope: channel editing/archiving UI (Huly's `archived` field exists but nothing
sets it), unread-message tracking, a "browse all channels" flow (public channels
already auto-appear for everyone, so there's nothing to browse-and-join), DM-specific
UI changes, tag management/autocomplete beyond what's already in use.

## Data Model Changes (schema v8)

Huly's `Channel` type has no tags field and we cannot extend the installed
`@hcengineering/*` package schema, so tags live in mobicom's own Postgres, keyed by
the Huly channel id:

```sql
CREATE TABLE mobion_channel_tags (
  channel_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (channel_id, tag)
);
```

`description` needs no new column — Huly's `Channel.description` field already
exists and is currently always written as `""`; this reuses it with real user input.

**Accepted race (documented, not engineered around):** channel creation calls
`createDoc` first (Huly assigns the id), then inserts the tag rows. Huly broadcasts
the creation tx to other connected clients as part of `createDoc` itself, which can
land slightly before our tag-row insert commits. In that narrow window another user's
live `channel_added` push could show the channel with no tags; a page refresh (which
re-queries the join fresh) always shows it correctly. Given this is a small internal
lab tool, pre-generating the channel id to close this window was judged not worth the
added complexity.

## Channel Creation Changes

`POST /api/mobion/chat/channels` body gains two fields:

```typescript
{ name, isPrivate, memberIds, visibleToProfessor, description, tags }
```

- `description: string` — passed straight through to Huly's `Channel.description`
  (trimmed; empty string allowed, same as today's default).
- `tags: string[]` — trimmed, empty strings and duplicates dropped, inserted into
  `mobion_channel_tags` after `createDoc` succeeds using the returned channel id.

## SSE Stream Changes

- `ChunterSpace`'s type gains `description: string` (Huly already returns it; today's
  route just doesn't select it into the outgoing payload).
- Both the `snapshot` channel list and each `channel_added` event gain
  `tags: string[]`, sourced from `mobion_channel_tags` grouped by `channel_id`.
  `channel_added` looks this up per-event (best-effort — falls back to `[]` on
  failure, never blocks the stream, matching the existing author-name-resolution
  pattern in this same route).

## Sidebar Redesign

Replaces the current "+ 채널 추가" dashed button with a Slack-style section header:

```
▾ 채널                    ⋮  +
(프로젝트) (2학년) (공지)   ← tag chips, click to filter
# general
# study-2
# announcements
```

- **Chevron**: toggles the channel list's collapsed/expanded state. Persisted to
  `localStorage` so it survives a page reload.
- **"⋮" menu**: exactly two items — "정렬: 이름순 / 최근 활동순" (client-side sort of
  the already-known channel list, no new data needed) and "새로고침" (closes and
  reopens the `EventSource`, forcing a fresh `snapshot`). Considered and deliberately
  left out: a "browse channels" action (nothing to browse-and-join under this app's
  model — public channels already auto-appear for everyone) and unread-count
  filtering (would need new per-user read-state tracking, not requested).
- **"+" button**: opens the existing creation modal, unchanged trigger behavior.
- **Tag filter row**: built from the distinct tags currently present across the
  visible channel list — no separate tag-management screen. Clicking a chip toggles
  it into an active filter set (multi-select AND semantics: a channel must have every
  active tag to stay visible); clicking an active chip again clears it. Renders
  nothing when no channel currently has any tags.
- This is a single section covering the existing flat list (channels + any DMs) as
  today — not split into separate "채널"/"다이렉트" sections, since only channel
  creation exists as a feature right now.

## Creation Modal Redesign

- Native checkboxes and radios are replaced with custom-styled equivalents (visually
  hidden native `input`, a styled box/circle next to it that fills with `#00b5ff`
  when checked) — pure CSS, no new dependency.
- Each member-picker row becomes a full clickable row (not just a small checkbox hit
  target), consistent with the rest of the app's list-item patterns.
- Field spacing/typography aligned with `LoginContent.tsx`'s existing `Field`
  pattern, for visual consistency with the rest of the app.
- New description field (single-line input) and tag input (text input, Enter to add
  a chip, × on each chip to remove) inserted between the name field and the
  public/private radio.

## Message Pane Header

A new header bar sits above `MessageList`, inside `Main`:

```
# general
자유롭게 이야기하는 채널입니다.
```

- `#`/`@` prefix by channel kind, then the name; the description (if non-empty)
  renders as a smaller line underneath.
- When no channel is selected yet (including the empty-workspace first-load case
  this whole section exists to fix), the header instead shows a short prompt
  ("채널을 선택하거나 새로 만들어 보세요") instead of the name/description pair.

## Error Handling

Consistent with the existing pattern in this app: every new failure surfaces a
Korean message inline (tag/description validation, if any, follows the same
`createChannelError` state the modal already uses). No new failure modes are
expected from the sidebar/header changes themselves, since they're read-only
renderings of data the stream already delivers.

## Testing

No test suite in this repo (unchanged from prior specs). Manual verification: create
a channel with a description and two tags, confirm both appear for a second logged-in
user via live `channel_added`; click a tag chip and confirm the channel list filters
correctly; toggle the section collapse, refresh the page, confirm it stays collapsed;
use the "⋮" sort toggle and confirm order changes; use "새로고침" and confirm the
channel list still matches the server; confirm the message-pane header shows the
right name/description per channel and the empty-state prompt when nothing is
selected.
