"use client";

// 「品牌簡介」頁（/inventory 的預設首頁）——首圖橫幅、熱門車款、影音
// 專區、品牌故事、聯繫我們的業務。點擊熱門車款卡片、或「查看全部熱門
// 車」，都是導去「現有車輛」頁（帶著車輛 id／分類當查詢參數，該頁會自動
// 打開對應的詳情 Modal／套用對應的分類篩選），不在這一頁自己開 Modal——
// 車輛詳情跟篩選邏輯統一收在「現有車輛」頁，這一頁只負責「第一眼的品牌
// 印象」，符合拆頁的初衷（見 showroom-shell.tsx 開頭的說明：每個頁面只
// 專心做一件事）。
//
// 2026-08：使用者上傳了自己設計的品牌簡介頁參考檔案（brandintrofinal.html）
// 要求「前台改成這樣」——這裡把首圖橫幅改成「文案置中在上、大幅封面照片
// 在下、數據卡疊在照片角落」的雜誌感排版，「顧客怎麼說」評論卡改成頭像＋
// 姓名＋星等的樣式，並新增一段品牌故事之後的「準備好找您的下一台愛車了
// 嗎？」深色收尾 CTA。車行專屬的動態資料（車行名稱/地址/評分/評論/車輛
// 清單/影片/業務）全部照舊從 props 帶進來，不是參考檔案裡「捷恒汽車」那組
// 寫死的範例資料——只有版面/配色是照抄參考檔案，資料仍然是每個車行自己的。
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
  // hero 區塊的「加 LINE 專人服務」按鈕，跟 showroom-shell.tsx 常駐的
  // 浮動點火按鈕，手機版打開時兩個「加 LINE」提示同時擠在同一屏，看起來
  // 像重複的東西疊在一起。用 IntersectionObserver 偵測這顆按鈕目前在不在
  // 螢幕上，在的話就通知 ShowroomShell 暫時把浮動按鈕淡出，捲動離開這裡
  // 之後浮動按鈕才又淡入——不是整頁拿掉浮動按鈕（那樣往下捲動、或其他四
  // 個頁面的手機版使用者就會找不到常駐的加 LINE 入口）。
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
  const hasRating = tenant.google_rating != null && tenant.google_review_count != null;

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

  const carsHref = `/inventory/cars?tenant=${tenantId}`;

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
              <div className="mx-auto max-w-6xl px-6 pt-11 sm:pt-16">
                {/* 文案置中在照片上方——2026-08 改版排版，見檔案開頭的
                    說明：使用者上傳的參考檔案把「立即看車」「加 LINE」
                    這排行動按鈕搬到大幅封面照片上方、置中呈現，取代舊版
                    「照片在上、文字置左在下」的順序。 */}
                <div className="mx-auto max-w-2xl text-center">
                  <div className="flex items-center justify-center gap-2.5 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#6E0F1A]">
                    <span className="h-px w-5 bg-[#6E0F1A]" aria-hidden />
                    About Us · 品牌簡介
                    <span className="h-px w-5 bg-[#6E0F1A]" aria-hidden />
                  </div>
                  <h2 className="font-showroom-display mt-4 text-[28px] leading-tight text-[#171717] sm:text-[44px]">
                    找到讓您安心上路的下一台愛車
                  </h2>
                  <p className="mx-auto mt-4 max-w-xl text-sm leading-[1.85] text-[#6b6e74] sm:text-[14.5px]">
                    {tenant.name}用心對待每一位顧客，車輛來歷與車況公開透明，用真誠的服務陪您找到安心上路的下一台愛車。
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
                    <a href={carsHref} className="btn-flow px-8 pt-[15px] pb-5 text-sm">
                      立即看車（{cars.length} 台在售）
                      <FlowLine stroke="#fff" opacity={0.7} />
                    </a>
                    {/* 2026-08 第六輪的既有共識（維持不變）：這一區塊「立即
                        看車」搭「加 LINE」放在同一排，兩顆都用同一套
                        .btn-flow 導流曲線按鈕語言，只是內圈顏色不同——見
                        globals.css 的說明。 */}
                    {tenant.line_id && (
                      <a
                        ref={heroLineRef}
                        href={lineAddFriendUrl(tenant.line_id)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-flow btn-flow-ghost px-8 pt-[15px] pb-5 text-sm"
                      >
                        加 LINE 專人服務
                        <FlowLine stroke="#E2192F" />
                      </a>
                    )}
                  </div>
                </div>

                {/* 大幅封面照片——相簿翻頁邏輯完全沿用舊版（scroll-snap／
                    箭頭／圓點／點擊放大），只是外層容器改成雜誌感的圓角
                    大圖，並疊上車行徽章／評分小標籤，數據卡層疊在照片
                    左下角。 */}
                <div className="relative mt-10 mb-16 sm:mb-20 md:mb-24">
                  <div className="relative aspect-[16/11] w-full overflow-hidden rounded-3xl bg-[#171717] shadow-[0_40px_70px_-32px_rgba(20,15,15,0.32)] sm:aspect-[21/9]">
                    {hasHeroPhotos ? (
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

                        {/* 車行徽章／評分小標籤——疊在照片左上／右上角，
                            跟哪一張相簿照片正在顯示無關，是車行本身的
                            身分/信任標示。 */}
                        <span className="pointer-events-none absolute left-4 top-4 z-[1] rounded-full border border-white/20 bg-black/50 px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-white backdrop-blur">
                          {tenant.name}團隊
                        </span>
                        {hasRating && (
                          <span className="pointer-events-none absolute right-4 top-4 z-[1] flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-3.5 py-2 text-xs font-extrabold text-white backdrop-blur">
                            ★ {tenant.google_rating!.toFixed(1)} · {tenant.google_review_count!.toLocaleString()} 則評論
                          </span>
                        )}

                        {heroPhotoUrls.length > 1 && (
                          <>
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

                  {/* 數據卡——桌機／平板疊在照片左下角，手機版收成靜態
                      置中的卡片（跟參考檔案 900px 斷點的處理一致）。只顯示
                      有真實資料的欄位：現正在售一律有，Google 評分/評論
                      數車行沒填就不顯示那兩格，不會出現「0 分 0 則」的
                      空欄位。 */}
                  <div className="relative mx-auto mt-4 flex w-fit flex-wrap justify-center overflow-hidden rounded-2xl bg-white shadow-[0_24px_44px_-18px_rgba(20,15,15,0.28)] md:absolute md:left-9 md:-bottom-14 md:mt-0 md:flex-nowrap md:justify-start">
                    <StatCell num={String(cars.length)} label="台現正在售" />
                    {hasRating && (
                      <>
                        <StatCell num={tenant.google_rating!.toFixed(1)} label="Google 評分" />
                        <StatCell num={tenant.google_review_count!.toLocaleString()} label="真實評論" />
                      </>
                    )}
                    <StatCell num="100%" label="車況公開" last />
                  </div>
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

          {reviews.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-[#FAFAFA]">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <SectionHead eyebrow="Customer Stories" title="顧客怎麼說">
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
                </SectionHead>
                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              </FadeInSection>
            </section>
          )}

          {videos.length > 0 && (
            <section className="border-b border-[#E5E5E5] bg-white">
              <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
                <SectionHead eyebrow="Video" title="影音專區" />
                <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {videos.map((video, i) => (
                    <div key={video.id} className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-3.5 z-[1] font-showroom-display text-xs font-extrabold tracking-wide text-white/90">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <VideoCard video={video} />
                    </div>
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

          {/* 收尾 CTA——2026-08 新增，呼應參考檔案最下面「準備好找您的
              下一台愛車了嗎？」深色收尾區塊，用同一套 .btn-flow 按鈕，
              地址／營業時間有填才顯示那一行，車行沒填的話只留標題＋
              按鈕，不會出現空白的一行。 */}
          <section className="bg-[#FAFAFA]">
            <FadeInSection className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
              <div
                className="rounded-[20px] px-6 py-11 text-center text-white sm:px-11 sm:py-12"
                style={{ background: "linear-gradient(135deg, #1a1c21, #0a0b0d)" }}
              >
                <h3 className="font-showroom-display text-xl sm:text-2xl">準備好找您的下一台愛車了嗎？</h3>
                {(tenant.address || tenant.business_hours) && (
                  <p className="mx-auto mt-2.5 max-w-lg text-xs text-[#b6b9bf] sm:text-sm">
                    {[tenant.address, tenant.business_hours].filter(Boolean).join(" ・ ")}
                  </p>
                )}
                <div className="mt-7 flex flex-wrap items-center justify-center gap-3.5">
                  <a href={carsHref} className="btn-flow px-8 pt-[15px] pb-5 text-sm">
                    立即看車（{cars.length} 台在售）
                    <FlowLine stroke="#fff" opacity={0.7} />
                  </a>
                  {tenant.line_id && (
                    <a
                      href={lineAddFriendUrl(tenant.line_id)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-flow btn-flow-ghost-dark px-8 pt-[15px] pb-5 text-sm"
                    >
                      加 LINE 專人服務
                      <FlowLine stroke="#fff" opacity={0.7} />
                    </a>
                  )}
                </div>
              </div>
            </FadeInSection>
          </section>
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

/** .btn-flow 按鈕下緣那條 hover 時「畫出來」的曲線——原封不動沿用使用者
 * 參考檔案的 SVG path，見 globals.css 的 .btn-flow 說明。抽成小元件是
 * 因為這份檔案裡有四個地方會用到同一條線，只是描邊顏色/透明度不同。 */
function FlowLine({ stroke, opacity }: { stroke: string; opacity?: number }) {
  return (
    <svg className="flow-line" viewBox="0 0 160 16" preserveAspectRatio="none" aria-hidden>
      <path
        d="M4 8 C 45 1, 115 15, 156 5"
        stroke={stroke}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity={opacity}
      />
    </svg>
  );
}

/** 首圖數據卡的單一欄位——現正在售／Google 評分／真實評論／車況公開。 */
function StatCell({ num, label, last }: { num: string; label: string; last?: boolean }) {
  return (
    <div className={"px-5 py-4 text-center sm:px-6" + (last ? "" : " border-r border-[#eae7e2]")}>
      <div className="font-showroom-display text-xl tabular-nums text-[#6E0F1A]">{num}</div>
      <div className="mt-0.5 whitespace-nowrap text-[10.5px] text-[#6b6e74]">{label}</div>
    </div>
  );
}

/** 「顧客怎麼說」／「影音專區」共用的區塊標題——小 eyebrow 兩側各一條
 * 短線＋主標題，右側可以放一個選填的連結（children）。 */
function SectionHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-[0.22em] text-[#6E0F1A]">
          <span className="h-px w-4 bg-[#6E0F1A]" aria-hidden />
          {eyebrow}
        </div>
        <h2 className="font-showroom-display mt-2 text-lg tracking-wide text-[#171717] sm:text-xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** 「顧客怎麼說」單張評論小卡——獨立成自己的元件，是為了讓每張卡各自有
 * 自己的「顯示更多」展開狀態（`expanded`），不會因為某一張卡展開，其他
 * 卡片跟著一起變。
 *
 * 2026-08 改版：頭像＋姓名＋星等放在卡片最上面一排，取代舊版「大圖在上、
 * 文字在下」的排法——車行貼評論時上傳的照片（review.photo_url）現在當
 * 頭像用，比原本整張當大圖更接近參考檔案的樣子，也不需要另外新增欄位；
 * 沒有照片的評論用姓名第一個字當預設頭像圓徽，不會整排卡片參差不齊。
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
    <div className="flex flex-col gap-3 rounded-2xl border border-[#eae7e2] bg-white p-5">
      <div className="flex items-center gap-3">
        {review.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 見 showroom-lightbox.tsx 的說明
          <img
            src={review.photo_url}
            alt={review.author_name}
            className="h-[46px] w-[46px] shrink-0 rounded-full border-2 border-white object-cover shadow-[0_0_0_1px_#eae7e2]"
          />
        ) : (
          <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#171717] font-showroom-display text-sm text-white shadow-[0_0_0_1px_#eae7e2]">
            {review.author_name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-extrabold text-[#171717]">{review.author_name}</p>
          <GoogleStars rating={review.rating} />
          <p className="mt-0.5 text-[10.5px] text-[#6b6e74]">Google 評論</p>
        </div>
      </div>
      <p
        ref={textRef}
        className={"text-xs leading-relaxed text-[#404040] " + (expanded ? "" : "line-clamp-5")}
      >
        {review.review_text}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="btn-tex-link self-start text-xs font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
        >
          {expanded ? "收合 ↑" : "顯示更多 ↓"}
          <span className="btn-tex-rule" aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Google 評論星等的黑白灰版星星——不用四捨五入取整數，用背景漸層裁切
 * 精確畫出小數星等（例如 4.8 顆星會畫出「4 顆全實心＋第 5 顆 80% 實心」），
 * 比四捨五入更貼近實際星等。 */
function GoogleStars({ rating }: { rating: number }) {
  const clamped = Math.max(0, Math.min(5, rating));
  const percent = (clamped / 5) * 100;
  return (
    <span className="relative inline-block text-sm leading-none" aria-label={`${clamped} 顆星`}>
      <span className="text-[#D4D4D4]">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap text-[#e3a13c]"
        style={{ width: `${percent}%` }}
      >
        ★★★★★
      </span>
    </span>
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
