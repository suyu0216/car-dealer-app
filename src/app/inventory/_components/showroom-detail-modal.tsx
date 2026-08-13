"use client";

import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import { ShowroomPhotoGallery } from "./showroom-photo-gallery";
import { ShowroomLightbox } from "./showroom-lightbox";

/**
 * 前台展間的車輛詳情 Modal：上方多圖相簿、下方規格格狀卡片，點主圖可以
 * 切到全螢幕 Lightbox。
 *
 * 這個元件統一管理「唯一的一層 fixed 滿版遮罩」——Lightbox 開啟時是
 * 把這層遮罩的內容從「詳情」換成「全螢幕看圖」，不是另外疊一層新的
 * fixed 遮罩上去。原因見 showroom-lightbox.tsx 開頭的說明：兩層各自獨立
 * 的 position:fixed 滿版遮罩疊在很長的頁面上（/inventory 手機直式單欄、
 * 車輛一多整頁可以到兩三萬 px 高）會觸發 Chromium 的合成錯誤，下層內容
 * 會從「破洞」透出來，唯一有效的修法就是同一時間只保留一層。
 *
 * photos 是這輛車完整的相簿網址（已依 sort_order 排序）；如果 car_photos
 * 裡沒有任何照片，就退回用 car.image_url 當唯一一張（見
 * showroom-grid.tsx 組 photos 的地方），car.image_url 本身也沒有的話，
 * ShowroomPhotoGallery 會顯示佔位圖示。
 */
export function ShowroomDetailModal({
  car,
  photos,
  onClose,
}: {
  car: ShowroomCar;
  photos: string[];
  onClose: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const title = [car.brand, car.model_name].filter(Boolean).join(" ");
  const lightboxOpen = lightboxIndex !== null;

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center px-4 py-8 " +
        (lightboxOpen ? "bg-black/90" : "bg-neutral-900/50")
      }
      onClick={lightboxOpen ? () => setLightboxIndex(null) : onClose}
    >
      {lightboxOpen ? (
        <ShowroomLightbox
          photos={photos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : (
        <div
          className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[#A6793D]">{car.brand ?? "未標示廠牌"}</p>
                <h2 className="text-xl font-semibold text-neutral-800">{car.model_name}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉"
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <ShowroomPhotoGallery photos={photos} alt={title} onOpenLightbox={setLightboxIndex} />
            </div>

            <p className="mt-4 text-2xl font-semibold text-[#A6793D] tabular-nums">
              {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢"}
            </p>

            <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              車輛規格
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <SpecItem icon="🏷️" label="廠牌" value={car.brand} />
              <SpecItem icon="🚗" label="車型" value={car.model_name} />
              <SpecItem icon="📅" label="出廠年份" value={car.year ? `${car.year} 年` : null} />
              <SpecItem
                icon="📝"
                label="領牌年份"
                value={car.license_year ? `${car.license_year} 年` : null}
              />
              <SpecItem
                icon="🛣️"
                label="里程數"
                value={car.mileage != null ? `${formatNumber(car.mileage)} km` : null}
              />
              <SpecItem
                icon="⚡"
                label="排氣量"
                value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : null}
              />
              <SpecItem icon="⚙️" label="傳動 / 變速箱" value={car.transmission} />
              <SpecItem icon="🎨" label="車身顏色" value={car.color} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecItem({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <span className="text-lg" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-400">{label}</p>
        <p className="truncate text-sm font-medium text-neutral-700">{value ?? "—"}</p>
      </div>
    </div>
  );
}
