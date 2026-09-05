// 展間五個獨立頁面的「現有車輛」頁——篩選面板＋車輛清單＋詳情 Modal，
// 見 showroom-cars-section.tsx 開頭的完整說明。完全公開、不需要登入。
//
// 支援兩個選填的深連結查詢參數（都是從「品牌簡介」頁點進來時帶的，見
// showroom-home-section.tsx）：
// - `car`：一進頁面就打開這輛車的詳情 Modal（例如首頁「熱門車款」點進來）。
// - `category`：一進頁面就套用這個分類篩選（"featured" 代表熱門推薦，
//   其餘直接對應 body_type）。
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant, buildShowroomMetadata } from "@/lib/supabase/public-tenant";
import {
  publicShowroomCarsQuery,
  publicShowroomPhotosQuery,
  buildCarMetadata,
  buildCarStructuredData,
} from "@/lib/supabase/public-cars";
import { ShowroomEmptyState } from "../_components/showroom-empty-state";
import { ShowroomCarsSection } from "../_components/showroom-cars-section";
import type { ShowroomCar } from "@/lib/supabase/public-cars";

// 2026-09-05 SEO 優化新增：`?car=<id>` 深連結（打開某一台車詳情 Modal）
// 時，標題/描述改成這台車專屬的內容，取代整頁通用的「現有車輛」，見
// public-cars.ts 的 buildCarMetadata() 開頭說明。沒有帶 `car` 參數、或
// 帶的 id 查無這台車，就退回原本整頁通用的 buildShowroomMetadata()。
export async function generateMetadata({
  searchParams,
}: PageProps<"/inventory/cars">): Promise<Metadata> {
  const { tenant: tenantIdParam, car: carIdParam } = await searchParams;
  const { tenant } = await loadShowroomTenant(tenantIdParam);
  if (!tenant) {
    return buildShowroomMetadata(tenant, "現有車輛");
  }

  if (typeof carIdParam === "string") {
    const supabase = await createClient();
    const { data: car } = await publicShowroomCarsQuery(supabase, tenant.id).eq("id", carIdParam).maybeSingle();
    if (car) {
      return buildCarMetadata(tenant, car as ShowroomCar, null);
    }
  }

  return buildShowroomMetadata(tenant, "現有車輛");
}

export default async function InventoryCarsPage({
  searchParams,
}: PageProps<"/inventory/cars">) {
  const { tenant: tenantIdParam, car: carIdParam, category: categoryParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(tenantIdParam);

  if (!tenant) {
    return <ShowroomEmptyState message={emptyMessage!} />;
  }

  const { data: cars } = await publicShowroomCarsQuery(supabase, tenant.id).order("created_at", {
    ascending: false,
  });
  const carList = (cars ?? []) as ShowroomCar[];

  // 相簿照片一次撈完、依 car_id 分組——展示車輛數量不大，比每輛車詳情
  // Modal 各自現查划算，也不需要額外的 loading 狀態。
  const { data: photoRows } = await publicShowroomPhotosQuery(
    supabase,
    carList.map((c) => c.id)
  );
  const photosByCarId: Record<string, string[]> = {};
  for (const row of photoRows ?? []) {
    (photosByCarId[row.car_id] ??= []).push(row.url);
  }

  // 2026-09-05 SEO 優化新增：`?car=<id>` 深連結對應的那台車，補上車輛
  // 結構化資料（JSON-LD），見 public-cars.ts 的 buildCarStructuredData()
  // 開頭說明。沒有帶 `car` 參數、或帶的 id 不在這批公開展示車輛裡（可能
  // 已下架），就不輸出——不是每次都一定有。
  const deepLinkedCar =
    typeof carIdParam === "string" ? (carList.find((c) => c.id === carIdParam) ?? null) : null;
  const structuredData = deepLinkedCar
    ? buildCarStructuredData(tenant, deepLinkedCar, photosByCarId[deepLinkedCar.id]?.[0] ?? null)
    : null;

  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
      <ShowroomCarsSection
        tenant={tenant}
        tenantId={tenant.id}
        cars={carList}
        photosByCarId={photosByCarId}
        initialCarId={typeof carIdParam === "string" ? carIdParam : null}
        initialCategory={typeof categoryParam === "string" ? categoryParam : null}
      />
    </>
  );
}
