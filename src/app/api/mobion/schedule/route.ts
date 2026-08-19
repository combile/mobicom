import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ScheduleRow = {
  kind: "task" | "milestone" | "contest";
  id: string;
  title: string;
  date: string;
  status: string;
  project_id: string | null;
  project_name: string;
  assignee_name: string | null;
  url: string | null;
};

/**
 * Everything with a date on it, across every project.
 *
 * The schedule is a read-only view over work that already exists rather than a
 * separate kind of record, so this unions the two tables that carry dates
 * instead of introducing a table of its own.
 *
 * Undated rows are excluded: an item with no date has no place on a schedule,
 * and including them would bury the ones that do.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const result = await query<ScheduleRow>(
      `SELECT 'task' AS kind, t.id, t.title, t.due_date::text AS date, t.status,
              p.id AS project_id, p.name AS project_name, u.name AS assignee_name, NULL AS url
       FROM mobion_tasks t
       JOIN mobion_projects p ON p.id = t.project_id
       LEFT JOIN mobion_users u ON u.id = t.assignee_id
       WHERE t.due_date IS NOT NULL

       UNION ALL

       SELECT 'milestone' AS kind, m.id, m.title, m.target_date::text AS date, m.status,
              p.id AS project_id, p.name AS project_name, NULL AS assignee_name, NULL AS url
       FROM mobion_milestones m
       JOIN mobion_projects p ON p.id = m.project_id
       WHERE m.target_date IS NOT NULL

       UNION ALL

       -- only contests this user marked: a crawler collects everything a
       -- source publishes, and scheduling all of it would bury the team's own
       -- deadlines
       SELECT 'contest' AS kind, c.id, c.title, c.deadline::text AS date, 'todo' AS status,
              NULL AS project_id, c.organizer AS project_name, NULL AS assignee_name, c.url
       FROM mobion_contests c
       JOIN mobion_contest_interests i ON i.contest_id = c.id AND i.user_id = $1
       WHERE c.deadline IS NOT NULL

       ORDER BY date ASC`,
      [user.id],
    );

    return NextResponse.json({
      items: result.rows.map((r) => ({
        kind: r.kind,
        id: r.id,
        title: r.title,
        date: r.date,
        status: r.status,
        projectId: r.project_id,
        projectName: r.project_name,
        assigneeName: r.assignee_name,
        url: r.url,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "일정을 불러오지 못했습니다.");
  }
}
