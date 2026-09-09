"use client";

import styled from "@emotion/styled";
import { useState } from "react";

/**
 * One message, with everything that hangs off it.
 *
 * Split out of MobiOnContent because a message row now carries a quoted parent,
 * an attachment list, a reaction strip, an edit mode and a hover toolbar — five
 * things that each have their own state and would otherwise be spliced into an
 * already long file.
 *
 * The hover toolbar follows Slack and Discord: it floats over the top-right of
 * the row instead of taking layout space, so a dense conversation stays dense
 * and nothing shifts when the pointer moves across it.
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

// The few reactions worth one click. A full emoji picker is a lot of surface
// for a lab of five; anything else can be typed as a message.
const QUICK_REACTIONS = ["👍", "✅", "👀", "🎉", "😄", "🙏"];

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
  const [pickerOpen, setPickerOpen] = useState(false);

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

      <Toolbar>
        {pickerOpen && (
          <Picker>
            {QUICK_REACTIONS.map((e) => (
              <PickerButton
                key={e}
                type="button"
                onClick={() => {
                  props.onReact(e);
                  setPickerOpen(false);
                }}
              >
                {e}
              </PickerButton>
            ))}
          </Picker>
        )}
        <ToolButton
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="반응 남기기"
          title="반응 남기기"
        >
          <span className="material-symbols-outlined">add_reaction</span>
        </ToolButton>
        <ToolButton type="button" onClick={props.onReply} aria-label="답장" title="답장">
          <span className="material-symbols-outlined">reply</span>
        </ToolButton>
        <ToolButton
          type="button"
          onClick={props.onRaiseTask}
          aria-label="이 메시지로 태스크 만들기"
          title="이 메시지로 태스크 만들기"
        >
          <span className="material-symbols-outlined">add_task</span>
        </ToolButton>
        {props.isMine && (
          <ToolButton
            type="button"
            onClick={() => {
              setDraft(m.text);
              setEditing(true);
            }}
            aria-label="수정"
            title="수정"
          >
            <span className="material-symbols-outlined">edit</span>
          </ToolButton>
        )}
        {props.canDelete && (
          <ToolButton
            type="button"
            data-danger
            onClick={props.onDelete}
            aria-label="삭제"
            title="삭제"
          >
            <span className="material-symbols-outlined">delete</span>
          </ToolButton>
        )}
      </Toolbar>
    </Row>
  );
}

const Row = styled.div`
  position: relative;
  display: flex;
  gap: 8px;
  padding: 2px 12px 2px 0;
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

const Toolbar = styled.div`
  position: absolute;
  top: -12px;
  right: 10px;
  display: none;
  gap: 1px;
  padding: 2px;
  border: 1px solid var(--border, #e3e6ea);
  border-radius: 7px;
  background: var(--surface, #fff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.09);
  z-index: 2;

  ${Row}:hover & {
    display: flex;
  }
`;

const ToolButton = styled.button`
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: none;
  color: var(--text-muted, #6b7280);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.1));
  }

  &[data-danger]:hover {
    color: #dc2626;
  }

  .material-symbols-outlined {
    font-size: 17px;
  }
`;

const Picker = styled.div`
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  display: flex;
  gap: 1px;
  padding: 3px;
  border: 1px solid var(--border, #e3e6ea);
  border-radius: 8px;
  background: var(--surface, #fff);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12);
`;

const PickerButton = styled.button`
  width: 28px;
  height: 28px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  background: none;
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.12));
  }
`;
