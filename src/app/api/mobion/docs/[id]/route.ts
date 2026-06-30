import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const docBody = String(body.body ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "문서 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `UPDATE mobion_docs
       SET title = $3, body = $4, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id, title, body, updated_at`,
      [id, user.id, title, docBody],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ doc: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "문서 수정 실패");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    await query(`DELETE FROM mobion_docs WHERE id = $1 AND user_id = $2`, [
      id,
      user.id,
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "문서 삭제 실패");
  }
}
