import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id: projectId } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, 150);
    const targetDate = body.targetDate ? String(body.targetDate) : null;

    if (!title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; title: string; target_date: string | null; status: string }>(
      `INSERT INTO mobion_milestones (project_id, title, target_date)
       VALUES ($1, $2, $3)
       RETURNING id, title, target_date, status`,
      [projectId, title, targetDate],
    );

    const m = result.rows[0];
    return NextResponse.json({
      milestone: { id: m.id, title: m.title, targetDate: m.target_date, status: m.status },
    });
  } catch (error) {
    return mobionApiError(error, "마일스톤 생성 실패");
  }
}
