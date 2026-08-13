"use client";

import { formatCurrency } from "@/lib/format";
import type { ShowroomCar } from "@/lib/supabase/public-cars";

/** 前台展間的車輛卡片格狀列表——純展示，選中哪一輛車交給 onSelect 往上
 * 通知，「哪個詳情 Modal 開著」統一由 ShowroomPage 管理（見該檔案開頭的
 * 說明：為什麼要統一管理，以及為什麼 Modal 開著時要把這個列表整個
 * `hidden` 掉）。 */
export function ShowroomGrid({
  cars,
  onSelect,
}: {
  cars: ShowroomCar[];
  onSelect: (car: ShowroomCar) => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cars.map((car) => (
        <ShowroomCard key={car.id} car={car} onClick={() => onSelect(car)} />
      ))}
    </div>
  );
}

function ShowroomCard({ car, onClick }: { car: ShowroomCar; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-100">
        {car.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
          <img
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-neutral-300">
            🚗
          </div>
        )}
        {car.brand && (
          <div className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-[#A6793D] backdrop-blur">
            {car.brand}
          </div>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="truncate text-sm font-semibold text-neutral-800">{car.model_name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {car.year && <MiniBadge>{car.year} 年式</MiniBadge>}
          {car.color && <MiniBadge>{car.color}</MiniBadge>}
        </div>
        <p className="mt-3 text-base font-semibold text-[#A6793D] tabular-nums">
          {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
        </p>
      </div>
    </button>
  );
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500">
      {children}
    </span>
  );
}
