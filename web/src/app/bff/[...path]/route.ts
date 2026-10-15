/**
 * BFF（Backend for Frontend）同源代理。
 *
 * 浏览器的 fetch 打到 /bff/<后端路径>，这里把 httpOnly cookie 里的 JWT 换成
 * Authorization 头再转发给 Django —— 于是：
 *   · token 不进 JS（XSS 偷不到）
 *   · 同源，不需要给 Django 配 CORS
 *   · 上传大文件也不经过浏览器 JS 内存拼装，直接流式转发
 *
 * 只做转发与鉴权，不做任何业务判断（业务判断留在 Django，避免两处逻辑分叉）。
 */
import { NextRequest, NextResponse } from "next/server";

import { ACCESS_COOKIE } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "authorization",
  "accept-encoding",
]);

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  // Next 默认把尾斜杠 308 掉，而 DRF 的 URL 全部以 "/" 结尾：
  // 不补回来的话，转发过去会拿到 301（APPEND_SLASH）或 404。
  const joined = path.join("/");
  const apiPath = /\.[a-z0-9]+$/i.test(joined) || joined.endsWith("/") ? joined : `${joined}/`;
  const target = `${API_BASE}/api/${apiPath}${req.nextUrl.search}`;

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("Authorization", `Bearer ${token}`);

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const init: RequestInit = { method, headers, redirect: "manual" };
  if (hasBody) {
    // 必须收成 Buffer 再转发，不能流式（req.body + duplex:"half"）：
    // 流式会让 fetch 用 Transfer-Encoding: chunked，而下游是 WSGI/gunicorn，
    // **WSGI 读不了 chunked 请求体**，Django 会收到空 body（表现为"缺少 collection"这种
    // 莫名其妙的参数缺失）。带 Content-Length 才是 WSGI 能处理的形态。
    const buf = Buffer.from(await req.arrayBuffer());
    init.body = buf;
    headers.set("content-length", String(buf.length));
  }

  try {
    let upstream = await fetch(target, init);

    if ((upstream.status === 301 || upstream.status === 308) && method === "GET") {
      const loc = upstream.headers.get("location");
      if (loc) {
        const u = new URL(loc, API_BASE);
        if (u.pathname.startsWith("/api/")) {
          upstream = await fetch(`${API_BASE}${u.pathname}${u.search}`, { method: "GET", headers });
        }
      }
    }

    const out = new NextResponse(upstream.body, { status: upstream.status });
    const ct = upstream.headers.get("content-type");
    if (ct) out.headers.set("content-type", ct);
    out.headers.set("cache-control", "no-store");
    return out;
  } catch (e) {
    return NextResponse.json(
      { detail: `Backend unreachable: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
