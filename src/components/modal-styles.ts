import styled from "@emotion/styled";

/**
 * Shared create-modal chrome.
 *
 * Render these through `createPortal(..., document.body)`. The workspace's
 * Sidebar and Main panels both set `backdrop-filter`, which makes them a
 * containing block for fixed-position descendants — a modal nested inside one
 * collapses to that panel's width instead of filling the viewport.
 */
export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay);
`;

/**
 * Radius is deliberately tiered rather than uniform: the card is the outermost
 * surface and gets the largest value, controls inside it get less, and small
 * chips least. Giving everything the same corner is what makes a screen read as
 * generated rather than designed.
 */
export const ModalCard = styled.div`
  width: min(340px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border-radius: 10px;
  background: var(--surface);
  /* a neutral hairline: an accent-coloured outline round the whole dialog
     announces itself far louder than a dialog needs to */
  border: 1px solid var(--border-strong);
`;

export const ModalTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;

  label {
    font-size: 12px;
    color: var(--text-muted);
  }

  input {
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-strong);
    font-size: 13px;
    outline: none;
  }

  /* outline is off above, so focus needs its own affordance — a border shift
     is enough; the glow was doing the work of a much louder signal */
  input:focus {
    border-color: var(--border-strong);
  }
`;

export const ErrorText = styled.p`
  color: var(--danger);
  font-size: 12px;
`;

export const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;

  button {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    font-size: 13px;
    cursor: pointer;
  }

  button {
    transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease,
      transform 0.08s ease;
  }

  button:active:not(:disabled) {
    transform: translateY(1px);
  }

  button:first-of-type {
    background: transparent;
    color: var(--text-muted);
  }

  button:first-of-type:hover {
    background: var(--surface-hover);
    color: var(--text);
  }

  /* The confirm action is a solid block of the text colour rather than a
     tinted surface. The tint worked against a dark panel and vanished against
     a white one, which left the primary action as the faintest thing in the
     footer. Inverting text and ground carries the same weight in either. */
  button:last-of-type {
    background: var(--selected-bg);
    border-color: var(--selected-bg);
    color: var(--selected-text);
    font-weight: 600;

    &:hover:not(:disabled) {
      opacity: 0.85;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    button:active:not(:disabled) {
      transform: none;
    }
  }
`;
