// 所有前台（顧客看車，完全公開、不需要登入）頁面查詢車輛，一律要走這裡的
// publicShowroomCarsQuery()，不要各自組 query —— 車輛列表、詳情頁、搜尋頁
// 之後不管加幾個，都從這裡拿查詢起點，才不會有某個頁面漏了某個過濾條件。
//
// 這裡是應用層的第二道防線。真正擋住「外部直接打 Supabase REST API」的
// 最後防線是資料庫層的 RLS policy —— NEXT_PUBLIC_SUPABASE_ANON_KEY 跟
// NEXT_PUBLIC_SUPABASE_URL 都是打包進前端 JS 的公開值，任何人都拿得到，
// 繞過這支檔案、直接用 anon key 打 REST API 是完全可行的，所以「這裡沒
// 查到」不能當作唯一防線。真正的邊界是 supabase_schema.sql 的
// cars_public_showroom_read / car_photos_public_showroom_read 這兩條
// policy，兩邊的條件（is_public / status 白名單 / deleted_at is null）
// 要保持一致，任何一邊調整都要記得同步另一邊。
import type { Metadata } from "next";
import type { createClient } from "./server";
import type { Car } from "./types";
import type { ShowroomTenant } from "./public-tenant";
import { carDisplayName, formatCurrency, formatNumber } from "@/lib/format";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** publicShowroomCarsQuery() 實際回傳的欄位形狀，跟 SHOWROOM_CAR_COLUMNS
 * 一一對應——兩邊有增減欄位時要一起改，不然這個型別會跟實際查詢的資料兜
 * 不起來。 */
export type ShowroomCar = Pick<
  Car,
  | "id"
  | "brand"
  | "model_name"
  | "year"
  | "license_year"
  | "mileage"
  | "engine_cc"
  | "transmission"
  | "color"
  | "selling_price"
  | "image_url"
  | "created_at"
  | "body_type"
  | "is_featured"
  | "is_large_card"
>;

/**
 * 前台公開看車頁預設顯示的車輛狀態：待售中／已預訂。
 *
 * - 整備中（preparing）代表車行還沒準備好公開展示（可能還沒拍照、還沒
 *   定價），不該讓顧客看到還在整理中的車。
 * - 已售出（sold）當然也不該再出現在公開頁。
 *
 * 這跟後台庫存列表（/dashboard，可以看到全部 4 種狀態）不一樣——後台是
 * 車行內部管理用，前台是給顧客看的展示頁。
 */
export const PUBLIC_SHOWROOM_STATUSES = ["in_stock", "reserved"] as const;

// 除了原本的卡片欄位，加上車輛詳情用的規格欄位（領牌年份/里程/排氣量/
// 傳動）——一樣是不涉及任何內部帳務的公開規格，跟後台列印展示卡
// （car-detail-modal.tsx 的 PrintSpec）給客人看的資訊同一個等級。
// created_at 是給前台「近期上架」標籤用的（見 showroom-grid.tsx）——只是
// 這輛車「什麼時候被加進系統」的時間戳記，不是財務欄位，公開沒有安全
// 疑慮；標籤本身用真實資料，不是憑空捏造的「熱門/搶購」假訊息。
// body_type（車型分類）／is_featured（熱門推薦）給前台展間頁上方的分類
// 選單用——is_featured 是後台手動開關的真實資料，不是系統自動判斷，
// 跟上面「近期上架」標籤同一個原則：不寫憑空捏造的熱門/搶購假訊息。
// is_large_card（大圖卡）——2026-08 新增，使用者要求「現有車輛」頁哪些
// 車要用大圖廣告卡呈現要能自己設定，見 showroom-grid.tsx／
// showroom-cars-section.tsx 對這個欄位的說明。
const SHOWROOM_CAR_COLUMNS =
  "id, brand, model_name, year, license_year, mileage, engine_cc, transmission, color, selling_price, image_url, created_at, body_type, is_featured, is_large_card";

/**
 * 車輛列表／詳情頁共用的查詢起點：只回傳「這個車行、公開展示、待售中或
 * 已預訂、沒有被軟刪除」的車輛，一律用白名單式 select 欄位清單（見
 * src/app/inventory/page.tsx 開頭的說明），purchase_price/floor_price/
 * nominee_* 等任何內部帳務欄位不會出現在這支查詢裡。
 *
 * 要查詢單一車輛（例如之後要做的詳情頁）就在這個 query 後面接
 * `.eq("id", carId).single()`；要做搜尋就接 `.ilike(...)` 之類的條件，
 * 基礎的公開範圍過濾都已經在這裡做好了，不用重複寫。
 */
export function publicShowroomCarsQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("cars")
    .select(SHOWROOM_CAR_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_public", true)
    .in("status", PUBLIC_SHOWROOM_STATUSES)
    .is("deleted_at", null);
}

