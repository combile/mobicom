import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["planned", "in_progress", "done"];

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    // Detach tasks before removing the milestone. Deleting them alongside it
    // would mean one wrong click on a milestone destroys every task filed
    // under it; unlinking loses nothing and the tasks stay in the list.
    // Order matters — if the delete fails after this, tasks are merely
    // unlinked rather than orphaned against a row that no longer exists.
    await query(`UPDATE mobion_tasks SET milestone_id = NULL WHERE milestone_id = $1`, [id]);

    const result = await query<{ id: string }>(
      `DELETE FROM mobion_milestones WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "마일스톤을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "마일스톤 삭제 실패");
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

    if (body.status !== undefined && !VALID_STATUSES.includes(String(body.status))) {
      return NextResponse.json({ error: "올바르지 않은 상태 값입니다." }, { status: 400 });
    }

    const title = body.title != null ? String(body.title).trim().slice(0, 150) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    // undefined leaves the date alone, null clears it. COALESCE alone cannot
    // tell those apart, which is why a target date could be set but never
    // removed. Same shape the task route already uses for its due date.
    const targetDate =
      body.targetDate !== undefined ? (body.targetDate ? String(body.targetDate) : null) : undefined;

    const result = await query<{ id: string; title: string; target_date: string | null; status: string }>(
      `UPDATE mobion_milestones SET
         title = COALESCE($2, title),
         target_date = CASE WHEN $3::boolean THEN $4::date ELSE target_date END,
         status = COALESCE($5, status)
       WHERE id = $1
       RETURNING id, title, target_date, status`,
      [id, title ?? null, targetDate !== undefined, targetDate ?? null, body.status ?? null],
    );

    const m = result.rows[0];
    if (!m) {
      return NextResponse.json({ error: "마일스톤을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      milestone: { id: m.id, title: m.title, targetDate: m.target_date, status: m.status },
    });
  } catch (error) {
    return mobionApiError(error, "마일스톤 수정 실패");
  }
}
