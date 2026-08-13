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
