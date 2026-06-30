import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id, itemId } = await params;
    const body = await request.json();
    const title = body.title == null ? null : String(body.title).trim();
    const done = body.done == null ? null : Boolean(body.done);

    if (title === "") {
      return NextResponse.json({ error: "체크리스트 항목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `UPDATE mobion_task_checklist c
       SET title = COALESCE($4, c.title),
           done = COALESCE($5, c.done),
           updated_at = now()
       FROM mobion_tasks t
       WHERE c.id = $1
         AND c.task_id = $2
         AND c.task_id = t.id
         AND c.user_id = $3
         AND t.user_id = $3
       RETURNING c.id, c.task_id, c.title, c.done, c.updated_at`,
      [itemId, id, user.id, title, done],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "체크리스트를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "체크리스트 수정 실패");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id, itemId } = await params;
    await query(
      `DELETE FROM mobion_task_checklist c
       USING mobion_tasks t
       WHERE c.id = $1
         AND c.task_id = $2
         AND c.task_id = t.id
         AND c.user_id = $3
         AND t.user_id = $3`,
      [itemId, id, user.id],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "체크리스트 삭제 실패");
  }
}
