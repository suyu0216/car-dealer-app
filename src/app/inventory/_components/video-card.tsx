"use client";

// 「影音專區」（品牌簡介頁）用——車行貼的是「抖音／YouTube 上的影片
// 網址」，不是我們自己存放的影片檔案，這裡嘗試把常見網址格式轉成可以
// 直接嵌入播放的 iframe 網址。辨識不出來的網址（例如短網址、Instagram/
// Facebook 影片、或格式之後改版）就退回顯示「前往觀看」連結卡片，不會
// 讓整個區塊壞掉——這是刻意的保守設計，車行本來就可能貼各種奇怪格式的
// 連結進來。
//
// 2026-08 修正「抖音連結常常卡住」：實測發現不是網址解析錯誤（三支影片的
// embed 網址都是對的，直接開 https://www.tiktok.com/embed/v2/{id} 都能
// 正常播放），問題出在同一頁「一次」塞好幾個抖音 iframe 給瀏覽器同時
// 載入——抖音官方的嵌入播放器（embed.js）在同一頁面上有多支影片同時初始化
// 時，經常只有第一支能正常抓到播放資料，其餘的會顯示它自己的
// 「無法觀看影片」錯誤畫面，不是我們這邊網址或程式邏輯的問題，是抖音嵌入
// 播放器本身在「多支同時載入」情境下不夠穩定。修法：抖音／YouTube 影片都
// 改成「使用者按下去才真的塞入 iframe」——每次最多只有使用者主動點開的
// 那一支在載入，不會有好幾支搶著跟平台要播放資料，從根本避開這個多支
// 同時初始化的不穩定情境。
//
// 2026-08 第二輪：上面那版點開前顯示的是純黑底＋「點擊播放」文字（沒有
// 真正的影片封面），車行反應不想要那個中間過場畫面，希望能直接看到影片
// 封面照。改成：點開前就顯示真正的縮圖——YouTube 有官方固定網址規則可以
// 直接組出縮圖網址（img.youtube.com），抖音沒有這種固定規則，改成頁面
// 載入後另外呼叫抖音官方的 oEmbed API（https://www.tiktok.com/oembed，
// 純粹的公開 JSON 資料查詢，不是嵌入播放器腳本）拿封面圖網址——這支 API
// 只回傳「這支影片長什麼樣子」的資料（標題、作者、封面圖），不會像
// embed.js 播放器那樣有「同頁多支同時初始化」的不穩定問題，所以可以放心
// 讓三支影片同時查。查到封面前先顯示黑底佔位，查失敗（例如抖音那邊那天
// 剛好打不通）就維持黑底＋播放圖示，不影響「點下去才載入播放器」這個
// 已經驗證過能解決卡住問題的核心機制。
import { useEffect, useState } from "react";
import type { TenantVideo } from "@/lib/supabase/types";

type VideoEmbedKind = "youtube" | "tiktok" | "file" | "link";

export function classifyVideoUrl(
  rawUrl: string
): { kind: VideoEmbedKind; embedSrc?: string; posterSrc?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "link" };
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (id) {
      return {
        kind: "youtube",
        embedSrc: `https://www.youtube.com/embed/${id}`,
        // YouTube 官方固定的縮圖網址規則，不用另外打 API 查。
        posterSrc: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      };
    }
  }
  if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (id) {
        return {
          kind: "youtube",
          embedSrc: `https://www.youtube.com/embed/${id}`,
          posterSrc: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
        };
      }
    }
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) {
      return {
        kind: "youtube",
        embedSrc: `https://www.youtube.com/embed/${shortsMatch[1]}`,
        posterSrc: `https://img.youtube.com/vi/${shortsMatch[1]}/hqdefault.jpg`,
      };
    }
    const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch) {
      return {
        kind: "youtube",
        embedSrc: `https://www.youtube.com/embed/${embedMatch[1]}`,
        posterSrc: `https://img.youtube.com/vi/${embedMatch[1]}/hqdefault.jpg`,
      };
    }
  }
  if (host === "tiktok.com") {
    const videoMatch = url.pathname.match(/\/video\/(\d+)/);
    // 抖音沒有像 YouTube 那樣「憑影片 ID 直接組出縮圖網址」的固定規則，
    // 封面圖要另外用 oEmbed API 查，見 VideoCard 內的 useEffect。
    if (videoMatch) return { kind: "tiktok", embedSrc: `https://www.tiktok.com/embed/v2/${videoMatch[1]}` };
  }
  if (/\.(mp4|webm|mov)$/i.test(url.pathname)) {
    return { kind: "file" };
  }
  return { kind: "link" };
}

