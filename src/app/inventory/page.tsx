// 獨立的前台展示頁面（顧客看車專用）：完全公開、不需要登入，proxy.ts 的
// PROTECTED_PREFIXES 沒有列 /inventory，請求會直接放行，不受後台驗證邏輯
// 影響。/dashboard 後台完全沒有被這個檔案動到。
//
// 多租戶架構下，公開看車頁用 ?tenant=<車行 id> 決定要顯示哪一間車行的
// 車輛——車行可以在後台（/dashboard 頁首「🔗 顧客看車連結」）直接複製
// 自己的專屬網址分享給顧客。
//
// 安全設計：車輛查詢一律透過 publicShowroomCarsQuery()（見
// src/lib/supabase/public-cars.ts），一律用「白名單式」select 欄位清單，
// 只挑車型/年份/領牌/里程/排氣量/傳動/顏色/展示開價/照片這幾個公開資訊，
// purchase_price（進價）、paid_amount（已付金額）、floor_price（底價）、
// nominee_*（二胎/人頭車紀錄）、業務抽成等任何內部帳務欄位一律不會出現在
// 這支查詢裡——不是「查出來再遮起來」，是資料庫回傳的資料本身就不包含
// 這些欄位。資料庫層另外也有 cars_public_showroom_read 這條 RLS policy
// 把關（見 supabase_schema.sql），雙重防護。之後如果要加車輛詳情頁/搜尋
// 頁，車輛查詢都要從 publicShowroomCarsQuery() 開始接，不要自己重寫一份
// 條件。
//
// 這個檔案只負責伺服器端資料撈取；畫面主體（header/列表/footer/詳情
// Modal）都在 ShowroomPage（Client Component）裡，因為詳情 Modal 要不要
// 開、開哪一輛車是互動狀態，見 showroom-page.tsx 開頭的說明。
import { createClient } from "@/lib/supabase/server";
import { publicShowroomCarsQuery, publicShowroomPhotosQuery } from "@/lib/supabase/public-cars";
import { ShowroomPage } from "./_components/showroom-page";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import type { Tenant } from "@/lib/supabase/types";

type ShowroomTenant = Pick<
  Tenant,
  "id" | "name" | "phone" | "address" | "business_hours" | "logo_url" | "line_id" | "status"
>;

export default async function InventoryPage({
  searchParams,
}: PageProps<"/inventory">) {
  const { tenant: tenantId } = await searchParams;

  if (!tenantId || typeof tenantId !== "string") {
    return (
      <EmptyState message="請透過車行提供的專屬連結查看展示車輛。" />
    );
  }

  const supabase = await createClient();

  // 先單獨查車行資料，確認 status 是不是 active 再決定要不要查車輛——
  // pending/suspended 車行的車輛查詢就算送出去，RLS（cars_public_showroom_read）
  // 也一定回空陣列，先查這一筆可以省下那次不會有結果的查詢，也才能顯示
  // 「尚未開放」而不是容易誤會的「目前沒有展示車輛」。
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, phone, address, business_hours, logo_url, line_id, status")
    .eq("id", tenantId)
    .single();

  const tenantInfo = tenant as ShowroomTenant | null;

  if (!tenantInfo) {
    return <EmptyState message="找不到這個車行，請確認連結是否正確。" />;
  }

  // pending（尚未通過平台審核）／suspended（已停權）都不對外開放展間——
  // 不區分哪一種，避免對外洩漏這間車行目前的審核/停權狀態這種內部資訊。
  if (tenantInfo.status !== "active") {
    return (
      <EmptyState message="這個車行的線上展間尚未開放，請直接洽詢車行本人或稍後再訪。" />
    );
  }

  const { data: cars } = await publicShowroomCarsQuery(supabase, tenantId).order("created_at", {
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

  return <ShowroomPage tenant={tenantInfo} cars={carList} photosByCarId={photosByCarId} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-6 text-center text-sm text-neutral-400">
      {message}
    </div>
  );
}
