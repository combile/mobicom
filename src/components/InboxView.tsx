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