/** 影音專區的單一影片卡片——YouTube／抖音(TikTok) 網址嵌入播放器；直接
 * 指向影片檔案（.mp4 等）用原生 `<video>` 播放；其他辨識不出來的網址
 * 顯示「前往觀看」連結卡片（黑底、居中播放圖示），點了才跳出去，不會
 * 讓整個區塊因為一個奇怪的連結而壞掉。TikTok 用直式比例（9:16），跟它
 * 原本的短影音格式一致；其他都用一般的 16:9 橫式。 */
export function VideoCard({ video }: { video: TenantVideo }) {
  const { kind, embedSrc, posterSrc: staticPosterSrc } = classifyVideoUrl(video.video_url);
  // 使用者主動點過播放鍵之後才是 true——按下去之前完全不會渲染 iframe，
  // 見檔案開頭 2026-08 的說明：這是為了避免同一頁好幾支抖音影片同時搶著
  // 初始化，導致除了第一支以外都顯示「無法觀看影片」的問題。
  const [activated, setActivated] = useState(false);
  // 抖音封面圖要另外查 oEmbed API 才拿得到，查到之前是 null（畫面上先顯示
  // 黑底，不影響任何功能）。YouTube 不需要這個 state，封面網址靠固定
  // 規則直接組出來就好，見 classifyVideoUrl。
  const [tiktokPosterSrc, setTiktokPosterSrc] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "tiktok") return;
    let cancelled = false;
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(video.video_url)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.thumbnail_url) setTiktokPosterSrc(data.thumbnail_url);
      })
      .catch(() => {
        // 查不到封面就維持黑底＋播放圖示，不影響「點下去才載入播放器」
        // 這個核心機制，畫面不會壞掉。
      });
    return () => {
      cancelled = true;
    };
  }, [kind, video.video_url]);

  const posterSrc = kind === "tiktok" ? tiktokPosterSrc : staticPosterSrc;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-sm">
      <div
        className={
          "relative w-full overflow-hidden bg-[#171717] " +
          (kind === "tiktok" ? "aspect-[9/16] max-h-[520px]" : "aspect-video")
        }
      >
        {kind === "youtube" && embedSrc && (
          activated ? (
            <iframe
              src={embedSrc + "?autoplay=1"}
              title={video.title ?? "影片"}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <VideoPosterButton onClick={() => setActivated(true)} posterSrc={posterSrc} />
          )
        )}
        {kind === "tiktok" && embedSrc && (
          activated ? (
            <iframe
              src={embedSrc}
              title={video.title ?? "影片"}
              className="h-full w-full"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <VideoPosterButton onClick={() => setActivated(true)} posterSrc={posterSrc} />
          )
        )}
        {kind === "file" && (
          <video
            src={video.video_url}
            controls
            preload="metadata"
            className="h-full w-full object-contain"
          />
        )}
        {kind === "link" && (
          <a
            href={video.video_url}
            target="_blank"
            rel="noreferrer"
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-white transition-all duration-300 ease-out hover:bg-white/5 active:scale-[0.98]"
          >
            <PlayIcon />
            <span className="text-xs tracking-wide">前往觀看影片</span>
          </a>
        )}
      </div>
      {video.title && (
        <p className="px-4 py-3 text-sm font-medium text-[#404040]">{video.title}</p>
      )}
    </div>
  );
}

/** 抖音／YouTube 影片被使用者實際點開播放之前顯示的畫面——直接顯示真正
 * 的影片封面照（posterSrc 還沒查到時先顯示黑底，不會整塊空白或壞掉），
 * 中間疊一顆半透明播放鍵，點下去才「原地」塞入 iframe 播放，不是新開
 * 分頁。封面圖用一般 `<img>` 不用 next/image——抖音封面是每次查詢都不同
 * 網域的簽章網址（CDN 子網域、有效期限都會變），沒辦法預先加進 Next.js
 * 圖片網域白名單。 */
function VideoPosterButton({ onClick, posterSrc }: { onClick: () => void; posterSrc?: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-full w-full items-center justify-center"
    >
      {posterSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterSrc}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/20 transition-colors duration-300 ease-out group-hover:bg-black/30" />
      <span className="relative z-[1] flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-95">
        <PlayIcon />
      </span>
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
