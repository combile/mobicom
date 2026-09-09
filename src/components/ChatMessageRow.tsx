"use client";

import styled from "@emotion/styled";
import { useEffect, useRef, useState } from "react";

/**
 * One message, with everything that hangs off it.
 *
 * Split out of MobiOnContent because a message row now carries a quoted parent,
 * an attachment list, a reaction strip, an edit mode and a menu — five things
 * that each have their own state and would otherwise be spliced into an
 * already long file.
 *
 * Actions live behind a single "⋮", not a row of hover buttons. A strip that
 * appears under the pointer and vanishes when it drifts is hard to aim at, and
 * it puts five targets over the message the moment you cross it. The panel here
 * opens on a click and stays until something else is clicked, so reaching for
 * the third item is not a race. It is absolutely positioned, so opening it
 * never pushes the conversation around.
 */

export type Reaction = { emoji: string; count: number; mine: boolean };

export type Attachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  expiresAt: string | null;
  expired: boolean;
  url: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  createdOn: number;
  modifiedOn?: number;
};

// The row that opens with the menu. Deliberately not "positive only" — a
// message people are unhappy about is exactly the one where nobody wants to
// type a whole reply, and offering only 👍 makes silence the alternative.
const QUICK_REACTIONS = ["❤️", "✅", "😢", "😠", "😞"];

