"use server";

// 「影音專區」管理——車行貼上自己在抖音／YouTube 等平台發布的影片連結，
// 不是上傳影片檔案本身（見 tenant_videos 表跟 supabase_schema.sql 的
// 說明）。跟 crm/repair_items 那種「單筆狀態切換」不一樣，這裡是「新增/
// 刪除清單項目」，所以是兩支獨立的輕量 Server Action，讓
// video-settings-section.tsx 用 useTransition 直接呼叫（不用整個表單/
// useActionState），列表本身在前端用本地 state 管理，成功後直接把新增/
// 刪除的結果反映在畫面上，不用等整頁重新整理。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { TenantVideo } from "@/lib/supabase/types";

export interface VideoActionResult {
  error?: string;
  success?: boolean;
  video?: TenantVideo;
}

/** 同一個車行最多能貼幾支影片——防止清單被無限灌爆，展間頁也不適合放
 * 太多支影片。 */
const MAX_VIDEOS_PER_TENANT = 12;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 新增一支影片連結。只有車行管理員（tenant_admin）能操作——跟品牌設定
 * 其他欄位（brand-settings-module.tsx）同一個權限層級，一般業務不能自己
 * 改車行對外形象相關的內容。
 */
export async function addTenantVideo(
  _prevState: VideoActionResult | undefined,
  formData: FormData
): Promise<VideoActionResult> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理影音專區，請聯繫管理員協助。" };
  }

  const videoUrl = String(formData.get("video_url") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!videoUrl || !isHttpUrl(videoUrl)) {
    return { error: "請貼上正確的影片網址（例如抖音或 YouTube 的影片連結）。" };
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from("tenant_videos")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id!);

  if ((count ?? 0) >= MAX_VIDEOS_PER_TENANT) {
    return { error: `最多只能新增 ${MAX_VIDEOS_PER_TENANT} 支影片，請先刪除不需要的影片再新增。` };
  }

  const { data, error } = await supabase
    .from("tenant_videos")
    .insert({
      tenant_id: profile.tenant_id!,
      title: title || null,
      video_url: videoUrl,
      sort_order: count ?? 0,
    })
    .select("id, tenant_id, title, video_url, sort_order, created_at")
    .single();

  if (error || !data) {
    return { error: `新增影片失敗：${error?.message ?? "未知錯誤"}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true, video: data as TenantVideo };
}

/** 刪除一支影片連結。額外帶 `tenant_id` 條件是保險措施——RLS 本來就會擋
 * 掉跨車行操作，這裡多一層讓意圖更明確，不是安全邊界本身。 */
export async function deleteTenantVideo(videoId: string): Promise<VideoActionResult> {
  const { profile } = await requireTenantUser();

  if (profile.role !== "tenant_admin") {
    return { error: "只有車行管理員能管理影音專區，請聯繫管理員協助。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tenant_videos")
    .delete()
    .eq("id", videoId)
    .eq("tenant_id", profile.tenant_id!);

  if (error) {
    return { error: `刪除影片失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}
