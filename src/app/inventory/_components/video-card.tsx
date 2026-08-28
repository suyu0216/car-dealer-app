// 「影音專區」（品牌簡介頁）用——車行貼的是「抖音／YouTube 上的影片
// 網址」，不是我們自己存放的影片檔案，這裡嘗試把常見網址格式轉成可以
// 直接嵌入播放的 iframe 網址。辨識不出來的網址（例如短網址、Instagram/
// Facebook 影片、或格式之後改版）就退回顯示「前往觀看」連結卡片，不會
// 讓整個區塊壞掉——這是刻意的保守設計，車行本來就可能貼各種奇怪格式的
// 連結進來。
import type { TenantVideo } from "@/lib/supabase/types";

type VideoEmbedKind = "youtube" | "tiktok" | "file" | "link";

export function classifyVideoUrl(rawUrl: string): { kind: VideoEmbedKind; embedSrc?: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "link" };
  }
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (id) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${id}` };
    }
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${shortsMatch[1]}` };
    const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch) return { kind: "youtube", embedSrc: `https://www.youtube.com/embed/${embedMatch[1]}` };
  }
  if (host === "tiktok.com") {
    const videoMatch = url.pathname.match(/\/video\/(\d+)/);
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
  const { kind, embedSrc } = classifyVideoUrl(video.video_url);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E5E5E5] bg-white shadow-sm">
      <div
        className={
          "relative w-full overflow-hidden bg-[#171717] " +
          (kind === "tiktok" ? "aspect-[9/16] max-h-[520px]" : "aspect-video")
        }
      >
        {kind === "youtube" && embedSrc && (
          <iframe
            src={embedSrc}
            title={video.title ?? "影片"}
            loading="lazy"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
        {kind === "tiktok" && embedSrc && (
          <iframe
            src={embedSrc}
            title={video.title ?? "影片"}
            loading="lazy"
            className="h-full w-full"
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
