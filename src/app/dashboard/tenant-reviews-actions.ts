"use server";

// 「精選評論小卡」CRUD——安安手動從 Google 評論複製貼上幾則真實好評，
// 顯示在前台看車頁（/inventory）的「顧客怎麼說」區塊，見
// tenant-reviews-module.tsx（後台管理 UI）跟 showroom-page.tsx（前台顯示）。
// 跟 tenant-actions.ts 的 updateTenantProfile 同一套權限模式：只有車行
// 管理員（tenant_admin）能新增/刪除，RLS 的 tenant_reviews_tenant_scoped
// 是最後一道防線，這裡先做一次友善的錯誤訊息。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadTenantReviewPhoto } from "@/lib/supabase/storage";

export interface TenantReviewFormState {
  error?: string;
  success?: boolean;
  /** 評論本身新增成功，但見證照上傳失敗——不阻斷新增，比照
   * tenant-actions.ts 對 Logo 上傳失敗的處理方式（非阻斷性警告）。 */
  warning?: string;
}

/**
 * 新增一則精選評論小卡。rating 沒填就預設 5 星（多數會被貼上來的評論本來
 * 就是好評），sort_order 直接用「目前已有幾則」當下一個順位，不需要
 * 另外做拖曳排序 UI——安安要調整順序的話刪除重貼幾則即可，這個功能的
 * 使用頻率（一次設定，之後偶爾補一兩則）不值得做拖曳排序的複雜度。
 */
export async function createTenantReview(
  _prevState: TenantReviewFormState | undefined,
  formData: FormData
): Promise<TenantReviewFormState> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理精選評論。" };
  }

  const authorName = String(formData.get("author_name") ?? "").trim();
  const reviewText = String(formData.get("review_text") ?? "").trim();
  const ratingRaw = String(formData.get("rating") ?? "5").trim();
  const rating = Number(ratingRaw) || 5;

  if (!authorName) {
    return { error: "請填寫評論者姓名（可以照抄 Google 評論上顯示的名字）。" };
  }
  if (!reviewText) {
    return { error: "請填寫評論內容。" };
  }
  if (rating < 1 || rating > 5) {
    return { error: "星等請選 1-5 星。" };
  }

  const supabase = await createClient();

  // 見證照選填——Google 評論截圖或客人合照，上傳失敗不阻斷這則評論本身
  // 的新增（跟 tenant-actions.ts 的 Logo 上傳失敗處理方式一致），只是
  // 這則評論會沒有配圖，回傳 warning 讓畫面上看得到原因，安安可以之後
  // 刪掉重貼一次補圖。
  let photoWarning: string | undefined;
  const photo = formData.get("photo");
  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const { url, error: uploadError } = await uploadTenantReviewPhoto(supabase, profile.tenant_id!, photo);
    if (uploadError) {
      console.error(`[createTenantReview] 見證照上傳失敗（車行 ${profile.tenant_id}，評論本身仍會新增）：${uploadError}`);
      photoWarning = `評論已成功新增，但見證照上傳失敗（${uploadError}），這則評論暫時沒有配圖，請稍後刪除重貼補圖。`;
    } else if (url) {
      photoUrl = url;
    }
  }

  const { count } = await supabase
    .from("tenant_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id!);

  const { error } = await supabase.from("tenant_reviews").insert({
    tenant_id: profile.tenant_id!,
    author_name: authorName,
    rating,
    review_text: reviewText,
    photo_url: photoUrl,
    sort_order: count ?? 0,
  });

  if (error) {
    return { error: `新增失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true, warning: photoWarning };
}

/** 刪除一則精選評論小卡——只需要 id，RLS 的 tenant_reviews_tenant_scoped
 * 會確保只能刪到自己車行的，這裡額外用 .eq("tenant_id", ...) 雙重保險。 */
export async function deleteTenantReview(reviewId: string): Promise<{ error?: string }> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理精選評論。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("tenant_id", profile.tenant_id!);

  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return {};
}
