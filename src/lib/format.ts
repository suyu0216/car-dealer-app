// 注意：不要用 Intl.NumberFormat(locale, { style: 'currency', currency: 'TWD' })
// 直接靠 locale 產生貨幣符號 —— 不同執行環境（Node / 各家瀏覽器）內建的
// ICU 資料對 zh-TW + TWD 組合顯示的符號不一致（實測 Node 22 只會印出 "$"，
// 不會自動變成別的字首）。改成自己組字串：先用 Intl 純數字格式（保留
// 千分位），再手動接上 "$" 前綴，保證全站金額格式固定是「$680,000」，
// 不會因為執行環境不同而跑掉。
export function formatCurrency(amount: number) {
  const formatted = new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
  return `$${formatted}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

// =============================================================================
// 日期／時間——一律固定用「台灣時間」（Asia/Taipei，UTC+8）
// =============================================================================
// 這幾個 timestamptz 欄位（created_at / closed_at / deleted_at / reviewed_at…）
// 在資料庫裡存的都是 UTC，這是對的，不用改。問題出在「顯示」跟「依日期
// 分組/篩選（今天/本月/今年）」這兩件事上：如果直接用
// `new Date(iso).toLocaleDateString("zh-TW")` 或 `date.getFullYear()` /
// `.getMonth()` / `.getDate()`，這些方法讀的是「程式碼實際執行環境」的
// 系統時區，不是「台灣時間」——在使用者自己的瀏覽器（Client Component）
// 通常剛好沒事，因為使用者的電腦本來就設在台灣時區；但只要程式碼是在
// 伺服器端渲染（Server Component，例如 super-admin/page.tsx），Vercel
// 的伺服器預設是 UTC，半夜 0 點到早上 8 點（台灣時間）建立的資料，用 UTC
// 判斷還是「前一天」，日期就會顯示錯、也可能被分到錯的月份/年度。
//
// 解法：畫面上顯示日期一律用 formatDate()/formatDateTime()；需要「依日期
// 分組/比對是不是今天、本月、今年」的邏輯，一律用 taiwanDateParts() 換算
// 出台灣時間的年/月/日再比較，不要直接用 Date 物件的 getFullYear() 等
// 方法。兩者都明確指定 timeZone: "Asia/Taipei"，不管程式碼實際執行在
// 哪個時區，結果保證一致。
const TAIWAN_TIME_ZONE = "Asia/Taipei";

/** 顯示用：西元年月日，台灣時間，例如 "2026/8/18"。 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-TW", { timeZone: TAIWAN_TIME_ZONE });
}

/** 顯示用：西元年月日 + 時分，台灣時間，例如 "2026/8/18 下午3:20"。 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { timeZone: TAIWAN_TIME_ZONE });
}

/** 運算用：把時間戳記換算成「台灣時間」的年/月/日數字（月份是 1-12，
 * 不是 JS Date 慣用的 0-based），給「今天/本月/今年」這類分組、篩選邏輯
 * 用，取代直接呼叫 date.getFullYear()/getMonth()/getDate()。 */
export function taiwanDateParts(iso: string | Date): { year: number; month: number; day: number } {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIWAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// ---------------------------------------------------------------------
// 2026-08-30：payroll-module.tsx／profit-share-module.tsx／
// cash-pool-module.tsx／company-expenses-module.tsx 原本各自用
// dateStr.slice(0,7)、new Date().toISOString().slice(0,7 或 10) 算「這筆
// 錢算哪個月/哪一天」，等於直接假設系統時間就是台灣時間——但
// toISOString() 一律回傳 UTC，在台灣時間 00:00~08:00（UTC 前一天
// 16:00~23:59）這段區間會被誤判成前一天/上個月，跟同一個系統裡
// analytics-module.tsx 用 taiwanDateParts() 算出來的答案不一致。
// 以下四個函式統一給全站「月份 key」「日期 key」使用，一律以
// taiwanDateParts() 為準，不直接讀系統時區。
// ---------------------------------------------------------------------

/** 運算用：把時間戳記換算成「台灣時間」的月份 key，例如 "2026-08"。 */
export function taiwanMonthKey(iso: string | Date): string {
  const { year, month } = taiwanDateParts(iso);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** 運算用：現在（台灣時間）的月份 key，例如 "2026-08"。 */
export function currentTaiwanMonthKey(): string {
  return taiwanMonthKey(new Date());
}

/** 運算用：把時間戳記換算成「台灣時間」的日期 key，例如 "2026-08-30"。 */
export function taiwanDateKey(iso: string | Date): string {
  const { year, month, day } = taiwanDateParts(iso);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 運算用：今天（台灣時間）的日期 key，例如 "2026-08-30"。 */
export function currentTaiwanDateKey(): string {
  return taiwanDateKey(new Date());
}
