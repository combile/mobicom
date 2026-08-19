"use client";

import { useEffect, useState } from "react";

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

export type Milestone = { id: string; title: string; targetDate: string | null; status: string };

export type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  milestoneId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
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
function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function shiftISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

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
  const [createMilestoneError, setCreateMilestoneError] = useState<string | null>(null);
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
    patch: { title?: string; targetDate?: string | null; status?: string },
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
  function openCreateTask(prefill?: { milestoneId?: string | null; assigneeId?: string | null }) {
    setCreateTaskError(null);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskAssigneeId(prefill?.assigneeId ?? assigneeFilter);
    setNewTaskMilestoneId(prefill?.milestoneId ?? milestoneFilter);
    setNewTaskDueDate("");
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
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateTaskError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setShowCreateTask(false);
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
  async function updateTask(
    taskId: string,
    patch: {
      title?: string;
      description?: string;
      status?: string;
      assigneeId?: string | null;
      milestoneId?: string | null;
      dueDate?: string | null;
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
          ...milestones
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

  return {
    projects,
    selectedProject,
    summary,
    selectedProjectId,
    setSelectedProjectId,
    loadError,
    milestones,
    milestoneProgress,
    tasks,
    visibleTasks,
    groupedTasks,
    groupMode,
    setGroupMode,
    myTasksActive,
    toggleMyTasks,
    myOpenCount,
    currentUserId,
    allUsers,
    detailError,

    search,
    setSearch,
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

    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    savingTask,
    taskDetailError,
    setTaskDetailError,
    updateTask,
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
