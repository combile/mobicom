import { NextResponse } from "next/server";
import { canOversee, requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

/**
 * Archiving a document is a distinct, stricter permission (Lead/Professor
 * only, per MOB-DOC-005) than editing one (any logged-in member), so it is
 * split into its own route rather than a field on the general PATCH — the
 * same reason contests/[id]/interest is its own route rather than a field on
 * a general contest PATCH.
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    if (!canOversee(user)) {
      return NextResponse.json(
        { error: "Lead 또는 Professor만 문서를 보관할 수 있습니다." },
        { status: 403 },
      );
    }
    const { id } = await params;

    const result = await query<{ id: string }>(
      `UPDATE mobion_documents SET archived_at = now()
       WHERE id = $1 AND archived_at IS NULL
       RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) {
      const exists = await query<{ id: string }>(
        `SELECT id FROM mobion_documents WHERE id = $1`,
        [id],
      );
      if (exists.rows.length === 0) {
        return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
      }
      // Already archived — treat as a no-op success rather than an error.
    }

    return NextResponse.json({ archived: true });
  } catch (error) {
    return mobionApiError(error, "문서 보관에 실패했습니다.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    if (!canOversee(user)) {
      return NextResponse.json(
        { error: "Lead 또는 Professor만 문서 보관을 해제할 수 있습니다." },
        { status: 403 },
      );
    }
    const { id } = await params;

    const result = await query<{ id: string }>(
      `UPDATE mobion_documents SET archived_at = NULL
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ archived: false });
  } catch (error) {
    return mobionApiError(error, "문서 보관 해제에 실패했습니다.");
  }
}
