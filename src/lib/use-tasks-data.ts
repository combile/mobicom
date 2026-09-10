"use client";

import { useEffect, useRef, useState } from "react";

export type Project = {
  id: string;
  name: string;
  description: string;
  createdByName: string;
  createdAt: string;
  /** Aggregated by the list endpoint so the sidebar needs no extra requests. */
  taskTotal: number;
  taskDone: number;
  taskOverdue: number;
};

export const MILESTONE_KINDS = [
  { value: "checkpoint", label: "체크포인트" },
  { value: "deliverable", label: "산출물" },
  { value: "approval", label: "승인" },
  { value: "review", label: "검토" },
  { value: "event", label: "회의·행사" },
];

export type Milestone = {
  id: string;
  title: string;
  targetDate: string | null;
  status: string;
  kind: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  startDate: string | null;
  milestoneId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  /** Null when the creator's account is gone, so treat it as optional. */
  createdByName: string | null;
  /** Set when the task was raised from a chat message. */
  sourceChannelId: string | null;
  sourceExcerpt: string | null;
  checklistTotal: number;
  checklistDone: number;
};

export type TaskActivity = {
  id: string;
  /** title | description | status | due_date | start_date | assignee | milestone */
  field: string;
  from: string | null;
  to: string | null;
  createdAt: string;
  /** Null once the account is gone; the entry still stands. */
  actorName: string | null;
};

/**
 * Comments and changes read as one thread.
 *
 * Split into two lists they answer separate questions and neither is enough:
 * "why did this slip" is a comment, "when did it slip" is a change, and the
 * pair only makes sense in the order they happened.
 */
export type TimelineEntry =
  | { kind: "comment"; at: string; id: string; comment: TaskComment }
  | { kind: "activity"; at: string; id: string; activity: TaskActivity };

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  position: number;
};

export const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "할 일" },
  { value: "in_progress", label: "진행중" },
  { value: "done", label: "완료" },
];

export const MILESTONE_STATUS_OPTIONS = [
  { value: "planned", label: "계획" },
  { value: "in_progress", label: "진행중" },
  { value: "done", label: "완료" },
];

const SOON_DAYS = 3;

/** Local calendar date as YYYY-MM-DD, matching what `<input type="date">` stores. */
export function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** `days` from today, same format as todayISO. */
export function shiftISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  /** Null once the author's account is gone; the discussion still stands. */
  authorName: string | null;
};

export type DueState = "overdue" | "soon" | null;

/**
 * Both dates are YYYY-MM-DD, so plain string comparison is already
 * chronological — no Date parsing or timezone handling needed.
 *
 * Finished work is never late, so a done item returns null whatever its date.
 */
export function dueState(dueDate: string | null, status: string): DueState {
  if (!dueDate || status === "done") return null;
  if (dueDate < todayISO()) return "overdue";
  if (dueDate <= shiftISO(SOON_DAYS)) return "soon";
  return null;
}

/**
 * Project/milestone/task state for the workspace's projects mode.
 *
 * `enabled` gates every fetch: chat mode mounts this hook too (both modes live
 * in one component so the SSE connection survives switching), and firing
 * project requests while the user is only chatting wastes a round trip.
 */
export type GroupMode = "none" | "milestone" | "assignee";

export type SortMode = "created" | "due" | "status";

export const SORT_OPTIONS = [
  { value: "created", label: "등록순" },
  { value: "due", label: "마감일순" },
  { value: "status", label: "상태순" },
];

/** Unstarted work first, finished work last. */
const STATUS_ORDER = ["todo", "in_progress", "done"];

