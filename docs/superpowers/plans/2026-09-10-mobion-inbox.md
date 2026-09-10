# Mobi:ON 인박스 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자 지정·멘션·댓글·상태 변경 알림을 한곳에서 조회하고, 읽음 처리하고, 수신 여부를 고를 수 있는 전용 화면 `inbox`를 만든다.

**Architecture:** 알림은 이미 `mobion_notifications`에 있고 홈이 그것을 읽는다. 여기에 없는 종류(`mention`, `status`)를 채우고, 댓글 위치로 이동할 앵커(`comment_id`)를 더하고, 수신 설정을 `INSERT ... SELECT ... WHERE`로 저장 시점에 적용한다. 조회는 홈용(요약, 부수효과 있음)과 inbox용(전체, 읽기 전용)으로 나눈다.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2.4, PostgreSQL (`pg`), Emotion styled-components

**Spec:** `docs/superpowers/specs/2026-09-10-mobion-inbox-design.md`

## Global Constraints

- **테스트 프레임워크가 없다.** 이 저장소에는 jest도 vitest도 없다. 검증은 두 가지뿐이다 — `mobion-mentions.ts`가 쓰는 self-check(`node --experimental-strip-types <파일>`)와, 로컬 서버에 실제 요청을 보내는 node 스크립트.
- **검증 스크립트에 한글을 담을 때는 반드시 node에서 보낸다.** Git Bash에서 `curl -d '{"body":"한글"}'`은 콘솔 인코딩(cp949) 때문에 글자가 깨진 채 DB에 들어간다. 이 프로젝트에서 실제로 겪은 문제다.
- 모든 라우트는 `requireCurrentUser()`로 시작하고, `catch`는 `mobionApiError(error, "<한국어 문구>")`로 끝낸다.
- 사용자에게 보이는 모든 문구는 한국어다.
- `MOBION_SCHEMA_VERSION`을 올리면 `ensureMobionSchema`의 스크립트 전체가 다시 돈다. 새로 추가하는 문장은 전부 재실행에 안전해야 한다(`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` 뒤 `ADD CONSTRAINT`).
- 로컬 DB: `postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom`. 계정 `testa@mobion.local`(lead) / `testb@mobion.local`(member), 비밀번호 둘 다 `test1234`.

---

## 요구사항 추적표

요청한 6개가 어디서 구현되고 어디서 확인되는지.

| # | 요구사항 | 구현 Task | 확인 지점 |
|---|---|---|---|
| 1 | 담당자 지정·멘션·댓글·상태 변경 알림을 **조회**한다 | 2, 3 (생성) · 4 (조회 API) · 6 (화면) | Task 6 Step 9 |
| 2 | 알림을 선택하면 관련 **태스크·댓글로 이동**한다 | 4 (`commentId` 반환) · 6 (클릭) · 7 (스크롤) | Task 7 Step 6 |
| 3 | 선택한 알림을 **읽음**으로 변경한다 | 6 (기존 `POST /notifications` 재사용) | Task 6 Step 9 |
| 4 | 현재 사용자의 **모든 알림을 읽음** 처리한다 | 6 (기존 엔드포인트 재사용) | Task 6 Step 9 |
| 5 | 일반 변경·댓글 알림의 **수신 여부를 설정**한다 | 1 (컬럼) · 2·3 (반영) · 5 (UI) | Task 5 Step 8 |
| 6 | 직접 멘션·담당자 지정 알림은 **항상 유지**한다 | 2 (멘션) · 3 (배정) · 5 (안내문) | Task 3 Step 4 |

Task 8이 여섯 개를 한 번에 훑는다.

**요구사항에는 없지만 함께 고치는 것:** 태스크를 만들면서 담당자를 지정하면 지금은 알림이 가지 않는다(`assigned` 삽입이 PATCH에만 있다). Task 3에서 고친다.

---

## 파일 구조

| 파일 | 책임 | Task |
|---|---|---|
| `src/lib/mobion-notifications.ts` | **신규.** 알림 종류의 단일 출처 — 타입, 한국어 라벨, self-check | 1 |
| `src/lib/mobion-db.ts` | 스키마 v24 | 1 |
| `src/app/api/mobion/tasks/[id]/comments/route.ts` | 멘션/댓글 분리, `comment_id`, 수신 설정 | 2 |
| `src/app/api/mobion/tasks/[id]/route.ts` | 상태 변경 알림 | 3 |
| `src/app/api/mobion/projects/[id]/tasks/route.ts` | 생성 시 배정 알림 | 3 |
| `src/app/api/mobion/notifications/route.ts` | 홈용 조회에 `kind`·`commentId` 추가 | 4 |
| `src/app/api/mobion/inbox/route.ts` | **신규.** inbox 전용 조회 (필터·커서) | 4 |
| `src/lib/use-home-data.ts` | `Notification` 타입에 새 필드 | 4 |
| `src/app/api/mobion/profile/route.ts` | 수신 설정 저장 | 5 |
| `src/app/profile/page.tsx` | 수신 설정 초기값 조회 | 5 |
| `src/components/ProfileContent.tsx` | 수신 설정 토글 UI | 5 |
| `src/lib/use-inbox-data.ts` | **신규.** inbox 상태·조회·읽음 처리 | 6 |
| `src/components/InboxView.tsx` | **신규.** inbox 화면 | 6 |
| `src/components/MobiOnContent.tsx` | `WorkspaceMode`, 레일 버튼, 렌더 분기 | 6, 7 |
| `src/lib/use-tasks-data.ts` | `openTaskInProject`에 댓글 포커스 인자 | 7 |
| `src/components/ProjectDetailView.tsx` | 댓글 앵커와 스크롤 | 7 |
| `src/components/HomeView.tsx` | 라벨을 공용 함수로 교체 | 7 |

---

## Task 1: 스키마 v24와 알림 종류 공용 모듈

알림 종류가 지금 세 곳에 흩어져 있다 — DB의 CHECK 제약, `use-home-data.ts`의 유니온 타입, `HomeView.tsx`의 삼항식. 종류를 둘 늘리기 전에 한곳으로 모은다.

**Files:**
- Create: `src/lib/mobion-notifications.ts`
- Modify: `src/lib/mobion-db.ts` (`MOBION_SCHEMA_VERSION` 상수, `ensureMobionSchema` 끝부분)

**Interfaces:**
- Produces: `NotificationKind` (유니온), `NOTIFICATION_KINDS` (readonly 배열), `notificationLabel(kind: string): string`, `isNotificationKind(v: string): v is NotificationKind`, `statusChangeText(code: string): string`

- [ ] **Step 1: 공용 모듈을 self-check와 함께 작성**

`src/lib/mobion-notifications.ts` 생성:

```typescript
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
 * 표현으로 읽혀야 한다 — mobion-db.ts 아래 recordActivity가 같은 판단을 한다.
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
```

- [ ] **Step 2: self-check 실행**

```bash
node --experimental-strip-types src/lib/mobion-notifications.ts
```

기대: `mobion-notifications self-check passed`

- [ ] **Step 3: self-check가 실패도 하는지 확인**

`LABELS.mention`을 잠시 `"멘숀"`으로 바꾸고 Step 2를 다시 실행한다.

기대: `self-check 실패: mention 라벨`로 죽는다. 확인했으면 되돌린다.

> 통과만 확인한 self-check는 아무것도 검증하지 않는다. 한 번은 실패시켜 봐야 한다.

- [ ] **Step 4: 스키마 버전 올리기**

`src/lib/mobion-db.ts`:

```typescript
const MOBION_SCHEMA_VERSION = 24;
```

- [ ] **Step 5: 마이그레이션 추가**

`ensureMobionSchema` 안, 파일에서 마지막 `await pool.query(...)` 뒤에:

```typescript
      // 알림 종류 둘 추가. 'mention'은 'comment'에서 갈라져 나온 것으로,
      // "나를 언급했다"와 "내 태스크에 댓글이 달렸다"는 인박스에서 다르게
      // 읽혀야 한다. 기존 'comment' 행은 건드리지 않는다 — 과거 알림이
      // 멘션이었는지는 소급 판정할 수 없다.
      await pool.query(
        `ALTER TABLE mobion_notifications
           DROP CONSTRAINT IF EXISTS mobion_notifications_kind_check`,
      );
      await pool.query(
        `ALTER TABLE mobion_notifications
           ADD CONSTRAINT mobion_notifications_kind_check
           CHECK (kind IN ('comment', 'assigned', 'due_soon', 'mention', 'status'))`,
      );
      // 알림이 비롯된 댓글. SET NULL인 이유는 mobion_task_comments.user_id와
      // 같다 — 댓글이 사라져도 "누가 나를 불렀다"는 사실은 남아야 하고,
      // 이동만 태스크 수준으로 물러나면 된다.
      await pool.query(
        `ALTER TABLE mobion_notifications
           ADD COLUMN IF NOT EXISTS comment_id UUID
           REFERENCES mobion_task_comments(id) ON DELETE SET NULL`,
      );
      // 수신 설정. 조회가 아니라 저장 시점에 적용된다 — 조회 경로는 45초마다
      // 도는 이 앱의 심장박동이라 가장 단순하게 두어야 한다. 기본값 true는
      // 기존 사용자가 지금과 똑같이 받는다는 뜻이다.
      await pool.query(
        `ALTER TABLE mobion_users
           ADD COLUMN IF NOT EXISTS notify_comment BOOLEAN NOT NULL DEFAULT true,
           ADD COLUMN IF NOT EXISTS notify_status BOOLEAN NOT NULL DEFAULT true`,
      );
```

