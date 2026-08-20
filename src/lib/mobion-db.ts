import { Pool, type QueryResultRow } from "pg";
import pg from "pg";

pg.types.setTypeParser(1082, (value) => value);

declare global {
  var mobionPool: Pool | undefined;
  var mobionSchemaReady: Promise<void> | undefined;
  var mobionSchemaVersion: number | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MOBION_SCHEMA_VERSION = 15;

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
      // AccountUuid for this Huly link — distinct from huly_social_id (a PersonId).
      // Huly's own Channel.members field is AccountUuid-keyed (confirmed empirically
      // in Task 3 while fixing SSE membership filtering), so channel creation's
      // members array must be built from this column, not huly_social_id.
      // Backfilled the same way as huly_social_id, in mobion-huly.ts's
      // buildWorkspaceClient, once wsLogin (which carries the AccountUuid) is available.
      await pool.query(
        `ALTER TABLE mobion_huly_link
         ADD COLUMN IF NOT EXISTS huly_account_uuid TEXT`,
      );
      // Exactly one account in the lab is the professor — set directly via SQL on
      // that account, the same one-time-bootstrap pattern already used for is_admin.
      // Used by channel creation to auto-add the professor when a private channel's
      // creator toggles "교수님에게 공개".
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS is_professor BOOLEAN NOT NULL DEFAULT false`,
      );
      // Relative path under public/ (e.g. /uploads/avatars/<userId>.png), NULL until
      // the user uploads one. See mobion-avatar.ts.
      await pool.query(
        `ALTER TABLE mobion_users
         ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
      );
      // Huly's Channel type has no tags field and we can't extend the installed
      // @hcengineering/* package schema, so channel tags live here instead, keyed
      // by the Huly channel id (chunter:class:Channel's _id — a plain string, not
      // a foreign key into any table we own).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_channel_tags (
          channel_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (channel_id, tag)
        )
      `);
      // Native task/milestone tracking — deliberately NOT built on Huly's Tracker
      // plugin (tracker:class:Project/Issue/Milestone). That plugin's Issue.status
      // is a per-project dynamically-created IssueStatus class (not a fixed enum),
      // plus priority/time-tracking/sub-issue fields this lab doesn't need. See
      // docs/superpowers/specs/2026-08-05-mobion-tasks-milestones-design.md's
      // "Architecture Decision" section. These table names reuse ones an earlier,
      // unrelated Phase 0 iteration used (that iteration's tables were dropped in
      // a one-time migration, since removed from this file once it had run against
      // every deployed environment) — safe, since Postgres has no memory of a
      // dropped table's old shape.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          created_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_milestones (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES mobion_projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          target_date DATE,
          status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_tasks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES mobion_projects(id) ON DELETE CASCADE,
          milestone_id UUID REFERENCES mobion_milestones(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          assignee_id UUID REFERENCES mobion_users(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
          due_date DATE,
          created_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      // Where a task came from, when it came from a conversation. Nullable
      // because most tasks are still created directly; the excerpt is stored
      // rather than joined so the task keeps its context even if the message
      // is later edited or the channel is left.
      await pool.query(`
        ALTER TABLE mobion_tasks
          ADD COLUMN IF NOT EXISTS source_channel_id TEXT,
          ADD COLUMN IF NOT EXISTS source_message_id TEXT,
          ADD COLUMN IF NOT EXISTS source_excerpt TEXT
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_task_comments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID NOT NULL REFERENCES mobion_tasks(id) ON DELETE CASCADE,
          -- SET NULL, not CASCADE: a discussion should survive someone leaving
          -- the lab, otherwise the reasoning behind a decision disappears with
          -- the account
          user_id UUID REFERENCES mobion_users(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_task_comments_task_idx
          ON mobion_task_comments (task_id, created_at)
      `);
      // A milestone is a checkpoint, so what kind of checkpoint it is carries
      // real meaning — an approval and a deliverable are read differently even
      // when they fall on the same date.
      await pool.query(`
        ALTER TABLE mobion_milestones
          ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'checkpoint'
      `);
      // Tasks span time on a gantt chart; without a start they can only be
      // drawn as a point on their due date.
      await pool.query(`
        ALTER TABLE mobion_tasks
          ADD COLUMN IF NOT EXISTS start_date DATE
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('comment', 'assigned')),
          task_id UUID REFERENCES mobion_tasks(id) ON DELETE CASCADE,
          actor_id UUID REFERENCES mobion_users(id) ON DELETE SET NULL,
          -- wording is stored rather than rebuilt at read time, so a
          -- notification still says what happened after the task is renamed
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          read_at TIMESTAMPTZ
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_notifications_inbox_idx
          ON mobion_notifications (user_id, read_at, created_at DESC)
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_contests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source TEXT NOT NULL,
          source_key TEXT NOT NULL,
          title TEXT NOT NULL,
          organizer TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL,
          deadline DATE,
          tags TEXT[] NOT NULL DEFAULT '{}',
          collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          -- lets a re-run update what it already stored instead of inserting a
          -- second copy of the same posting
          UNIQUE (source, source_key)
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_contest_interests (
          contest_id UUID NOT NULL REFERENCES mobion_contests(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (contest_id, user_id)
        )
      `);
      // The steps a task breaks down into. CASCADE rather than SET NULL, the
      // opposite of comments: a step has no meaning apart from the task it
      // belongs to, while a discussion is a record worth keeping.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_task_checklist (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID NOT NULL REFERENCES mobion_tasks(id) ON DELETE CASCADE,
          label TEXT NOT NULL,
          done BOOLEAN NOT NULL DEFAULT false,
          -- explicit rather than ordering by created_at: steps get inserted
          -- between existing ones, and a checklist read out of order is wrong
          -- in a way a comment thread never is
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_task_checklist_task_idx
          ON mobion_task_checklist (task_id, position, created_at)
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
