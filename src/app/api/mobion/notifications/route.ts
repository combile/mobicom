import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type NotificationRow = {
  id: string;
  kind: "comment" | "assigned" | "due_soon";
  body: string;
  created_at: string;
  actor_name: string | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
};

/**
 * Unread first, with only recent history beyond that.
 *
 * Without a read marker the home screen kept showing the same replies after
 * they had been dealt with, which teaches people to ignore the section — the
 * opposite of what it is for.
 */
/** How far ahead a deadline starts being worth a notification. */
const DUE_SOON_DAYS = 2;

/**
 * Raise deadline notifications that are due but not yet written.
 *
 * Generated on read rather than by a scheduler because there is no scheduler
 * to run it — one server, no cron. Since the client polls this endpoint while
 * the app is open, "whenever someone looks" turns out to be often enough, and
 * nothing has to stay running for reminders to appear.
 *
 * At most one per task per day: the NOT EXISTS is what keeps a poll every
 * forty-five seconds from producing a notification every forty-five seconds.
 * Overdue tasks keep reminding daily, which is the point of the reminder.
 */
async function raiseDueSoonNotifications(userId: string) {
  await query(
    `INSERT INTO mobion_notifications (user_id, kind, task_id, body)
     -- the date, not the title: the row already prints the task's name beside
     -- this, and repeating it there says nothing the reader cannot see
     SELECT t.assignee_id, 'due_soon', t.id, t.due_date::text
     FROM mobion_tasks t
     WHERE t.assignee_id = $1
       AND t.status <> 'done'
       AND t.due_date IS NOT NULL
       AND t.due_date <= CURRENT_DATE + $2::int
       AND NOT EXISTS (
         SELECT 1 FROM mobion_notifications n
         WHERE n.user_id = t.assignee_id
           AND n.task_id = t.id
           AND n.kind = 'due_soon'
           AND n.created_at >= CURRENT_DATE
       )`,
    [userId, DUE_SOON_DAYS],
  );
}

/**
 * Note that this person was here today.
 *
 * Recorded here rather than in `requireCurrentUser` because this endpoint is
 * already the app's heartbeat — the client polls it while the workspace is
 * open, in every mode — and an upsert on every authenticated request would be
 * a write per request to answer a question that changes once a day.
 *
 * `DO NOTHING` means the first request of the day wins, and no later one can
 * push the observed time forward.
 */
async function noteAttendance(userId: string) {
  await query(
    `INSERT INTO mobion_attendance (user_id, work_date, first_seen_at)
     VALUES ($1, CURRENT_DATE, now())
     ON CONFLICT (user_id, work_date) DO NOTHING`,
    [userId],
  );
}

/**
 * Bumps this person's "last seen" for the Office view.
 *
 * Rides the same heartbeat as noteAttendance above, and for the same reason:
 * this endpoint is already polled every ~45s for as long as Mobi:ON is open,
 * whichever tab is active, so there is no reason to open a second connection
 * just to say the same "still here" a different feature also wants to hear.
 * Unlike attendance's DO NOTHING (first request of the day wins), this
 * overwrites every time — presence is only ever about the most recent ping.
 */
async function notePresence(userId: string) {
  await query(
    `INSERT INTO mobion_presence (user_id, last_seen_at)
     VALUES ($1, now())
     ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now()`,
    [userId],
  );
}

export async function GET() {
  try {
    const user = await requireCurrentUser();

    // Best-effort: a failure here must not cost the caller the notifications
    // that already exist.
    await noteAttendance(user.id).catch(() => {});
    await notePresence(user.id).catch(() => {});
    await raiseDueSoonNotifications(user.id).catch(() => {});

    const result = await query<NotificationRow>(
      `SELECT n.id, n.kind, n.body, n.created_at,
              a.name AS actor_name,
              n.task_id, t.title AS task_title, t.project_id
       FROM mobion_notifications n
       LEFT JOIN mobion_users a ON a.id = n.actor_id
       LEFT JOIN mobion_tasks t ON t.id = n.task_id
       WHERE n.user_id = $1
         AND (n.read_at IS NULL OR n.created_at > now() - interval '3 days')
       ORDER BY n.read_at IS NOT NULL, n.created_at DESC
       LIMIT 20`,
      [user.id],
    );

    const unread = await query<{ count: string }>(
      `SELECT count(*) AS count FROM mobion_notifications
       WHERE user_id = $1 AND read_at IS NULL`,
      [user.id],
    );

    return NextResponse.json({
      // pg returns count as a string
      unreadCount: Number(unread.rows[0]?.count ?? 0),
      notifications: result.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        actorName: r.actor_name,
        taskId: r.task_id,
        taskTitle: r.task_title,
        projectId: r.project_id,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "알림을 불러오지 못했습니다.");
  }
}

/**
 * Marks one notification read, or all of them when no id is given.
 *
 * Ownership is enforced in the WHERE clause rather than checked first: an id
 * belonging to someone else simply matches nothing.
 */
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const payload = await request.json().catch(() => ({}));
    const id = payload.id ? String(payload.id) : null;

    if (id) {
      await query(
        `UPDATE mobion_notifications SET read_at = now()
         WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
        [id, user.id],
      );
    } else {
      await query(
        `UPDATE mobion_notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL`,
        [user.id],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "알림을 읽음으로 표시하지 못했습니다.");
  }
}
