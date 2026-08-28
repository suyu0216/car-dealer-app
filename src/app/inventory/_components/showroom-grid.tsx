"use client";

import { formatCurrency } from "@/lib/format";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import { FadeImage } from "./fade-image";

/** 上架多少天內算「近期上架」，會在卡片上顯示徽章——用真實的
 * car.created_at 算，不是憑空捏造的「熱門/搶購中」假訊息，見
 * public-cars.ts 對這個欄位的說明。 */
const RECENTLY_LISTED_DAYS = 7;

function isRecentlyListed(createdAt: string): boolean {
  const days = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return days <= RECENTLY_LISTED_DAYS;
}

/** 前台展間的車輛卡片格狀列表——純展示，選中哪一輛車交給 onSelect 往上
 * 通知，「哪個詳情 Modal 開著」統一由 ShowroomPage 管理（見該檔案開頭的
 * 說明：為什麼要統一管理，以及為什麼 Modal 開著時要把這個列表整個
 * `hidden` 掉）。
 *
 * 黑白灰卡片：白底卡面、淺灰邊框，粗黑體車型標題，只有價格跟「近期
 * 上架」維持橘紅色——跳色只留給真正該注意的地方，見 showroom-page.tsx
 * 開頭「視覺風格」的完整說明。 */
export function ShowroomGrid({
  cars,
  photosByCarId,
  onSelect,
}: {
  cars: ShowroomCar[];
  /** 每輛車的相簿張數，給卡片右下角「N 張」小標示用；沒有相簿的車輛
   * （只有單張 image_url，或完全沒照片）就不顯示這個標示——選填，
   * 沒傳的話卡片一律不顯示張數。 */
  photosByCarId?: Record<string, string[]>;
  onSelect: (car: ShowroomCar) => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cars.map((car) => (
        <ShowroomCard
          key={car.id}
          car={car}
          photoCount={photosByCarId?.[car.id]?.length ?? 0}
          onClick={() => onSelect(car)}
        />
      ))}
    </div>
  );
}

function ShowroomCard({
  car,
  photoCount,
  onClick,
}: {
  car: ShowroomCar;
  photoCount: number;
  onClick: () => void;
}) {
  const recent = isRecentlyListed(car.created_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-tex-feature group overflow-hidden rounded-xl border border-[#E5E5E5] bg-white text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#BFA074]/50 hover:shadow-[0_0_0_1px_#BFA074,0_16px_32px_-16px_rgba(191,160,116,0.35)] active:scale-[0.98] active:duration-100"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#F5F5F5]">
        {car.image_url ? (
          <FadeImage
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            className="h-full w-full"
            imgClassName="object-cover group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs tracking-widest text-[#A3A3A3]">
            尚無照片
          </div>
        )}
        <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
          {/* 熱門推薦是後台手動開關的真實資料（見 car-form-modal.tsx 的
              is_featured 說明），不是系統自動判斷，可以跟「近期上架」
              同時出現，兩個標籤各自獨立、互不影響。2026-08 第四版：拿掉
              星號表情符號，純文字標籤看起來更專業（見 showroom-page.tsx
              開頭「視覺風格」的說明），形狀也一併改成長方形。 */}
          {car.is_featured && (
            <span className="rounded-sm bg-[#171717] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">
              熱門推薦
            </span>
          )}
          {recent && (
            <span className="rounded-sm bg-[#E8542D] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white shadow">
              近期上架
            </span>
          )}
        </div>
        {car.brand && (
          <div className="font-showroom-display absolute right-2.5 top-2.5 rounded-sm border border-[#E5E5E5] bg-white/95 px-2.5 py-0.5 text-xs font-bold tracking-wide text-[#171717] backdrop-blur">
            {car.brand}
          </div>
        )}
        {/* 相簿張數——只有超過 1 張才顯示，1 張以下（等於只有封面圖）標
            出來對顧客沒有額外資訊。拿掉相機表情符號，純文字「N 張」。 */}
        {photoCount > 1 && (
          <div className="absolute bottom-2.5 right-2.5 rounded-sm bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            {photoCount} 張
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-showroom-display truncate text-[15px] tracking-wide text-[#171717]">
          {car.model_name}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {car.body_type && <MiniBadge>{car.body_type}</MiniBadge>}
          {car.year && <MiniBadge>{car.year} 年式</MiniBadge>}
          {car.color && <MiniBadge>{car.color}</MiniBadge>}
        </div>
        <div className="mt-3.5 h-px w-full bg-[#E5E5E5]" />
        <p className="font-showroom-display mt-3 text-xl tabular-nums text-[#E8542D]">
          {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢底價"}
        </p>
      </div>
    </button>
  );
}

function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[11px] font-medium text-[#737373]">
      {children}
    </span>
  );
}
