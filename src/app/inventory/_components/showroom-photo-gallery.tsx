"use client";

import { useRef, useState } from "react";
import { FadeImage } from "./fade-image";

/**
 * 車輛詳情用的多圖相簿：上方大圖 + 下方縮圖列，大圖右下角有「目前張數/總
 * 張數」標記，點大圖呼叫 onOpenLightbox 開全螢幕檢視。
 *
 * 手機滑動用原生 CSS scroll-snap（overflow-x-auto + snap-x），不是自己
 * 算手勢座標——瀏覽器原生支援觸控滑動/慣性捲動，比手刻 touch 事件穩定，
 * 桌機則靠左右箭頭按鈕跟縮圖點擊（同一個 scrollToIndex()，行為一致）。
 *
 * 注意：全螢幕 Lightbox 不是這個元件自己開的——它只負責「呼叫
 * onOpenLightbox(index)」，實際的全螢幕遮罩由 ShowroomDetailModal 統一
 * 管理（原因見 showroom-lightbox.tsx 開頭的說明：同一時間只能有一層
 * position:fixed 滿版遮罩，不能疊兩層）。
 *
 * 配色跟隨黑白灰主色調：淺灰底、黑色縮圖選中框——見 showroom-page.tsx
 * 開頭「視覺風格」的完整說明，跳色只留給價格跟主要 CTA，這裡的縮圖選中
 * 狀態不需要用到橘紅色。
 */
export function ShowroomPhotoGallery({
  photos,
  alt,
  onOpenLightbox,
}: {
  photos: string[];
  alt: string;
  onOpenLightbox: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const total = photos.length;

  function scrollToIndex(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(index, total - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setActiveIndex(clamped);
  }

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== activeIndex) setActiveIndex(Math.max(0, Math.min(next, total - 1)));
  }

  if (total === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-[#F5F5F5] text-xs tracking-widest text-[#A3A3A3]">
        尚無照片
      </div>
    );
  }

  return (
    <div>
      {/* 大圖 */}
      <div className="relative overflow-hidden rounded-2xl bg-[#F5F5F5]">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="no-scrollbar flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
        >
          {photos.map((url, i) => (
            <FadeImage
              key={i}
              src={url}
              alt={`${alt} - 第 ${i + 1} 張`}
              onClick={() => onOpenLightbox(i)}
              loading={i === 0 ? "eager" : "lazy"}
              className="h-full w-full shrink-0 snap-center cursor-zoom-in"
              imgClassName="object-cover"
            />
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              aria-label="上一張"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-[#E5E5E5] bg-white/90 px-2.5 py-2 text-[#404040] shadow backdrop-blur transition-all duration-200 ease-out hover:border-[#BFA074] hover:text-[#171717] hover:shadow-[0_0_0_3px_rgba(191,160,116,0.25)] active:scale-90 active:shadow-[0_0_0_4px_rgba(191,160,116,0.45)]"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              aria-label="下一張"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-[#E5E5E5] bg-white/90 px-2.5 py-2 text-[#404040] shadow backdrop-blur transition-all duration-200 ease-out hover:border-[#BFA074] hover:text-[#171717] hover:shadow-[0_0_0_3px_rgba(191,160,116,0.25)] active:scale-90 active:shadow-[0_0_0_4px_rgba(191,160,116,0.45)]"
            >
              ›
            </button>
            {/* 照片張數標記 */}
            <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
              {activeIndex + 1} / {total}
            </span>
          </>
        )}
      </div>

      {/* 縮圖列 */}
      {total > 1 && (
        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`切換到第 ${i + 1} 張照片`}
              className={
                "aspect-square w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all duration-200 ease-out active:scale-95 " +
                (i === activeIndex ? "ring-[#171717]" : "ring-[#E5E5E5] opacity-70 hover:opacity-100")
              }
            >
              <FadeImage src={url} alt="" className="h-full w-full" imgClassName="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
