/**
 * 认证：JWT 放在 httpOnly cookie 里，JS 读不到（XSS 也偷不走）。
 *
 * 登录链路：
 *   1. /login 点按钮 → 跳 Google/GitHub 授权页（state 里带 provider）
 *   2. 授权回来：Google 落在 ${origin}/login，GitHub 先落在后端 /api/auth/github/callback 再转回 /login
 *   3. /login 把 code 交给 /auth/callback → 服务端调 Django /api/auth/{provider}/ 换 JWT
 *      → 写 httpOnly cookie → 进站
 *
 * cookie 名带 sfo_ 前缀：本机同时跑上游项目时（同为 localhost:3000）不会互相顶掉。
 */
import { cookies } from "next/headers";

import { isExpired } from "@/lib/jwt";

export const ACCESS_COOKIE = "sfo_access";
export const REFRESH_COOKIE = "sfo_refresh";

const ACCESS_MAX_AGE = 60 * 60 * 24; // 1 天
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

/** 这些是公开的 client id（OAuth 授权码流程里本来就会出现在浏览器 URL 上），构建时注入 */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "";

export type Provider = "google" | "github";

export function providerConfigured(provider: Provider): boolean {
  return provider === "google" ? Boolean(GOOGLE_CLIENT_ID) : Boolean(GITHUB_CLIENT_ID);
}

export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value ?? null;
  if (!token) return null;
  // 只看 cookie 在不在是不够的：访问令牌 2 小时就过期，而 cookie 活 1 天。
  // 中间那段时间后端每个接口都回 401，页面却认为"已登录"，于是渲染出一个
  // 空的学习库、连报错都没有。过期就当未登录 —— 中间件负责续期，续不上就跳登录页。
  return isExpired(token) ? null : token;
}

export async function isLoggedIn(): Promise<boolean> {
  return Boolean(await getAccessToken());
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/** 拼授权页 URL；未配置 client id 时返回 null，由页面给出提示而不是跳到一个坏地址 */
export function authorizeUrl(provider: Provider, origin: string): string | null {
  const redirectUri = `${origin}/login`;
  if (provider === "google") {
    if (!GOOGLE_CLIENT_ID) return null;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: provider,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  if (!GITHUB_CLIENT_ID) return null;
  // GitHub 的 OAuth App 只允许注册**一个**回调地址，且逐字校验 redirect_uri；
  // 注册的是 ${origin}/api/auth/github/callback（后端中转回 /login），
  // 与 Google 用的 ${origin}/login 不是同一个地址。所以这里必须能用环境变量写死，
  // 不能像 Google 那样从当前域名推出来 —— 否则从 www 发起就会 redirect_uri 不匹配。
  // 未配置时回退到"当前域名 + /login"（仅本地开发用）。
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_REDIRECT_URI || redirectUri,
    scope: "read:user user:email",
    state: provider,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}
