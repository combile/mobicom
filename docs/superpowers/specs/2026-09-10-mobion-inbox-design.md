# Mobi:ON Inbox — Design

## Context

알림은 이미 있다. 홈 화면 상단에 섹션이 있고(`HomeView.tsx`), 45초마다 폴링되며(`use-home-data.ts`), 개별 읽음과 모두 읽음이 동작하고, 클릭하면 해당 태스크가 열린다. 레일에는 안 읽음 점까지 찍힌다.

없는 것은 세 가지다.

1. **상태 변경 알림이 없다.** `recordActivity`가 `field: "status"` 변경을 정확히 감지해 `mobion_task_activity`에 남기지만, 그 사실이 인박스로는 가지 않는다.
2. **멘션과 댓글이 구분되지 않는다.** 둘 다 `kind='comment'`로 저장되어, "나를 언급했다"와 "내 태스크에 댓글이 달렸다"를 가려낼 수 없다.
3. **수신 여부를 고를 수 없다.** 전부 받거나 전부 무시하거나뿐이다.

여기에 더해, 홈의 조회 규칙(최대 20건, 읽은 것은 3일치)은 "지금 뭘 해야 하나"에는 맞지만 "지난주에 누가 날 멘션했더라"에는 답하지 못한다.

이 스펙은 그 간극을 메우는 전용 화면 `inbox`와, 그것이 요구하는 데이터·API·설정을 다룬다. `2026-08-05-mobion-slack-mentions-design.md`가 out of scope로 미뤄둔 "mentions inbox view"의 후속이다.

## Scope

**In scope**

- 담당자 지정 / 멘션 / 댓글 / 상태 변경 알림 조회
- 알림 선택 시 관련 태스크로 이동하고, 댓글에서 비롯된 알림이면 그 댓글 위치까지 이동
- 선택한 알림을 읽음으로 변경
- 현재 사용자의 모든 알림을 읽음으로 처리
- 댓글·상태 변경 알림의 수신 여부 설정
- 멘션·담당자 지정 알림은 설정과 무관하게 항상 수신
- 레일에 `inbox` 항목 추가

**Out of scope**

- 채팅(Huly) 멘션 알림. 현재 `chat/messages/route.ts`에는 멘션·알림 코드가 없고, 이를 추가하면 검증이 Huly 가용성에 묶인다. 별도 스펙으로 다룬다.
- 이메일·푸시 등 앱 밖으로 나가는 알림. OS 알림은 `2026-09-09-desktop-app-design.md`가 다루는 별개의 층이다.
- 알림 묶음(같은 태스크의 연속된 알림을 하나로 합치기)
- 홈 알림 섹션의 재배치. 그대로 둔다.

## 용어

이 앱에는 이슈도 문서도 없다. Huly의 Tracker 플러그인을 쓰지 않기로 한 결정(`2026-08-05-mobion-tasks-milestones-design.md`의 Architecture Decision)에 따라 자체 테이블만 있다. 요구사항의 "이슈"는 `mobion_tasks`, "댓글"은 `mobion_task_comments`를 가리킨다. "문서"에 해당하는 것은 없다.

## Architecture Decision: 수신 설정은 저장 시점에 적용한다

설정을 거는 자리는 두 곳이 가능하다. 알림을 넣기 전(저장 시점)이거나, 꺼내 보여줄 때(조회 시점)다. 저장 시점을 택한다.

조회 경로가 이 앱의 심장박동이기 때문이다. `GET /api/mobion/notifications`는 45초마다, 어느 모드에 있든 호출되며(`use-home-data.ts`의 폴링 `useEffect`는 의존성 배열이 비어 있어 `enabled`와 무관하게 돈다), 그 요청이 출근 기록·재실 갱신·마감임박 알림 생성을 겸한다. 여기에 설정 조인을 얹으면 가장 자주 도는 쿼리가 가장 복잡해진다. 반대로 알림 생성은 사람이 댓글을 쓰거나 상태를 바꿀 때만 일어나므로 훨씬 드물다.

