"use client";

// 被邀請的員工（或任何完成信件驗證、還沒設定過密碼的帳號）在這裡設定
// 自己的登入密碼——密碼由本人自己輸入，不經過車行管理員的手，也不用
// 另外用 LINE/簡訊傳密碼這種不安全的做法。設定成功後導去 /dashboard，
// 見 ./actions.ts 的 setInitialPassword()。
//
// 2026-08-28：這個頁面現在有兩種來源——(1) 新員工第一次設定密碼
// （auth/confirm/route.ts 判斷 invited_tenant_id 導過來，不帶 mode）、
// (2) 已有帳號的人自助忘記密碼、要重設密碼（auth/forgot-password 那邊
// 觸發，帶 ?mode=recovery 導過來）。底層都是同一個動作（在目前這個已驗證
// 的 session 上呼叫 updateUser({ password })），差別只在文案——「歡迎
// 加入」對一個已經在職很久、只是忘記密碼的人來說不太對，所以用網址上的
// mode 參數切換兩種說法。
import { use, useActionState } from "react";
import { setInitialPassword, type SetPasswordState } from "./actions";
import { APP_NAME } from "@/lib/config";

const initialState: SetPasswordState = {};

export default function SetPasswordPage({
  searchParams,
}: PageProps<"/auth/set-password">) {
  const params = use(searchParams);
  const isRecovery = params?.mode === "recovery";
  const [state, formAction, pending] = useActionState(setInitialPassword, initialState);

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
          🚗
        </div>
        <h1 className="mt-4 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {APP_NAME}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isRecovery
            ? "請設定一組新密碼，設定完成後就能用 Email + 這組新密碼登入。"
            : "歡迎加入！請先設定您的登入密碼，之後就可以用 Email + 這組密碼登入。"}
        </p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="至少 6 個字元"
              // 跟登入頁同一個修正（見 login/page.tsx 的 Field 元件裡更完整
              // 的說明）：文字固定純黑、不跟著深色模式變淺色，並加上
              // auth-input（globals.css）處理瀏覽器自動填入蓋色的問題。
              className="auth-input mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              確認密碼
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="再輸入一次"
              // 同上。
              className="auth-input mt-1 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white"
            />
          </div>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-[#BFA074] py-2.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "設定中…" : "設定密碼並進入系統"}
          </button>
        </form>
      </div>
    </div>
  );
}
