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
  background: #d6d6d6;
  border: 1px solid #cccccc;
  border-radius: 18px 18px 5px 5px;
  padding: 0.1%;
  transform-origin: bottom center;
  transform-style: preserve-3d;
  will-change: transform;
  box-shadow: 0 0 0.5px 0.5px rgba(255, 255, 255, 0.6);
`;

const Bezel = styled.div`
  width: 100%;
  height: 100%;
  background: #050505;
  border-radius: 14px 14px 3px 3px;
  padding: 0.1%;
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
  border-radius: 10px 10px 2px 2px;
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
  height: clamp(10px, 1.6vw, 18px);
  border-radius: 0 0 8px 8px;
  background: linear-gradient(180deg, #efefef 0%, #d4d4d4 60%, #bdbdbd 100%);
  box-shadow: inset 0 -1px 1px rgba(0, 0, 0, 0.3),
    inset 0 -2px 1px rgba(255, 255, 255, 0.7), 0 6px 10px rgba(0, 0, 0, 0.5);
`;

const Notch = styled.div`
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 16%;
  height: clamp(4px, 0.6vw, 7px);
  border-radius: 0 0 8px 8px;
  background: linear-gradient(180deg, #c8c8c8 0%, #b0b0b0 100%);
`;
