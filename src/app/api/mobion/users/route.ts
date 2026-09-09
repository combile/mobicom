import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type UserRow = { id: string; name: string; huly_social_id: string };

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<UserRow>(
      // huly_social_id comes along so the client can match a message's author
      // (a Huly PersonId) back to the person it belongs to — needed to open a
      // DM from a message. It is already visible on every message as authorId,
      // so this exposes nothing new.
      `SELECT u.id, u.name, l.huly_social_id
       FROM mobion_users u
       JOIN mobion_huly_link l ON l.user_id = u.id
       WHERE l.huly_social_id IS NOT NULL AND u.role <> 'professor'
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
