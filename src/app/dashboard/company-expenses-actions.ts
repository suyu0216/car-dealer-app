"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { createNotification } from "@/lib/supabase/notifications";
import { formatCurrency } from "@/lib/format";
// 類別/付款方式清單改從這個普通模組匯入，不能自己在這個 "use server"
// 檔案裡 export const 陣列——那樣 Client Component import 進去會壞掉
// （陣列會變成一個 Server Action 參照，不是真的陣列，呼叫 .map() 會
// 直接噴 TypeError），見 src/lib/company-expense-constants.ts 開頭的
// 說明。這個問題原本就存在（先前這兩個清單就是從這裡 export 的），只是
// 剛好還沒被踩到；跟同一批修掉的 repair_items 類別清單是同樣的原因。
import { COMPANY_EXPENSE_CATEGORIES, COMPANY_EXPENSE_PAYMENT_METHODS } from "@/lib/company-expense-constants";

export interface CompanyExpenseFormState {
  error?: string;
  success?: boolean;
}

const VALID_CATEGORIES = COMPANY_EXPENSE_CATEGORIES.map((c) => c.value);
const VALID_PAYMENT_METHODS: readonly string[] = COMPANY_EXPENSE_PAYMENT_METHODS;

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/**
 * 新增一筆公司營運開銷（水電、租金、廣告等跟特定車輛無關的固定支出）。
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

  if (!expenseDate) {
    return { error: "請選擇支出日期。" };
  }
  if (!VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
    return { error: "請選擇正確的費用類別。" };
  }
  if (!title) {
    return { error: "請輸入項目名稱。" };
  }
  const amount = Number(amountRaw);
  if (amountRaw === "" || !Number.isFinite(amount) || amount < 0) {
    return { error: "請輸入正確的金額。" };
  }
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: "請選擇正確的付款方式。" };
  }

  const supabase = await createClient();
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
 */
export async function deleteCompanyExpense(expenseId: string): Promise<CompanyExpenseFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限刪除公司開銷，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("company_expenses").delete().eq("id", expenseId);

  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
