// 前台「顧客怎麼說」精選評論小卡用——查詢車行自己手動貼上的 Google 評論
// 精選（tenant_reviews 表），完全公開、不需要登入。跟 public-videos.ts／
// public-staff.ts 同一個慣例：獨立檔案、白名單式 select 欄位清單，這張表
// 本身沒有任何內部帳務欄位，全部欄位都可以放心回傳。見
// tenant-reviews-module.tsx（後台管理 UI）跟 showroom-home-section.tsx
// （前台顯示）。
import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function publicTenantReviewsQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("tenant_reviews")
    .select("id, author_name, rating, review_text, photo_url, sort_order, created_at")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
