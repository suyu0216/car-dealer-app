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

function parsePaymentMethod(formData: FormData, name: string, label: string): CashPoolMethod | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  if (!VALID_PAYMENT_METHODS.includes(raw as CashPoolMethod)) {
    throw new Error(`${label}不正確。`);
  }
  return raw as CashPoolMethod;
}

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
  const finalPriceRaw = String(formData.get("final_price") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!carId) throw new Error("請選擇車輛。");
  const finalPrice = Number(finalPriceRaw);
  if (finalPriceRaw === "" || !Number.isFinite(finalPrice) || finalPrice < 0) {
    throw new Error("請輸入正確的成交價。");
  }
  if (!VALID_STATUSES.includes(status as DealStatus)) {
    throw new Error("合約狀態不正確。");
  }

  // 客戶欄位（customer_id／customer_name／customer_phone）這裡只先原封
  // 不動取出表單上的值，實際驗證/是否信任表單文字、要不要強制從 CRM
  // 選擇既有客戶，交給 resolveCustomerFields()（角色不同規則不同，且
  // 需要查資料庫，parseDealForm 保持同步、不碰資料庫）。
  const customerId = optionalText(formData, "customer_id");
  const customerNameRaw = String(formData.get("customer_name") ?? "").trim();
  const customerPhoneRaw = optionalText(formData, "customer_phone");

  // 2026-08-31：訂金／尾款分開記錄各自的收款方式，給「資金總覽」水池
  // 用——訂金常常是現金、尾款才走匯款，舊版單一 payment_method 欄位沒
  // 辦法反映實際金流，導致水池對不起來。草約階段可能還沒收到錢，兩者
  // 都允許不選。
  const depositPaymentMethod = parsePaymentMethod(formData, "deposit_payment_method", "訂金收款方式");
  const balancePaymentMethod = parsePaymentMethod(formData, "balance_payment_method", "尾款收款方式");

  return {
    car_id: carId,
    customer_id: customerId,
    customer_name: customerNameRaw,
    customer_phone: customerPhoneRaw,
    final_price: finalPrice,
    deposit_amount: optionalMoney(formData, "deposit_amount", "訂金"),
    balance_amount: optionalMoney(formData, "balance_amount", "尾款"),
    deposit_payment_method: depositPaymentMethod,
    balance_payment_method: balancePaymentMethod,
    loan_status: optionalText(formData, "loan_status"),
    salesperson_id: optionalText(formData, "salesperson_id"),
    ...(canManageFinance
      ? { commission_amount: optionalMoney(formData, "commission_amount", "預估抽成") }
      : {}),
    status: status as DealStatus,
    note: optionalText(formData, "note"),
  };
}

/**
 * 2026-08-31 新增：客戶欄位的最終驗證/解析——安安反映一般業務/店長
 * 建立合約時，不該開放手動輸入一個全新的客戶姓名了事，那樣客戶的聯絡
 * 方式跟後續需求就不會留在「客戶管理」（CRM）裡；只有會計/老闆
 * （canManageFinance）才維持原本可以手動輸入、或乾脆不指定的彈性（例如
 * 幫忙處理不屬於自己名下客戶的合約、或臨時客人還沒空建檔）。
 *
 * canManageFinance 為 false 時：
 *   - 一定要帶 customer_id，不接受表單送上來的 customer_name/
 *     customer_phone 文字（防止繞過前端直接偽造客戶資料）。
 *   - customer_id 對應的客戶姓名/電話一律重新從資料庫查出來——這裡用
 *     一般 client（不是 admin client），customers_owner_or_tenant_admin
 *     這條 RLS policy 會自動限制只查得到「自己名下」的客戶，查不到就
 *     代表這個 id 不是這個人看得到的客戶（可能是別人的客戶、或已被
 *     刪除），一律當成無效輸入擋下來。
 */
async function resolveCustomerFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  canManageFinance: boolean,
  customerId: string | null,
  customerNameRaw: string,
  customerPhoneRaw: string | null
): Promise<{ customer_id: string | null; customer_name: string; customer_phone: string | null }> {
  if (canManageFinance) {
    if (!customerNameRaw) {
      throw new Error("請輸入客戶姓名，或從既有客戶選擇。");
    }
    return { customer_id: customerId, customer_name: customerNameRaw, customer_phone: customerPhoneRaw };
  }

  if (!customerId) {
    throw new Error(
      "請從「客戶管理」選擇一位既有客戶——這個角色不開放手動輸入新客戶資料，如果還沒有這位客戶的資料，請先到「客戶管理」新增。"
    );
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("id", customerId)
    .maybeSingle();

  if (error || !customer) {
    throw new Error("選擇的客戶不存在，或您沒有權限使用這位客戶，請重新選擇。");
  }

  return { customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone };
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

  let customerFields;
  try {
    customerFields = await resolveCustomerFields(
      supabase,
      permissions.canManageFinance,
      values.customer_id,
      values.customer_name,
      values.customer_phone
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "客戶資料不正確。" };
  }

  const { error } = await supabase
    .from("deals")
    .insert({ ...values, ...customerFields, tenant_id: profile.tenant_id! });

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

  let customerFields;
  try {
    customerFields = await resolveCustomerFields(
      supabase,
      permissions.canManageFinance,
      values.customer_id,
      values.customer_name,
      values.customer_phone
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "客戶資料不正確。" };
  }

  const { error } = await supabase.from("deals").update({ ...values, ...customerFields }).eq("id", id);

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
