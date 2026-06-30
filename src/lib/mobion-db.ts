import { Pool, type QueryResultRow } from "pg";

declare global {
  var mobionPool: Pool | undefined;
  var mobionSchemaReady: Promise<void> | undefined;
  var mobionSchemaVersion: number | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MOBION_SCHEMA_VERSION = 3;

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
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          token_hash TEXT UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'now',
          owner TEXT NOT NULL DEFAULT '',
          progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
          project TEXT NOT NULL DEFAULT 'General',
          priority TEXT NOT NULL DEFAULT 'medium',
          due_date DATE,
          notes TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        `ALTER TABLE mobion_tasks
         ADD COLUMN IF NOT EXISTS project TEXT NOT NULL DEFAULT 'General',
         ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
         ADD COLUMN IF NOT EXISTS due_date DATE,
         ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_docs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          project TEXT NOT NULL DEFAULT 'General',
          kind TEXT NOT NULL DEFAULT 'note',
          pinned BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        `ALTER TABLE mobion_docs
         ADD COLUMN IF NOT EXISTS project TEXT NOT NULL DEFAULT 'General',
         ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'note',
         ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`,
      );
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          author TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_links (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          project TEXT NOT NULL DEFAULT 'General',
          kind TEXT NOT NULL DEFAULT 'resource',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_milestones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          project TEXT NOT NULL DEFAULT 'General',
          target_date DATE,
          status TEXT NOT NULL DEFAULT 'planned',
          summary TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_task_checklist (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          task_id UUID NOT NULL REFERENCES mobion_tasks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          done BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
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
