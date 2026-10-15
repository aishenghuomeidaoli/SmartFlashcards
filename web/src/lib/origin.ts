/**
 * 还原「用户实际访问的站点 origin」。
 *
 * ⚠️ 绝对不要用 `new URL(req.url).origin`：
 * Next 的 Route Handler 里 `req.url` 的 origin 是**进程自己的监听地址**
 * （实测恒为 `http://localhost:3000`，由 HOSTNAME/PORT 决定），
 * `Host` 与 `X-Forwarded-Host` 都不参与它的构造。在 nginx 后面会被
 * `X-Forwarded-Proto: https` 改写成 `https://localhost:3000`，后果有两个：
 *
 *   1. 发给 Django 的 `redirect_uri` 与授权时用的不一致
 *      → Google 直接报 `redirect_uri_mismatch`，登录必失败
 *   2. 登录失败/成功的跳转、登出跳转全都指向用户自己的 localhost:3000
 *
 * 所以 origin 只能从转发头里取。nginx 侧已配 `X-Forwarded-Host` / `X-Forwarded-Proto`；
 * 直接打 :3000（本地开发、curl 探活）时靠 `Host` 头兜底。
 */

/** 只要能 .get() —— 同时适配 NextRequest.headers 与 next/headers 的 ReadonlyHeaders */
interface HeaderLike {
  get(name: string): string | null;
}

/** 多级代理会拼成 "a, b"，取最外层（即用户实际访问的那个） */
function firstValue(raw: string | null): string {
  return (raw ?? "").split(",")[0].trim();
}

function defaultProto(host: string): string {
  return host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
}

/** 拿不到任何 host 头时返回空串，由调用方决定回退（通常是 req.url） */
export function originFromHeaders(h: HeaderLike): string {
  const host = firstValue(h.get("x-forwarded-host")) || firstValue(h.get("host"));
  if (!host) return "";
  const proto = firstValue(h.get("x-forwarded-proto")) || defaultProto(host);
  return `${proto}://${host}`;
}

/**
 * 保证拿到一个可用的绝对 origin：转发头缺失时回退到 `fallback` 的 origin。
 * `fallback` 一般传 `req.url`（形如 http://localhost:3000/login），保证 new URL() 不会抛。
 */
export function publicOrigin(h: HeaderLike, fallback: string): string {
  return originFromHeaders(h) || new URL(fallback).origin;
}
