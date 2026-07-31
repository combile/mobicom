import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { pingAsUser } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link
       WHERE user_id = $1
       LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json(
        { error: "Huly 계정이 연결되어 있지 않습니다." },
        { status: 404 },
      );
    }

    const ok = await pingAsUser(link);
    if (!ok) {
      return NextResponse.json({ error: "huly_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "Huly 연결 확인 실패");
  }
}
