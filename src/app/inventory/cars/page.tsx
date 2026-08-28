// 展間五個獨立頁面的「現有車輛」頁——篩選面板＋車輛清單＋詳情 Modal，
// 見 showroom-cars-section.tsx 開頭的完整說明。完全公開、不需要登入。
//
// 支援兩個選填的深連結查詢參數（都是從「品牌簡介」頁點進來時帶的，見
// showroom-home-section.tsx）：
// - `car`：一進頁面就打開這輛車的詳情 Modal（例如首頁「熱門車款」點進來）。
// - `category`：一進頁面就套用這個分類篩選（"featured" 代表熱門推薦，
//   其餘直接對應 body_type）。
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant } from "@/lib/supabase/public-tenant";
import { publicShowroomCarsQuery, publicShowroomPhotosQuery } from "@/lib/supabase/public-cars";
import { ShowroomEmptyState } from "../_components/showroom-empty-state";
import { ShowroomCarsSection } from "../_components/showroom-cars-section";
import type { ShowroomCar } from "@/lib/supabase/public-cars";

export default async function InventoryCarsPage({
  searchParams,
}: PageProps<"/inventory/cars">) {
  const { tenant: tenantIdParam, car: carIdParam, category: categoryParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(supabase, tenantIdParam);

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

  return (
    <ShowroomCarsSection
      tenant={tenant}
      tenantId={tenant.id}
      cars={carList}
      photosByCarId={photosByCarId}
      initialCarId={typeof carIdParam === "string" ? carIdParam : null}
      initialCategory={typeof categoryParam === "string" ? categoryParam : null}
    />
  );
}
