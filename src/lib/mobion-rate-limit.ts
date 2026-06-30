import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
  scope: string;
  identifier: string;
};

declare global {
  var mobionRateLimits: Map<string, Bucket> | undefined;
}

const buckets = globalThis.mobionRateLimits ?? new Map<string, Bucket>();

if (process.env.NODE_ENV !== "production") {
  globalThis.mobionRateLimits = buckets;
}

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return forwarded || realIp || "local";
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.scope}:${clientKey(request)}:${options.identifier}`;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  current.count += 1;
  if (current.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return NextResponse.json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}
