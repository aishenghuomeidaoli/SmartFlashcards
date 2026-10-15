"use client";

import { useEffect, useRef, useState } from "react";

/** 三态：light / dark / system（system = 跟随操作系统偏好） */
type Mode = "light" | "dark" | "system";

const OPTIONS: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolve = (mode: Mode) =>
  mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;

/**
 * 右上角主题选择：Light / Dark / System 三选一，默认 System。
 *
 * 「跟随系统」只在 JS 里存在 —— HTML 上的 data-theme 永远只有 dark/light 两个值，
 * 由 layout.tsx 的首屏内联脚本 + 这里的 matchMedia 监听解析出来，所以 CSS 仍只有两套变量。
 * 按钮图标（太阳/月亮）也交给 CSS 按 data-theme 显示，因此服务端不用知道用户选了什么，
 * 首屏不闪、不会有 hydration 错位。
 */
export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // 首屏（内联脚本已写过 data-theme）之后：同步 UI 状态，并按存过的选择纠正一次 data-theme
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      // 无痕模式等读不了：当作 System
    }
    const initial: Mode = stored === "light" || stored === "dark" ? stored : "system";
    setMode(initial);
    document.documentElement.setAttribute("data-theme", resolve(initial));
  }, []);

  // 选了 System 才跟随系统实时变化。
  // 注意：**订阅时不要立刻 apply** —— 首次提交时 mode 还是占位值 "system"，
  // 若在这里 apply，会把存了 light/dark 的用户刚恢复好的 data-theme 又按系统偏好改掉。
  // 初值由上面那个 effect（或 select()）负责，这里只管 change 事件。
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // 点外面 / 按 Esc 关掉菜单
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function select(next: Mode) {
    setMode(next);
    setOpen(false);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 写不了也算数：本次会话内已生效
    }
    document.documentElement.setAttribute("data-theme", resolve(next));
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${mode}`}
        title={`Theme: ${mode}`}
        className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${
          open ? "border-brand text-brand" : "border-line text-muted hover:border-brand hover:text-brand"
        }`}
      >
        <svg
          className="theme-icon-sun"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
        </svg>
        <svg
          className="theme-icon-moon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.3 14.6A8.5 8.5 0 1 1 9.4 3.7a6.7 6.7 0 0 0 10.9 10.9Z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-line bg-overlay p-1 shadow-xl"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === o.value}
              onClick={() => select(o.value)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-brand/10 ${
                mode === o.value ? "text-brand" : ""
              }`}
            >
              <Icon mode={o.value} />
              <span>{o.label}</span>
              {mode === o.value ? (
                <svg
                  className="ml-auto"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
                </svg>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Icon({ mode }: { mode: Mode }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (mode === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...common}>
        <path d="M20.3 14.6A8.5 8.5 0 1 1 9.4 3.7a6.7 6.7 0 0 0 10.9 10.9Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.8" y="4" width="18.4" height="12.4" rx="1.8" />
      <path d="M8.5 20.2h7" />
    </svg>
  );
}
