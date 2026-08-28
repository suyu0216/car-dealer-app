// 跟 repair-item-constants.ts 同樣的原因獨立出來，不放在
// company-expenses-actions.ts 裡：那個檔案有 "use server"，裡面的
// export 全部會被當成 Server Action 參照處理，只有函式能正常運作。這種
// 純資料的 const 陣列如果從 "use server" 檔案 export、又被 Client
// Component import，瀏覽器那端拿到的不是真正的陣列，呼叫 `.map()` 之類
// 的陣列方法會直接壞掉。company-expenses-module.tsx（Client Component）
// 需要用這份清單畫下拉選單，company-expenses-actions.ts（Server Action）
// 需要用它驗證表單資料——兩邊都直接 import 這個普通模組，不要再各自宣告
// 一份或從 "use server" 檔案匯出。
export const COMPANY_EXPENSE_CATEGORIES = [
  { value: "水電費", label: "💧⚡ 水電瓦斯" },
  { value: "網路通訊", label: "🌐 網路與電話費" },
  { value: "場地租金", label: "🏠 展場/停車場租金" },
  { value: "廣告行銷", label: "📣 廣告與行銷費" },
  // 員工底薪／獎金——跟「業務薪資」模組（commission-module.tsx）算的
  // 抽成是兩件不同的事：抽成是每筆成交才有的浮動獎勵，底薪/獎金是固定
  // 發放的人事成本。原本沒有專門分類，容易被塞進「行政雜項」跟水電網路
  // 這種小額支出混在一起，事後想抓「人事成本到底多少」很難抓出來。
  { value: "人事薪資", label: "👤 底薪/獎金" },
  { value: "行政雜項", label: "🛠️ 辦公用品/雜支" },
  { value: "專業服務", label: "⚖️ 會計/法律服務費" },
] as const;

export const COMPANY_EXPENSE_PAYMENT_METHODS = ["匯款", "現金", "信用卡"] as const;
