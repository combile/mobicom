# Mobi:ON Huly Rebuild — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the auth bridge between our own branded login and a self-hosted Huly instance, so our server can act on Huly on behalf of any lab member without the browser ever knowing Huly exists.

**Architecture:** Next.js API routes are the only thing that ever talks to Huly. They use `@hcengineering/account-client` (admin operations: invite + provision a Huly account) and `@hcengineering/api-client` (per-user operations: connect and call the platform as that user). Huly credentials are encrypted at rest in Postgres (`mobion_huly_link`), keyed by our own `mobion_users.id`.

**Tech Stack:** Next.js (existing), Postgres via `pg` (existing), `@hcengineering/account-client` + `@hcengineering/api-client` (new), Node's built-in `crypto` (no new crypto library).

## Global Constraints

- No automated test framework exists in this repo (confirmed: no jest/vitest config, no `test` script). Every task's verification step is either `npx tsc --noEmit -p tsconfig.json` (type correctness), a `psql` check against the local Postgres, or a `curl` against `npm run dev` — never a fabricated test command.
- Follow existing code conventions: files under `src/lib/mobion-*.ts`, API routes under `src/app/api/mobion/**/route.ts`, Korean user-facing error strings (matches every existing route), `mobionApiError()` for error responses, `checkRateLimit()` on any unauthenticated-writable endpoint.
- Never store a Huly password or token in plaintext. Every secret written to `mobion_huly_link` goes through `encryptSecret()` from Task 2 first.
- Reference: design spec at `docs/superpowers/specs/2026-07-30-mobion-huly-phase0-infra-auth-design.md`.

---

### Task 1: Add Huly SDK dependencies and env scaffolding

**Files:**
- Modify: `package.json` (add dependencies)
- Modify: `.env.example`

**Interfaces:**
- Produces: `HULY_URL`, `HULY_ACCOUNTS_URL`, `HULY_WORKSPACE_URL`, `HULY_ADMIN_EMAIL`, `HULY_ADMIN_PASSWORD`, `MOBION_HULY_ENCRYPTION_KEY` env vars, referenced by every later task in this plan.

- [ ] **Step 1: Install the Huly SDK packages**

Run:
```bash
npm install @hcengineering/account-client @hcengineering/api-client
```

If this fails with `EACCES` on the local npm cache (a pre-existing machine issue, root-owned
files under `~/.npm`), either fix it permanently with
`sudo chown -R $(id -u):$(id -g) ~/.npm`, or work around it once with
`npm install @hcengineering/account-client @hcengineering/api-client --cache /tmp/npm-cache-scratch`.

- [ ] **Step 2: Verify the install**

Run: `node -e "console.log(require('@hcengineering/account-client/package.json').version, require('@hcengineering/api-client/package.json').version)"`
Expected: prints two version strings (e.g. `0.7.423 0.7.423`), no error.

- [ ] **Step 3: Add the new env vars to `.env.example`**

Append to `.env.example`:
```bash

# Huly self-host (Phase 0 auth bridge)
HULY_URL=https://huly.example.org
HULY_ACCOUNTS_URL=https://huly.example.org/_accounts
HULY_WORKSPACE_URL=mobicom
HULY_ADMIN_EMAIL=admin@example.org
HULY_ADMIN_PASSWORD=change-me
# 32-byte key, base64-encoded. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
MOBION_HULY_ENCRYPTION_KEY=
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add Huly SDK dependencies and env scaffolding"
```

---

### Task 2: Credential encryption helper

**Files:**
- Create: `src/lib/mobion-crypto.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string`, `decryptSecret(stored: string): string` — used by Task 5 (Huly wrapper) and Task 6 (activation route) to read/write `mobion_huly_link.huly_credential_encrypted`.

- [ ] **Step 1: Write the module**

