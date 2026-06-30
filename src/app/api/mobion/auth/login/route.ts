import { NextResponse } from "next/server";
import { createSession, findUserByEmail, verifyPassword } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { seedWorkspace } from "@/lib/mobion-data";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = await findUserByEmail(email);

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json(
        { error: "이메일 또는 비밀번호를 확인해 주세요." },
        { status: 401 },
      );
    }

    await seedWorkspace(user.id, user.name);
    await createSession(user.id);

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    return mobionApiError(error, "로그인 실패");
  }
}
