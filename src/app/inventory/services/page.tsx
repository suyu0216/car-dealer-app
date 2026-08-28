// 展間五個獨立頁面的「服務項目」頁——服務項目 icon 區塊＋品牌價值主張
// icon 區塊，都是車行在後台「品牌設定」用 textarea 一行填一項（見
// brand-settings-module.tsx），選填、沒填就是空陣列，對應區塊完全不
// 渲染。純展示、沒有互動狀態，這個頁面直接是 Server Component。
import { createClient } from "@/lib/supabase/server";
import { loadShowroomTenant } from "@/lib/supabase/public-tenant";
import { ShowroomEmptyState } from "../_components/showroom-empty-state";
import { ShowroomShell } from "../_components/showroom-shell";
import { GENERIC_SHOWCASE_ICONS } from "../_components/showroom-shared";

/** 品牌價值主張 icon 區塊最多顯示幾項，避免車行填太多項把這排 icon 擠得
 * 過於擁擠。 */
const VALUE_PROPS_LIMIT = 5;

export default async function InventoryServicesPage({
  searchParams,
}: PageProps<"/inventory/services">) {
  const { tenant: tenantIdParam } = await searchParams;
  const supabase = await createClient();
  const { tenant, emptyMessage } = await loadShowroomTenant(supabase, tenantIdParam);

  if (!tenant) {
    return <ShowroomEmptyState message={emptyMessage!} />;
  }

  const servicesList = (tenant.services_text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const valuePropsList = (tenant.value_props_text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, VALUE_PROPS_LIMIT);

  return (
    <ShowroomShell tenant={tenant} tenantId={tenant.id} active="services">
      {servicesList.length === 0 && valuePropsList.length === 0 ? (
        <p className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-[#737373]">
          車行還沒有填寫服務項目介紹，歡迎之後再來看看，或直接洽詢車行本人。
        </p>
      ) : (
        <>
          {servicesList.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <div className="flex items-center gap-4">
                  <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                    服務項目
                  </h2>
                  <div className="h-px flex-1 bg-[#E5E5E5]" />
                </div>
                <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
                  {servicesList.map((label, i) => {
                    const Icon = GENERIC_SHOWCASE_ICONS[i % GENERIC_SHOWCASE_ICONS.length];
                    return (
                      <div key={label} className="flex flex-col items-center gap-3 text-center">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[#E5E5E5] text-[#171717]">
                          <Icon />
                        </div>
                        <p className="text-sm font-medium text-[#404040]">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {valuePropsList.length > 0 && (
            <section className="bg-[#171717]">
              <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <div className="flex items-center gap-4">
                  <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-white">
                    品牌價值主張
                  </h2>
                  <div className="h-px flex-1 bg-white/15" />
                </div>
                <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
                  {valuePropsList.map((label, i) => {
                    const Icon = GENERIC_SHOWCASE_ICONS[i % GENERIC_SHOWCASE_ICONS.length];
                    return (
                      <div key={label} className="flex flex-col items-center gap-3 text-center">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/25 text-white">
                          <Icon />
                        </div>
                        <p className="text-sm font-medium text-white/90">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </ShowroomShell>
  );
}
