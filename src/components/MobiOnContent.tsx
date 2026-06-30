"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type {
  MobionDoc,
  MobionLink,
  MobionMessage,
  MobionTask,
} from "@/lib/mobion-data";
import type { MobionUser } from "@/lib/mobion-auth";

gsap.registerPlugin(ScrollTrigger);

type ViewKey = "dashboard" | "tasks" | "docs" | "links" | "room";
type AuthMode = "login" | "register";
type WorkspaceData = {
  tasks: MobionTask[];
  docs: MobionDoc[];
  messages: MobionMessage[];
  links: MobionLink[];
};

const EMPTY_WORKSPACE: WorkspaceData = {
  tasks: [],
  docs: [],
  messages: [],
  links: [],
};

const VIEWS: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "dashboard", label: "Overview", icon: "dashboard" },
  { key: "tasks", label: "Tasks", icon: "view_kanban" },
  { key: "docs", label: "Docs", icon: "article" },
  { key: "links", label: "Links", icon: "link" },
  { key: "room", label: "Room", icon: "forum" },
];

const STATUSES: MobionTask["status"][] = ["now", "next", "review", "done"];
const STATUS_LABEL: Record<MobionTask["status"], string> = {
  now: "Now",
  next: "Next",
  review: "Review",
  done: "Done",
};
const PRIORITY_LABEL: Record<MobionTask["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function shortDate(value?: string | null) {
  if (!value) return "No date";
  const date = parseDateValue(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function parseDateValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dueState(value?: string | null) {
  if (!value) return "open";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDateValue(value);
  if (Number.isNaN(due.getTime())) return "open";
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "late";
  if (diff <= 2) return "soon";
  return "open";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "요청에 실패했습니다.");
  }
  return data as T;
}

