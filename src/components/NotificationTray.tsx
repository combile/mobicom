"use client";

import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { notificationLabel, relativeTime } from "@/lib/mobion-notifications";
import type { HomeData } from "@/lib/use-home-data";

/**
 * 한눈에 보는 최근 알림.
 *
 * 인박스가 기록이라면 이쪽은 곁눈질이다. 채팅하다가, 프로젝트를 보다가
 * 보던 화면을 떠나지 않고 확인하는 것이 전부이므로 필터도 페이지네이션도
 * 두지 않는다. 더 볼 것이 있으면 인박스가 있다.
 *
 * 데이터는 홈이 이미 45초마다 받아오는 것을 그대로 쓴다 — 알림 폴링은
 * 모드와 무관하게 돌기 때문에(use-home-data.ts) 여기서 또 받아올 이유가 없다.
 */
const VISIBLE = 6;

export default function NotificationTray({
  data,
  onClose,
  onOpenTask,
  onOpenInbox,
}: {
  data: HomeData;
  onClose: () => void;
  onOpenTask: (projectId: string, taskId: string, commentId?: string | null) => void;
  onOpenInbox: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 ESC로 닫는다. 열려 있는 동안만 듣는다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      // 레일 버튼 자신은 제외한다 — 그 버튼의 onClick이 토글이라, 여기서도
      // 닫아버리면 열자마자 닫혀 눌러도 반응이 없는 것처럼 보인다.
      const el = e.target as HTMLElement;
      if (ref.current?.contains(el) || el.closest("[data-tray-toggle]")) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const recent = data.notifications.slice(0, VISIBLE);

  return (
    <Panel ref={ref} role="dialog" aria-label="알림함">
      <Header>
        <Title>알림</Title>
        {data.unreadCount > 0 && <Count>{data.unreadCount}</Count>}
        {data.unreadCount > 0 && (
          <MarkAll type="button" onClick={data.markAllRead}>
            모두 읽음
          </MarkAll>
        )}
      </Header>

      {recent.length === 0 && <Empty>새 알림이 없습니다</Empty>}

      {recent.map((n) => (
        <Row
          key={n.id}
          type="button"
          data-read={n.read || undefined}
          onClick={() => {
            if (!n.read) data.markRead(n.id);
            if (n.projectId && n.taskId) onOpenTask(n.projectId, n.taskId, n.commentId);
            onClose();
          }}
        >
          <Top>
            {/* 색만으로는 낭독기에 아무것도 전달되지 않는다 */}
            {!n.read && <SrOnly>읽지 않음</SrOnly>}
            <Kind data-kind={n.kind}>{notificationLabel(n.kind)}</Kind>
            {/* 마감은 사람이 한 일이 아니라 달력이 말하는 것이다 */}
            {n.kind !== "due_soon" && <Actor>{n.actorName ?? "알 수 없는 사용자"}</Actor>}
            <Time>{relativeTime(n.createdAt)}</Time>
          </Top>
          {n.taskTitle && <TaskTitle>{n.taskTitle}</TaskTitle>}
        </Row>
      ))}

      <Footer
        type="button"
        onClick={() => {
          onOpenInbox();
          onClose();
        }}
      >
        전체 보기
      </Footer>
    </Panel>
  );
}

const Panel = styled.div`
  position: absolute;
  /* 레일 폭(56px) 바깥으로 8px 띄운다. 딱 붙이면 레일에서 자라난 것처럼
     보여 어디까지가 레일이고 어디부터가 말풍선인지 흐려진다. */
  left: 64px;
  bottom: 12px;
  z-index: 40;
  width: 300px;
  /* 감싸는 Layout이 overflow: hidden이라, 창이 낮으면 말풍선 위쪽이 잘려
     나간다. 레일 높이 안에서 접어두고 넘치면 안에서 스크롤한다. */
  max-height: calc(100% - 24px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  /* 아래만 0인 이유는 Footer 주석 참고 — 그 여백은 푸터가 직접 갖는다 */
  padding: 10px 10px 0;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 8px;
`;

const Title = styled.h2`
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
`;

const Count = styled.span`
  padding: 0 7px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-solid);
  font-size: 11px;
  font-weight: 700;
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

const Empty = styled.p`
  padding: 18px 4px;
  text-align: center;
  color: var(--text-faint);
  font-size: 12px;
`;

/**
 * 인박스·홈과 같은 규칙: 안 읽음은 채워진 카드, 읽은 것은 투명하고 흐리다.
 * 같은 알림이 세 화면에서 다르게 보이면 안 된다.
 */
const Row = styled.button`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  width: 100%;
  padding: 7px 9px;
  margin-bottom: 4px;
  border-radius: 8px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  text-align: left;
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

const Top = styled.span`
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
`;

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
  padding: 1px 6px;
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

const Time = styled.span`
  margin-left: auto;
  color: var(--text-faint);
  font-size: 11px;
  flex-shrink: 0;
`;

const TaskTitle = styled.span`
  color: var(--text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/**
 * 구분선 아래 공간의 한가운데에 글자를 둔다.
 *
 * 말풍선의 아래 여백을 0으로 두고(위 Panel 참고) 이 버튼이 위아래 패딩을
 * 직접 갖는다. 그러지 않으면 글자 위는 패딩뿐인데 아래는 패딩 + 말풍선
 * 여백이 되어, 아래가 넓은 만큼 글자가 위로 떠 보인다.
 *
 * 음수 마진으로 말풍선 가장자리까지 밀어내는 방법도 있지만, 말풍선에
 * overflow-y가 걸려 있어 가로로 잘리거나 스크롤이 생긴다.
 */
const Footer = styled.button`
  margin-top: 2px;
  padding: 10px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text-faint);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: var(--accent);
  }
`;
