"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { createNotification } from "@/lib/supabase/notifications";
import { formatCurrency } from "@/lib/format";
// 付款方式（匯款/現金/信用卡）目前是 accounting/page.tsx 表單上寫死的
// 三個固定選項，跟這個常數檔案的值一直保持一致，所以付款方式繼續沿用
// 這份靜態清單驗證。費用「類別」則不一樣——2026-08-31 起改成每個車行
// 自己可以在「公司營運開銷」分頁新增/刪除的清單（company_expense_categories
// 資料表），這個檔案原本沿用的 COMPANY_EXPENSE_CATEGORIES 靜態清單只剩
// 7 個寫死的類別，早就跟畫面上實際能選的類別脫勾（車行如果自己新增了
// 一個新類別，用這份靜態清單驗證一定會被這裡擋下來，回報「請選擇正確的
// 費用類別」）。2026-09-04 這次順便查帳（安安反映「一動牽一髮動全身」）
// 才發現的既有落差，改成直接查這個車行自己的 company_expense_categories
// 資料表當下有哪些類別，見下面 createCompanyExpense() 內的查詢。
import { COMPANY_EXPENSE_PAYMENT_METHODS } from "@/lib/company-expense-constants";

export interface CompanyExpenseFormState {
  error?: string;
  success?: boolean;
}

const VALID_PAYMENT_METHODS: readonly string[] = COMPANY_EXPENSE_PAYMENT_METHODS;

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/**
 * 新增一筆公司營運開銷（水電、租金、廣告等跟特定車輛無關的固定支出）。
 *
 * 2026-09-04 重新接上：這支 action 原本寫得很完整（權限檢查／通知），
 * 但 accounting/page.tsx 那個分頁自己另外重寫了一套直接呼叫
 * supabase.from("company_expenses").insert(...) 的邏輯，完全沒有呼叫到
 * 這支——等於「新增了一筆公司開銷」這則通知，鈴鐺圖示雖然一直都有接好
 * （見 notification-bell.tsx 的 TYPE_ICON），實際上從來沒有真的發生過。
 * 這次查帳順便把 accounting/page.tsx 的新增/刪除表單改成真的呼叫這支
 * action，通知才會真的跳出來。
 *
 * 2026-08-29 修正：原本這裡跟車輛「檢視成本與底價」（canViewCost）共用
 * 同一套權限把關，但 accounting/page.tsx 頁面本身「公司營運開銷」這個
 * 分頁實際是用 canManageFinance 決定要不要顯示——兩邊條件對不起來，會
 * 出現「有人被設定 canManageFinance=true、canViewCost=false，側邊欄
 * 跟分頁都能點進去操作，送出當下卻被這裡擋下來」的落差。改成跟頁面
 * 實際邏輯一致，這裡是伺服器端第二道防線，避免繞過前端直接呼叫這支
 * Server Action。
 */
