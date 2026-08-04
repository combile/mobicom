import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
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

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <ProfileContent initialName={user.name} />
    </main>
  );
}
