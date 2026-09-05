"use server";

// 「品牌簡介首圖橫幅相簿」CRUD——安安可以自己隨時上傳/刪除首頁最上面那張
// 大圖，不用每次都找工程師改 hero_image_url 這個舊的單張欄位。見
// tenant-hero-photos-module.tsx（後台管理 UI）跟 showroom-home-section.tsx
// （前台顯示，改成左右翻頁的相簿）。跟 tenant-reviews-actions.ts 同一套
// 權限模式：只有車行管理員（tenant_admin）能新增/刪除，RLS 的
// tenant_hero_photos_tenant_scoped 是最後一道防線，這裡先做一次友善的
// 錯誤訊息。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadTenantHeroPhoto } from "@/lib/supabase/storage";

export interface TenantHeroPhotoFormState {
  error?: string;
  success?: boolean;
}

/**
 * 新增一張首圖橫幅相簿照片。跟精選評論小卡不同的地方：這裡的照片是
 * 「必填」的——一張沒有圖片的首圖橫幅項目沒有意義，所以照片上傳失敗會
 * 直接擋下整筆新增（不是像評論小卡那樣非阻斷性警告）。sort_order 一樣
 * 直接用「目前已有幾張」當下一個順位，不需要另外做拖曳排序 UI——安安要
 * 調整順序的話刪除重傳即可，這個功能的使用頻率不值得做拖曳排序的複雜度。
 */
export async function createTenantHeroPhoto(
  _prevState: TenantHeroPhotoFormState | undefined,
  formData: FormData
): Promise<TenantHeroPhotoFormState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理首圖橫幅相簿。" };
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { error: "請選擇一張照片。" };
  }

  const supabase = await createClient();

  const { url, error: uploadError } = await uploadTenantHeroPhoto(supabase, profile.tenant_id!, photo);
  if (uploadError || !url) {
    return { error: `照片上傳失敗：${uploadError ?? "未知錯誤"}` };
  }

  const { count } = await supabase
    .from("tenant_hero_photos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id!);

  const { error } = await supabase.from("tenant_hero_photos").insert({
    tenant_id: profile.tenant_id!,
    url,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: `新增失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}

/** 刪除一張首圖橫幅相簿照片——只需要 id，RLS 的
 * tenant_hero_photos_tenant_scoped 會確保只能刪到自己車行的，這裡額外用
 * .eq("tenant_id", ...) 雙重保險。 */
export async function deleteTenantHeroPhoto(photoId: string): Promise<{ error?: string }> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理首圖橫幅相簿。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_hero_photos")
    .delete()
    .eq("id", photoId)
    .eq("tenant_id", profile.tenant_id!);

  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return {};
}
