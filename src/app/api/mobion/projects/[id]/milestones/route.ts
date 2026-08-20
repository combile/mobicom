import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { VALID_KINDS } from "@/app/api/mobion/milestones/[id]/route";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id: projectId } = await params;
    const body = await request.json();
    const title = String(body.title ?? "").trim().slice(0, 150);
    const kind = body.kind ? String(body.kind) : "checkpoint";
    const targetDate = body.targetDate ? String(body.targetDate) : null;

    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: "올바르지 않은 마일스톤 유형입니다." }, { status: 400 });
    }
    if (!targetDate) {
      return NextResponse.json(
        { error: "마일스톤에는 목표 날짜가 필요합니다." },
        { status: 400 },
      );
    }
    if (!title) {
      return NextResponse.json({ error: "마일스톤 제목을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{
      id: string;
      title: string;
      target_date: string | null;
      status: string;
      kind: string;
    }>(
      `INSERT INTO mobion_milestones (project_id, title, target_date, kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, target_date, status, kind`,
      [projectId, title, targetDate, kind],
    );

    const m = result.rows[0];
    return NextResponse.json({
      milestone: {
        id: m.id,
        title: m.title,
        targetDate: m.target_date,
        status: m.status,
        kind: m.kind,
      },
    });
  } catch (error) {
    return mobionApiError(error, "마일스톤 생성 실패");
  }
}