- [ ] **Step 6: 마이그레이션 실행**

스키마는 첫 DB 조회에서 돈다. 인증 없이도 DB를 건드리는 요청을 한 번 보낸다.

```bash
npm run dev   # 별도 터미널
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/mobion/auth/login \
  -H "Content-Type: application/json" -d '{"email":"bootstrap@local","password":"x"}'
```

기대: `401` (DB까지 도달했다는 뜻)

- [ ] **Step 7: 스키마를 눈으로 확인**

`scripts/check-schema.mjs`를 만들어 실행(커밋하지 않는다):

```javascript
import pg from "pg";
const c = new pg.Client({
  connectionString: "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom",
});
await c.connect();
const cols = await c.query(
  `SELECT table_name, column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name IN ('mobion_notifications','mobion_users')
     AND column_name IN ('comment_id','notify_comment','notify_status')
   ORDER BY table_name, column_name`,
);
console.table(cols.rows);
const check = await c.query(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conname = 'mobion_notifications_kind_check'`,
);
console.log(check.rows[0]?.def);
await c.end();
```

```bash
node scripts/check-schema.mjs
```

기대: 컬럼 3개가 모두 나오고, 제약 정의에 `mention`과 `status`가 들어 있다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/mobion-notifications.ts src/lib/mobion-db.ts
git commit -m "feat: 알림 종류 공용 모듈과 스키마 v24

알림 종류가 DB 제약·훅 타입·화면 삼항식 세 곳에 흩어져 있어, 종류를
늘릴 때마다 화면이 조용히 어긋날 수 있었다. 한곳으로 모으고 self-check를
붙였다. 스키마에는 mention/status 종류, comment_id 앵커, 수신 설정 두
컬럼을 더했다."
```

---

## Task 2: 멘션과 댓글을 나누고 수신 설정을 반영한다

**요구사항 1(멘션·댓글 조회), 5(수신 설정), 6(멘션은 항상)**

**Files:**
- Modify: `src/app/api/mobion/tasks/[id]/comments/route.ts` (POST의 알림 삽입 부분)

**Interfaces:**
- Consumes: Task 1의 스키마 v24 (`comment_id`, `notify_comment`)
- Produces: `kind='mention'`과 `kind='comment'` 행. 둘 다 `comment_id`가 채워진다.

- [ ] **Step 1: 삽입된 댓글 id를 알림에서 쓸 수 있게 한다**

댓글 INSERT 결과는 이미 `result`에 있다. 알림 블록(주석 `// Being named is a direct request…` 바로 위)에 한 줄 추가:

```typescript
    const commentId = result.rows[0].id;
```

- [ ] **Step 2: 멘션 알림을 `kind='mention'`으로 바꾸고 앵커를 넣는다**

기존 `for (const userId of mentioned) { ... }` 블록을 교체:

```typescript
    for (const userId of mentioned) {
      // 멘션은 직접 호명이므로 수신 설정과 무관하게 항상 간다.
      await query(
        `INSERT INTO mobion_notifications
           (user_id, kind, task_id, comment_id, actor_id, body)
         VALUES ($1, 'mention', $2, $3, $4, $5)`,
        // 홈 피드에 평문으로 나가므로, 저장된 마크업 그대로면 알림
        // 한복판에 uuid가 찍힌다
        [userId, id, commentId, user.id, mentionPlainText(body).slice(0, 200)],
      );
    }
```

- [ ] **Step 3: 담당자 댓글 알림에 수신 설정을 건다**

기존 `if (task.assignee_id && ...) { ... }` 블록을 교체:

```typescript
    if (task.assignee_id && task.assignee_id !== user.id && !mentioned.has(task.assignee_id)) {
      // INSERT ... SELECT의 WHERE가 수신 설정이다. 설정을 따로 조회하는
      // 왕복이 없고, 꺼져 있으면 0행이 들어간다.
      await query(
        `INSERT INTO mobion_notifications
           (user_id, kind, task_id, comment_id, actor_id, body)
         SELECT $1, 'comment', $2, $3, $4, $5
         FROM mobion_users WHERE id = $1 AND notify_comment`,
        [task.assignee_id, id, commentId, user.id, mentionPlainText(body).slice(0, 200)],
      );
    }
```

- [ ] **Step 4: 검증 스크립트 작성**

`scripts/verify-task2.mjs` (커밋하지 않는다):

```javascript
import pg from "pg";

const DB = "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom";
const BASE = "http://localhost:3000";

async function login(email) {
  const res = await fetch(`${BASE}/api/mobion/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test1234" }),
  });
  if (!res.ok) throw new Error(`로그인 실패: ${email}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const c = new pg.Client({ connectionString: DB });
await c.connect();
const users = await c.query(`SELECT id, name, email FROM mobion_users ORDER BY email`);
const A = users.rows.find((u) => u.email === "testa@mobion.local");
const B = users.rows.find((u) => u.email === "testb@mobion.local");
const cookieA = await login(A.email);
const J = { "Content-Type": "application/json", Cookie: cookieA };

await c.query(`DELETE FROM mobion_notifications`);
await c.query(`UPDATE mobion_users SET notify_comment = true`);

const proj = await fetch(`${BASE}/api/mobion/projects`, {
  method: "POST", headers: J,
  body: JSON.stringify({ name: "Task2 검증", description: "" }),
}).then((r) => r.json());

const task = await fetch(`${BASE}/api/mobion/projects/${proj.project.id}/tasks`, {
  method: "POST", headers: J,
  body: JSON.stringify({ title: "검증용 태스크", assigneeId: B.id }),
}).then((r) => r.json());

const comment = (text) =>
  fetch(`${BASE}/api/mobion/tasks/${task.task.id}/comments`, {
    method: "POST", headers: J, body: JSON.stringify({ body: text }),
  });

// 한글은 반드시 node에서 보낸다 — 셸을 거치면 cp949로 깨진다
await comment(`@[${B.id}:${B.name}] 확인 부탁드립니다`);   // → mention
await comment("멘션 없는 댓글입니다");                      // → comment (담당자 B)

await c.query(`UPDATE mobion_users SET notify_comment = false WHERE id = $1`, [B.id]);
await comment("꺼진 뒤의 댓글입니다");                       // → 없음
await comment(`@[${B.id}:${B.name}] 꺼져 있어도 오는 멘션`);  // → mention

const rows = await c.query(
  `SELECT kind, body, comment_id IS NOT NULL AS anchored
   FROM mobion_notifications ORDER BY created_at`,
);
console.table(rows.rows);

const kinds = rows.rows.map((r) => r.kind);
const expected = ["mention", "comment", "mention"];
console.log(
  JSON.stringify(kinds) === JSON.stringify(expected)
    ? "PASS — 멘션 2건, 댓글 1건, 꺼진 뒤 댓글은 없음"
    : `FAIL — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(kinds)}`,
);
console.log(
  rows.rows.every((r) => r.anchored) ? "PASS — 모든 행에 comment_id" : "FAIL — 앵커 누락",
);

await c.query(`UPDATE mobion_users SET notify_comment = true`);
await c.end();
```

- [ ] **Step 5: 검증 실행**

```bash
node scripts/verify-task2.mjs
```

기대:
```
PASS — 멘션 2건, 댓글 1건, 꺼진 뒤 댓글은 없음
PASS — 모든 행에 comment_id
```

- [ ] **Step 6: 커밋**

```bash
git add "src/app/api/mobion/tasks/[id]/comments/route.ts"
git commit -m "feat: 멘션 알림을 댓글과 분리하고 수신 설정을 적용

멘션과 댓글이 같은 kind='comment'로 저장되어 인박스에서 '나를 언급함'과
'내 태스크에 댓글'을 가릴 수 없었다. 멘션은 kind='mention'으로 갈라내고
수신 설정과 무관하게 항상 보낸다 — 직접 호명이기 때문이다. 담당자 댓글
알림에는 notify_comment를 INSERT ... SELECT의 WHERE로 걸었다.

두 알림 모두 comment_id를 채워, 나중에 그 댓글로 이동할 수 있게 했다."
```

---

## Task 3: 상태 변경 알림과 생성 시 배정 알림

**요구사항 1(상태 변경 조회), 5(수신 설정), 6(배정은 항상)**

