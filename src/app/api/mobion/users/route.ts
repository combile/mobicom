import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type UserRow = { id: string; name: string };

export async function GET() {
  try {
    await requireCurrentUser();
    const result = await query<UserRow>(
      `SELECT u.id, u.name
       FROM mobion_users u
       JOIN mobion_huly_link l ON l.user_id = u.id
       WHERE l.huly_social_id IS NOT NULL AND u.role <> 'professor'
       ORDER BY u.name`,
    );
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    return mobionApiError(error, "사용자 목록 조회 실패");
  }
}