export default function MobiOnContent() {
  const root = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<MobionUser | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [active, setActive] = useState<ViewKey>("dashboard");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const projects = useMemo(() => {
    const names = new Set<string>();
    workspace.tasks.forEach((item) => names.add(item.project));
    workspace.docs.forEach((item) => names.add(item.project));
    workspace.links.forEach((item) => names.add(item.project));
    return ["all", ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [workspace]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matchesProject = (value: string) => project === "all" || value === project;
    const matchesText = (...values: string[]) =>
      !needle || values.some((value) => value.toLowerCase().includes(needle));

    return {
      tasks: workspace.tasks.filter(
        (task) =>
          matchesProject(task.project) &&
          matchesText(task.code, task.title, task.owner, task.project, task.notes),
      ),
      docs: workspace.docs.filter(
        (doc) =>
          matchesProject(doc.project) &&
          matchesText(doc.title, doc.body, doc.project, doc.kind),
      ),
      links: workspace.links.filter(
        (link) =>
          matchesProject(link.project) &&
          matchesText(link.title, link.url, link.project, link.kind),
      ),
      messages: workspace.messages.filter((message) =>
        matchesText(message.author, message.body),
      ),
    };
  }, [project, query, workspace]);

  const selectedDoc = useMemo(
    () =>
      selectedDocId
        ? (workspace.docs.find((doc) => doc.id === selectedDocId) ?? null)
        : null,
    [workspace.docs, selectedDocId],
  );

  const metrics = useMemo(() => {
    const open = workspace.tasks.filter((task) => task.status !== "done").length;
    const done = workspace.tasks.filter((task) => task.status === "done").length;
    const urgent = workspace.tasks.filter(
      (task) => task.status !== "done" && dueState(task.due_date) !== "open",
    ).length;
    const progress = workspace.tasks.length
      ? Math.round(
          workspace.tasks.reduce((sum, task) => sum + task.progress, 0) /
            workspace.tasks.length,
        )
      : 0;
    return { open, done, urgent, progress };
  }, [workspace.tasks]);

  const emptyLabel = useMemo(() => {
    if (query.trim()) return "검색 조건에 맞는 항목이 없습니다.";
    if (project !== "all") return `${project} 프로젝트에 아직 항목이 없습니다.`;
    return "아직 저장된 항목이 없습니다.";
  }, [project, query]);

  const projectCards = useMemo(() => {
    return projects
      .filter((name) => name !== "all")
      .map((name) => {
        const tasks = workspace.tasks.filter((task) => task.project === name);
        const docs = workspace.docs.filter((doc) => doc.project === name);
        const links = workspace.links.filter((link) => link.project === name);
        const progress = tasks.length
          ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
          : 0;
        return { name, tasks, docs, links, progress };
      });
  }, [projects, workspace]);

  const viewAnimationKey = `${active}:${filtered.tasks.length}:${filtered.docs.length}:${filtered.links.length}:${filtered.messages.length}`;

  async function loadWorkspace() {
    setError("");
    try {
      const session = await requestJson<{ user: MobionUser | null }>(
        "/api/mobion/auth/me",
      );
      if (!session.user) {
        setUser(null);
        setWorkspace(EMPTY_WORKSPACE);
        return;
      }

      const data = await requestJson<{
        user: MobionUser;
        workspace: WorkspaceData;
      }>("/api/mobion/workspace");
      setUser(data.user);
      setWorkspace({
        ...data.workspace,
        links: data.workspace.links ?? [],
      });
      setSelectedDocId((current) => current ?? data.workspace.docs[0]?.id ?? null);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : "워크스페이스 로드 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.from(".mobion-rise", {
        y: 34,
        autoAlpha: 0,
        duration: 0.72,
        ease: "power3.out",
        stagger: 0.08,
      });
    },
    { scope: root, dependencies: [user] },
  );

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const view = root.current?.querySelector(".mobion-view");
      if (!view) return;
      gsap.fromTo(
        view,
        { y: 18, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.34, ease: "power3.out" },
      );
    },
    { scope: root, dependencies: [viewAnimationKey] },
  );

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    const form = new FormData(formElement);
    try {
      await requestJson(`/api/mobion/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      formElement.reset();
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 실패");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setError("");
    try {
      await requestJson("/api/mobion/auth/logout", { method: "POST" });
      setUser(null);
      setWorkspace(EMPTY_WORKSPACE);
      setSelectedDocId(null);
      setActive("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그아웃 실패");
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ task: MobionTask }>("/api/mobion/tasks", {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          title: form.get("title"),
          status: form.get("status"),
          owner: form.get("owner"),
          progress: form.get("progress"),
          project: form.get("project"),
          priority: form.get("priority"),
          dueDate: form.get("dueDate"),
          notes: form.get("notes"),
        }),
      });
      setWorkspace((current) => ({
        ...current,
        tasks: [data.task, ...current.tasks],
      }));
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "태스크 생성 실패");
    } finally {
      setSaving(false);
    }
  }

  async function patchTask(id: string, body: Partial<MobionTask> & { dueDate?: string | null }) {
    setError("");
    try {
      const data = await requestJson<{ task: MobionTask }>(`/api/mobion/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setWorkspace((current) => ({
        ...current,
        tasks: current.tasks.map((task) => (task.id === id ? data.task : task)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "태스크 수정 실패");
    }
  }

  async function deleteTask(id: string) {
    setError("");
    try {
      await requestJson(`/api/mobion/tasks/${id}`, { method: "DELETE" });
      setWorkspace((current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "태스크 삭제 실패");
    }
  }

  async function saveDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") ?? "");
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ doc: MobionDoc }>(
        id ? `/api/mobion/docs/${id}` : "/api/mobion/docs",
        {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify({
            title: form.get("title"),
            body: form.get("body"),
            project: form.get("project"),
            kind: form.get("kind"),
            pinned: form.get("pinned") === "on",
          }),
        },
      );
      setWorkspace((current) => ({
        ...current,
        docs: id
          ? current.docs.map((doc) => (doc.id === id ? data.doc : doc))
          : [data.doc, ...current.docs],
      }));
      setSelectedDocId(data.doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(id: string) {
    setError("");
    try {
      await requestJson(`/api/mobion/docs/${id}`, { method: "DELETE" });
      setWorkspace((current) => ({
        ...current,
        docs: current.docs.filter((doc) => doc.id !== id),
      }));
      setSelectedDocId((current) => (current === id ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 삭제 실패");
    }
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ link: MobionLink }>("/api/mobion/links", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          url: form.get("url"),
          project: form.get("project"),
          kind: form.get("kind"),
        }),
      });
      setWorkspace((current) => ({
        ...current,
        links: [data.link, ...current.links],
      }));
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "링크 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLink(id: string) {
    setError("");
    try {
      await requestJson(`/api/mobion/links/${id}`, { method: "DELETE" });
      setWorkspace((current) => ({
        ...current,
        links: current.links.filter((link) => link.id !== id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "링크 삭제 실패");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("body") ?? "").trim();
    if (!body) return;
    setError("");
    try {
      const data = await requestJson<{ message: MobionMessage }>(
        "/api/mobion/messages",
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
      setWorkspace((current) => ({
        ...current,
        messages: [...current.messages, data.message],
      }));
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "메시지 전송 실패");
    }
  }

  return (
    <Root ref={root}>
      <GridGlow aria-hidden />
      <Container>
        <Top className="mobion-rise">
          <TitleBlock>
            <Eyebrow>
              <span className="material-symbols-outlined">bolt</span>
              Project operating system
            </Eyebrow>
            <Title>
              Mobi:<Accent>ON</Accent>
            </Title>
            <Lead>
              팀플, 개인 프로젝트, 연구 노트를 한 곳에서 굴리는 모비콤 전용
              작업 공간입니다.
            </Lead>
          </TitleBlock>
          <CommandBar>
            <SearchWrap>
              <span className="material-symbols-outlined">search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks, docs, links"
              />
            </SearchWrap>
            <select value={project} onChange={(event) => setProject(event.target.value)}>
              {projects.map((name) => (
                <option key={name} value={name}>
                  {name === "all" ? "All projects" : name}
                </option>
              ))}
            </select>
          </CommandBar>
        </Top>

        {loading ? (
          <StatePanel className="mobion-rise">Mobi:ON 연결 중...</StatePanel>
        ) : !user ? (
          <AuthGrid className="mobion-rise">
            <AuthCopy>
              <b>Work begins after login.</b>
              <p>
                가입하면 PostgreSQL 기반 개인 워크스페이스가 생성됩니다. 팀플과
                개인 프로젝트를 프로젝트명으로 분리해서 관리할 수 있습니다.
              </p>
              <AuthPoints>
                <span>Task board</span>
                <span>Project docs</span>
                <span>Resource links</span>
                <span>Team room</span>
              </AuthPoints>
              {error && <ErrorText>{error}</ErrorText>}
            </AuthCopy>
            <AuthPanel onSubmit={submitAuth}>
              <Segmented>
                <button
                  type="button"
                  data-active={authMode === "login" || undefined}
                  onClick={() => setAuthMode("login")}
                >
                  Login
                </button>
                <button
                  type="button"
                  data-active={authMode === "register" || undefined}
                  onClick={() => setAuthMode("register")}
                >
                  Sign up
                </button>
              </Segmented>
              {authMode === "register" && (
                <Field>
                  <label htmlFor="mobion-name">Name</label>
                  <input id="mobion-name" name="name" placeholder="Eunsik Woo" />
                </Field>
              )}
              <Field>
                <label htmlFor="mobion-email">Email</label>
                <input
                  id="mobion-email"
                  name="email"
                  type="email"
                  placeholder="member@mobicom.dev"
                />
              </Field>
              <Field>
                <label htmlFor="mobion-password">Password</label>
                <input
                  id="mobion-password"
                  name="password"
                  type="password"
                  placeholder="8 characters or more"
                />
              </Field>
              <Primary type="submit" disabled={saving}>
                {saving ? "Working..." : authMode === "login" ? "Login" : "Create workspace"}
              </Primary>
            </AuthPanel>
          </AuthGrid>
        ) : (
          <Workspace className="mobion-rise">
            <Sidebar>
              <Brand>
                <Mark>{initials(user.name)}</Mark>
                <BrandText>
                  <span>{user.name}</span>
                  <small>{user.email}</small>
                </BrandText>
              </Brand>
              <ViewList>
                {VIEWS.map((view) => (
                  <ViewButton
                    key={view.key}
                    type="button"
                    data-active={active === view.key || undefined}
                    onClick={() => setActive(view.key)}
                  >
                    <span className="material-symbols-outlined">{view.icon}</span>
                    <span>{view.label}</span>
                  </ViewButton>
                ))}
              </ViewList>
              <SidebarStats>
                <b>{metrics.progress}%</b>
                <span>average progress</span>
              </SidebarStats>
              <Secondary type="button" onClick={logout}>
                Logout
              </Secondary>
            </Sidebar>

            <MainPanel className="mobion-view">
              {error && <ErrorText>{error}</ErrorText>}

              {active === "dashboard" && (
                <>
                  <PanelTop>
                    <PanelTitle>Today&apos;s Command Center</PanelTitle>
                    <LiveBadge>
                      <span />
                      Synced
                    </LiveBadge>
                  </PanelTop>
                  <MetricGrid>
                    <Metric>
                      <b>{metrics.open}</b>
                      <span>Open tasks</span>
                    </Metric>
                    <Metric>
                      <b>{metrics.urgent}</b>
                      <span>Due pressure</span>
                    </Metric>
                    <Metric>
                      <b>{workspace.docs.filter((doc) => doc.pinned).length}</b>
                      <span>Pinned docs</span>
                    </Metric>
                    <Metric>
                      <b>{workspace.links.length}</b>
                      <span>Saved links</span>
                    </Metric>
                  </MetricGrid>

                  <DashboardGrid>
                    <SectionPanel>
                      <SectionHead>
                        <h3>Projects</h3>
                        <span>{projectCards.length}</span>
                      </SectionHead>
                      <ProjectStack>
                        {projectCards.map((item) => (
                          <ProjectCard
                            key={item.name}
                            type="button"
                            onClick={() => {
                              setProject(item.name);
                              setActive("tasks");
                            }}
                          >
                            <b>{item.name}</b>
                            <small>
                              {item.tasks.length} tasks · {item.docs.length} docs ·{" "}
                              {item.links.length} links
                            </small>
                            <ProgressBar aria-label={`${item.name} progress`}>
                              <span style={{ width: `${item.progress}%` }} />
                            </ProgressBar>
                          </ProjectCard>
                        ))}
                        {projectCards.length === 0 && (
                          <EmptyState>
                            <b>No projects yet</b>
                            <span>태스크나 문서를 만들면 프로젝트가 자동으로 잡힙니다.</span>
                          </EmptyState>
                        )}
                      </ProjectStack>
                    </SectionPanel>

                    <SectionPanel>
                      <SectionHead>
                        <h3>Urgent</h3>
                        <span>{metrics.urgent}</span>
                      </SectionHead>
                      <TaskStack>
                        {filtered.tasks
                          .filter((task) => task.status !== "done")
                          .slice(0, 5)
                          .map((task) => (
                            <CompactTask key={task.id} data-due={dueState(task.due_date)}>
                              <b>{task.title}</b>
                              <span>
                                {task.project} · {shortDate(task.due_date)}
                              </span>
                            </CompactTask>
                          ))}
                        {filtered.tasks.filter((task) => task.status !== "done").length ===
                          0 && (
                          <EmptyState>
                            <b>All clear</b>
                            <span>열린 태스크가 없습니다.</span>
                          </EmptyState>
                        )}
                      </TaskStack>
                    </SectionPanel>
                  </DashboardGrid>
                </>
              )}

              {active === "tasks" && (
                <>
                  <PanelTop>
                    <PanelTitle>Task Board</PanelTitle>
                    <LiveBadge>{filtered.tasks.length} visible</LiveBadge>
                  </PanelTop>
                  <TaskForm onSubmit={createTask}>
                    <input name="code" placeholder="CAP-01" />
                    <input name="title" placeholder="Task title" required />
                    <input
                      name="project"
                      placeholder="Project"
                      defaultValue={project === "all" ? "" : project}
                    />
                    <select name="priority" defaultValue="medium">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <select name="status" defaultValue="now">
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </option>
                      ))}
                    </select>
                    <input name="owner" placeholder="EW" />
                    <input name="dueDate" type="date" />
                    <input name="progress" type="number" min="0" max="100" placeholder="0" />
                    <textarea name="notes" placeholder="Notes, checklist, next action" />
                    <Primary type="submit" disabled={saving}>
                      Add task
                    </Primary>
                  </TaskForm>

                  <StatusColumns>
                    {STATUSES.map((status) => (
                      <TaskColumn key={status}>
                        <ColumnTitle>
                          {STATUS_LABEL[status]}
                          <span>
                            {filtered.tasks.filter((task) => task.status === status).length}
                          </span>
                        </ColumnTitle>
                        {filtered.tasks
                          .filter((task) => task.status === status)
                          .map((task) => (
                            <TaskCard key={task.id} data-priority={task.priority}>
                              <TaskTop>
                                <CodeInput
                                  defaultValue={task.code}
                                  aria-label={`${task.title} code`}
                                  onBlur={(event) =>
                                    void patchTask(task.id, {
                                      code: event.currentTarget.value,
                                    })
                                  }
                                />
                                <Due data-state={dueState(task.due_date)}>
                                  {shortDate(task.due_date)}
                                </Due>
                              </TaskTop>
                              <TaskTitleInput
                                defaultValue={task.title}
                                aria-label={`${task.title} title`}
                                onBlur={(event) =>
                                  void patchTask(task.id, {
                                    title: event.currentTarget.value,
                                  })
                                }
                              />
                              <TaskMetaForm>
                                <input
                                  defaultValue={task.project}
                                  aria-label={`${task.title} project`}
                                  onBlur={(event) =>
                                    void patchTask(task.id, {
                                      project: event.currentTarget.value,
                                    })
                                  }
                                />
                                <select
                                  value={task.priority}
                                  aria-label={`${task.title} priority`}
                                  onChange={(event) =>
                                    void patchTask(task.id, {
                                      priority: event.target.value as MobionTask["priority"],
                                    })
                                  }
                                >
                                  <option value="low">{PRIORITY_LABEL.low}</option>
                                  <option value="medium">{PRIORITY_LABEL.medium}</option>
                                  <option value="high">{PRIORITY_LABEL.high}</option>
                                </select>
                                <input
                                  defaultValue={task.owner}
                                  aria-label={`${task.title} owner`}
                                  onBlur={(event) =>
                                    void patchTask(task.id, {
                                      owner: event.currentTarget.value,
                                    })
                                  }
                                />
                              </TaskMetaForm>
                              <TaskNotesInput
                                defaultValue={task.notes}
                                aria-label={`${task.title} notes`}
                                placeholder="Notes"
                                onBlur={(event) =>
                                  void patchTask(task.id, {
                                    notes: event.currentTarget.value,
                                  })
                                }
                              />
                              <ProgressBar>
                                <span style={{ width: `${task.progress}%` }} />
                              </ProgressBar>
                              <TaskActions>
                                <select
                                  value={task.status}
                                  onChange={(event) =>
                                    void patchTask(task.id, {
                                      status: event.target.value as MobionTask["status"],
                                    })
                                  }
                                >
                                  {STATUSES.map((item) => (
                                    <option key={item} value={item}>
                                      {STATUS_LABEL[item]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  defaultValue={task.progress}
                                  aria-label={`${task.title} progress`}
                                  onBlur={(event) =>
                                    void patchTask(task.id, {
                                      progress: Number(event.currentTarget.value),
                                    })
                                  }
                                />
                                <input
                                  type="date"
                                  defaultValue={task.due_date ?? ""}
                                  aria-label={`${task.title} due date`}
                                  onBlur={(event) =>
                                    void patchTask(task.id, {
                                      dueDate: event.currentTarget.value,
                                    })
                                  }
                                />
                                <GhostButton
                                  type="button"
                                  aria-label={`${task.title} 삭제`}
                                  onClick={() => void deleteTask(task.id)}
                                >
                                  <span className="material-symbols-outlined">delete</span>
                                </GhostButton>
                              </TaskActions>
                            </TaskCard>
                          ))}
                      </TaskColumn>
                    ))}
                  </StatusColumns>
                </>
              )}

              {active === "docs" && (
                <DocsLayout>
                  <DocList>
                    <SectionHead>
                      <h3>Documents</h3>
                      <span>{filtered.docs.length}</span>
                    </SectionHead>
                    <Secondary type="button" onClick={() => setSelectedDocId(null)}>
                      New doc
                    </Secondary>
                    {filtered.docs.map((doc) => (
                      <DocButton
                        key={doc.id}
                        type="button"
                        data-active={doc.id === selectedDoc?.id || undefined}
                        onClick={() => setSelectedDocId(doc.id)}
                      >
                        <b>
                          {doc.pinned ? "Pinned · " : ""}
                          {doc.title}
                        </b>
                        <span>
                          {doc.project} · {doc.kind} · {shortDate(doc.updated_at)}
                        </span>
                      </DocButton>
                    ))}
                    {filtered.docs.length === 0 && (
                      <EmptyState>
                        <b>No docs</b>
                        <span>{emptyLabel}</span>
                      </EmptyState>
                    )}
                  </DocList>
                  <DocEditor onSubmit={saveDoc}>
                    <input type="hidden" name="id" value={selectedDoc?.id ?? ""} />
                    <DocControls>
                      <Field>
                        <label htmlFor="doc-title">Title</label>
                        <input
                          id="doc-title"
                          key={`title-${selectedDoc?.id ?? "new"}`}
                          name="title"
                          defaultValue={selectedDoc?.title ?? ""}
                          placeholder="Project brief"
                          required
                        />
                      </Field>
                      <Field>
                        <label htmlFor="doc-project">Project</label>
                        <input
                          id="doc-project"
                          key={`project-${selectedDoc?.id ?? "new"}`}
                          name="project"
                          defaultValue={
                            selectedDoc?.project ??
                            (project === "all" ? "General" : project)
                          }
                          placeholder="Team Project"
                        />
                      </Field>
                      <Field>
                        <label htmlFor="doc-kind">Kind</label>
                        <select
                          id="doc-kind"
                          key={`kind-${selectedDoc?.id ?? "new"}`}
                          name="kind"
                          defaultValue={selectedDoc?.kind ?? "note"}
                        >
                          <option value="note">Note</option>
                          <option value="spec">Spec</option>
                          <option value="meeting">Meeting</option>
                          <option value="retro">Retro</option>
                        </select>
                      </Field>
                    </DocControls>
                    <Field>
                      <label htmlFor="doc-body">Body</label>
                      <textarea
                        id="doc-body"
                        key={`body-${selectedDoc?.id ?? "new"}`}
                        name="body"
                        defaultValue={selectedDoc?.body ?? ""}
                        placeholder="Decisions, context, acceptance criteria..."
                      />
                    </Field>
                    <ActionRow>
                      <CheckLabel>
                        <input
                          key={`pinned-${selectedDoc?.id ?? "new"}`}
                          type="checkbox"
                          name="pinned"
                          defaultChecked={selectedDoc?.pinned ?? false}
                        />
                        Pin this doc
                      </CheckLabel>
                      <Primary type="submit" disabled={saving}>
                        Save doc
                      </Primary>
                      {selectedDoc && (
                        <Secondary type="button" onClick={() => void deleteDoc(selectedDoc.id)}>
                          Delete
                        </Secondary>
                      )}
                    </ActionRow>
                  </DocEditor>
                </DocsLayout>
              )}

              {active === "links" && (
                <>
                  <PanelTop>
                    <PanelTitle>Resource Links</PanelTitle>
                    <LiveBadge>{filtered.links.length} saved</LiveBadge>
                  </PanelTop>
                  <LinkForm onSubmit={createLink}>
                    <input name="title" placeholder="Reference title" />
                    <input name="url" placeholder="https://..." />
                    <input name="project" placeholder="Project" />
                    <input name="kind" placeholder="design, repo, docs" />
                    <Primary type="submit" disabled={saving}>
                      Save link
                    </Primary>
                  </LinkForm>
                  <LinkGrid>
                    {filtered.links.map((link) => (
                      <LinkCard key={link.id}>
                        <a href={link.url} target="_blank" rel="noreferrer">
                          <b>{link.title}</b>
                          <span>{link.url}</span>
                        </a>
                        <LinkMeta>
                          <span>{link.project}</span>
                          <span>{link.kind}</span>
                        </LinkMeta>
                        <GhostButton
                          type="button"
                          aria-label={`${link.title} 삭제`}
                          onClick={() => void deleteLink(link.id)}
                        >
                          <span className="material-symbols-outlined">delete</span>
                        </GhostButton>
                      </LinkCard>
                    ))}
                    {filtered.links.length === 0 && (
                      <EmptyState>
                        <b>No links</b>
                        <span>{emptyLabel}</span>
                      </EmptyState>
                    )}
                  </LinkGrid>
                </>
              )}

              {active === "room" && (
                <>
                  <PanelTop>
                    <PanelTitle>Team Room</PanelTitle>
                    <LiveBadge>{workspace.messages.length} messages</LiveBadge>
                  </PanelTop>
                  <RoomGrid>
                    {filtered.messages.map((message) => (
                      <Bubble key={message.id}>
                        <Avatar>{initials(message.author)}</Avatar>
                        <BubbleText>
                          <b>{message.author}</b>
                          <span>{message.body}</span>
                        </BubbleText>
                      </Bubble>
                    ))}
                    {filtered.messages.length === 0 && (
                      <EmptyState>
                        <b>No messages</b>
                        <span>{emptyLabel}</span>
                      </EmptyState>
                    )}
                  </RoomGrid>
                  <MessageForm onSubmit={sendMessage}>
                    <input
                      name="body"
                      placeholder="Share decision, blocker, link, next action..."
                    />
                    <Primary type="submit">Send</Primary>
                  </MessageForm>
                </>
              )}
            </MainPanel>
          </Workspace>
        )}
      </Container>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: clamp(126px, 13vh, 172px) 0 88px;
  overflow: hidden;
`;

const GridGlow = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    radial-gradient(52% 32% at 50% 20%, rgba(0, 181, 255, 0.18), transparent 72%);
  background-size: 42px 42px, 42px 42px, auto;
`;

const Container = styled.div`
  max-width: 1560px;
  margin: 0 auto;
  padding: 0 clamp(20px, 3.2vw, 52px);
`;

const Top = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 520px);
  gap: clamp(24px, 4vw, 64px);
  align-items: end;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: #00b5ff;
  font-size: 14px;
  font-weight: 800;
`;

const Title = styled.h1`
  margin-top: 12px;
  color: #fff;
  font-size: clamp(64px, 9.6vw, 144px);
  font-weight: 950;
  line-height: 0.9;
`;

const Accent = styled.span`
  color: #00b5ff;
`;

const Lead = styled.p`
  max-width: 760px;
  margin-top: 20px;
  color: rgba(255, 255, 255, 0.74);
  font-size: clamp(15px, 1.5vw, 23px);
  font-weight: 300;
  line-height: 1.55;
  word-break: keep-all;
`;

const CommandBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: rgba(6, 9, 12, 0.82);
  backdrop-filter: blur(16px);

  select {
    min-width: 0;
    height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: #06090c;
    color: #fff;
    font: inherit;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const SearchWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: #06090c;

  span {
    color: rgba(255, 255, 255, 0.54);
    font-size: 20px;
  }

  input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
    color: #fff;
    font: inherit;
  }
`;

const StatePanel = styled.div`
  margin-top: 36px;
  padding: 32px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 18px;
  background: rgba(8, 12, 16, 0.88);
  color: #fff;
`;

const AuthGrid = styled.section`
  margin-top: 36px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 430px);
  gap: 18px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const AuthCopy = styled.div`
  padding: clamp(28px, 4vw, 48px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(8, 12, 16, 0.88);

  b {
    display: block;
    color: #fff;
    font-size: clamp(28px, 3.8vw, 48px);
    line-height: 1.05;
  }

  p {
    max-width: 640px;
    margin-top: 16px;
    color: rgba(255, 255, 255, 0.68);
    font-size: clamp(14px, 1.4vw, 20px);
    line-height: 1.55;
  }
`;

const AuthPoints = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;

  span {
    padding: 7px 11px;
    border-radius: 999px;
    background: rgba(0, 181, 255, 0.12);
    color: #b7f0ff;
    font-size: 12px;
    font-weight: 800;
  }
`;

const AuthPanel = styled.form`
  display: grid;
  gap: 14px;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.48);
`;

const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 5px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.06);

  button {
    height: 38px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: rgba(255, 255, 255, 0.68);
    font-weight: 850;
  }

  button[data-active] {
    background: #00b5ff;
    color: #00131c;
  }
`;

const Field = styled.div`
  display: grid;
  gap: 7px;

  label {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
    font-weight: 800;
  }

  input,
  textarea,
  select {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.46);
    color: #fff;
    font: inherit;
    outline: none;
  }

  input,
  select {
    height: 44px;
    padding: 0 13px;
  }

  textarea {
    min-height: 260px;
    padding: 13px;
    resize: vertical;
    line-height: 1.5;
  }
`;

const Primary = styled.button`
  min-height: 42px;
  padding: 0 16px;
  border: 0;
  border-radius: 12px;
  background: #00b5ff;
  color: #00131c;
  font-weight: 900;

  &:disabled {
    opacity: 0.55;
  }
`;

const Secondary = styled.button`
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-weight: 850;
`;

const ErrorText = styled.p`
  margin: 12px 0 0;
  color: #ff8d8d;
  font-weight: 750;
`;

const Workspace = styled.section`
  margin-top: 32px;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 690px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  overflow: hidden;
  background: rgba(8, 12, 16, 0.9);
  box-shadow: 0 32px 78px rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(18px);

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.34);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;
`;

const Mark = styled.div`
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #00b5ff;
  color: #00131c;
  font-weight: 950;
`;

const BrandText = styled.div`
  min-width: 0;

  span,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: #fff;
    font-weight: 850;
  }

  small {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
  }
`;

const ViewList = styled.div`
  display: grid;
  gap: 7px;
`;

const ViewButton = styled.button`
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 44px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.74);
  text-align: left;

  span:first-of-type {
    font-size: 20px;
  }

  &[data-active],
  &:hover {
    border-color: rgba(0, 181, 255, 0.34);
    background: rgba(0, 181, 255, 0.12);
    color: #fff;
  }
`;

const SidebarStats = styled.div`
  margin-top: auto;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);

  b {
    display: block;
    color: #fff;
    font-size: 28px;
  }

  span {
    display: block;
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.54);
    font-size: 12px;
  }
