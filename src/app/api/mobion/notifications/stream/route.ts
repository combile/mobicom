import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { subscribeNotifications } from "@/lib/mobion-notify-bus";

/**
 * 새 알림이 생겼다는 신호만 흘려 보내는 스트림.
 *
 * 내용은 싣지 않는다 — 받은 쪽이 GET /api/mobion/notifications로 다시 읽는다.
 * 목록·안읽음 수를 만드는 규칙이 그쪽 한 곳에만 있게 하려는 것이다.
 *
 * 채팅 스트림과 따로 둔 이유: 그쪽은 Huly가 안 되면 닫힌다. 알림이 채팅
 * 서버 상태에 묶이면 안 된다(use-home-data.ts의 같은 판단 참고).
 */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream({
      async start(controller) {
        function write(chunk: string) {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // 이미 닫힌 연결 — cancel이 먼저 오지 않은 경우의 정리
            cleanup();
          }
        }

        const unsubscribe = await subscribeNotifications(user.id, () =>
          write("event: notification\ndata: {}\n\n"),
        );
        // 오래 조용한 연결을 중간 프록시가 끊지 않게
        const ping = setInterval(() => write(": ping\n\n"), 25_000);
        cleanup = () => {
          clearInterval(ping);
          unsubscribe();
        };
        write(": connected\n\n");
      },
      cancel() {
        cleanup();
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
    return mobionApiError(error, "알림 스트림 연결 실패");
  }
}