// Everything else, behind the "더 보기" toggle. Ordered roughly by how likely
// it is to be wanted rather than alphabetically, since scanning stops at the
// first one that fits.
const ALL_REACTIONS = [
  "👍", "👎", "❤️", "✅", "❌", "👀", "🎉", "🔥",
  "😄", "😂", "🥹", "😮", "😢", "😠", "😞", "😴",
  "🙏", "👏", "💪", "🫡", "🤝", "🙌", "🤔", "🫠",
  "💡", "📌", "⚠️", "🚀", "⏰", "☕", "🍰", "🐢",
];

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatExpiry(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일까지`;
}

export default function ChatMessageRow(props: {
  message: ChatMessage;
  showTimestamp: boolean;
  timestamp: string;
  mentionsMe: boolean;
  isMine: boolean;
  canDelete: boolean;
  reactions: Reaction[];
  attachments: Attachment[];
  quoted: { authorName: string | null; text: string } | null;
  readBy: string[];
  renderText: (text: string) => React.ReactNode;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
  onRaiseTask: () => void;
}) {
  const { message: m } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  // The menu stays open until something outside it is clicked. A panel that
  // disappears the moment the pointer leaves the row cannot be aimed at.
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAllEmoji, setShowAllEmoji] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowAllEmoji(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setShowAllEmoji(false);
      }
    }
    // mousedown rather than click: a click that starts inside the menu and
    // ends outside it (a drag over an emoji) should not count as "outside".
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setShowAllEmoji(false);
  }

  // An edit bumps modifiedOn past createdOn; Huly sets both, so no flag of our
  // own is needed to know a message was changed. The second of slack absorbs
  // the gap Huly leaves between creating a doc and finishing its transaction.
  const edited = m.modifiedOn != null && m.modifiedOn > m.createdOn + 1000;

  async function commitEdit() {
    const next = draft.trim();
    if (!next || next === m.text) {
      setEditing(false);
      setDraft(m.text);
      return;
    }
    if (await props.onEdit(next)) setEditing(false);
  }

  return (
    <Row data-mentions-me={props.mentionsMe || undefined}>
      {props.showTimestamp && <Stamp>{props.timestamp}</Stamp>}

      <Content>
        {props.quoted && (
          <Quote>
            <QuoteAuthor>{props.quoted.authorName ?? "알 수 없음"}</QuoteAuthor>
            <QuoteText>{props.quoted.text}</QuoteText>
          </Quote>
        )}

        {editing ? (
          <EditBox>
            <EditInput
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // same IME guard as the composer: the composition-commit Enter
                // must not save a half-typed Korean edit
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void commitEdit();
                }
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(m.text);
                }
              }}
            />
            <EditHint>Enter 저장 · Esc 취소</EditHint>
          </EditBox>
        ) : (
          <Text>
            {props.renderText(m.text)}
            {edited && <EditedMark title="수정됨">(수정됨)</EditedMark>}
          </Text>
        )}

        {props.attachments.length > 0 && (
          <Attachments>
            {props.attachments.map((a) =>
              a.expired ? (
                <ExpiredFile key={a.id}>
                  <span className="material-symbols-outlined">delete_history</span>
                  <span>{a.filename} · 보관 기간이 지나 삭제됨</span>
                </ExpiredFile>
              ) : a.mime.startsWith("image/") ? (
                <ImageFrame key={a.id}>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    <Thumb src={a.url} alt={a.filename} loading="lazy" />
                  </a>
                  {a.expiresAt && <ExpiryNote>{formatExpiry(a.expiresAt)}</ExpiryNote>}
                </ImageFrame>
              ) : (
                <FileCard key={a.id} href={a.url} target="_blank" rel="noreferrer">
                  <span className="material-symbols-outlined">description</span>
                  <FileMeta>
                    <FileName>{a.filename}</FileName>
                    <FileSize>
                      {formatBytes(a.size)}
                      {a.expiresAt && ` · ${formatExpiry(a.expiresAt)}`}
                    </FileSize>
                  </FileMeta>
                </FileCard>
              ),
            )}
          </Attachments>
        )}

        {props.reactions.length > 0 && (
          <Reactions>
            {props.reactions.map((r) => (
              <ReactionChip
                key={r.emoji}
                type="button"
                data-mine={r.mine || undefined}
                onClick={() => props.onReact(r.emoji)}
              >
                <span>{r.emoji}</span>
                <ReactionCount>{r.count}</ReactionCount>
              </ReactionChip>
            ))}
          </Reactions>
        )}

        {props.readBy.length > 0 && (
          <ReadBy title={props.readBy.join(", ")}>
            <span className="material-symbols-outlined">done_all</span>
            {props.readBy.length}명 읽음
          </ReadBy>
        )}
      </Content>

      {/* One button, not a row of them. The old hover strip put five targets
          over the message the moment the pointer crossed it, and every one of
          them vanished if the pointer drifted. This opens a panel that stays
          until something else is clicked, so it can actually be aimed at. */}
      <MenuAnchor ref={menuRef}>
        <MoreButton
          type="button"
          data-open={menuOpen || undefined}
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          aria-label="메시지 메뉴"
          aria-expanded={menuOpen}
          title="메뉴"
        >
          <span className="material-symbols-outlined">more_vert</span>
        </MoreButton>

        {menuOpen && (
          <Menu role="menu">
            <EmojiRow data-expanded={showAllEmoji || undefined}>
              {(showAllEmoji ? ALL_REACTIONS : QUICK_REACTIONS).map((e) => (
                <EmojiButton
                  key={e}
                  type="button"
                  onClick={() => {
                    props.onReact(e);
                    closeMenu();
                  }}
                  aria-label={`${e} 반응`}
                >
                  {e}
                </EmojiButton>
              ))}
              {!showAllEmoji && (
                <EmojiButton
                  type="button"
                  onClick={() => setShowAllEmoji(true)}
                  aria-label="이모지 더 보기"
                  title="더 보기"
                >
                  <span className="material-symbols-outlined">add</span>
                </EmojiButton>
              )}
            </EmojiRow>

            <MenuDivider />

            <MenuItem
              type="button"
              role="menuitem"
              onClick={() => {
                props.onReply();
                closeMenu();
              }}
            >
              <span className="material-symbols-outlined">reply</span>
              답장
            </MenuItem>
            <MenuItem
              type="button"
              role="menuitem"
              onClick={() => {
                props.onRaiseTask();
                closeMenu();
              }}
            >
              <span className="material-symbols-outlined">add_task</span>
              태스크로 만들기
            </MenuItem>
            {props.isMine && (
              <MenuItem
                type="button"
                role="menuitem"
                onClick={() => {
                  setDraft(m.text);
                  setEditing(true);
                  closeMenu();
                }}
              >
                <span className="material-symbols-outlined">edit</span>
                수정
              </MenuItem>
            )}
            {props.canDelete && (
              <MenuItem
                type="button"
                role="menuitem"
                data-danger
                onClick={() => {
                  props.onDelete();
                  closeMenu();
                }}
              >
                <span className="material-symbols-outlined">delete</span>
                삭제
              </MenuItem>
            )}
          </Menu>
        )}
      </MenuAnchor>
    </Row>
  );
}

const Row = styled.div`
  position: relative;
  display: flex;
  gap: 8px;
  /* The right padding is the menu button's lane. It used to float over the
     text, which buried it in a long message — absolutely positioned, but with
     nothing reserving the space it sat in. */
  padding: 2px 40px 2px 0;
  border-radius: 6px;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.07));
  }

  /* a message that names you should be findable while scrolling past, not
     only once you stop and read */
  &[data-mentions-me] {
    background: var(--mention-bg, rgba(255, 196, 0, 0.12));
    box-shadow: inset 2px 0 0 var(--mention-bar, #f0b429);
  }
`;

/* Anchors the panel to the row without joining the layout, so opening it never
   pushes the conversation around. */
const MenuAnchor = styled.div`
  position: absolute;
  top: 1px;
  /* Inside the lane the row's padding reserves, so it never lands on a word. */
  right: 6px;
  z-index: 3;
`;

const MoreButton = styled.button`
  display: grid;
  place-items: center;
  width: 26px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--text-faint, #9aa0a6);
  cursor: pointer;
  opacity: 0;

  ${Row}:hover & {
    opacity: 1;
  }

  /* Once the panel is open the button has to stay put — it is the thing the
     panel is hanging from, and fading it out on pointer-leave would make the
     menu look detached. */
  &[data-open] {
    opacity: 1;
    background: var(--surface, #fff);
    border-color: var(--border, #e3e6ea);
    color: var(--text-strong, #1f2328);
  }

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.12));
  }

  .material-symbols-outlined {
    font-size: 18px;
  }
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 3px);
  right: 0;
  /* The emoji grid decides the width; the min keeps the action labels from
     wrapping when the grid is collapsed. */
  width: fit-content;
  min-width: 196px;
  padding: 6px;
  border: 1px solid var(--border, #e3e6ea);
  border-radius: 10px;
  background: var(--surface, #fff);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
`;

/* Wraps onto more rows as the full set is revealed, rather than scrolling —
   at this many emoji a scroll bar hides most of them behind a gesture.

   Columns are a fixed width rather than 1fr, and the same width as the buttons
   in them: with 1fr the track was wider than the button it held, so every
   emoji sat a little left of its own cell and the gaps read as uneven.
   Collapsed shows six (five reactions plus the "more" button), so it gets six
   columns — eight would leave two empty tracks stretching the panel. */
const EmojiRow = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 32px);
  gap: 2px;

  &[data-expanded] {
    grid-template-columns: repeat(8, 32px);
  }
`;

const EmojiButton = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  font-size: 17px;
  line-height: 1;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  color: var(--text-muted, #6b7280);

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.14));
    transform: scale(1.15);
  }

  .material-symbols-outlined {
    font-size: 17px;
  }
