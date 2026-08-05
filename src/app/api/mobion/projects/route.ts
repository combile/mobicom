import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  created_by_name: string;
  created_at: string;
};

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<ProjectRow>(
      `SELECT p.id, p.name, p.description, u.name AS created_by_name, p.created_at
       FROM mobion_projects p
       JOIN mobion_users u ON u.id = p.created_by
       ORDER BY p.created_at ASC`,
    );
    return NextResponse.json({
      projects: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        createdByName: r.created_by_name,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "프로젝트 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, 100);
    const description = String(body.description ?? "").trim().slice(0, 500);

    if (!name) {
      return NextResponse.json({ error: "프로젝트 이름을 입력해 주세요." }, { status: 400 });
    }

    const result = await query<{ id: string; name: string; description: string }>(
      `INSERT INTO mobion_projects (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, description`,
      [name, description, user.id],
    );

    return NextResponse.json({ project: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "프로젝트 생성 실패");
  }
}