**Files:**
- Modify: `src/app/api/mobion/tasks/[id]/route.ts` (PATCH, 기존 `assigned` 삽입 뒤)
- Modify: `src/app/api/mobion/projects/[id]/tasks/route.ts` (POST, 삽입 뒤)

**Interfaces:**
- Consumes: Task 1의 스키마 v24 (`notify_status`)
- Produces: `kind='status'` 행(body에 상태 코드), 태스크 생성 시 `kind='assigned'` 행

- [ ] **Step 1: 상태 변경 알림을 PATCH에 추가**

`src/app/api/mobion/tasks/[id]/route.ts`, 기존 `assigned` 삽입 블록 바로 뒤(그 블록에서 `previousAssignee`가 이미 선언되어 있다):

```typescript
    // 상태 변경은 담당자에게 알린다. 자기가 바꿨으면 알리지 않고, 값이
    // 실제로 달라졌을 때만 — 같은 상태로 저장한 것은 사건이 아니다.
    // 담당자가 이번 요청에서 바뀌었다면 새 담당자를 기준으로 삼는다.
    const nextAssignee = assigneeId !== undefined ? assigneeId : previousAssignee;
    if (
      body.status !== undefined &&
      was &&
      String(body.status) !== was.status &&
      nextAssignee &&
      nextAssignee !== user.id
    ) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         SELECT $1, 'status', $2, $3, $4
         FROM mobion_users WHERE id = $1 AND notify_status`,
        // 상태 코드를 그대로 저장한다. 한국어 표현은 상태를 고르는 select
        // 옆에 있어야 하고, 문구가 바뀌면 과거 알림도 새 표현으로 읽혀야
        // 한다 — 이 파일 아래 recordActivity가 같은 판단을 한다.
        [nextAssignee, id, user.id, String(body.status)],
      );
    }
```

- [ ] **Step 2: 태스크 생성 시 배정 알림을 추가**

`src/app/api/mobion/projects/[id]/tasks/route.ts`의 POST에서, INSERT 결과를 받은 뒤 `NextResponse.json` 앞에:

```typescript
    // 처음 담당자로 지정되는 것도 손바뀜이다. 지금까지 이 알림은 PATCH에만
    // 있어서, 태스크를 만들면서 담당자를 지정하면 그 사람은 아무 통지도
    // 받지 못했다. 배정은 수신 설정과 무관하게 항상 간다.
    if (assigneeId && assigneeId !== user.id) {
      await query(
        `INSERT INTO mobion_notifications (user_id, kind, task_id, actor_id, body)
         VALUES ($1, 'assigned', $2, $3, $4)`,
        [assigneeId, t.id, user.id, t.title.slice(0, 200)],
      );
    }
```

`t`는 이 파일에서 이미 `const t = result.rows[0];`로 선언되어 있다. 이 블록은 그 줄과 `return NextResponse.json({...})` 사이에 들어간다.

- [ ] **Step 3: 검증 스크립트 작성**

`scripts/verify-task3.mjs` (커밋하지 않는다):

```javascript
import pg from "pg";

const DB = "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom";
const BASE = "http://localhost:3000";

async function login(email) {
  const res = await fetch(`${BASE}/api/mobion/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test1234" }),
  });
  if (!res.ok) throw new Error(`로그인 실패: ${email}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const c = new pg.Client({ connectionString: DB });
await c.connect();
const users = await c.query(`SELECT id, name, email FROM mobion_users ORDER BY email`);
const A = users.rows.find((u) => u.email === "testa@mobion.local");
const B = users.rows.find((u) => u.email === "testb@mobion.local");
const ja = { "Content-Type": "application/json", Cookie: await login(A.email) };
const jb = { "Content-Type": "application/json", Cookie: await login(B.email) };

await c.query(`DELETE FROM mobion_notifications`);
await c.query(`UPDATE mobion_users SET notify_status = true`);

const proj = await fetch(`${BASE}/api/mobion/projects`, {
  method: "POST", headers: ja,
  body: JSON.stringify({ name: "Task3 검증", description: "" }),
}).then((r) => r.json());

// 1) 생성하면서 담당자 B → B에게 assigned (지금까지 없던 동작)
const task = await fetch(`${BASE}/api/mobion/projects/${proj.project.id}/tasks`, {
  method: "POST", headers: ja,
  body: JSON.stringify({ title: "상태 검증 태스크", assigneeId: B.id }),
}).then((r) => r.json());

const patch = (headers, payload) =>
  fetch(`${BASE}/api/mobion/tasks/${task.task.id}`, {
    method: "PATCH", headers, body: JSON.stringify(payload),
  });

await patch(ja, { status: "in_progress" });   // → B에게 status

await c.query(`UPDATE mobion_users SET notify_status = false WHERE id = $1`, [B.id]);
await patch(ja, { status: "done" });          // → 없음

await patch(jb, { assigneeId: A.id });        // → A에게 assigned (끌 수 없음)

await patch(ja, { status: "todo" });          // A가 A 담당 태스크를 바꿈 → 자기에겐 안 감

const rows = await c.query(
  `SELECT u.name AS receiver, n.kind, a.name AS actor, n.body
   FROM mobion_notifications n
   JOIN mobion_users u ON u.id = n.user_id
   LEFT JOIN mobion_users a ON a.id = n.actor_id
   ORDER BY n.created_at`,
);
console.table(rows.rows);

const kinds = rows.rows.map((r) => r.kind);
const expected = ["assigned", "status", "assigned"];
console.log(
  JSON.stringify(kinds) === JSON.stringify(expected)
    ? "PASS — 생성 배정 / 상태 / 꺼진 뒤에도 오는 배정, 자기 행동은 제외"
    : `FAIL — 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(kinds)}`,
);
const statusRow = rows.rows.find((r) => r.kind === "status");
console.log(
  statusRow?.body === "in_progress"
    ? "PASS — body에 상태 코드가 그대로"
    : `FAIL — body가 ${statusRow?.body}`,
);

await c.query(`UPDATE mobion_users SET notify_status = true`);
await c.end();
```

- [ ] **Step 4: 검증 실행 — 요구사항 6 확인 지점**

```bash
node scripts/verify-task3.mjs
```

기대:
```
PASS — 생성 배정 / 상태 / 꺼진 뒤에도 오는 배정, 자기 행동은 제외
PASS — body에 상태 코드가 그대로
```

두 번째 `assigned`가 `notify_status = false`인 상태에서도 도착했다는 것이 **요구사항 6**(배정은 항상)의 근거다. 멘션 쪽 근거는 Task 2 Step 5에 있다.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/api/mobion/tasks/[id]/route.ts" "src/app/api/mobion/projects/[id]/tasks/route.ts"
git commit -m "feat: 상태 변경 알림과 태스크 생성 시 배정 알림

상태 변경은 mobion_task_activity에 기록만 되고 알림으로는 가지 않았다.
담당자에게 kind='status'로 보내되 notify_status로 끌 수 있게 했다.

함께 고친 것: assigned 알림이 PATCH에만 있어서, 태스크를 만들면서
담당자를 지정하면 그 사람은 아무 통지도 받지 못했다."
```

---

## Task 4: 조회 API

**요구사항 1(조회), 2(이동에 필요한 `commentId` 전달)**

**Files:**
- Modify: `src/app/api/mobion/notifications/route.ts` (GET의 타입·SELECT·응답)
- Modify: `src/lib/use-home-data.ts` (`Notification` 타입)
- Create: `src/app/api/mobion/inbox/route.ts`

**Interfaces:**
- Produces: `GET /api/mobion/inbox?kind=<종류>&cursor=<ISO8601>` → `{ notifications: InboxNotification[], nextCursor: string | null }`
  - `InboxNotification = { id, kind, body, createdAt, readAt, actorName, taskId, taskTitle, projectId, commentId }`
- Produces: `GET /api/mobion/notifications`의 각 항목에 `commentId` 추가 (`kind`는 이미 있다)

- [ ] **Step 1: 홈용 조회에 `comment_id`를 더한다**

`src/app/api/mobion/notifications/route.ts`의 `NotificationRow` 타입에 추가:

```typescript
  comment_id: string | null;
```

GET의 SELECT에서 `n.id, n.kind, n.body, n.created_at,` 다음에 `n.comment_id,`를 넣는다. 응답 매핑에도 추가:

```typescript
        commentId: r.comment_id,
```

- [ ] **Step 2: `Notification` 타입을 공용 종류로 교체**

`src/lib/use-home-data.ts`의 `Notification`을 교체하고 import를 더한다:

```typescript
import type { NotificationKind } from "./mobion-notifications";
```
```typescript
export type Notification = {
  id: string;
  kind: NotificationKind;
  body: string;
  createdAt: string;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  commentId: string | null;
  read: boolean;
};
```

- [ ] **Step 3: inbox 라우트 작성**

`src/app/api/mobion/inbox/route.ts` 생성:

```typescript
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { mobionApiError } from "@/lib/mobion-api";
import { query } from "@/lib/mobion-db";
import { isNotificationKind } from "@/lib/mobion-notifications";

/** 한 번에 가져오는 개수. 더 필요하면 cursor로 이어 받는다. */
const PAGE_SIZE = 30;

type InboxRow = {
  id: string;
  kind: string;
  body: string;
  created_at: string;
  read_at: string | null;
  actor_name: string | null;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  comment_id: string | null;
};

/**
 * 인박스 전용 조회.
 *
 * GET /api/mobion/notifications와 나눠 둔 이유는 부수효과다. 그쪽은 조회이면서
 * 동시에 출근·재실·마감임박을 쓰는 요청이고, 45초마다 어느 모드에서든 돈다.
 * 인박스가 같은 것을 부르면 그 쓰기가 두 배로 일어난다. 여기서는 읽기만 한다.
 *
 * 홈과 달리 20건·3일 제한이 없다. 지난주에 누가 나를 불렀는지 찾는 것이
 * 이 화면의 존재 이유다.
 */
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const kindParam = url.searchParams.get("kind");
    // 모르는 값은 조용히 무시하고 전체를 준다. 필터는 화면 편의이지 권한
    // 경계가 아니므로, 오타 하나로 에러를 낼 이유가 없다.
    const kind = kindParam && isNotificationKind(kindParam) ? kindParam : null;
    const cursor = url.searchParams.get("cursor");

    const result = await query<InboxRow>(
      `SELECT n.id, n.kind, n.body, n.created_at, n.read_at,
              a.name AS actor_name,
              n.task_id, t.title AS task_title, t.project_id,
              n.comment_id
       FROM mobion_notifications n
       LEFT JOIN mobion_users a ON a.id = n.actor_id
       LEFT JOIN mobion_tasks t ON t.id = n.task_id
       WHERE n.user_id = $1
         AND ($2::text IS NULL OR n.kind = $2)
         -- 커서는 시각이다. created_at DESC로 읽으므로 "이 시각보다 이전"이
         -- 다음 장이 된다.
         AND ($3::timestamptz IS NULL OR n.created_at < $3)
       ORDER BY n.created_at DESC
       LIMIT $4`,
      [user.id, kind, cursor, PAGE_SIZE + 1],
    );

    // 한 건 더 받아 다음 장이 있는지 본다. 있으면 그 한 건은 돌려주지 않는다.
    const hasMore = result.rows.length > PAGE_SIZE;
    const rows = hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows;

    return NextResponse.json({
      notifications: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        body: r.body,
        createdAt: r.created_at,
        readAt: r.read_at,
        actorName: r.actor_name,
        taskId: r.task_id,
        taskTitle: r.task_title,
        projectId: r.project_id,
        commentId: r.comment_id,
      })),
      nextCursor: hasMore ? rows[rows.length - 1].created_at : null,
    });
  } catch (error) {
    return mobionApiError(error, "알림을 불러오지 못했습니다.");
  }
}
```

- [ ] **Step 4: 검증 스크립트 작성**

`scripts/verify-task4.mjs` (커밋하지 않는다):

```javascript
import pg from "pg";

const DB = "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom";
const BASE = "http://localhost:3000";

const res = await fetch(`${BASE}/api/mobion/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "testb@mobion.local", password: "test1234" }),
});
const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const c = new pg.Client({ connectionString: DB });
await c.connect();
const B = (await c.query(`SELECT id FROM mobion_users WHERE email = 'testb@mobion.local'`)).rows[0];

