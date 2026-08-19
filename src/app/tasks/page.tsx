import { redirect } from "next/navigation";

// The tasks view moved into /mobion's icon rail. Kept as a redirect so old
// links and bookmarks still land somewhere useful.
export default function TasksPage() {
  redirect("/mobion");
}
