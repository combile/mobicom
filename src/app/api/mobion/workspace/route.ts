import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { requireCurrentUser } from "@/lib/mobion-auth";
import { getWorkspace, seedWorkspace } from "@/lib/mobion-data";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    await seedWorkspace(user.id, user.name);
    const workspace = await getWorkspace(user.id);
    return NextResponse.json({ user, workspace });
  } catch (error) {
    return mobionApiError(error, "워크스페이스 로드 실패");
  }
}