export async function createCompanyExpense(
  _prevState: CompanyExpenseFormState | undefined,
  formData: FormData
): Promise<CompanyExpenseFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限新增公司開銷，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const expenseDate = String(formData.get("expense_date") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();
  // 「發給員工」——只有「人事薪資」類別才有意義，其餘類別表單上不會顯示
  // 這個欄位，送出時是空字串，存成 null。「薪資單」分頁靠這個欄位把
  // 底薪自動歸戶到對應員工，見 payroll-module.tsx。
  const employeeProfileId = optionalText(formData, "employee_profile_id");
  // 2026-09-04 新增：金流架構 Phase 2——這筆開銷選填指定是從哪個帳戶付
  // 出去的，見 FinancialAccount 的說明。選填，不填就是 NULL（沿用舊版
  // 只靠 payment_method 現金/匯款/信用卡分類的行為）。
  const accountId = optionalText(formData, "account_id");

  const supabase = await createClient();

  // 費用類別改成即時查這個車行自己的清單，不再用寫死的靜態清單驗證
  // （見上面檔案開頭的說明）——沒查到任何類別（理論上不會發生，畫面上
  // 第一次進分頁就會自動種 7 個預設類別）就直接判定「這個類別不存在」。
  const { data: categoryRows } = await supabase
    .from("company_expense_categories")
    .select("name")
    .eq("tenant_id", profile.tenant_id!);
  const validCategoryNames = new Set((categoryRows ?? []).map((c) => c.name));

  if (!expenseDate) {
    return { error: "請選擇支出日期。" };
  }
  if (!validCategoryNames.has(category)) {
    return { error: "請選擇正確的費用類別。" };
  }
  if (!title) {
    return { error: "請輸入項目名稱。" };
  }
  const amount = Number(amountRaw);
  // 2026-09-04 修正：原本是 `amount < 0`，金額填 0 也能送出——這筆開銷
  // 會直接算進「累計總支出」跟「淨利／分潤試算」的月營運費用/月人事
  // 底薪，一筆異常的 0 元或負數金額會讓後面所有連動的加總跟著算錯、
  // 卻看不出問題出在哪一筆，改成一定要大於 0。
  if (amountRaw === "" || !Number.isFinite(amount) || amount <= 0) {
    return { error: "金額請填大於 0 的數字。" };
  }
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "請選擇正確的付款方式。" };
  }
  // 有選帳戶的話，順便確認這個帳戶真的是這個車行自己的、而且還在使用中
  // ——不能只信任前端下拉選單傳回來的 id，避免竄改表單塞進別間車行的
  // 帳戶 id（RLS 雖然也會擋寫入，但這裡先給一個清楚的錯誤訊息）。
  if (accountId) {
    const { data: accountRow } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("tenant_id", profile.tenant_id!)
      .eq("is_active", true)
      .maybeSingle();
    if (!accountRow) {
      return { error: "選擇的帳戶不存在或已停用，請重新選擇。" };
    }
  }

  // select("id") 拿回剛新增那筆的 id，通知才能帶上「傳送門」連結直接指到
  // 這一筆，不是只導去會計頁面讓人自己找。
  const { data: inserted, error } = await supabase
    .from("company_expenses")
    .insert({
      tenant_id: profile.tenant_id!,
      expense_date: expenseDate,
      category,
      title,
      amount,
      payment_method: paymentMethod,
      payer_name: optionalText(formData, "payer_name"),
      invoice_number: optionalText(formData, "invoice_number"),
      employee_profile_id: employeeProfileId,
      account_id: accountId,
      note: optionalText(formData, "note"),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `新增公司開銷失敗：${error?.message ?? "未知錯誤"}` };
  }

  // 通知車行管理員有新的公司開銷紀錄——鈴鐺通知，跟新增維修請款是同一套
  // 機制。如果就是管理員自己填的，也會看到自己這筆通知，不特別過濾掉：
  // 這是同車行共用一份清單的簡單設計，見 notifications.ts 的說明。link 帶上
  // highlight=該筆 id，讓管理員點通知就直接跳到、並反白這一筆。
  await createNotification({
    tenantId: profile.tenant_id!,
    type: "company_expense_created",
    title: "新增了一筆公司開銷",
    message: `${profile.name ?? "有人"} 新增了「${title}」，金額 ${formatCurrency(amount)}`,
    actorName: profile.name,
    link: `/dashboard/accounting?highlight=${inserted.id}`,
  });

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/**
 * 刪除一筆公司開銷（例如記錯類別/金額）。跟新增一樣受 canManageFinance
 * 把關（原因同上）；RLS 的 company_expenses_tenant_scoped policy 再確保
 * 只能刪到自己車行的資料。
 *
 * 2026-09-04 新增：刪除跟新增一樣算「異動」，安安要求只要是共用可見的
 * 帳目資料（不是個人私事）有異動就要跳通知，這裡補上「刪除了一筆公司
 * 開銷」的通知——用 .delete().select().single() 一次拿回被刪掉那筆的
 * 標題/金額/類別，刪除之後那筆資料已經不在了，沒辦法再另外查一次。
 */
export async function deleteCompanyExpense(expenseId: string): Promise<CompanyExpenseFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限刪除公司開銷，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("company_expenses")
    .delete()
    .eq("id", expenseId)
    .select("title, amount, category")
    .single();

  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  if (deleted) {
    await createNotification({
      tenantId: profile.tenant_id!,
      type: "company_expense_deleted",
      title: "刪除了一筆公司開銷",
      message: `${profile.name ?? "有人"} 刪除了「${deleted.title}」，金額 ${formatCurrency(
        Number(deleted.amount)
      )}（類別：${deleted.category}）`,
      actorName: profile.name,
      link: "/dashboard/accounting",
    });
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
