/**
 * OAuth 回调。必须在 Route Handler 里做 —— Server Component 不能写 cookie。
 *
 * 两条链路的落点：
 *   Google  授权时 redirect_uri = `${origin}/login`，回来是 /login?code=...&state=google
 *   GitHub  控制台注册的回调是 `${origin}/api/auth/github/callback`（走 Django），
 *           后端把 code/state 原样中转回 /login?code=...&state=github
 * 两者都汇到 /login，由它转交给这里（换码逻辑只应该有一份，在两边各写一遍迟早
 * 会出现"Google 能登、GitHub 登不上"这种只在一边生效的偏差）。
 *
 * 流程：Google/GitHub → /login?code&state → 这里 → 调 Django 换 JWT → 写 httpOnly cookie → 进站
 */
import { NextRequest, NextResponse } from "next/server";

import { API_BASE } from "@/lib/api";
import { publicOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface JwtPayload {
  access: string;
  refresh: string;
}

export async function GET(req: NextRequest) {
  // ⚠️ 不能用 new URL(req.url).origin —— 那是进程的监听地址（恒为 localhost:3000），
  // 会让 redirect_uri 与授权时不一致（Google 报 redirect_uri_mismatch），
  // 也会把跳转打到用户自己的机器上。详见 lib/origin.ts。
  const origin = publicOrigin(req.headers, req.url);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  // state 形如 "google"；这里只取冒号前那一段（后端会把附加信息原样带回，前端不解析它）
  const provider = state.split(":")[0] === "github" ? "github" : "google";

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, origin));

  if (!code) return fail("Sign-in was cancelled, or no code was returned");

  // 1) 用 code 换 JWT
  let jwt: JwtPayload;
  try {
    const res = await fetch(`${API_BASE}/api/auth/${provider}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 必须与授权页用的 redirect_uri 完全一致，Google 会逐字校验（GitHub 那条不看这个字段）
      body: JSON.stringify({ code, redirect_uri: `${origin}/login` }),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access) {
      // 优先用 detail（后端带出来的上游原始错误：redirect_uri_mismatch /
      // invalid_client / invalid_grant ...），否则只剩"登录失败"这种没法排查的话
      const detail = body?.detail || body?.error || `HTTP ${res.status}`;
      return fail(`${provider} sign-in failed: ${detail}`);
    }
    jwt = body as JwtPayload;
  } catch (e) {
    return fail(`Auth service unreachable: ${(e as Error).message}`);
  }

  // 2) 写 cookie 并进站
  // 目前唯一可进的页面是首页（登录后可见的功能页还没搬过来）
  const response = NextResponse.redirect(new URL("/", origin));
  const secure = process.env.NODE_ENV === "production";
  const common = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
  response.cookies.set("sfo_access", jwt.access, { ...common, maxAge: 60 * 60 * 24 });
  response.cookies.set("sfo_refresh", jwt.refresh, { ...common, maxAge: 60 * 60 * 24 * 30 });
  return response;
}
