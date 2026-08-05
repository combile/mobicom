import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const VALID_STATUSES = ["planned", "in_progress", "done"];

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

    const title = body.title !== undefined ? String(body.title).trim().slice(0, 150) : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; title: string; target_date: string | null; status: string }>(
      `UPDATE mobion_milestones SET
         title = COALESCE($2, title),
         target_date = COALESCE($3, target_date),
         status = COALESCE($4, status)
       WHERE id = $1
       RETURNING id, title, target_date, status`,
      [id, title ?? null, body.targetDate ?? null, body.status ?? null],
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
