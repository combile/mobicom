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
  background: rgba(0, 0, 0, 0.6);
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
  background: #1c1c1c;
  /* a neutral hairline: an accent-coloured outline round the whole dialog
     announces itself far louder than a dialog needs to */
  border: 1px solid #333;
`;

export const ModalTitle = styled.h2`
  font-size: 15px;
  font-weight: 600;
  color: #f0f0f0;
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;

  label {
    font-size: 12px;
    color: #8a8a8a;
  }

  input {
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid #333;
    background: #141414;
    color: #fff;
    font-size: 13px;
    outline: none;
  }

  /* outline is off above, so focus needs its own affordance — a border shift
     is enough; the glow was doing the work of a much louder signal */
  input:focus {
    border-color: #5a5a5a;
  }
`;

export const ErrorText = styled.p`
  color: #ff6767;
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

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  /* the confirm action leads without shouting: a filled neutral surface reads
     as primary next to a plain one, without a saturated block of colour */
  button:last-of-type {
    background: #2f2f2f;
    border-color: #454545;
    color: #f0f0f0;
    font-weight: 600;

    &:hover:not(:disabled) {
      background: #3a3a3a;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
`;
