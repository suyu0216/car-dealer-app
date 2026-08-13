"use client";

import { use, useActionState, useEffect, useState } from "react";
import {
  login,
  resendConfirmation,
  signup,
  type LoginState,
  type ResendState,
  type SignupState,
} from "./actions";
import { APP_NAME } from "@/lib/config";

const loginInitialState: LoginState = {};
const signupInitialState: SignupState = {};
const resendInitialState: ResendState = {};

const NOTICE_BY_ERROR_CODE: Record<string, string> = {
  no_tenant:
    "帳號已建立，但尚未被指派車行。請聯繫平台管理員完成指派後再登入。",
  confirm_failed: "驗證連結無效或已過期，請重新註冊或聯繫平台管理員。",
  profile_missing:
    "帳號資料異常，找不到對應的使用者資料，請聯繫平台管理員協助處理。",
};

export default function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = use(searchParams);
  const errorCode = typeof params?.error === "string" ? params.error : undefined;
  const notice = errorCode ? NOTICE_BY_ERROR_CODE[errorCode] : undefined;

  // dal.ts 在 profile 查詢失敗時，會把 user id / email 跟 Supabase 實際
  // 回傳的 error 一起帶在 query string 上（見 src/lib/supabase/dal.ts），
  // 這裡印出來取代單一句「異常」提示，也同時印到瀏覽器 console 方便複製。
  const debugDetails =
    errorCode === "profile_missing"
      ? {
          "User ID": typeof params?.uid === "string" ? params.uid : "(未知)",
          Email: typeof params?.email === "string" ? params.email : "(未知)",
          "Profile 是否存在": "否（查詢無資料）",
          "Supabase 錯誤代碼":
            typeof params?.ecode === "string" ? params.ecode : "(無，單純查無資料列)",
          "Supabase 錯誤訊息":
            typeof params?.emsg === "string" ? params.emsg : "(無)",
        }
      : undefined;

  useEffect(() => {
    if (debugDetails) {
      console.error("[/login] profile_missing 詳細資訊：", debugDetails);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCode]);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(
    login,
    loginInitialState
  );
  const [signupState, signupAction, signupPending] = useActionState(
    signup,
    signupInitialState
  );

  // 驗證連結過期／沒收到信時（error=confirm_failed）預設直接展開，
  // 其他情況收合起來，靠下面的小連結手動展開。
  const [showResend, setShowResend] = useState(errorCode === "confirm_failed");
  const [resendState, resendAction, resendPending] = useActionState(
    resendConfirmation,
    resendInitialState
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {APP_NAME}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {mode === "login"
            ? "請使用您車行的帳號登入。"
            : "建立您專屬的車行帳戶，立即開始使用進銷存與收支管理。"}
        </p>

        {/* 分頁切換 */}
        <div className="mt-6 grid grid-cols-2 rounded-lg border border-neutral-200 p-1 text-sm dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={
              "rounded-md py-1.5 font-medium transition " +
              (mode === "login"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100")
            }
          >
            登入
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={
              "rounded-md py-1.5 font-medium transition " +
              (mode === "signup"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100")
            }
          >
            註冊新帳號
          </button>
        </div>

        {notice && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
            {notice}
          </p>
        )}

        {debugDetails && (
          <details className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <summary className="cursor-pointer select-none font-medium">
              詳細錯誤資訊（除錯用，同樣已印在瀏覽器 console）
            </summary>
            <dl className="mt-2 space-y-1 font-mono">
              {Object.entries(debugDetails).map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="shrink-0 opacity-70">{label}：</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}

        {mode === "login" ? (
          <form action={loginAction} className="mt-4 space-y-4">
            <Field
              id="email"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              id="password"
              name="password"
              type="password"
              label="密碼"
              autoComplete="current-password"
              placeholder="••••••••"
            />

            {loginState?.error && <ErrorBanner message={loginState.error} />}

            <button
              type="submit"
              disabled={loginPending}
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {loginPending ? "登入中…" : "登入"}
            </button>
          </form>
        ) : (
          <form action={signupAction} className="mt-4 space-y-4">
            <Field
              id="companyName"
              name="companyName"
              type="text"
              label="車行/公司名稱"
              autoComplete="organization"
              placeholder="例如：日興中古車行"
            />
            <p className="-mt-3 text-xs text-neutral-400">
              系統會自動為您建立這間車行，並將您設為車行管理員。
            </p>
            <Field
              id="name"
              name="name"
              type="text"
              label="姓名（選填）"
              autoComplete="name"
              placeholder="你的名字"
              required={false}
            />
            <Field
              id="signup-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              id="signup-password"
              name="password"
              type="password"
              label="密碼"
              autoComplete="new-password"
              placeholder="至少 6 個字元"
            />
            <Field
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              label="確認密碼"
              autoComplete="new-password"
              placeholder="再輸入一次密碼"
            />

            {signupState?.error && <ErrorBanner message={signupState.error} />}
            {signupState?.success && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                {signupState.success}
              </p>
            )}

            <button
              type="submit"
              disabled={signupPending}
              className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
            >
              {signupPending ? "註冊中…" : "註冊新帳號"}
            </button>
          </form>
        )}

        {/* 重新發送驗證信：連結過期或沒收到信時用。 */}
        <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          {!showResend ? (
            <button
              type="button"
              onClick={() => setShowResend(true)}
              className="text-sm text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
            >
              沒收到驗證信，或連結已過期？重新發送
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  重新發送驗證信
                </p>
                <button
                  type="button"
                  onClick={() => setShowResend(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  收起
                </button>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                輸入註冊時使用的 Email，我們會重新寄出一封驗證信。
              </p>
              <form action={resendAction} className="mt-3 space-y-3">
                <Field
                  id="resend-email"
                  name="email"
                  type="email"
                  label="Email"
                  autoComplete="email"
                  placeholder="you@example.com"
                />

                {resendState?.error && (
                  <ErrorBanner message={resendState.error} />
                )}
                {resendState?.success && (
                  <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    {resendState.success}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={resendPending}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {resendPending ? "發送中…" : "重新發送驗證信"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  type,
  label,
  autoComplete,
  placeholder,
  required = true,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  autoComplete: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950"
        placeholder={placeholder}
      />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
      {message}
    </p>
  );
}
