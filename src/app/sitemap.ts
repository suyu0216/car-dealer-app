// 2026-09-05 SEO 優化新增：sitemap.xml——列出所有「已開放（status=active）」
// 車行的公開看車頁五個路徑，幫助搜尋引擎更快發現、更完整地收錄這些頁面
// （沒有 sitemap 不代表完全不會被爬到，但沒有明確清單，搜尋引擎只能
// 慢慢自己摸索連結，收錄速度跟完整度都會打折扣）。
//
// 車行識別是用 `?tenant=<uuid>` 查詢參數（見 public-tenant.ts 開頭的
// 說明），不是路徑——所以這裡產生的每一條網址都帶著查詢參數，這是目前
// 架構下唯一能讓 sitemap 精確指到「某一間車行的展間」的做法。查詢用
// 一般的 anon client（跟其他公開看車頁一律共用同一套 RLS 規則），只挑
// status = 'active' 的車行——pending（審核中）／suspended（已停權）的
// 車行展間本來就不對外開放，不該出現在 sitemap 裡被搜尋引擎收錄。
import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_SHOWROOM_STATUSES } from "@/lib/supabase/public-cars";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://heartease.vercel.app").replace(/\/+$/, "");

/** 每間車行都有的五個展間路徑，跟 showroom-shell.tsx 的導覽分頁一一對應。 */
const SHOWROOM_PATHS = ["/inventory", "/inventory/cars", "/inventory/sold", "/inventory/services", "/inventory/trade-in"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();
  const { data: tenants } = await supabase.from("tenants").select("id").eq("status", "active");

  const entries: MetadataRoute.Sitemap = [];
  for (const tenant of tenants ?? []) {
    for (const path of SHOWROOM_PATHS) {
      entries.push({
        url: `${SITE_URL}${path}?tenant=${tenant.id}`,
      });
    }
  }

  // 2026-09-05 SEO 優化新增：每一台公開展示中的車輛，另外補一條指到它自己
  // 詳情 Modal 的深連結網址（?car=<id>），讓 Google 有機會直接收錄到
  // 個別車輛，不用只靠「現有車輛」這頁通用的清單頁——現有車輛清單頁本身
  // 的卡片目前是點擊觸發 Modal、沒有真正的 <a href> 可以讓爬蟲自己找到
  // 這些連結（見 showroom-grid.tsx 的說明），sitemap 是目前讓這些個別
  // 車輛網址「至少被收錄到」的辦法。RLS（cars_public_showroom_read）已經
  // 限定只會查到「未售出、公開、車行本身開放中」的車輛，這裡再用
  // PUBLIC_SHOWROOM_STATUSES 篩掉「整備中」——跟公開看車頁本身的顯示範圍
  // 完全一致（見 public-cars.ts 的 publicShowroomCarsQuery() 說明）。
  const { data: cars } = await supabase
    .from("cars")
    .select("id, tenant_id")
    .eq("is_public", true)
    .in("status", PUBLIC_SHOWROOM_STATUSES)
    .is("deleted_at", null);

  for (const car of cars ?? []) {
    entries.push({
      url: `${SITE_URL}/inventory/cars?tenant=${car.tenant_id}&car=${car.id}`,
    });
  }

  return entries;
}
