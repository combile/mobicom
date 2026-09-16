import { EventEmitter } from "events";
import { ensureMobionSchema, pool } from "./mobion-db";

/**
 * 알림 행이 생겼다는 신호를 사용자별로 나눠 주는 곳.
 *
 * 태스크 배정·댓글·상태·마감·채팅 멘션이 알림을 쓰는 자리가 여러 곳이라, 각
 * 자리에서 신호를 보내는 대신 DB 트리거(mobion-db.ts의
 * mobion_notification_inserted)가 커밋 시점에 pg_notify를 보낸다. 여기서는
 * 연결 하나로 그것을 LISTEN하고 user_id별로 흘려 보낸다.
 *
 * 연결이 끊기면 몇 초 뒤 다시 붙는다. 그 사이의 신호는 잃지만, 클라이언트의
 * 주기 조회가 따라잡는다.
 */
const CHANNEL = "mobion_notification";
const RETRY_MS = 5_000;

declare global {
  var mobionNotifyBus: EventEmitter | undefined;
  var mobionNotifyListening: Promise<void> | undefined;
}

const bus =
  globalThis.mobionNotifyBus ??
  (globalThis.mobionNotifyBus = new EventEmitter().setMaxListeners(0));

function retryLater() {
  globalThis.mobionNotifyListening = undefined;
  setTimeout(() => void listen(), RETRY_MS);
}

function listen() {
  globalThis.mobionNotifyListening ??= (async () => {
    await ensureMobionSchema(); // 트리거가 먼저 있어야 한다
    // 풀에서 하나를 빌려 돌려주지 않는다 — LISTEN은 그 연결에 묶여 있다
    const client = await pool.connect();
    client.on("notification", (msg) => {
      if (msg.payload) bus.emit(msg.payload);
    });
    client.on("error", (error) => {
      client.release(error);
      retryLater();
    });
    await client.query(`LISTEN ${CHANNEL}`);
  })().catch(retryLater);
  return globalThis.mobionNotifyListening;
}

/** userId에게 새 알림이 생길 때마다 onNotify를 부른다. 해제 함수를 돌려준다. */
export async function subscribeNotifications(userId: string, onNotify: () => void) {
  await listen();
  bus.on(userId, onNotify);
  return () => {
    bus.off(userId, onNotify);
  };
}