`;

const MainPanel = styled.div`
  min-width: 0;
  padding: clamp(20px, 2.4vw, 34px);
`;

const PanelTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
`;

const PanelTitle = styled.h2`
  color: #fff;
  font-size: clamp(24px, 2.4vw, 36px);
  line-height: 1.05;
`;

const LiveBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-radius: 999px;
  color: #b7f0ff;
  background: rgba(0, 181, 255, 0.12);
  font-size: 12px;
  font-weight: 750;

  span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #00b5ff;
  }
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Metric = styled.div`
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.055);

  b {
    display: block;
    color: #fff;
    font-size: 34px;
    line-height: 1;
  }

  span {
    display: block;
    margin-top: 8px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    font-weight: 750;
  }
`;

const DashboardGrid = styled.div`
  margin-top: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  gap: 16px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const SectionPanel = styled.div`
  min-width: 0;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.045);
`;

const SectionHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h3 {
    color: #fff;
    font-size: 18px;
  }

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 800;
  }
`;

const ProjectStack = styled.div`
  display: grid;
  gap: 10px;
`;

const ProjectCard = styled.button`
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 13px;
  background: rgba(0, 0, 0, 0.22);
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(0, 181, 255, 0.34);
    background: rgba(0, 181, 255, 0.08);
  }

  b {
    display: block;
    color: #fff;
  }

  small {
    display: block;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.56);
  }
`;

