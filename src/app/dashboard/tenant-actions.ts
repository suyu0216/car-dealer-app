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

  const supabase = await createClient();

  const updatePayload: {
    name: string;
    phone: string | null;
    address: string | null;
    business_hours: string | null;
    line_id: string | null;
    onboarding_completed: boolean;
    logo_url?: string;
  } = {
    name,
    phone: optionalText(formData, "phone"),
    address: optionalText(formData, "address"),
    business_hours: optionalText(formData, "business_hours"),
    line_id: optionalText(formData, "line_id"),
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