/**
 * 「成交案例／已售出」展示區塊用——查詢已售出（status = 'sold'）的公開
 * 車輛，做信任背書用途。跟 publicShowroomCarsQuery() 用同一組安全欄位
 * 白名單（SHOWROOM_CAR_COLUMNS），特別注意這裡「不」select final_price／
 * closed_total_cost 等結帳欄位——成交案例只是展示用途，不需要（也不該）
 * 對外公開實際成交金額，前台畫面改顯示「已成功交車」文字而不是價格，見
 * showroom-page.tsx 的成交案例區塊。
 *
 * 依賴 supabase_schema.sql 的 cars_public_showroom_read policy 2026-08
 * 已放行 status = 'sold'（原本只允許 in_stock/reserved），這裡才查得到；
 * 這條 policy 沒放行的話，這支查詢一律回傳空陣列，不會出錯但也看不到
 * 任何資料。
 */
export function publicShowroomSoldCarsQuery(supabase: SupabaseServerClient, tenantId: string) {
  return supabase
    .from("cars")
    .select(SHOWROOM_CAR_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("is_public", true)
    .eq("status", "sold")
    .is("deleted_at", null);
}

/**
 * 車輛詳情用的相簿照片。car_photos 的 RLS
 * （car_photos_public_showroom_read）本身就有子查詢確認對應的車輛符合
 * is_public / status / deleted_at 這幾個公開條件，這裡的 carIds 只要是
 * 從 publicShowroomCarsQuery() 撈出來的車輛 id，就一定查得到、也一定是
 * 該顯示的——不需要再重複帶 tenant_id 之類的條件。
 *
 * carIds 是空陣列時直接回傳空結果，不送出查詢——PostgREST 的
 * `.in("car_id", [])` 語法在部分情況會被解讀成「不篩選」而不是「篩出
 * 空集合」，用短路提前 return 比較保險，也省一次不必要的網路請求。
 */
export function publicShowroomPhotosQuery(supabase: SupabaseServerClient, carIds: string[]) {
  if (carIds.length === 0) {
    return Promise.resolve({ data: [] as { car_id: string; url: string; sort_order: number }[], error: null });
  }
  return supabase
    .from("car_photos")
    .select("car_id, url, sort_order")
    .in("car_id", carIds)
    .order("sort_order", { ascending: true });
}

/**
 * 2026-09-05 SEO 優化新增：「現有車輛」頁帶 `?car=<id>` 深連結（打開某一
 * 台車的詳情 Modal）時，用這支組出這台車專屬的標題/描述/分享卡片圖片，
 * 取代原本整頁只有一句「現有車輛」通用標題的狀況——這樣客人分享某一台車
 * 的連結出去，LINE/Facebook 才會正確顯示這台車的名稱跟照片，而不是整個
 * 展間的通用介紹；Google 也才有機會針對「特定車款」的搜尋把這個網址
 * 收錄進來，而不是只收錄到一句籠統的「現有車輛」。
 *
 * 刻意不另外開一個新路由（例如 /inventory/cars/[carId]）——現有的
 * `?car=` 深連結本來就是一個可以直接分享、Google 可以爬到的完整網址，
 * 只是內容（標題/描述/結構化資料）原本沒有跟著這個參數變動；用同一個
 * 網址把內容補齊，是風險最低、改動範圍最小的做法，不需要更動既有的
 * Modal 互動設計或任何現有連結。
 */
export function buildCarMetadata(tenant: ShowroomTenant, car: ShowroomCar, photoUrl: string | null): Metadata {
  const name = carDisplayName(car);
  const title = `${name}｜${tenant.name}`;
  const priceText = car.selling_price != null ? `，${formatCurrency(car.selling_price)}` : "";
  const mileageText = car.mileage != null ? `，里程 ${formatNumber(car.mileage)} km` : "";
  const description = `${name}${priceText}${mileageText}。${tenant.name}${
    tenant.address ? `，${tenant.address}` : ""
  }，歡迎預約賞車。`;
  const image = photoUrl || car.image_url || tenant.hero_image_url || tenant.logo_url || null;

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

/**
 * 同一台車的 Schema.org 結構化資料（JSON-LD，`@type: "Car"`）——只放車輛
 * 本身已經有值的欄位，沒填的欄位整個省略，不寫假資料湊格式（跟
 * buildShowroomMetadata() 的 AutoDealer 結構化資料同一個原則）。
 */
export function buildCarStructuredData(
  tenant: ShowroomTenant,
  car: ShowroomCar,
  photoUrl: string | null
): Record<string, unknown> {
  const image = photoUrl || car.image_url;
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    name: carDisplayName(car),
    ...(car.brand ? { brand: { "@type": "Brand", name: car.brand } } : {}),
    ...(car.model_name ? { model: car.model_name } : {}),
    ...(car.year ? { vehicleModelDate: String(car.year) } : {}),
    ...(car.mileage != null
      ? { mileageFromOdometer: { "@type": "QuantitativeValue", value: car.mileage, unitCode: "KMT" } }
      : {}),
    ...(car.color ? { color: car.color } : {}),
    ...(car.transmission ? { vehicleTransmission: car.transmission } : {}),
    ...(image ? { image } : {}),
    ...(car.selling_price != null
      ? {
          offers: {
            "@type": "Offer",
            price: car.selling_price,
            priceCurrency: "TWD",
            availability: "https://schema.org/InStock",
            seller: { "@type": "AutoDealer", name: tenant.name },
          },
        }
      : {}),
  };
}
