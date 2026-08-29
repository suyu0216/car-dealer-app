// Data Access Layer：集中管理「目前登入者是誰、屬於哪個車行、什麼角色」。
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import { VERIFIED_USER_ID_HEADER } from "@/lib/auth-header";
import type { Profile, Tenant } from "./types";

const TENANT_COLUMNS =
  "id, name, phone, address, business_hours, logo_url, line_id, brand_story, hero_image_url, facebook_url, instagram_url, tiktok_url, services_text, value_props_text, status, onboarding_completed, cash_opening_balance, bank_opening_balance, cash_pool_started_at, google_rating, google_review_count, google_review_url, created_at";

/** 目前使用者所屬車行的完整資料，用 React `cache()` 包起來——跟下面
 * `getCurrentProfile` 同一個道理：同一次頁面請求裡，dashboard/layout.tsx
 * （側邊欄要車行名稱）跟 dashboard/page.tsx（主頁要完整車行資料，判斷
 * 停權／Onboarding）都需要同一筆 tenants 資料，原本各自獨立查一次、
 * 對同一張表同一列資料在同一次請求裡重複打了兩次資料庫，是實測有感的
 * 延遲來源之一。包上 `cache()` 之後，同一次請求裡不管幾個 Server
 * Component 各自呼叫 `getTenantById(同一個 tenantId)`，只會真的查一次，
 * 第二次呼叫直接拿第一次的結果，不會重複打資料庫。 */
export const getTenantById = cache(async (tenantId: string): Promise<Tenant | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tenants").select(TENANT_COLUMNS).eq("id", tenantId).single();
  return data as Tenant | null;
});

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();

  // 2026-08 效能優化：proxy.ts 對受保護路徑（/dashboard、/super-admin）
  // 已經呼叫過一次 supabase.auth.getUser()（真的連線 Supabase Auth 驗證
  // token），驗證通過後會把使用者 id 轉發在這個標頭裡——見 auth-header.ts
  // 的完整安全前提說明。這裡看到這個標頭就直接信任、不用再對 Supabase
  // Auth 打第二次網路來回；沒有這個標頭（例如首頁 `/`，不在 proxy.ts 的
  // PROTECTED_PREFIXES 清單裡，這次請求沒有被驗證過）就退回原本每次都
  // 真的驗證一次的寫法，不會因為這個優化而放寬驗證。
  const verifiedUserId = (await headers()).get(VERIFIED_USER_ID_HEADER);

  let user: { id: string; email?: string | null } | null;
  if (verifiedUserId) {
    user = { id: verifiedUserId };
  } else {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  }

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, tenant_id, role, name, can_view_cost, can_view_salary, can_edit_cars, can_view_all_salary, can_approve_repairs, can_manage_finance, public_phone, public_line_id, show_public_contact, public_bio, public_avatar_url, created_at"
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // 走快速路徑（信任標頭）的話這裡還沒有真的跟 Supabase Auth 要過
    // email——這個錯誤分支本來就很少發生，這裡才補打一次拿 email，讓
    // 除錯資訊照舊完整，不影響正常情況下的效能。
    let userEmail = user.email;
    if (userEmail === undefined) {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      userEmail = authUser?.email;
    }

    console.error("[dal.getCurrentProfile] 找不到 profile：", {
      userId: user.id,
      userEmail,
      supabaseError: error,
    });

    // 如果沒有 profile，安全引導回登入頁，帶上記錄資訊——原本這裡漏了把
    // Supabase 實際回傳的錯誤代碼/訊息也帶上（login/page.tsx 的除錯區塊
    // 一直顯示「(無)」，不是真的沒有錯誤，是這裡從來沒有把 error.code /
    // error.message 塞進網址參數，導致那個除錯欄位永遠是預設值、完全沒有
    // 診斷力——這次順便補上，下次再遇到類似問題才看得出真正的錯誤內容。
    const params = new URLSearchParams({ error: "profile_missing" });
    params.set("uid", user.id);
    if (userEmail) params.set("email", userEmail);
    if (error?.code) params.set("ecode", error.code);
    if (error?.message) params.set("emsg", error.message);

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
    redirect("/login?error=no_tenant");
  }
  return { user, profile };
}