// 使用者點擊驗證信裡的連結後，Supabase 會先在自己的網域完成驗證，
// 再導回這裡（emailRedirectTo，見 src/app/login/actions.ts 的 signup()，
// 或 src/app/dashboard/staff-actions.ts 的 inviteStaffMember()）。這裡
// 負責把驗證結果換成登入 session，然後導向對應頁面。
//
// 「邀請員工」信件的 type 是 invite——這種連結驗證通過後，使用者雖然
// 已經有 session，但還沒有設定過密碼（下次要重新登入時沒有密碼可用），
// 所以不能像一般註冊驗證那樣直接導去 /dashboard，得先導去
// /auth/set-password 讓他們設定一組密碼，設定完那邊會自己導去 /dashboard。
//
// 判斷是不是「邀請」不能只看網址上的 type 參數——Supabase 在 PKCE flow
// （code=xxx）導回來的網址不一定會保留 type 這個 query string，不同版本
// 行為可能不一樣，賭它一定在容易漏判。改成驗證成功、換到 session 之後，
// 直接讀這個使用者自己的 user_metadata 有沒有 invited_tenant_id 這個
// 欄位——這是 inviteStaffMember() 呼叫 inviteUserByEmail() 時自己塞進去的
// 資料（見 staff-actions.ts），一定準，不用猜 Supabase 的網址參數行為。
//
// 2026-08-28 補充「忘記密碼」自助流程（見 auth/forgot-password/actions.ts
// 的 requestPasswordReset()）：這種連結驗證通過後，也不能直接放行到
// /dashboard——不然等於「點了信裡連結就直接登入」，密碼從頭到尾沒被改過，
// 跟原本要「重設密碼」的目的不符。這裡一樣不能單靠 invited_tenant_id 判斷
// （一般已經在職、不是被邀請進來的員工忘記密碼，metadata 裡根本不會有這個
// 欄位），改成由 requestPasswordReset() 自己在 redirectTo 帶一個
// ?flow=recovery 標記——這是我們自己組出來的網址，不是去猜 Supabase 的
// 行為：Supabase 導回來時就算會多加 code / token 等驗證參數，也只是「加」
// 在後面，不會把 redirectTo 原本帶的 query string 洗掉，所以這個標記讀
// 回來很穩定。
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

async function resolveDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  url: URL
): Promise<string> {
  if (url.searchParams.get("flow") === "recovery") {
    return "/auth/set-password?mode=recovery";
  }

  const { data } = await supabase.auth.getUser();
  const isInvitedStaff = !!data.user?.user_metadata?.invited_tenant_id;
  return isInvitedStaff ? "/auth/set-password" : "/dashboard";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    // PKCE flow（新版 signUp/inviteUserByEmail 預設走這個）。
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(await resolveDestination(supabase, url), url.origin));
    }
  } else if (tokenHash && type) {
    // 舊版 OTP / email link flow。
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      return NextResponse.redirect(new URL(await resolveDestination(supabase, url), url.origin));
    }
  }

  return NextResponse.redirect(
    new URL("/login?error=confirm_failed", url.origin)
  );
}
