// 展間五個獨立頁面的「品牌簡介」頁——也是預設首頁（顧客拿到的專屬連結
// 就是這個網址）。完全公開、不需要登入，proxy.ts 的 PROTECTED_PREFIXES
// 沒有列 /inventory，請求會直接放行，不受後台驗證邏輯影響。
//
// 2026-08 從單一超長頁面拆成五個獨立頁面（品牌簡介／服務項目／現有車輛／
// 我要估車／成交案件），見 showroom-shell.tsx 開頭的完整說明；車行資料的
// 查詢＋「找不到車行／尚未開放」判斷統一收在 public-tenant.ts 的
// loadShowroomTenant()，五個頁面共用同一套邏輯。
//
// 安全設計：車輛查詢一律透過 publicShowroomCarsQuery()（見
// src/lib/supabase/public-cars.ts），一律用「白名單式」select 欄位清單，
// purchase_price（進價）、paid_amount（已付金額）、floor_price（底價）、
// nominee_*（二胎/人頭車紀錄）等任何內部帳務欄位一律不會出現在這支查詢
// 裡。資料庫層另外也有 cars_public_showroom_read 這條 RLS policy 把關
// （見 supabase_schema.sql），雙重防護。
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant, buildShowroomMetadata } from "@/lib/supabase/public-tenant";
import { publicShowroomCarsQuery } from "@/lib/supabase/public-cars";
import { publicShowroomStaffQuery } from "@/lib/supabase/public-staff";
import { publicTenantVideosQuery } from "@/lib/supabase/public-videos";
import { publicTenantReviewsQuery } from "@/lib/supabase/public-reviews";
import { publicTenantHeroPhotosQuery } from "@/lib/supabase/public-hero-photos";
import { ShowroomEmptyState } from "./_components/showroom-empty-state";
import { ShowroomHomeSection } from "./_components/showroom-home-section";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import type { ShowroomStaff } from "@/lib/supabase/public-staff";
import type { TenantVideo, TenantReview, TenantHeroPhoto } from "@/lib/supabase/types";

// 2026-09-05 SEO 優化新增：品牌簡介頁（也是展間首頁）的標題/描述改成用
// 車行自己的資料動態產生，取代原本全站共用、看不出是哪間車行的通用標題
// （見 lib/config.ts 的 APP_NAME 說明——那是平台品牌，不是車行品牌）。見
// public-tenant.ts 的 buildShowroomMetadata() 開頭說明。
export async function generateMetadata({
  searchParams,
}: PageProps<"/inventory">): Promise<Metadata> {
  const { tenant: tenantIdParam } = await searchParams;
  const { tenant } = await loadShowroomTenant(tenantIdParam);
  return buildShowroomMetadata(tenant);
}

export default async function InventoryHomePage({
  searchParams,
}: PageProps<"/inventory">) {
  const { tenant: tenantIdParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(tenantIdParam);

  if (!tenant) {
    return <ShowroomEmptyState message={emptyMessage!} />;
  }

  // 首頁只需要「熱門車款」跟「首圖橫幅自動選圖」用到的車輛清單，跟
  // 「聯繫我們的業務」清單、影音清單、精選評論清單、首圖橫幅相簿彼此沒有
  // 資料相依，平行送出，省掉排隊依序執行的來回時間。
  const [{ data: cars }, { data: staffRows }, { data: videoRows }, { data: reviewRows }, { data: heroPhotoRows }] =
    await Promise.all([
      publicShowroomCarsQuery(supabase, tenant.id).order("created_at", { ascending: false }),
      publicShowroomStaffQuery(supabase, tenant.id),
      publicTenantVideosQuery(supabase, tenant.id),
      publicTenantReviewsQuery(supabase, tenant.id),
      publicTenantHeroPhotosQuery(supabase, tenant.id),
    ]);

  // 2026-09-05 SEO 優化新增：AutoDealer 結構化資料（JSON-LD），幫助 Google
  // 理解這是一間實體中古車行、有名稱/地址/電話/評分，有機會在搜尋結果
  // 出現星等評分等豐富摘要（rich snippet）。只放車行自己已經填寫的欄位，
  // 沒填的欄位（例如還沒設定 Google 評分）就整個省略該欄位，不寫假資料
  // 湊格式——這是全站一貫的原則（見 public-cars.ts 開頭「不寫憑空捏造的
  // 熱門/搶購假訊息」的說明），結構化資料也不例外。
  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: tenant.name,
    ...(tenant.address ? { address: tenant.address } : {}),
    ...(tenant.phone ? { telephone: tenant.phone } : {}),
    ...(tenant.logo_url ? { image: tenant.logo_url } : {}),
    ...(tenant.google_rating && tenant.google_review_count
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: tenant.google_rating,
            reviewCount: tenant.google_review_count,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ShowroomHomeSection
        tenant={tenant}
        tenantId={tenant.id}
        cars={(cars ?? []) as ShowroomCar[]}
        videos={(videoRows ?? []) as TenantVideo[]}
        teamContacts={(staffRows ?? []) as ShowroomStaff[]}
        reviews={(reviewRows ?? []) as TenantReview[]}
        heroPhotos={(heroPhotoRows ?? []) as TenantHeroPhoto[]}
      />
    </>
  );
}