```typescript
// src/lib/mobion-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.MOBION_HULY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("MOBION_HULY_ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("MOBION_HULY_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

/** Encrypts a secret for storage. Output format: "<iv>.<authTag>.<ciphertext>", each base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".");
}

/** Reverses encryptSecret(). Throws if the value is malformed or the auth tag doesn't match. */
export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Verify the round trip manually**

Run:
```bash
MOBION_HULY_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
node -e "
const { randomBytes, createCipheriv, createDecipheriv } = require('crypto');
const key = Buffer.from(process.env.MOBION_HULY_ENCRYPTION_KEY, 'base64');
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update('hello-huly', 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const stored = [iv, tag, ct].map(b => b.toString('base64')).join('.');
const [ivB64, tagB64, dataB64] = stored.split('.');
const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
console.log(out === 'hello-huly' ? 'PASS' : 'FAIL: ' + out);
"
```
Expected: `PASS` — this exercises the exact same AES-256-GCM encrypt/decrypt logic that `mobion-crypto.ts` implements, without needing a TS runner.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-crypto.ts
git commit -m "feat: add AES-256-GCM credential encryption helper"
```

---

### Task 3: Database schema migration

**Files:**
- Modify: `src/lib/mobion-db.ts`

**Interfaces:**
- Produces: tables `mobion_invites` (id, email, token_hash, invited_by, expires_at, used_at, created_at) and `mobion_huly_link` (user_id, huly_account_email, huly_credential_encrypted, huly_workspace, created_at, updated_at); an `is_admin BOOLEAN NOT NULL DEFAULT false` column on `mobion_users`. Consumed by Task 4 (invites, admin gate) and Task 6 (activation).
- Removes: tables `mobion_tasks`, `mobion_task_checklist`, `mobion_docs`, `mobion_messages`, `mobion_links`, `mobion_milestones` (superseded by Huly, per design spec).

- [ ] **Step 1: Bump the schema version and replace the table definitions**

In `src/lib/mobion-db.ts`, change:
```typescript
const MOBION_SCHEMA_VERSION = 3;
```
to:
```typescript
const MOBION_SCHEMA_VERSION = 4;
```

Then replace everything from the `mobion_tasks` table creation through the end of the `mobion_task_checklist` table creation (i.e. all six `CREATE TABLE IF NOT EXISTS mobion_tasks` / `mobion_docs` / `mobion_messages` / `mobion_links` / `mobion_milestones` / `mobion_task_checklist` blocks, plus their `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` follow-ups) with:

```typescript
      await pool.query(`DROP TABLE IF EXISTS mobion_task_checklist`);
      await pool.query(`DROP TABLE IF EXISTS mobion_tasks`);
      await pool.query(`DROP TABLE IF EXISTS mobion_docs`);
      await pool.query(`DROP TABLE IF EXISTS mobion_messages`);
      await pool.query(`DROP TABLE IF EXISTS mobion_links`);
      await pool.query(`DROP TABLE IF EXISTS mobion_milestones`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_invites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL,
          token_hash TEXT UNIQUE NOT NULL,
          invited_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_huly_link (
          user_id UUID PRIMARY KEY REFERENCES mobion_users(id) ON DELETE CASCADE,
          huly_account_email TEXT NOT NULL,
          huly_credential_encrypted TEXT NOT NULL,
          huly_workspace TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
      );
```

Add the `ALTER TABLE mobion_users ADD COLUMN IF NOT EXISTS is_admin ...` statement
directly after the `mobion_users` table's own `CREATE TABLE IF NOT EXISTS` block (the
one already earlier in the file, unchanged) — not inside the block being replaced above.
Only the `mobion_huly_link` creation and everything after it in this task's snippet is
new; the `mobion_users` and `mobion_sessions` `CREATE TABLE` blocks are otherwise
unchanged.

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Verify the migration runs against the local database**

Run:
```bash
npm run dev &
sleep 3
curl -s http://localhost:3000/api/mobion/auth/me
kill %1
```
Expected: `{"user":null}` (this hits `getCurrentUser()`, which calls `ensureMobionSchema()` internally — a 200 response with no crash confirms the schema migration ran without error).

- [ ] **Step 4: Verify the old tables are gone and the new ones exist**

Run: `psql "$DATABASE_URL" -c "\dt mobion_*"`
Expected: the table list includes `mobion_users`, `mobion_sessions`, `mobion_invites`, `mobion_huly_link`, and does **not** include `mobion_tasks`, `mobion_docs`, `mobion_messages`, `mobion_links`, `mobion_milestones`, `mobion_task_checklist`.

