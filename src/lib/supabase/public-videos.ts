// 前台「影音專區」用——查詢車行貼的抖音/YouTube等影片連結（tenant_videos
// 表），完全公開、不需要登入。跟 public-cars.ts／public-staff.ts 同一個
// 慣例：獨立檔案、白名單式 select 欄位清單，這張表本身沒有任何內部帳務
// 欄位，全部欄位都可以放心回傳。
import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function publicTenantVideosQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("tenant_videos")
    .select("id, tenant_id, title, video_url, sort_order, created_at")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
