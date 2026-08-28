"use client";

// 可重用的「淡入」圖片元件——取代裸的 <img>，圖片還沒下載完成之前先顯示
// 一塊淡灰色、帶一點呼吸感（animate-pulse）的佔位區塊，避免使用者滑到
// 一半圖片突然「啪」一聲蹦出來的突兀感；圖片下載完成的瞬間才淡入
// （transition），感覺比較從容、滑順（見使用者需求：「讓網頁更滑順」）。
//
// 用法：直接取代原本的 <img ...>。這個元件自己在內部包一層填滿容器的
// relative wrapper，佔位層跟圖片本身都用 absolute inset-0 疊在一起：
// - 呼叫端如果本來就有自己的 `relative aspect-*/overflow-hidden` 外層容器
//   （例如 showroom-grid.tsx 的車輛卡片），維持原本外層不動，把
//   `className="h-full w-full"` 傳進來讓 FadeImage 填滿那個容器即可，
//   外層原本疊放的徽章（熱門推薦／近期上架等 absolute 定位標籤）完全
//   不受影響。
// - 呼叫端是水平橫向捲動列表的其中一格（例如
//   showroom-photo-gallery.tsx 的相簿滑動主圖，每張圖本身就是 flex
//   容器的一個子項目、需要保留 shrink-0/snap-center 這些排版
//   class）——把這些 class 透過 `className` 傳進來掛在外層 wrapper 上
//   即可，wrapper 會直接成為 flex 的子項目，佔位層/圖片本身仍然用
//   absolute 疊在 wrapper 內部，不影響水平捲動排版。
//
// imgClassName 只需要傳「物件填充方式（object-cover/contain）、hover
// 縮放效果」這類額外效果 class，不用重複寫 transition/duration——淡入
// 用的 transition duration-500 已經內建在這個元件裡，Tailwind 的
// `transition`（不是 `transition-opacity`）本來就同時涵蓋 opacity 跟
// transform，跟 hover 縮放共用同一個 transition 沒有衝突，兩種效果
// （淡入、hover 縮放）用同一個 500ms 一起處理即可。
//
// 圖片已經是瀏覽器快取的情況（例如使用者按上一頁/下一頁又切回來）——
// <img> 的 onLoad 不一定會再觸發一次，這裡在 mount／src 換圖時額外檢查
// `imgRef.current?.complete`，已經完成的圖片直接跳過淡入直接顯示，不會
// 卡在「明明圖片已經在，卻一直顯示灰色佔位」的狀態。
import { useEffect, useRef, useState } from "react";

export function FadeImage({
  src,
  alt,
  className,
  imgClassName,
  placeholderClassName,
  onClick,
  loading = "lazy",
  fetchPriority,
}: {
  src: string;
  alt: string;
  /** 掛在最外層 wrapper 上的 class——負責跟呼叫端的排版銜接（尺寸、
   * flex/shrink、cursor 等），wrapper 本身固定是 relative overflow-hidden。 */
  className?: string;
  /** 掛在實際 <img> 上的額外效果 class（object-cover/contain、
   * group-hover 縮放等），不用重複寫 transition/duration，見檔案開頭說明。 */
  imgClassName?: string;
  /** 佔位層底色，預設是淺灰＋呼吸動畫，跟展間卡片常用的淺灰底一致。 */
  placeholderClassName?: string;
  onClick?: () => void;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(imgRef.current?.complete ?? false);
  }, [src]);

  return (
    <div className={"relative overflow-hidden " + (className ?? "")} onClick={onClick}>
      <div
        aria-hidden
        className={
          "absolute inset-0 transition-opacity duration-500 " +
          (loaded ? "opacity-0" : "opacity-100 animate-pulse") +
          " " +
          (placeholderClassName ?? "bg-[#F0F0F0]")
        }
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明 */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        onLoad={() => setLoaded(true)}
        className={
          "absolute inset-0 h-full w-full transition duration-500 " +
          (loaded ? "opacity-100" : "opacity-0") +
          " " +
          (imgClassName ?? "object-cover")
        }
      />
    </div>
  );
}
