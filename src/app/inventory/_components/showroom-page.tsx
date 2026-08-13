"use client";

import { useState } from "react";
import type { Tenant } from "@/lib/supabase/types";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import { ShowroomGrid } from "./showroom-grid";
import { ShowroomDetailModal } from "./showroom-detail-modal";

type ShowroomTenant = Pick<
  Tenant,
  "id" | "name" | "phone" | "address" | "business_hours" | "logo_url" | "line_id"
>;

/**
 * /inventory 整個畫面主體（header + 車輛列表 + footer + 詳情 Modal），統一
 * 在這裡管理「哪一輛車的詳情 Modal 開著」。
 *
 * 詳情 Modal 開著時，header／車輛列表／footer 會整個包在 `hidden`
 * （display:none）底下——不只是效能考量，是實測修掉一個真的會發生的
 * 畫面錯誤：手機直式單欄排列，車輛一多整頁高度可以衝到兩三萬 px，這種
 * 情況下 Chromium 合成一個 position:fixed 滿版遮罩（ShowroomDetailModal
 * 及其內建的全螢幕 Lightbox）時，只要底下這些內容還留在版面佈局
 * （layout）裡——就算完全沒有被捲動到、視覺上被遮罩整個蓋住——遮罩仍然
 * 會出現「沒蓋滿，底下內容從破洞透出來」的合成錯誤；用 `overflow:hidden`
 * 鎖 body 捲動測過沒用，只有把底下內容整個從 layout 移除
 * （display:none）才擋得住。用 `hidden` 而不是條件式不渲染，是為了保留
 * DOM／捲動位置，關掉 Modal 後列表捲動位置不會跳掉。
 */
export function ShowroomPage({
  tenant,
  cars,
  photosByCarId,
}: {
  tenant: ShowroomTenant;
  cars: ShowroomCar[];
  photosByCarId: Record<string, string[]>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCar = cars.find((c) => c.id === selectedId) ?? null;

  function photosFor(car: ShowroomCar): string[] {
    const gallery = photosByCarId[car.id];
    if (gallery && gallery.length > 0) return gallery;
    return car.image_url ? [car.image_url] : [];
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <div className={selectedCar ? "hidden" : undefined}>
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-6">
            {tenant.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
              <img
                src={tenant.logo_url}
                alt={`${tenant.name} Logo`}
                className="h-14 w-14 shrink-0 rounded-xl border border-neutral-200 bg-white object-contain p-1"
              />
            )}
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">{tenant.name}</h1>
              {(tenant.phone || tenant.address || tenant.business_hours || tenant.line_id) && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-400">
                  {tenant.phone && <span>📞 {tenant.phone}</span>}
                  {tenant.address && <span>📍 {tenant.address}</span>}
                  {tenant.business_hours && <span>🕒 {tenant.business_hours}</span>}
                  {tenant.line_id && <span>💬 LINE：{tenant.line_id}</span>}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <h2 className="text-base font-semibold text-neutral-800">
            現正展示車輛（{cars.length} 台）
          </h2>

          {cars.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-400">
              目前沒有公開展示的車輛，歡迎之後再來看看。
            </p>
          ) : (
            <ShowroomGrid cars={cars} onSelect={(car) => setSelectedId(car.id)} />
          )}
        </main>

        <footer className="border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
          車輛資訊僅供參考，實際車況與價格請洽車行現場為準。
        </footer>
      </div>

      {selectedCar && (
        <ShowroomDetailModal
          car={selectedCar}
          photos={photosFor(selectedCar)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
