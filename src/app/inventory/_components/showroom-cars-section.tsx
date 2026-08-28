"use client";

// 「現有車輛」頁的完整互動區塊——篩選面板＋車輛清單＋詳情 Modal，統一在
// 這裡管理「哪一輛車的詳情 Modal 開著」，也統一管理篩選狀態。
//
// 篩選項目本身（品牌/顏色/價格/車型/里程數/年份）：2026-08 改版，使用者
// 直接點名參考的競品站台（弘達國際汽車）把這六項一項一項清楚列出來，一次
// 看到全部選項，不用猜有哪些條件——這六項本身經過使用者確認是對的（她
// 原本的疑慮其實是「整個網站被塞成一頁」，不是這六項要不要存在，見
// showroom-shell.tsx 開頭的說明）。品牌／顏色支援複選。
//
// 呈現方式：先是「點按鈕展開/收合、內容留在原地」，使用者後來又進一步
// 反映想要跟弘達一樣「從旁邊跳選出來」——弘達的篩選面板本身是常駐在左側
// 的深色側欄，不是彈出式的，但這裡選擇做成「點『篩選條件』從左側滑出的
// 抽屜面板＋半透明背景遮罩」，是同一種「篩選內容在畫面側邊、跟車輛清單
// 分開」的空間概念，同時解決「畫面一打開很滿」的問題（見 FilterDrawer）。
//
// 詳情 Modal／篩選抽屜開著時，都把「包含外殼在內」的整頁內容包在
// `hidden`（display:none）底下——不只是效能考量，是實測修掉一個真的會
// 發生的畫面錯誤：手機直式單欄排列，車輛一多整頁高度可以衝到兩三萬 px，
// 這種情況下 Chromium 合成一個 position:fixed 滿版遮罩（詳情 Modal／
// 篩選抽屜的背景遮罩都是 inset-0 滿版）時，只要底下這些內容還留在版面
// 佈局（layout）裡——就算完全沒有被捲動到、視覺上被遮罩整個蓋住——遮罩
// 仍然會出現「沒蓋滿，底下內容從破洞透出來」的合成錯誤；用
// `overflow:hidden` 鎖 body 捲動測過沒用，只有把底下內容整個從 layout
// 移除（display:none）才擋得住。用 `hidden` 而不是條件式不渲染，是為了
// 保留 DOM／捲動位置，關掉之後列表捲動位置不會跳掉。
import { useEffect, useState } from "react";
import { VALID_BODY_TYPES } from "@/lib/supabase/types";
import { formatCurrency } from "@/lib/format";
import type { ShowroomTenant } from "@/lib/supabase/public-tenant";
import type { ShowroomCar } from "@/lib/supabase/public-cars";
import { ShowroomGrid } from "./showroom-grid";
import { ShowroomDetailModal } from "./showroom-detail-modal";
import { ShowroomShell } from "./showroom-shell";
import { CategoryPill, lineAddFriendUrl } from "./showroom-shared";
import { FadeImage } from "./fade-image";

/** 篩選面板「價格」「里程數」的區間選項——跟 matchesPriceBucket() /
 * matchesMileageBucket() 的判斷條件一一對應，改這裡的同時要記得改那兩個
 * 函式（反之亦然）。 */
const PRICE_BUCKETS: { value: string; label: string }[] = [
  { value: "under30", label: "30 萬以下" },
  { value: "30to60", label: "30～60 萬" },
  { value: "60to100", label: "60～100 萬" },
  { value: "over100", label: "100 萬以上" },
];

const MILEAGE_BUCKETS: { value: string; label: string }[] = [
  { value: "under30k", label: "3 萬公里以下" },
  { value: "30to60k", label: "3～6 萬公里" },
  { value: "60to100k", label: "6～10 萬公里" },
  { value: "100to150k", label: "10～15 萬公里" },
  { value: "over150k", label: "15 萬公里以上" },
];

