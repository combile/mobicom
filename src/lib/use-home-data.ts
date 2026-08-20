"use client";

import { useEffect, useState } from "react";
import { dueState, todayISO } from "./use-tasks-data";

export type HomeTask = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
};


export type Notification = {
  id: string;
  kind: "comment" | "assigned" | "due_soon";
  body: string;
  createdAt: string;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  read: boolean;
};

export type HomeContest = {
  id: string;
  title: string;
  deadline: string;
  url: string;
};

/**
 * Slow enough to be free, quick enough that a notification does not feel lost.
 * The deadline sweep rides along on the same request (see the notifications
 * route), so this is also how often reminders get a chance to appear.
 */
const POLL_MS = 45_000;

export function useHomeData(enabled: boolean) {
  const [userName, setUserName] = useState("");
  const [myTasks, setMyTasks] = useState<HomeTask[]>([]);
  const [contests, setContests] = useState<HomeContest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/mobion/home")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setUserName(data.userName ?? "");
        setMyTasks(data.myTasks ?? []);
        setContests(data.contests ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("홈 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));

  }, [enabled]);

  /**
   * Notifications are fetched whether or not the home view is open, and on a
   * timer.
   *
   * They were loaded once, when home mounted, so leaving the workspace open —
   * which is the normal way to use it — meant never being told anything again.
   * Polling rather than riding the chat stream: that stream closes itself when
   * Huly is unreachable, and coupling the two would put notifications back
   * behind chat's availability, which is the failure this app already had once.
   */
  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/mobion/notifications")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (cancelled) return;
          setNotifications(
            (data.notifications ?? []).map((n: Notification & { readAt?: string | null }) => ({
              ...n,
              read: false,
            })),
          );
          setUnreadCount(data.unreadCount ?? 0);
        })
        // notifications failing should not take the rest of home down with it
        .catch(() => {});
    }

    load();
    const timer = setInterval(load, POLL_MS);
    // coming back to the tab should not wait out the rest of the interval
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /**
   * Marks read locally as soon as it is acted on, so the row does not linger
   * while the request is in flight. A failure is not surfaced: the worst case
   * is seeing it again on the next load, which is the safer direction.
   */
  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch("/api/mobion/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await fetch("/api/mobion/notifications", { method: "POST" }).catch(() => {});
  }

  const today = todayISO();

  /**
   * Three buckets in the order they demand attention: already late, due today,
   * and the rest. Undated work lands in the last one rather than being hidden
   * — it is still assigned, just not scheduled.
   */
  const overdue = myTasks.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = myTasks.filter((t) => t.dueDate === today);
  const rest = myTasks.filter((t) => !t.dueDate || t.dueDate > today);

  const soonCount = myTasks.filter((t) => dueState(t.dueDate, t.status) === "soon").length;

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    userName,
    myTasks,
    overdue,
    dueToday,
    rest,
    soonCount,
    contests,
    loadError,
    loading,
    isClear: myTasks.length === 0 && notifications.length === 0,
  };
}

export type HomeData = ReturnType<typeof useHomeData>;
