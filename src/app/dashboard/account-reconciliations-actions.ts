"use server";

// 「每日對帳報表」——每個帳戶每一天由人工實際盤點一次餘額（數現金抽屜、
// 對銀行 App 的餘額），拿去跟系統依 deals/cars/repair_items/
// company_expenses/transactions 五個來源自動算出來的「應有餘額」（見
// financial-ledger.ts 的 computeAccountBalanceAsOf）比對，抓出帳目對不
// 起來的地方——這是「金流架構方案一」的最後一塊，對齊 Hocar 的
// 「每日對帳報表」（見這次金流架構開頭的競品落差分析）。
//
// 一個帳戶一天只會有一筆盤點紀錄（account_reconciliations 的
// (account_id, date) unique constraint），同一天重複盤點是「更新」不是
// 新增第二筆，用 upsert。
import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";

export interface AccountReconciliationFormState {
  error?: string;
  success?: boolean;
}

/** 新增／更新一筆盤點紀錄。跟帳戶管理／手動記帳同一套 canManageFinance
 * 權限——盤點結果會被拿去對帳，不能讓一般業務隨手亂填。 */
export async function saveAccountReconciliation(
  _prevState: AccountReconciliationFormState | undefined,
  formData: FormData
): Promise<AccountReconciliationFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限新增每日對帳紀錄，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const accountId = String(formData.get("account_id") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const countedRaw = String(formData.get("counted_balance") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!accountId) return { error: "缺少帳戶，請重新整理頁面再試一次。" };
  if (!date) return { error: "請選擇盤點日期。" };
  const countedBalance = Number(countedRaw);
  if (countedRaw === "" || !Number.isFinite(countedBalance)) {
    return { error: "請輸入正確的盤點金額。" };
  }

  const supabase = await createClient();

  const { data: accountRow } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("tenant_id", profile.tenant_id!)
    .maybeSingle();
  if (!accountRow) {
    return { error: "帳戶不存在或不屬於這個車行，請重新整理頁面。" };
  }

  const { error } = await supabase.from("account_reconciliations").upsert(
    {
      tenant_id: profile.tenant_id!,
      account_id: accountId,
      date,
      counted_balance: countedBalance,
      counted_by: profile.id,
      note: note || null,
    },
    { onConflict: "account_id,date" }
  );

  if (error) {
    return { error: `儲存失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 刪除一筆盤點紀錄（例如數字打錯了要重新盤一次）——回到「未盤點」的
 * 狀態，不是留一筆歸零的假紀錄，這樣「未盤點／已盤點」的判讀才會準。 */
export async function deleteAccountReconciliation(id: string): Promise<AccountReconciliationFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限刪除每日對帳紀錄，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();
  // RLS 的 account_reconciliations_tenant_scoped policy 確保只能刪到
  // 自己車行的紀錄，這裡不用另外再查一次 tenant_id 是否相符。
  const { error } = await supabase.from("account_reconciliations").delete().eq("id", id);
  if (error) {
    return { error: `刪除失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
