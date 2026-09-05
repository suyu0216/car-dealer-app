// 這個常數清單刻意獨立成一個沒有 "use server" 的普通檔案，不能直接放在
// repair-items-actions.ts 裡（雖然邏輯上更貼近那裡）——Next.js 的
// "use server" 檔案裡每一個 export 都會被編譯成 Server Action 參照，
// 只有「函式」才會被正確處理；像這種純資料的 const 陣列如果從
// "use server" 檔案 export、又被 Client Component import，瀏覽器那端
// 拿到的不是真正的陣列，而是一個 Server Action 的參照物件，呼叫
// `.map()` 會直接壞掉（實際發生過："REPAIR_ITEM_CATEGORIES.map is not
// a function"）。所以純資料一律放在這種普通模組，Server Action 檔案
// 需要時用 import 拿進去用，Client Component 也一樣直接 import 這裡，
// 兩邊看到的是同一份、真正的陣列。
import type { RepairItemCategory } from "./supabase/types";

export const REPAIR_ITEM_CATEGORIES: RepairItemCategory[] = ["維修", "美容", "其他"];
