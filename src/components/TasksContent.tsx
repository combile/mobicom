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

export default function TasksContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

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

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

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
          {/* Task 7/8 render milestone + task detail here, keyed on selectedProjectId */}
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
