import MembersContent from "@/components/MembersContent";
import styles from "../page.module.css";

export const metadata = {
  title: "Members — MOBICOM",
  description: "Mobile Computing Lab 구성원",
};

export default function MembersPage() {
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden />
      <MembersContent />
    </main>
  );
}
