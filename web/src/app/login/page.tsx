import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authorizeUrl, isLoggedIn, providerConfigured } from "@/lib/auth";
import { originFromHeaders } from "@/lib/origin";

export const metadata = {
  title: "Sign in",
  description: "Sign in to SmartFlashcards with your Google or GitHub account.",
  robots: { index: false, follow: false },
};

/** 授权页的 redirect_uri 必须与之后换 token 时用的完全一致，所以两处都从转发头取（见 lib/origin.ts） */
async function currentOrigin(): Promise<string> {
  const h = await headers();
  return originFromHeaders(h) || "http://localhost:3000";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; state?: string }>;
}) {
  const { error, code, state } = await searchParams;

  // 回调地址注册的是 /login（GitHub 那条由后端 /api/auth/github/callback 中转过来）。
  // Server Component 不能写 cookie，所以把 code 转交给能写 cookie 的 route handler。
  if (code) {
    const qs = new URLSearchParams({ code });
    if (state) qs.set("state", state);
    redirect(`/auth/callback?${qs.toString()}`);
  }

  if (await isLoggedIn()) redirect("/");
  const origin = await currentOrigin();

  const google = authorizeUrl("google", origin);
  const github = authorizeUrl("github", origin);
  const anyConfigured = providerConfigured("google") || providerConfigured("github");

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="text-2xl font-semibold">Sign in / Sign up</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Continue with Google or GitHub. Signing in for the first time creates your account.
      </p>

      {error && (
        <p className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {!anyConfigured && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed">
          <p className="font-medium">Sign-in is not configured</p>
          <p className="mt-2 text-muted">
            OAuth credentials have to be provided on the server before sign-in buttons appear:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>
              Backend <code>.env</code>: <code>GOOGLE_CLIENT_ID</code> /{" "}
              <code>GOOGLE_CLIENT_SECRET</code>, <code>GITHUB_CLIENT_ID</code> /{" "}
              <code>GITHUB_CLIENT_SECRET</code>
            </li>
            <li>
              Frontend build variables: <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> /{" "}
              <code>NEXT_PUBLIC_GITHUB_CLIENT_ID</code>
            </li>
            <li>
              Callback URL: <code>{origin}/login</code> (Google) 与{" "}
              <code>{origin}/api/auth/github/callback</code> (GitHub)
            </li>
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {google ? (
          <a
            href={google}
            className="flex items-center justify-center gap-3 rounded-xl border border-line px-5 py-3 font-medium hover:border-brand"
          >
            Continue with Google
          </a>
        ) : null}
        {github ? (
          <a
            href={github}
            className="flex items-center justify-center gap-3 rounded-xl border border-line px-5 py-3 font-medium hover:border-brand"
          >
            Continue with GitHub
          </a>
        ) : null}
      </div>

      <p className="mt-8 text-sm text-muted">
        <Link href="/" className="hover:text-brand">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
