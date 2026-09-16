import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const NAME_MAX = 100;

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

/**
 * Folders for the documents sidebar.
 *
 * Returned flat rather than nested — the client already has to hold every
 * document in memory to build its own tree (for search-filtering across all
 * of them), so building the category tree client-side too is one less shape
 * for this route to get right, and the same flat list works for both list
 * and tree rendering.
 */
export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<CategoryRow>(
      `SELECT id, name, parent_id, created_at FROM mobion_document_categories
       ORDER BY name`,
    );
    return NextResponse.json({
      categories: result.rows.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parent_id,
        createdAt: c.created_at,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "카테고리 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = String(body.name ?? "").trim().slice(0, NAME_MAX);
    const parentId = body.parentId ? String(body.parentId) : null;

    if (!name) {
      return NextResponse.json({ error: "카테고리 이름을 입력해 주세요." }, { status: 400 });
    }

    if (parentId) {
      const parent = await query<{ id: string }>(
        `SELECT id FROM mobion_document_categories WHERE id = $1`,
        [parentId],
      );
      if (parent.rows.length === 0) {
        return NextResponse.json({ error: "상위 카테고리를 찾을 수 없습니다." }, { status: 400 });
      }
    }

    const result = await query<{ id: string }>(
      `INSERT INTO mobion_document_categories (name, parent_id, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, parentId, user.id],
    );

    return NextResponse.json({ category: { id: result.rows[0].id, name, parentId } });
  } catch (error) {
    return mobionApiError(error, "카테고리 생성에 실패했습니다.");
  }
}
