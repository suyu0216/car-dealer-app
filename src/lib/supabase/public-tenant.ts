// 公開看車頁（/inventory 整組路由：品牌簡介／服務項目／現有車輛／我要估車／
// 成交案件，共五個獨立頁面，見 showroom-shell.tsx 開頭的說明）共用的車行
// 資料查詢——五個頁面的頁首／導覽／頁尾都需要同一份車行資料，統一在這裡
// 查一次、統一判斷「找不到車行」「車行尚未開放」這兩種空狀態，不要讓五個
// page.tsx 各自重寫一份幾乎一樣的查詢＋判斷邏輯（改一個欄位要記得改五處，
// 很容易漏改）。
import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "./server";
import type { Tenant } from "./types";

/** loadShowroomTenant() 實際回傳的欄位形狀，跟 SHOWROOM_TENANT_COLUMNS
 * 一一對應——兩邊有增減欄位時要一起改。 */
export type ShowroomTenant = Pick<
  Tenant,
  | "id"
  | "name"
  | "phone"
  | "address"
  | "business_hours"
  | "logo_url"
  | "line_id"
  | "brand_story"
  | "hero_image_url"
  | "facebook_url"
  | "instagram_url"
  | "tiktok_url"
  | "services_text"
  | "value_props_text"
  | "google_rating"
  | "google_review_count"
  | "google_review_url"
  | "status"
>;

const SHOWROOM_TENANT_COLUMNS =
  "id, name, phone, address, business_hours, logo_url, line_id, brand_story, hero_image_url, facebook_url, instagram_url, tiktok_url, services_text, value_props_text, google_rating, google_review_count, google_review_url, status";

/**
 * 查詢車行資料 + 判斷這個展間現在該不該對外開放。回傳 `tenant: null` 時
 * 一律附上對應的中文提示訊息（emptyMessage），呼叫端直接把這個訊息丟給
 * ShowroomEmptyState 顯示就好，不用自己重寫判斷邏輯。
 *
 * 三種情況都回傳 `tenant: null`：
 * 1. 網址完全沒帶 `?tenant=` 查詢參數。
 * 2. 帶了，但查無此車行（tenant_id 打錯或車行已被刪除）。
 * 3. 查得到，但車行 status 不是 active（pending 尚未審核／suspended 已
 *    停權）——這兩種狀態刻意不區分訊息，避免對外洩漏車行目前的審核/停權
 *    狀態這種內部資訊。
 *
 * 2026-09-05 SEO 優化調整：原本這支函式吃呼叫端傳進來的 supabase
 * client，現在改成自己內部呼叫 createClient()（cookie-based，成本很低，
 * 不是真的打資料庫）——目的是讓這支函式的參數只剩下 tenantIdParam 這個
 * 單純的字串，才能用 React 的 cache() 包起來、在同一次請求裡有效去重。
 * 每個展間頁面現在都要多輸出一個 generateMetadata()（見各 page.tsx），
 * Next.js 會在同一次請求裡呼叫兩次「查車行資料」的邏輯——一次給
 * generateMetadata 組標題/描述，一次給頁面本體渲染內容。沒有 cache()
 * 包裝的話，這兩次呼叫會各自真的打一次資料庫，等於每個展間頁面的查詢
 * 次數直接翻倍；用 cache() 之後，同一次請求裡第二次呼叫會直接拿第一次
 * 的結果，不會真的再查一次。
 */
export const loadShowroomTenant = cache(async function loadShowroomTenant(
  tenantIdParam: string | string[] | undefined
): Promise<{ tenant: ShowroomTenant | null; emptyMessage: string | null }> {
  if (!tenantIdParam || typeof tenantIdParam !== "string") {
    return { tenant: null, emptyMessage: "請透過車行提供的專屬連結查看展示車輛。" };
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("tenants")
    .select(SHOWROOM_TENANT_COLUMNS)
    .eq("id", tenantIdParam)
    .single();

  const tenantInfo = data as ShowroomTenant | null;

  if (!tenantInfo) {
    return { tenant: null, emptyMessage: "找不到這個車行，請確認連結是否正確。" };
  }

  if (tenantInfo.status !== "active") {
    return {
      tenant: null,
      emptyMessage: "這個車行的線上展間尚未開放，請直接洽詢車行本人或稍後再訪。",
    };
  }

  return { tenant: tenantInfo, emptyMessage: null };
});

/**
 * 把車行資料組成這個展間頁面的 SEO metadata（標題／描述／Open Graph／
 * Twitter Card）。`pageLabel` 是這個頁面在標題裡要加的子標題（例如
 * 「現有車輛」「成交案例」），首頁（品牌簡介頁）留空即可。找不到車行
 * 或車行未開放時，回傳中性、不外洩內部狀態的預設標題——不會讓 Google
 * 把「找不到車行」這種錯誤訊息當成頁面標題收錄。
 *
 * description 優先用車行自己填的品牌故事（brand_story）開頭一段，沒填
 * 就退回用「名稱＋地址」組一句通用描述；都沒有就用最保守的預設文字。
 * 圖片優先用首圖橫幅（hero_image_url），沒有就退回用店家 Logo
 * （logo_url），兩者都沒有時 Open Graph 就不帶圖片，讓分享卡片退回瀏覽器
 * 自己的預設呈現，不會出現壞掉的圖片連結。
 */
export function buildShowroomMetadata(
  tenant: ShowroomTenant | null,
  pageLabel?: string
): Metadata {
  if (!tenant) {
    return {
      title: "線上看車展示間",
      description: "請透過車行提供的專屬連結查看展示車輛。",
      robots: { index: false, follow: false },
    };
  }

  const title = pageLabel ? `${tenant.name}｜${pageLabel}` : `${tenant.name}｜線上看車展示間`;
  const description =
    (tenant.brand_story?.trim().slice(0, 120) || null) ??
    `${tenant.name}${tenant.address ? `，${tenant.address}` : ""}，歡迎線上看車、預約賞車。`;
  const image = tenant.hero_image_url || tenant.logo_url || null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}