// 페이지네이션을 보려면 PAGE_SIZE(30)보다 많아야 한다
await c.query(`DELETE FROM mobion_notifications WHERE user_id = $1`, [B.id]);
await c.query(
  `INSERT INTO mobion_notifications (user_id, kind, body, created_at)
   SELECT $1,
          (ARRAY['mention','assigned','comment','status'])[1 + (i % 4)],
          '검증 ' || i,
          now() - (i || ' minutes')::interval
   FROM generate_series(1, 35) AS i`,
  [B.id],
);

const get = (qs) =>
  fetch(`${BASE}/api/mobion/inbox${qs}`, { headers: { Cookie: cookie } }).then((r) => r.json());

const page1 = await get("");
console.log(
  page1.notifications.length === 30 && page1.nextCursor
    ? "PASS — 첫 장 30건 + 다음 커서"
    : `FAIL — ${page1.notifications.length}건, cursor=${page1.nextCursor}`,
);

const page2 = await get(`?cursor=${encodeURIComponent(page1.nextCursor)}`);
console.log(
  page2.notifications.length === 5 && page2.nextCursor === null
    ? "PASS — 둘째 장 5건, 끝"
    : `FAIL — ${page2.notifications.length}건, cursor=${page2.nextCursor}`,
);

const ids1 = new Set(page1.notifications.map((n) => n.id));
console.log(
  page2.notifications.every((n) => !ids1.has(n.id))
    ? "PASS — 두 장이 겹치지 않음"
    : "FAIL — 장 사이에 중복",
);

const mentions = await get("?kind=mention");
console.log(
  mentions.notifications.length > 0 && mentions.notifications.every((n) => n.kind === "mention")
    ? "PASS — 종류 필터"
    : "FAIL — 필터가 걸리지 않음",
);

const bogus = await get("?kind=nonsense");
console.log(
  bogus.notifications.length === 30 ? "PASS — 모르는 필터는 전체" : "FAIL — 모르는 필터 처리",
);

console.log(
  "commentId 필드 존재:",
  "commentId" in page1.notifications[0] ? "PASS" : "FAIL",
);

await c.query(`DELETE FROM mobion_notifications WHERE body LIKE '검증 %'`);
await c.end();
```

- [ ] **Step 5: 검증 실행**

```bash
node scripts/verify-task4.mjs
```

기대: PASS 6줄

- [ ] **Step 6: 홈이 여전히 동작하는지 확인**

```bash
npx tsc --noEmit
```

기대: 에러 없음. 그다음 브라우저에서 `http://localhost:3000/mobion` 홈을 열어 알림 섹션이 그대로 뜨고 콘솔에 에러가 없는지 본다.

> 이 시점에 홈은 새 종류를 아직 "답글"로 표시한다. 타입 문제는 아니며 Task 7에서 고친다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/mobion/inbox/route.ts src/app/api/mobion/notifications/route.ts src/lib/use-home-data.ts
git commit -m "feat: 인박스 조회 API

홈용 조회와 나눠 둔다. 홈 쪽은 조회이면서 동시에 출근·재실·마감임박을
쓰는 요청이고 45초마다 모든 모드에서 돌기 때문에, 인박스가 같은 것을
부르면 그 쓰기가 두 배가 된다. 인박스 조회는 읽기만 한다.

홈과 달리 20건·3일 제한이 없고 커서 페이지네이션과 종류 필터가 있다."
```

---

## Task 5: 수신 설정 저장과 UI

**요구사항 5(수신 여부 설정), 6(멘션·배정은 항상 — 화면에서 설명)**

**Files:**
- Modify: `src/app/api/mobion/profile/route.ts` (PATCH)
- Modify: `src/app/profile/page.tsx` (초기값 조회)
- Modify: `src/components/ProfileContent.tsx` (토글 UI)

**Interfaces:**
- Consumes: Task 1의 `notify_comment`, `notify_status` 컬럼
- Produces: `PATCH /api/mobion/profile`가 `{ notifyComment?: boolean, notifyStatus?: boolean }`를 받는다
- Produces: `ProfileContent`가 `initialNotifyComment: boolean`, `initialNotifyStatus: boolean` props를 받는다

- [ ] **Step 1: PATCH에 수신 설정을 더한다**

`src/app/api/mobion/profile/route.ts`, `avatarBase64` 파싱 아래에:

```typescript
    // undefined는 "건드리지 않음", boolean은 "이 값으로". 이름·아바타와 같은
    // 규칙이라 한 요청이 프로필과 설정을 함께 저장할 수 있다.
    const notifyComment =
      typeof body.notifyComment === "boolean" ? body.notifyComment : null;
    const notifyStatus =
      typeof body.notifyStatus === "boolean" ? body.notifyStatus : null;
```

UPDATE 문을 교체:

```typescript
    const result = await query<{
      id: string;
      name: string;
      email: string;
      avatar_url: string | null;
      notify_comment: boolean;
      notify_status: boolean;
    }>(
      `UPDATE mobion_users
       SET name = COALESCE($2, name),
           password_hash = COALESCE($3, password_hash),
           avatar_url = COALESCE($4, avatar_url),
           notify_comment = COALESCE($5, notify_comment),
           notify_status = COALESCE($6, notify_status)
       WHERE id = $1
       RETURNING id, name, email, avatar_url, notify_comment, notify_status`,
      [user.id, name, passwordHash, avatarUrl, notifyComment, notifyStatus],
    );