const EmptyState = styled.div`
  padding: 14px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 13px;
  background: rgba(0, 0, 0, 0.18);

  b {
    display: block;
    color: rgba(255, 255, 255, 0.84);
  }

  span {
    display: block;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    line-height: 1.45;
  }
`;

const TaskStack = styled.div`
  display: grid;
  gap: 9px;
`;

const CompactTask = styled.div`
  padding: 12px;
  border-left: 3px solid rgba(0, 181, 255, 0.9);
  border-radius: 11px;
  background: rgba(0, 0, 0, 0.26);

  &[data-due="soon"] {
    border-left-color: #ffa657;
  }

  &[data-due="late"] {
    border-left-color: #ff6b6b;
  }

  b {
    display: block;
    color: #fff;
  }

  span {
    display: block;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.56);
    font-size: 12px;
  }
`;

const TaskForm = styled.form`
  display: grid;
  grid-template-columns: 96px minmax(180px, 1fr) 140px 108px 106px 70px 142px 84px;
  gap: 9px;
  margin-bottom: 16px;

  input,
  select,
  textarea {
    min-width: 0;
    height: 40px;
    padding: 0 11px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 11px;
    background: rgba(0, 0, 0, 0.46);
    color: #fff;
    font: inherit;
  }

  textarea {
    grid-column: 1 / -2;
    min-height: 40px;
    padding-top: 10px;
    resize: vertical;
  }

  @media (max-width: 1220px) {
    grid-template-columns: repeat(3, 1fr);

    textarea {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const StatusColumns = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
    overflow: visible;
  }
`;

