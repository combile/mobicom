"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { detectMentionTrigger } from "@/lib/mobion-mentions";

type MentionUser = { id: string; name: string };

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  users: MentionUser[];
  /** Comments reuse this input, and their prompt differs from chat's. */
  placeholder?: string;
};

const MAX_CANDIDATES = 8;

export default function MentionInput({
  value,
  onChange,
  onSend,
  users,
  placeholder = "메시지 입력... (@로 멘션)",
}: MentionInputProps) {
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const candidates = trigger
    ? users
        .filter((u) => u.name.toLowerCase().includes(trigger.query.toLowerCase()))
        .slice(0, MAX_CANDIDATES)
    : [];

  useEffect(() => {
    if (!trigger) return;
    function handleClickOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setTrigger(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [trigger]);

  function updateTrigger(nextValue: string, caret: number) {
    setTrigger(detectMentionTrigger(nextValue, caret));
    setActiveIndex(0);
  }

  function selectCandidate(user: MentionUser) {
    if (!trigger) return;
    const before = value.slice(0, trigger.start);
    const after = value.slice(trigger.start + 1 + trigger.query.length);
    // Plain "@이름" while typing. The id is attached on send by
    // encodeMentions — an <input> shows text literally, so inserting the stored
    // "@[uuid:이름]" form here put a uuid in the middle of the sentence being
    // written.
    onChange(`${before}@${user.name} ${after}`);
    setTrigger(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // While an IME is composing (Korean, Japanese, Chinese), the Enter that
    // commits the composition fires its own keydown before the one the person
    // means as "send". Acting on the first sent every Korean message twice —
    // two rows really were stored, so a reload still showed both. Only Enter is
    // guarded: arrow keys and Escape must keep driving the mention dropdown
    // mid-composition, which is exactly when it is open.
    if (e.key === "Enter" && e.nativeEvent.isComposing) return;

    if (trigger && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectCandidate(candidates[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        setTrigger(null);
        return;
      }
    }
    if (e.key === "Enter") onSend();
  }

  return (
    <Root ref={rootRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          updateTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {trigger && candidates.length > 0 && (
        <Dropdown role="listbox">
          {candidates.map((u, i) => (
            <Candidate
              key={u.id}
              type="button"
              data-active={i === activeIndex || undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                selectCandidate(u);
              }}
            >
              {u.name}
            </Candidate>
          ))}
        </Dropdown>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  display: flex;
  flex: 1;
`;

const Dropdown = styled.div`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid var(--border-strong);
`;

const Candidate = styled.button`
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;

  &:hover,
  &[data-active] {
    background: var(--surface-hover);
    color: var(--accent);
  }
`;