```

응답도 교체:

```typescript
    const updated = result.rows[0];
    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        avatarUrl: updated.avatar_url,
        notifyComment: updated.notify_comment,
        notifyStatus: updated.notify_status,
      },
    });
```

- [ ] **Step 2: 서버 페이지가 초기값을 넘기게 한다**

`src/app/profile/page.tsx`를 교체:

```typescript
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";
import ProfileContent from "@/components/ProfileContent";
import styles from "../page.module.css";

export const metadata = {
  title: "프로필 — MOBICOM",
  description: "Mobi:ON 프로필 설정",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // getCurrentUser는 세션 확인용이라 인증에 필요한 것만 읽는다. 설정은 이
  // 화면에서만 쓰이므로 여기서 따로 가져온다.
  const prefs = await query<{ notify_comment: boolean; notify_status: boolean }>(
    `SELECT notify_comment, notify_status FROM mobion_users WHERE id = $1`,
    [user.id],
  );
  const row = prefs.rows[0];

  return (
    <main className={styles.appPage}>
      <div className={styles.appAmbient} aria-hidden />
      <ProfileContent
        initialName={user.name}
        initialNotifyComment={row?.notify_comment ?? true}
        initialNotifyStatus={row?.notify_status ?? true}
      />
    </main>
  );
}
```

- [ ] **Step 3: 토글 UI를 추가**

`src/components/ProfileContent.tsx`. props와 상태:

```typescript
export default function ProfileContent({
  initialName,
  initialNotifyComment,
  initialNotifyStatus,
}: {
  initialName: string;
  initialNotifyComment: boolean;
  initialNotifyStatus: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [notifyComment, setNotifyComment] = useState(initialNotifyComment);
  const [notifyStatus, setNotifyStatus] = useState(initialNotifyStatus);
```

컴포넌트 안에 저장 함수 추가:

```typescript
  /**
   * 토글은 누른 즉시 반영하고, 실패하면 되돌린다.
   *
   * 조용히 실패하면 껐다고 믿은 알림이 계속 온다 — 설정 화면에서 그보다
   * 나쁜 실패는 없다.
   */
  async function saveNotifyPref(patch: { notifyComment?: boolean; notifyStatus?: boolean }) {
    const before = { notifyComment, notifyStatus };
    if (patch.notifyComment !== undefined) setNotifyComment(patch.notifyComment);
    if (patch.notifyStatus !== undefined) setNotifyStatus(patch.notifyStatus);
    setError(null);
    try {
      const res = await fetch("/api/mobion/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotifyComment(before.notifyComment);
      setNotifyStatus(before.notifyStatus);
      setError("알림 설정을 저장하지 못했습니다.");
    }
  }
```

`<ThemeSetting />` 바로 아래에 렌더:

```tsx
      <NotifySection>
        <NotifyHeading>알림 받기</NotifyHeading>
        <NotifyRow>
          <input
            type="checkbox"
            id="notify-comment"
            checked={notifyComment}
            onChange={(e) => saveNotifyPref({ notifyComment: e.target.checked })}
          />
          <NotifyLabel htmlFor="notify-comment">
            댓글
            <NotifyHint>내 태스크에 새 댓글이 달릴 때</NotifyHint>
          </NotifyLabel>
        </NotifyRow>
        <NotifyRow>
          <input
            type="checkbox"
            id="notify-status"
            checked={notifyStatus}
            onChange={(e) => saveNotifyPref({ notifyStatus: e.target.checked })}
          />
          <NotifyLabel htmlFor="notify-status">
            상태 변경
            <NotifyHint>내 태스크의 상태가 바뀔 때</NotifyHint>
          </NotifyLabel>
        </NotifyRow>
        {/* 끌 수 없는 항목을 비활성 토글로 늘어놓는 것보다, 없는 이유를 한
            줄로 말하는 편이 낫다 */}
        <NotifyNote>멘션과 담당자 지정은 항상 받습니다.</NotifyNote>
      </NotifySection>
```

styled 정의는 파일 아래 기존 것들 옆에 둔다:

```typescript
const NotifySection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 28px;
`;

const NotifyHeading = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
`;

const NotifyRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`;

const NotifyLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  cursor: pointer;
`;

const NotifyHint = styled.span`
  font-size: 12px;
  opacity: 0.65;
`;

const NotifyNote = styled.p`
  margin: 4px 0 0;
  font-size: 12px;
  opacity: 0.65;
`;
```

> 색과 간격은 같은 파일의 다른 섹션이 쓰는 CSS 변수를 따른다. 위 값은 출발점이며, 주변과 어긋나면 맞춘다.

- [ ] **Step 4: 타입 확인**

```bash
npx tsc --noEmit
```

기대: 에러 없음

- [ ] **Step 5: 검증 스크립트 작성**

`scripts/verify-task5.mjs` (커밋하지 않는다):

```javascript
import pg from "pg";

const DB = "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom";
const BASE = "http://localhost:3000";

const res = await fetch(`${BASE}/api/mobion/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "testb@mobion.local", password: "test1234" }),
});
const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const J = { "Content-Type": "application/json", Cookie: cookie };

const c = new pg.Client({ connectionString: DB });
await c.connect();
const read = async () =>
  (await c.query(
    `SELECT name, notify_comment, notify_status FROM mobion_users
     WHERE email = 'testb@mobion.local'`,
  )).rows[0];

const patch = (payload) =>
  fetch(`${BASE}/api/mobion/profile`, { method: "PATCH", headers: J, body: JSON.stringify(payload) });

await patch({ notifyComment: false });
let row = await read();
console.log(
  row.notify_comment === false && row.notify_status === true
    ? "PASS — 댓글만 꺼짐, 상태는 그대로"
    : `FAIL — ${JSON.stringify(row)}`,
);

// 이름만 보내도 설정이 날아가지 않아야 한다 (COALESCE 확인)
await patch({ name: "테스터B" });
row = await read();
console.log(
  row.notify_comment === false ? "PASS — 이름만 바꿔도 설정 유지" : "FAIL — 설정이 초기화됨",
);

await patch({ notifyComment: true });
console.log((await read()).notify_comment === true ? "PASS — 다시 켜짐" : "FAIL — 되돌리기 실패");

await c.end();
```

```bash
node scripts/verify-task5.mjs
```

기대: PASS 3줄

- [ ] **Step 6: 화면에서 확인**

`http://localhost:3000/profile` 접속. "알림 받기" 섹션이 화면 테마 아래에 보이고, 체크박스를 끈 뒤 새로고침해도 꺼진 채로 남아야 한다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/mobion/profile/route.ts src/app/profile/page.tsx src/components/ProfileContent.tsx
git commit -m "feat: 알림 수신 설정 UI

프로필의 화면 테마 아래에 댓글·상태 변경 토글을 둔다. 멘션과 담당자
지정은 끌 수 없으므로 비활성 토글 대신 한 줄 안내로 설명한다.

저장 실패 시 토글을 되돌린다. 조용히 실패하면 껐다고 믿은 알림이 계속
오는데, 설정 화면에서 그보다 나쁜 실패는 없다."
```

- [ ] **Step 8: 요구사항 5 확인 지점**

이 시점에 다음이 성립한다.
- 프로필에서 댓글·상태 변경 알림을 끌 수 있고, 끄면 실제로 오지 않는다(Task 2 Step 5, Task 3 Step 4의 PASS가 근거) → **요구사항 5**
- 꺼도 멘션과 배정은 온다 → **요구사항 6**

---

## Task 6: inbox 화면

**요구사항 1(조회), 2(선택 시 이동), 3(읽음), 4(모두 읽음)**

**Files:**
- Create: `src/lib/use-inbox-data.ts`
- Create: `src/components/InboxView.tsx`
- Modify: `src/components/MobiOnContent.tsx` (`WorkspaceMode`, 훅 호출, 레일 버튼, 렌더 분기)

**Interfaces:**
- Consumes: `GET /api/mobion/inbox` (Task 4), `POST /api/mobion/notifications` (기존), `notificationLabel`·`statusChangeText` (Task 1)
- Produces: `useInboxData(enabled: boolean)` → `InboxData`
- Produces: `InboxView`가 `data: InboxData`와 `onOpen: (projectId: string, taskId: string, commentId: string | null) => void`를 받는다

- [ ] **Step 1: 훅 작성**

`src/lib/use-inbox-data.ts` 생성:

```typescript
"use client";

import { useEffect, useState } from "react";
import type { NotificationKind } from "./mobion-notifications";

export type InboxNotification = {
  id: string;
  kind: NotificationKind;
  body: string;
  createdAt: string;
  readAt: string | null;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  commentId: string | null;
};

/** null은 전체. 화면의 탭 순서와 같다. */
export type InboxFilter = null | NotificationKind;

export function useInboxData(enabled: boolean) {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [filter, setFilter] = useState<InboxFilter>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function buildUrl(cursor: string | null) {
    const params = new URLSearchParams();
    if (filter) params.set("kind", filter);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return `/api/mobion/inbox${qs ? `?${qs}` : ""}`;
  }

  function load() {
    setLoading(true);
    fetch(buildUrl(null))
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setNotifications(data.notifications ?? []);
        setNextCursor(data.nextCursor ?? null);
        setLoadError(null);
      })
      .catch(() => setLoadError("알림을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }

  // 화면을 열 때와 필터를 바꿀 때만 부른다. 홈의 알림 폴링이 이미 45초마다
  // 돌고 있으므로 여기서 또 타이머를 걸 이유가 없다.
  useEffect(() => {
    if (!enabled) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filter]);

  function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetch(buildUrl(nextCursor))
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setNotifications((prev) => [...prev, ...(data.notifications ?? [])]);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => setLoadError("더 불러오지 못했습니다."))
      .finally(() => setLoadingMore(false));
  }

  /**
   * 홈과 같은 낙관적 처리. 요청이 오가는 동안 행이 안 읽음으로 남아 있으면
   * 두 번 누르게 된다. 실패는 알리지 않는다 — 최악이 다음 조회에서 다시
   * 보이는 것이고, 그쪽이 안전한 방향이다.
   */
  async function markRead(id: string) {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: now } : n)),
    );
    await fetch("/api/mobion/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    await fetch("/api/mobion/notifications", { method: "POST" }).catch(() => {});
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return {
    notifications,
    filter,
    setFilter,
    loading,
    loadingMore,
    loadError,
    hasMore: nextCursor !== null,
    loadMore,
    markRead,
    markAllRead,
    unreadCount,
    isEmpty: !loading && notifications.length === 0,
    reload: load,
  };
}

export type InboxData = ReturnType<typeof useInboxData>;
```

- [ ] **Step 2: 화면 작성**

`src/components/InboxView.tsx` 생성:

```tsx
"use client";

import styled from "@emotion/styled";
import { notificationLabel, statusChangeText } from "@/lib/mobion-notifications";
import type { InboxData, InboxFilter, InboxNotification } from "@/lib/use-inbox-data";

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: null, label: "전체" },
  { value: "mention", label: "멘션" },
  { value: "assigned", label: "배정" },
  { value: "comment", label: "댓글" },
  { value: "status", label: "상태" },
];