const TaskColumn = styled.div`
  min-width: 220px;
  display: grid;
  align-content: start;
  gap: 10px;

  @media (max-width: 760px) {
    min-width: 0;
  }
`;

const ColumnTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  font-weight: 850;

  span {
    color: rgba(255, 255, 255, 0.48);
    font-size: 12px;
  }
`;

const TaskCard = styled.div`
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);

  &[data-priority="high"] {
    border-color: rgba(255, 166, 87, 0.44);
  }
`;

const TaskTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const CodeInput = styled.input`
  width: 86px;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #00b5ff;
  font-size: 11px;
  font-weight: 850;
`;

const Due = styled.span`
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.66);
  font-size: 11px;
  font-weight: 750;

  &[data-state="soon"] {
    color: #ffd199;
    background: rgba(255, 166, 87, 0.12);
  }

  &[data-state="late"] {
    color: #ffb1b1;
    background: rgba(255, 107, 107, 0.12);
  }
`;

const TaskTitleInput = styled.input`
  display: block;
  width: 100%;
  margin-top: 9px;
  border: 0;
  outline: none;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
`;

const TaskMetaForm = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px 58px;
  gap: 6px;
  margin-top: 10px;

  input,
  select {
    min-width: 0;
    height: 28px;
    padding: 0 7px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    font-weight: 750;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) 92px;

    input:last-child {
      grid-column: 1 / -1;
    }
  }
`;

