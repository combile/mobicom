import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type MilestoneRow = {
  id: string;
  title: string;
  target_date: string | null;
  status: string;
  kind: string;
};
type TaskRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  start_date: string | null;
  milestone_id: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
  created_by_name: string | null;
  source_channel_id: string | null;
  source_excerpt: string | null;
  checklist_total: string;
  checklist_done: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const projectResult = await query<{ id: string; name: string; description: string }>(
      `SELECT id, name, description FROM mobion_projects WHERE id = $1`,
      [id],
    );
    const project = projectResult.rows[0];
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    const milestonesResult = await query<MilestoneRow>(
      `SELECT id, title, target_date, status, kind FROM mobion_milestones
       WHERE project_id = $1 ORDER BY created_at ASC`,
      [id],
    );

    const tasksResult = await query<TaskRow>(
      `SELECT t.id, t.title, t.description, t.status, t.due_date, t.start_date,
              t.milestone_id, t.assignee_id, u.name AS assignee_name,
              t.created_at, c.name AS created_by_name,
              t.source_channel_id, t.source_excerpt,
              -- counted here so a row can show its progress without the list
              -- issuing one checklist request per task
              (SELECT COUNT(*) FROM mobion_task_checklist cl WHERE cl.task_id = t.id)
                AS checklist_total,
              (SELECT COUNT(*) FROM mobion_task_checklist cl
                WHERE cl.task_id = t.id AND cl.done) AS checklist_done
       FROM mobion_tasks t
       LEFT JOIN mobion_users u ON u.id = t.assignee_id
       LEFT JOIN mobion_users c ON c.id = t.created_by
       WHERE t.project_id = $1 ORDER BY t.created_at ASC`,
      [id],
    );

    return NextResponse.json({
      project,
      milestones: milestonesResult.rows.map((m) => ({
        id: m.id,
        title: m.title,
        targetDate: m.target_date,
        status: m.status,
        kind: m.kind,
      })),
      tasks: tasksResult.rows.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        startDate: t.start_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
        assigneeName: t.assignee_name,
        createdAt: t.created_at,
        createdByName: t.created_by_name,
        sourceChannelId: t.source_channel_id,
        sourceExcerpt: t.source_excerpt,
        // pg returns COUNT as a string
        checklistTotal: Number(t.checklist_total),
        checklistDone: Number(t.checklist_done),
      })),
    });
  } catch (error) {
    return mobionApiError(error, "프로젝트 정보를 불러오지 못했습니다.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    // Same limits the create route applies, so an edit cannot smuggle in a
    // value that creating would have rejected.
    const name = body.name != null ? String(body.name).trim().slice(0, 100) : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "프로젝트 이름을 입력해 주세요." }, { status: 400 });
    }
    const description =
      body.description != null ? String(body.description).trim().slice(0, 500) : undefined;

    if (name === undefined && description === undefined) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    const result = await query<{ id: string; name: string; description: string }>(
      `UPDATE mobion_projects SET
         name = COALESCE($2, name),
         description = COALESCE($3, description)
       WHERE id = $1
       RETURNING id, name, description`,
      [id, name ?? null, description ?? null],
    );

    const project = result.rows[0];
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    return mobionApiError(error, "프로젝트 수정 실패");
  }
}
