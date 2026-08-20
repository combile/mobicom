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
 * The steps one task breaks down into.
 *
 * A task carried a title, a description and a single status, so anything with
 * more than one part had to be either split into several tasks — burying the
 * list under bookkeeping — or tracked in someone's head. Steps that are only
 * meaningful together belong to one task, and the state of each is worth
 * seeing without reading a description.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;

    const result = await query<ChecklistRow>(
      `SELECT id, label, done, position FROM mobion_task_checklist
       WHERE task_id = $1 ORDER BY position ASC, created_at ASC`,
      [id],
    );

    return NextResponse.json({ items: result.rows });
  } catch (error) {
    return mobionApiError(error, "체크리스트를 불러오지 못했습니다.");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireCurrentUser();
    const { id } = await params;
    const payload = await request.json();

    const label = String(payload.label ?? "")
      .trim()
      .slice(0, 200);
    if (!label) {
      return NextResponse.json({ error: "할 일을 입력해 주세요." }, { status: 400 });
    }

    // Checked before inserting rather than left to the foreign key: the
    // constraint violation would surface as a 500 for what is simply a bad id.
    const task = await query<{ id: string }>(`SELECT id FROM mobion_tasks WHERE id = $1`, [id]);
    if (!task.rows[0]) {
      return NextResponse.json({ error: "태스크를 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await query<ChecklistRow>(
      `INSERT INTO mobion_task_checklist (task_id, label, position)
       VALUES (
         $1, $2,
         -- append: one past the current last, and 0 for the first item
         (SELECT COALESCE(MAX(position) + 1, 0) FROM mobion_task_checklist WHERE task_id = $1)
       )
       RETURNING id, label, done, position`,
      [id, label],
    );

    return NextResponse.json({ item: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "할 일을 추가하지 못했습니다.");
  }
}
