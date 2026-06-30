import MobiOnContent from "@/components/MobiOnContent";
import styles from "../page.module.css";

export const metadata = {
  title: "Mobi:ON — MOBICOM",
  description: "Huly-inspired research workspace for Mobile Computing Lab",
};

export default function MobiOnPage() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <MobiOnContent />
    </main>
  );
}
