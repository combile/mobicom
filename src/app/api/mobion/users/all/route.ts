import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type UserRow = { id: string; name: string; huly_social_id: string | null };

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<UserRow>(
      // LEFT JOIN, not JOIN: this list is what @-mention autocomplete reads, and
      // someone who has not been linked to Huly yet still belongs in it. Their
      // huly_social_id is null, which the client reads as "cannot DM".
      `SELECT u.id, u.name, l.huly_social_id
         FROM mobion_users u
         LEFT JOIN mobion_huly_link l ON l.user_id = u.id
        ORDER BY u.name`,
    );
    return NextResponse.json({
      users: result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        hulySocialId: r.huly_social_id,
      })),
    });
  } catch (error) {
    return mobionApiError(error, "사용자 목록 조회 실패");
  }
}
