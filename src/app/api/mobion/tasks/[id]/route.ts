import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["todo", "in_progress", "done"];

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query<{ id: string }>(
      `DELETE FROM mobion_tasks WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "태스크 삭제 실패");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    if (body.status !== undefined && !VALID_STATUSES.includes(String(body.status))) {
      return NextResponse.json({ error: "올바르지 않은 상태 값입니다." }, { status: 400 });
    }

    const title = body.title != null ? String(body.title).trim().slice(0, 150) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "태스크 제목을 입력해 주세요." }, { status: 400 });
    }
    const description =
      body.description != null ? String(body.description).trim().slice(0, 1000) : undefined;
    // body.assigneeId can be undefined (leave untouched), null (clear), or a string
    // (set). `String(body.assigneeId) || null` looks equivalent but isn't: String(null)
    // is the truthy string "null", not "" — it would send the literal text "null" to a
    // ::uuid cast and blow up instead of clearing the column. Check falsiness first.
    const assigneeId = body.assigneeId !== undefined ? (body.assigneeId ? String(body.assigneeId) : null) : undefined;
    const milestoneId = body.milestoneId !== undefined ? (body.milestoneId ? String(body.milestoneId) : null) : undefined;
    const dueDate = body.dueDate !== undefined ? (body.dueDate ? String(body.dueDate) : null) : undefined;

    // Read the current assignee first: a notification should follow a genuine
    // change of hands, which cannot be told from the update alone.
    const before = await query<{ assignee_id: string | null; title: string }>(
      `SELECT assignee_id, title FROM mobion_tasks WHERE id = $1`,
      [id],
    );

    const result = await query<{
      id: string;
      title: string;
      description: string;
      status: string;
      due_date: string | null;
      milestone_id: string | null;
      assignee_id: string | null;
    }>(
      `UPDATE mobion_tasks SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         status = COALESCE($4, status),
         assignee_id = CASE WHEN $5::boolean THEN $6::uuid ELSE assignee_id END,
         milestone_id = CASE WHEN $7::boolean THEN $8::uuid ELSE milestone_id END,
         due_date = CASE WHEN $9::boolean THEN $10::date ELSE due_date END
       WHERE id = $1
       RETURNING id, title, description, status, due_date, milestone_id, assignee_id`,
      [
        id,
        title ?? null,
        description ?? null,
        body.status ?? null,
        assigneeId !== undefined,
        assigneeId ?? null,
        milestoneId !== undefined,
        milestoneId ?? null,
        dueDate !== undefined,
        dueDate ?? null,
      ],
    );

    const t = result.rows[0];
    if (!t) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    // Only a genuine change of hands is worth telling someone about — saving
    // the same assignee again, or picking yourself, is not news.
    const previousAssignee = before.rows[0]?.assignee_id ?? null;
    if (
      assigneeId !== undefined &&
      assigneeId &&
      assigneeId !== previousAssignee &&
      assigneeId !== user.id
    ) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         VALUES ($1, 'assigned', $2, $3, $4)`,
        [assigneeId, id, user.id, t.title.slice(0, 200)],
      );
    }

    return NextResponse.json({
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.due_date,
        milestoneId: t.milestone_id,
        assigneeId: t.assignee_id,
      },
    });
  } catch (error) {
    return mobionApiError(error, "태스크 수정 실패");
  }
}
