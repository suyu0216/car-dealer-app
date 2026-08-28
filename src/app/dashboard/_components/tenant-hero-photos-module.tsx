"use client";

// 「品牌簡介首圖橫幅相簿」管理：只有車行管理員（tenant_admin）看得到，見
// brand-settings-module.tsx 把這個元件放進「車行品牌設定」分頁。跟
// tenant-reviews-module.tsx 同一套「client component 自己用 supabase
// client 查、不用從 Server Component 一路傳資料下來」的作法，因為這裡的
// 資料（tenant_hero_photos 列表）只有這個小模組自己需要用到。
//
// 安安可以在這裡隨時上傳/刪除首頁最上面那張大圖，不只能放一張——前台
// （showroom-home-section.tsx）會顯示成左右翻頁的相簿；一張都沒上傳的話
// 前台會自動退回舊的單張 hero_image_url／第一台有照片的車，不會開天窗。
import { useActionState, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createTenantHeroPhoto,
  deleteTenantHeroPhoto,
  type TenantHeroPhotoFormState,
} from "../tenant-hero-photos-actions";
import { useImageCompressOnChange } from "./use-image-compress-on-change";

type HeroPhotoRow = {
  id: string;
  url: string;
  created_at: string;
};

const initialState: TenantHeroPhotoFormState = {};

export function TenantHeroPhotosModule({ tenantId }: { tenantId: string }) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<HeroPhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, formAction, pending] = useActionState(createTenantHeroPhoto, initialState);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { onChange: onPhotoChange, compressing: photoCompressing } = useImageCompressOnChange((file) =>
    setPhotoPreview(URL.createObjectURL(file))
  );

  const fetchPhotos = useCallback(async () => {
    const { data } = await supabase
      .from("tenant_hero_photos")
      .select("id, url, created_at")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (data) setPhotos(data as HeroPhotoRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // 新增成功後：重新整理列表、清空表單——依賴整個 state 物件本身（不是拆
  // 出來的 state?.success 布林值），理由見 tenant-reviews-module.tsx 同樣
  // 位置的完整說明：Server Action 每次呼叫都回傳全新物件，物件參照每次
  // 都不同，這樣才能讓 React 每一次新增成功都判斷成「有變化」，正確地
  // 每次都重新整理列表、清空表單，不會卡在「只能新增一張」的假象。
  useEffect(() => {
    if (state?.success) {
      fetchPhotos();
      setFormKey((k) => k + 1);
      setPhotoPreview(null);
    }
  }, [state, fetchPhotos]);

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這張首圖橫幅照片嗎？")) return;
    setDeletingId(id);
    setDeleteError(null);
    const result = await deleteTenantHeroPhoto(id);
    if (result?.error) {
      setDeleteError(result.error);
    } else {
      await fetchPhotos();
    }
    setDeletingId(null);
  }

  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-base font-semibold text-neutral-800">品牌簡介首圖橫幅相簿</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        顧客看車頁「品牌簡介」最上面那張大圖——可以放不只一張，前台會自動顯示成左右翻頁的相簿；一張都沒放的話會自動用車輛照片代替，不會開天窗。建議橫幅比例的照片（例如 16:9），效果最好。
      </p>

      {deleteError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
          {deleteError}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {loading ? (
          <p className="col-span-full text-sm text-neutral-400">載入中…</p>
        ) : photos.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
            還沒有上傳首圖橫幅照片，在下面新增第一張吧。
          </p>
        ) : (
          photos.map((p) => (
            <div key={p.id} className="group relative aspect-video overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明 */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white opacity-100 backdrop-blur transition-opacity duration-150 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
              >
                {deletingId === p.id ? "刪除中…" : "刪除"}
              </button>
            </div>
          ))
        )}
      </div>

      <form key={formKey} action={formAction} className="mt-4 space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-bold text-neutral-600 mb-1">新增照片</label>
          <div className="flex items-center gap-3">
            {photoPreview && (
              // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
              <img src={photoPreview} alt="" className="h-14 w-24 shrink-0 rounded-lg border border-neutral-200 object-cover" />
            )}
            <input
              type="file"
              name="photo"
              accept="image/*"
              required
              onChange={onPhotoChange}
              className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#AD9066]"
            />
          </div>
          {photoCompressing && <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>}
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">{state.error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || photoCompressing}
            className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "新增中…" : photoCompressing ? "圖片處理中…" : "新增照片"}
          </button>
        </div>
      </form>
    </section>
  );
}
