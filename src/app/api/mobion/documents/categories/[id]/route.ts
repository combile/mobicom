import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

const NAME_MAX = 100;

type ParentRow = { parent_id: string | null };

/** Walks parent_id up to the root, returning every ancestor's id (not including `id` itself). */
async function ancestorsOf(id: string): Promise<Set<string>> {
  const seen = new Set<string>();
  let current: string | null = id;
  // Bounded rather than a plain while(true): a bug elsewhere that created a
  // cycle before this check existed must not turn into an infinite loop here.
  for (let i = 0; i < 100 && current !== null; i++) {
    const currentId: string = current;
    const row = await query<ParentRow>(
      `SELECT parent_id FROM mobion_document_categories WHERE id = $1`,
      [currentId],
    );
    const parentId: string | null = row.rows[0]?.parent_id ?? null;
    if (parentId === null || seen.has(parentId)) break;
    seen.add(parentId);
    current = parentId;
  }
  return seen;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    const name = body.name != null ? String(body.name).trim().slice(0, NAME_MAX) : undefined;
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "카테고리 이름을 입력해 주세요." }, { status: 400 });
    }
    const parentIdProvided = Object.prototype.hasOwnProperty.call(body, "parentId");
    const parentId = parentIdProvided ? (body.parentId ? String(body.parentId) : null) : undefined;

    if (name === undefined && parentId === undefined) {
      return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
    }

    if (parentId) {
      if (parentId === id) {
        return NextResponse.json(
          { error: "카테고리를 자기 자신의 하위로 옮길 수 없습니다." },
          { status: 400 },
        );
      }
      const parent = await query<{ id: string }>(
        `SELECT id FROM mobion_document_categories WHERE id = $1`,
        [parentId],
      );
      if (parent.rows.length === 0) {
        return NextResponse.json({ error: "상위 카테고리를 찾을 수 없습니다." }, { status: 400 });
      }
      // Moving a folder under its own descendant would detach it from the
      // tree entirely (nothing above it could ever reach the root again).
      const ancestors = await ancestorsOf(parentId);
      if (ancestors.has(id)) {
        return NextResponse.json(
          { error: "카테고리를 자신의 하위 카테고리 아래로 옮길 수 없습니다." },
          { status: 400 },
        );
      }
    }

    const result = await query<{ id: string; name: string; parent_id: string | null }>(
      `UPDATE mobion_document_categories SET
         name = COALESCE($2, name),
         parent_id = CASE WHEN $3::boolean THEN $4::uuid ELSE parent_id END
       WHERE id = $1
       RETURNING id, name, parent_id`,
      [id, name ?? null, parentIdProvided, parentId ?? null],
    );

    const updated = result.rows[0];
    if (!updated) {
      return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      category: { id: updated.id, name: updated.name, parentId: updated.parent_id },
    });
  } catch (error) {
    return mobionApiError(error, "카테고리 수정에 실패했습니다.");
  }
}

/**
 * Deletes a folder. Sub-folders cascade away with it (the FK is ON DELETE
 * CASCADE), but the documents that were inside it or any of those
 * sub-folders are never deleted — their category_id just becomes NULL
 * ("미분류"), the same "delete the container, keep the contents" rule as
 * everything else destructive in this app.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query(`DELETE FROM mobion_document_categories WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "카테고리 삭제에 실패했습니다.");
  }
}
