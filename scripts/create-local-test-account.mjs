#!/usr/bin/env node
/**
 * Creates (or resets) a local-only test account for manual testing.
 *
 * Safe to commit: it holds no secrets. Credentials come from env vars (or a
 * generated password, printed once and never written anywhere) — the only
 * place they end up is this terminal and, if you choose, your own
 * gitignored .env.local. The script itself refuses to run anywhere but an
 * obviously local database:
 *
 *   - refuses outright when NODE_ENV=production
 *   - refuses when DATABASE_URL/POSTGRES_URL does not point at
 *     localhost/127.0.0.1/::1
 *
 * It never runs on its own (not wired into build/start/postinstall) — only
 * when someone explicitly invokes it.
 *
 * Usage:
 *   node --env-file-if-exists=.env.local scripts/create-local-test-account.mjs
 *
 * Optional overrides:
 *   TEST_ACCOUNT_ID=my-id TEST_ACCOUNT_PASSWORD=my-pass TEST_ACCOUNT_ROLE=professor \
 *     node --env-file-if-exists=.env.local scripts/create-local-test-account.mjs
 */
import pg from "pg";
import { randomBytes, scrypt as scryptCallback } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback);

function fail(message) {
  console.error(`[create-local-test-account] ${message}`);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  fail("refusing to run with NODE_ENV=production.");
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!connectionString) {
  fail("DATABASE_URL (or POSTGRES_URL) is not set. Point it at your local database first.");
}

let host;
try {
  host = new URL(connectionString).hostname;
} catch {
  fail("could not parse DATABASE_URL/POSTGRES_URL as a URL.");
}
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  fail(
    `refusing to run against a non-local host ("${host}"). ` +
      "This script only ever creates accounts on a local database.",
  );
}

// lead: canAdminister() and canOversee() are both true under this app's
// current role rules (src/lib/mobion-auth.ts), so a "lead" test account can
// exercise every gated feature, including document archiving (MOB-DOC-005).
const LOGIN_ID = (process.env.TEST_ACCOUNT_ID ?? "test-lead").toLowerCase();
const NAME = process.env.TEST_ACCOUNT_NAME ?? "테스트 계정";
const ROLE = process.env.TEST_ACCOUNT_ROLE ?? "lead";
if (!["member", "lead", "professor"].includes(ROLE)) {
  fail(`invalid TEST_ACCOUNT_ROLE "${ROLE}" — must be member, lead, or professor.`);
}
// Not committed anywhere: only ever printed below, matching this app's own
// "임시 비밀번호는 계정 생성 직후 한 번만 표시한다" rule.
const PASSWORD = process.env.TEST_ACCOUNT_PASSWORD ?? randomBytes(9).toString("base64url");

// Matches src/lib/mobion-auth.ts's hashPassword exactly, so the real login
// route can verify it.
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

async function main() {
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  // Rather than re-declaring the schema here (a second copy that could drift
  // from src/lib/mobion-db.ts), this just checks the app has bootstrapped it
  // at least once already — start the app (`npm run dev`) and load any page
  // first if this check fails.
  const roleColumn = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'mobion_users' AND column_name = 'role'`,
  );
  if (roleColumn.rowCount === 0) {
    await pool.end();
    fail(
      "mobion_users table isn't set up yet. Start the app once first " +
        "(npm run dev, then load any page) so it bootstraps its schema, then re-run this script.",
    );
  }

  const passwordHash = await hashPassword(PASSWORD);

  await pool.query(
    `INSERT INTO mobion_users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           name = EXCLUDED.name`,
    [NAME, LOGIN_ID, passwordHash, ROLE],
  );

  await pool.end();

  console.log("");
  console.log("로컬 테스트 계정 준비 완료 (이 로컬 DB에만 존재):");
  console.log(`  아이디:   ${LOGIN_ID}`);
  console.log(`  비밀번호: ${PASSWORD}`);
  console.log(`  역할:     ${ROLE}`);
  console.log("");
  console.log("이 계정 정보는 어디에도 저장되지 않으며, 이 터미널에만 표시됩니다.");
}

main().catch((error) => fail(`failed: ${error.message}`));
