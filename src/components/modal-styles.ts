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

export const ModalCard = styled.div`
  width: min(360px, calc(100% - 48px));
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border-radius: 16px;
  background: rgba(37, 37, 37, 0.95);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
`;

export const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  color: #fff;
`;

export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 14px;
    outline: none;
  }

  /* outline is off above, so focus needs its own affordance */
  input:focus {
    border-color: #00b5ff;
    box-shadow: 0 0 0 3px rgba(0, 181, 255, 0.15);
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
    padding: 8px 16px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    cursor: pointer;
  }

  button:first-of-type {
    background: transparent;
    color: #9a9a9a;
  }

  button:last-of-type {
    background: #00b5ff;
    color: #061018;
    font-weight: 700;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
