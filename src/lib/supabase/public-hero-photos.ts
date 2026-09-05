// 前台品牌簡介首頁首圖橫幅相簿用——查詢車行自己上傳的首圖照片
// （tenant_hero_photos 表），完全公開、不需要登入。跟 public-reviews.ts／
// public-videos.ts 同一個慣例：獨立檔案、白名單式 select 欄位清單，這張表
// 本身沒有任何內部帳務欄位，全部欄位都可以放心回傳。見
// tenant-hero-photos-module.tsx（後台管理 UI）跟 showroom-home-section.tsx
// （前台顯示）。
import type { createClient } from "./server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function publicTenantHeroPhotosQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("tenant_hero_photos")
    .select("id, url, sort_order, created_at")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
}
