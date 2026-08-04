import { Pool, type QueryResultRow } from "pg";

declare global {
  var mobionPool: Pool | undefined;
  var mobionSchemaReady: Promise<void> | undefined;
  var mobionSchemaVersion: number | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MOBION_SCHEMA_VERSION = 5;

export const pool =
  globalThis.mobionPool ??
  new Pool({
    connectionString,
    ssl:
      process.env.POSTGRES_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.mobionPool = pool;
}

export async function ensureMobionSchema() {
  if (globalThis.mobionSchemaVersion !== MOBION_SCHEMA_VERSION) {
    globalThis.mobionSchemaReady = undefined;
  }

  if (!globalThis.mobionSchemaReady) {
    globalThis.mobionSchemaVersion = MOBION_SCHEMA_VERSION;
    globalThis.mobionSchemaReady = (async () => {
      if (!connectionString) {
        throw new Error("DATABASE_URL or POSTGRES_URL is required for Mobi:ON");
      }

      await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          token_hash TEXT UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // One-time Phase 0 migration cleanup — safe to remove once this has run against
      // every deployed environment.
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
      // Huly's per-workspace PersonId for this account (the id chunter tx's createdBy
      // carries) — filled in on first successful Huly connection, not at provisioning
      // time, since it's only known once we've actually logged into Huly. Lets us
      // resolve chat message authors back to mobion_users.name without asking Huly.
      await pool.query(
        `ALTER TABLE mobion_huly_link
         ADD COLUMN IF NOT EXISTS huly_social_id TEXT`,
      );
    })().catch((error) => {
      globalThis.mobionSchemaReady = undefined;
      globalThis.mobionSchemaVersion = undefined;
      throw error;
    });
  }

  return globalThis.mobionSchemaReady;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  await ensureMobionSchema();
  return pool.query<T>(text, params);
}
