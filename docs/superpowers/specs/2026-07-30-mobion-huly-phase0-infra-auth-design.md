# Mobi:ON Rebuild — Phase 0: Infra & Auth Foundation

## Context

Mobi:ON is being rebuilt as a Slack-style workflow/collaboration platform for the lab
(task sharing, project visibility, presence check-in, professor oversight), with
[Huly](https://github.com/hcengineering/platform) self-hosted as the backend engine and
a fully custom Next.js frontend on top (own design system, separate from the public
marketing site). This is Phase 0 of a multi-phase rebuild:

- **Phase 0 (this spec)**: Huly self-host deployment + auth bridge foundation
- **Phase 1**: Slack-style app shell + task/issue tracking + channel chat
- **Phase 2**: Manual presence check-in/out + professor dashboard
- **Phase 3**: Docs/links sharing, notifications, polish

The existing Postgres-backed Mobi:ON (`mobion_users`, `mobion_tasks`, `mobion_docs`,
`mobion_messages`, `mobion_links`, `mobion_milestones`, `mobion_task_checklist`) is
discarded — no production user data exists yet, so no migration is needed. The auth
plumbing (`mobion-auth.ts`, `mobion-db.ts`) is solid and is kept as the foundation for
the new system's login.

## Goals

- Lab members log in through our own branded login screen. They never see Huly's login,
  URL, or branding — Huly is an implementation detail.
- Our server can act on Huly on behalf of any logged-in user (create issues, read
  channels, etc.) without the browser ever holding Huly credentials or talking to Huly
  directly.
- New lab members can be provisioned (our account + linked Huly account) through an
  invite flow, without manual Huly admin work per person.

## Non-goals (deferred to later phases)

- Any user-facing UI beyond what's needed to prove the auth bridge works (Phase 1+).
- Presence check-in, professor dashboard (Phase 2).
- Migrating any data from the old Mobi:ON tables — there is none to migrate.

## Architecture

```
Browser
  │  (our cookie session only)
  ▼
Next.js app (this repo)
  │  our own login / session (Postgres: mobion_users, mobion_sessions)
  │
  ├─ API routes (server-side only) ── @hcengineering/api-client (Node SDK)
  │                                         │
  │                                         ▼
  │                                   Huly transactor (self-hosted, Docker Compose)
  │
  └─ mobion_huly_link table (user_id → huly account id + encrypted credential)
```

Key rule: **the browser never talks to Huly.** Every Huly operation goes through a
Next.js API route that holds the user's linked Huly credential server-side and calls
the Huly Node SDK. This keeps Huly's existence, URL, and auth model entirely hidden
behind our own UI, matching the "our login screen" decision.

## Huly deployment

- Self-hosted via the official [`huly-selfhost`](https://github.com/hcengineering/huly-selfhost)
  Docker Compose setup, on the lab's own server.
- Requires (per Huly's documented minimums): 2 vCPU / 8 GB RAM (4 vCPU / 16 GB
  recommended), running CockroachDB, Elasticsearch, Redpanda, MinIO, Redis, Nginx.
- Runs on an internal-only address/port reachable from the Next.js server (not exposed
  publicly) where possible; if it must be publicly reachable for Huly's own internal
  needs, it stays undiscoverable/unlinked from the public site — no nav link, no public
  DNS advertised to users.
- One Huly **workspace** for the whole lab; every lab member is a member of that single
  workspace.
- Server provisioning (OS choice, domain, TLS termination) is an implementation-time
  runbook step, not a design decision — filled in when the plan is executed against the
  real server.

## Data model changes

**Kept as-is** (already solid, reused for our own login):
- `mobion_users` (id, name, email, password_hash)
- `mobion_sessions` (id, user_id, token_hash, expires_at)

**New:**
```sql
CREATE TABLE mobion_huly_link (
  user_id UUID PRIMARY KEY REFERENCES mobion_users(id) ON DELETE CASCADE,
  huly_account_email TEXT NOT NULL,
  huly_credential_encrypted TEXT NOT NULL, -- see "Credential storage" below
  huly_workspace TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Dropped** (old Mobi:ON feature data, superseded by Huly):
`mobion_tasks`, `mobion_docs`, `mobion_messages`, `mobion_links`, `mobion_milestones`,
`mobion_task_checklist`.

## Credential storage

Huly's API client authenticates a session "by email/password or token." We prefer
storing a **long-lived Huly token** over a raw password where Huly's account service
supports issuing one; if only password-based re-auth is available, we store the
Huly account's password (a strong, randomly generated one we set at provisioning time,
never chosen by the user) rather than the user's own site password.

Either way, the value is encrypted at rest with AES-256-GCM using a server-only key
(`MOBION_HULY_ENCRYPTION_KEY` env var, generated once, never committed), using Node's
built-in `crypto` module — no new dependency, consistent with the existing
`scrypt`/`randomBytes` usage in `mobion-auth.ts`.

## Account provisioning flow

1. An existing member (or the professor) invites a new lab member by email. Our backend
   creates a pending invite (token + expiry), no Postgres user row yet.
2. Invitee opens the invite link, sets their own password on **our** login (this becomes
   their `mobion_users` row + password_hash — completely independent from Huly).
3. On activation, our backend, using a Huly **admin/service account**, provisions a new
   Huly account for this person and adds them to the lab's single Huly workspace,
   generating a random strong Huly password for that account.
4. Backend logs in to Huly once with that generated credential to obtain a session
   token, encrypts it, and stores it in `mobion_huly_link`.
5. From then on, any API route that needs to act as this user decrypts the stored
   credential and calls the Huly SDK server-side. If the token has expired, the backend
   re-authenticates using the stored (encrypted) password and refreshes the stored
   token.

## API surface (this phase)

Enough to prove the bridge works end-to-end; no feature UI yet.

- `POST /api/mobion/huly/ping` — server-side: decrypt the current user's Huly
  credential, connect via the SDK, run a trivial read (e.g. `findAll` on the workspace's
  own account doc), return success/failure. This is the acceptance check for the whole
  phase.
- Existing `/api/mobion/auth/*` routes are kept, adjusted only to drop references to the
  removed feature tables.

## Error handling

- Huly unreachable (server down, network issue): API routes return a clear
  `503 huly_unavailable`-style error; no silent failures. Phase 1 UI will surface this as
  a maintenance state, out of scope here.
- Stored Huly token invalid/expired: backend transparently re-authenticates once using
  the stored password-derived credential before failing.
- Provisioning failure (Huly account creation fails after our user row is created):
  surfaced to the inviter/admin; the `mobion_users` row is not rolled back automatically
  since the person may retry provisioning — a retry path re-runs step 3–4 for a user
  that has no `mobion_huly_link` row yet.

## Testing / verification

No automated test framework exists in this repo today. Verification for this phase is a
manual runbook, executed once the real Huly server is up:

1. Provision one real test account end-to-end (invite → activate → Huly account
   created → linked row present with encrypted credential).
2. Call `/api/mobion/huly/ping` as that user, confirm a successful round trip to Huly.
3. Manually inspect the `mobion_huly_link` row to confirm the stored credential is
   ciphertext, not plaintext.
4. Kill the Huly stack temporarily, confirm `/api/mobion/huly/ping` fails with the
   expected `huly_unavailable` error rather than hanging or crashing.

## Open items for implementation time

- Exact server/OS/domain for the Huly deployment (lab-provided; not yet chosen).
- Whether Huly's account service exposes a true long-lived token API vs. only
  password re-auth — confirmed against the actual self-hosted instance once it's up,
  not from documentation alone.
