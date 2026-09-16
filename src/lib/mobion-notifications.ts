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

/**
 * "3시간 전". 하루가 넘으면 단위를 바꾼다 — "37시간 전"은 아무도 읽지 않는다.
 *
 * 일주일이 넘으면 상대 표현을 포기하고 날짜를 쓴다. "9일 전"은 언제인지
 * 세어봐야 알지만 "9월 1일"은 바로 안다.
 *
 * 알림을 그리는 화면이 셋(홈·인박스·알림함)이라 여기 둔다. 세 곳이 각자
 * 구현하면 같은 시각이 화면마다 다르게 읽히기 시작한다.
 */
export function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

type InboxLike = {
  kind: string;
  body: string;
  actorName: string | null;
  channelId: string | null;
  channelName?: string | null;
  /** epoch ms */
  createdOn?: number;
};

/**
 * 나를 부른 채팅은 인박스 "전체"에 멘션 알림과 채팅 메시지로 두 번 잡힌다.
 * 멘션 알림 쪽을 남긴다 — 그 행의 읽음이 알림함 안읽음 수와 이어져 있다.
 * 알림에는 메시지 id가 없어서 같은 대화·같은 사람·같은 본문·1분 이내면
 * 같은 글로 본다. 채팅 쪽의 대화 이름은 남는 줄로 옮긴다.
 *
 * ponytail: 짝이 서로 다른 장에 걸리면 둘 다 보인다. 알림에 message_id 칸을
 * 두면 정확해진다.
 */
export function dropMentionedChats<T extends InboxLike>(items: T[]): T[] {
  const dropped = new Set<T>();
  return items
    .map((m) => {
      if (m.kind !== "mention" || !m.channelId) return m;
      const twin = items.find(
        (c) =>
          c.kind === "chat" &&
          !dropped.has(c) &&
          c.channelId === m.channelId &&
          c.actorName === m.actorName &&
          c.body === m.body &&
          Math.abs((c.createdOn ?? 0) - (m.createdOn ?? 0)) < 60_000,
      );
      if (!twin) return m;
      dropped.add(twin);
      return { ...m, channelName: twin.channelName };
    })
    .filter((i) => !dropped.has(i));
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

  // relativeTime의 경계. 단위가 바뀌는 지점마다 양쪽을 잡는다 —
  // 여기가 틀리면 "60분 전"이나 "37시간 전" 같은 문구가 새어 나온다.
  const ago = (ms: number) => relativeTime(new Date(Date.now() - ms).toISOString());
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  assert(ago(0) === "방금", "0분");
  assert(ago(59 * MIN) === "59분 전", "59분");
  assert(ago(HOUR) === "1시간 전", "60분은 시간으로 넘어간다");
  assert(ago(23 * HOUR) === "23시간 전", "23시간");
  assert(ago(DAY) === "어제", "24시간은 어제");
  assert(ago(47 * HOUR) === "어제", "47시간도 아직 어제");
  assert(ago(2 * DAY) === "2일 전", "48시간은 2일");
  assert(ago(6 * DAY) === "6일 전", "6일");
  // 7일부터는 상대 표현을 버리고 날짜를 쓴다
  assert(!ago(7 * DAY).endsWith("일 전"), "7일은 날짜로 넘어간다");

  // 멘션과 그 채팅은 한 줄로, 상관없는 채팅은 그대로
  const at = (id: string, kind: string, body: string, createdOn: number, channelName?: string) => ({
    id, kind, body, createdOn, channelName, actorName: "영희", channelId: "ch",
  });
  const deduped = dropMentionedChats([
    at("n1", "mention", "hi 철수", 1_000_300),
    at("c1", "chat", "hi 철수", 1_000_000, "#일반"),
    at("c2", "chat", "그냥 글", 1_000_000, "#일반"),
    at("c3", "chat", "hi 철수", 9_000_000, "#일반"),
  ]);
  assert(deduped.map((i) => i.id).join() === "n1,c2,c3", "멘션 채팅 중복 제거");
  assert(deduped[0].channelName === "#일반", "대화 이름 이전");

  console.log("mobion-notifications self-check passed");
}
