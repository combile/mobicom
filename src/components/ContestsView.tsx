"use client";

import styled from "@emotion/styled";
import type { ContestsData } from "@/lib/use-contests-data";
import { dueState } from "@/lib/use-tasks-data";
import { ErrorText } from "./modal-styles";

/**
 * Collected contest postings.
 *
 * Marking interest is the only write here — it is what puts a posting on the
 * schedule. Everything else arrives from a collector, so there is nothing to
 * create or edit by hand.
 */
export default function ContestsView({ data }: { data: ContestsData }) {
  return (
    <Main>
      <Header>
        <Title>대회</Title>
        {data.interestedCount > 0 && <Tag>관심 {data.interestedCount}</Tag>}
        {data.closingSoon > 0 && <Tag data-tone="soon">마감 임박 {data.closingSoon}</Tag>}
        <Spacer />
        <SearchWrap>
          <span className="material-symbols-outlined">search</span>
          <SearchInput
            type="search"
            value={data.search}
            onChange={(e) => data.setSearch(e.target.value)}
            placeholder="대회명·주최·태그"
            aria-label="대회 검색"
          />
        </SearchWrap>
        <Toggle
          type="button"
          data-active={data.onlyInterested || undefined}
          onClick={() => data.setOnlyInterested(!data.onlyInterested)}
          aria-pressed={data.onlyInterested}
        >
          관심만
        </Toggle>
      </Header>

      {data.loadError && <ErrorText>{data.loadError}</ErrorText>}

      {/* an empty list is the expected state until a collector exists, so this
          explains the situation rather than reading as a failure */}
      {!data.loadError && data.isEmpty && !data.loading && (
        <Empty>
          <EmptyTitle>아직 수집된 대회가 없습니다</EmptyTitle>
          <EmptyHint>
            수집기가 대회 정보를 보내면 여기 쌓이고, 관심 표시한 것은 일정에 함께 나타납니다
          </EmptyHint>
        </Empty>
      )}

      {!data.loadError && !data.isEmpty && data.visible.length === 0 && (
        <Empty>
          <EmptyTitle>조건에 맞는 대회가 없습니다</EmptyTitle>
        </Empty>
      )}

      {data.visible.map((c) => {
        const tone = dueState(c.deadline, "todo");
        return (
          <Row key={c.id}>
            <StarButton
              type="button"
              data-on={c.interested || undefined}
              disabled={data.pendingId === c.id}
              onClick={() => data.toggleInterest(c)}
              aria-pressed={c.interested}
              title={c.interested ? "관심 해제 (일정에서 제외)" : "관심 표시 (일정에 추가)"}
            >
              <span className="material-symbols-outlined">
                {c.interested ? "star" : "star_border"}
              </span>
            </StarButton>

            <Body>
              <RowTop>
                <RowTitle href={c.url} target="_blank" rel="noopener noreferrer">
                  {c.title}
                </RowTitle>
                <SourceTag>{c.source}</SourceTag>
              </RowTop>
              <RowBottom>
                {c.organizer && <Meta>{c.organizer}</Meta>}
                {c.tags.map((t) => (
                  <TagChip key={t}>{t}</TagChip>
                ))}
              </RowBottom>
            </Body>

            <Deadline data-tone={tone ?? undefined}>{c.deadline ?? "마감일 없음"}</Deadline>
          </Row>
        );
      })}
    </Main>
  );
}

const Main = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  overflow-y: auto;
  padding: 20px;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: var(--text-strong);
`;

const Spacer = styled.span`
  flex: 1;
`;

const Tag = styled.span`
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;

  &[data-tone="soon"] {
    background: var(--warn-soft);
    color: var(--warn);
  }
`;

const SearchWrap = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface-sunken);
  color: var(--text-faint);

  .material-symbols-outlined {
    font-size: 16px;
  }

  &:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
`;

const SearchInput = styled.input`
  width: 170px;
  padding: 7px 0;
  border: none;
  background: transparent;
  color: var(--text-strong);
  font-size: 13px;
  outline: none;

  &::placeholder {
    color: var(--text-faint);
  }
`;

const Toggle = styled.button`
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover {
    color: var(--text);
  }

  &[data-active] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent);
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid var(--border);

  &:hover {
    border-color: var(--border-strong);
  }
`;

const StarButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;

  .material-symbols-outlined {
    font-size: 20px;
  }

  &:hover:not(:disabled) {
    background: var(--surface-hover);
  }

  &[data-on] {
    color: var(--warn);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
`;

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`;

const RowTitle = styled.a`
  color: var(--text);
  font-size: 14px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--accent);
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

const SourceTag = styled.span`
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-hover);
  color: var(--text-faint);
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
`;

const RowBottom = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
`;

const Meta = styled.span`
  color: var(--text-faint);
  font-size: 12px;
`;

const TagChip = styled.span`
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
`;

const Deadline = styled.span`
  color: var(--text-faint);
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;

  &[data-tone="overdue"] {
    color: var(--danger);
    font-weight: 600;
  }

  &[data-tone="soon"] {
    color: var(--warn);
    font-weight: 600;
  }
`;

const Empty = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: auto;
  max-width: 520px;
  text-align: center;
`;

const EmptyTitle = styled.span`
  color: var(--text);
  font-size: 14px;
`;

const EmptyHint = styled.span`
  color: var(--text-faint);
  font-size: 12px;
  line-height: 1.6;
`;
