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

// 左側品牌欄要秀給登入者看的功能清單——都是這套系統真的有做的功能（車輛
// 庫存/CRM/合約/經營數據，見 dashboard/_components/*），不寫誇大或還沒
// 做出來的東西，跟 /inventory 展間頁「只放真的上架的車、不寫假熱門」是
// 一樣的原則。
const HIGHLIGHTS = [
  "車輛庫存與進銷存管理",
  "客戶追蹤與合約成交紀錄",
  "業務薪資與經營數據看板",
];

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#FBF6EC] px-4 py-10 dark:bg-neutral-950">
      {/* 背景裝飾——兩個模糊色塊，跟品牌金色（#BFA074，後台一路都用這個
          顏色）跟登入完成後要去的方向（車輛/展間）互相呼應，純視覺、不
          影響任何互動。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-96 w-96 rounded-full bg-[#BFA074]/25 blur-3xl dark:bg-[#BFA074]/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-[#E8542D]/15 blur-3xl dark:bg-[#E8542D]/10"
      />

      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl border border-[#F0E1CB] bg-white shadow-xl shadow-[#BFA074]/10 dark:border-neutral-800 dark:bg-neutral-900">
        {/* 左側品牌欄：只在中大螢幕顯示，手機版收起來讓表單有最多空間。 */}
        <div className="hidden w-[42%] flex-col justify-between bg-gradient-to-br from-[#BFA074] to-[#8A6F45] p-10 text-white md:flex">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur">
              🚗
            </div>
            <h1 className="mt-6 text-2xl font-bold leading-snug">{APP_NAME}</h1>
            <p className="mt-5 text-sm leading-relaxed text-white/85">
              為中古車商打造的雲端進銷存與經營管理系統，帳號跟資料都在雲端，
              不再侷限單一台電腦。
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-white/90">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="text-xs text-white/60">多租戶車商雲端管理平台</p>
        </div>

        {/* 右側：實際登入/註冊表單。 */}
        <div className="w-full md:w-[58%]">
          {/* 2026-08 手機版重做：原本手機版只有一小行純文字的品牌標頭
              （小圖示＋文字），跟中大螢幕那塊有漸層底色、標語、功能重點
              列表的品牌欄比起來明顯單薄，這是使用者反映「手機版很陽春」
              的主要來源之一。改成滿版寬度的金色漸層橫幅——不是把整塊
              電腦版品牌欄硬塞進來（手機螢幕高度寶貴，塞完整版會把表單
              擠到要滑很久才看得到），是抓電腦版同一套配色跟語氣，做一個
              高度壓縮過、但看起來一樣有質感的精簡版：圖示＋品牌名稱＋
              一句話標語，取代原本光禿禿一行字。外層卡片本身有
              `overflow-hidden rounded-3xl`（見上面），這塊橫幅的直角
              上緣會自動被裁成跟卡片一致的圓角，不用額外處理。 */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-[#BFA074] to-[#8A6F45] px-6 py-5 text-white md:hidden">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 text-xl backdrop-blur">
              🚗
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-tight">{APP_NAME}</p>
              <p className="truncate text-xs text-white/80">中古車商雲端進銷存管理平台</p>
            </div>
          </div>

          <div className="p-8 sm:p-10">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {mode === "login" ? "歡迎回來" : "建立車行帳戶"}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {mode === "login"
              ? "請使用您車行的帳號登入。"
              : "建立您專屬的車行帳戶，立即開始使用進銷存與收支管理。"}
          </p>

          {/* 分頁切換 */}
          <div className="mt-6 grid grid-cols-2 rounded-lg border border-[#F0E1CB] bg-[#FBF6EC] p-1 text-sm dark:border-neutral-800 dark:bg-neutral-950">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={
                "rounded-md py-1.5 font-medium transition " +
                (mode === "login"
                  ? "bg-[#BFA074] text-white shadow-sm"
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
                  ? "bg-[#BFA074] text-white shadow-sm"
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
            <form action={loginAction} className="mt-5 space-y-4">
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
              {/* 2026-08-28 新增：取代原本只能靠管理員在 Supabase 後台手動
                  處理的忘記密碼流程，見 auth/forgot-password/actions.ts。 */}
              <div className="-mt-2 text-right">
                <a
                  href="/auth/forgot-password"
                  className="text-xs text-neutral-500 underline-offset-2 hover:text-neutral-900 hover:underline dark:hover:text-neutral-100"
                >
                  忘記密碼？
                </a>
              </div>

              {loginState?.error && <ErrorBanner message={loginState.error} />}

              <button
                type="submit"
                disabled={loginPending}
                className="w-full rounded-lg bg-[#BFA074] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginPending ? "登入中…" : "登入"}
              </button>
            </form>
          ) : (
            <form action={signupAction} className="mt-5 space-y-4">
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
                className="w-full rounded-lg bg-[#BFA074] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signupPending ? "註冊中…" : "註冊新帳號"}
              </button>
            </form>
          )}

          {/* 重新發送驗證信：連結過期或沒收到信時用。 */}
          <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
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
                    className="w-full rounded-lg border border-[#E8D5B5] px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-[#FBF6EC] disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    {resendPending ? "發送中…" : "重新發送驗證信"}
                  </button>
                </form>
              </div>
            )}
          </div>
          </div>
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
        // 這裡改了兩層，兩個都跟「文字顏色太淺」這個問題有關：
        // 1) 文字固定用純黑（text-black），不再跟著 dark: 深色模式切換——
        //    原本深色模式底下文字會變成淺灰（dark:text-neutral-100），
        //    如果使用者手機是深色模式，先前只改亮色模式的 text-black
        //    根本不會生效，畫面上看到的其實還是舊的淺色文字，這很可能就
        //    是「改了還是一樣」的真正原因。這個輸入框固定一種樣子（米白底
        //    ＋純黑字），不再有兩種可能，不管手機是亮色還深色模式都一樣。
        // 2) auth-input 這個 class（見 globals.css）：處理瀏覽器自動填入
        //    帳密時，瀏覽器自己蓋顏色蓋掉我們設定顏色的問題，同時搭配
        //    layout.tsx 的 viewport.colorScheme 設定，關掉部分手機瀏覽器
        //    「自動幫深色模式使用者調整網頁顏色」的功能——這個自動調色是
        //    瀏覽器演算法自己黑箱處理的，也可能是「不管怎麼改都一樣」的
        //    原因之一。
        className="auth-input mt-1 w-full rounded-lg border border-neutral-200 bg-[#FBF6EC]/60 px-3 py-2 text-sm text-black outline-none placeholder:text-neutral-400 transition focus:border-[#BFA074] focus:bg-white"
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
