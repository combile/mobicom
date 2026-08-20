import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type MyTaskRow = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  project_id: string;
  project_name: string;
};


type ContestRow = {
  id: string;
  title: string;
  deadline: string;
  url: string;
};

/**
 * What this person has to deal with, across everything.
 *
 * The other views each answer a question about one area. Opening the workspace
 * asks a different one — what needs me today — and answering it previously
 * meant opening every project in turn and holding the result in your head.
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();

    const myTasks = await query<MyTaskRow>(
      `SELECT t.id, t.title, t.status, t.due_date::text AS due_date,
              p.id AS project_id, p.name AS project_name
       FROM mobion_tasks t
       JOIN mobion_projects p ON p.id = t.project_id
       WHERE t.assignee_id = $1 AND t.status <> 'done'
       -- undated work sinks below anything carrying a deadline
       ORDER BY t.due_date IS NULL, t.due_date ASC, t.created_at ASC
       LIMIT 30`,
      [user.id],
    );


    const contests = await query<ContestRow>(
      `SELECT c.id, c.title, c.deadline::text AS deadline, c.url
       FROM mobion_contests c
       JOIN mobion_contest_interests i ON i.contest_id = c.id AND i.user_id = $1
       WHERE c.deadline IS NOT NULL AND c.deadline >= CURRENT_DATE
       ORDER BY c.deadline ASC
       LIMIT 5`,
      [user.id],
    );

    return NextResponse.json({
      userName: user.name,
      myTasks: myTasks.rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        dueDate: r.due_date,
        projectId: r.project_id,
        projectName: r.project_name,
      })),
      contests: contests.rows.map((r) => ({
        id: r.id,
        title: r.title,
        deadline: r.deadline,
        url: r.url,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "홈 정보를 불러오지 못했습니다.");
  }
}
