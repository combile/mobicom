import { NextResponse } from "next/server";
import { canAdminister, requireCurrentUser } from "@/lib/mobion-auth";
import { createInvite } from "@/lib/mobion-invites";
import { mobionApiError } from "@/lib/mobion-api";
import { checkRateLimit } from "@/lib/mobion-rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!canAdminister(user)) {
      return NextResponse.json(
        { error: "초대 권한이 없습니다." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    const limited = checkRateLimit(request, {
      scope: "invite",
      identifier: user.id,
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    const { token, expiresAt } = await createInvite(email, user.id);
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    return mobionApiError(error, "초대 생성 실패");
  }
}
