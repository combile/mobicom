"use client";

import { useCallback, useEffect, useState } from "react";

export type OverviewRole = "member" | "lead" | "professor";

export type OverviewMember = {
  id: string;
  name: string;
  email: string;
  role: OverviewRole;
  /** Days with a record in the last seven. */
  daysPresent: number;
  lastSeenAt: string | null;
  /** Null when they have not been seen today. */
  todayInAt: string | null;
  done: number;
  inProgress: number;
  overdue: number;
};

export type OverviewActivity = {
  actorId: string | null;
  taskId: string | null;
  taskTitle: string | null;
  projectId: string | null;
  projectName: string | null;
  createdAt: string;
};

export const ROLE_LABELS: Record<OverviewRole, string> = {
  member: "연구원",
  lead: "랩장",
  professor: "교수님",
};

/**
 * The lab overview, for the two roles allowed to see it.
 *
 * `enabled` gates the fetch the way the other views do, so opening the
 * workspace does not pull everyone's attendance for a screen nobody opened.
 */
export function useOverviewData(enabled: boolean) {
  const [members, setMembers] = useState<OverviewMember[]>([]);
  const [activity, setActivity] = useState<OverviewActivity[]>([]);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetch("/api/mobion/overview")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setMembers(data.members ?? []);
        setActivity(data.activity ?? []);
        setCanManageRoles(Boolean(data.canManageRoles));
        setLoadError(null);
      })
      .catch(() => setLoadError("연구실 현황을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
  }, [enabled, load]);

  /**
   * Applied locally first. A select that snaps back to the old role for the
   * length of a round trip reads as a rejection rather than as a wait.
   */
  async function setRole(userId: string, role: OverviewRole) {
    const previous = members;
    setMembers((list) => list.map((m) => (m.id === userId ? { ...m, role } : m)));
    try {
      const res = await fetch("/api/mobion/overview", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMembers(previous);
        setLoadError(body.error ?? "역할을 바꾸지 못했습니다.");
        return;
      }
      setLoadError(null);
    } catch {
      setMembers(previous);
      setLoadError("역할을 바꾸지 못했습니다.");
    }
  }

  return {
    members,
    activity,
    canManageRoles,
    loading,
    loadError,
    setRole,
    reload: load,
    isEmpty: members.length === 0,
  };
}

export type OverviewData = ReturnType<typeof useOverviewData>;
