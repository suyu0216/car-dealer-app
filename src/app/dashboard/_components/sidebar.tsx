// 已棄用：這個檔案先前完全沒有被任何頁面引用（搜尋全專案找不到
// `from "./sidebar"` / `from "../_components/sidebar"` 之類的 import），
// 內容也已經因為某次編輯中斷而損毀（第 8 行物件定義中間混進了另一個
// 物件、多出一段跳脫字元，語法本身就是壞的）。現在的側邊欄由
// dashboard/layout.tsx 產生連結清單、交給 sidebar-nav.tsx 的 SidebarNav
// 元件渲染，兩者都已經正確對應到真正存在的頁面／分頁籤，不會再 404。
// 保留這個檔案只是重新導出 SidebarNav，避免萬一有地方真的在 import它時
// 直接壞掉；沒有其他用途，可以安全整個刪除。
export { SidebarNav as Sidebar } from "./sidebar-nav";
