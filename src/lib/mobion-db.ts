import { Pool, type QueryResultRow } from "pg";

declare global {
  var mobionPool: Pool | undefined;
  var mobionSchemaReady: Promise<void> | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

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
  if (!globalThis.mobionSchemaReady) {
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_docs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          author TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch((error) => {
      globalThis.mobionSchemaReady = undefined;
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
