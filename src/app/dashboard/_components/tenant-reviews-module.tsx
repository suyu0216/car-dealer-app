"use client";

// 「精選評論小卡」管理：只有車行管理員（tenant_admin）看得到，見
// brand-settings-module.tsx 把這個元件放進「車行品牌設定」分頁。跟
// cash-pool-module.tsx／payroll-module.tsx 同一套「client component 自己
// 用 supabase client 查、不用從 Server Component 一路傳資料下來」的作法，
// 因為這裡的資料（tenant_reviews 列表）只有這個小模組自己需要用到。
import { useActionState, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { createTenantReview, deleteTenantReview, type TenantReviewFormState } from "../tenant-reviews-actions";
import { useImageCompressOnChange } from "./use-image-compress-on-change";

type ReviewRow = {
  id: string;
  author_name: string;
  rating: number;
  review_text: string;
  photo_url: string | null;
  created_at: string;
};

const initialState: TenantReviewFormState = {};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} 星`}>
      {"★".repeat(rating)}
      <span className="text-neutral-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export function TenantReviewsModule({ tenantId }: { tenantId: string }) {
  const supabase = createClient();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, formAction, pending] = useActionState(createTenantReview, initialState);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const { onChange: onPhotoChange, compressing: photoCompressing } = useImageCompressOnChange((file) =>
    setPhotoPreview(URL.createObjectURL(file))
  );

  const fetchReviews = useCallback(async () => {
    const { data } = await supabase
      .from("tenant_reviews")
      .select("id, author_name, rating, review_text, photo_url, created_at")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (data) setReviews(data as ReviewRow[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // 新增成功後：重新整理列表、清空表單（用 key 強制整個表單重新掛載，
  // 比逐一清每個 input 的 value 簡單，跟其他表單模組同樣的作法）。
  //
  // 這裡是抓到的 bug：原本依賴陣列寫的是 `state?.success`（抽出來的
  // 布林值），第一次新增成功後 state.success 從 undefined 變成
  // true，這個變化 React 認得，正常觸發一次；但「新增第二則」再送出
  // 表單、Server Action 又回傳一次 `{ success: true }` 時，布林值還是
  // true、沒有「變」，React 判斷依賴沒變化，這個 effect 就不會再跑第
  // 二次——資料其實已經真的寫進資料庫了，只是畫面沒有重新整理、表單
  // 也沒清空，看起來就像「只能新增一個」，其實是「每次新增之後畫面都
  // 沒有刷新」。改成依賴整個 `state` 物件本身：Server Action 每次呼叫
  // 都會回傳一個全新的物件（就算內容一樣是 `{ success: true }`），物件
  // 參照每次都不同，這樣才能讓 React 每一次新增成功都判斷成「有變化」，
  // 正確地每次都重新整理列表、清空表單。
  useEffect(() => {
    if (state?.success) {
      fetchReviews();
      setFormKey((k) => k + 1);
      setPhotoPreview(null);
    }
  }, [state, fetchReviews]);

  async function handleDelete(id: string) {
    if (!confirm("確定要刪除這則評論小卡嗎？")) return;
    setDeletingId(id);
    setDeleteError(null);
    // 這裡原本沒有檢查 deleteTenantReview() 的回傳值——如果刪除因為任何
    // 原因失敗（例如權限問題），畫面上完全沒有任何提示，點了「刪除」
    // 之後那則評論還是留在原地、也不會顯示錯誤訊息，看起來就像「刪除
    // 按了沒反應」。改成一定要檢查回傳的 error，失敗的話顯示出來，不要
    // 讓使用者對著一個「什麼都沒發生」的畫面猜到底發生了什麼事。
    const result = await deleteTenantReview(id);
    if (result?.error) {
      setDeleteError(result.error);
    } else {
      await fetchReviews();
    }
    setDeletingId(null);
  }

  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-base font-semibold text-neutral-800">精選評論小卡</h2>
      <p className="mt-0.5 text-xs text-neutral-400">
        從 Google 評論複製幾則真實好評貼上來，會顯示在顧客看車頁的「顧客怎麼說」區塊，建議放 2-4 則即可。
      </p>

      {deleteError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">
          {deleteError}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-400">載入中…</p>
        ) : reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-400">
            還沒有精選評論，在下面新增第一則吧。
          </p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {r.photo_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
                    <img
                      src={r.photo_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-neutral-800">
                      {r.author_name} <Stars rating={r.rating} />
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">{r.review_text}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                  className="shrink-0 text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
                >
                  {deletingId === r.id ? "刪除中…" : "刪除"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form key={formKey} action={formAction} className="mt-4 space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1">評論者姓名</label>
            <input
              name="author_name"
              placeholder="例如：王先生"
              required
              className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-600 mb-1">星等</label>
            <select
              name="rating"
              defaultValue="5"
              className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="5">★★★★★</option>
              <option value="4">★★★★</option>
              <option value="3">★★★</option>
              <option value="2">★★</option>
              <option value="1">★</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-neutral-600 mb-1">評論內容</label>
          <textarea
            name="review_text"
            rows={3}
            required
            placeholder="貼上 Google 評論的原文內容…"
            className="w-full rounded-lg border border-neutral-300 p-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-600 mb-1">見證照（選填）</label>
          <div className="flex items-center gap-3">
            {photoPreview && (
              // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
              <img src={photoPreview} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-neutral-200 object-cover" />
            )}
            <input
              type="file"
              name="photo"
              accept="image/*"
              onChange={onPhotoChange}
              className="block w-full text-xs text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#BFA074] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-[#AD9066]"
            />
          </div>
          {photoCompressing && <p className="mt-1 text-xs text-neutral-400">圖片壓縮中…</p>}
          <p className="mt-1 text-[11px] text-neutral-400">
            Google 評論截圖或客人合照都可以，不放也沒關係，卡片一樣正常顯示。
          </p>
        </div>

        {state?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-inset ring-red-100">{state.error}</p>
        )}
        {state?.warning && !state?.error && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-100">
            {state.warning}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || photoCompressing}
            className="rounded-lg bg-[#BFA074] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#AD9066] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "新增中…" : photoCompressing ? "圖片處理中…" : "新增評論小卡"}
          </button>
        </div>
      </form>
    </section>
  );
}
