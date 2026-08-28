"use server";

// 忘記密碼的自助入口——取代直接在 Supabase 後台手動按「Send password
// recovery」。後台那顆按鈕沒辦法指定驗證完要跳去哪一頁，預設會導回網站
// 首頁，首頁發現還沒登入又彈回登入畫面，整個「設定新密碼」的步驟就這樣
// 被跳過（2026-08-28 員工 rink3377@gmail.com 的重設密碼信就是卡在這裡）。
//
// 這裡呼叫的 resetPasswordForEmail() 是 Supabase Auth 的公開 API（不需要
// service role key，一般 anon client 就能呼叫），跟 dashboard/
// staff-actions.ts 的 inviteStaffMember() 一樣明確帶 redirectTo，確保
// 驗證完會正確導回 /auth/confirm，再由那邊判斷要不要導去
// /auth/set-password 讓使用者輸入新密碼。redirectTo 額外帶的
// ?flow=recovery 標記，用途見 auth/confirm/route.ts 開頭的說明。
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/site-url";

export interface ForgotPasswordState {
  error?: string;
  success?: string;
}

/** 把常見的 Supabase 重設密碼錯誤訊息轉成中文，其餘原樣顯示。 */
function translateResetError(message: string): string {
  if (/rate limit|after \d+ seconds|security purposes/i.test(message)) {
    return "請求太頻繁，請稍等一下再試一次。";
  }
  if (/unable to validate email address/i.test(message)) {
    return "Email 格式不正確。";
  }
  return `發送失敗：${message}`;
}

export async function requestPasswordReset(
  _prevState: ForgotPasswordState | undefined,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "請輸入 Email。" };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?flow=recovery`,
  });

  if (error) {
    return { error: translateResetError(error.message) };
  }

  // 不管這個信箱有沒有對應帳號，都回同一句成功訊息——這是
  // resetPasswordForEmail() 本身的設計（信箱不存在也不會回傳錯誤），前端
  // 跟著這樣處理，才不會被拿來測試「這個 Email 是不是已經註冊過」。
  return {
    success:
      "如果這個信箱有對應的帳號，我們已經寄出重設密碼信，請至信箱查收（記得也看一下垃圾郵件匣）。",
  };
}
