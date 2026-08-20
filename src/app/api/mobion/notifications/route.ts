import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type NotificationRow = {
  id: string;
  kind: "comment" | "assigned";
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
export async function GET() {
  try {
    const user = await requireCurrentUser();

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