const TaskNotesInput = styled.textarea`
  width: 100%;
  min-height: 58px;
  margin-top: 10px;
  padding: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  outline: none;
  resize: vertical;
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 255, 255, 0.62);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
`;

const ProgressBar = styled.div`
  height: 5px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);

  span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #00b5ff, #ffffff);
  }
`;

const TaskActions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 112px 34px;
  gap: 7px;
  margin-top: 12px;

  select,
  input {
    min-width: 0;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
  }

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr) 78px 34px;

    input[type="date"] {
      grid-column: 1 / 3;
    }
  }
`;

const GhostButton = styled.button`
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;

  span {
    font-size: 18px;
  }
`;

const DocsLayout = styled.div`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const DocList = styled.div`
  display: grid;
  align-content: start;
  gap: 10px;
`;

const DocButton = styled.button`
  display: grid;
  gap: 5px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.055);
  color: #fff;
  text-align: left;

  span {
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
  }

  &[data-active] {
    border-color: rgba(0, 181, 255, 0.42);
    background: rgba(0, 181, 255, 0.12);
  }
`;

const DocEditor = styled.form`
  display: grid;
  gap: 14px;
`;

const DocControls = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px 132px;
  gap: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const CheckLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  font-weight: 750;
`;

const LinkForm = styled.form`
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(220px, 1.4fr) 150px 140px 92px;
  gap: 9px;
  margin-bottom: 16px;

  input {
    min-width: 0;
    height: 40px;
    padding: 0 11px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 11px;
    background: rgba(0, 0, 0, 0.46);
    color: #fff;
    font: inherit;
  }

  @media (max-width: 980px) {
    grid-template-columns: 1fr 1fr;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const LinkGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const LinkCard = styled.div`
  position: relative;
  padding: 16px 52px 16px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);

  a {
    display: grid;
    gap: 5px;
  }

  b {
    color: #fff;
  }

  a > span {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.56);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    position: absolute;
    top: 14px;
    right: 14px;
  }
`;

const LinkMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;

  span {
    padding: 4px 7px;
    border-radius: 999px;
    background: rgba(0, 181, 255, 0.1);
    color: #b7f0ff;
    font-size: 11px;
    font-weight: 750;
  }
`;

const RoomGrid = styled.div`
  display: grid;
  gap: 10px;
`;

const Bubble = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
`;

const Avatar = styled.div`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #fff;
  color: #000;
  font-size: 12px;
  font-weight: 900;
`;

const BubbleText = styled.div`
  display: grid;
  gap: 4px;

  b {
    color: #fff;
  }

  span {
    color: rgba(255, 255, 255, 0.66);
    line-height: 1.5;
  }
`;

const MessageForm = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px;
  gap: 9px;
  margin-top: 14px;

  input {
    height: 42px;
    padding: 0 13px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.46);
    color: #fff;
    font: inherit;
  }
`;
