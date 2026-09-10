import { Pool, type QueryResultRow } from "pg";
import pg from "pg";

pg.types.setTypeParser(1082, (value) => value);

declare global {
  var mobionPool: Pool | undefined;
  var mobionSchemaReady: Promise<void> | undefined;
  var mobionSchemaVersion: number | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MOBION_SCHEMA_VERSION = 24;

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
      // What changed on a task, and who changed it. The discussion records why
      // a decision was made; this records that it was made at all — the two
      // read as one thread and neither answers the other's question.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_task_activity (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id UUID NOT NULL REFERENCES mobion_tasks(id) ON DELETE CASCADE,
          -- SET NULL like comments: history that loses its author is still
          -- history, and dropping the entry entirely would be worse
          actor_id UUID REFERENCES mobion_users(id) ON DELETE SET NULL,
          field TEXT NOT NULL,
          -- Text, not ids. A milestone that is later renamed or deleted must
          -- not rewrite or blank out what the history says happened.
          from_value TEXT,
          to_value TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_task_activity_task_idx
          ON mobion_task_activity (task_id, created_at)
      `);
      // How far into each conversation a person has read. Kept here rather
      // than in Huly because it is per-user state this app owns, and Huly's
      // own notification model is not what this UI reads from.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_channel_reads (
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          -- a Huly space id, so no foreign key is possible from here
          channel_id TEXT NOT NULL,
          -- epoch milliseconds, matching ChatMessage.createdOn exactly so the
          -- comparison needs no conversion and cannot drift by a timezone
          last_read_on BIGINT NOT NULL,
          PRIMARY KEY (user_id, channel_id)
        )
      `);
      // Three roles rather than one admin flag. `is_admin` could say who may
      // administer but not who may only look, and "the professor can see
      // everything and change nothing" is exactly a read-only role.
      await pool.query(
        `ALTER TABLE mobion_users
           ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'`,
      );
      await pool.query(
        `ALTER TABLE mobion_users DROP CONSTRAINT IF EXISTS mobion_users_role_check`,
      );
      await pool.query(
        `ALTER TABLE mobion_users
           ADD CONSTRAINT mobion_users_role_check
           CHECK (role IN ('member', 'lead', 'professor'))`,
      );
      // Carry-over of the two old flags, then the flags go.
      //
      // Wrapped in a column-exists check because this script re-runs in full on
      // every version change: once the columns are dropped below, a statement
      // naming them is not a no-op, it is an error that takes the whole
      // bootstrap down.
      //
      // The lead carry-over is guarded on "nobody is a lead yet" so it cannot
      // undo a later demotion; the professor carry-over only touches members,
      // so a lead who also carried the professor flag stays a lead.
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'mobion_users' AND column_name = 'is_admin'
          ) THEN
            UPDATE mobion_users SET role = 'lead'
            WHERE is_admin = true
              AND NOT EXISTS (SELECT 1 FROM mobion_users WHERE role <> 'member');
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'mobion_users' AND column_name = 'is_professor'
          ) THEN
            UPDATE mobion_users SET role = 'professor'
            WHERE is_professor = true AND role = 'member';
          END IF;
        END $$;
      `);
      // Both flags answered questions `role` now answers, and two columns
      // answering one question is how they end up disagreeing — `is_professor`
      // had already drifted out of step with `role` before this ran.
      await pool.query(
        `ALTER TABLE mobion_users
           DROP COLUMN IF EXISTS is_admin,
           DROP COLUMN IF EXISTS is_professor`,
      );
      // When someone was here. `first_seen_at` is what the server observed and
      // never changes; `checked_in_at` is the person's own correction. Keeping
      // both is the record of the correction — a separate audit table would
      // say the same thing at more cost.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_attendance (
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          work_date DATE NOT NULL,
          first_seen_at TIMESTAMPTZ NOT NULL,
          checked_in_at TIMESTAMPTZ,
          note TEXT,
          corrected_at TIMESTAMPTZ,
          PRIMARY KEY (user_id, work_date)
        )
      `);

      // 'due_soon' joins the original two. The constraint is replaced rather
      // than the column left unchecked: the set is small and closed, and an
      // unconstrained kind is how a typo becomes a notification nobody can
      // render.
      await pool.query(
        `ALTER TABLE mobion_notifications
           DROP CONSTRAINT IF EXISTS mobion_notifications_kind_check`,
      );
      await pool.query(
        `ALTER TABLE mobion_notifications
           ADD CONSTRAINT mobion_notifications_kind_check
           CHECK (kind IN ('comment', 'assigned', 'due_soon'))`,
      );

      // Emoji reactions. One row per (message, person, emoji): the primary key
      // is what stops a double-click from counting twice, so toggling can be a
      // plain insert-or-delete with no read-modify-write in between.
      // message_id is a Huly ChatMessage id, so no foreign key is possible.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_message_reactions (
          message_id TEXT NOT NULL,
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (message_id, user_id, emoji)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_message_reactions_message_idx
          ON mobion_message_reactions (message_id)
      `);

      // Which message a reply points at. Kept beside Huly rather than inside it
      // because ChatMessage has no field for it and adding one would mean a
      // Huly model change; the id pair is all the UI needs to draw the quote.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_message_replies (
          message_id TEXT PRIMARY KEY,
          reply_to TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Pinned channels, per person. sort_order lets someone arrange them;
      // ties fall back to name so the list never renders in a random order.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_channel_favorites (
          user_id UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, channel_id)
        )
      `);

      // Uploaded files. The bytes live on the server's disk, not in this table
      // and not in Postgres at all — a large-file upload is the one thing a
      // bytea column turns into a memory problem for every query that touches
      // the row. storage_path is relative to MOBION_UPLOAD_DIR so the whole
      // store can be moved by changing one env var.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_attachments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          message_id TEXT,
          filename TEXT NOT NULL,
          mime TEXT NOT NULL,
          size BIGINT NOT NULL,
          storage_path TEXT NOT NULL,
          uploaded_by UUID NOT NULL REFERENCES mobion_users(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_attachments_message_idx
          ON mobion_attachments (message_id)
      `);
      // NULL means keep forever. Small files (the threshold lives in
      // mobion-uploads.ts) get NULL; large ones get a date, because a few
      // multi-gigabyte datasets would otherwise fill the disk that also runs
      // Postgres and every Huly container. The date is stored rather than
      // derived at read time so the UI can show it before it matters.
      await pool.query(
        `ALTER TABLE mobion_attachments
           ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
      );
      await pool.query(`
        CREATE INDEX IF NOT EXISTS mobion_attachments_expires_idx
          ON mobion_attachments (expires_at) WHERE expires_at IS NOT NULL
      `);

      // Lab: who is in the lab right now. One row per person, overwritten
      // in place rather than appended — "online" is not a fact worth a
      // history, only a timestamp worth comparing against `now()`. Read back
      // by /api/mobion/lab, which treats a stale row as offline instead of
      // storing a boolean directly: a boolean can be left stuck "online" by a
      // tab that crashes instead of closing cleanly, a timestamp can't.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS mobion_presence (
          user_id UUID PRIMARY KEY REFERENCES mobion_users(id) ON DELETE CASCADE,
          last_seen_at TIMESTAMPTZ NOT NULL
        )
      `);

      // 알림 종류 둘 추가. 'mention'은 'comment'에서 갈라져 나온 것으로,
      // "나를 언급했다"와 "내 태스크에 댓글이 달렸다"는 인박스에서 다르게
      // 읽혀야 한다. 기존 'comment' 행은 건드리지 않는다 — 과거 알림이
      // 멘션이었는지는 소급 판정할 수 없다.
      await pool.query(
        `ALTER TABLE mobion_notifications
           DROP CONSTRAINT IF EXISTS mobion_notifications_kind_check`,
      );
      await pool.query(
        `ALTER TABLE mobion_notifications
           ADD CONSTRAINT mobion_notifications_kind_check
           CHECK (kind IN ('comment', 'assigned', 'due_soon', 'mention', 'status'))`,
      );
      // 알림이 비롯된 댓글. SET NULL인 이유는 mobion_task_comments.user_id와
      // 같다 — 댓글이 사라져도 "누가 나를 불렀다"는 사실은 남아야 하고,
      // 이동만 태스크 수준으로 물러나면 된다.
      await pool.query(
        `ALTER TABLE mobion_notifications
           ADD COLUMN IF NOT EXISTS comment_id UUID
           REFERENCES mobion_task_comments(id) ON DELETE SET NULL`,
      );
      // 수신 설정. 조회가 아니라 저장 시점에 적용된다 — 조회 경로는 45초마다
      // 도는 이 앱의 심장박동이라 가장 단순하게 두어야 한다. 기본값 true는
      // 기존 사용자가 지금과 똑같이 받는다는 뜻이다.
      await pool.query(
        `ALTER TABLE mobion_users
           ADD COLUMN IF NOT EXISTS notify_comment BOOLEAN NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS notify_status BOOLEAN NOT NULL DEFAULT true`,
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
