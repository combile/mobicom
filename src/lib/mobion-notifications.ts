/**
 * 알림 종류의 단일 출처.
 *
 * 값이 세 곳에 있었다 — DB의 CHECK 제약, 훅의 유니온 타입, 화면의 삼항식.
 * 종류를 하나 늘릴 때마다 세 곳이 어긋날 기회가 생기고, 그중 화면이 가장
 * 조용히 어긋난다(모르는 종류가 "답글"로 찍혀도 아무도 에러를 내지 않는다).
 * 라벨까지 여기 두는 이유가 그것이다.
 */
export const NOTIFICATION_KINDS = [
  "mention",
  "assigned",
  "comment",
  "status",
  "due_soon",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const LABELS: Record<NotificationKind, string> = {
  mention: "멘션",
  assigned: "배정",
  comment: "답글",
  status: "상태",
  due_soon: "마감",
};

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export function notificationLabel(kind: string): string {
  return isNotificationKind(kind) ? LABELS[kind] : "알림";
}

/**
 * 상태 변경 알림의 body에는 상태 코드가 그대로 저장된다. 한국어 표현은
 * 상태를 고르는 select 옆에 있어야 하고, 문구가 개정되면 과거 알림도 새
 * 표현으로 읽혀야 한다 — src/app/api/mobion/tasks/[id]/route.ts의 recordActivity가 같은 판단을 한다.
 */
export function statusChangeText(statusCode: string): string {
  const names: Record<string, string> = {
    todo: "할 일",
    in_progress: "진행 중",
    done: "완료",
  };
  const name = names[statusCode];
  return name ? `${name}(으)로 변경` : "상태 변경";
}

// 이 저장소에는 테스트 프레임워크가 없다. mobion-mentions.ts와 같은 방식으로
// 직접 실행한다: node --experimental-strip-types src/lib/mobion-notifications.ts
if (process.argv[1]?.endsWith("mobion-notifications.ts")) {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(`self-check 실패: ${msg}`);
  };

  assert(notificationLabel("mention") === "멘션", "mention 라벨");
  assert(notificationLabel("status") === "상태", "status 라벨");
  assert(notificationLabel("due_soon") === "마감", "due_soon 라벨");
  // 모르는 값이 조용히 "답글"로 새지 않아야 한다 — 이게 이 모듈의 존재 이유다
  assert(notificationLabel("nonsense") === "알림", "미지의 종류");
  assert(isNotificationKind("comment"), "isNotificationKind 참");
  assert(!isNotificationKind("nope"), "isNotificationKind 거짓");
  assert(statusChangeText("done") === "완료(으)로 변경", "상태 문구");
  assert(statusChangeText("bogus") === "상태 변경", "미지의 상태 코드");
  for (const k of NOTIFICATION_KINDS) {
    assert(notificationLabel(k) !== "알림", `${k}에 라벨 없음`);
  }

  console.log("mobion-notifications self-check passed");
}
