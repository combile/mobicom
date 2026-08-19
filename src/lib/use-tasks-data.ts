"use client";

import { useEffect, useState } from "react";

export type Project = {
  id: string;
  name: string;
  description: string;
  createdByName: string;
  createdAt: string;
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
export function useTasksData(enabled: boolean) {
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

  function openCreateTask() {
    setCreateTaskError(null);
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskAssigneeId("");
    setNewTaskMilestoneId("");
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

  const visibleTasks = tasks.filter(
    (t) =>
      (!statusFilter || t.status === statusFilter) &&
      (!milestoneFilter || t.milestoneId === milestoneFilter) &&
      (!assigneeFilter || t.assigneeId === assigneeFilter),
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

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
    tasks,
    visibleTasks,
    allUsers,
    detailError,

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
  };
}

export type TasksData = ReturnType<typeof useTasksData>;
