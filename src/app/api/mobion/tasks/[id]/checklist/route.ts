import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "체크리스트 항목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_task_checklist (user_id, task_id, title)
       SELECT $1, t.id, $3
       FROM mobion_tasks t
       WHERE t.id = $2 AND t.user_id = $1
       RETURNING id, task_id, title, done, updated_at`,
      [user.id, id, title],
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "체크리스트 생성 실패");
  }
}
