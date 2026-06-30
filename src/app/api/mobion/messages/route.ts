import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const message = String(body.body ?? "").trim();

    if (!message) {
      return NextResponse.json({ error: "메시지를 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_messages (user_id, author, body)
       VALUES ($1, $2, $3)
       RETURNING id, author, body, created_at`,
      [user.id, user.name, message],
    );

    return NextResponse.json({ message: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "메시지 전송 실패");
  }
}