`;

const MenuDivider = styled.div`
  height: 1px;
  margin: 5px 3px;
  background: var(--border, #e3e6ea);
`;

const MenuItem = styled.button`
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: 7px;
  background: none;
  color: var(--text-strong, #1f2328);
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.1));
  }

  &[data-danger] {
    color: #dc2626;

    &:hover {
      background: rgba(220, 38, 38, 0.1);
    }
  }

  .material-symbols-outlined {
    font-size: 17px;
    color: var(--text-faint, #9aa0a6);
  }

  &[data-danger] .material-symbols-outlined {
    color: inherit;
  }
`;

const Stamp = styled.span`
  flex: 0 0 44px;
  padding-top: 3px;
  font-size: 11px;
  line-height: 1.5;
  text-align: right;
  color: var(--text-faint, #9aa0a6);
  opacity: 0;

  ${Row}:hover & {
    opacity: 1;
  }
`;

const Content = styled.div`
  flex: 1;
  min-width: 0;
`;

const Quote = styled.div`
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin-bottom: 2px;
  padding-left: 8px;
  border-left: 2px solid var(--border, #d7dbe0);
  font-size: 12px;
  color: var(--text-muted, #6b7280);
`;

const QuoteAuthor = styled.span`
  font-weight: 600;
  flex: 0 0 auto;
`;

const QuoteText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Text = styled.div`
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
`;

const EditedMark = styled.span`
  margin-left: 5px;
  font-size: 11px;
  color: var(--text-faint, #9aa0a6);
`;

const EditBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const EditInput = styled.input`
  width: 100%;
  padding: 6px 9px;
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--accent, #3b82f6);
  border-radius: 6px;
  background: var(--surface, #fff);
  color: inherit;
`;

const EditHint = styled.span`
  font-size: 11px;
  color: var(--text-faint, #9aa0a6);
`;

const Attachments = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
`;

const ImageFrame = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Thumb = styled.img`
  max-width: 320px;
  max-height: 240px;
  border-radius: 8px;
  border: 1px solid var(--border, #e3e6ea);
  display: block;
`;

const ExpiryNote = styled.span`
  font-size: 11px;
  color: var(--text-faint, #9aa0a6);
`;

const FileCard = styled.a`
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 320px;
  padding: 8px 11px;
  border: 1px solid var(--border, #e3e6ea);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  background: var(--surface, #fff);

  &:hover {
    border-color: var(--accent, #3b82f6);
  }

  .material-symbols-outlined {
    font-size: 22px;
    color: var(--text-muted, #6b7280);
  }
`;

const FileMeta = styled.div`
  min-width: 0;
`;

const FileName = styled.div`
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSize = styled.div`
  font-size: 11px;
  color: var(--text-faint, #9aa0a6);
`;

const ExpiredFile = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  border: 1px dashed var(--border, #d7dbe0);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-faint, #9aa0a6);

  .material-symbols-outlined {
    font-size: 18px;
  }
`;

const Reactions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const ReactionChip = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  font-size: 13px;
  line-height: 1.7;
  border: 1px solid var(--border, #e3e6ea);
  border-radius: 11px;
  background: var(--surface, #fff);
  cursor: pointer;

  &[data-mine] {
    border-color: var(--accent, #3b82f6);
    background: var(--accent-soft, rgba(59, 130, 246, 0.12));
  }
`;

const ReactionCount = styled.span`
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted, #6b7280);
`;

const ReadBy = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-faint, #9aa0a6);

  .material-symbols-outlined {
    font-size: 14px;
  }
`;

