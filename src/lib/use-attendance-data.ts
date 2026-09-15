"use client";

import { useEffect, useState } from "react";

export type AttendanceMember = {
  id: string;
  name: string;
  role: "member" | "lead" | "professor";
  /** Null when they have not been seen today at all. */
  checkedInAt: string | null;
  /** Null while still connected; set once their heartbeat goes stale. */
  leftAt: string | null;
  accumulatedSeconds: number;
  currentlyAway: boolean;
};

/**
 * Live enough that "박서 방금 자리 비움 켰는데" shows up without a refresh,
 * but this is a status board someone glances at, not a chat stream — the
 * Lab view's 15s is close enough and there is no reason to invent a
 * different number.
 */
const POLL_MS = 15_000;

/**
 * Today's check-in/out for the whole lab, open to any signed-in member. See
 * /api/mobion/attendance/team.
 */
export function useAttendanceData(enabled: boolean) {
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    function load() {
      setLoading(true);
      fetch("/api/mobion/attendance/team")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (cancelled) return;
          setMembers(data.members ?? []);
          setLoadError(null);
        })
        .catch(() => {
          if (!cancelled) setLoadError("출퇴근 현황을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const timer = setInterval(load, POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return {
    members,
    loading,
    loadError,
    isEmpty: members.length === 0,
  };
}

export type AttendanceData = ReturnType<typeof useAttendanceData>;
