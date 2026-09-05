// 跟 repair-item-constants.ts 同樣的原因獨立出來，不放在
// company-expenses-actions.ts 裡：那個檔案有 "use server"，裡面的
// export 全部會被當成 Server Action 參照處理，只有函式能正常運作。這種
// 純資料的 const 陣列如果從 "use server" 檔案 export、又被 Client
// Component import，瀏覽器那端拿到的不是真正的陣列，呼叫 `.map()` 之類
// 的陣列方法會直接壞掉。company-expenses-actions.ts（Server Action）需要
// 用它驗證付款方式，直接 import 這個普通模組。
//
// 2026-09-04：原本這裡還有一份 COMPANY_EXPENSE_CATEGORIES（費用類別）
// 靜態清單——但費用「類別」2026-08-31 起已經改成每個車行自己在「公司
// 營運開銷」分頁維護的動態清單（company_expense_categories 資料表），
// 這份靜態清單早就沒有任何畫面在用（原本唯一的呼叫端 company-expenses-
// module.tsx 是一個從未被任何頁面引用的死檔案，這次查帳一併刪除了），
// 繼續留著只會讓人誤以為類別還能用這裡改，所以拿掉，只留下真的還在用
// 的付款方式清單。
export const COMPANY_EXPENSE_PAYMENT_METHODS = ["匯款", "現金", "信用卡"] as const;
