"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";
import type { Profile } from "@/lib/supabase/types";

export interface LoginState {
  error?: string;
}

export interface SignupState {
  error?: string;
  success?: string;
}

export interface ResendState {
  error?: string;
  success?: string;
}

/** 把常見的 Supabase 註冊錯誤訊息轉成中文，其餘原樣顯示。 */
function translateSignupError(message: string): string {
  const known: Record<string, string> = {
    "User already registered": "此 Email 已經註冊過，請直接登入。",
    "Password should be at least 6 characters":
      "密碼長度不足，請至少輸入 6 個字元。",
    "Unable to validate email address: invalid format":
      "Email 格式不正確。",
    "Signup requires a valid password": "請輸入有效的密碼。",
  };
  return known[message] ?? `註冊失敗：${message}`;
}

/** 把 Supabase 登入錯誤轉成中文，不把內部錯誤代碼/訊息暴露給使用者
 * （原本這裡有一段 `[TEMP DEBUG] ...` 忘記移除的除錯輸出，會把 Supabase
 * Auth 的內部錯誤名稱/HTTP 狀態碼/原文訊息直接顯示給任何嘗試登入的人，
 * 已經拿掉——詳細錯誤只寫進 server log，前端一律看到籠統的中文提示，
 * 避免洩漏系統內部細節、也避免被用來判斷帳號是否存在）。 */
function translateLoginError(message: string): string {
  if (/email not confirmed/i.test(message)) {
    return "這個帳號的 Email 尚未完成驗證，請先到信箱點擊驗證連結。";
  }
  if (/rate limit|after \d+ seconds|security purposes/i.test(message)) {
    return "登入嘗試太頻繁，請稍等一下再試一次。";
  }
  return "帳號或密碼錯誤，請重新輸入。";
}

/** 把常見的 Supabase 重寄驗證信錯誤訊息轉成中文，其餘原樣顯示。 */
function translateResendError(message: string): string {
  if (/already.*confirmed/i.test(message)) {
    return "此帳號已完成驗證，請直接登入即可。";
  }
  if (/rate limit|after \d+ seconds|security purposes/i.test(message)) {
    return "請求太頻繁，請稍等一下再試一次。";
  }
  if (/unable to validate email address/i.test(message)) {
    return "Email 格式不正確。";
  }
  return `重新發送失敗：${message}`;
}

export async function login(
  _prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "請輸入 Email 與密碼。" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    if (error) {
      console.error("登入失敗：", error.name, error.status, error.message);
    }
    return { error: translateLoginError(error?.message ?? "") };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  const role = (profile as Pick<Profile, "role"> | null)?.role;

  redirect(role === "super_admin" ? "/super-admin" : "/dashboard");
}

export async function signup(
  _prevState: SignupState | undefined,
  formData: FormData
): Promise<SignupState> {
  const name = String(formData.get("name") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!companyName) {
    return { error: "請輸入車行/公司名稱。" };
  }
  if (!email || !password) {
    return { error: "請輸入 Email 與密碼。" };
  }
  if (password.length < 6) {
    return { error: "密碼至少需要 6 個字元。" };
  }
  if (password !== confirmPassword) {
    return { error: "兩次輸入的密碼不一致。" };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // 存進 auth.users.raw_user_meta_data，supabase_schema.sql 的
      // handle_new_user() trigger 會讀出 company_name，自動建立一間新
      // 車行（tenants）、並把這個使用者設成該車行的 tenant_admin。
      data: {
        name: name || undefined,
        company_name: companyName,
      },
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    return { error: translateSignupError(error.message) };
  }

  if (!data.user) {
    return { error: "註冊失敗，請稍後再試。" };
  }

  // tenants + profiles 資料列都由資料庫的 on_auth_user_created trigger
  // 自動建立（新車行 + role='tenant_admin' + 綁定 tenant_id），
  // 不需要在這裡另外寫入。

  if (!data.session) {
    // 這個 Supabase 專案啟用了 Email 驗證：註冊成功但尚未登入，
    // 使用者需要先收信完成驗證。
    return {
      success: `註冊成功！「${companyName}」已建立為您的專屬車行，我們已寄出驗證信，請至信箱完成驗證後再登入。`,
    };
  }

  // 專案未啟用 Email 驗證：signUp 直接回傳有效 session，等同已登入，
  // 直接進入自己車行的主控台。
  redirect("/dashboard");
}

export async function resendConfirmation(
  _prevState: ResendState | undefined,
  formData: FormData
): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "請輸入 Email。" };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // type: 'signup' 專門用來重寄「註冊驗證信」（不是密碼重設信）。
  // 對已經驗證過的帳號呼叫這個 API，Supabase 會回傳錯誤，
  // translateResendError() 會把它轉成「請直接登入」的提示。
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
    },
  });

  if (error) {
    return { error: translateResendError(error.message) };
  }

  return {
    success: "已重新寄出驗證信，請至信箱查收（記得也看一下垃圾郵件匣）。",
  };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
