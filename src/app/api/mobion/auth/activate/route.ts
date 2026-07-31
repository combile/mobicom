import { NextResponse } from "next/server";
import {
  hashPassword,
  verifyPassword,
  createSession,
  findUserByEmail,
} from "@/lib/mobion-auth";
import { findValidInvite, consumeInvite } from "@/lib/mobion-invites";
import { provisionHulyAccount } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { checkRateLimit } from "@/lib/mobion-rate-limit";
import { query } from "@/lib/mobion-db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body.token ?? "");
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");

    const limited = checkRateLimit(request, {
      scope: "activate",
      identifier: token || "unknown",
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    if (name.length < 2 || password.length < 8) {
      return NextResponse.json(
        { error: "이름과 8자 이상 비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const invite = await findValidInvite(token);
    if (!invite) {
      return NextResponse.json(
        { error: "초대 링크가 만료되었거나 이미 사용되었습니다." },
        { status: 410 },
      );
    }

    const existing = await findUserByEmail(invite.email);

    let user: { id: string; name: string; email: string };

    if (existing) {
      const linkResult = await query<{ user_id: string }>(
        `SELECT user_id FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
        [existing.id],
      );
      if (linkResult.rows[0]) {
        return NextResponse.json(
          { error: "이미 가입된 이메일입니다." },
          { status: 409 },
        );
      }
      if (!(await verifyPassword(password, existing.password_hash))) {
        return NextResponse.json(
          { error: "이메일 또는 비밀번호를 확인해 주세요." },
          { status: 401 },
        );
      }
      user = { id: existing.id, name: existing.name, email: existing.email };
    } else {
      const passwordHash = await hashPassword(password);
      const inserted = await query<{ id: string; name: string; email: string }>(
        `INSERT INTO mobion_users (name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, email`,
        [name, invite.email, passwordHash],
      );
      user = inserted.rows[0];
    }

    const hulyLink = await provisionHulyAccount(invite.email, name);
    await query(
      `INSERT INTO mobion_huly_link
         (user_id, huly_account_email, huly_credential_encrypted, huly_workspace)
       VALUES ($1, $2, $3, $4)`,
      [
        user.id,
        hulyLink.huly_account_email,
        hulyLink.huly_credential_encrypted,
        hulyLink.huly_workspace,
      ],
    );

    await consumeInvite(invite.id);
    await createSession(user.id);

    return NextResponse.json({ user });
  } catch (error) {
    return mobionApiError(error, "계정 활성화 실패");
  }
}
