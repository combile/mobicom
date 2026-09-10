import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import { query } from "@/lib/mobion-db";
import ProfileContent from "@/components/ProfileContent";
import styles from "../page.module.css";

export const metadata = {
  title: "프로필 — MOBICOM",
  description: "Mobi:ON 프로필 설정",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // getCurrentUser는 세션 확인용이라 인증에 필요한 것만 읽는다. 설정은 이
  // 화면에서만 쓰이므로 여기서 따로 가져온다.
  const prefs = await query<{ notify_comment: boolean; notify_status: boolean }>(
    `SELECT notify_comment, notify_status FROM mobion_users WHERE id = $1`,
    [user.id],
  );
  const row = prefs.rows[0];

  return (
    <main className={styles.appPage}>
      <div className={styles.appAmbient} aria-hidden />
      <ProfileContent
        initialName={user.name}
        initialNotifyComment={row?.notify_comment ?? true}
        initialNotifyStatus={row?.notify_status ?? true}
      />
    </main>
  );
}
