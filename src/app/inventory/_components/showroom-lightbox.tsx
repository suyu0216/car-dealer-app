"use client";

import { useEffect } from "react";

/**
 * 全螢幕放大檢視的「內容」——不含自己的 fixed 外層/backdrop，是刻意的。
 *
 * 原本這裡自己包一層 `fixed inset-0`（甚至還用 createPortal 掛到
 * document.body），疊在 ShowroomDetailModal 自己的 `fixed inset-0` 上面。
 * 實測（用最小 repro.html，跟 React/Next.js/Tailwind 都無關）證實：兩層
 * 各自獨立的 position:fixed 滿版遮罩疊在一起、又是很長的頁面（/inventory
 * 手機直式單欄、車輛一多整頁高度上看兩三萬 px）時，Chromium 合成畫面會
 * 出現「上層遮罫沒有完全蓋住下層」的錯誤，下層 Modal 的內容會從「破洞」
 * 透出來——鎖 body 捲動、換用 createPortal 都測過，沒用，唯一有效的
 * 修法是「同一時間只能有一層 fixed 滿版遮罩」。所以現在 Lightbox 只負責
 * 畫「裡面的東西」，那層唯一的 fixed 外層由 ShowroomDetailModal 統一
 * 提供，開 Lightbox 時是「替換」Modal 原本的內容，不是「疊」上去。
 */
export function ShowroomLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const total = photos.length;

  // 鍵盤操作：Esc 關閉、左右鍵切換——全螢幕看圖時滑鼠可能不在畫面附近
  // （尤其外接鍵盤/平板加鍵盤的使用情境），鍵盤操作是這種畫面的標準預期行為。
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onIndexChange((index - 1 + total) % total);
      if (e.key === "ArrowRight") onIndexChange((index + 1) % total);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index, total, onIndexChange, onClose]);

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉放大檢視"
        className="absolute right-4 top-4 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-lg text-white transition-all duration-200 ease-out hover:border-[#BFA074]/70 hover:bg-white/20 hover:shadow-[0_0_0_3px_rgba(191,160,116,0.3)] active:scale-90 active:shadow-[0_0_0_5px_rgba(191,160,116,0.45)]"
      >
        ✕
      </button>

      {total > 1 && (
        <span className="absolute left-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm text-white/70">
          {index + 1} / {total}
        </span>
      )}

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange((index - 1 + total) % total);
          }}
          aria-label="上一張"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-3 text-xl text-white transition-all duration-200 ease-out hover:border-[#BFA074]/70 hover:bg-white/20 hover:shadow-[0_0_0_3px_rgba(191,160,116,0.3)] active:scale-90 active:shadow-[0_0_0_5px_rgba(191,160,116,0.45)] sm:left-4"
        >
          ‹
        </button>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element -- 車輛照片來源是 Supabase Storage 的公開網址，走 next/image 需要額外設定允許的 domain 白名單。 */}
      <img
        src={photos[index]}
        alt={`放大檢視 ${index + 1}/${total}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full cursor-default object-contain"
      />

      {total > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange((index + 1) % total);
          }}
          aria-label="下一張"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-3 text-xl text-white transition-all duration-200 ease-out hover:border-[#BFA074]/70 hover:bg-white/20 hover:shadow-[0_0_0_3px_rgba(191,160,116,0.3)] active:scale-90 active:shadow-[0_0_0_5px_rgba(191,160,116,0.45)] sm:right-4"
        >
          ›
        </button>
      )}
    </>
  );
}
