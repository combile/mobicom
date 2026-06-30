import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import {
  hashPassword,
  requireCurrentUser,
  verifyPassword,
} from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const name = body.name == null ? null : String(body.name).trim();
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");

    if (name !== null && name.length < 2) {
      return NextResponse.json(
        { error: "이름은 2자 이상이어야 합니다." },
        { status: 400 },
      );
    }

    let passwordHash: string | null = null;
    if (newPassword) {
      if (newPassword.length < 8 || !currentPassword) {
        return NextResponse.json(
          { error: "현재 비밀번호와 8자 이상 새 비밀번호를 입력해 주세요." },
          { status: 400 },
        );
      }

      const existing = await query<{ password_hash: string }>(
        `SELECT password_hash FROM mobion_users WHERE id = $1 LIMIT 1`,
        [user.id],
      );
      const storedHash = existing.rows[0]?.password_hash;
      if (!storedHash || !(await verifyPassword(currentPassword, storedHash))) {
        return NextResponse.json(
          { error: "현재 비밀번호를 확인해 주세요." },
          { status: 401 },
        );
      }
      passwordHash = await hashPassword(newPassword);
    }

    const result = await query<{ id: string; name: string; email: string }>(
      `UPDATE mobion_users
       SET name = COALESCE($2, name),
           password_hash = COALESCE($3, password_hash)
       WHERE id = $1
       RETURNING id, name, email`,
      [user.id, name, passwordHash],
    );

    return NextResponse.json({ user: result.rows[0] });
  } catch (error) {
    return mobionApiError(error, "프로필 수정 실패");
  }
}
