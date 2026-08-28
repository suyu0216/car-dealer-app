"use client";

// 「品牌簡介」頁（/inventory 的預設首頁）——首圖橫幅、熱門車款、影音
// 專區、品牌故事、聯繫我們的業務。點擊熱門車款卡片、或「查看全部熱門
// 車」，都是導去「現有車輛」頁（帶著車輛 id／分類當查詢參數，該頁會自動
// 打開對應的詳情 Modal／套用對應的分類篩選），不在這一頁自己開 Modal——
// 車輛詳情跟篩選邏輯統一收在「現有車輛」頁，這一頁只負責「第一眼的品牌
// 印象」，符合拆頁的初衷（見 showroom-shell.tsx 開頭的說明：每個頁面只
// 專心做一件事）。
//
// 首圖橫幅可以點擊放大看——跟車輛詳情 Modal 一樣，同一時間只能有一層
// position:fixed 滿版遮罩（見 showroom-lightbox.tsx 開頭的完整說明：兩層
// 各自獨立的滿版遮罩疊在很長的頁面上會觸發 Chromium 的合成錯誤），所以
// 這裡放大檢視開著時，把「包含外殼在內」的整頁內容包進 `hidden`，跟
// showroom-cars-section.tsx 詳情 Modal 開著時的處理是同一套邏輯。
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ShowroomTenant } from "@/lib/supabase/public-tenant";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import type { ShowroomStaff } from "@/lib/supabase/public-staff";
import type { TenantVideo, TenantReview, TenantHeroPhoto } from "@/lib/supabase/types";
import { ShowroomShell } from "./showroom-shell";
import { ShowroomLightbox } from "./showroom-lightbox";
import { FeaturedCard } from "./featured-card";
import { VideoCard } from "./video-card";
import { lineAddFriendUrl } from "./showroom-shared";
import { FadeImage } from "./fade-image";
import { FadeInSection } from "./fade-in-section";

/** 首頁「熱門車款」大圖網格最多顯示幾台——超過的話用「查看全部熱門車」
 * 連結導去「現有車輛」頁看完整清單，首頁本身只放前幾台，避免首頁被拉得
 * 太長（這正是使用者要求「不要都塞在同一頁」想避免的狀況）。 */
const FEATURED_SHOWCASE_LIMIT = 6;

