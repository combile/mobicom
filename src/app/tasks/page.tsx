import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import TasksContent from "@/components/TasksContent";
import styles from "../page.module.css";

export const metadata = {
  title: "태스크 — MOBICOM",
  description: "Mobi:ON 프로젝트 및 태스크 관리",
};

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <TasksContent />
    </main>
  );
}
