"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styled from "@emotion/styled";

export default function LoginContent() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/mobion/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "로그인에 실패했습니다.");
        return;
      }
      router.push("/mobion");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Root>
      <Card onSubmit={handleSubmit}>
        <Title>Mobi:ON 로그인</Title>
        <Field>
          <label htmlFor="login-email">이메일</label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field>
          <label htmlFor="login-password">비밀번호</label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && <Error>{error}</Error>}
        <Submit type="submit" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </Submit>
      </Card>
    </Root>
  );
}

const Root = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 24px;
`;

const Card = styled.form`
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 40px 32px;
  border-radius: 24px;
  background: var(--panel-wash);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-card);
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: var(--text-strong);
  text-align: center;
  margin-bottom: 8px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: var(--text-muted);
  }

  input {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    background: var(--surface-sunken);
    color: var(--text-strong);
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: var(--accent);
    }
  }
`;

const Error = styled.p`
  font-size: 13px;
  color: var(--danger);
  text-align: center;
`;

const Submit = styled.button`
  padding: 12px 0;
  border-radius: 12px;
  border: none;
  background: var(--accent);
  color: var(--on-solid);
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  &:hover:not(:disabled) {
    opacity: 0.88;
  }
`;
