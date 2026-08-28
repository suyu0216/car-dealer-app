"use client";

// 自助「忘記密碼」入口——見 ./actions.ts 開頭的說明，取代直接在 Supabase
// 後台手動按重設密碼（那個管道無法指定正確的跳轉網址）。任何已存在的
// 帳號（不管是被邀請的員工，還是自己註冊的車行管理員）都可以從這裡
// 拿到一封「連結正確」的重設密碼信，樣式跟 /login、/auth/set-password
// 統一（同一套米白底＋金色點綴的卡片風格）。
import { useActionState } from "react";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";
import { APP_NAME } from "@/lib/config";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FBF6EC] px-4 dark:bg-neutral-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-[#BFA074]/25 blur-3xl dark:bg-[#BFA074]/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-[#E8542D]/15 blur-3xl dark:bg-[#E8542D]/10"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-[#F0E1CB] bg-white p-8 shadow-xl shadow-[#BFA074]/10 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#BFA074]/15 text-xl">
          🔑
        </div>
        <h1 className="mt-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {APP_NAME}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          忘記密碼了嗎？輸入登入用的 Email，我們會寄一封重設密碼信給您。
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="auth-input mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
            />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}
          {state?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-100">
              {state.success}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#BFA074] py-2.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "發送中…" : "寄送重設密碼信"}
          </button>
        </form>

        <a
          href="/login"
          className="mt-5 block text-center text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
        >
          回登入頁
        </a>
      </div>
    </div>
  );
}