/** 篩選面板「顏色」用——車行填的 color 是自由文字（例如「珍珠白」「消光
 * 黑」），這裡用關鍵字比對抓出對應色塊給顧客快速辨識，比對不到就不顯示
 * 色塊（只顯示文字），不會硬套一個不準確的顏色。多字關鍵字（例如「香檳」）
 * 排在單字關鍵字前面比對，避免被單字關鍵字先攔截到不夠貼切的顏色。 */
const COLOR_SWATCH_KEYWORDS: [string, string][] = [
  ["香檳", "#C9AE7C"],
  ["卡其", "#A69064"],
  ["消光灰", "#6B6B6B"],
  ["鐵灰", "#54544f"],
  ["深藍", "#1B3A6B"],
  ["深灰", "#4A4A4A"],
  ["白", "#F5F5F5"],
  ["黑", "#171717"],
  ["紅", "#C0392B"],
  ["藍", "#2E5AAC"],
  ["銀", "#C7C7C7"],
  ["灰", "#8C8C8C"],
  ["綠", "#2F6B4F"],
  ["黃", "#E0C240"],
  ["棕", "#7A5230"],
  ["咖啡", "#7A5230"],
  ["橘", "#E0742D"],
  ["橙", "#E0742D"],
  ["紫", "#6E4C82"],
  ["粉", "#D98CA0"],
  ["米", "#D8CBB0"],
];

function colorSwatchFor(colorName: string): string | null {
  for (const [keyword, hex] of COLOR_SWATCH_KEYWORDS) {
    if (colorName.includes(keyword)) return hex;
  }
  return null;
}

