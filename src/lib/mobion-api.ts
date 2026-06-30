import { NextResponse } from "next/server";

const CONFIG_ERROR = "Mobi:ON 데이터베이스 설정이 필요합니다.";

export function mobionApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (
    error instanceof Error &&
    (error.message.includes("DATABASE_URL") ||
      error.message.includes("POSTGRES_URL"))
  ) {
    return NextResponse.json({ error: CONFIG_ERROR }, { status: 503 });
  }

  console.error("[mobion-api]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
