"use client";

import styled from "@emotion/styled";
import { useEffect, useState } from "react";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import { ModalOverlay, ModalCard, ModalTitle, Field, ModalActions } from "./modal-styles";

/**
 * Turns a chat message into a task without leaving the conversation.
 *
 * The projects screen has its own, richer create-task modal, but it is wired
 * into useTasksData — a hook that only runs while that screen is open. Reaching
 * it from chat used to mean switching screens first, so pressing the button
 * threw you out of the conversation before you had agreed to anything.
 *
 * This asks for the three things that cannot be filled in later from context —
 * which project, what to call it, and any detail — and leaves assignee and due
 * date to the task screen, which it opens once the task exists.
 */

type Project = { id: string; name: string };

export default function ChatTaskModal(props: {
  excerpt: string;
  channelId: string;
  messageId: string;
  /** Called with the new task's project once it has been created. */
  onCreated: (projectId: string) => void;
  onClose: () => void;
}) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(props.onClose);
  useCloseOnEscape(close);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState(props.excerpt.slice(0, 80));
  const [description, setDescription] = useState(
    props.excerpt.length > 80 ? props.excerpt : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mobion/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: Project[] }) => {
        const list = data.projects ?? [];
        setProjects(list);
        // Preselect the only sensible default. With one project there is no
        // choice to make, and with several the first is still better than an
        // empty select that silently blocks the save button.
        setProjectId((prev) => prev || list[0]?.id || "");
      })
      .catch(() => setError("프로젝트 목록을 불러오지 못했습니다."));
  }, []);

  async function submit() {
    if (!projectId || !title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/mobion/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          // kept so the task can point back at the conversation it came from
          sourceChannelId: props.channelId,
          sourceMessageId: props.messageId,
          sourceExcerpt: props.excerpt.slice(0, 500),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "태스크를 만들지 못했습니다.");
        return;
      }
      props.onCreated(projectId);
    } catch {
      setError("태스크를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalCard ref={cardRef} onClick={(e) => e.stopPropagation()}>
        <ModalTitle>이 메시지로 태스크 만들기</ModalTitle>

        {/* The message itself, so the title can be edited into something that
            reads as work rather than as a line of conversation. */}
        <SourceNote>
          <span className="material-symbols-outlined">forum</span>
          <SourceQuote>{props.excerpt}</SourceQuote>
        </SourceNote>

        <Field>
          <label htmlFor="chat-task-project">프로젝트</label>
          <select
            id="chat-task-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.length === 0 && <option value="">프로젝트가 없습니다</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <label htmlFor="chat-task-title">제목</label>
          <input
            id="chat-task-title"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // same IME guard as everywhere else a Korean sentence meets Enter
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </Field>

        <Field>
          <label htmlFor="chat-task-description">설명 (선택)</label>
          <textarea
            id="chat-task-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Hint>담당자와 마감일은 만든 뒤 태스크 화면에서 정할 수 있습니다.</Hint>
        {error && <ErrorText>{error}</ErrorText>}

        <ModalActions>
          <CancelButton type="button" onClick={close}>
            취소
          </CancelButton>
          <SubmitButton
            type="button"
            onClick={submit}
            disabled={saving || !projectId || !title.trim()}
          >
            {saving ? "만드는 중..." : "만들고 이동"}
          </SubmitButton>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}

const SourceNote = styled.div`
  display: flex;
  gap: 8px;
  padding: 9px 11px;
  margin-bottom: 4px;
  border-left: 2px solid var(--accent);
  border-radius: 0 8px 8px 0;
  background: var(--surface-sunken);
  font-size: 12px;
  color: var(--text-muted, #6b7280);

  .material-symbols-outlined {
    font-size: 16px;
    flex: 0 0 auto;
  }
`;

const SourceQuote = styled.div`
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
`;

const Hint = styled.p`
  margin: 0;
  font-size: 12px;
  color: var(--text-faint, #9aa0a6);
`;

const ErrorText = styled.p`
  margin: 0;
  font-size: 12px;
  color: #dc2626;
`;

const CancelButton = styled.button`
  padding: 8px 15px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text-strong);
  cursor: pointer;
`;

const SubmitButton = styled.button`
  padding: 8px 15px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: var(--on-solid);
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
`;
