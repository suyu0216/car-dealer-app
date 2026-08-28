// 展間五個獨立頁面的「成交案件」頁——已成交車輛的信任背書展示，讓顧客
// 看到「這間車行真的有在成交」，不是只有一直掛著賣不掉的庫存。刻意不
// 顯示實際成交價格（見 public-cars.ts 的 publicShowroomSoldCarsQuery()
// 說明），改用「已成功交車」文字標籤。純展示、不可點擊，沒有 Modal，
// 所以這個頁面直接是 Server Component，不需要額外的 client 互動狀態。
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant } from "@/lib/supabase/public-tenant";
import { publicShowroomSoldCarsQuery } from "@/lib/supabase/public-cars";
import { ShowroomEmptyState } from "../_components/showroom-empty-state";
import { ShowroomShell } from "../_components/showroom-shell";
import { SoldShowcaseCard } from "../_components/sold-showcase-card";
import type { ShowroomCar } from "@/lib/supabase/public-cars";

export default async function InventorySoldPage({
  searchParams,
}: PageProps<"/inventory/sold">) {
  const { tenant: tenantIdParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(supabase, tenantIdParam);

  if (!tenant) {
    return <ShowroomEmptyState message={emptyMessage!} />;
  }

  const { data: soldCars } = await publicShowroomSoldCarsQuery(supabase, tenant.id).order("created_at", {
    ascending: false,
  });
  const soldCarList = (soldCars ?? []) as ShowroomCar[];

  return (
    <ShowroomShell tenant={tenant} tenantId={tenant.id} active="sold">
      <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="flex items-center gap-4">
          <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
            成交案例
          </h2>
          <div className="h-px flex-1 bg-[#D4D4D4]" />
        </div>
        <p className="mt-2 text-xs text-[#737373]">
          以下車輛已成功交車，感謝每一位選擇我們的顧客。
        </p>

        {soldCarList.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-dashed border-[#D4D4D4] bg-white px-4 py-12 text-center text-sm text-[#737373]">
            目前還沒有成交案例，歡迎之後再來看看。
          </p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {soldCarList.map((car) => (
              <SoldShowcaseCard key={car.id} car={car} />
            ))}
          </div>
        )}
      </section>
    </ShowroomShell>
  );
}
