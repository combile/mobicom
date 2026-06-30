import { NextResponse } from "next/server";
import { createSession, findUserByEmail, hashPassword } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { checkRateLimit } from "@/lib/mobion-rate-limit";
import { query } from "@/lib/mobion-db";
import { seedWorkspace } from "@/lib/mobion-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const limited = checkRateLimit(request, {
      scope: "register",
      identifier: email || "unknown",
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    if (name.length < 2 || !email.includes("@") || password.length < 8) {
      return NextResponse.json(
        { error: "이름, 이메일, 8자 이상 비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "이미 가입된 이메일입니다." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const result = await query<{ id: string; name: string; email: string }>(
      `INSERT INTO mobion_users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, passwordHash],
    );
    const user = result.rows[0];
    await seedWorkspace(user.id, user.name);
    await createSession(user.id);

    return NextResponse.json({ user });
  } catch (error) {
    return mobionApiError(error, "회원가입 실패");
  }
}