export function useTasksData(enabled: boolean, currentUserId: string | null = null) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showCreateMilestone, setShowCreateMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneTargetDate, setNewMilestoneTargetDate] = useState("");
  const [newMilestoneKind, setNewMilestoneKind] = useState("checkpoint");
  const [createMilestoneError, setCreateMilestoneError] = useState<string | null>(null);
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  // Kept in the hook rather than the view so switching projects does not throw
  // away which way you were looking at the work.
  const [detailTab, setDetailTab] = useState<"timeline" | "list">("timeline");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("created");
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");
  const [newTaskMilestoneId, setNewTaskMilestoneId] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [createTaskError, setCreateTaskError] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  /** Set only when the create form was opened from a chat message. */
  const [taskSource, setTaskSource] = useState<{
    channelId: string;
    messageId: string;
    excerpt: string;
  } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 인박스에서 넘어올 때만 채워진다. 태스크가 열리고 댓글이 그려진 뒤에야
  // 스크롤할 수 있으므로, 화면이 소비하고 지우는 방식으로 넘긴다.
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const pendingTaskRef = useRef<string | null>(null);
  /** Milestone counterpart to pendingTaskRef; see the project-switch reset. */
  const pendingMilestoneRef = useRef<string | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [activity, setActivity] = useState<TaskActivity[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [taskDetailError, setTaskDetailError] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [projectDetailError, setProjectDetailError] = useState<string | null>(null);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [savingMilestone, setSavingMilestone] = useState(false);
  const [milestoneDetailError, setMilestoneDetailError] = useState<string | null>(null);

  function loadProjects() {
    fetch("/api/mobion/projects")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setProjects(data.projects ?? []);
        setLoadError(null);
      })
      .catch(() => setLoadError("프로젝트 목록을 불러오지 못했습니다."));
  }

  function loadProjectDetail(projectId: string) {
    fetch(`/api/mobion/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data) => {
        setMilestones(data.milestones ?? []);
        setTasks(data.tasks ?? []);
        setDetailError(null);
      })
      .catch(() => setDetailError("프로젝트 정보를 불러오지 못했습니다."));
  }

  useEffect(() => {
    if (!enabled) return;
    loadProjects();
  }, [enabled]);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) loadProjectDetail(selectedProjectId);
  }, [selectedProjectId]);

  function loadActivity(taskId: string) {
    return fetch(`/api/mobion/tasks/${taskId}/activity`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setActivity(data.entries ?? []))
      // a missing history should not stop the task from being edited
      .catch(() => setActivity([]));
  }

  useEffect(() => {
    if (!selectedTaskId) {
      setActivity([]);
      return;
    }
    loadActivity(selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setChecklist([]);
      return;
    }
    fetch(`/api/mobion/tasks/${selectedTaskId}/checklist`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setChecklist(data.items ?? []))
      .catch(() => setChecklist([]));
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setComments([]);
      return;
    }
    setCommentsLoading(true);
    fetch(`/api/mobion/tasks/${selectedTaskId}/comments`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setComments(data.comments ?? []))
      // a failed thread load should not block editing the task itself
      .catch(() => setComments([]))
      .finally(() => setCommentsLoading(false));
  }, [selectedTaskId]);

  /**
   * Appends locally instead of refetching: the response already carries the
   * stored comment, and the thread is ordered oldest first.
   */
  async function addComment(taskId: string, body: string) {
    setPostingComment(true);
    setTaskDetailError(null);
    try {
      const res = await fetch(`/api/mobion/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTaskDetailError(data.error ?? "댓글을 남기지 못했습니다.");
        return false;
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      return true;
    } catch {
      setTaskDetailError("댓글을 남기지 못했습니다.");
      return false;
    } finally {
      setPostingComment(false);
    }
  }

  async function addChecklistItem(taskId: string, label: string) {
    setTaskDetailError(null);
    try {
      const res = await fetch(`/api/mobion/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTaskDetailError(data.error ?? "할 일을 추가하지 못했습니다.");
        return false;
      }
      setChecklist((prev) => [...prev, data.item]);
      // the row badge counts these, and the count lives on the task list
      if (selectedProjectId) loadProjectDetail(selectedProjectId);
      return true;
    } catch {
      setTaskDetailError("할 일을 추가하지 못했습니다.");
      return false;
    }
  }

  /**
   * Ticking a box shows immediately and reverts on failure. The alternative —
   * waiting for the server before the tick appears — makes a checklist feel
   * broken precisely when someone is running down it quickly.
   */
  async function toggleChecklistItem(itemId: string, done: boolean) {
    const previous = checklist;
    setChecklist((prev) => prev.map((i) => (i.id === itemId ? { ...i, done } : i)));
    try {
      const res = await fetch(`/api/mobion/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (!res.ok) throw new Error("failed");
      if (selectedProjectId) loadProjectDetail(selectedProjectId);
    } catch {
      setChecklist(previous);
      setTaskDetailError("할 일을 수정하지 못했습니다.");
    }
  }

  async function deleteChecklistItem(itemId: string) {
    const previous = checklist;
    setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    try {
      const res = await fetch(`/api/mobion/checklist/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      if (selectedProjectId) loadProjectDetail(selectedProjectId);
    } catch {
      setChecklist(previous);
      setTaskDetailError("할 일을 삭제하지 못했습니다.");
    }
  }

  /**
   * Clear the state that belonged to the project being left.
   *
   * The milestone filter is the one that actually breaks: milestones belong to
   * a project, so switching leaves the filter pointing at an id no task in the
   * new project can match, and the list comes back empty with no visible
   * reason. The open panels refer to the old project's rows too.
   *
   * Status, assignee and search survive the switch — those are not tied to a
   * project, and clearing them would throw away a narrowing the user may want
   * to carry across.
   */
  useEffect(() => {
    setMilestoneFilter("");
    // A task chosen from home arrives with its project, and the switch would
    // otherwise clear the selection this effect is meant to protect against
    // stale ones. Carrying it through the switch keeps both behaviours.
    setSelectedTaskId(pendingTaskRef.current);
    pendingTaskRef.current = null;
    setSelectedMilestoneId(pendingMilestoneRef.current);
    pendingMilestoneRef.current = null;
    setEditingProject(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!enabled) return;
    fetch("/api/mobion/users/all")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAllUsers(data.users ?? []))
      .catch(() => {});
  }, [enabled]);

  function openCreateProject() {
    setCreateProjectError(null);
    setNewProjectName("");
    setNewProjectDescription("");
    setShowCreateProject(true);
  }

  async function handleCreateProject() {
    setCreateProjectError(null);
    setCreatingProject(true);
    try {
      const res = await fetch("/api/mobion/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName, description: newProjectDescription }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateProjectError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      const data = await res.json();
      setShowCreateProject(false);
      loadProjects();
      setSelectedProjectId(data.project.id);
    } catch {
      setCreateProjectError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingProject(false);
    }
  }

  async function updateProject(projectId: string, patch: { name?: string; description?: string }) {
    setSavingProject(true);
    setProjectDetailError(null);
    try {
      const res = await fetch(`/api/mobion/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProjectDetailError(data.error ?? "저장에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
    } catch {
      setProjectDetailError("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingProject(false);
    }
    // The sidebar renders from the project list, so a renamed project needs
    // that list refetched, not just the detail payload.
    loadProjects();
    return true;
  }

  function openCreateMilestone() {
    setCreateMilestoneError(null);
    setNewMilestoneTitle("");
    setNewMilestoneTargetDate("");
    setNewMilestoneKind("checkpoint");
    setShowCreateMilestone(true);
  }

  async function handleCreateMilestone() {
    if (!selectedProjectId) return;
    setCreateMilestoneError(null);
    setCreatingMilestone(true);
    try {
      const res = await fetch(`/api/mobion/projects/${selectedProjectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newMilestoneTitle,
          targetDate: newMilestoneTargetDate || null,
          kind: newMilestoneKind,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateMilestoneError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateMilestone(false);
      loadProjectDetail(selectedProjectId);
    } catch {
      setCreateMilestoneError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingMilestone(false);
    }
  }

  /** Milestone counterpart to `updateTask`; same null-vs-undefined contract. */
  async function updateMilestone(
    milestoneId: string,
    patch: { title?: string; targetDate?: string | null; status?: string; kind?: string },
  ) {
    if (!selectedProjectId) return false;
    setSavingMilestone(true);
    setMilestoneDetailError(null);
    try {
      const res = await fetch(`/api/mobion/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMilestoneDetailError(data.error ?? "저장에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
    } catch {
      setMilestoneDetailError("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingMilestone(false);
    }
    loadProjectDetail(selectedProjectId);
    return true;
  }

  async function deleteTask(taskId: string) {
    if (!selectedProjectId) return false;
    setSavingTask(true);
    setTaskDetailError(null);
    try {
      const res = await fetch(`/api/mobion/tasks/${taskId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTaskDetailError(data.error ?? "삭제에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
    } catch {
      setTaskDetailError("삭제에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingTask(false);
    }
    // the save just wrote history entries; the panel is still open on them
    loadActivity(taskId);
    loadProjectDetail(selectedProjectId);
    return true;
  }

  async function deleteMilestone(milestoneId: string) {
    if (!selectedProjectId) return false;
    setSavingMilestone(true);
    setMilestoneDetailError(null);
    try {
      const res = await fetch(`/api/mobion/milestones/${milestoneId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMilestoneDetailError(data.error ?? "삭제에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
    } catch {
      setMilestoneDetailError("삭제에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingMilestone(false);
    }
    // Tasks that pointed at it are unlinked rather than removed, so the task
    // list changes too — refetch both.
    loadProjectDetail(selectedProjectId);
    return true;
  }

  async function updateMilestoneStatus(milestoneId: string, status: string) {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/mobion/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setDetailError("상태를 변경하지 못했습니다.");
        return;
      }
    } catch {
      setDetailError("요청에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    loadProjectDetail(selectedProjectId);
  }

  /**
   * Opens the create form seeded from where the user already is.
   *
   * Filtering to a milestone and then adding a task almost always means adding
   * it to that milestone, and the old form made you pick it again. An explicit
   * `prefill` wins over the filters — that comes from the per-group add
   * buttons, which name their target directly.
   */
  function openCreateTask(prefill?: {
    milestoneId?: string | null;
    assigneeId?: string | null;
    title?: string;
    description?: string;
    sourceChannelId?: string;
    sourceMessageId?: string;
    sourceExcerpt?: string;
  }) {
    setCreateTaskError(null);
    setNewTaskTitle(prefill?.title ?? "");
    setNewTaskDescription(prefill?.description ?? "");
    setNewTaskAssigneeId(prefill?.assigneeId ?? assigneeFilter);
    setNewTaskMilestoneId(prefill?.milestoneId ?? milestoneFilter);
    setNewTaskDueDate("");
    setTaskSource(
      prefill?.sourceChannelId
        ? {
            channelId: prefill.sourceChannelId,
            messageId: prefill.sourceMessageId ?? "",
            excerpt: prefill.sourceExcerpt ?? "",
          }
        : null,
    );
    setShowCreateTask(true);
  }

  async function handleCreateTask() {
    if (!selectedProjectId) return;
    setCreateTaskError(null);
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/mobion/projects/${selectedProjectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDescription,
          assigneeId: newTaskAssigneeId || null,
          milestoneId: newTaskMilestoneId || null,
          dueDate: newTaskDueDate || null,
          sourceChannelId: taskSource?.channelId ?? null,
          sourceMessageId: taskSource?.messageId ?? null,
          sourceExcerpt: taskSource?.excerpt ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateTaskError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateTask(false);
      setTaskSource(null);
      loadProjectDetail(selectedProjectId);
    } catch {
      setCreateTaskError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setCreatingTask(false);
    }
  }

  /**
   * Partial update for the task detail panel. The endpoint already accepted
   * every one of these fields; until now the UI only ever sent `status`.
   *
   * `null` clears a field and `undefined` leaves it untouched, matching what
   * the route expects — so an omitted key is not the same as an empty one.
   */
  /**
   * Opens one task, switching project first when it lives in another one.
   *
   * Used by home and the schedule, where a row names a task in a project that
   * may not be the one currently open.
   */
  function openTaskInProject(projectId: string, taskId: string, focusComment?: string | null) {
    setFocusCommentId(focusComment ?? null);
    if (projectId === selectedProjectId) {
      setSelectedTaskId(taskId);
      return;
    }
    pendingTaskRef.current = taskId;
    setSelectedProjectId(projectId);
  }

  /** Milestone counterpart to openTaskInProject, for search results. */
  function openMilestoneInProject(projectId: string, milestoneId: string) {
    if (projectId === selectedProjectId) {
      setSelectedMilestoneId(milestoneId);
      return;
    }
    pendingMilestoneRef.current = milestoneId;
    setSelectedProjectId(projectId);
  }

  async function updateTask(
    taskId: string,
    patch: {
      title?: string;
      description?: string;
      status?: string;
      assigneeId?: string | null;
      milestoneId?: string | null;
      dueDate?: string | null;
      startDate?: string | null;
    },
  ) {
    if (!selectedProjectId) return false;
    setSavingTask(true);
    setTaskDetailError(null);
    try {
      const res = await fetch(`/api/mobion/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTaskDetailError(data.error ?? "저장에 실패했습니다. 다시 시도해 주세요.");
        return false;
      }
    } catch {
      setTaskDetailError("저장에 실패했습니다. 다시 시도해 주세요.");
      return false;
    } finally {
      setSavingTask(false);
    }
    // the save just wrote history entries; the panel is still open on them
    loadActivity(taskId);
    loadProjectDetail(selectedProjectId);
    return true;
  }

  async function updateTaskStatus(taskId: string, status: string) {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/mobion/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setDetailError("상태를 변경하지 못했습니다.");
        return;
      }
    } catch {
      setDetailError("요청에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    loadProjectDetail(selectedProjectId);
  }

  // Description is searched as well as title: it is often where the detail
  // someone half-remembers actually lives.
  const searchTerm = search.trim().toLowerCase();
  const filteredTasks = tasks.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!milestoneFilter || t.milestoneId === milestoneFilter) &&
      (!assigneeFilter || t.assigneeId === assigneeFilter) &&
      (!searchTerm ||
        t.title.toLowerCase().includes(searchTerm) ||
        (t.description ?? "").toLowerCase().includes(searchTerm)),
  );

  /**
   * Sorting happens once, here, so the grouped views inherit it — they bucket
   * this list rather than re-deriving their own.
   *
   * "created" keeps the order the API returned (created_at ASC) instead of
   * sorting by a field the client does not receive.
   */
  const visibleTasks =
    sortMode === "created"
      ? filteredTasks
      : [...filteredTasks].sort((a, b) => {
          if (sortMode === "due") {
            // Undated tasks sink to the bottom either way; a missing deadline
            // is not the same as an imminent one.
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return a.dueDate.localeCompare(b.dueDate);
          }
          return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
        });

  /**
   * Milestones ordered by target date rather than creation order.
   *
   * A milestone is a point on a timeline, so the date is the meaningful order;
   * the order they happened to be typed in is not. Undated ones go last for the
   * same reason undated tasks do — no deadline is not an early one.
   *
   * The grouped task view buckets in this order too, so both lists agree.
   */
  const orderedMilestones = [...milestones].sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return a.targetDate.localeCompare(b.targetDate);
  });

  /**
   * Tasks bucketed for the grouped views.
   *
   * Buckets follow the source order the sidebar and member list already use, so
   * the sections do not reshuffle between views. The catch-all bucket goes last
   * in both modes — leftovers are not a first section — and empty buckets are
   * dropped so grouping never adds a heading that says nothing.
   */
  const groupedTasks =
    groupMode === "assignee"
      ? [
          ...allUsers
            .map((u) => ({
              id: u.id,
              title: u.name,
              tasks: visibleTasks.filter((t) => t.assigneeId === u.id),
            }))
            .filter((g) => g.tasks.length > 0),
          ...(visibleTasks.some((t) => !t.assigneeId)
            ? [
                {
                  id: null,
                  title: "미배정",
                  tasks: visibleTasks.filter((t) => !t.assigneeId),
                },
              ]
            : []),
        ]
      : [
          ...orderedMilestones
            .map((m) => ({
              id: m.id,
              title: m.title,
              tasks: visibleTasks.filter((t) => t.milestoneId === m.id),
            }))
            .filter((g) => g.tasks.length > 0),
          ...(visibleTasks.some((t) => !t.milestoneId)
            ? [
                {
                  id: null,
                  title: "마일스톤 없음",
                  tasks: visibleTasks.filter((t) => !t.milestoneId),
                },
              ]
            : []),
        ];

  const hasActiveFilters =
    !!statusFilter || !!milestoneFilter || !!assigneeFilter || !!search.trim();

  function resetFilters() {
    setStatusFilter("");
    setMilestoneFilter("");
    setAssigneeFilter("");
    setSearch("");
  }

  const myTasksActive = !!currentUserId && assigneeFilter === currentUserId;

  /** Toggles the assignee filter onto the signed-in user and back off. */
  function toggleMyTasks() {
    if (!currentUserId) return;
    setAssigneeFilter(myTasksActive ? "" : currentUserId);
  }

  const myOpenCount = currentUserId
    ? tasks.filter((t) => t.assigneeId === currentUserId && t.status !== "done").length
    : 0;


  /**
   * Per-milestone task counts, computed once instead of re-filtering the task
   * list inside each row.
   *
   * Counts run over all tasks, not visibleTasks — a milestone's progress is a
   * property of the milestone, and should not change because the list is
   * filtered to one assignee.
   */
  const milestoneProgress = new Map(
    milestones.map((m) => {
      const linked = tasks.filter((t) => t.milestoneId === m.id);
      const done = linked.filter((t) => t.status === "done").length;
      return [
        m.id,
        {
          total: linked.length,
          done,
          percent: linked.length === 0 ? 0 : Math.round((done / linked.length) * 100),
        },
      ];
    }),
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  /**
   * Neighbours of the open task within the list as it is currently filtered and
   * sorted, so stepping through the panel follows what is on screen.
   *
   * Index is -1 when the open task has dropped out of the filtered list — a
   * status change can do that — and both neighbours are then null rather than
   * jumping somewhere arbitrary.
   */
  const openTaskIndex = selectedTaskId
    ? visibleTasks.findIndex((t) => t.id === selectedTaskId)
    : -1;
  const prevTaskId = openTaskIndex > 0 ? visibleTasks[openTaskIndex - 1].id : null;
  const nextTaskId =
    openTaskIndex >= 0 && openTaskIndex < visibleTasks.length - 1
      ? visibleTasks[openTaskIndex + 1].id
      : null;
  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  // Summary counts run over every task, not visibleTasks: a filtered view
  // should not change what "this project is 40% done" means.
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overdueCount = tasks.filter((t) => dueState(t.dueDate, t.status) === "overdue").length;
  const summary = {
    total: tasks.length,
    done: doneCount,
    overdue: overdueCount,
    milestones: milestones.length,
    percent: tasks.length === 0 ? 0 : Math.round((doneCount / tasks.length) * 100),
  };

  /**
   * Merged oldest first, the order the comment thread already reads in.
   * Ties break toward the change: a remark explaining a move is written after
   * the move, and within the same second that order would otherwise be lost.
   */
  const timeline: TimelineEntry[] = [
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, id: c.id, comment: c })),
    ...activity.map((a) => ({ kind: "activity" as const, at: a.createdAt, id: a.id, activity: a })),
  ].sort((x, y) =>
    x.at === y.at
      ? Number(x.kind === "comment") - Number(y.kind === "comment")
      : x.at < y.at
        ? -1
        : 1,
  );

  return {
    projects,
    selectedProject,
    summary,
    selectedProjectId,
    setSelectedProjectId,
    loadError,
    milestones: orderedMilestones,
    milestoneProgress,
    tasks,
    visibleTasks,
    groupedTasks,
    groupMode,
    setGroupMode,
    detailTab,
    setDetailTab,
    myTasksActive,
    toggleMyTasks,
    myOpenCount,
    currentUserId,
    allUsers,
    detailError,

    search,
    setSearch,
    hasActiveFilters,
    resetFilters,
    sortMode,
    setSortMode,
    statusFilter,
    setStatusFilter,
    milestoneFilter,
    setMilestoneFilter,
    assigneeFilter,
    setAssigneeFilter,

    showCreateProject,
    setShowCreateProject,
    newProjectName,
    setNewProjectName,
    newProjectDescription,
    setNewProjectDescription,
    createProjectError,
    creatingProject,
    openCreateProject,
    handleCreateProject,

    showCreateMilestone,
    setShowCreateMilestone,
    newMilestoneTitle,
    setNewMilestoneTitle,
    newMilestoneTargetDate,
    setNewMilestoneTargetDate,
    newMilestoneKind,
    setNewMilestoneKind,
    createMilestoneError,
    creatingMilestone,
    openCreateMilestone,
    handleCreateMilestone,
    updateMilestoneStatus,

    showCreateTask,
    setShowCreateTask,
    newTaskTitle,
    setNewTaskTitle,
    newTaskDescription,
    setNewTaskDescription,
    newTaskAssigneeId,
    setNewTaskAssigneeId,
    newTaskMilestoneId,
    setNewTaskMilestoneId,
    newTaskDueDate,
    setNewTaskDueDate,
    createTaskError,
    creatingTask,
    openCreateTask,
    handleCreateTask,
    updateTaskStatus,
    taskSource,

    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    openTaskInProject,
    focusCommentId,
    clearFocusComment: () => setFocusCommentId(null),
    openMilestoneInProject,
    openTaskIndex,
    prevTaskId,
    nextTaskId,
    savingTask,
    taskDetailError,
    setTaskDetailError,
    updateTask,
    activity,
    timeline,
    checklist,
    addChecklistItem,
    toggleChecklistItem,
    deleteChecklistItem,
    comments,
    commentsLoading,
    postingComment,
    addComment,
    deleteTask,
    deleteMilestone,

    editingProject,
    setEditingProject,
    savingProject,
    projectDetailError,
    setProjectDetailError,
    updateProject,

    selectedMilestone,
    selectedMilestoneId,
    setSelectedMilestoneId,
    savingMilestone,
    milestoneDetailError,
    setMilestoneDetailError,
    updateMilestone,
  };
}

export type TasksData = ReturnType<typeof useTasksData>;
