import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

const KINDS = new Set(["note", "spec", "meeting", "retro"]);

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const docBody = String(body.body ?? "").trim();
    const project = String(body.project ?? "General").trim() || "General";
    const kind = String(body.kind ?? "note");
    const pinned = Boolean(body.pinned);

    if (!title || !KINDS.has(kind)) {
      return NextResponse.json({ error: "문서 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_docs (user_id, title, body, project, kind, pinned)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, body, project, kind, pinned, updated_at`,
      [user.id, title, docBody, project, kind, pinned],
    );

    return NextResponse.json({ doc: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "문서 생성 실패");
  }
}
