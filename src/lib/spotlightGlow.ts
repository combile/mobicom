// 카드 안쪽에서 커서를 따라다니는 부드러운 스포트라이트 글로우
export function spotlightGlow(color: string, size: number) {
  return `
    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: radial-gradient(
        ${size}px circle at var(--mx, 50%) var(--my, 50%),
        ${color},
        transparent 70%
      );
      mix-blend-mode: screen;
      opacity: 0;
      transition: opacity 0.35s ease;
      pointer-events: none;
    }

    @media (hover: hover) {
      &:hover::after {
        opacity: 1;
      }
    }
  `;
}
