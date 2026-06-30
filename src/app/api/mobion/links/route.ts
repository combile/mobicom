import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const url = String(body.url ?? "").trim();
    const project = String(body.project ?? "General").trim() || "General";
    const kind = String(body.kind ?? "resource").trim() || "resource";

    if (!title || !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "링크 제목과 http(s) URL을 확인해 주세요." },
        { status: 400 },
      );
    }

    const result = await query(
      `INSERT INTO mobion_links (user_id, title, url, project, kind)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, url, project, kind, created_at`,
      [user.id, title, url, project, kind],
    );

    return NextResponse.json({ link: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "링크 저장 실패");
  }
}
