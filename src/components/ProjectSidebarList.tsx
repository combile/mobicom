"use client";

import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import type { TasksData } from "@/lib/use-tasks-data";
import {
  ModalOverlay,
  ModalCard,
  ModalTitle,
  Field,
  ErrorText,
  ModalActions,
} from "./modal-styles";

export default function ProjectSidebarList({ data }: { data: TasksData }) {
  return (
    <Sidebar>
      <SectionTitle>프로젝트</SectionTitle>
      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}
      {data.projects.map((p) => (
        <ProjectItem
          key={p.id}
          data-active={p.id === data.selectedProjectId || undefined}
          onClick={() => data.setSelectedProjectId(p.id)}
        >
          {p.name}
        </ProjectItem>
      ))}
      <AddButton type="button" onClick={data.openCreateProject}>
        <span className="material-symbols-outlined">add</span>
        프로젝트 추가
      </AddButton>

      {data.showCreateProject &&
        createPortal(
          <ModalOverlay onClick={() => data.setShowCreateProject(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
              <ModalTitle>새 프로젝트 만들기</ModalTitle>
              <Field>
                <label htmlFor="new-project-name">프로젝트 이름</label>
                <input
                  id="new-project-name"
                  value={data.newProjectName}
                  onChange={(e) => data.setNewProjectName(e.target.value)}
                />
              </Field>
              <Field>
                <label htmlFor="new-project-description">설명</label>
                <input
                  id="new-project-description"
                  value={data.newProjectDescription}
                  onChange={(e) => data.setNewProjectDescription(e.target.value)}
                  placeholder="프로젝트 설명 (선택)"
                />
              </Field>
              {data.createProjectError && <ErrorText>{data.createProjectError}</ErrorText>}
              <ModalActions>
                <button type="button" onClick={() => data.setShowCreateProject(false)}>
                  취소
                </button>
                <button
                  type="button"
                  onClick={data.handleCreateProject}
                  disabled={data.creatingProject}
                >
                  {data.creatingProject ? "만드는 중..." : "만들기"}
                </button>
              </ModalActions>
            </ModalCard>
          </ModalOverlay>,
          document.body,
        )}
    </Sidebar>
  );
}

const Sidebar = styled.div`
  width: 240px;
  flex-shrink: 0;
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    color: #00b5ff;
    border-color: #00b5ff;
  }
`;
