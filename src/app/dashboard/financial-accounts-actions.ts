"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { createNotification } from "@/lib/supabase/notifications";
import { formatCurrency } from "@/lib/format";

/**
 * 金流帳戶（現金／各家銀行帳戶）管理——2026-09-04 新增，是「金流架構
 * 方案一」（安安選的：整套換成正式帳本，可分開追蹤兩個以上銀行帳戶）
 * 的第一步。附加式設計：只新增 financial_accounts 這張表跟這支
 * action，不動既有 deals/repair_items/company_expenses/cars/
 * transactions 任何一行邏輯——舊版 tenants.cash_opening_balance／
 * bank_opening_balance 那套兩桶式資金總覽繼續照常運作，這是另外多長
 * 出來的新帳本，之後才會逐步把收支明細接上來（見專案的分階段計畫）。
 *
 * 每個車行系統會自動建立一個 type="cash" 的預設現金帳戶（建表當下的
 * migration 已經幫既有車行都種好了；新車行的建立流程之後也要記得補
 * 上，見 create_financial_accounts migration 的說明）——現金帳戶不能
 * 被刪除或停用，道理跟 company_expense_categories 的「人事薪資」
 * is_protected 一樣：只有一個，用來代表「這間車行的現金」這個概念本身。
 * 銀行帳戶（type="bank"）則由車行自己新增、命名，可以有任意數量。
 */
export interface FinancialAccountFormState {
  error?: string;
  success?: boolean;
}

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

/** 新增一個銀行帳戶。現金帳戶不透過這支新增（每租戶只有一個、建表時
 * 已自動種好），這裡固定只建立 type="bank" 的帳戶。 */
export async function createFinancialAccount(
  _prevState: FinancialAccountFormState | undefined,
  formData: FormData
): Promise<FinancialAccountFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限新增金流帳戶，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const openingBalanceRaw = String(formData.get("opening_balance") ?? "").trim();
  const note = optionalText(formData, "note");

  if (!name) {
    return { error: "請輸入帳戶名稱（例如「國泰世華-1234」，方便自己辨識就好）。" };
  }

  const openingBalance = openingBalanceRaw === "" ? 0 : Number(openingBalanceRaw);
  if (!Number.isFinite(openingBalance)) {
    return { error: "期初餘額請填數字。" };
  }

  const supabase = await createClient();

  // 同一間車行不允許重複的帳戶名稱，避免之後在下拉選單裡分不清楚是
  // 哪一個帳戶（例如不小心按了兩次新增，或改名前後打錯）。
  const { data: existing } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("tenant_id", profile.tenant_id!)
    .eq("name", name)
    .maybeSingle();
  if (existing) {
    return { error: "已經有同名的帳戶了，請換一個名稱（或到帳戶清單找找看是不是已經建過）。" };
  }

  const { data: maxSort } = await supabase
    .from("financial_accounts")
    .select("sort_order")
    .eq("tenant_id", profile.tenant_id!)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxSort?.sort_order ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("financial_accounts")
    .insert({
      tenant_id: profile.tenant_id!,
      name,
      type: "bank",
      opening_balance: openingBalance,
      note,
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `新增帳戶失敗：${error?.message ?? "未知錯誤"}` };
  }

  await createNotification({
    tenantId: profile.tenant_id!,
    type: "financial_account_created",
    title: "新增了一個金流帳戶",
    message: `${profile.name ?? "有人"} 新增了帳戶「${name}」${
      openingBalance ? `，期初餘額 ${formatCurrency(openingBalance)}` : ""
    }`,
    actorName: profile.name,
    link: "/dashboard/accounting?module=accounts",
  });

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 修改帳戶名稱／期初餘額／備註。現金帳戶的名稱固定叫「現金」，前端
 * 不會給現金帳戶開編輯名稱的入口，但這裡還是統一開放，不特別擋——
 * 就算改了名稱，type 仍然是 "cash"，不影響任何判斷邏輯。 */
export async function updateFinancialAccount(
  _prevState: FinancialAccountFormState | undefined,
  formData: FormData
): Promise<FinancialAccountFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限修改金流帳戶，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const accountId = String(formData.get("account_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const openingBalanceRaw = String(formData.get("opening_balance") ?? "").trim();
  const note = optionalText(formData, "note");

  if (!accountId) {
    return { error: "找不到要修改的帳戶。" };
  }
  if (!name) {
    return { error: "請輸入帳戶名稱。" };
  }
  const openingBalance = openingBalanceRaw === "" ? 0 : Number(openingBalanceRaw);
  if (!Number.isFinite(openingBalance)) {
    return { error: "期初餘額請填數字。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("financial_accounts")
    // RLS 的 financial_accounts_tenant_scoped policy 確保只能改到自己
    // 車行的帳戶，這裡不用另外再查一次 tenant_id 是否相符。
    .update({ name, opening_balance: openingBalance, note })
    .eq("id", accountId);

  if (error) {
    return { error: `修改失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 停用一個帳戶（不是刪除）——停用後不會出現在「新增收支」表單的帳戶
 * 下拉選單，但歷史資料保留不動。現金帳戶不能停用，理由見檔案開頭
 * 的說明。 */
export async function deactivateFinancialAccount(accountId: string): Promise<FinancialAccountFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限停用金流帳戶，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("financial_accounts")
    .select("name, type")
    .eq("id", accountId)
    .single();

  if (!account) {
    return { error: "找不到這個帳戶。" };
  }
  if (account.type === "cash") {
    return { error: "現金帳戶不能停用。" };
  }

  const { error } = await supabase.from("financial_accounts").update({ is_active: false }).eq("id", accountId);
  if (error) {
    return { error: `停用失敗：${error.message}` };
  }

  await createNotification({
    tenantId: profile.tenant_id!,
    type: "financial_account_deactivated",
    title: "停用了一個金流帳戶",
    message: `${profile.name ?? "有人"} 停用了帳戶「${account.name}」`,
    actorName: profile.name,
    link: "/dashboard/accounting?module=accounts",
  });

  revalidatePath("/dashboard/accounting");
  return { success: true };
}

/** 重新啟用一個先前被停用的帳戶。 */
export async function reactivateFinancialAccount(accountId: string): Promise<FinancialAccountFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canManageFinance) {
    return { error: "沒有權限修改金流帳戶，請聯繫車行管理員開啟「管理財務（公司開銷/資金總覽/分潤）」權限。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("financial_accounts").update({ is_active: true }).eq("id", accountId);
  if (error) {
    return { error: `啟用失敗：${error.message}` };
  }

  revalidatePath("/dashboard/accounting");
  return { success: true };
}
