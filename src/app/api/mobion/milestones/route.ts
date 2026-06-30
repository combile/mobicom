import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

const STATUSES = new Set(["planned", "active", "done"]);
const DATE_VALUE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const project = String(body.project ?? "General").trim() || "General";
    const targetDate = String(body.targetDate ?? "").trim() || null;
    const status = String(body.status ?? "planned");
    const summary = String(body.summary ?? "").trim();

    if (!title || !STATUSES.has(status)) {
      return NextResponse.json(
        { error: "마일스톤 제목과 상태를 확인해 주세요." },
        { status: 400 },
      );
    }
    if (targetDate && !DATE_VALUE.test(targetDate)) {
      return NextResponse.json({ error: "목표일 형식을 확인해 주세요." }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mobion_milestones
         (user_id, title, project, target_date, status, summary)
       VALUES ($1, $2, $3, $4::date, $5, $6)
       RETURNING id, title, project, target_date::text AS target_date,
                 status, summary, updated_at`,
      [user.id, title, project, targetDate, status, summary],
    );

    return NextResponse.json({ milestone: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "마일스톤 생성 실패");
  }
}
