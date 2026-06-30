"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MobionDoc, MobionMessage, MobionTask } from "@/lib/mobion-data";
import type { MobionUser } from "@/lib/mobion-auth";

gsap.registerPlugin(ScrollTrigger);

type ViewKey = "tasks" | "docs" | "room";
type AuthMode = "login" | "register";
type Workspace = {
  tasks: MobionTask[];
  docs: MobionDoc[];
  messages: MobionMessage[];
};

const EMPTY_WORKSPACE: Workspace = { tasks: [], docs: [], messages: [] };

const VIEWS: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: "tasks", label: "Tasks", icon: "account_tree" },
  { key: "docs", label: "Docs", icon: "description" },
  { key: "room", label: "Room", icon: "forum" },
];

function statusLabel(status: MobionTask["status"]) {
  return {
    now: "Now",
    next: "Next",
    review: "Review",
    done: "Done",
  }[status];
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}.${date.getDate()}`;
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
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [active, setActive] = useState<ViewKey>("tasks");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const viewAnimationKey = `${active}:${workspace.tasks.length}:${workspace.docs.length}:${workspace.messages.length}`;

  const selectedDoc = useMemo(
    () =>
      selectedDocId
        ? (workspace.docs.find((doc) => doc.id === selectedDocId) ?? null)
        : null,
    [workspace.docs, selectedDocId],
  );

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
        workspace: Workspace;
      }>("/api/mobion/workspace");
      setUser(data.user);
      setWorkspace(data.workspace);
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
        y: 42,
        autoAlpha: 0,
        duration: 0.85,
        ease: "power3.out",
        stagger: 0.1,
      });

      const cards = gsap.utils.toArray<HTMLElement>(".mobion-card");
      const workspaceEl = root.current?.querySelector(".mobion-workspace");
      if (cards.length && workspaceEl) {
        gsap.from(cards, {
          y: 36,
          autoAlpha: 0,
          duration: 0.65,
          ease: "power3.out",
          stagger: 0.07,
          scrollTrigger: { trigger: workspaceEl, start: "top 82%" },
        });
      }
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
        { y: 22, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.42, ease: "power3.out" },
      );
    },
    { scope: root, dependencies: [viewAnimationKey] },
  );

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/mobion/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      event.currentTarget.reset();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그아웃 실패");
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
        }),
      });
      setWorkspace((current) => ({
        ...current,
        tasks: [data.task, ...current.tasks],
      }));
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "태스크 생성 실패");
    } finally {
      setSaving(false);
    }
  }

  async function updateTask(task: MobionTask, status: MobionTask["status"]) {
    setError("");
    try {
      const data = await requestJson<{ task: MobionTask }>(
        `/api/mobion/tasks/${task.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      setWorkspace((current) => ({
        ...current,
        tasks: current.tasks.map((item) => (item.id === task.id ? data.task : item)),
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
    const title = String(form.get("title") ?? "");
    const body = String(form.get("body") ?? "");
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ doc: MobionDoc }>(
        id ? `/api/mobion/docs/${id}` : "/api/mobion/docs",
        {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify({ title, body }),
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
      setWorkspace((current) => {
        const docs = current.docs.filter((doc) => doc.id !== id);
        return { ...current, docs };
      });
      setSelectedDocId((current) => (current === id ? null : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "문서 삭제 실패");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "메시지 전송 실패");
    }
  }

  return (
    <Root ref={root}>
      <Glow aria-hidden />
      <Container>
        <Hero className="mobion-rise">
          <TitleBlock>
            <Eyebrow>
              <span className="material-symbols-outlined">bolt</span>
              Live Lab Workspace
            </Eyebrow>
            <Title>
              Mobi:<Accent>ON</Accent>
            </Title>
            <Lead>
              연구 과제, 실험 문서, 팀 대화를 PostgreSQL에 저장하는 모비콤 전용
              협업 페이지입니다.
            </Lead>
          </TitleBlock>
          <StatusRail aria-label="Mobi:ON status">
            <StatusItem>
              <Strong>{workspace.tasks.length}</Strong>
              <span>Tasks</span>
            </StatusItem>
            <StatusItem>
              <Strong>{workspace.docs.length}</Strong>
              <span>Docs</span>
            </StatusItem>
            <StatusItem>
              <Strong>{workspace.messages.length}</Strong>
              <span>Messages</span>
            </StatusItem>
          </StatusRail>
        </Hero>

        {loading ? (
          <StatePanel className="mobion-rise">Mobi:ON 연결 중...</StatePanel>
        ) : !user ? (
          <AuthGrid className="mobion-rise">
            <AuthCopy>
              <b>Account required</b>
              <p>
                Mobi:ON은 연구실 내부 작업공간입니다. 가입하거나 로그인하면 개인
                워크스페이스가 PostgreSQL에 생성됩니다.
              </p>
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
          <Workspace className="mobion-workspace mobion-rise">
            <Sidebar>
              <Brand>
                <Mark>{user.name.slice(0, 2).toUpperCase()}</Mark>
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
                    data-cursor="hover"
                  >
                    <span className="material-symbols-outlined">{view.icon}</span>
                    <span>{view.label}</span>
                  </ViewButton>
                ))}
              </ViewList>
              <Secondary type="button" onClick={logout}>
                Logout
              </Secondary>
            </Sidebar>

            <MainPanel className="mobion-view">
              {error && <ErrorText>{error}</ErrorText>}
              {active === "tasks" && (
                <>
                  <PanelTop>
                    <PanelTitle>Project Tasks</PanelTitle>
                    <LiveBadge>
                      <span />
                      Synced
                    </LiveBadge>
                  </PanelTop>
                  <TaskForm onSubmit={createTask}>
                    <input name="code" placeholder="MAC-24" />
                    <input name="title" placeholder="New experiment task" />
                    <select name="status" defaultValue="now">
                      <option value="now">Now</option>
                      <option value="next">Next</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                    <input name="owner" placeholder="EW" />
                    <input name="progress" type="number" min="0" max="100" placeholder="0" />
                    <Primary type="submit" disabled={saving}>
                      Add
                    </Primary>
                  </TaskForm>
                  <BoardGrid>
                    {workspace.tasks.map((task) => (
                      <TaskRow key={task.id} className="mobion-card">
                        <TaskMeta>
                          <Code>{task.code}</Code>
                          <TaskTitle>{task.title}</TaskTitle>
                        </TaskMeta>
                        <select
                          value={task.status}
                          onChange={(event) =>
                            void updateTask(
                              task,
                              event.target.value as MobionTask["status"],
                            )
                          }
                        >
                          <option value="now">Now</option>
                          <option value="next">Next</option>
                          <option value="review">Review</option>
                          <option value="done">Done</option>
                        </select>
                        <Avatar>{task.owner || "MO"}</Avatar>
                        <GhostButton type="button" onClick={() => void deleteTask(task.id)}>
                          <span className="material-symbols-outlined">delete</span>
                        </GhostButton>
                        <Progress aria-label={`${task.title} progress`}>
                          <span style={{ width: `${task.progress}%` }} />
                        </Progress>
                        <TaskFooter>{statusLabel(task.status)} · {shortDate(task.updated_at)}</TaskFooter>
                      </TaskRow>
                    ))}
                  </BoardGrid>
                </>
              )}

              {active === "docs" && (
                <DocsLayout>
                  <DocList>
                    <PanelTitle>Docs</PanelTitle>
                    {workspace.docs.map((doc) => (
                      <DocButton
                        key={doc.id}
                        type="button"
                        data-active={doc.id === selectedDoc?.id || undefined}
                        onClick={() => setSelectedDocId(doc.id)}
                      >
                        <b>{doc.title}</b>
                        <span>{shortDate(doc.updated_at)}</span>
                      </DocButton>
                    ))}
                    <Secondary type="button" onClick={() => setSelectedDocId(null)}>
                      New doc
                    </Secondary>
                  </DocList>
                  <DocEditor onSubmit={saveDoc} className="mobion-card">
                    <input type="hidden" name="id" value={selectedDoc?.id ?? ""} />
                    <Field>
                      <label htmlFor="doc-title">Title</label>
                      <input
                        id="doc-title"
                        key={`title-${selectedDoc?.id ?? "new"}`}
                        name="title"
                        defaultValue={selectedDoc?.title ?? ""}
                        placeholder="Experiment protocol"
                      />
                    </Field>
                    <Field>
                      <label htmlFor="doc-body">Body</label>
                      <textarea
                        id="doc-body"
                        key={`body-${selectedDoc?.id ?? "new"}`}
                        name="body"
                        defaultValue={selectedDoc?.body ?? ""}
                        placeholder="Write lab notes..."
                      />
                    </Field>
                    <ActionRow>
                      <Primary type="submit" disabled={saving}>
                        Save doc
                      </Primary>
                      {selectedDoc && (
                        <Secondary
                          type="button"
                          onClick={() => void deleteDoc(selectedDoc.id)}
                        >
                          Delete
                        </Secondary>
                      )}
                    </ActionRow>
                  </DocEditor>
                </DocsLayout>
              )}

              {active === "room" && (
                <>
                  <PanelTop>
                    <PanelTitle>Team Room</PanelTitle>
                    <LiveBadge>
                      <span />
                      {workspace.messages.length} messages
                    </LiveBadge>
                  </PanelTop>
                  <RoomGrid>
                    {workspace.messages.map((message) => (
                      <Bubble key={message.id} className="mobion-card">
                        <Avatar>{message.author.slice(0, 2).toUpperCase()}</Avatar>
                        <BubbleText>
                          <b>{message.author}</b>
                          <span>{message.body}</span>
                        </BubbleText>
                      </Bubble>
                    ))}
                  </RoomGrid>
                  <MessageForm onSubmit={sendMessage}>
                    <input name="body" placeholder="Share an update..." />
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
  padding: clamp(135px, 14.4vh, 189px) 0 108px;
  overflow: hidden;
`;

const Glow = styled.div`
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(44% 38% at 50% 28%, rgba(0, 181, 255, 0.18), rgba(0, 181, 255, 0) 72%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 46%);
`;

const Container = styled.div`
  max-width: 1613px;
  margin: 0 auto;
  padding: 0 clamp(22px, 3.6vw, 58px);
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 420px);
  gap: clamp(28px, 5vw, 80px);
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
  gap: 10px;
  color: #00b5ff;
  font-size: clamp(14px, 1.2vw, 18px);
  font-weight: 700;
`;

const Title = styled.h1`
  margin-top: 14px;
  font-size: clamp(64px, 10vw, 154px);
  font-weight: 900;
  line-height: 0.92;
  color: #fff;
`;

const Accent = styled.span`
  color: #00b5ff;
`;

const Lead = styled.p`
  max-width: 850px;
  margin-top: 24px;
  color: rgba(255, 255, 255, 0.82);
  font-size: clamp(16px, 1.65vw, 25px);
  font-weight: 250;
  line-height: 1.5;
  word-break: keep-all;
`;

const StatusRail = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
`;

const StatusItem = styled.div`
  padding: 18px 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  text-align: center;

  span {
    display: block;
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
  }
`;

const Strong = styled.b`
  color: #fff;
  font-size: clamp(22px, 2.3vw, 34px);
`;

const StatePanel = styled.div`
  margin-top: clamp(42px, 6vh, 76px);
  padding: 40px;
  border-radius: 28px;
  background: rgba(9, 12, 16, 0.82);
  color: #fff;
`;

const AuthGrid = styled.section`
  margin-top: clamp(42px, 6vh, 76px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 460px);
  gap: 22px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const AuthCopy = styled.div`
  padding: clamp(28px, 4vw, 52px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: rgba(9, 12, 16, 0.82);

  b {
    color: #fff;
    font-size: clamp(28px, 4vw, 52px);
  }

  p {
    margin-top: 18px;
    color: rgba(255, 255, 255, 0.68);
    font-size: clamp(15px, 1.5vw, 22px);
    line-height: 1.55;
  }
`;

const AuthPanel = styled.form`
  display: grid;
  gap: 16px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  background: rgba(0, 0, 0, 0.46);
`;

const Segmented = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 6px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);

  button {
    height: 42px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: rgba(255, 255, 255, 0.68);
    font-weight: 800;
  }

  button[data-active] {
    background: #00b5ff;
    color: #00131c;
  }
`;

const Field = styled.div`
  display: grid;
  gap: 8px;

  label {
    color: rgba(255, 255, 255, 0.62);
    font-size: 13px;
    font-weight: 700;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.48);
    color: #fff;
    font: inherit;
    outline: none;
  }

  input {
    height: 50px;
    padding: 0 16px;
  }

  textarea {
    min-height: 240px;
    padding: 16px;
    resize: vertical;
    line-height: 1.5;
  }
`;

const Primary = styled.button`
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: #00b5ff;
  color: #00131c;
  font-weight: 900;

  &:disabled {
    opacity: 0.55;
  }
`;

const Secondary = styled.button`
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-weight: 800;
`;

const ErrorText = styled.p`
  margin: 14px 0 0;
  color: #ff8d8d;
  font-weight: 700;
`;

const Workspace = styled.section`
  margin-top: clamp(42px, 6vh, 76px);
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  min-height: 640px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 28px;
  overflow: hidden;
  background: rgba(9, 12, 16, 0.82);
  box-shadow: 0 38px 90px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(18px);

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 24px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.36);
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Mark = styled.div`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #00b5ff;
  color: #00131c;
  font-weight: 900;
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
    font-weight: 800;
  }

  small {
    color: rgba(255, 255, 255, 0.5);
  }
`;

const ViewList = styled.div`
  display: grid;
  gap: 8px;
`;

const ViewButton = styled.button`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: rgba(255, 255, 255, 0.76);
  text-align: left;

  &[data-active],
  &:hover {
    border-color: rgba(0, 181, 255, 0.36);
    background: rgba(0, 181, 255, 0.12);
    color: #fff;
  }
`;

const MainPanel = styled.div`
  min-width: 0;
  padding: clamp(22px, 2.6vw, 38px);
`;

const PanelTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
`;

const PanelTitle = styled.h2`
  color: #fff;
  font-size: clamp(24px, 2.6vw, 38px);
`;

const LiveBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  color: #b7f0ff;
  background: rgba(0, 181, 255, 0.12);
  font-size: 13px;
  font-weight: 700;

  span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #00b5ff;
  }
`;

const TaskForm = styled.form`
  display: grid;
  grid-template-columns: 110px minmax(180px, 1fr) 120px 90px 90px 80px;
  gap: 10px;
  margin-bottom: 18px;

  input,
  select {
    min-width: 0;
    height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.48);
    color: #fff;
    font: inherit;
  }

  @media (max-width: 1040px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
`;

const BoardGrid = styled.div`
  display: grid;
  gap: 12px;
`;

const TaskRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px 44px 42px;
  gap: 14px;
  align-items: center;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.055);

  select {
    height: 38px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.48);
    color: #fff;
  }

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const TaskMeta = styled.div`
  min-width: 0;
`;

const Code = styled.span`
  color: #00b5ff;
  font-size: 12px;
  font-weight: 800;
`;

const TaskTitle = styled.b`
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: clamp(16px, 1.4vw, 20px);
`;

const Avatar = styled.div`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #fff;
  color: #000;
  font-size: 12px;
  font-weight: 900;
`;

const GhostButton = styled.button`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
`;

const Progress = styled.div`
  grid-column: 1 / -1;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);

  span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #00b5ff, #ffffff);
  }
`;

const TaskFooter = styled.span`
  grid-column: 1 / -1;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
`;

const DocsLayout = styled.div`
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 18px;

  @media (max-width: 820px) {
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
  gap: 4px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.055);
  color: #fff;
  text-align: left;

  span {
    color: rgba(255, 255, 255, 0.48);
    font-size: 12px;
  }

  &[data-active] {
    border-color: rgba(0, 181, 255, 0.42);
    background: rgba(0, 181, 255, 0.12);
  }
`;

const DocEditor = styled.form`
  display: grid;
  gap: 16px;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`;

const RoomGrid = styled.div`
  display: grid;
  gap: 12px;
`;

const Bubble = styled.div`
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
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
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 10px;
  margin-top: 16px;

  input {
    height: 46px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.48);
    color: #fff;
    font: inherit;
  }
`;
