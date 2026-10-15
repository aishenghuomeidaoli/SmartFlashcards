/**
 * 只做一件事：读出 JWT 的 exp。
 *
 * 故意不校验签名 —— 客户端/中间件没有密钥，而且**校验本来就是后端的事**（每个接口都会验）。
 * 这里只回答一个问题：这个令牌是不是已经死了。分开成独立模块是因为中间件跑在 edge runtime，
 * 不能 import 带 next/headers 的 lib/auth。
 */
export function expiresAt(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload)) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;   // 解不出来就算失效
  }
}

export function isExpired(token: string, marginMs = 0): boolean {
  return expiresAt(token) - Date.now() <= marginMs;
}
