"use client";

import { useRef, useState } from "react";
import styled from "@emotion/styled";
import ThemeSetting from "./ThemeSetting";

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

export default function ProfileContent({
  initialName,
  initialNotifyComment,
  initialNotifyStatus,
}: {
  initialName: string;
  initialNotifyComment: boolean;
  initialNotifyStatus: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [notifyComment, setNotifyComment] = useState(initialNotifyComment);
  const [notifyStatus, setNotifyStatus] = useState(initialNotifyStatus);
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

  /**
   * 토글은 누른 즉시 반영하고, 실패하면 되돌린다.
   *
   * 조용히 실패하면 껐다고 믿은 알림이 계속 온다 — 설정 화면에서 그보다
   * 나쁜 실패는 없다.
   */
  async function saveNotifyPref(patch: { notifyComment?: boolean; notifyStatus?: boolean }) {
    const before = { notifyComment, notifyStatus };
    if (patch.notifyComment !== undefined) setNotifyComment(patch.notifyComment);
    if (patch.notifyStatus !== undefined) setNotifyStatus(patch.notifyStatus);
    setError(null);
    try {
      const res = await fetch("/api/mobion/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotifyComment(before.notifyComment);
      setNotifyStatus(before.notifyStatus);
      setError("알림 설정을 저장하지 못했습니다.");
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

        <ThemeSetting />

        <NotifySection>
          <NotifyHeading>알림 받기</NotifyHeading>
          <NotifyRow>
            <input
              type="checkbox"
              id="notify-comment"
              checked={notifyComment}
              onChange={(e) => saveNotifyPref({ notifyComment: e.target.checked })}
            />
            <NotifyLabel htmlFor="notify-comment">
              댓글
              <NotifyHint>내 태스크에 새 댓글이 달릴 때</NotifyHint>
            </NotifyLabel>
          </NotifyRow>
          <NotifyRow>
            <input
              type="checkbox"
              id="notify-status"
              checked={notifyStatus}
              onChange={(e) => saveNotifyPref({ notifyStatus: e.target.checked })}
            />
            <NotifyLabel htmlFor="notify-status">
              상태 변경
              <NotifyHint>내 태스크의 상태가 바뀔 때</NotifyHint>
            </NotifyLabel>
          </NotifyRow>
          {/* 끌 수 없는 항목을 비활성 토글로 늘어놓는 것보다, 없는 이유를 한
              줄로 말하는 편이 낫다 */}
          <NotifyNote>멘션과 담당자 지정은 항상 받습니다.</NotifyNote>
        </NotifySection>

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
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 28px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid var(--border-strong);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const AvatarHint = styled.span`
  font-size: 12px;
  color: var(--text-muted);
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

const ErrorText = styled.p`
  font-size: 13px;
  color: var(--danger);
  text-align: center;
`;

const Success = styled.p`
  font-size: 13px;
  color: var(--ok);
  text-align: center;
`;

const NotifySection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const NotifyHeading = styled.h3`
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
`;

const NotifyRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 2px 0 0;
    accent-color: var(--accent);
    cursor: pointer;
  }
`;

const NotifyLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
`;

const NotifyHint = styled.span`
  font-size: 12px;
  color: var(--text-faint);
`;

const NotifyNote = styled.p`
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-faint);
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
