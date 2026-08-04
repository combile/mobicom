import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS, HULY_CORE_SPACE } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const channelId = String(body.channelId ?? "");
    const channelClass = body.channelClass === "dm" ? CHUNTER_CLASS.DirectMessage : CHUNTER_CLASS.Channel;
    const text = String(body.text ?? "").trim();

    if (!channelId || !text) {
      return NextResponse.json({ error: "채널과 메시지 내용이 필요합니다." }, { status: 400 });
    }

    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json({ error: "Huly 계정이 연결되어 있지 않습니다." }, { status: 404 });
    }

    const client = await getWorkspaceClient(link);
    await client.addCollection({
      _class: CHUNTER_CLASS.ChatMessage,
      space: HULY_CORE_SPACE,
      attachedTo: channelId,
      attachedToClass: channelClass,
      collection: "messages",
      attributes: { message: text },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return mobionApiError(error, "메시지 전송 실패");
  }
}
