import { NextResponse } from "next/server";
import { canAdminister, requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["todo", "in_progress", "done"];

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    // Removing a task takes its comments, history and checklist with it, and
    // there is no undo. The role table already said this was the lead's to do;
    // until now nothing enforced it.
    if (!canAdminister(user)) {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다. 랩장에게 요청해 주세요." },
        { status: 403 },
      );
    }
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
    const startDate =
      body.startDate !== undefined ? (body.startDate ? String(body.startDate) : null) : undefined;

    // Read the whole row first. A notification should follow a genuine change
    // of hands, and the history should record genuine changes rather than
    // every save — neither can be told from the update alone. Dates are cast
    // to text so they compare directly against the strings the request sent.
    const before = await query<{
      title: string;
      description: string;
      status: string;
      due_date: string | null;
      start_date: string | null;
      assignee_id: string | null;
      assignee_name: string | null;
      milestone_id: string | null;
      milestone_title: string | null;
    }>(
      `SELECT t.title, t.description, t.status,
              t.due_date::text AS due_date, t.start_date::text AS start_date,
              t.assignee_id, u.name AS assignee_name,
              t.milestone_id, m.title AS milestone_title
       FROM mobion_tasks t
       LEFT JOIN mobion_users u ON u.id = t.assignee_id
       LEFT JOIN mobion_milestones m ON m.id = t.milestone_id
       WHERE t.id = $1`,
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
         due_date = CASE WHEN $9::boolean THEN $10::date ELSE due_date END,
         start_date = CASE WHEN $11::boolean THEN $12::date ELSE start_date END
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
        startDate !== undefined,
        startDate ?? null,
      ],
    );

    const t = result.rows[0];
    if (!t) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    const was = before.rows[0];

    if (was) {
      await recordActivity(id, user.id, was, {
        title,
        description,
        status: body.status !== undefined ? String(body.status) : undefined,
        assigneeId,
        milestoneId,
        dueDate,
        startDate,
      });
    }

    // Only a genuine change of hands is worth telling someone about — saving
    // the same assignee again, or picking yourself, is not news.
    const previousAssignee = was?.assignee_id ?? null;
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

type TaskBefore = {
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  start_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  milestone_id: string | null;
  milestone_title: string | null;
};

/**
 * Write down what actually changed.
 *
 * Values are stored as text rather than as ids and joined back later, so that
 * renaming or deleting a milestone cannot rewrite — or blank out — an entry
 * that describes what happened at the time.
 *
 * Status is the exception and keeps its raw code: it is a closed set whose
 * Korean label belongs with the select that offers it, and if that wording is
 * ever revised the history should read the new way. A person's name should
 * not move like that, which is why it is copied instead.
 */
async function recordActivity(
  taskId: string,
  actorId: string,
  was: TaskBefore,
  next: {
    title?: string;
    description?: string;
    status?: string;
    assigneeId?: string | null;
    milestoneId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
  },
) {
  const entries: { field: string; from: string | null; to: string | null }[] = [];

  if (next.title !== undefined && next.title !== was.title) {
    entries.push({ field: "title", from: was.title, to: next.title });
  }
  // the body is free text, so a before/after pair would be a diff nobody reads
  if (next.description !== undefined && next.description !== was.description) {
    entries.push({ field: "description", from: null, to: null });
  }
  if (next.status !== undefined && next.status !== was.status) {
    entries.push({ field: "status", from: was.status, to: next.status });
  }
  if (next.dueDate !== undefined && next.dueDate !== was.due_date) {
    entries.push({ field: "due_date", from: was.due_date, to: next.dueDate });
  }
  if (next.startDate !== undefined && next.startDate !== was.start_date) {
    entries.push({ field: "start_date", from: was.start_date, to: next.startDate });
  }

  const assigneeChanged =
    next.assigneeId !== undefined && next.assigneeId !== was.assignee_id;
  const milestoneChanged =
    next.milestoneId !== undefined && next.milestoneId !== was.milestone_id;

  if (assigneeChanged || milestoneChanged) {
    // one lookup for both names; a null id simply yields a null name
    const names = await query<{ assignee_name: string | null; milestone_title: string | null }>(
      `SELECT (SELECT name FROM mobion_users WHERE id = $1::uuid) AS assignee_name,
              (SELECT title FROM mobion_milestones WHERE id = $2::uuid) AS milestone_title`,
      [assigneeChanged ? next.assigneeId : null, milestoneChanged ? next.milestoneId : null],
    );
    const resolved = names.rows[0];
    if (assigneeChanged) {
      entries.push({
        field: "assignee",
        from: was.assignee_name,
        to: resolved?.assignee_name ?? null,
      });
    }
    if (milestoneChanged) {
      entries.push({
        field: "milestone",
        from: was.milestone_title,
        to: resolved?.milestone_title ?? null,
      });
    }
  }

  if (entries.length === 0) return;

  // One statement rather than a round trip per field: a single save commonly
  // moves three or four of them at once.
  await query(
    `INSERT INTO mobion_task_activity (task_id, actor_id, field, from_value, to_value)
     SELECT $1, $2, f, v_from, v_to
     FROM unnest($3::text[], $4::text[], $5::text[]) AS t(f, v_from, v_to)`,
    [
      taskId,
      actorId,
      entries.map((e) => e.field),
      entries.map((e) => e.from),
      entries.map((e) => e.to),
    ],
  );
}
