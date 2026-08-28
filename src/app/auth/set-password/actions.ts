"use server";

// 被邀請的員工點完信件連結、驗證通過後會落在這個頁面——這時候已經有
// session（見 src/app/auth/confirm/route.ts），但 Supabase Auth 那邊還
// 沒有密碼可用，所以要先在這裡設定一組，之後才能用 Email + 密碼正常登入。
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SetPasswordState {
  error?: string;
}

export async function setInitialPassword(
  _prevState: SetPasswordState | undefined,
  formData: FormData
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 6) {
    return { error: "密碼至少需要 6 個字元。" };
  }
  if (password !== confirmPassword) {
    return { error: "兩次輸入的密碼不一致。" };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "驗證已過期，請重新點擊邀請信裡的連結，或請車行管理員重新邀請一次。",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `設定密碼失敗：${error.message}` };
  }

  redirect("/dashboard");
}
