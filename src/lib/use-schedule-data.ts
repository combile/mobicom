"use client";

import { useCallback, useEffect, useState } from "react";
import { dueState, todayISO } from "./use-tasks-data";

export type ScheduleItem = {
  kind: "task" | "milestone" | "contest";
  id: string;
  title: string;
  date: string;
  status: string;
  /** Null for contests, which belong to no project. */
  projectId: string | null;
  projectName: string;
  assigneeName: string | null;
  /** Set for contests only — where the posting can be read. */
  url: string | null;
};

export type ScheduleProject = { id: string; name: string };

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

  const reload = useCallback(() => {
    setLoading(true);
    return fetch("/api/mobion/schedule")
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
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
  }, [enabled, reload]);

  // A new item needs a project to live in, and the schedule spans all of them,
  // so the list is fetched here rather than borrowed from the projects view —
  // which may never have been opened.
  const [projects, setProjects] = useState<ScheduleProject[]>([]);
  useEffect(() => {
    if (!enabled) return;
    fetch("/api/mobion/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: ScheduleProject[] }) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]));
  }, [enabled]);

  /**
   * Move an item to another day.
   *
   * Applied locally first: a card that snaps back to where it was for the
   * length of a round trip reads as a failed drag, not a pending one. A real
   * failure puts it back and says why.
   *
   * Contests are not ours to move — they are crawled postings whose deadline
   * belongs to the organiser — so the caller does not offer the affordance and
   * this refuses one that arrives anyway.
   */
  async function reschedule(item: ScheduleItem, date: string) {
    if (item.kind === "contest" || item.date === date) return;
    const previous = items;
    setItems((list) =>
      list.map((i) => (i.kind === item.kind && i.id === item.id ? { ...i, date } : i)),
    );
    try {
      const res = await fetch(
        item.kind === "task"
          ? `/api/mobion/tasks/${item.id}`
          : `/api/mobion/milestones/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.kind === "task" ? { dueDate: date } : { targetDate: date }),
        },
      );
      if (!res.ok) throw new Error("failed");
      setLoadError(null);
    } catch {
      setItems(previous);
      setLoadError("날짜를 옮기지 못했습니다.");
    }
  }

  // Creating from the schedule: the date is known (a day was clicked), the
  // project is not, so that is the one field with no sensible default.
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<"task" | "milestone">("task");
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function openCreate(date: string) {
    setCreateDate(date);
    setNewKind("task");
    setNewTitle("");
    // one project is not a choice; more than one has no right answer
    setNewProjectId(projects.length === 1 ? projects[0].id : "");
    setCreateError(null);
  }

  async function handleCreate() {
    if (!createDate) return;
    const title = newTitle.trim();
    if (!title) {
      setCreateError("제목을 입력해 주세요.");
      return;
    }
    if (!newProjectId) {
      setCreateError("프로젝트를 선택해 주세요.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(
        newKind === "task"
          ? `/api/mobion/projects/${newProjectId}/tasks`
          : `/api/mobion/projects/${newProjectId}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            newKind === "task"
              ? { title, dueDate: createDate }
              : { title, targetDate: createDate },
          ),
        },
      );
      const body = await res.json();
      if (!res.ok) {
        setCreateError(body.error ?? "만들지 못했습니다.");
        return;
      }
      setCreateDate(null);
      await reload();
    } catch {
      setCreateError("만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

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
    projects,
    reload,
    reschedule,
    createDate,
    openCreate,
    setCreateDate,
    closeCreate: () => setCreateDate(null),
    newKind,
    setNewKind,
    newTitle,
    setNewTitle,
    newProjectId,
    setNewProjectId,
    creating,
    createError,
    handleCreate,
    loadError,
    loading,
    showDone,
    setShowDone,
    overdueCount,
    isEmpty: items.length === 0,
  };
}

export type ScheduleData = ReturnType<typeof useScheduleData>;
