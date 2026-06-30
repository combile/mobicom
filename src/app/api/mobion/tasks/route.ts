import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

const STATUSES = new Set(["now", "next", "review", "done"]);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const code = String(body.code ?? "").trim() || "TASK";
    const title = String(body.title ?? "").trim();
    const status = String(body.status ?? "now");
    const owner = String(body.owner ?? user.name.slice(0, 2)).trim();
    const progress = Math.max(0, Math.min(100, Number(body.progress ?? 0)));

    if (!title || !STATUSES.has(status)) {
      return NextResponse.json({ error: "태스크 정보를 확인해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_tasks (user_id, code, title, status, owner, progress)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, code, title, status, owner, progress, updated_at`,
      [user.id, code, title, status, owner, progress],
    );

    return NextResponse.json({ task: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "태스크 생성 실패");
  }
}