/** "3시간 전". 하루가 넘으면 다른 단위를 쓴다 — "37시간 전"은 아무도 읽지 않는다. */
function relativeTime(iso: string): string {
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

/**
 * 알림 한 줄에 본문으로 무엇을 쓸지.
 *
 * 배정은 본문이 태스크 제목의 사본이라 위 줄과 똑같은 말이 된다. 상태는
 * 코드가 저장돼 있으므로 여기서 한국어로 옮긴다.
 */
function bodyText(n: InboxNotification): string | null {
  if (n.kind === "assigned") return null;
  if (n.kind === "status") return statusChangeText(n.body);
  return n.body;
}

export default function InboxView({
  data,
  onOpen,
}: {
  data: InboxData;
  onOpen: (projectId: string, taskId: string, commentId: string | null) => void;
}) {
  function open(n: InboxNotification) {
    data.markRead(n.id);
    if (n.projectId && n.taskId) onOpen(n.projectId, n.taskId, n.commentId);
  }

  return (
    <Wrap>
      <Header>
        <Title>inbox</Title>
        {data.unreadCount > 0 && (
          <MarkAll type="button" onClick={data.markAllRead}>
            모두 읽음
          </MarkAll>
        )}
      </Header>

      <Tabs role="tablist">
        {FILTERS.map((f) => (
          <Tab
            key={f.label}
            type="button"
            role="tab"
            aria-selected={data.filter === f.value}
            data-active={data.filter === f.value || undefined}
            onClick={() => data.setFilter(f.value)}
          >
            {f.label}
          </Tab>
        ))}
      </Tabs>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {data.isEmpty && !data.loadError && (
        <Empty>
          <EmptyTitle>알림이 없습니다</EmptyTitle>
          <EmptyHint>
            누군가 나를 멘션하거나, 태스크를 맡기거나, 상태를 바꾸면 여기에 쌓입니다
          </EmptyHint>
        </Empty>
      )}

      {data.notifications.map((n) => {
        const text = bodyText(n);
        return (
          <Row
            key={n.id}
            role="button"
            tabIndex={0}
            data-read={n.readAt ? true : undefined}
            onClick={() => open(n)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(n);
              }
            }}
          >
            <Top>
              {/* 안 읽음은 카드 배경으로 드러난다(아래 Row 참고). 색만으로는
                  화면 낭독기에 아무것도 전달되지 않으므로 숨은 텍스트를 둔다 */}
              {!n.readAt && <SrOnly>읽지 않음</SrOnly>}
              <Kind data-kind={n.kind}>{notificationLabel(n.kind)}</Kind>
              {/* 마감은 사람이 한 일이 아니다 — "알 수 없는 사용자"라고 쓰면
                  버그처럼 읽힌다 */}
              {n.kind !== "due_soon" && <Actor>{n.actorName ?? "알 수 없는 사용자"}</Actor>}
              {n.taskTitle && <TaskTitle>{n.taskTitle}</TaskTitle>}
              <Time>{relativeTime(n.createdAt)}</Time>
            </Top>
            {text && <Body>{text}</Body>}
          </Row>
        );
      })}

      {data.hasMore && (
        <More type="button" onClick={data.loadMore} disabled={data.loadingMore}>
          {data.loadingMore ? "불러오는 중…" : "더 보기"}
        </More>
      )}
    </Wrap>
  );
}
```

같은 파일 아래에 styled 정의를 둔다. **홈의 알림 카드에서 그대로 가져온 것들이다** — 같은 알림을 두 화면이 다르게 그리면 안 된다.

```typescript
const Wrap = styled.section`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 20px 24px;
  overflow-y: auto;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0 8px;
`;

const Title = styled.h2`
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
`;

const MarkAll = styled.button`
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 11px;
  cursor: pointer;

  &:hover {
    color: var(--accent);
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
`;

const Tab = styled.button`
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }

  &[data-active] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 700;
  }
`;

const ErrorText = styled.p`
  color: var(--danger);
  font-size: 12px;
`;

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  max-width: 460px;
  text-align: center;
`;

const EmptyTitle = styled.span`
  color: var(--text);
  font-size: 14px;
`;

const EmptyHint = styled.span`
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.6;
`;

/**
 * 홈의 NotificationRow와 같은 규칙이다. 안 읽음은 채워진 카드로 읽히고,
 * 읽은 것은 투명해지며 흐려진다 — 홈에서 "옆줄 표시가 레일·섹션 제목과
 * 경쟁한다"는 이유로 그렇게 정했고, 여기서 다르게 갈 이유가 없다.
 */
const Row = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  padding: 9px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  cursor: pointer;

  &:hover {
    border-color: var(--border-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  &[data-read] {
    background: transparent;
    border-color: var(--border);
    opacity: 0.55;
  }
`;

const Top = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
`;

/** 색으로만 전하는 정보를 낭독기에도 전한다. */
const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Kind = styled.span`
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;

  &[data-kind="assigned"] {
    background: var(--milestone-soft);
    color: var(--milestone);
  }

  &[data-kind="due_soon"] {
    background: var(--warn-soft);
    color: var(--warn);
  }

  /* 상태 변경은 완료를 향하는 움직임이라 성공 계열을 쓴다. 멘션은 기본
     accent를 그대로 둔다 — 이 화면에서 가장 자주 보게 될 종류다. */
  &[data-kind="status"] {
    background: var(--ok-soft);
    color: var(--ok);
  }
`;

const Actor = styled.span`
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
`;

const TaskTitle = styled.span`
  color: var(--text-faint);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Time = styled.span`
  margin-left: auto;
  color: var(--text-faint);
  font-size: 11px;
  flex-shrink: 0;
`;

const Body = styled.p`
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const More = styled.button`
  align-self: center;
  margin: 8px 0 24px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-size: 12px;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;
```

> `Wrap`의 바깥 여백은 다른 뷰(`ContestsView`, `LabView`)가 쓰는 값과 맞춘다. 위 값은 출발점이며, 레일 옆에 붙였을 때 다른 화면과 어긋나면 그쪽을 따른다.

- [ ] **Step 3: 레일과 모드 연결**

`src/components/MobiOnContent.tsx`. 타입:

```typescript
type WorkspaceMode =
  | "home"
  | "inbox"
  | "chat"
  | "projects"
  | "schedule"
  | "contests"
  | "overview"
  | "lab";
```

import와 훅 호출(다른 `useXData` 옆):

```typescript
import InboxView from "./InboxView";
import { useInboxData } from "@/lib/use-inbox-data";
```
```typescript
  const inboxData = useInboxData(mode === "inbox");