의미도 저장 시점이 맞다. "수신 여부"는 받을지 말지에 대한 설정이다. 껐던 기간의 알림이 설정을 켜는 순간 과거로부터 쏟아지는 것은 이 말과 어긋난다.

대가는 되돌릴 수 없다는 점이다. 껐던 동안의 알림은 남지 않는다. 이 기능에서는 그것이 올바른 동작이라고 본다.

## Data Model (schema v24)

```sql
-- kind 확장. 기존 제약을 갈아끼우는 방식은 mobion-db.ts가 이미 쓰는 패턴이다.
ALTER TABLE mobion_notifications DROP CONSTRAINT IF EXISTS mobion_notifications_kind_check;
ALTER TABLE mobion_notifications ADD CONSTRAINT mobion_notifications_kind_check
  CHECK (kind IN ('comment','assigned','due_soon','mention','status'));

-- 댓글 위치로 이동하기 위한 앵커
ALTER TABLE mobion_notifications
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES mobion_task_comments(id) ON DELETE SET NULL;

-- 수신 설정
ALTER TABLE mobion_users
  ADD COLUMN IF NOT EXISTS notify_comment BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_status  BOOLEAN NOT NULL DEFAULT true;
```

**`comment_id`는 `SET NULL`이다.** 댓글이 지워져도 알림 자체는 남고, 이동만 태스크 수준으로 물러난다. 이 코드베이스가 `mobion_task_comments.user_id`에 `SET NULL`을 쓴 이유("논의는 사람이 떠나도 남는 기록")와 같은 판단이다.

**기존 `comment` 행은 마이그레이션하지 않는다.** 과거 알림이 멘션이었는지는 소급 판정할 수 없다. 구분은 새로 쌓이는 것부터 적용된다.

**기본값은 `true`다.** 기존 사용자는 지금과 동일하게 받다가, 원할 때 끈다.

## 알림 생성 규칙

수신 설정은 `INSERT ... SELECT`의 `WHERE`로 표현한다. 설정을 따로 조회하는 왕복이 없고, 규칙이 문장 하나에 드러난다.

```sql
-- 끌 수 있는 알림
INSERT INTO mobion_notifications (user_id, kind, task_id, comment_id, actor_id, body)
SELECT $1, 'comment', $2, $3, $4, $5
FROM mobion_users WHERE id = $1 AND notify_comment;
```

`WHERE`가 거짓이면 0행이 삽입된다. 끌 수 없는 알림(멘션·배정)은 지금과 같은 평범한 `INSERT`다.

| 사건 | 파일 | kind | 끌 수 있나 |
|---|---|---|---|
| 댓글에서 멘션됨 | `tasks/[id]/comments` POST | `mention` | 아니오 |
| 내 태스크에 댓글 | 〃 | `comment` | `notify_comment` |
| 담당자로 지정됨 (생성 시) | `projects/[id]/tasks` POST — **신규** | `assigned` | 아니오 |
| 담당자가 변경됨 | `tasks/[id]` PATCH | `assigned` | 아니오 |
| 상태가 바뀜 | 〃 | `status` | `notify_status` |
| 마감 임박 | `notifications` GET | `due_soon` | 아니오 (기존 유지) |

기존 규칙은 유지된다. 자기 행동은 자기에게 알리지 않고, 한 댓글이 멘션과 담당자 양쪽에 해당하면 한 번만 가며, 같은 사람을 두 번 멘션해도 한 번이다.

**태스크 생성 시 배정 알림은 지금 없는 동작이다.** `assigned` 삽입이 PATCH에만 있어, 처음 담당자로 지정된 사람은 알림을 받지 못한다. 이번에 함께 고친다.

