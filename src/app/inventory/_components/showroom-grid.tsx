"use client";

import { carDisplayName, formatCurrency } from "@/lib/format";
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
 * 開頭「視覺風格」的完整說明。
 *
 * 2026-08：使用者上傳「雜誌選書」排版的參考檔案（inventoryv4magazine.html）
 * 要求「前台改成這樣」——桌機版（lg 以上）挑出一部分車輛放大成 2×2 的
 * 雜誌感 bento 格狀；手機／平板螢幕還不夠寬，放大格反而佔太多版面，
 * 維持原本大小一致的一般格狀，跟參考檔案本身在窄螢幕收斂成一般格狀是
 * 同一個道理。
 *
 * 2026-08 第二輪：使用者明確要求「哪些車要大圖、哪些要小圖，我要能自己
 * 設定」——原本是自動挑排序第一台放大，改成看每台車自己的
 * `is_large_card`（後台「大圖卡」開關，見 car-form-modal.tsx）。車行還
 * 沒開始使用這個開關（清單裡沒有任何一台車勾選）的話，退回舊行為（第一
 * 台放大），保留改版當下的雜誌感預設外觀，不會因為她還沒設定就整排變成
 * 死板的一般格狀；只要她勾了至少一台，就完全照她勾的來，不再混用自動
 * 邏輯。可以同時勾多台變大圖——`lg:grid-flow-row-dense` 讓瀏覽器自動把
 * 後面的一般格狀車輛「回填」進放大格之間留下的空隙，不管勾幾台、勾在
 * 清單哪個位置，版面都不會因此出現破洞。 */
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
  const anyManuallyLarge = cars.some((c) => c.is_large_card);

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4 lg:auto-rows-[1fr] lg:grid-flow-row-dense">
      {cars.map((car, i) => (
        <ShowroomCard
          key={car.id}
          car={car}
          large={anyManuallyLarge ? car.is_large_card : i === 0}
          photoCount={photosByCarId?.[car.id]?.length ?? 0}
          onClick={() => onSelect(car)}
        />
      ))}
    </div>
  );
}

function ShowroomCard({
  car,
  large,
  photoCount,
  onClick,
}: {
  car: ShowroomCar;
  /** 只有桌機（lg 以上）才會真的放大成 2×2——見上面 ShowroomGrid 的說明。 */
  large: boolean;
  photoCount: number;
  onClick: () => void;
}) {
  const recent = isRecentlyListed(car.created_at);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "btn-tex-feature group col-span-2 flex flex-col overflow-hidden rounded-2xl border border-[#eae7e2] bg-white text-left shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-[#BFA074]/50 hover:shadow-[0_0_0_1px_#BFA074,0_16px_32px_-16px_rgba(191,160,116,0.35)] active:scale-[0.98] active:duration-100 sm:col-span-1 " +
        (large ? "lg:col-span-2 lg:row-span-2" : "")
      }
    >
      <div
        className={
          "relative w-full overflow-hidden bg-[#F5F5F5] " +
          (large ? "aspect-[16/10] lg:aspect-[16/12]" : "aspect-[16/10]")
        }
      >
        {car.image_url ? (
          <FadeImage
            src={car.image_url}
            alt={`${car.brand ?? ""} ${car.model_name}`}
            className="h-full w-full"
            imgClassName="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs tracking-widest text-[#A3A3A3]">
            尚無照片
          </div>
        )}
        {car.brand && (
          <span className="font-showroom-display absolute left-3 top-3 z-[1] rounded-full bg-[#0f1012]/85 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-white">
            {car.brand}
          </span>
        )}
        <div className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1.5">
          {/* 熱門推薦是後台手動開關的真實資料（見 car-form-modal.tsx 的
              is_featured 說明），不是系統自動判斷，可以跟「近期上架」
              同時出現，兩個標籤各自獨立、互不影響。 */}
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
        {/* 相簿張數——只有超過 1 張才顯示，1 張以下（等於只有封面圖）標
            出來對顧客沒有額外資訊。 */}
        {photoCount > 1 && (
          <div className="absolute bottom-2.5 right-2.5 rounded-sm bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
            {photoCount} 張
          </div>
        )}
      </div>

      <div className={"flex flex-1 flex-col " + (large ? "p-5 lg:p-6" : "p-4")}>
        <h3
          className={
            "font-showroom-display truncate tracking-wide text-[#171717] " +
            (large ? "text-base lg:text-xl" : "text-[14.5px]")
          }
        >
          {/* 2026-08-31：廠牌已經是照片左上角的獨立徽章，這裡用
              includeBrand:false 併入出廠年份、不重複帶廠牌；原本下面
              另外一個「年式」小徽章移除，避免年份重複顯示兩次——見
              format.ts carDisplayName 的說明。 */}
          {carDisplayName(car, { includeBrand: false })}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {car.color && <MiniBadge>{car.color}</MiniBadge>}
          {large && car.body_type && <MiniBadge>{car.body_type}</MiniBadge>}
        </div>
        <p
          className={
            "font-showroom-display mt-auto pt-3 tabular-nums text-[#6E0F1A] " +
            (large ? "text-xl lg:text-2xl" : "text-base")
          }
        >
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
