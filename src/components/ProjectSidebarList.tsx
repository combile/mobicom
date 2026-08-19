"use client";

import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import type { TasksData } from "@/lib/use-tasks-data";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
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
          role="button"
          tabIndex={0}
          aria-pressed={p.id === data.selectedProjectId}
          data-active={p.id === data.selectedProjectId || undefined}
          onClick={() => data.setSelectedProjectId(p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              data.setSelectedProjectId(p.id);
            }
          }}
        >
          <ProjectItemName>{p.name}</ProjectItemName>
          {p.taskTotal > 0 && (
            <ProjectItemMeta>
              <span>
                {p.taskDone}/{p.taskTotal}
              </span>
              {/* only shown when something is actually late, so the sidebar
                  stays quiet on healthy projects */}
              {p.taskOverdue > 0 && <OverdueDot title={`기한 초과 ${p.taskOverdue}건`} />}
            </ProjectItemMeta>
          )}
        </ProjectItem>
      ))}
      <AddButton type="button" onClick={data.openCreateProject}>
        <span className="material-symbols-outlined">add</span>
        프로젝트 추가
      </AddButton>

      {data.showCreateProject && <CreateProjectModal data={data} />}
    </Sidebar>
  );
}

/**
 * Module scope, not inlined in ProjectSidebarList: a component defined inside
 * the parent is a new type on every parent render, so React remounts it and
 * the focused input loses focus mid-typing. Mounting only when the modal opens
 * is also what lets the enter animation fire at the right moment.
 */
function CreateProjectModal({ data }: { data: TasksData }) {
  const { overlayRef, cardRef } = useModalEnterAnimation();
  useCloseOnEscape(() => data.setShowCreateProject(false));

  return createPortal(
    <ModalOverlay ref={overlayRef} onClick={() => data.setShowCreateProject(false)}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
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
          <button type="button" onClick={data.handleCreateProject} disabled={data.creatingProject}>
            {data.creatingProject ? "만드는 중..." : "만들기"}
          </button>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>,
    document.body,
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

const ProjectItemName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ProjectItemMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 11px;
  color: #767676;
`;

const OverdueDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff6767;
`;

const ProjectItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  color: #d4d4d4;
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &:focus-visible {
    outline: 2px solid #00b5ff;
    outline-offset: -2px;
  }

  &[data-active] {
    background: rgba(0, 181, 255, 0.15);
    color: #00b5ff;
  }
`;

/**
 * Reads as the next row in the project list rather than a boxed control: same
 * padding, radius, and hover fill as ProjectItem, just dimmed until hovered.
 * The old dashed outline drew more attention than the projects above it.
 */
const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  margin-top: 4px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #9a9a9a;
  font-size: 14px;
  cursor: pointer;
  text-align: left;

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #00b5ff;
  }
`;
