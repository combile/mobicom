"use client";

import { useRef, useState } from "react";
import styled from "@emotion/styled";

const AVATAR_SIZE = 128;

function resizeToSquarePng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("이미지를 처리할 수 없습니다."));
        return;
      }
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("이미지 파일만 업로드할 수 있습니다."));
    img.src = URL.createObjectURL(file);
  });
}

export default function ProfileContent({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("파일 크기는 10MB 이하여야 합니다.");
      return;
    }
    try {
      const dataUrl = await resizeToSquarePng(file);
      setAvatarPreview(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/mobion/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
          avatarBase64: avatarPreview,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "요청에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      setSuccess("저장되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Root>
      <Card onSubmit={handleSubmit}>
        <Title>프로필</Title>

        <AvatarRow>
          <AvatarPreview onClick={() => fileInputRef.current?.click()}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" />
            ) : (
              <span>{name.charAt(0) || "?"}</span>
            )}
          </AvatarPreview>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            hidden
          />
          <AvatarHint>클릭해서 사진 변경 (최대 10MB)</AvatarHint>
        </AvatarRow>

        <Field>
          <label htmlFor="profile-name">이름</label>
          <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field>
          <label htmlFor="profile-current-password">현재 비밀번호</label>
          <input
            id="profile-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>

        <Field>
          <label htmlFor="profile-new-password">새 비밀번호 (변경 시에만 입력)</label>
          <input
            id="profile-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>

        {error && <ErrorText>{error}</ErrorText>}
        {success && <Success>{success}</Success>}

        <Submit type="submit" disabled={saving}>
          {saving ? "저장 중..." : "저장"}
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
  background: rgba(37, 37, 37, 0.35);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
`;

const Title = styled.h1`
  font-family: "Pretendard Variable", Pretendard, sans-serif;
  font-weight: 700;
  font-size: 24px;
  color: #fff;
  text-align: center;
  margin-bottom: 8px;
`;

const AvatarRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

const AvatarPreview = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 181, 255, 0.15);
  color: #00b5ff;
  font-size: 28px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.14);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const AvatarHint = styled.span`
  font-size: 12px;
  color: #9a9a9a;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    color: #9a9a9a;
  }

  input {
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.25);
    color: #fff;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: #00b5ff;
    }
  }
`;

const ErrorText = styled.p`
  font-size: 13px;
  color: #ff6767;
  text-align: center;
`;

const Success = styled.p`
  font-size: 13px;
  color: #4ade80;
  text-align: center;
`;

const Submit = styled.button`
  padding: 12px 0;
  border-radius: 12px;
  border: none;
  background: #00b5ff;
  color: #061018;
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