Also run: `psql "$DATABASE_URL" -c "\d mobion_users"`
Expected: the column list includes `is_admin` (type `boolean`, default `false`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobion-db.ts
git commit -m "feat: drop legacy Mobi:ON feature tables, add Huly link + invite tables"
```

---

### Task 4: Invite issuing, gated to admins

**Files:**
- Modify: `src/lib/mobion-auth.ts` (add `is_admin` to `MobionUser` and to `getCurrentUser()`'s query)
- Create: `src/lib/mobion-invites.ts`
- Create: `src/app/api/mobion/invites/route.ts`

**Interfaces:**
- Consumes: `requireCurrentUser()` from `src/lib/mobion-auth.ts` (returns the updated `MobionUser`, now including `is_admin: boolean`); `query()` from `src/lib/mobion-db.ts`; `checkRateLimit()` from `src/lib/mobion-rate-limit.ts`; `mobionApiError()` from `src/lib/mobion-api.ts`; the `is_admin` column added in Task 3.
- Produces: `createInvite(email: string, invitedBy: string): Promise<{ token: string; expiresAt: Date }>`, `findValidInvite(token: string): Promise<{ id: string; email: string } | null>`, `consumeInvite(inviteId: string): Promise<void>` — consumed by Task 6 (activation route). `MobionUser.is_admin` is also consumed by Task 6/7 in later phases wherever an admin-only view needs the same check.

- [ ] **Step 1: Add `is_admin` to the current-user type and query**

In `src/lib/mobion-auth.ts`, change:
```typescript
export type MobionUser = {
  id: string;
  name: string;
  email: string;
};
```
to:
```typescript
export type MobionUser = {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
};
```

And in `getCurrentUser()`, change the query from:
```typescript
  const result = await query<MobionUser>(
    `SELECT u.id, u.name, u.email
     FROM mobion_sessions s
     JOIN mobion_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [sha256(token)],
  );
```
to:
```typescript
  const result = await query<MobionUser>(
    `SELECT u.id, u.name, u.email, u.is_admin
     FROM mobion_sessions s
     JOIN mobion_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()
     LIMIT 1`,
    [sha256(token)],
  );
```

- [ ] **Step 2: Write the invite module**

```typescript
// src/lib/mobion-invites.ts
import { createHash, randomBytes } from "crypto";
import { query } from "./mobion-db";

const INVITE_DAYS = 7;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createInvite(email: string, invitedBy: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO mobion_invites (email, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [email.toLowerCase(), sha256(token), invitedBy, expiresAt],
  );

  return { token, expiresAt };
}

export async function findValidInvite(token: string) {
  const result = await query<{ id: string; email: string }>(
    `SELECT id, email
     FROM mobion_invites
     WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL
     LIMIT 1`,
    [sha256(token)],
  );
  return result.rows[0] ?? null;
}

export async function consumeInvite(inviteId: string) {
  await query(`UPDATE mobion_invites SET used_at = now() WHERE id = $1`, [
    inviteId,
  ]);
}
```

- [ ] **Step 3: Write the invite-creation API route, gated to admins**

```typescript
// src/app/api/mobion/invites/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { createInvite } from "@/lib/mobion-invites";
import { mobionApiError } from "@/lib/mobion-api";
import { checkRateLimit } from "@/lib/mobion-rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user.is_admin) {
      return NextResponse.json(
        { error: "초대 권한이 없습니다." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    const limited = checkRateLimit(request, {
      scope: "invite",
      identifier: user.id,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    const { token, expiresAt } = await createInvite(email, user.id);
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    return mobionApiError(error, "초대 생성 실패");
  }
}
```

This is the whole role system for Phase 0: one boolean, checked in the one route that
needs it. A full role model (multiple levels, per-resource permissions) is a Phase 1+
concern once there's a UI to manage it — this is deliberately not that.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Verify end-to-end against the dev server**

Register still exists until Task 8 removes it, but it always creates `is_admin = false`
users — there is no self-serve way to become an admin. For this local verification,
register a user normally, then flip that one row to admin directly in Postgres (this is
exactly what Task 9 documents doing once, for real, against the production database).

Run:
```bash
npm run dev &
sleep 3
curl -s -c /tmp/mobion-cookies.txt -X POST http://localhost:3000/api/mobion/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Admin","email":"test-admin@example.com","password":"testpassword123"}'
psql "$DATABASE_URL" -c "UPDATE mobion_users SET is_admin = true WHERE email = 'test-admin@example.com'"
# The existing session cookie is still valid, but it was minted with the pre-update
# is_admin value baked into nothing (MobionUser is re-read from the DB on every
# request), so no re-login is needed:
curl -s -b /tmp/mobion-cookies.txt -X POST http://localhost:3000/api/mobion/invites \
  -H "Content-Type: application/json" \
  -d '{"email":"new-member@example.com"}'
kill %1
```
Expected: the second curl returns `{"token":"...","expiresAt":"..."}`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/mobion-auth.ts src/lib/mobion-invites.ts src/app/api/mobion/invites/route.ts
git commit -m "feat: add admin-gated invite creation for Mobi:ON onboarding"
```

---

### Task 5: Huly admin provisioning wrapper

**Files:**
- Create: `src/lib/mobion-huly.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` from Task 2.
- Produces: `provisionHulyAccount(email: string, name: string): Promise<{ huly_account_email: string; huly_credential_encrypted: string; huly_workspace: string }>` and `pingAsUser(link: { huly_account_email: string; huly_credential_encrypted: string; huly_workspace: string }): Promise<boolean>` — consumed by Task 6 (activation) and Task 7 (ping route).

This is the one module in this phase that cannot be fully verified without a live Huly server — see Step 3.

- [ ] **Step 1: Write the module**

```typescript
// src/lib/mobion-huly.ts
import { randomBytes } from "crypto";
import { getClient as getAccountClient } from "@hcengineering/account-client";
import { connect } from "@hcengineering/api-client";
import { AccountRole } from "@hcengineering/core";
import { encryptSecret, decryptSecret } from "./mobion-crypto";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function getAdminClient() {
  const accountsUrl = env("HULY_ACCOUNTS_URL");
  const anon = getAccountClient(accountsUrl);
  const admin = await anon.login(env("HULY_ADMIN_EMAIL"), env("HULY_ADMIN_PASSWORD"));
  if (!admin.token) throw new Error("Huly admin login did not return a token");
  return getAccountClient(accountsUrl, admin.token);
}

/**
 * Creates a Huly account for a newly-activated lab member and adds them to the
 * lab's single workspace. Returns the credential to store (encrypted) in
 * mobion_huly_link.
 *
 * We store the generated PASSWORD, not the session token `signUpJoin` returns.
 * Tokens may be short-lived (unconfirmed until Task 9's live server is up);
 * a stored password lets pingAsUser (and every later per-user call) always
 * establish a fresh authenticated session via connect()'s password auth,
 * with no separate token-refresh path to maintain.
 */
export async function provisionHulyAccount(email: string, name: string) {
  const admin = await getAdminClient();
  const workspaceUrl = env("HULY_WORKSPACE_URL");
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ") || firstName;

  const inviteId = await admin.createInviteLink(
    email,
    AccountRole.User,
    true, // autoJoin
    firstName,
    lastName,
  );

  const password = randomBytes(24).toString("base64url");
  const anon = getAccountClient(env("HULY_ACCOUNTS_URL"));
  await anon.signUpJoin(email, password, firstName, lastName, inviteId, workspaceUrl);

  return {
    huly_account_email: email,
    huly_credential_encrypted: encryptSecret(password),
    huly_workspace: workspaceUrl,
  };
}

type HulyLink = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

/** Connects as the linked user and runs a trivial read, to prove the bridge works. */
export async function pingAsUser(link: HulyLink): Promise<boolean> {
  const password = decryptSecret(link.huly_credential_encrypted);
  const client = await connect(env("HULY_URL"), {
    email: link.huly_account_email,
    password,
    workspace: link.huly_workspace,
  });
  try {
    await client.getAccount();
    return true;
  } finally {
    await client.close();
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. This catches signature mismatches against the real `@hcengineering/account-client` / `@hcengineering/api-client` / `@hcengineering/core` types without needing a live server.

- [ ] **Step 3: Manual runbook note (cannot automate — no live Huly server yet)**

`provisionHulyAccount` and `pingAsUser` can only be exercised end-to-end once Task 9 (Huly deployment) is done and `HULY_*` env vars point at a real instance. Task 7's `/api/mobion/huly/ping` route is the actual acceptance check for this — do not consider this task's code correct until that route returns success against the real server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mobion-huly.ts
git commit -m "feat: add Huly account provisioning and per-user ping wrapper"
```

---

### Task 6: Activation route (invite → our account → Huly account)

**Files:**
- Create: `src/app/api/mobion/auth/activate/route.ts`

**Interfaces:**
- Consumes: `findValidInvite`, `consumeInvite` (Task 4); `provisionHulyAccount` (Task 5); `hashPassword`, `verifyPassword`, `createSession`, `findUserByEmail` (existing `src/lib/mobion-auth.ts`); `query` (existing `src/lib/mobion-db.ts`).
- Produces: `POST /api/mobion/auth/activate` — the only way to create a `mobion_users` row going forward (replaces open self-registration; Task 8 removes the old `/register` route).

- [ ] **Step 1: Write the route, with a retry-safe path for partial provisioning failure**

If `provisionHulyAccount` throws after the `mobion_users` row exists but before the
`mobion_huly_link` row is written, a naive retry would fail on a duplicate-email insert.
This version checks for that exact state first: a `mobion_users` row for this email with
no matching `mobion_huly_link` row means a previous attempt got partway through —
reuse that row (after verifying the submitted password matches it, via the existing
`findUserByEmail`/`verifyPassword`) and retry provisioning, instead of trying to insert a
new user.

```typescript
// src/app/api/mobion/auth/activate/route.ts
import { NextResponse } from "next/server";
import {
  hashPassword,
  verifyPassword,
  createSession,
  findUserByEmail,
} from "@/lib/mobion-auth";
import { findValidInvite, consumeInvite } from "@/lib/mobion-invites";
import { provisionHulyAccount } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { checkRateLimit } from "@/lib/mobion-rate-limit";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "");
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");

    const limited = checkRateLimit(request, {
      scope: "activate",
      identifier: token || "unknown",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    if (name.length < 2 || password.length < 8) {
      return NextResponse.json(
        { error: "이름과 8자 이상 비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const invite = await findValidInvite(token);
    if (!invite) {
      return NextResponse.json(
        { error: "초대 링크가 만료되었거나 이미 사용되었습니다." },
        { status: 410 },
      );
    }

    const existing = await findUserByEmail(invite.email);

    let user: { id: string; name: string; email: string };

    if (existing) {
      const linkResult = await query<{ user_id: string }>(
        `SELECT user_id FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
        [existing.id],
      );
      if (linkResult.rows[0]) {
        return NextResponse.json(
          { error: "이미 가입된 이메일입니다." },
          { status: 409 },
        );
      }
      if (!(await verifyPassword(password, existing.password_hash))) {
        return NextResponse.json(
          { error: "이메일 또는 비밀번호를 확인해 주세요." },
          { status: 401 },
        );
      }
      user = existing;
    } else {
      const passwordHash = await hashPassword(password);
      const inserted = await query<{ id: string; name: string; email: string }>(
        `INSERT INTO mobion_users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name, invite.email, passwordHash],
      );
      user = inserted.rows[0];
    }

    const hulyLink = await provisionHulyAccount(invite.email, name);
    await query(
      `INSERT INTO mobion_huly_link
         (user_id, huly_account_email, huly_credential_encrypted, huly_workspace)
       VALUES ($1, $2, $3, $4)`,
      [
        user.id,
        hulyLink.huly_account_email,
        hulyLink.huly_credential_encrypted,
        hulyLink.huly_workspace,
      ],
    );

    await consumeInvite(invite.id);
    await createSession(user.id);

    return NextResponse.json({ user });
  } catch (error) {
    return mobionApiError(error, "계정 활성화 실패");
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/mobion/auth/activate/route.ts
git commit -m "feat: add invite-based account activation, wired to Huly provisioning"
```

---

### Task 7: Huly bridge acceptance check

**Files:**
- Create: `src/app/api/mobion/huly/ping/route.ts`

**Interfaces:**
- Consumes: `requireCurrentUser` (existing); `query` (existing); `pingAsUser` (Task 5).
- Produces: `GET /api/mobion/huly/ping` — this is the spec's acceptance check for the whole phase.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/mobion/huly/ping/route.ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { pingAsUser } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link
       WHERE user_id = $1
       LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json(
        { error: "Huly 계정이 연결되어 있지 않습니다." },
        { status: 404 },
      );
    }

    const ok = await pingAsUser(link);
    if (!ok) {
      return NextResponse.json({ error: "huly_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "Huly 연결 확인 실패");
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Full acceptance run (requires Task 9's live Huly server)**

Run:
```bash
npm run dev &
sleep 3
curl -s -c /tmp/mobion-cookies.txt -X POST http://localhost:3000/api/mobion/invites \
  -H "Content-Type: application/json" -d '{"email":"phase0-check@example.com"}'
# copy the returned token into the activate call below
curl -s -c /tmp/mobion-cookies.txt -X POST http://localhost:3000/api/mobion/auth/activate \
  -H "Content-Type: application/json" \
  -d '{"token":"<paste token here>","name":"Phase0 Check","password":"testpassword123"}'
curl -s -b /tmp/mobion-cookies.txt http://localhost:3000/api/mobion/huly/ping
kill %1
```
Expected: the final call returns `{"ok":true}`. This is the concrete, end-to-end proof that Phase 0's goal is met — until this passes against the real Huly server, Phase 0 is not done regardless of how clean the code looks.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mobion/huly/ping/route.ts
git commit -m "feat: add Huly bridge acceptance-check endpoint"
```

---

### Task 8: Remove superseded feature code

**Files:**
- Delete: `src/lib/mobion-data.ts`
- Delete: `src/app/api/mobion/workspace/route.ts`
- Delete: `src/app/api/mobion/tasks/route.ts`, `src/app/api/mobion/tasks/[id]/route.ts`, `src/app/api/mobion/tasks/[id]/checklist/route.ts`, `src/app/api/mobion/tasks/[id]/checklist/[itemId]/route.ts`
- Delete: `src/app/api/mobion/docs/route.ts`, `src/app/api/mobion/docs/[id]/route.ts`
- Delete: `src/app/api/mobion/links/route.ts`, `src/app/api/mobion/links/[id]/route.ts`
- Delete: `src/app/api/mobion/milestones/route.ts`, `src/app/api/mobion/milestones/[id]/route.ts`
- Delete: `src/app/api/mobion/messages/route.ts`
- Delete: `src/app/api/mobion/auth/register/route.ts` (replaced by Task 6's activate route)
- Modify: `src/app/api/mobion/auth/login/route.ts` (drop the now-dead `seedWorkspace` call)

**Interfaces:**
- Removes the last callers of `getWorkspace`/`seedWorkspace` from `mobion-data.ts`, making the whole file dead. `src/lib/mobion-auth.ts`, `src/lib/mobion-db.ts`, `src/app/api/mobion/auth/logout/route.ts`, `src/app/api/mobion/auth/me/route.ts`, `src/app/api/mobion/profile/route.ts` are untouched — none of them reference the dropped tables.

- [ ] **Step 1: Delete the dead feature routes and data module**

```bash
rm src/lib/mobion-data.ts
rm src/app/api/mobion/workspace/route.ts
rm -r src/app/api/mobion/tasks
rm -r src/app/api/mobion/docs
rm -r src/app/api/mobion/links
rm -r src/app/api/mobion/milestones
rm src/app/api/mobion/messages/route.ts
rm src/app/api/mobion/auth/register/route.ts
```

- [ ] **Step 2: Remove the `seedWorkspace` call from login**

In `src/app/api/mobion/auth/login/route.ts`, remove this import:
```typescript
import { seedWorkspace } from "@/lib/mobion-data";
```
and remove this line from the handler body:
```typescript
    await seedWorkspace(user.id, user.name);
```
Keep everything else in the function unchanged.

- [ ] **Step 3: Verify types compile with everything gone**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If this fails with "Cannot find module '@/lib/mobion-data'" anywhere, grep for remaining references:
```bash
grep -rn "mobion-data\|seedWorkspace\|getWorkspace" src/
```
and remove them — nothing outside the files this task lists should reference them.

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds, route list no longer includes `/api/mobion/workspace`, `/api/mobion/tasks*`, `/api/mobion/docs*`, `/api/mobion/links*`, `/api/mobion/milestones*`, `/api/mobion/messages`, `/api/mobion/auth/register`.

- [ ] **Step 5: Commit**

```bash
git add -A src/
git commit -m "refactor: remove Mobi:ON feature code superseded by Huly"
```

---

### Task 9: Deploy Huly self-hosted (manual runbook)

This task has no source files — it is infrastructure work on the lab's own server, done once, by hand. It unblocks Task 5/6/7's full verification.

- [ ] **Step 1: Provision the server**

Confirm the server has Docker + Docker Compose installed, at least 8 GB RAM / 2 vCPU free (16 GB / 4 vCPU recommended per Huly's documented minimums), and a domain name pointed at it if it's going to be reachable over the public internet.

- [ ] **Step 2: Clone and run the Huly self-host setup**

```bash
git clone https://github.com/hcengineering/huly-selfhost.git
cd huly-selfhost
./setup.sh
```
Answer the prompts for host/domain, HTTP vs HTTPS, and ports. This generates `huly_v7.conf` and a `docker-compose.yml` wired to it.

For a quick smoke test on `localhost:8087` before committing to a real domain, `./setup.sh --quick` skips the prompts.

- [ ] **Step 3: Start the stack**

```bash
sudo docker compose up -d
```

- [ ] **Step 4: Confirm all services are healthy**

Run: `docker compose ps`
Expected: every service shows `Up` / `healthy`, none restarting in a crash loop.

- [ ] **Step 5: Create the one lab workspace and the admin/owner account**

Open the Huly web UI at the configured host, sign up as the first user (this becomes the owner account — use a real email you control, e.g. the professor's or the lab lead's), and create the lab's single workspace. Note the workspace URL slug shown in the browser URL (`https://<host>/workbench/<workspace-slug>`).

- [ ] **Step 6: Fill in the real env vars**

In this Next.js app's `.env` (not `.env.example`), set:
- `HULY_URL` — the public URL from Step 2/5.
- `HULY_ACCOUNTS_URL` — `${HULY_URL}` with whatever path the setup script's generated nginx config routes to the account service (check `huly_v7.conf` / the generated nginx config for the account service's public route; it is **not** necessarily the same as `HULY_URL` root).
- `HULY_WORKSPACE_URL` — the workspace slug from Step 5.
- `HULY_ADMIN_EMAIL` / `HULY_ADMIN_PASSWORD` — the owner account credentials from Step 5.
- `MOBION_HULY_ENCRYPTION_KEY` — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

- [ ] **Step 7: Bootstrap the first admin in our own system**

This is a separate admin from Step 5 — Step 5's admin/owner account is Huly's own
workspace owner (used server-side by `provisionHulyAccount`); this step creates the
first `mobion_users` row with `is_admin = true` in **our** Postgres, since Task 8 removes
self-registration entirely and Task 4 gates invite creation to admins, so there is
otherwise no way to create the very first invite.

Hit any route once to run the schema migration (e.g. `GET /api/mobion/auth/me`), then
insert the row directly using the same scrypt password format `mobion-auth.ts` expects:

```bash
curl -s https://<your-deployed-host>/api/mobion/auth/me   # triggers ensureMobionSchema()
HASH=$(node -e "const{randomBytes,scryptSync}=require('crypto');\
const s=randomBytes(16).toString('hex');\
console.log(s+':'+scryptSync(process.argv[1],s,64).toString('hex'))" 'REAL_PASSWORD_HERE')
psql "$DATABASE_URL" -c "INSERT INTO mobion_users (name,email,password_hash,is_admin) \
  VALUES ('Lab Admin','admin@lab.example','$HASH',true)"
```

From here on, that person logs in normally and can invite every other lab member
through the app; nobody else needs direct database access.

- [ ] **Step 8: Run Task 7's acceptance check against the real server**

Re-run Task 7 Step 3's curl sequence with the real `.env` loaded. `{"ok":true}` from `/api/mobion/huly/ping` is the sign-off for all of Phase 0.