**`status` 알림의 `body`에는 상태 코드(`done`)를 저장한다.** 한글 라벨을 넣지 않는다. `recordActivity`가 같은 판단을 내리고 이유를 적어두었다 — 상태는 닫힌 집합이고, 그 한글 표현은 상태를 고르는 select 옆에 있어야 하며, 문구가 개정되면 과거 기록도 새 표현으로 읽혀야 한다.

## API

| 엔드포인트 | 역할 | 변경 |
|---|---|---|
| `GET /api/mobion/notifications` | 심장박동 + 홈용 요약(20건·3일) | `kind`, `commentId` 필드 추가 반환 |
| `GET /api/mobion/inbox?kind=&cursor=` | inbox 전용 조회. 종류 필터, 커서 페이지네이션 | **신규**. 부수효과 없음 |
| `POST /api/mobion/notifications` | 읽음 / 모두 읽음 | 변경 없음. inbox도 이것을 쓴다 |
| `PATCH /api/mobion/profile` | 수신 설정 저장 | 기존 라우트 확장 |

inbox에 별도 엔드포인트를 두는 이유는 부수효과다. `GET /notifications`는 조회이면서 동시에 출근·재실·마감임박을 쓰는 요청이다. inbox가 같은 것을 호출하면 그 쓰기가 두 배로 일어난다. inbox 조회는 읽기만 한다.

요구사항의 읽음 처리와 모두 읽음은 이미 구현되어 있다. 재사용하고 새로 짜지 않는다.

## 화면

### inbox

`WorkspaceMode`에 `"inbox"`를 추가하고 `InboxView.tsx` + `use-inbox-data.ts`를 만든다. 프로젝트·일정·대회·연구실현황이 모두 쓰는 구조(`useXData(mode === "x")`)를 따른다.

```
┌─────────────────────────────────────────────┐
│ inbox                          [모두 읽음]  │
│ ─────────────────────────────────────────── │
│ [전체] [멘션] [배정] [댓글] [상태]          │
│                                             │
│ ● 멘션   테스터A          알림 테스트 태스크│
│   @테스터B 이거 확인해 주세요      3시간 전 │
│ ─────────────────────────────────────────── │
│ ● 배정   테스터A          로그인 화면 개선  │
│                                    어제     │
│ ─────────────────────────────────────────── │
│   상태   테스터B          알림 테스트 태스크│
│   완료로 변경                      3일 전   │
│                                             │
│              [ 더 보기 ]                    │
└─────────────────────────────────────────────┘
```

- 위 그림의 `●`는 안 읽음을 나타낸 것이지만, 실제로는 **홈과 같이 카드 배경으로** 표시한다. 홈이 옆줄 표시를 쓰지 않기로 한 이유("레일·섹션 제목과 경쟁한다")가 여기에도 그대로 적용된다. 색만으로는 화면 낭독기에 전달되지 않으므로 숨은 텍스트를 함께 둔다.
- 홈과 달리 20건·3일 제한이 없어 과거로 계속 거슬러 올라간다.
- 행을 클릭하면 읽음 처리 후 해당 태스크를 열고, `commentId`가 있으면 그 댓글로 스크롤해 잠시 강조한다.
- 레일 버튼의 안 읽음 점은 기존 `homeData.unreadCount`를 재사용한다. 알림 폴링이 모든 모드에서 돌기 때문에 새로 만들 필요가 없다.

댓글 스크롤은 `ProjectDetailView`의 댓글 행에 `id={comment-<댓글 id>}` 형태의 앵커를 부여하고 태스크 모달이 열린 뒤 `scrollIntoView`를 호출하는 정도로 충분하다.

### 수신 설정

`ProfileContent.tsx`의 `<ThemeSetting />` 아래에 둔다. 설정이 이미 모여 있는 자리다.

```
알림 받기
  [x] 댓글          내 태스크에 새 댓글이 달릴 때
  [x] 상태 변경     내 태스크의 상태가 바뀔 때

  멘션과 담당자 지정은 항상 받습니다.
```

