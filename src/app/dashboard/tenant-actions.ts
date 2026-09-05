"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadTenantLogo } from "@/lib/supabase/storage";

export interface TenantProfileState {
  error?: string;
  success?: boolean;
  /** 車行資料已成功更新，但 Logo 上傳失敗——不阻斷儲存，比照
   * cars-actions.ts 對車輛照片上傳失敗的處理方式（非阻斷性警告）。 */
  warning?: string;
}

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/** 選填數字欄位（Google 星等／評論則數）：空字串維持 null，有填才轉數字；
 * 填了但不是合法數字的話回傳 undefined 讓呼叫端擋下、顯示錯誤訊息，不要
 * 悄悄存成 0 或 NaN。 */
function optionalNumber(formData: FormData, name: string): number | null | undefined {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 更新車行品牌資料（名稱/電話/地址/營業時間/LINE/Logo）。只有車行管理員
 * （tenant_admin）能改——RLS 的 tenants_admin_update policy 是最後一道
 * 防線，這裡先做一次友善的錯誤訊息，不用等到資料庫層才發現沒權限。
 */
export async function updateTenantProfile(
  _prevState: TenantProfileState | undefined,
  formData: FormData
): Promise<TenantProfileState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能修改品牌設定，請聯繫管理員協助。" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "請輸入車行名稱。" };
  }

  // Google 星等／評論則數是選填數字，但填了就要是合法數字——optionalNumber
  // 回傳 undefined 代表「填了但看不懂」，這裡直接擋下、不要悄悄存錯資料。
  const googleRating = optionalNumber(formData, "google_rating");
  if (googleRating === undefined) {
    return { error: "Google 星等請填 0-5 之間的數字（可以有小數，例如 4.8）。" };
  }
  if (googleRating !== null && (googleRating < 0 || googleRating > 5)) {
    return { error: "Google 星等請填 0-5 之間的數字。" };
  }
  const googleReviewCount = optionalNumber(formData, "google_review_count");
  if (googleReviewCount === undefined) {
    return { error: "Google 評論則數請填整數。" };
  }
  if (googleReviewCount !== null && googleReviewCount < 0) {
    return { error: "Google 評論則數不能是負數。" };
  }

  const supabase = await createClient();

  const updatePayload: {
    name: string;
    phone: string | null;
    address: string | null;
    business_hours: string | null;
    line_id: string | null;
    brand_story: string | null;
    facebook_url: string | null;
    instagram_url: string | null;
    tiktok_url: string | null;
    services_text: string | null;
    value_props_text: string | null;
    google_rating: number | null;
    google_review_count: number | null;
    google_review_url: string | null;
    onboarding_completed: boolean;
    logo_url?: string;
  } = {
    name,
    phone: optionalText(formData, "phone"),
    address: optionalText(formData, "address"),
    business_hours: optionalText(formData, "business_hours"),
    line_id: optionalText(formData, "line_id"),
    brand_story: optionalText(formData, "brand_story"),
    // 社群媒體連結：跟前台展間 footer「傳送門」區塊對應（見
    // showroom-page.tsx 的 SocialIcon 區塊），選填、沒填的平台就不顯示。
    facebook_url: optionalText(formData, "facebook_url"),
    instagram_url: optionalText(formData, "instagram_url"),
    tiktok_url: optionalText(formData, "tiktok_url"),
    // 2026-08 新增：服務項目／品牌價值主張，換行分隔一條一條，選填，見
    // showroom-page.tsx 對應的前台區塊。
    services_text: optionalText(formData, "services_text"),
    value_props_text: optionalText(formData, "value_props_text"),
    // 前台信任徽章：Google 星等／評論則數／評論頁連結，見
    // tenants.google_rating 的說明，手動填、不是即時串接 API。
    google_rating: googleRating,
    google_review_count: googleReviewCount,
    google_review_url: optionalText(formData, "google_review_url"),
    // 不管是從 Onboarding 引導畫面填的，還是之後在「品牌設定」分頁編輯，
    // 只要成功送出過一次就算完成 Onboarding——已經完成的車行再存一次，
    // 這欄本來就已經是 true，設定成 true 沒有副作用。
    onboarding_completed: true,
  };

  // Logo 只有真的選了新檔案才上傳並覆蓋 logo_url；沒選就完全不碰這個欄位，
  // 保留原本的 Logo（跟車輛照片編輯的邏輯一致，見 cars-actions.ts）。
  let logoWarning: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const { url, error: uploadError } = await uploadTenantLogo(supabase, profile.tenant_id!, logo);
    if (uploadError) {
      console.error(`[updateTenantProfile] Logo 上傳失敗（車行 ${profile.tenant_id} 其餘欄位仍會更新）：${uploadError}`);
      logoWarning = `車行資料已成功更新，但 Logo 上傳失敗（${uploadError}），Logo 維持原樣，請稍後重新嘗試。`;
    } else if (url) {
      updatePayload.logo_url = url;
    }
  }

  const { error } = await supabase
    .from("tenants")
    .update(updatePayload)
    .eq("id", profile.tenant_id!);

  if (error) {
    return { error: `更新車行資料失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true, warning: logoWarning };
}

export interface ProfitShareSettingsState {
  error?: string;
  success?: boolean;
}

/**
 * 「淨利／分潤試算」小工具（會計頁面分頁）的開關＋股權比例設定。獨立成
 * 自己的 Server Action、不是塞進 updateTenantProfile()，是因為這兩件事
 * 完全無關（品牌設定 vs 財務分潤安排），使用場景也不同：這個是在「淨利
 * ／分潤試算」分頁裡就地送出，不是在「品牌設定」表單裡。只有車行管理員
 * 能改，跟其他車行設定同一套權限模式，RLS 的 tenants_admin_update 是
 * 最後一道防線。
 */
export async function updateProfitShareSettings(
  _prevState: ProfitShareSettingsState | undefined,
  formData: FormData
): Promise<ProfitShareSettingsState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能設定分潤試算。" };
  }

  const enabled = formData.get("profit_share_enabled") === "on";

  // 股權比例選填（可以先開啟功能、之後再回來填比例），但填了就要是
  // 0-100 之間的合法數字，不要悄悄存成 NaN 或負數——比照 updateTenantProfile()
  // 對 Google 星等的處理方式。
  const equityPercent = optionalNumber(formData, "profit_share_equity_percent");
  if (equityPercent === undefined) {
    return { error: "股權比例請填 0-100 之間的數字（可以有小數，例如 30 代表 30%）。" };
  }
  if (equityPercent !== null && (equityPercent < 0 || equityPercent > 100)) {
    return { error: "股權比例請填 0-100 之間的數字。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({
      profit_share_enabled: enabled,
      profit_share_equity_percent: equityPercent,
    })
    .eq("id", profile.tenant_id!);

  if (error) {
    return { error: `設定失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Onboarding 引導畫面的「稍後再說」：只標記完成過 Onboarding，不動任何
 * 品牌資料欄位——車行之後隨時可以回「品牌設定」分頁補填。
 */
export async function skipOnboarding(): Promise<{ error?: string }> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能操作。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenants")
    .update({ onboarding_completed: true })
    .eq("id", profile.tenant_id!);

  if (error) {
    return { error: `操作失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return {};
}
