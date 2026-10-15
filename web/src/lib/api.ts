/**
 * 后端调用层。
 *
 * 两条路径刻意分开：
 *   · 服务端（RSC / route handler）直接打 Django，把 JWT 放在 Authorization 头里
 *   · 浏览器端走 /bff/* 同源代理 —— 读不到的 httpOnly cookie 由 BFF 换成 Authorization 头，
 *     于是 token 不进 JS，也不必处理 CORS
 */

export const API_BASE = process.env.DJANGO_API_BASE ?? "http://127.0.0.1:8000";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; detail: string };

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = body as Record<string, unknown> | null;
    const raw = b?.detail ?? b?.error ?? (Array.isArray(b) ? b?.[0] : null) ?? text;
    const detail = typeof raw === "string" && raw ? raw : `HTTP ${res.status}`;
    return { ok: false, status: res.status, detail: String(detail).slice(0, 300) };
  }
  return { ok: true, status: res.status, data: body as T };
}

/** 服务端调用：直接打后端（用于 SSR / route handler） */
export async function apiServer<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  try {
    const res = await fetch(`${API_BASE}/api/${path.replace(/^\//, "")}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    return await parse<T>(res);
  } catch (e) {
    return { ok: false, status: 0, detail: `Backend unreachable: ${(e as Error).message}` };
  }
}

/** 浏览器端调用：走同源 BFF 代理 */
export async function apiClient<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // 去掉尾斜杠：Next 会把它 308 掉，白多一次往返（补斜杠由 BFF 负责）
  const clean = path.replace(/^\//, "").replace(/\/$/, "");
  try {
    const res = await fetch(`/bff/${clean}`, {
      ...init,
      headers,
      credentials: "same-origin",
    });
    return await parse<T>(res);
  } catch (e) {
    return { ok: false, status: 0, detail: `Request failed: ${(e as Error).message}` };
  }
}

/** DRF 的分页响应 */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
