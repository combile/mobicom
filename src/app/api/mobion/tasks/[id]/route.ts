import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

const STATUSES = new Set(["now", "next", "review", "done"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const status = String(body.status ?? "");
    const progress =
      body.progress == null
        ? null
        : Math.max(0, Math.min(100, Number(body.progress)));

    if (status && !STATUSES.has(status)) {
      return NextResponse.json({ error: "상태 값을 확인해 주세요." }, { status: 400 });
    }

    const result = await query(
      `UPDATE mobion_tasks
       SET status = COALESCE(NULLIF($3, ''), status),
           progress = COALESCE($4, progress),
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, code, title, status, owner, progress, updated_at`,
      [id, user.id, status, progress],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ task: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "태스크 수정 실패");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await query(`DELETE FROM mobion_tasks WHERE id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "태스크 삭제 실패");
  }
}
