// 公開看車頁（/inventory）「聯繫我們的業務」區塊用的員工查詢——一律走這裡
// 的 publicShowroomStaffQuery()，不要自己重寫一份，理由跟 public-cars.ts
// 開頭的說明一致：這裡的白名單 select 欄位清單是應用層第二道防線，真正
// 擋住「外部直接打 Supabase REST API 撈到不該公開的員工資料」的最後防線
// 是資料庫層的 profiles_public_showroom_read RLS policy（見
// supabase_schema.sql）——只有 show_public_contact = true 的員工列才會被
// 這條 policy 篩出來，role/can_view_cost/can_view_salary/can_edit_cars/
// tenant_id 等任何內部欄位不會出現在這支查詢裡。
import type { createClient } from "./server";
import type { Profile } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** publicShowroomStaffQuery() 實際回傳的欄位形狀，跟 SHOWROOM_STAFF_COLUMNS
 * 一一對應——兩邊有增減欄位時要一起改。 */
export type ShowroomStaff = Pick<
  Profile,
  "id" | "name" | "public_phone" | "public_line_id" | "public_bio" | "public_avatar_url"
>;

const SHOWROOM_STAFF_COLUMNS = "id, name, public_phone, public_line_id, public_bio, public_avatar_url";

/**
 * 查詢「這個車行、選擇公開聯繫方式」的員工列表，給前台展間的「聯繫我們
 * 的業務」區塊用。姓名是空的（還沒設定過 profiles.name）就不列出來——
 * 一張連名字都沒有的聯絡卡片對顧客沒有意義，也顯得不夠專業。
 */
export function publicShowroomStaffQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("profiles")
    .select(SHOWROOM_STAFF_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("show_public_contact", true)
    .not("name", "is", null)
    .order("name", { ascending: true });
}
