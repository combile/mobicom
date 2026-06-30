import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

const STATUSES = new Set(["planned", "active", "done"]);
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const title = body.title == null ? null : String(body.title).trim();
    const project = body.project == null ? null : String(body.project).trim();
    const targetDate =
      body.targetDate === undefined ? undefined : String(body.targetDate ?? "").trim();
    const status = body.status == null ? null : String(body.status);
    const summary = body.summary == null ? null : String(body.summary).trim();

    if (status && !STATUSES.has(status)) {
      return NextResponse.json({ error: "마일스톤 상태를 확인해 주세요." }, { status: 400 });
    }
    if (targetDate && !DATE_VALUE.test(targetDate)) {
      return NextResponse.json({ error: "목표일 형식을 확인해 주세요." }, { status: 400 });
    }

    const result = await query(
      `UPDATE mobion_milestones
       SET title = COALESCE(NULLIF($3, ''), title),
           project = COALESCE(NULLIF($4, ''), project),
           target_date = CASE
             WHEN $5::text IS NULL THEN target_date
             ELSE NULLIF($5::text, '')::date
           END,
           status = COALESCE($6, status),
           summary = COALESCE($7, summary),
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, project, target_date::text AS target_date,
                 status, summary, updated_at`,
      [id, user.id, title, project, targetDate, status, summary],
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { error: "마일스톤을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ milestone: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "마일스톤 수정 실패");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await query(`DELETE FROM mobion_milestones WHERE id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "마일스톤 삭제 실패");
  }
}
