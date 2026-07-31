"use client";

import styled from "@emotion/styled";

export default function MobiOnContent() {
  return (
    <Root>
      <Title>Mobi:ON</Title>
      <Message>새로운 Mobi:ON을 준비하고 있습니다.</Message>
      <SubMessage>곧 더 나은 모습으로 찾아뵙겠습니다.</SubMessage>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 24px;
  text-align: center;
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: clamp(32px, 5vw, 56px);
  color: #fff;
`;

const Message = styled.p`
  font-weight: 400;
  font-size: clamp(16px, 2vw, 22px);
  color: #d4d4d4;
`;

const SubMessage = styled.p`
  font-weight: 300;
  font-size: clamp(13px, 1.4vw, 16px);
  color: #9a9a9a;
`;
