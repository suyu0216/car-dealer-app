import { redirect } from "next/navigation";

// 這個獨立頁面先前查詢的 `reimbursements` 資料表在資料庫裡並不存在——
// 送出請款單或讀取列表都會直接失敗。真正可以運作、而且已經很完整的
// 「整備維修與會計請款」功能其實是 /dashboard 主頁裡的分頁籤（見
// src/app/dashboard/_components/dashboard-shell.tsx 的 MaintenanceModule
// + repair_items 資料表：送出待審核、管理員核准/退回、憑證上傳都有）。
// 這裡直接導過去，避免使用者或舊書籤停留在一個打不開的頁面上。
export default function ReimbursementsRedirectPage() {
  redirect("/dashboard?module=maintenance");
}
