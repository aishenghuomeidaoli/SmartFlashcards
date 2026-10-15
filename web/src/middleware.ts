import { NextRequest, NextResponse } from "next/server";

import { isExpired } from "@/lib/jwt";

/**
 * 访问令牌到期前自动续期。
 *
 * 为什么必须在中间件里做，而不是在页面/BFF 里：
 *   · 访问令牌只活 2 小时（settings.SIMPLE_JWT），但 cookie 活 1 天 —— 中间这段时间
 *     cookie 存在却已失效。页面 `getAccessToken()` 只看 cookie 在不在，于是既不跳登录、
 *     后端每个接口又都回 401，用户看到的是一个"空的学习库" —— 没有任何报错。
 *   · 更糟的是 RSC（服务端组件）里不能写 cookie，所以刷新只能发生在中间件或 Route Handler
 *     这种能改响应的地方；中间件是唯一同时覆盖「SSR 页面」和「/bff 客户端调用」的位置。
 *
 * 刷新令牌活 30 天，所以续期正常时用户一个月都不用重新登录。
 */
const ACCESS_COOKIE = "sfo_access";
const REFRESH_COOKIE = "sfo_refresh";

/** 剩余有效期少于这个值就续期，避免"刚好在请求途中过期" */
const REFRESH_MARGIN_MS = 60_000;

/** 访问令牌按 JWT 的 2 小时存活，cookie 跟随，不再出现"cookie 还在但令牌已死" */
const ACCESS_MAX_AGE = 60 * 60 * 2;

/**
 * 动态取键（process.env["DJANGO_API_" + "BASE"]）而不是 process.env.DJANGO_API_BASE：
 * 中间件跑在 edge runtime，静态写法的 process.env.X 会在**构建期**被内联成构建机上的值，
 * 而这里要的是运行期注入的那个地址。拿不到时的兜底与 docker compose 里的后端端口一致。
 */
function backendBase(): string {
  return process.env["DJANGO_API_" + "BASE"] || "http://127.0.0.1:8000";
}

export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value ?? "";
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value ?? "";

  if (access && !isExpired(access, REFRESH_MARGIN_MS)) return NextResponse.next();
  if (!refresh) return NextResponse.next(); // 没得续，交给页面按"未登录"处理

  let fresh = "";
  try {
    const res = await fetch(`${backendBase()}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (res.ok) fresh = ((await res.json()) as { access?: string }).access ?? "";
  } catch {
    // 后端不可达：放行，让页面自己报错，比在这里假装登录成功好
    return NextResponse.next();
  }

  if (!fresh) {
    // 刷新令牌也废了（过期/被吊销）：清掉 cookie，页面就会正常跳登录页，
    // 而不是继续显示"已登录但没有数据"的假象
    const out = NextResponse.next();
    out.cookies.delete(ACCESS_COOKIE);
    out.cookies.delete(REFRESH_COOKIE);
    return out;
  }

  // 让**本次渲染**就用上新令牌：重建转发出去的 Cookie 头
  const headers = new Headers(req.headers);
  const kept = req.cookies
    .getAll()
    .filter((c) => c.name !== ACCESS_COOKIE)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  headers.set("cookie", `${kept}; ${ACCESS_COOKIE}=${fresh}`.replace(/^; /, ""));

  const out = NextResponse.next({ request: { headers } });
  out.cookies.set(ACCESS_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  return out;
}

export const config = {
  // 静态资源不参与：每个请求都跑一次刷新判断没必要
  matcher: ["/((?!_next/static|_next/image|favicon.svg|og-image.png|robots.txt|sitemap.xml).*)"],
};
