import { NextResponse } from "next/server";

import { clearAuthCookies } from "@/lib/auth";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await clearAuthCookies();
  // 同 auth/callback：req.url 的 origin 是进程的监听地址，直接用会把用户送到 localhost:3000
  const origin = publicOrigin(req.headers, req.url);
  return NextResponse.redirect(new URL("/", origin));
}
