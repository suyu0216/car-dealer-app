"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions } from "@/lib/permissions";
import { syncCarStatusFromDeal } from "./cars-actions";
import type { CashPoolMethod, DealStatus } from "@/lib/supabase/types";

export interface DealFormState {
  error?: string;
  success?: boolean;
}

const VALID_STATUSES: DealStatus[] = ["draft", "signed", "delivered"];
const VALID_PAYMENT_METHODS: CashPoolMethod[] = ["cash", "bank"];

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function optionalMoney(formData: FormData, name: string, label: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${label}格式不正確。`);
  }
  return num;
}

// canManageFinance 為 false 時，回傳物件裡完全不帶 commission_amount 這個
// key（不是帶 null）——這樣 supabase-js 送出的 JSON payload 會直接省略
// 這個欄位，UPDATE 時不會覆蓋掉會計/老闆原本填好的抽成金額，INSERT 時
// 則會用資料庫預設值（null）。2026-08-30：合約是業務填寫送出、交給會計
// 審核填稅金/抽成才結案——這裡從原本的 canManageStaff（只有老闆）改成
// canManageFinance（老闆恆為 true，會計預設也是 true），業務不開放自己
// 填自己的抽成，避免球員兼裁判。
function parseDealForm(formData: FormData, canManageFinance: boolean) {
  const carId = String(formData.get("car_id") ?? "");
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const finalPriceRaw = String(formData.get("final_price") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!carId) throw new Error("請選擇車輛。");
  if (!customerName) throw new Error("請輸入客戶姓名，或從既有客戶選擇。");
  const finalPrice = Number(finalPriceRaw);
  if (finalPriceRaw === "" || !Number.isFinite(finalPrice) || finalPrice < 0) {
    throw new Error("請輸入正確的成交價。");
  }
  if (!VALID_STATUSES.includes(status as DealStatus)) {
    throw new Error("合約狀態不正確。");
  }

  const customerId = optionalText(formData, "customer_id");

  // 收款方式：給「資金總覽」水池用，分類這筆訂金＋尾款要算進現金池還是
  // 銀行池。草約階段可能還沒收到錢，允許不選（undefined 值 → null）。
  const paymentMethodRaw = optionalText(formData, "payment_method");
  if (paymentMethodRaw && !VALID_PAYMENT_METHODS.includes(paymentMethodRaw as CashPoolMethod)) {
    throw new Error("收款方式不正確。");
  }

  return {
    car_id: carId,
    customer_id: customerId,
    customer_name: customerName,
    customer_phone: optionalText(formData, "customer_phone"),
    final_price: finalPrice,
    deposit_amount: optionalMoney(formData, "deposit_amount", "訂金"),
    balance_amount: optionalMoney(formData, "balance_amount", "尾款"),
    payment_method: (paymentMethodRaw as CashPoolMethod | null) ?? null,
    loan_status: optionalText(formData, "loan_status"),
    salesperson_id: optionalText(formData, "salesperson_id"),
    ...(canManageFinance
      ? { commission_amount: optionalMoney(formData, "commission_amount", "預估抽成") }
      : {}),
    status: status as DealStatus,
    note: optionalText(formData, "note"),
  };
}

export async function createDeal(
  _prevState: DealFormState | undefined,
  formData: FormData
): Promise<DealFormState> {
  const { profile } = await requireTenantUser();
  const permissions = getEffectivePermissions(profile);

  let values;
  try {
    values = parseDealForm(formData, permissions.canManageFinance);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  // 2026-08-30：「已交車」是會計/老闆審核完稅金/抽成之後才結案的最後一
  // 步，業務不能自己直接把新合約建成已交車——前端的合約狀態下拉選單
  // 已經把這個選項藏起來（見 deal-form-modal.tsx 的 availableStatusOptions），
  // 這裡是伺服器端不可被繞過的第二道防線。
  if (values.status === "delivered") {
    if (!permissions.canManageFinance) {
      return { error: "只有會計或老闆能把合約標記為「已交車」，請先送交會計確認稅金與業務抽成。" };
    }
    // 2026-08-30 修正：前端 deal-form-modal.tsx 原本的送出前檢查看的是
    // 試算小工具的暫存欄位，不是真正會存進資料庫的 commission_amount，
    // 有繞過空間（填了試算欄位卻忘記按「帶入」）。這裡補上伺服器端的
    // 真正防線：一律直接檢查 values.commission_amount 這個要寫進資料庫
    // 的值本身，不可為 null，才能保證「已交車」的合約一定有抽成數字
    // 可用，前端沒擋到的情況這裡一定會擋下來。
    if (values.commission_amount == null) {
      return { error: "合約標記為「已交車」之前，請先填寫業務抽成金額（沒有的話可以填 0）。" };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("deals")
    .insert({ ...values, tenant_id: profile.tenant_id! });

  if (error) {
    return { error: `新增合約失敗：${error.message}` };
  }

  // 合約一新增就同步車輛狀態（簽約→保留／交車→售出＋帶入成交價），見
  // cars-actions.ts 的 syncCarStatusFromDeal() 說明。
  await syncCarStatusFromDeal(values.car_id, values.status, values.final_price);

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateDeal(
  _prevState: DealFormState | undefined,
  formData: FormData
): Promise<DealFormState> {
  const { profile } = await requireTenantUser();
  const permissions = getEffectivePermissions(profile);

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "缺少合約 ID，無法更新。" };
  }

  let values;
  try {
    values = parseDealForm(formData, permissions.canManageFinance);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();

  // 2026-08-30 新增：合約一旦建立，車輛就不可以被事後改成別台——前端
  // deal-form-modal.tsx 編輯模式已經把車輛欄位改成唯讀顯示（不給互動式
  // 下拉選單），這裡是伺服器端不可被繞過的第二道防線：不管前端傳上來的
  // car_id 是什麼，一律強制比對資料庫裡這張合約「原本」的 car_id，不一樣
  // 就直接擋下來，不會被更新。同一次查詢順便拿 status，下面「已交車」
  // 檢查繼續共用，不用查兩次。
  const { data: existingDeal } = await supabase.from("deals").select("status, car_id").eq("id", id).maybeSingle();

  if (!existingDeal) {
    return { error: "找不到這張合約，可能已被刪除。" };
  }
  if (existingDeal.car_id !== values.car_id) {
    return { error: "合約建立後車輛不可更改，請聯繫車行管理員另外處理。" };
  }

  // 2026-08-30：「已交車」是會計/老闆審核完稅金/抽成之後才結案的最後一
  // 步。業務沒有 canManageFinance 權限的話，前端下拉選單已經看不到這個
  // 選項（見 deal-form-modal.tsx 的 availableStatusOptions），這裡再檢查
  // 一次資料庫裡這張合約「原本」是不是已經是已交車——如果原本就是，允許
  // 業務照舊存檔其他欄位（例如訂正客戶電話），不會因為這次改動被擋下來；
  // 只有「這次才要把狀態改成已交車」而且沒有這個權限，才會被擋。
  if (values.status === "delivered") {
    const alreadyDelivered = existingDeal.status === "delivered";
    if (!permissions.canManageFinance && !alreadyDelivered) {
      return { error: "只有會計或老闆能把合約標記為「已交車」，請先送交會計確認稅金與業務抽成。" };
    }
    // 2026-08-30 修正：跟 createDeal 一樣補上伺服器端的真正防線——只在
    // 「這次才第一次變成已交車」才要求 commission_amount 有值，已經是
    // 已交車的舊合約重新存檔（例如訂正電話）不受影響，避免擋到合法的
    // 後續編輯。
    if (!alreadyDelivered && values.commission_amount == null) {
      return { error: "合約標記為「已交車」之前，請先填寫業務抽成金額（沒有的話可以填 0）。" };
    }
  }

  const { error } = await supabase.from("deals").update(values).eq("id", id);

  if (error) {
    return { error: `更新合約失敗：${error.message}` };
  }

  // 合約狀態改動也要同步一次——例如原本是草約，編輯時才改成已簽約/已
  // 交車，車輛狀態要跟著推進，不能只有新增合約當下才會同步；如果合約
  // 已經是已交車、這次編輯只是訂正成交金額，也會把訂正後的價格重新
  // 同步到車輛的最終成交價（見 syncCarStatusFromDeal 說明）。
  await syncCarStatusFromDeal(values.car_id, values.status, values.final_price);

  revalidatePath("/dashboard");
  return { success: true };
}