export function ShowroomCarsSection({
  tenant,
  tenantId,
  cars,
  photosByCarId,
  initialCarId,
  initialCategory,
}: {
  tenant: ShowroomTenant;
  tenantId: string;
  cars: ShowroomCar[];
  photosByCarId: Record<string, string[]>;
  /** 從品牌簡介頁「熱門車款」點進來的深連結——直接帶著車輛 id，一進頁面
   * 就打開對應的詳情 Modal，不用使用者自己再找一次。選填。 */
  initialCarId?: string | null;
  /** 從品牌簡介頁「查看全部熱門車」或車型分類點進來的深連結——一進頁面
   * 就套用對應的分類篩選。選填，"featured" 代表熱門推薦。 */
  initialCategory?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialCarId ?? null);
  const selectedCar = cars.find((c) => c.id === selectedId) ?? null;

  function photosFor(car: ShowroomCar): string[] {
    const gallery = photosByCarId[car.id];
    if (gallery && gallery.length > 0) return gallery;
    return car.image_url ? [car.image_url] : [];
  }

  const [search, setSearch] = useState("");
  // 2026-08：品牌／顏色改成可複選（陣列），呼應使用者參考的競品站台
  // 「品牌(可複選)」「顏色(可複選)」設計——一次可以選好幾個廠牌/顏色一起
  // 看，比單選更符合看車比較的實際需求。
  const [brandFilters, setBrandFilters] = useState<string[]>([]);
  const [colorFilters, setColorFilters] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState("");
  const [priceFilter, setPriceFilter] = useState("");
  const [mileageFilter, setMileageFilter] = useState("");
  const [categoryTab, setCategoryTab] = useState<string>(initialCategory ?? "");
  // 詳細篩選（品牌/顏色/價格/車型/里程數/年份）收在點「篩選條件」才從
  // 左側滑出的抽屜面板裡，見檔案開頭的說明；預設關閉，一進頁面先看到
  // 乾淨的搜尋列＋車輛清單。
  const [filterOpen, setFilterOpen] = useState(false);

  function toggleBrand(brand: string) {
    setBrandFilters((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  }
  function toggleColor(color: string) {
    setColorFilters((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  }

  const brandOptions = Array.from(
    new Set(cars.map((c) => c.brand).filter((b): b is string => !!b))
  ).sort((a, b) => a.localeCompare(b));
  const yearOptions = Array.from(
    new Set(cars.map((c) => c.year).filter((y): y is number => !!y))
  ).sort((a, b) => b - a);
  const colorOptions = Array.from(
    new Set(cars.map((c) => c.color).filter((c): c is string => !!c))
  ).sort((a, b) => a.localeCompare(b));
  const bodyTypeOptions = VALID_BODY_TYPES.filter((type) => cars.some((c) => c.body_type === type));
  const hasFeaturedCars = cars.some((c) => c.is_featured);

  function matchesPriceBucket(price: number | null, bucket: string): boolean {
    if (!bucket) return true;
    if (price == null) return false;
    if (bucket === "under30") return price < 300000;
    if (bucket === "30to60") return price >= 300000 && price < 600000;
    if (bucket === "60to100") return price >= 600000 && price < 1000000;
    if (bucket === "over100") return price >= 1000000;
    return true;
  }

  function matchesMileageBucket(mileage: number | null, bucket: string): boolean {
    if (!bucket) return true;
    if (mileage == null) return false;
    if (bucket === "under30k") return mileage < 30000;
    if (bucket === "30to60k") return mileage >= 30000 && mileage < 60000;
    if (bucket === "60to100k") return mileage >= 60000 && mileage < 100000;
    if (bucket === "100to150k") return mileage >= 100000 && mileage < 150000;
    if (bucket === "over150k") return mileage >= 150000;
    return true;
  }

  const filteredCars = cars.filter((car) => {
    const keyword = search.trim().toLowerCase();
    if (keyword && !`${car.brand ?? ""} ${car.model_name}`.toLowerCase().includes(keyword)) {
      return false;
    }
    if (brandFilters.length > 0 && !brandFilters.includes(car.brand ?? "")) return false;
    if (colorFilters.length > 0 && !colorFilters.includes(car.color ?? "")) return false;
    if (yearFilter && String(car.year) !== yearFilter) return false;
    if (!matchesPriceBucket(car.selling_price, priceFilter)) return false;
    if (!matchesMileageBucket(car.mileage, mileageFilter)) return false;
    if (categoryTab === "featured" && !car.is_featured) return false;
    if (categoryTab && categoryTab !== "featured" && car.body_type !== categoryTab) return false;
    return true;
  });

  const hasActiveFilter = !!(
    search.trim() ||
    brandFilters.length > 0 ||
    colorFilters.length > 0 ||
    yearFilter ||
    priceFilter ||
    mileageFilter ||
    categoryTab
  );

  function clearFilters() {
    setSearch("");
    setBrandFilters([]);
    setColorFilters([]);
    setYearFilter("");
    setPriceFilter("");
    setMileageFilter("");
    setCategoryTab("");
  }

  // 「篩選條件」按鈕上的數字徽章——只算品牌/顏色/價格/里程數/年份這五項
  // 詳細篩選，車型分類（categoryTab）已經有自己的一排常駐快速分類（見
  // 上面的分類 Pill 列），不重複計入，避免使用者覺得「怎麼按鈕上的數字
  // 跟我點的分類 Pill 對不起來」。
  const detailFilterCount = [
    brandFilters.length > 0,
    colorFilters.length > 0,
    !!yearFilter,
    !!priceFilter,
    !!mileageFilter,
  ].filter(Boolean).length;

  // 2026-08：使用者上傳「雜誌選書」排版的參考檔案（inventoryv4magazine.html）
  // 要求「前台改成這樣」——參考檔案最上面有一格「本月焦點車款」大幅全版
  // 首圖。這裡沒有後台額外欄位可以指定「哪台是本月焦點」，用跟首頁「熱門
  // 車款」同一份真實資料：優先挑第一台 is_featured（熱門推薦）的車，車行
  // 沒標記任何一台的話退回第一台在售車輛（依 cars 傳進來的順序，通常是
  // 最新上架）——一律是車行自己資料裡真的存在的車，不是憑空塞一台假的。
  // 只在「沒有任何篩選、沒有從其他頁面帶著特定車輛/分類的深連結」這個
  // 最乾淨的預設瀏覽狀態才顯示，篩選之後這格佔的版面對「快速看篩選結果」
  // 反而是干擾，所以篩選當下就不顯示。
  const heroCar = !hasActiveFilter && !initialCarId ? cars.find((c) => c.is_featured) ?? cars[0] ?? null : null;

  return (
    <>
      <div className={selectedCar || filterOpen ? "hidden" : undefined}>
        <ShowroomShell tenant={tenant} tenantId={tenantId} active="cars">
          <main className="mx-auto max-w-6xl px-6 py-10">
            {heroCar && <FeaturedCarHero car={heroCar} onSelect={() => setSelectedId(heroCar.id)} />}

            <div className="flex items-center gap-4">
              <h2 className="font-showroom-display shrink-0 text-lg tracking-wide text-[#171717]">
                {heroCar ? "更多車輛精選" : "現正展示車輛"}
              </h2>
              <div className="h-px flex-1 bg-[#E5E5E5]" />
              <span className="shrink-0 rounded-full bg-[#F5F5F5] px-3 py-1 text-xs font-semibold text-[#171717]">
                {hasActiveFilter ? `符合條件 ${filteredCars.length} 台` : `${cars.length} 台在售`}
              </span>
            </div>

            {(hasFeaturedCars || bodyTypeOptions.length > 0) && (
              <div className="relative mt-4">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <CategoryPill active={categoryTab === ""} onClick={() => setCategoryTab("")}>
                    全部車輛
                  </CategoryPill>
                  {hasFeaturedCars && (
                    <CategoryPill active={categoryTab === "featured"} onClick={() => setCategoryTab("featured")}>
                      熱門推薦
                    </CategoryPill>
                  )}
                  {bodyTypeOptions.map((type) => (
                    <CategoryPill key={type} active={categoryTab === type} onClick={() => setCategoryTab(type)}>
                      {type}
                    </CategoryPill>
                  ))}
                </div>
              </div>
            )}

            {cars.length > 1 && (
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋車型，例如：Camry"
                  className="w-full min-w-0 flex-1 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2.5 text-sm text-[#171717] outline-none placeholder:text-[#A3A3A3] focus:border-[#171717]"
                />
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  className="btn-tex-primary shrink-0 inline-flex items-center gap-1.5 rounded-sm border border-[#171717] bg-[#171717] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] transition-all duration-300 ease-out hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)] active:scale-[0.97] active:duration-100"
                >
                  <FilterIcon />
                  篩選條件
                  {detailFilterCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold text-[#171717]">
                      {detailFilterCount}
                    </span>
                  )}
                </button>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="btn-tex-secondary shrink-0 rounded-sm border border-[#D9C9A8] bg-white px-3 py-2.5 text-xs font-medium text-[#737373] shadow-[inset_0_-2px_0_0_rgba(191,160,116,0.35)] transition-all duration-200 ease-out hover:border-[#BFA074] hover:text-[#171717] hover:shadow-[inset_0_-2px_0_0_#BFA074] active:scale-95"
                  >
                    清除篩選
                    <span className="btn-tex-underline" aria-hidden />
                  </button>
                )}
              </div>
            )}

            {cars.length === 0 ? (
              <p className="mt-8 rounded-2xl border border-dashed border-[#D4D4D4] bg-white px-4 py-12 text-center text-sm text-[#737373]">
                目前沒有公開展示的車輛，歡迎之後再來看看。
              </p>
            ) : filteredCars.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-[#D4D4D4] bg-white px-4 py-12 text-center text-sm text-[#737373]">
                <p>沒有符合篩選條件的車輛。</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn-tex-link mt-2 font-medium text-[#171717] transition-colors duration-200 hover:text-[#BFA074]"
                >
                  清除篩選看全部車輛
                  <span className="btn-tex-rule" aria-hidden />
                </button>
              </div>
            ) : (
              <ShowroomGrid
                cars={filteredCars}
                photosByCarId={photosByCarId}
                onSelect={(car) => setSelectedId(car.id)}
              />
            )}
          </main>
        </ShowroomShell>
      </div>

      {/* 篩選抽屜——點「篩選條件」從左側滑出，跟弘達「篩選內容放在畫面
          側邊、跟車輛清單分開」的空間概念一致。品牌/顏色/價格/車型/
          里程數/年份六排本身的內容沒有改變，只是換了個容器呈現。 */}
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        resultCount={filteredCars.length}
        hasActiveFilter={hasActiveFilter}
        onClearFilters={clearFilters}
      >
        {brandOptions.length > 1 && (
          <FilterRow label="品牌">
            {brandOptions.map((brand) => (
              <CategoryPill key={brand} active={brandFilters.includes(brand)} onClick={() => toggleBrand(brand)}>
                {brand}
              </CategoryPill>
            ))}
          </FilterRow>
        )}
        {colorOptions.length > 1 && (
          <FilterRow label="顏色">
            {colorOptions.map((color) => {
              const swatch = colorSwatchFor(color);
              return (
                <CategoryPill key={color} active={colorFilters.includes(color)} onClick={() => toggleColor(color)}>
                  <span className="inline-flex items-center gap-1.5">
                    {swatch && (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ background: swatch }}
                      />
                    )}
                    {color}
                  </span>
                </CategoryPill>
              );
            })}
          </FilterRow>
        )}
        <FilterRow label="價格">
          {PRICE_BUCKETS.map((bucket) => (
            <CategoryPill
              key={bucket.value}
              active={priceFilter === bucket.value}
              onClick={() => setPriceFilter(priceFilter === bucket.value ? "" : bucket.value)}
            >
              {bucket.label}
            </CategoryPill>
          ))}
        </FilterRow>
        {bodyTypeOptions.length > 0 && (
          <FilterRow label="車型">
            {bodyTypeOptions.map((type) => (
              <CategoryPill
                key={type}
                active={categoryTab === type}
                onClick={() => setCategoryTab(categoryTab === type ? "" : type)}
              >
                {type}
              </CategoryPill>
            ))}
          </FilterRow>
        )}
        <FilterRow label="里程數">
          {MILEAGE_BUCKETS.map((bucket) => (
            <CategoryPill
              key={bucket.value}
              active={mileageFilter === bucket.value}
              onClick={() => setMileageFilter(mileageFilter === bucket.value ? "" : bucket.value)}
            >
              {bucket.label}
            </CategoryPill>
          ))}
        </FilterRow>
        {yearOptions.length > 1 && (
          <FilterRow label="年份">
            {yearOptions.map((year) => (
              <CategoryPill
                key={year}
                active={yearFilter === String(year)}
                onClick={() => setYearFilter(yearFilter === String(year) ? "" : String(year))}
              >
                {year} 年
              </CategoryPill>
            ))}
          </FilterRow>
        )}
      </FilterDrawer>

      {selectedCar && (
        <ShowroomDetailModal
          car={selectedCar}
          photos={photosFor(selectedCar)}
          lineUrl={tenant.line_id ? lineAddFriendUrl(tenant.line_id) : null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

/** 從左側滑出的篩選抽屜——半透明背景遮罩＋白色面板，點遮罩或叉叉都能
 * 關閉。用「先掛載、下一個畫面更新才把 translate 從螢幕外移回螢幕內」
 * 的寫法做出滑入動畫（`entered` 這個 state），這是不依賴任何動畫套件
 * 的標準 React 寫法；關閉是直接卸載（沒有滑出動畫），兩者不對稱是刻意
 * 的取捨——多做卸載前的滑出動畫需要額外的「延遲卸載」邏輯，複雜度不
 * 成比例，滑入的「跳出來」效果才是使用者在意的部分。 */
function FilterDrawer({
  open,
  onClose,
  resultCount,
  hasActiveFilter,
  onClearFilters,
  children,
}: {
  open: boolean;
  onClose: () => void;
  resultCount: number;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
  children: React.ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className={
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out " +
          (entered ? "opacity-100" : "opacity-0")
        }
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="篩選條件"
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out " +
          (entered ? "translate-x-0" : "-translate-x-full")
        }
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E5E5E5] px-5 py-4">
          <h3 className="font-showroom-display text-base tracking-wide text-[#171717]">篩選條件</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉篩選"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#737373] transition-all duration-200 ease-out hover:bg-[#F5F5F5] hover:text-[#171717] hover:shadow-[0_0_0_3px_rgba(191,160,116,0.25)] active:scale-90 active:shadow-[0_0_0_4px_rgba(191,160,116,0.45)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex shrink-0 items-center gap-3 border-t border-[#E5E5E5] px-5 py-4">
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onClearFilters}
              className="btn-tex-link shrink-0 text-xs font-medium text-[#737373] transition-colors duration-200 hover:text-[#BFA074]"
            >
              清除篩選
              <span className="btn-tex-rule" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-tex-primary ml-auto flex-1 rounded-sm border border-[#171717] bg-[#171717] px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgba(191,160,116,0.55)] transition-all duration-300 ease-out hover:bg-white hover:text-[#171717] hover:shadow-[0_0_0_1.5px_#BFA074,0_10px_28px_-10px_rgba(191,160,116,0.55)] active:scale-[0.97] active:duration-100"
          >
            查看 {resultCount} 筆結果
          </button>
        </div>
      </div>
    </>
  );
}

/** 「本月焦點車款」全版首圖——2026-08 新增，見上面 heroCar 的說明。
 * 樣式沿用使用者參考檔案的 .hero（大圖滿版＋底部漸層蓋文字），CTA 按鈕
 * 用跟品牌簡介頁同一套 .btn-flow 導流曲線按鈕（曜石灰底版本），點下去
 * 直接開這台車的詳情 Modal，不用另外導頁。 */
function FeaturedCarHero({ car, onSelect }: { car: ShowroomCar; onSelect: () => void }) {
  return (
    <div className="relative mb-10 flex min-h-[300px] items-end overflow-hidden rounded-[20px] bg-[#171717] sm:min-h-[420px]">
      {car.image_url ? (
        <FadeImage
          src={car.image_url}
          alt={`${car.brand ?? ""} ${car.model_name}`}
          className="absolute inset-0 h-full w-full"
          imgClassName="object-cover"
          loading="eager"
          fetchPriority="high"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#171717] via-[#404040] to-[#171717]" />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(0deg, rgba(10,11,13,0.92) 0%, rgba(10,11,13,0.35) 55%, rgba(10,11,13,0.05) 100%)",
        }}
      />
      <div className="relative z-[1] max-w-xl px-6 py-9 text-white sm:px-11 sm:py-10">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#ff8f8f]">
          <span className="h-px w-5 bg-[#ff8f8f]" aria-hidden />
          {car.is_featured ? "本月焦點車款" : "現正展示"}
        </div>
        <h2 className="font-showroom-display mt-2.5 text-[28px] leading-tight sm:text-[42px]">
          {car.brand ? `${car.brand} ${car.model_name}` : car.model_name}
        </h2>
        <p className="mt-2 text-[13.5px] text-[#d8d9db]">
          {[car.year ? `${car.year} 年式` : null, car.color, "現車展示中"].filter(Boolean).join(" ・ ")}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-6">
          <p className="font-showroom-display text-2xl tabular-nums">
            {car.selling_price != null ? formatCurrency(car.selling_price) : "洽詢底價"}
          </p>
          <button type="button" onClick={onSelect} className="btn-flow btn-flow-dark px-7 pt-3.5 pb-[19px] text-sm">
            預約賞車
            <FlowLine stroke="#e2192f" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** 見 showroom-home-section.tsx 的同名說明——.btn-flow 按鈕下緣那條
 * hover 時「畫出來」的曲線，原封不動沿用參考檔案的 SVG path。 */
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

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

/** 抽屜裡的單一列（例如「品牌」那一整排選項）——抽屜本身寬度固定偏窄
 * （見 FilterDrawer 的 `max-w-sm`），標籤一律排在選項上方，不像原本
 * 在寬版卡片裡那樣「桌機版標籤在左、選項在右」——寬螢幕下抽屜的可視
 * 寬度並不會變寬，繼續用左右並排反而會把選項擠成一直行，不好點選。 */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold tracking-wide text-[#171717]">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