```

레일 버튼을 홈 버튼 바로 뒤에:

```tsx
          <RailButton
            type="button"
            data-active={mode === "inbox" || undefined}
            onClick={() => setMode("inbox")}
            aria-label={
              homeData.unreadCount > 0
                ? `inbox (읽지 않은 알림 ${homeData.unreadCount}건)`
                : "inbox"
            }
            title="inbox"
          >
            <span className="material-symbols-outlined">inbox</span>
            {/* 홈 버튼과 같은 출처를 쓴다. 알림 폴링이 모든 모드에서 돌기
                때문에 여기서 따로 셀 필요가 없다. */}
            {homeData.unreadCount > 0 && <RailDot />}
          </RailButton>
```

렌더 분기를 `{mode === "home" && ...}` 블록 아래에. **세 번째 인자는 Task 7에서 추가하므로, 지금은 두 인자만 넘긴다:**

```tsx
        {mode === "inbox" && (
          <InboxView
            data={inboxData}
            onOpen={(projectId, taskId) => {
              tasksData.openTaskInProject(projectId, taskId);
              setMode("projects");
            }}
          />
        )}
```

- [ ] **Step 4: 타입 확인**

```bash
npx tsc --noEmit
```

기대: 에러 없음. `onOpen`의 세 번째 인자를 받지 않는 것은 TypeScript에서 정상이다(인자를 덜 받는 함수는 대입 가능).

- [ ] **Step 5: 화면 확인**

`http://localhost:3000/mobion` → 레일에 inbox 아이콘이 홈 아래 보인다. 눌러서:
- 탭 5개가 보이고, 누르면 목록이 걸러진다
- 알림이 없으면 빈 화면 문구가 나온다
- 행을 클릭하면 프로젝트 화면으로 넘어가며 태스크가 열린다
- "모두 읽음"을 누르면 안 읽음 점이 사라진다

- [ ] **Step 6: 페이지네이션 확인**

Task 4 Step 4의 스크립트로 35건을 다시 넣고 inbox를 연다.

```bash
node scripts/verify-task4.mjs
```

기대: 화면에 "더 보기"가 보이고, 누르면 5건이 붙고 버튼이 사라진다.

- [ ] **Step 7: 읽음이 서버에 남는지 확인**

행 하나를 클릭한 뒤:

```bash
node -e "import('pg').then(async({default:pg})=>{const c=new pg.Client({connectionString:'postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom'});await c.connect();const r=await c.query(\"SELECT count(*) FILTER (WHERE read_at IS NOT NULL) AS read, count(*) AS total FROM mobion_notifications\");console.log(r.rows[0]);await c.end();})"
```

기대: `read`가 0보다 크다. 새로고침해도 그 행은 읽음 상태로 남는다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/use-inbox-data.ts src/components/InboxView.tsx src/components/MobiOnContent.tsx
git commit -m "feat: inbox 화면

레일에 홈 다음 자리로 넣는다. 종류별 탭과 커서 페이지네이션이 있어 홈의
20건·3일 제한 너머로 거슬러 올라갈 수 있다 — 그것이 이 화면을 따로 두는
이유다.

읽음 처리는 기존 POST /notifications를 그대로 쓴다. 안 읽음 점도 홈이
이미 돌리는 폴링 결과를 재사용해, 같은 것을 두 번 세지 않는다."
```

- [ ] **Step 9: 요구사항 1·3·4 확인 지점**

- 멘션·배정·댓글·상태 알림이 목록에 뜨고 탭으로 걸러진다 → **요구사항 1**
- 행을 클릭하면 읽음이 되고 서버에도 남는다 → **요구사항 3**
- "모두 읽음"이 동작한다 → **요구사항 4**

---

## Task 7: 댓글로 이동, 그리고 홈 라벨 정리

**요구사항 2(관련 댓글로 이동)**

**Files:**
- Modify: `src/lib/use-tasks-data.ts` (`openTaskInProject`, 반환 객체)
- Modify: `src/components/ProjectDetailView.tsx` (앵커와 스크롤)
- Modify: `src/components/MobiOnContent.tsx` (세 번째 인자 되살리기)
- Modify: `src/components/HomeView.tsx` (라벨 공용 함수)

**Interfaces:**
- Consumes: `notificationLabel`·`statusChangeText` (Task 1), `InboxView`의 `onOpen` 세 번째 인자 (Task 6)
- Produces: `openTaskInProject(projectId: string, taskId: string, focusComment?: string | null)`, `TasksData.focusCommentId: string | null`, `TasksData.clearFocusComment(): void`

- [ ] **Step 1: 포커스할 댓글을 상태로 들고 간다**

`src/lib/use-tasks-data.ts`, 다른 `useState` 옆에:

```typescript
  // 인박스에서 넘어올 때만 채워진다. 태스크가 열리고 댓글이 그려진 뒤에야
  // 스크롤할 수 있으므로, 화면이 소비하고 지우는 방식으로 넘긴다.
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
```

`openTaskInProject`를 교체:

```typescript
  function openTaskInProject(projectId: string, taskId: string, focusComment?: string | null) {
    setFocusCommentId(focusComment ?? null);
    if (projectId === selectedProjectId) {
      setSelectedTaskId(taskId);
      return;
    }
    pendingTaskRef.current = taskId;
    setSelectedProjectId(projectId);
  }
```

반환 객체의 `openTaskInProject` 옆에 추가:

```typescript
    focusCommentId,
    clearFocusComment: () => setFocusCommentId(null),
```

- [ ] **Step 2: 댓글에 앵커를 단다**

`src/components/ProjectDetailView.tsx`의 `<Comment key={`c-${entry.id}`}>`에 id를 더한다:

```tsx
              <Comment key={`c-${entry.id}`} id={`comment-${entry.comment.id}`}>
