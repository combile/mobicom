"use client";

import { useEffect, useState } from "react";
import { dueState, todayISO } from "./use-tasks-data";

export type ScheduleItem = {
  kind: "task" | "milestone";
  id: string;
  title: string;
  date: string;
  status: string;
  projectId: string;
  projectName: string;
  assigneeName: string | null;
};

export type ScheduleBucket = {
  key: string;
  title: string;
  items: ScheduleItem[];
};

const DONE = "done";

/**
 * Deadlines across every project, bucketed by urgency.
 *
 * `enabled` gates the fetch the way useTasksData does — all three modes mount
 * together so the SSE connection survives switching, and the schedule should
 * not fetch until someone opens it.
 */
export function useScheduleData(enabled: boolean) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch("/api/mobion/schedule")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setItems(data.items ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("일정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [enabled]);

  // Finished work is hidden by default: a schedule answers "what is left", and
  // completed items would crowd out the ones that still need doing.
  const visible = showDone ? items : items.filter((i) => i.status !== DONE);
  const today = todayISO();

  /**
   * Buckets are relative rather than calendar months — "이번 주" answers what to
   * do next in a way "9월" does not. Empty buckets are dropped so the view
   * never shows a heading with nothing under it.
   */
  const buckets: ScheduleBucket[] = [
    {
      key: "overdue",
      title: "기한 초과",
      items: visible.filter((i) => i.status !== DONE && i.date < today),
    },
    {
      key: "today",
      title: "오늘",
      items: visible.filter((i) => i.status !== DONE && i.date === today),
    },
    {
      key: "soon",
      title: "이번 주",
      items: visible.filter(
        (i) => i.status !== DONE && i.date > today && dueState(i.date, i.status) === "soon",
      ),
    },
    {
      key: "later",
      title: "이후",
      items: visible.filter(
        (i) => i.status !== DONE && i.date > today && dueState(i.date, i.status) !== "soon",
      ),
    },
    {
      key: "done",
      title: "완료",
      items: visible.filter((i) => i.status === DONE),
    },
  ].filter((b) => b.items.length > 0);

  const overdueCount = items.filter((i) => i.status !== DONE && i.date < today).length;

  return {
    items,
    buckets,
    loadError,
    loading,
    showDone,
    setShowDone,
    overdueCount,
    isEmpty: items.length === 0,
  };
}

export type ScheduleData = ReturnType<typeof useScheduleData>;
