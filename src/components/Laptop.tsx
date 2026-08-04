"use client";

import styled from "@emotion/styled";
import TerminalTyping from "./TerminalTyping";

export default function Laptop() {
  return (
    <Wrapper className="mobi-laptop">
      <Lid className="laptop-lid">
        <Bezel>
          <Screen>
            <ScreenContent className="screen-content">
              <Dots>
                <Dot color="#ff5f57" />
                <Dot color="#febc2e" />
                <Dot color="#28c840" />
              </Dots>
              <TerminalTyping />
            </ScreenContent>
          </Screen>
        </Bezel>
      </Lid>
      <BaseWrapper className="laptop-base">
        <Base />
        <Notch />
      </BaseWrapper>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  position: relative;
  width: min(730px, 46vw);
  z-index: 10;
  perspective: 1600px;
  filter: drop-shadow(0 40px 80px rgba(0, 0, 0, 0.6));
`;

const Lid = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 730 / 504;
  background: linear-gradient(155deg, #e9e9ec 0%, #d3d3d7 45%, #b9b9be 100%);
  border-radius: 22px 22px 8px 8px;
  padding: 0.45%;
  transform-origin: bottom center;
  transform-style: preserve-3d;
  will-change: transform;
  box-shadow: 0 0 0.5px 0.5px rgba(255, 255, 255, 0.6);
`;

const Bezel = styled.div`
  width: 100%;
  height: 100%;
  background: #050505;
  border-radius: 19px 19px 7px 7px;
  padding: 0.15%;
  box-shadow: inset 0 0 4px 2px rgba(0, 0, 0, 0.6);
`;

const Screen = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    120% 120% at 8% 10%,
    rgba(40, 40, 40, 0.6) 0%,
    rgba(10, 10, 10, 0.9) 45%,
    #000 100%
  );
  border-radius: 18px 18px 6px 6px;
  overflow: hidden;
  box-shadow: inset 0 0 2px 1px rgba(0, 0, 0, 0.5);
`;

const ScreenContent = styled.div`
  width: 100%;
  height: 100%;
  padding: 2.2% 2.6%;
`;

const Dots = styled.div`
  display: flex;
  gap: 0.9%;
`;

const Dot = styled.span<{ color: string }>`
  width: clamp(7px, 1.1vw, 12px);
  height: clamp(7px, 1.1vw, 12px);
  border-radius: 50%;
  background: ${(p) => p.color};
`;

const BaseWrapper = styled.div`
  position: relative;
  width: 113%;
  left: -6.5%;
  margin-top: 0;
  display: flex;
  justify-content: center;
  transform-origin: top center;
`;

const Base = styled.div`
  width: 100%;
  height: clamp(5px, 0.7vw, 8px);
  border-radius: 0 0 6px 6px;
  background: linear-gradient(180deg, #e2e2e5 0%, #c7c7cc 55%, #adadb2 100%);
  box-shadow: inset 0 -1px 1px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 4px 8px rgba(0, 0, 0, 0.45);
`;

const Notch = styled.div`
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 10%;
  height: 55%;
  border-radius: 3px 3px 0 0;
  background: rgba(0, 0, 0, 0.18);
`;
