"use client";

import { useEffect, useRef, useState } from "react";
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
  // load()/loadMore()마다 하나씩 늘어난다. 응답이 돌아왔을 때 자기가 받은
  // 번호가 더 이상 최신이 아니면 버린다 — 그러지 않으면 필터 B로 넘어간
  // 사이에 필터 A의 loadMore 응답이 늦게 도착해 B의 목록 뒤에 A의 행을
  // 붙이고 nextCursor까지 A 것으로 덮어써 버린다.
  const requestId = useRef(0);

  function buildUrl(cursor: string | null) {
    const params = new URLSearchParams();
    if (filter) params.set("kind", filter);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return `/api/mobion/inbox${qs ? `?${qs}` : ""}`;
  }

  function load() {
    const id = ++requestId.current;
    // 이 요청이 목록 전체를 새로 그린다 — 그 사이 살아 있던 loadMore가 있어도
    // 그 응답은 이제 위 id 체크로 버려지고, 다시는 finally가 불리지 않아
    // "불러오는 중" 상태만 계속 떠 있게 된다. 여기서 직접 꺼 둔다.
    setLoadingMore(false);
    setLoading(true);
    fetch(buildUrl(null))
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        if (id !== requestId.current) return;
        setNotifications(data.notifications ?? []);
        setNextCursor(data.nextCursor ?? null);
        setLoadError(null);
      })
      .catch(() => {
        if (id === requestId.current) setLoadError("알림을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
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
    const id = ++requestId.current;
    setLoadingMore(true);
    fetch(buildUrl(nextCursor))
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        if (id !== requestId.current) return;
        setNotifications((prev) => [...prev, ...(data.notifications ?? [])]);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => {
        if (id === requestId.current) setLoadError("더 불러오지 못했습니다.");
      })
      .finally(() => {
        if (id === requestId.current) setLoadingMore(false);
      });
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
