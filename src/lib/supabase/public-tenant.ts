// 公開看車頁（/inventory 整組路由：品牌簡介／服務項目／現有車輛／我要估車／
// 成交案件，共五個獨立頁面，見 showroom-shell.tsx 開頭的說明）共用的車行
// 資料查詢——五個頁面的頁首／導覽／頁尾都需要同一份車行資料，統一在這裡
// 查一次、統一判斷「找不到車行」「車行尚未開放」這兩種空狀態，不要讓五個
// page.tsx 各自重寫一份幾乎一樣的查詢＋判斷邏輯（改一個欄位要記得改五處，
// 很容易漏改）。
import type { createClient } from "./server";
import type { Tenant } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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
 */
export async function loadShowroomTenant(
  supabase: SupabaseServerClient,
  tenantIdParam: string | string[] | undefined
): Promise<{ tenant: ShowroomTenant | null; emptyMessage: string | null }> {
  if (!tenantIdParam || typeof tenantIdParam !== "string") {
    return { tenant: null, emptyMessage: "請透過車行提供的專屬連結查看展示車輛。" };
  }

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
}
