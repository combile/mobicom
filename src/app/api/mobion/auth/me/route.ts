import { NextResponse } from "next/server";
import { mobionApiError } from "@/lib/mobion-api";
import { getCurrentUser } from "@/lib/mobion-auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    return mobionApiError(error, "세션 확인 실패");
  }
}
