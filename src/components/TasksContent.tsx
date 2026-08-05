"use client";

import { useEffect, useState } from "react";
import styled from "@emotion/styled";

type Project = {
  id: string;
  name: string;
  description: string;
  createdByName: string;
  createdAt: string;
};

type Milestone = { id: string; title: string; targetDate: string | null; status: string };
type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
  milestoneId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

export default function TasksContent() {
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
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) loadProjectDetail(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    fetch("/api/mobion/users/all")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAllUsers(data.users ?? []))
      .catch(() => {});
  }, []);

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

  if (loadError) {
    return (
      <Root>
        <ErrorBanner>{loadError}</ErrorBanner>
      </Root>
    );
  }

  return (
    <Root>
      <Layout>
        <Sidebar>
          <SectionTitle>프로젝트</SectionTitle>
          {projects.map((p) => (
            <ProjectItem
              key={p.id}
              data-active={p.id === selectedProjectId || undefined}
              onClick={() => setSelectedProjectId(p.id)}
            >
              {p.name}
            </ProjectItem>
          ))}
          <AddButton type="button" onClick={openCreateProject}>
            + 프로젝트 추가
          </AddButton>
        </Sidebar>
        <Main>
          {!selectedProjectId && <EmptyState>프로젝트를 선택하거나 새로 만들어 보세요</EmptyState>}
          {selectedProjectId && detailError && <ErrorText>{detailError}</ErrorText>}
          {selectedProjectId && !detailError && (
            <>
              <DetailSectionHeader>
                <DetailSectionTitle>마일스톤</DetailSectionTitle>
                <AddButton type="button" onClick={openCreateMilestone}>
                  + 마일스톤 추가
                </AddButton>
              </DetailSectionHeader>
              <MilestoneList>
                {milestones.length === 0 && <EmptyState>아직 마일스톤이 없습니다</EmptyState>}
                {milestones.map((m) => (
                  <MilestoneRow key={m.id}>
                    <MilestoneTitle>{m.title}</MilestoneTitle>
                    {m.targetDate && <MilestoneDate>{m.targetDate}</MilestoneDate>}
                    {tasks.some((t) => t.milestoneId === m.id) && (
                      <MilestoneDate>
                        {tasks.filter((t) => t.milestoneId === m.id && t.status === "done").length}/
                        {tasks.filter((t) => t.milestoneId === m.id).length} 완료
                      </MilestoneDate>
                    )}
                    <select
                      value={m.status}
                      onChange={(e) => updateMilestoneStatus(m.id, e.target.value)}
                    >
                      <option value="planned">계획</option>
                      <option value="in_progress">진행중</option>
                      <option value="done">완료</option>
                    </select>
                  </MilestoneRow>
                ))}
              </MilestoneList>

              <DetailSectionHeader>
                <DetailSectionTitle>태스크</DetailSectionTitle>
                <AddButton type="button" onClick={openCreateTask}>
                  + 태스크 추가
                </AddButton>
              </DetailSectionHeader>
              <FilterRow>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">모든 상태</option>
                  <option value="todo">할 일</option>
                  <option value="in_progress">진행중</option>
                  <option value="done">완료</option>
                </select>
                <select value={milestoneFilter} onChange={(e) => setMilestoneFilter(e.target.value)}>
                  <option value="">모든 마일스톤</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
                <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="">모든 담당자</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </FilterRow>
              <TaskList>
                {visibleTasks.length === 0 && <EmptyState>조건에 맞는 태스크가 없습니다</EmptyState>}
                {visibleTasks.map((t) => (
                  <TaskRow key={t.id}>
                    <TaskTitle>{t.title}</TaskTitle>
                    <TaskMeta>{t.assigneeName ?? "미배정"}</TaskMeta>
                    {t.dueDate && <TaskMeta>{t.dueDate}</TaskMeta>}
                    <select
                      value={t.status}
                      onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                    >
                      <option value="todo">할 일</option>
                      <option value="in_progress">진행중</option>
                      <option value="done">완료</option>
                    </select>
                  </TaskRow>
                ))}
              </TaskList>
            </>
          )}
        </Main>
      </Layout>
      {showCreateProject && (
        <ModalOverlay onClick={() => setShowCreateProject(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 프로젝트 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-project-name">프로젝트 이름</label>
              <input
                id="new-project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-project-description">설명</label>
              <input
                id="new-project-description"
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder="프로젝트 설명 (선택)"
              />
            </Field>
            {createProjectError && <ErrorText>{createProjectError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateProject(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateProject} disabled={creatingProject}>
                {creatingProject ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
      {showCreateMilestone && (
        <ModalOverlay onClick={() => setShowCreateMilestone(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 마일스톤 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-milestone-title">제목</label>
              <input
                id="new-milestone-title"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-milestone-date">목표 날짜</label>
              <input
                id="new-milestone-date"
                type="date"
                value={newMilestoneTargetDate}
                onChange={(e) => setNewMilestoneTargetDate(e.target.value)}
              />
            </Field>
            {createMilestoneError && <ErrorText>{createMilestoneError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateMilestone(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateMilestone} disabled={creatingMilestone}>
                {creatingMilestone ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
      {showCreateTask && (
        <ModalOverlay onClick={() => setShowCreateTask(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 태스크 만들기</ModalTitle>
            <Field>
              <label htmlFor="new-task-title">제목</label>
              <input
                id="new-task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </Field>
            <Field>
              <label htmlFor="new-task-description">설명</label>
              <input
                id="new-task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="태스크 설명 (선택)"
              />
            </Field>
            <Field>
              <label htmlFor="new-task-assignee">담당자</label>
              <select
                id="new-task-assignee"
                value={newTaskAssigneeId}
                onChange={(e) => setNewTaskAssigneeId(e.target.value)}
              >
                <option value="">미배정</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label htmlFor="new-task-milestone">마일스톤</label>
              <select
                id="new-task-milestone"
                value={newTaskMilestoneId}
                onChange={(e) => setNewTaskMilestoneId(e.target.value)}
              >
                <option value="">없음</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label htmlFor="new-task-due-date">마감일</label>
              <input
                id="new-task-due-date"
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
              />
            </Field>
            {createTaskError && <ErrorText>{createTaskError}</ErrorText>}
            <ModalActions>
              <button type="button" onClick={() => setShowCreateTask(false)}>
                취소
              </button>
              <button type="button" onClick={handleCreateTask} disabled={creatingTask}>
                {creatingTask ? "만드는 중..." : "만들기"}
              </button>
            </ModalActions>
          </ModalCard>
        </ModalOverlay>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: clamp(135px, 14.4vh, 189px) 24px 24px;
`;

const ErrorBanner = styled.div`
  text-align: center;
  color: #ff6767;
  padding: 40px;
`;

const Layout = styled.div`
  display: flex;
  height: calc(100vh - clamp(159px, 17.4vh, 213px));
  max-width: 1100px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const Sidebar = styled.div`
  width: 240px;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  padding: 12px;
  overflow-y: auto;
`;

const SectionTitle = styled.div`
  color: #9a9a9a;
  font-size: 13px;
  font-weight: 700;
  padding: 4px 0 8px;
`;

const ProjectItem = styled.div`
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

const AddButton = styled.button`
  width: 100%;
  padding: 8px 12px;
  margin-top: 8px;
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.24);
  background: transparent;
  color: #9a9a9a;
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: #00b5ff;
    border-color: #00b5ff;
  }
`;

const Main = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow-y: auto;
  padding: 20px;
`;

const EmptyState = styled.div`
  margin: auto;
  color: #9a9a9a;
  font-size: 14px;
`;

const DetailSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const DetailSectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  color: #fff;
`;

const MilestoneList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 24px;
`;

const MilestoneRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);

  select {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }
`;

const MilestoneTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const MilestoneDate = styled.span`
  color: #767676;
  font-size: 12px;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  select {
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 12px;
  }
`;

const TaskList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const TaskRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);

  select {
    margin-left: auto;
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 12px;
  }
`;

const TaskTitle = styled.span`
  color: #d4d4d4;
  font-size: 14px;
`;

const TaskMeta = styled.span`
  color: #767676;
  font-size: 12px;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
`;

const ModalCard = styled.div`
  width: min(360px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 14px;
    outline: none;
  }
`;

const ErrorText = styled.p`
  color: #ff6767;
  font-size: 12px;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  button:last-of-type {
    background: #00b5ff;
    color: #061018;
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
