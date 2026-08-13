// 使用者點擊註冊驗證信裡的連結後，Supabase 會先在自己的網域完成驗證，
// 再導回這裡（emailRedirectTo，見 src/app/login/actions.ts 的 signup()）。
// 這裡負責把驗證結果換成登入 session，然後導向對應頁面。
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    // PKCE flow（新版 signUp 預設走這個）。
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL("/dashboard", url.origin));
    }
  } else if (tokenHash && type) {
    // 舊版 OTP / email link flow。
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(new URL("/dashboard", url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=confirm_failed", url.origin)
  );
}