마지막 줄이 요구사항을 화면에서 설명한다. 끌 수 없는 항목을 비활성 토글로 늘어놓는 것보다, 없는 이유를 한 줄로 말하는 편이 낫다.

`ThemeSetting`은 localStorage에 저장하지만 알림 설정은 서버에 저장한다. 기기가 바뀌어도 같아야 하고, 무엇보다 서버가 알림을 넣는 시점에 이 값을 읽어야 하기 때문이다.

### 홈

배치와 동작은 그대로 둔다. 다만 `HomeView.tsx`의 라벨 삼항식은 손대야 한다.

```
n.kind === "assigned" ? "배정" : n.kind === "due_soon" ? "마감" : "답글"
```

새 kind가 들어오면 `mention`과 `status`가 전부 "답글"로 찍힌다. kind → 라벨 매핑을 공용 함수로 분리해 홈과 inbox가 함께 쓴다. 홈에서 바뀌는 것은 뱃지 글자뿐이다.

## Error Handling

기존 규약을 따른다. 모든 라우트는 `requireCurrentUser()`로 시작하고, `mobionApiError`가 catch-all이며, 사용자에게 보이는 문구는 한국어다.

- inbox 조회 실패는 화면 안에서만 처리한다. 알림 폴링이 홈을 무너뜨리지 않도록 되어 있는 것과 같은 이유로, inbox의 실패도 다른 화면에 번지지 않는다.
- 수신 설정 저장 실패는 토글을 원래 상태로 되돌리고 문구를 띄운다. 조용히 실패하면 껐다고 믿은 알림이 계속 온다.
- 알림이 가리키는 태스크가 이미 지워졌으면 행은 남기되 이동을 막는다. `task_id`는 `CASCADE`라 실제로는 알림도 함께 지워지지만, 조회와 클릭 사이의 틈은 남는다.

## 검증

이 저장소에는 테스트 프레임워크가 없다. `mobion-mentions.ts`가 쓰는 방식(`node --experimental-strip-types`로 직접 실행하는 self-check)을 따라, kind → 라벨 매핑 함수에 self-check를 붙인다.

나머지는 로컬 계정 두 개로 시나리오를 돌린다.

```
A가 B 담당으로 태스크 생성         → B에 assigned   (현재 누락된 동작)
A가 댓글에 @B                      → B에 mention
A가 댓글만 작성                    → B에 comment
B가 댓글 알림을 끄고 A가 또 댓글   → 알림 없음
B가 상태 변경                      → A에 status
B가 상태 알림을 끄고 A가 상태 변경 → 알림 없음
멘션은 설정과 무관하게 항상 도착
```

로컬 검증 환경은 포터블 PostgreSQL 17(포트 5433)과 `.env.local`이며, 저장소에는 흔적이 남지 않는다.

## 변경 파일

| 파일 | 내용 |
|---|---|
| `src/lib/mobion-db.ts` | 스키마 v24 |
| `src/app/api/mobion/tasks/[id]/comments/route.ts` | mention/comment 분리, `comment_id`, 설정 반영 |
| `src/app/api/mobion/tasks/[id]/route.ts` | `status` 알림 추가, 설정 반영 |
| `src/app/api/mobion/projects/[id]/tasks/route.ts` | 생성 시 `assigned` 알림 추가 |
| `src/app/api/mobion/inbox/route.ts` | 신규 |
| `src/app/api/mobion/profile/route.ts` | 수신 설정 저장 |
| `src/components/InboxView.tsx` | 신규 |
| `src/lib/use-inbox-data.ts` | 신규 |
| `src/components/MobiOnContent.tsx` | 레일 항목, `WorkspaceMode` |
| `src/components/HomeView.tsx` | 라벨 매핑 공용화 |
| `src/components/ProfileContent.tsx` | 수신 설정 UI |
| `src/components/ProjectDetailView.tsx` | 댓글 앵커 |
