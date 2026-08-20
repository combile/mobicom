"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";

export type SearchResult = {
  kind: "project" | "task" | "milestone" | "contest";
  id: string;
  title: string;
  subtitle: string | null;
  projectId: string | null;
  status: string | null;
  url: string | null;
};

const KIND_LABEL: Record<SearchResult["kind"], string> = {
  project: "프로젝트",
  task: "태스크",
  milestone: "마일스톤",
  contest: "대회",
};

const KIND_ICON: Record<SearchResult["kind"], string> = {
  project: "folder",
  task: "check_circle",
  milestone: "flag",
  contest: "emoji_events",
};

/**
 * Search across every project at once.
 *
 * The task filter that already existed only narrowed the project you had open,
 * which cannot answer "where was that thing" — and that is the question, since
 * the answer is normally somewhere you are not looking.
 *
 * Results are not grouped under headings. There are at most a couple of dozen,
 * the kind is on every row, and headings would push the first result down the
 * screen for nothing.
 */
export default function CommandPalette({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}) {
  const { overlayRef, cardRef, close } = useModalEnterAnimation(onClose);
  useCloseOnEscape(close);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    // Debounced, and every response checks whether it is still the current one:
    // typing fast otherwise lets an earlier, slower request land last and
    // overwrite the results for what was actually typed.
    let current = true;
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/mobion/search?q=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => {
          if (!current) return;
          setResults(data.results ?? []);
          setActive(0);
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q]);

  // keeps the highlighted row on screen when arrowing past the fold
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      onSelect(results[active]);
      close();
    }
  }

  return createPortal(
    <Overlay ref={overlayRef} onClick={close}>
      <Card ref={cardRef} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <SearchRow>
          <span className="material-symbols-outlined">search</span>
          <SearchInput
            ref={inputRef}
            value={q}
            placeholder="프로젝트, 태스크, 마일스톤, 대회 검색"
            onChange={(e) => setQ(e.target.value)}
          />
          <Hint>ESC</Hint>
        </SearchRow>

        <Results ref={listRef}>
          {q.trim().length < 2 && <Prompt>두 글자 이상 입력하세요</Prompt>}
          {q.trim().length >= 2 && !loading && results.length === 0 && (
            <Prompt>일치하는 항목이 없습니다</Prompt>
          )}
          {results.map((r, i) => (
            <Row
              key={`${r.kind}-${r.id}`}
              type="button"
              data-active={i === active}
              // the pointer highlight follows the keyboard cursor rather than
              // fighting it, so Enter always takes what is highlighted
              onMouseMove={() => setActive(i)}
              onClick={() => {
                onSelect(r);
                close();
              }}
            >
              <RowIcon data-kind={r.kind}>
                <span className="material-symbols-outlined">{KIND_ICON[r.kind]}</span>
              </RowIcon>
              <RowTitle data-done={r.status === "done" || undefined}>{r.title}</RowTitle>
              {r.subtitle && <RowSub>{r.subtitle}</RowSub>}
              <RowKind>{KIND_LABEL[r.kind]}</RowKind>
            </Row>
          ))}
        </Results>

        <Foot>
          <FootKey>↑↓</FootKey> 이동
          <FootKey>Enter</FootKey> 열기
        </Foot>
      </Card>
    </Overlay>,
    document.body,
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  /* not centred: the list grows downward, and a centred box jumps as it does */
  padding-top: 12vh;
  background: var(--overlay);
`;

const Card = styled.div`
  width: min(560px, calc(100% - 40px));
  max-height: 62vh;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  box-shadow: var(--shadow-card);
  overflow: hidden;
`;

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--border);

  > .material-symbols-outlined {
    font-size: 19px;
    color: var(--text-faint);
  }
`;

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  outline: none;

  &::placeholder {
    color: var(--text-faint);
  }
`;

const Hint = styled.span`
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-faint);
  font-size: 10px;
`;

const Results = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 6px;
`;

const Prompt = styled.p`
  padding: 26px 10px;
  text-align: center;
  color: var(--text-faint);
  font-size: 13px;
`;

const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &[data-active="true"] {
    background: var(--surface-active);
  }
`;

const RowIcon = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  color: var(--accent);

  .material-symbols-outlined {
    font-size: 17px;
  }

  &[data-kind="milestone"] {
    color: var(--milestone);
  }

  &[data-kind="contest"] {
    color: var(--warn);
  }

  &[data-kind="project"] {
    color: var(--text-muted);
  }
`;

const RowTitle = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[data-done] {
    color: var(--text-faint);
    text-decoration: line-through;
  }
`;

const RowSub = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-faint);
  font-size: 12px;
`;

const RowKind = styled.span`
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-faint);
  font-size: 11px;
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  color: var(--text-faint);
  font-size: 11px;
`;

const FootKey = styled.kbd`
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: inherit;

  & + & {
    margin-left: 10px;
  }
`;