export function ShowroomHomeSection({
  tenant,
  tenantId,
  cars,
  videos,
  teamContacts,
  reviews,
  heroPhotos,
}: {
  tenant: ShowroomTenant;
  tenantId: string;
  cars: ShowroomCar[];
  videos: TenantVideo[];
  teamContacts: ShowroomStaff[];
  /** 精選評論小卡（車行手動從 Google 評論複製貼上的），見
   * tenants.google_rating 的說明。空陣列就不顯示「顧客怎麼說」區塊。 */
  reviews: TenantReview[];
  /** 品牌簡介首圖橫幅相簿——車行自己在「品牌設定」隨時上傳/刪除的一組
   * 照片（見 tenant-hero-photos-module.tsx），可以不只一張，前台顯示成
   * 左右翻頁的相簿。空陣列就退回下面 heroImageUrl 的舊邏輯（單張自訂圖／
   * 自動選第一台有照片的車）。 */
  heroPhotos: TenantHeroPhoto[];
}) {
  const router = useRouter();
  const [heroLightboxOpen, setHeroLightboxOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const heroScrollerRef = useRef<HTMLDivElement>(null);

  // 2026-08 第十二輪：使用者反映手機版首頁「感覺很亂」——原因之一是
  // 這裡（hero CTA 那排）的長方形「加 LINE 專人服務」按鈕，跟
  // showroom-shell.tsx 常駐的浮動點火按鈕，手機版打開時兩個「加 LINE」
  // 提示同時擠在同一屏，看起來像重複的東西疊在一起。用
  // IntersectionObserver 偵測這顆按鈕目前在不在螢幕上，在的話就通知
  // ShowroomShell 暫時把浮動按鈕淡出，捲動離開這裡之後浮動按鈕才又
  // 淡入——不是整頁拿掉浮動按鈕（那樣往下捲動、或其他四個頁面的手機版
  // 使用者就會找不到常駐的加 LINE 入口）。
  const heroLineRef = useRef<HTMLAnchorElement | null>(null);
  const [heroLineVisible, setHeroLineVisible] = useState(false);

  useEffect(() => {
    const el = heroLineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setHeroLineVisible(entry.isIntersecting), {
      threshold: 0.3,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 首圖橫幅——優先用車行在「品牌簡介首圖橫幅相簿」上傳的一組照片
  // （可以左右翻頁），沒有上傳任何一張的話才退回舊邏輯：單張自訂大圖
  // （tenant.hero_image_url）→ 自動選圖（挑「有照片」的第一輛車，cars
  // 依 created_at 由新到舊排序）→ 都沒有的話最後才退回純色底。
  const heroCar = cars.find((c) => c.image_url) ?? null;
  const heroImageUrl = tenant.hero_image_url ?? heroCar?.image_url ?? null;
  const heroPhotoUrls =
    heroPhotos.length > 0 ? heroPhotos.map((p) => p.url) : heroImageUrl ? [heroImageUrl] : [];
  const hasHeroPhotos = heroPhotoUrls.length > 0;

  function scrollHeroToIndex(index: number) {
    const el = heroScrollerRef.current;
    if (!el) return;
    const total = heroPhotoUrls.length;
    const clamped = ((index % total) + total) % total;
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setHeroIndex(clamped);
  }

  function handleHeroScroll() {
    const el = heroScrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== heroIndex) setHeroIndex(Math.max(0, Math.min(next, heroPhotoUrls.length - 1)));
  }

  // 「熱門車款」——is_featured 是後台手動開關的真實資料，車行沒有標記
  // 任何一台車熱門的話，這個區塊完全不渲染。
  const featuredCars = cars.filter((c) => c.is_featured);

  function goToCarDetail(carId: string) {
    router.push(`/inventory/cars?tenant=${tenantId}&car=${carId}`);
  }

  return (
    <>
      <div className={heroLightboxOpen ? "hidden" : undefined}>
        <ShowroomShell
          tenant={tenant}
          tenantId={tenantId}
          active="home"
          hideFloatingLineButton={heroLineVisible}
        >
          {(cars.length > 0 || hasHeroPhotos) && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#171717] sm:aspect-[21/9]">
                {hasHeroPhotos ? (
                  /* 2026-08：首圖橫幅改成可以放不只一張、左右翻頁的相簿
                     （見 tenant-hero-photos-module.tsx 後台管理介面），
                     捲動手法比照 showroom-photo-gallery.tsx 的大圖區塊：
                     原生 CSS scroll-snap（overflow-x-auto + snap-x），
                     手機滑動用瀏覽器原生觸控支援，桌機再疊左右箭頭按鈕。
                     每張照片各自的 onClick 開全螢幕放大檢視（帶正確的
                     index），只有一張的情況下跟之前完全一樣（不會多出
                     箭頭/圓點，畫面不會平白變複雜）。右下角的「放大檢視」
                     點火圓鍵維持不變，見 globals.css 開頭「點火按鈕」的
                     說明。 */
                  <div className="group relative h-full w-full">
                    <div
                      ref={heroScrollerRef}
                      onScroll={handleHeroScroll}
                      className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
                    >
                      {heroPhotoUrls.map((url, i) => (
                        <FadeImage
                          key={i}
                          src={url}
                          alt=""
                          loading={i === 0 ? "eager" : "lazy"}
                          fetchPriority={i === 0 ? "high" : undefined}
                          onClick={() => {
                            setHeroIndex(i);
                            setHeroLightboxOpen(true);
                          }}
                          className="h-full w-full shrink-0 snap-center cursor-zoom-in"
                          imgClassName="object-cover group-hover:scale-[1.02]"
                        />
                      ))}
                    </div>

                    {heroPhotoUrls.length > 1 && (
                      <>
                        {/* 2026-08 第十二輪：左右箭頭改成只在桌機顯示
                            （hidden sm:block）——手機版本來就能直接用手指
                            滑動翻頁（原生 scroll-snap），箭頭在小螢幕上
                            只是多一組跟圓點、放大檢視按鈕擠在同一張照片
                            上的視覺雜訊，使用者反映手機版「感覺很亂」，
                            這是其中一個來源，拿掉之後畫面乾淨很多；桌機
                            滑鼠不能滑動照片，箭頭還是需要保留。 */}
                        <button
                          type="button"
                          onClick={() => scrollHeroToIndex(heroIndex - 1)}
                          aria-label="上一張"
                          className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-2.5 text-lg text-white backdrop-blur transition-all duration-200 ease-out hover:border-[#BFA074]/70 hover:bg-white/20 active:scale-90 sm:left-5 sm:block"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollHeroToIndex(heroIndex + 1)}
                          aria-label="下一張"
                          className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-2.5 text-lg text-white backdrop-blur transition-all duration-200 ease-out hover:border-[#BFA074]/70 hover:bg-white/20 active:scale-90 sm:right-5 sm:block"
                        >
                          ›
                        </button>
                        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 sm:bottom-6">
                          {heroPhotoUrls.map((_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => scrollHeroToIndex(i)}
                              aria-label={`切換到第 ${i + 1} 張首圖`}
                              className={
                                "h-1.5 rounded-full transition-all duration-200 " +
                                (i === heroIndex ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/75")
                              }
                            />
                          ))}
                        </div>
                      </>
                    )}

                    <div className="btn-ignite-wrap pointer-events-none absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHeroLightboxOpen(true);
                        }}
                        aria-label="放大檢視首圖"
                        className="btn-ignite btn-ignite-sm pointer-events-auto"
                      >
                        {/* 圖示描邊原本是深棗紅 #1a0508（配紅色點火內圈），
                            內圈改成白色之後跟著換成中性深灰，在白底上才
                            看得清楚。 */}
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#4a4a4a"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <circle cx="10.5" cy="10.5" r="6.5" />
                          <path d="M15.5 15.5 21 21" />
                          <path d="M10.5 7.5v6M7.5 10.5h6" />
                        </svg>
                      </button>
                      <span className="ignite-label ignite-label-sm">放大檢視</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#171717] via-[#404040] to-[#171717]" />
                )}
              </div>
              <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
                <p className="font-showroom-display text-[11px] uppercase tracking-[0.3em] text-[#737373]">
                  {tenant.name}
                </p>
                <h2 className="font-showroom-display mt-3 max-w-2xl text-2xl leading-tight text-[#171717] sm:text-4xl">
                  找到讓您安心上路的下一台愛車
                </h2>

                {/* Google 評論信任徽章：兩個欄位都要有值才顯示，車行沒填的話
                    這行完全不渲染，不會出現「0 顆星、0 則評論」這種難看的
                    空狀態。星等用黑色實心／淺灰空心表示，不用橘紅色——跟
                    整頁黑白灰配色系統一致，橘紅色留給價格／「近期上架」
                    標籤（見 showroom-shared.tsx 開頭的說明）。 */}
                {tenant.google_rating != null && tenant.google_review_count != null && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[#404040]">
                    <GoogleStars rating={tenant.google_rating} />
                    <span className="font-medium text-[#171717]">{tenant.google_rating.toFixed(1)}</span>
                    <span className="text-[#737373]">
                      Google {tenant.google_review_count.toLocaleString()} 則評論
                    </span>
                    {tenant.google_review_url && (
                      <a
                        href={tenant.google_review_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-tex-link text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
                      >
                        查看評論 →
                        <span className="btn-tex-rule" aria-hidden />
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a
                    href={`/inventory/cars?tenant=${tenantId}`}
                    className="btn-tex-primary font-showroom-display inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#171717] bg-[#171717] px-6 py-3 text-sm tracking-wide text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] transition-all duration-300 ease-out hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)] active:scale-[0.97] active:duration-100 sm:py-2.5"
                  >
                    立即看車（{cars.length} 台在售）
                  </a>
                  {/* 2026-08 第六輪：使用者明確要求這裡「不變」——這一區
                      塊「立即看車」是長方形按鈕，如果旁邊的「加 LINE」
                      換成圓形點火按鈕（見上面首頁首圖橫幅、頁首、手機
                      浮動按鈕都已經換的那個），兩顆放在同一排會看起來
                      不一致、很突兀，所以維持原本的長方形 LINE 綠色
                      按鈕，只有頁首跟手機浮動按鈕這兩個地方改成點火
                      按鈕。 */}
                  {tenant.line_id && (
                    <a
                      ref={heroLineRef}
                      href={lineAddFriendUrl(tenant.line_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-showroom-display inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#06C755] px-6 py-3 text-sm tracking-wide text-white shadow-md shadow-[#06C755]/25 transition-all duration-300 ease-out hover:bg-[#05a847] active:scale-[0.97] active:duration-100 sm:py-2.5"
                    >
                      加 LINE 專人服務
                    </a>
                  )}
                </div>
              </div>
            </section>
          )}

          {featuredCars.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-showroom-display text-[11px] uppercase tracking-[0.3em] text-[#737373]">
                      Editor&apos;s Pick
                    </p>
                    <h2 className="font-showroom-display mt-2 text-2xl tracking-wide text-[#171717] sm:text-3xl">
                      熱門車款
                    </h2>
                  </div>
                  {featuredCars.length > FEATURED_SHOWCASE_LIMIT && (
                    <a
                      href={`/inventory/cars?tenant=${tenantId}&category=featured`}
                      className="btn-tex-link text-sm font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
                    >
                      查看全部熱門車（{featuredCars.length}）→
                      <span className="btn-tex-rule" aria-hidden />
                    </a>
                  )}
                </div>

                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {featuredCars.slice(0, FEATURED_SHOWCASE_LIMIT).map((car) => (
                    <FeaturedCard key={car.id} car={car} onClick={() => goToCarDetail(car.id)} />
                  ))}
                </div>
              </FadeInSection>
            </section>
          )}

          {videos.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <div className="flex items-center gap-4">
                  <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                    影音專區
                  </h2>
                  <div className="h-px flex-1 bg-[#E5E5E5]" />
                </div>
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {videos.map((video) => (
                    <VideoCard key={video.id} video={video} />
                  ))}
                </div>
              </FadeInSection>
            </section>
          )}

          {reviews.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-[#FAFAFA]">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <div className="flex items-center gap-4">
                  <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                    顧客怎麼說
                  </h2>
                  <div className="h-px flex-1 bg-[#E5E5E5]" />
                  {tenant.google_review_url && (
                    <a
                      href={tenant.google_review_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-tex-link shrink-0 text-sm font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
                    >
                      看全部評論 →
                      <span className="btn-tex-rule" aria-hidden />
                    </a>
                  )}
                </div>
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              </FadeInSection>
            </section>
          )}

          {tenant.brand_story && (
            <section className="border-b border-[#E5E5E5] bg-[#F5F5F5]">
              <FadeInSection className="mx-auto max-w-3xl px-6 py-12 text-center">
                <p className="font-showroom-display text-[11px] uppercase tracking-[0.3em] text-[#737373]">
                  Our Story
                </p>
                <p className="mt-4 whitespace-pre-line text-base leading-loose text-[#404040] sm:text-lg">
                  {tenant.brand_story}
                </p>
              </FadeInSection>
            </section>
          )}

          {teamContacts.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12">
                <div className="flex items-center gap-4">
                  <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                    聯繫我們的業務
                  </h2>
                  <div className="h-px flex-1 bg-[#E5E5E5]" />
                </div>
                <p className="mt-2 text-xs text-[#737373]">
                  看中喜歡的車，或想了解更多，歡迎直接聯繫以下業務。
                </p>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {teamContacts.map((staff) => (
                    <div key={staff.id} className="rounded-xl border border-[#E5E5E5] bg-[#FAFAFA] p-4">
                      <div className="flex items-center gap-3">
                        {staff.public_avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
                          <img
                            src={staff.public_avatar_url}
                            alt={staff.name ?? "業務"}
                            className="h-12 w-12 shrink-0 rounded-full border border-[#E5E5E5] object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#E5E5E5] bg-white text-sm font-bold text-[#171717]">
                            {staff.name?.slice(0, 1) ?? "業"}
                          </div>
                        )}
                        <p className="font-showroom-display text-[15px] text-[#171717]">{staff.name}</p>
                      </div>
                      {staff.public_bio && (
                        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[#404040]">
                          {staff.public_bio}
                        </p>
                      )}
                      <div className="mt-3.5 flex flex-wrap gap-2">
                        {staff.public_phone && (
                          <a
                            href={`tel:${staff.public_phone}`}
                            className="inline-flex items-center gap-1.5 rounded-sm border border-[#D4D4D4] bg-white px-3 py-1.5 text-xs text-[#404040] transition hover:border-[#BFA074] hover:text-[#171717]"
                          >
                            {staff.public_phone}
                          </a>
                        )}
                        {staff.public_line_id && (
                          <a
                            href={lineAddFriendUrl(staff.public_line_id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white transition-all duration-300 ease-out hover:bg-[#05a847] active:scale-[0.96] active:duration-100"
                          >
                            加 LINE
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FadeInSection>
            </section>
          )}
        </ShowroomShell>
      </div>

      {heroLightboxOpen && hasHeroPhotos && (
        <HeroLightboxOverlay
          photos={heroPhotoUrls}
          index={heroIndex}
          onIndexChange={setHeroIndex}
          onClose={() => setHeroLightboxOpen(false)}
        />
      )}
    </>
  );
}

/** Google 評論星等的黑白灰版星星——不用四捨五入取整數，用背景漸層裁切
 * 精確畫出小數星等（例如 4.8 顆星會畫出「4 顆全實心＋第 5 顆 80% 實心」），
 * 比四捨五入更貼近實際星等。 */
function GoogleStars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, rating));
  const percent = (clamped / 5) * 100;
  return (
    <span className="relative inline-block text-base leading-none" aria-label={`${clamped} 顆星`}>
      <span className="text-[#D4D4D4]">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap text-[#171717]"
        style={{ width: `${percent}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

/** 「顧客怎麼說」單張評論小卡——獨立成自己的元件，是為了讓每張卡各自有
 * 自己的「顯示更多」展開狀態（`expanded`），不會因為某一張卡展開，其他
 * 卡片跟著一起變。
 *
 * 「顯示更多」按鈕要不要出現，不是用字數猜的（不同字型寬度、不同螢幕
 * 寬度下同樣字數換行行數不一樣，字數門檻很容易誤判），改成真的量測：
 * 收合狀態（`line-clamp-5`）下，比較文字段落的 `scrollHeight`（內容真正
 * 需要的完整高度）跟 `clientHeight`（被 line-clamp 卡住之後、實際看得到
 * 的高度）——如果完整高度比看得到的高度大，代表這則評論真的被截斷了，
 * 才顯示按鈕；沒被截斷的短評論就不會平白多長出一顆按不出任何效果的
 * 按鈕。 */
function ReviewCard({ review }: { review: TenantReview }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
    // review.review_text 特別列進依賴：同一張卡片理論上內容不會變，但
    // 保險起見，內容真的變了要重新量測一次，不要沿用舊的判斷結果。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.review_text]);

  return (
    <div className="rounded-sm border border-[#E5E5E5] bg-white p-5">
      {review.photo_url && (
        <FadeImage
          src={review.photo_url}
          alt=""
          className="mb-4 h-40 w-full rounded-sm"
          imgClassName="object-cover"
        />
      )}
      <GoogleStars rating={review.rating} />
      <p
        ref={textRef}
        className={"mt-3 text-sm leading-relaxed text-[#404040] " + (expanded ? "" : "line-clamp-5")}
      >
        {review.review_text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-tex-link mt-2 text-xs font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
        >
          {expanded ? "收合 ↑" : "顯示更多 ↓"}
          <span className="btn-tex-rule" aria-hidden />
        </button>
      )}
      <p className="font-showroom-display mt-4 text-xs tracking-wide text-[#737373]">
        — {review.author_name}
      </p>
    </div>
  );
}

/** 首圖放大檢視的外層遮罩——獨立成自己的元件，是為了讓「淡入」進場動畫
 * 每次開啟都能重新觸發：父層是「開啟才掛載、關閉就整個卸載」的條件式
 * 渲染（見上面 `{heroLightboxOpen && heroImageUrl && (...)}`），所以這個
 * 元件每次開啟都是全新掛載，mount 時用 requestAnimationFrame 把狀態
 * 切成「已進場」的手法（跟 showroom-detail-modal.tsx／
 * showroom-cars-section.tsx 的 FilterDrawer 是同一套寫法）才能正確地
 * 每次都重新淡入一次，不會只在第一次有效。 */
function HeroLightboxOverlay({
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
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={
        "fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4 py-8 transition-opacity duration-300 ease-out " +
        (entered ? "opacity-100" : "opacity-0")
      }
      onClick={onClose}
    >
      <ShowroomLightbox photos={photos} index={index} onIndexChange={onIndexChange} onClose={onClose} />
    </div>
  );
}
