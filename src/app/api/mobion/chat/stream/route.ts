import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

type ChunterSpace = { _id: string; name: string };
type ChatMessage = {
  _id: string;
  attachedTo: string;
  message: string;
  createdBy: string;
  createdOn: number;
};

// Shape verified against the live Huly server by Task 1: client.setNotifyHandler(fn)
// calls fn(txes) with a flat array of raw tx objects, NOT wrapped in an outer
// {tx: ...} — see mobion-huly.ts's getWorkspaceClient for the raw.notify wiring.
type RawTx = {
  _class: string;
  objectId: string;
  objectClass: string;
  attachedTo: string;
  createdBy: string;
  createdOn: number;
  attributes?: { message?: string };
};

// A single message post fires TxCreateDoc (the message) + TxUpdateDoc (channel
// counter) + TxWorkspaceEvent, sometimes across multiple separate notify() calls
// (plus unrelated UserStatus/Collaborator noise) — only this combination is an
// actual new chat message.
function isNewChatMessage(tx: RawTx) {
  return (
    tx._class === "core:class:TxCreateDoc" &&
    tx.objectClass === CHUNTER_CLASS.ChatMessage
  );
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const result = await query<HulyLinkRow>(
      `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
       FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
      [user.id],
    );
    const link = result.rows[0];
    if (!link) {
      return NextResponse.json(
        { error: "Huly 계정이 연결되어 있지 않습니다." },
        { status: 404 },
      );
    }

    const encoder = new TextEncoder();
    let closed = false;
    let unsubscribe: (() => void) | undefined;

    const stream = new ReadableStream({
      async start(controller) {
        function send(event: string, data: unknown) {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        }

        let client;
        try {
          client = await getWorkspaceClient(link);
        } catch {
          send("error", { message: "huly_unavailable" });
          controller.close();
          return;
        }

        let channels: ChunterSpace[];
        let dms: ChunterSpace[];
        let messages: ChatMessage[];
        try {
          [channels, dms] = await Promise.all([
            client.findAll<ChunterSpace>(CHUNTER_CLASS.Channel, {}),
            client.findAll<ChunterSpace>(CHUNTER_CLASS.DirectMessage, {}),
          ]);
          messages = await client.findAll<ChatMessage>(CHUNTER_CLASS.ChatMessage, {});
        } catch {
          send("error", { message: "huly_unavailable" });
          controller.close();
          return;
        }

        const spaces = [
          ...channels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const })),
          ...dms.map((d) => ({ id: d._id, name: d.name, kind: "dm" as const })),
        ];

        send("snapshot", {
          channels: spaces,
          messages: messages.map((m) => ({
            id: m._id,
            channelId: m.attachedTo,
            text: m.message,
            authorId: m.createdBy,
            createdOn: m.createdOn,
          })),
        });

        unsubscribe = client.setNotifyHandler((txes) => {
          for (const tx of txes as RawTx[]) {
            if (!isNewChatMessage(tx)) continue;
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              createdOn: tx.createdOn,
            });
          }
        });
      },
      cancel() {
        closed = true;
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return mobionApiError(error, "채팅 스트림 연결 실패");
  }
}
