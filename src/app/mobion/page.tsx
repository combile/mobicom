import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/mobion-auth";
import MobiOnContent from "@/components/MobiOnContent";
import styles from "../page.module.css";

export const metadata = {
  title: "Mobi:ON — MOBICOM",
  description: "Huly-inspired research workspace for Mobile Computing Lab",
};

export default async function MobiOnPage() {
  // Without this gate, a logged-out visitor gets a working-looking chat shell
  // whose SSE connection 401s forever and silently retries with backoff in
  // the background — a regression against the old static placeholder page.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className={styles.appPage}>
      <div className={styles.appAmbient} aria-hidden />
      <MobiOnContent />
    </main>
  );
}
