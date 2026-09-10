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
