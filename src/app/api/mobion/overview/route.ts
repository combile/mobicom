import { NextResponse } from "next/server";
import { canAdminister, canOversee, requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  days_present: string;
  last_seen_at: string | null;
  today_in_at: string | null;
  done_count: string;
  in_progress: string;
  overdue: string;
};

type ActivityRow = {
  actor_id: string | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  project_name: string | null;
  created_at: string;
};

const VALID_ROLES = ["member", "lead", "professor"];

/**
 * The lab at a glance, for whoever is responsible for it.
 *
 * One row per person: days in this week, when they were last seen, and the
 * shape of their work. Counted in a single pass with scalar subqueries rather
 * than a query per member — a lab is small, but a page that issues one request
 * per person is the shape that stops working first.
 *
 * Deliberately not a feed of what anyone currently has open. The activity list
 * is drawn from what people actually changed, which is a record they made
 * themselves, rather than from who happens to have a tab in focus.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!canOversee(user)) {
      return NextResponse.json({ error: "열람 권한이 없습니다." }, { status: 403 });
    }

    const members = await query<MemberRow>(
      `SELECT u.id, u.name, u.email, u.role,
              (SELECT count(*) FROM mobion_attendance a
                WHERE a.user_id = u.id
                  AND a.work_date > CURRENT_DATE - 7) AS days_present,
              (SELECT max(COALESCE(a.checked_in_at, a.first_seen_at))
                 FROM mobion_attendance a WHERE a.user_id = u.id) AS last_seen_at,
              (SELECT COALESCE(a.checked_in_at, a.first_seen_at)
                 FROM mobion_attendance a
                WHERE a.user_id = u.id AND a.work_date = CURRENT_DATE) AS today_in_at,
              (SELECT count(*) FROM mobion_tasks t
                WHERE t.assignee_id = u.id AND t.status = 'done') AS done_count,
              (SELECT count(*) FROM mobion_tasks t
                WHERE t.assignee_id = u.id AND t.status = 'in_progress') AS in_progress,
              (SELECT count(*) FROM mobion_tasks t
                WHERE t.assignee_id = u.id AND t.status <> 'done'
                  AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE) AS overdue
       FROM mobion_users u
       ORDER BY u.role, u.name`,
    );

    const activity = await query<ActivityRow>(
      `SELECT a.actor_id, a.task_id, t.title AS task_title,
              t.project_id, p.name AS project_name, a.created_at
       FROM mobion_task_activity a
       LEFT JOIN mobion_tasks t ON t.id = a.task_id
       LEFT JOIN mobion_projects p ON p.id = t.project_id
       ORDER BY a.created_at DESC
       LIMIT 40`,
    );

    return NextResponse.json({
      canManageRoles: canAdminister(user),
      members: members.rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        // pg returns count as a string
        daysPresent: Number(r.days_present),
        lastSeenAt: r.last_seen_at,
        todayInAt: r.today_in_at,
        done: Number(r.done_count),
        inProgress: Number(r.in_progress),
        overdue: Number(r.overdue),
      })),
      activity: activity.rows.map((r) => ({
        actorId: r.actor_id,
        taskId: r.task_id,
        taskTitle: r.task_title,
        projectId: r.project_id,
        projectName: r.project_name,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "연구실 현황을 불러오지 못했습니다.");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    // Overseeing is not administering: the professor reads this page but does
    // not decide who anyone is.
    if (!canAdminister(user)) {
      return NextResponse.json({ error: "역할을 지정할 권한이 없습니다." }, { status: 403 });
    }

    const body = await request.json();
    const userId = String(body.userId ?? "");
    const role = String(body.role ?? "");
    if (!userId || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "올바르지 않은 역할입니다." }, { status: 400 });
    }
    if (userId === user.id && role !== "lead") {
      // Otherwise the last lead can quietly remove the ability to appoint the
      // next one, and nobody left is able to undo it.
      return NextResponse.json(
        { error: "자신의 랩장 권한은 해제할 수 없습니다. 다른 사람을 먼저 지정해 주세요." },
        { status: 400 },
      );
    }

    const result = await query<{ id: string; role: string }>(
      `UPDATE mobion_users SET role = $2 WHERE id = $1 RETURNING id, role`,
      [userId, role],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ member: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "역할을 바꾸지 못했습니다.");
  }
}
