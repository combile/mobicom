import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type ChecklistRow = {
  id: string;
  label: string;
  done: boolean;
  position: number;
};

/**
 * One checklist item, addressed by its own id.
 *
 * Nesting it under the task would read better, but ticking a box would then
 * have to carry the task id too — and the only thing the row holds at that
 * moment is the item.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const body = await request.json();

    const label = body.label != null ? String(body.label).trim().slice(0, 200) : undefined;
    if (label !== undefined && !label) {
      return NextResponse.json({ error: "할 일을 입력해 주세요." }, { status: 400 });
    }
    // undefined leaves it alone; the CASE below is what tells that apart from
    // an explicit false, which COALESCE cannot
    const done = body.done !== undefined ? Boolean(body.done) : undefined;

    const result = await query<ChecklistRow>(
      `UPDATE mobion_task_checklist SET
         label = COALESCE($2, label),
         done = CASE WHEN $3::boolean THEN $4::boolean ELSE done END
       WHERE id = $1
       RETURNING id, label, done, position`,
      [id, label ?? null, done !== undefined, done ?? false],
    );

    const item = result.rows[0];
    if (!item) {
      return NextResponse.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    return mobionApiError(error, "할 일을 수정하지 못했습니다.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query<{ id: string }>(
      `DELETE FROM mobion_task_checklist WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows[0]) {
      return NextResponse.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "할 일을 삭제하지 못했습니다.");
  }
}
