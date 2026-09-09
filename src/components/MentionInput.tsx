"use client";

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
  detectMentionTrigger,
  splitTypedMentions,
  mentionEndingAt,
} from "@/lib/mobion-mentions";

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
  const highlightRef = useRef<HTMLDivElement | null>(null);

  // The highlight layer has to sit exactly under the input's own glyphs, and
  // this input is styled by whoever places it — chat and task comments give it
  // different padding and borders. Rather than duplicating either, the real
  // values are read off the live element and copied across, so the layer keeps
  // matching if a parent's styling changes.
  useEffect(() => {
    const input = inputRef.current;
    const layer = highlightRef.current;
    if (!input || !layer) return;

    const cs = getComputedStyle(input);
    for (const prop of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "letterSpacing",
      "lineHeight",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRadius",
      "textIndent",
    ] as const) {
      layer.style[prop] = cs[prop];
    }
    // The border takes up space in the input's box model, so the layer needs
    // one too — invisible, purely to keep the text starting in the same place.
    layer.style.borderStyle = "solid";
    layer.style.borderColor = "transparent";

    // The caret would vanish along with the text, so its colour is captured
    // before the glyphs are hidden.
    input.style.caretColor = cs.color;
    input.style.color = "transparent";
  }, []);

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

    // Backspace removes a whole mention rather than one letter of it. A
    // mention is one thing to the reader, so deleting it a character at a
    // time leaves "@우은" — a name that is no longer anyone's, and which the
    // send step would quietly stop recognising as a mention.
    if (e.key === "Backspace" && !e.nativeEvent.isComposing) {
      const input = e.currentTarget;
      const caret = input.selectionStart ?? 0;
      // Only when nothing is selected — a selection already says exactly what
      // to delete, and overriding that would be surprising.
      if (caret > 0 && caret === input.selectionEnd) {
        const before = value.slice(0, caret);
        const hit = mentionEndingAt(before, users);
        if (hit) {
          e.preventDefault();
          const next = value.slice(0, caret - hit.length) + value.slice(caret);
          onChange(next);
          // Put the caret where the mention was, on the next frame — React has
          // not rewritten the input's value yet at this point.
          requestAnimationFrame(() => {
            const pos = caret - hit.length;
            inputRef.current?.setSelectionRange(pos, pos);
          });
          setTrigger(null);
          return;
        }
      }
    }

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
      {/* An <input> cannot style part of its own text, so the mentions are
          painted on a layer underneath that mirrors the same string, and the
          input's own glyphs are made transparent. Everything that affects
          glyph position — font, padding, border — has to match exactly or the
          highlight drifts out from under the words; that is why both sides
          inherit from the same Field mixin below. */}
      <Highlight ref={highlightRef} aria-hidden="true">
        {splitTypedMentions(value, users).map((seg, i) =>
          seg.type === "mention" ? (
            <TypedMention key={i}>{seg.content}</TypedMention>
          ) : (
            <span key={i}>{seg.content}</span>
          ),
        )}
      </Highlight>
      <input
        ref={inputRef}
        value={value}
        // The layer underneath does not scroll with the input on its own, so a
        // line longer than the box would leave the highlight behind.
        onScroll={(e) => {
          if (highlightRef.current) {
            highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
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

  /* The input's own glyphs are transparent (set in JS once the caret colour has
     been captured), so the selection needs a visible background of its own —
     otherwise selecting text looks like nothing happened. */
  input::selection {
    background: var(--accent-soft, rgba(59, 130, 246, 0.3));
  }
`;

/* Sits under the input, mirroring the same string. pointer-events: none keeps
   every click, drag and selection going to the real input above it. */
const Highlight = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  white-space: pre;
  pointer-events: none;
  color: var(--text-strong);
  box-sizing: border-box;
  display: flex;
  align-items: center;
`;

const TypedMention = styled.span`
  color: var(--accent);
  font-weight: 700;
  background: var(--accent-soft, rgba(59, 130, 246, 0.14));
  border-radius: 4px;
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
