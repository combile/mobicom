"use client";

import styled from "@emotion/styled";
import { useCloseOnEscape, useModalEnterAnimation } from "@/lib/use-modal-enter-animation";
import { ModalOverlay, ModalCard, ModalTitle, ModalActions } from "./modal-styles";

/**
 * Asks before something that cannot be undone.
 *
 * A dialog of our own rather than window.confirm: the native one cannot say
 * what is about to be lost, cannot be styled to match the rest of the app, and
 * blocks the page while it is open. This one names the thing being deleted, so
 * the answer is to a specific question rather than to "are you sure?".
 */
export default function ConfirmDialog(props: {
  title: string;
  /** What is about to happen, in the user's terms. Shown above the buttons. */
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const entered = useModalEnterAnimation();
  useCloseOnEscape(props.onCancel);

  return (
    <ModalOverlay data-entered={entered || undefined} onClick={props.onCancel}>
      <ModalCard
        data-entered={entered || undefined}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalTitle>{props.title}</ModalTitle>
        <Description>{props.description}</Description>
        <ModalActions>
          {/* Cancel comes first and takes focus, so a stray Enter or a click
              landing early does the harmless thing. */}
          <CancelButton type="button" autoFocus onClick={props.onCancel}>
            취소
          </CancelButton>
          <DangerButton type="button" onClick={props.onConfirm}>
            {props.confirmLabel ?? "삭제"}
          </DangerButton>
        </ModalActions>
      </ModalCard>
    </ModalOverlay>
  );
}

const Description = styled.p`
  margin: 0 0 4px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted, #6b7280);
  white-space: pre-line;
`;

const CancelButton = styled.button`
  padding: 8px 15px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text-strong);
  cursor: pointer;

  &:hover {
    background: var(--surface-hover, rgba(127, 127, 127, 0.1));
  }
`;

const DangerButton = styled.button`
  padding: 8px 15px;
  border: none;
  border-radius: 8px;
  background: #dc2626;
  color: #fff;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #b91c1c;
  }
`;
