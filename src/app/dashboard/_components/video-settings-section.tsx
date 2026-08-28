"use client";

// 「影音專區」管理子區塊，內嵌在品牌設定分頁（brand-settings-module.tsx）
// 裡——跟其他品牌欄位不一樣的地方是：這裡是「新增/刪除清單項目」，不是
// 「編輯單一欄位再整批送出」，所以不跟主表單共用同一個 useActionState，
// 是獨立的 useTransition + 本地 state 管理，新增/刪除成功後立刻反映在
// 畫面上（不用等整頁重新整理），跟 car-maintenance-tab.tsx 審核按鈕的
// 「useTransition 直接呼叫 Server Action」是同一套輕量寫法。
import { useState, useTransition } from "react";
import type { TenantVideo } from "@/lib/supabase/types";
import { addTenantVideo, deleteTenantVideo } from "../video-actions";

const MAX_VIDEOS = 12;

const INPUT_CLASS =
  "w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-[#BFA074] focus:bg-white";

export function VideoSettingsSection({ initialVideos }: { initialVideos: TenantVideo[] }) {
  const [videos, setVideos] = useState<TenantVideo[]>(initialVideos);
  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!videoUrl.trim()) return;

    const formData = new FormData();
    formData.set("title", title);
    formData.set("video_url", videoUrl);

    startTransition(async () => {
      const result = await addTenantVideo(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.video) {
        setVideos((prev) => [...prev, result.video!]);
        setTitle("");
        setVideoUrl("");
        setError(null);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteTenantVideo(id);
      if (result?.error) {
        setError(result.error);
      } else {
        setVideos((prev) => prev.filter((v) => v.id !== id));
        setError(null);
      }
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700">影音專區</label>
      <p className="mt-1 text-xs text-neutral-400">
        貼上您（或業務）在抖音／YouTube 等平台發布的影片連結，例如帶看介紹、開箱影片，會顯示在顧客看車頁，最多 {MAX_VIDEOS} 支。不是上傳影片檔案，影片本身還是放在抖音／YouTube 上。
      </p>

      {videos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {videos.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-700">
                  {v.title || "（未命名影片）"}
                </p>
                <p className="truncate text-xs text-neutral-400">{v.video_url}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(v.id)}
                disabled={pending}
                className="shrink-0 text-xs font-medium text-neutral-400 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      {videos.length < MAX_VIDEOS && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2 rounded-lg border border-dashed border-neutral-300 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="影片標題（選填），例如：店長帶你看車"
            className={INPUT_CLASS}
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="貼上抖音或 YouTube 的影片連結"
            className={INPUT_CLASS}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={pending || !videoUrl.trim()}
            className="rounded-lg bg-[#BFA074] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "處理中…" : "+ 新增影片"}
          </button>
        </form>
      )}
    </div>
  );
}