```

- [ ] **Step 3: 스크롤과 강조**

같은 파일 컴포넌트 안, 다른 `useEffect` 옆:

```typescript
  /**
   * 인박스에서 넘어온 댓글로 데려간다.
   *
   * 댓글 목록이 그려진 뒤라야 하므로 data.comments를 의존성에 둔다. 한 번
   * 쓰고 지우는 이유는, 지우지 않으면 같은 태스크를 다시 열 때마다 그
   * 댓글로 끌려가기 때문이다.
   */
  useEffect(() => {
    const id = data.focusCommentId;
    if (!id) return;
    const el = document.getElementById(`comment-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("data-highlight", "true");
    const timer = setTimeout(() => el.removeAttribute("data-highlight"), 2000);
    data.clearFocusComment();
    return () => clearTimeout(timer);
  }, [data.focusCommentId, data.comments]);
```

`Comment` styled에 강조 규칙을 더한다:

```typescript
  &[data-highlight="true"] {
    animation: comment-flash 2s ease-out;
  }

  @keyframes comment-flash {
    from {
      background: var(--accent-soft);
    }
    to {
      background: transparent;
    }
  }
```

`--accent-soft`는 `globals.css`에 이미 있고 라이트·다크 양쪽에 정의되어 있다(`#dcecfb` / `rgba(110, 200, 247, 0.15)`). 홈의 안 읽은 알림 카드가 쓰는 것과 같은 색이라, "방금 도착한 것"이라는 뜻이 두 화면에서 일치한다.

- [ ] **Step 4: MobiOnContent에서 세 번째 인자를 되살린다**

Task 6 Step 3에서 두 인자로 줄여둔 것을 원래대로:

```tsx
            onOpen={(projectId, taskId, commentId) => {
              tasksData.openTaskInProject(projectId, taskId, commentId);
              setMode("projects");
            }}
```

- [ ] **Step 5: 홈의 라벨을 공용 함수로 교체**

`src/components/HomeView.tsx`. import 추가:

```typescript
import { notificationLabel, statusChangeText } from "@/lib/mobion-notifications";
```

삼항식을 교체:

```tsx
                <NotifKind data-kind={n.kind}>{notificationLabel(n.kind)}</NotifKind>
```

본문 조건도 상태 알림을 반영한다. `{n.kind !== "assigned" && <NotifBody>{n.body}</NotifBody>}`를 교체:

```tsx
              {/* 배정은 본문이 제목의 사본이라 위 줄과 같은 말이 되고,
                  상태는 코드가 저장돼 있어 그대로 쓰면 "done"이 찍힌다 */}
              {n.kind !== "assigned" && (
                <NotifBody>
                  {n.kind === "status" ? statusChangeText(n.body) : n.body}
                </NotifBody>
              )}
```

- [ ] **Step 6: 이동 확인 — 요구사항 2 확인 지점**

```bash
npx tsc --noEmit
```

브라우저에서:
1. testa로 로그인 → 태스크에 댓글을 대여섯 개 단다. 그중 중간쯤에서 `@테스터B`를 멘션한다.
2. testb로 로그인(다른 브라우저나 시크릿 창) → inbox
3. 멘션 알림을 클릭

기대: 프로젝트 화면으로 넘어가고, 태스크가 열리고, **멘션이 있던 그 댓글로 스크롤되며 잠깐 배경이 밝아진다.** 같은 태스크를 닫았다 다시 열면 끌려가지 않는다.

→ **요구사항 2**

- [ ] **Step 7: 홈 뱃지 확인**

홈으로 가서 알림 섹션을 본다. 멘션은 "멘션", 상태는 "상태"로 찍히고, 상태 알림 본문이 "done"이 아니라 "완료(으)로 변경"으로 보여야 한다. 이전에는 둘 다 "답글"이었다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/use-tasks-data.ts src/components/ProjectDetailView.tsx src/components/MobiOnContent.tsx src/components/HomeView.tsx
git commit -m "feat: 알림에서 해당 댓글로 이동

댓글 알림이 태스크만 열어주어, 댓글이 서른 개 달린 태스크에서는 누가
무슨 말을 했는지 직접 찾아야 했다. comment_id를 따라가 그 댓글로
스크롤하고 잠깐 강조한다. 포커스는 한 번 쓰고 지운다 — 남겨두면 같은
태스크를 열 때마다 끌려간다.

홈의 라벨 삼항식도 공용 함수로 바꿨다. 그대로 두면 새로 생긴 멘션과
상태 알림이 전부 '답글'로 찍힌다."
```

---

## Task 8: 요구사항 6개 전체 검증과 정리

**Files:**
- Delete: `scripts/verify-task*.mjs`, `scripts/check-schema.mjs`, `scripts/verify-all.mjs`

- [ ] **Step 1: 여섯 개를 한 번에 훑는 스크립트**

`scripts/verify-all.mjs` (커밋하지 않는다):

```javascript
import pg from "pg";

const DB = "postgresql://postgres:mobion_local_dev@127.0.0.1:5433/mobicom";
const BASE = "http://localhost:3000";

async function login(email) {
  const res = await fetch(`${BASE}/api/mobion/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test1234" }),
  });
  if (!res.ok) throw new Error(`로그인 실패: ${email}`);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

const c = new pg.Client({ connectionString: DB });
await c.connect();
const users = await c.query(`SELECT id, name, email FROM mobion_users ORDER BY email`);
const A = users.rows.find((u) => u.email === "testa@mobion.local");
const B = users.rows.find((u) => u.email === "testb@mobion.local");
const ja = { "Content-Type": "application/json", Cookie: await login(A.email) };
const jb = { "Content-Type": "application/json", Cookie: await login(B.email) };

await c.query(`DELETE FROM mobion_notifications`);
await c.query(`UPDATE mobion_users SET notify_comment = true, notify_status = true`);

const proj = await fetch(`${BASE}/api/mobion/projects`, {
  method: "POST", headers: ja,
  body: JSON.stringify({ name: "전체 검증", description: "" }),
}).then((r) => r.json());

// 요구사항 1·6 — 생성 시 배정
const task = await fetch(`${BASE}/api/mobion/projects/${proj.project.id}/tasks`, {
  method: "POST", headers: ja,
  body: JSON.stringify({ title: "전체 검증 태스크", assigneeId: B.id }),
}).then((r) => r.json());

const comment = (text) =>
  fetch(`${BASE}/api/mobion/tasks/${task.task.id}/comments`, {
    method: "POST", headers: ja, body: JSON.stringify({ body: text }),
  });
const patch = (payload) =>
  fetch(`${BASE}/api/mobion/tasks/${task.task.id}`, {
    method: "PATCH", headers: ja, body: JSON.stringify(payload),
  });

await comment(`@[${B.id}:${B.name}] 봐 주세요`);   // 요구사항 1·2 — mention
await comment("멘션 없는 댓글");                    // 요구사항 1 — comment
await patch({ status: "in_progress" });            // 요구사항 1 — status

// 요구사항 5 — 둘 다 끄기
await fetch(`${BASE}/api/mobion/profile`, {
  method: "PATCH", headers: jb,
  body: JSON.stringify({ notifyComment: false, notifyStatus: false }),
});
await comment("꺼진 뒤 댓글");                      // 오지 않아야 함
await patch({ status: "done" });                   // 오지 않아야 함

// 요구사항 6 — 꺼도 멘션은 온다
await comment(`@[${B.id}:${B.name}] 꺼져 있어도`);

const inbox = await fetch(`${BASE}/api/mobion/inbox`, { headers: { Cookie: jb.Cookie } })
  .then((r) => r.json());
const kinds = inbox.notifications.map((n) => n.kind);

const check = (label, ok) => console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);

check("요구사항 1: 배정·멘션·댓글·상태가 모두 조회됨",
  ["assigned", "mention", "comment", "status"].every((k) => kinds.includes(k)));
check("요구사항 2: 멘션 알림이 댓글을 가리킴",
  inbox.notifications.filter((n) => n.kind === "mention").every((n) => n.commentId));
check("요구사항 5: 끈 뒤의 댓글·상태 알림이 오지 않음", kinds.length === 5);
check("요구사항 6: 꺼도 멘션은 도착", kinds.filter((k) => k === "mention").length === 2);

// 요구사항 3 — 하나만 읽음
await fetch(`${BASE}/api/mobion/notifications`, {
  method: "POST", headers: jb, body: JSON.stringify({ id: inbox.notifications[0].id }),
});
const one = await c.query(
  `SELECT count(*) AS n FROM mobion_notifications WHERE user_id = $1 AND read_at IS NOT NULL`,
  [B.id]);
check("요구사항 3: 선택한 알림만 읽음", Number(one.rows[0].n) === 1);

// 요구사항 4 — 모두 읽음
await fetch(`${BASE}/api/mobion/notifications`, { method: "POST", headers: jb });
const rest = await c.query(
  `SELECT count(*) AS n FROM mobion_notifications WHERE user_id = $1 AND read_at IS NULL`,
  [B.id]);
check("요구사항 4: 모두 읽음", Number(rest.rows[0].n) === 0);

await c.query(`UPDATE mobion_users SET notify_comment = true, notify_status = true`);
await c.end();
```

- [ ] **Step 2: 실행**

```bash
node scripts/verify-all.mjs
```

기대: **PASS 6줄.** 하나라도 FAIL이면 추적표에서 해당 Task를 찾아 돌아간다.

- [ ] **Step 3: 브라우저에서 눈으로**

두 창(testa / testb 시크릿)으로 확인한다.

| 확인 | 요구사항 |
|---|---|
| inbox에 네 종류가 뜨고 탭으로 걸러진다 | 1 |
| 멘션 알림 클릭 → 그 댓글로 스크롤 + 강조 | 2 |
| 클릭한 알림의 점이 사라지고, 새로고침해도 유지 | 3 |
| "모두 읽음" 후 레일 점이 사라진다 | 4 |
| 프로필에서 끄면 그 종류가 더 오지 않는다 | 5 |
| 꺼도 멘션·배정은 온다 | 6 |

- [ ] **Step 4: 타입과 빌드**

```bash
npx tsc --noEmit
npm run build
```

기대: 둘 다 성공. `npm run build`는 배포와 같은 경로라 dev에서 안 보이던 것이 여기서 걸린다.

- [ ] **Step 5: 검증 스크립트 삭제**

```bash
rm -f scripts/verify-task2.mjs scripts/verify-task3.mjs scripts/verify-task4.mjs \
      scripts/verify-task5.mjs scripts/verify-all.mjs scripts/check-schema.mjs
git status --short
```

기대: 추적되지 않은 파일이 남지 않는다. self-check는 `mobion-notifications.ts` 안에 있으므로 남는다 — 그것이 이 저장소의 방식이다.

- [ ] **Step 6: 변경 범위 확인**

```bash
git log --oneline main..HEAD
git diff main --stat
```

스펙의 "변경 파일" 표와 대조한다. 예상 밖의 파일이 바뀌었으면 왜인지 설명할 수 있어야 한다.

---

## 배포 시 주의

이 계획은 로컬까지만 다룬다. 랩 서버에 올릴 때는 `DEPLOY.md`를 따르되, 이번 변경에는 다음이 더해진다.

- **스키마 v24는 `ADD COLUMN`과 제약 교체만 한다.** 컬럼 삭제가 없어 v20 배포 때와 달리 되돌릴 수 없는 변경은 아니다. 그래도 `DEPLOY.md` 1번의 백업은 건너뛰지 않는다.
- **환경변수 추가 없음.** `.env.example`은 그대로다.
- 마이그레이션은 첫 DB 조회에서 돈다. `DEPLOY.md` 8번대로 `/mobion`에 요청을 한 번 보내야 실행된다.
- 확인 쿼리:
  ```bash
  psql "$DATABASE_URL" -c "\d mobion_notifications"   # comment_id 있음
  psql "$DATABASE_URL" -c "\d mobion_users"           # notify_comment, notify_status 있음
  psql "$DATABASE_URL" -c "SELECT kind, count(*) FROM mobion_notifications GROUP BY kind"
  ```
  기존 `comment` 행은 그대로 남아 있는 것이 정상이다 — 과거 알림이 멘션이었는지는 소급 판정할 수 없다.
