import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspaceClient, CHUNTER_CLASS } from "@/lib/mobion-huly";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";

type HulyLinkRow = {
  huly_account_email: string;
  huly_credential_encrypted: string;
  huly_workspace: string;
};

type ChunterSpace = { _id: string; name: string; private: boolean; members: string[] };
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
  createdOn?: number;
  modifiedOn: number;
  attributes?: { message?: string; name?: string; private?: boolean; members?: string[] };
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

function canSeeChannel(channel: { private: boolean; members: string[] }, myAccountUuid: string) {
  return !channel.private || channel.members.includes(myAccountUuid);
}

// A channel-creation tx: same TxCreateDoc shape as a chat message (see
// isNewChatMessage above), but for the Channel class itself, with the full
// Channel doc's fields as attributes instead of just a message string.
function isNewChannel(tx: RawTx) {
  return (
    tx._class === "core:class:TxCreateDoc" &&
    tx.objectClass === CHUNTER_CLASS.Channel
  );
}

type AuthorRow = { huly_social_id: string | null; name: string };

export async function GET() {
  try {
    const user = await requireCurrentUser();

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

        // Reported as an in-stream event on a normal 200 response, not a 404 —
        // a non-200 here would make EventSource treat it as a transient
        // connection failure and retry forever with backoff, never showing
        // the user why. See mobion-huly.ts's huly_social_id comment: only the
        // admin-bootstrapped account (created directly in Postgres, bypassing
        // the invite/activate flow) can hit this in practice.
        const linkResult = await query<HulyLinkRow>(
          `SELECT huly_account_email, huly_credential_encrypted, huly_workspace
           FROM mobion_huly_link WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        const link = linkResult.rows[0];
        if (!link) {
          send("error", { message: "not_linked" });
          controller.close();
          return;
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
        let authorRows: AuthorRow[];
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
        // Channel.members (unlike ChatMessage.createdBy below, which stays
        // PersonId/primarySocialId throughout) is keyed by AccountUuid — Huly's
        // own server-side space-membership scoping matches on it, confirmed
        // against the live server. See mobion-huly.ts's accountUuid comment.
        const myAccountUuid = client.account.accountUuid;
        const visibleChannels = channels.filter((c) => canSeeChannel(c, myAccountUuid));
        // Tracked for the lifetime of this connection so a later ChatMessage delta
        // can be checked against the channel it belongs to without a re-query —
        // a channel's own privacy doesn't change after creation in this app (no
        // edit-channel feature), so a snapshot-time map stays accurate.
        const channelPrivacy = new Map(
          channels.map((c) => [c._id, { private: c.private, members: c.members }]),
        );
        // Best-effort: an author name we can't resolve just falls back to the
        // raw Huly id client-side, it never blocks the stream from opening.
        authorRows = await query<AuthorRow>(
          `SELECT l.huly_social_id, u.name
           FROM mobion_huly_link l JOIN mobion_users u ON u.id = l.user_id
           WHERE l.huly_social_id IS NOT NULL`,
        ).then((r) => r.rows).catch(() => []);
        const authorNames = new Map(authorRows.map((r) => [r.huly_social_id, r.name]));

        const spaces = [
          ...visibleChannels.map((c) => ({ id: c._id, name: c.name, kind: "channel" as const })),
          ...dms.map((d) => ({ id: d._id, name: d.name, kind: "dm" as const })),
        ];

        send("snapshot", {
          channels: spaces,
          messages: messages.map((m) => ({
            id: m._id,
            channelId: m.attachedTo,
            text: m.message,
            authorId: m.createdBy,
            authorName: authorNames.get(m.createdBy) ?? null,
            createdOn: m.createdOn,
          })),
        });

        unsubscribe = client.setNotifyHandler((txes) => {
          for (const tx of txes as RawTx[]) {
            if (isNewChannel(tx)) {
              const isPrivate = tx.attributes?.private ?? false;
              const members = tx.attributes?.members ?? [];
              channelPrivacy.set(tx.objectId, { private: isPrivate, members });
              if (!canSeeChannel({ private: isPrivate, members }, myAccountUuid)) continue;
              send("channel_added", {
                id: tx.objectId,
                name: tx.attributes?.name ?? "",
                kind: "channel" as const,
              });
              continue;
            }
            if (!isNewChatMessage(tx)) continue;
            const owningChannel = channelPrivacy.get(tx.attachedTo);
            // A message in a channel this connection was never told about (created
            // before this connection opened, or a privacy check that somehow
            // missed it) is treated as not visible — fail closed, not open.
            if (owningChannel && !canSeeChannel(owningChannel, myAccountUuid)) continue;
            send("delta", {
              id: tx.objectId,
              channelId: tx.attachedTo,
              text: tx.attributes?.message ?? "",
              authorId: tx.createdBy,
              authorName: authorNames.get(tx.createdBy) ?? null,
              // Huly's Doc.createdOn is documented as optional ("filled by
              // platform") — createTxCreateDoc only guarantees modifiedOn.
              // Fall back so message ordering never compares against undefined.
              createdOn: tx.createdOn ?? tx.modifiedOn,
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
