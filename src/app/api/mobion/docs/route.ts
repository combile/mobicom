import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const docBody = String(body.body ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "문서 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_docs (user_id, title, body)
       VALUES ($1, $2, $3)
       RETURNING id, title, body, updated_at`,
      [user.id, title, docBody],
    );

    return NextResponse.json({ doc: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "문서 생성 실패");
  }
}
