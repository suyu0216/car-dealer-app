// Data Access Layer：集中管理「目前登入者是誰、屬於哪個車行、什麼角色」。
// 依 Next.js 官方建議，所有需要驗證的 Server Component / Server Action
// 都應透過這裡取得 session，而不是各自讀取 cookies。
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { Profile } from "./types";

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, name, can_view_cost, can_view_salary, can_edit_cars, created_at")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // 帳號存在但沒有對應的 profile（理論上不會發生，因為有建立
    // profile 的 trigger）。在伺服器 console 印出完整診斷資訊 —— 不要只
    // 丟一句通用訊息，把 user id/email、profile 是否存在、Supabase/
    // PostgREST 實際回傳的 error（message/code/details/hint）全部印出來，
    // 之後在終端機（或 Vercel/production 環境的 log）就能直接看到根因。
    console.error("[dal.getCurrentProfile] 找不到 profile，診斷資訊：", {
      userId: user.id,
      userEmail: user.email,
      hasProfileRow: !!profile,
      supabaseError: error
        ? {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          }
        : null,
    });

    // 同樣的關鍵欄位也帶到 /login 的 query string，讓畫面上能直接顯示
    // 具體錯誤（不是只有一句通用提示），不用另外去翻 server log。
    const params = new URLSearchParams({ error: "profile_missing" });
    params.set("uid", user.id);
    if (user.email) params.set("email", user.email);
    if (error?.message) params.set("emsg", error.message);
    if (error?.code) params.set("ecode", error.code);

    // 可以放心直接 redirect：proxy.ts 對 /login 完全不做 session 檢查、
    // 不會再把使用者彈回受保護頁面，所以這裡不會形成無限重導向。
    redirect(`/login?${params.toString()}`);
  }

  return { user, profile: profile as Profile };
});

/** 只允許 super_admin 進入的頁面使用。 */
export async function requireSuperAdmin() {
  const { user, profile } = await getCurrentProfile();
  if (profile.role !== "super_admin") {
    redirect("/dashboard");
  }
  return { user, profile };
}

/** 只允許一般車商（tenant_admin / staff）進入的頁面使用。 */
export async function requireTenantUser() {
  const { user, profile } = await getCurrentProfile();
  if (profile.role === "super_admin") {
    redirect("/super-admin");
  }
  if (!profile.tenant_id) {
    // 帳號尚未被指派車行，無法讀寫任何業務資料。
    redirect("/login?error=no_tenant");
  }
  return { user, profile };
}
