"use client";

import { useEffect, useState } from "react";
import { carDisplayName, formatCurrency, formatNumber } from "@/lib/format";
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
 * 車輛一多整頁高度可以到兩三萬 px）會觸發 Chromium 的合成錯誤，下層內容
 * 會從「破洞」透出來，唯一有效的修法就是同一時間只保留一層。
 *
 * photos 是這輛車完整的相簿網址（已依 sort_order 排序）；如果 car_photos
 * 裡沒有任何照片，就退回用 car.image_url 當唯一一張（見
 * showroom-grid.tsx 組 photos 的地方），car.image_url 本身也沒有的話，
 * ShowroomPhotoGallery 會顯示佔位圖示。
 *
 * 黑白灰為主的面板：白色面板、淺灰邊框、粗黑體標題，只有價格維持橘紅色
 * （見 showroom-page.tsx 開頭「視覺風格」的完整說明）；非 Lightbox 狀態下
 * 的背景遮罩維持深色半透明，讓白色面板在深色背景襯托下更突出、更聚焦。
 */
export function ShowroomDetailModal({
  car,
  photos,
  lineUrl,
  onClose,
}: {
  car: ShowroomCar;
  photos: string[];
  /** 頁首那顆「加 LINE」按鈕用的同一個連結（car dealer 沒填 line_id 就是
   * null）——詳情 Modal 是顧客已經點進來仔細看某一台車、興趣最高的時候，
   * 這裡再放一次「加 LINE」是刻意的：不用讓顧客關掉 Modal、滑回頁首才
   * 找得到聯絡方式，趁興趣正濃直接促成行動。 */
  lineUrl: string | null;
  onClose: () => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const title = [car.brand, car.model_name].filter(Boolean).join(" ");
  const lightboxOpen = lightboxIndex !== null;

  // 開啟時的淡入＋縮放進場動畫——比照篩選抽屜（FilterDrawer）「先掛載、
  // 下一個畫面更新才把狀態切成『已進場』」的手法：背景遮罩淡入、白色
  // 面板同時淡入＋從稍微縮小/往下一點點的位置回到正常大小位置，讓開啟
  // 車輛詳情的瞬間也跟篩選抽屜一樣滑順，不是像之前那樣直接「跳」出來。
  // 只在第一次掛載時觸發一次；之後切到全螢幕 Lightbox 模式不會重新
  // 觸發（entered 已經是 true），維持 Lightbox 原本「直接替換內容」的
  // 處理方式（見 showroom-lightbox.tsx 開頭的說明）。
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center px-4 py-8 transition-opacity duration-300 ease-out " +
        (entered ? "opacity-100" : "opacity-0") +
        " " +
        (lightboxOpen ? "bg-black/90" : "bg-[#171717]/70 backdrop-blur-sm")
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
          className={
            "relative max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E5E5E5] bg-white shadow-2xl transition-all duration-300 ease-out " +
            (entered ? "scale-100 opacity-100" : "scale-95 opacity-0")
          }
          onClick={(e) => e.stopPropagation()}
        >
          {/* 底部一律留白，避免內容被下面固定的加 LINE 按鈕列遮住——手機
              直式排列規格表比較長，不留白的話最後一兩項會被蓋住。 */}
          <div className={"p-4 sm:p-5 " + (lineUrl ? "pb-24 sm:pb-5" : "")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#737373]">
                  {car.brand ?? "未標示廠牌"}
                </p>
                <h2 className="font-showroom-display mt-1 text-xl tracking-wide text-[#171717]">
                  {/* 2026-08-31：廠牌已經在上面單獨顯示一次，這裡用
                      includeBrand:false 併入出廠年份、不重複帶廠牌——見
                      format.ts carDisplayName 的說明。下面規格格狀卡片
                      裡仍保留獨立的「出廠年份」欄位，那是完整規格表的
                      一部分，跟標題重複無妨。 */}
                  {carDisplayName(car, { includeBrand: false })}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉"
                className="rounded-sm border border-[#E5E5E5] bg-[#FAFAFA] px-2.5 py-1 text-[#737373] transition-all duration-200 ease-out hover:border-[#BFA074] hover:text-[#171717] hover:shadow-[0_0_0_3px_rgba(191,160,116,0.25)] active:scale-90 active:shadow-[0_0_0_4px_rgba(191,160,116,0.45)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <ShowroomPhotoGallery photos={photos} alt={title} onOpenLightbox={setLightboxIndex} />
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <p className="font-showroom-display text-3xl tabular-nums text-[#E8542D]">
                {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢底價"}
              </p>
            </div>

            {/* 看到照片、規格、價格之後興趣最高的當下，直接放一顆最顯眼的
                加 LINE 按鈕——顧客不用關掉 Modal、滑回頁首才找得到聯絡
                方式。文案只邀請「詢問／預約」，不會寫「線上付訂」這種
                目前系統其實沒有的功能。2026-08 第四版：拿掉表情符號、
                圓角改成長方形（rounded-sm），跟全站按鈕系統一致，見
                showroom-page.tsx 開頭「視覺風格」的完整說明。 */}
            {lineUrl && (
              <a
                href={lineUrl}
                target="_blank"
                rel="noreferrer"
                className="font-showroom-display mt-4 flex items-center justify-center gap-2 rounded-sm bg-[#06C755] px-5 py-3.5 text-[15px] text-white shadow-md shadow-[#06C755]/25 transition-all duration-300 ease-out hover:bg-[#05a847] active:scale-[0.97] active:duration-100"
              >
                加 LINE 詢問這台車 / 預約看車
              </a>
            )}

            <div className="mt-5 flex items-center gap-3">
              <h3 className="font-showroom-display shrink-0 text-xs uppercase tracking-[0.2em] text-[#737373]">
                車輛規格
              </h3>
              <div className="h-px flex-1 bg-[#E5E5E5]" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <SpecItem label="廠牌" value={car.brand} />
              <SpecItem label="車型" value={car.model_name} />
              <SpecItem label="出廠年份" value={car.year ? `${car.year} 年` : null} />
              <SpecItem label="領牌年份" value={car.license_year ? `${car.license_year} 年` : null} />
              <SpecItem
                label="里程數"
                value={car.mileage != null ? `${formatNumber(car.mileage)} km` : null}
              />
              <SpecItem
                label="排氣量"
                value={car.engine_cc ? `${formatNumber(car.engine_cc)} cc` : null}
              />
              <SpecItem label="傳動 / 變速箱" value={car.transmission} />
              <SpecItem label="車身顏色" value={car.color} />
            </div>
          </div>

          {/* 手機版固定在 Modal 底部的加 LINE 按鈕列——規格表比較長，滑到
              下面時上面那顆按鈕會滑出畫面外，這裡讓它一路貼著 Modal 底部
              保持可見，不用滑回頂端才點得到。桌機版 Modal 本來就矮，不需要
              這個，見上面 `sm:pb-5`／`sm:hidden`。 */}
          {lineUrl && (
            <div className="sticky bottom-0 border-t border-[#E5E5E5] bg-white/95 p-3 backdrop-blur sm:hidden">
              <a
                href={lineUrl}
                target="_blank"
                rel="noreferrer"
                className="font-showroom-display flex items-center justify-center gap-2 rounded-sm bg-[#06C755] px-5 py-3 text-sm text-white shadow-md shadow-[#06C755]/25 transition-all duration-300 ease-out hover:bg-[#05a847] active:scale-[0.97] active:duration-100"
              >
                加 LINE 詢問這台車 / 預約看車
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 車輛規格單一項目——2026-08 第四版拿掉了 icon 前綴（原本是 🏷️🚗📅 等
 * 表情符號），使用者的意見是文字旁邊放符號看起來不專業，改成純文字的
 * 標籤/數值兩行式排版，靠淺灰標籤字＋粗體數值字的層次做區隔就夠清楚。 */
function SpecItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-sm border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2.5">
      <p className="text-[11px] text-[#A3A3A3]">{label}</p>
      <p className="truncate text-sm font-medium text-[#404040]">{value ?? "—"}</p>
    </div>
  );
}
