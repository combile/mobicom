"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dueState, todayISO } from "./use-tasks-data";
import type { NotificationKind } from "./mobion-notifications";

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
  kind: NotificationKind;
  body: string;
  createdAt: string;
  readAt: string | null;
  actorName: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  commentId: string | null;
  /** 채팅 멘션 알림이 가리키는 대화. 태스크에서 온 알림은 null이다. */
  channelId: string | null;
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

export type AttendanceDay = {
  date: string;
  firstSeenAt: string;
  /** The person's own correction; null means the observed time stands. */
  checkedInAt: string | null;
  note: string | null;
  /** Null while still connected; set once the heartbeat goes stale. */
  leftAt: string | null;
  accumulatedSeconds: number;
  currentlyAway: boolean;
};

export function useHomeData(enabled: boolean) {
  const [userName, setUserName] = useState("");
  const [myTasks, setMyTasks] = useState<HomeTask[]>([]);
  const [contests, setContests] = useState<HomeContest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);

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

  // The record is written by the notifications poll (same interval, below);
  // this only reads it back so the person can see — and correct — what was
  // written about them. Polled rather than fetched once: today's row keeps
  // changing underneath it (last_seen_at every heartbeat, an away toggle
  // any time), and a card showing "근무 중" for someone who left an hour ago
  // is worse than the one-request cost of keeping it current.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    function load() {
      fetch("/api/mobion/attendance")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (!cancelled) setAttendance(data.days ?? []);
        })
        .catch(() => {
          if (!cancelled) setAttendance([]);
        });
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
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
   *
   * 새 알림은 기다리지 않는다: 알림 전용 스트림(notifications/stream)이 행이
   * 생기는 순간 신호를 주고, 그때 바로 다시 읽는다. 주기 조회는 그 스트림이
   * 끊긴 동안의 안전망이자 출근·재실 심장박동으로 남는다.
   */
  const reloadNotifications = useRef<() => void>(() => {});
  useEffect(() => {
    let cancelled = false;

    function load() {
      fetch("/api/mobion/notifications")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (cancelled) return;
          setNotifications(
            (data.notifications ?? []).map((n: Notification) => ({
              ...n,
              read: n.readAt != null,
            })),
          );
          setUnreadCount(data.unreadCount ?? 0);
        })
        // notifications failing should not take the rest of home down with it
        .catch(() => {});
    }

    load();
    reloadNotifications.current = load;
    const timer = setInterval(load, POLL_MS);
    // coming back to the tab should not wait out the rest of the interval
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);

    // 한꺼번에 여러 건(태스크 여러 개 배정 등)이 와도 한 번만 읽는다.
    // EventSource는 끊기면 알아서 다시 붙고, 다시 붙은 직후에도 읽어 그 사이
    // 놓친 것을 채운다.
    let pending: ReturnType<typeof setTimeout> | undefined;
    function loadSoon() {
      clearTimeout(pending);
      pending = setTimeout(load, 200);
    }
    const events = new EventSource("/api/mobion/notifications/stream");
    events.addEventListener("notification", loadSoon);
    events.addEventListener("open", loadSoon);

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearTimeout(pending);
      events.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /** 다음 주기를 기다리지 않고 지금 다시 읽는다. 참조가 바뀌지 않는다. */
  const refreshNotifications = useCallback(() => reloadNotifications.current(), []);

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
  const todayAttendance = attendance.find((d) => d.date === today) ?? null;

  /**
   * Correct the recorded arrival time for a day.
   *
   * Applied locally on success only: unlike a checkbox, this is a value the
   * server derives (the corrected timestamp is built from the row's own date),
   * so echoing a guess would risk showing something the record does not say.
   */
  async function correctAttendance(date: string, time: string | null, note: string | null) {
    try {
      const res = await fetch("/api/mobion/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? "출근 기록을 고치지 못했습니다.");
        return false;
      }
      setAttendance((prev) => prev.map((d) => (d.date === date ? body.day : d)));
      setLoadError(null);
      return true;
    } catch {
      setLoadError("출근 기록을 고치지 못했습니다.");
      return false;
    }
  }

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
    attendance,
    todayAttendance,
    correctAttendance,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    refreshNotifications,
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
