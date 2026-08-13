"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadCarPhoto } from "@/lib/supabase/storage";
import { getEffectivePermissions } from "@/lib/permissions";
import type { CarStatus, PaymentMethod, TransferStatus } from "@/lib/supabase/types";

export interface CarFormState {
  error?: string;
  success?: boolean;
  /**
   * 非阻斷性警告：車輛本身已經成功新增/更新，但照片上傳失敗。
   * 不會擋住表單關閉，但要讓使用者看得到——不能只在伺服器端 log 一行
   * 就默默略過，不然使用者永遠不知道要回來補傳照片。
   */
  warning?: string;
}

const VALID_STATUSES: CarStatus[] = ["preparing", "in_stock", "reserved", "sold"];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ["bank_transfer", "debt_settlement", "cash"];
const VALID_TRANSFER_STATUSES: TransferStatus[] = ["待辦", "辦理中", "已完成"];

interface ParsedCar {
  brand: string | null;
  model_name: string;
  // 舊資料相容欄位：資料庫的 model 欄位還在（只是 NOT NULL 限制已經解除），
  // 所以每次新增/更新都自動用 `${brand} ${model_name}` 同步寫入，讓還在
  // 讀 model 欄位的舊資料/舊查詢不會看到空值。真正的資料來源一律是
  // brand + model_name 這兩個結構化欄位。
  model: string;
  year: number | null;
  license_year: number | null;
  mileage: number | null;
  engine_cc: number | null;
  transmission: string | null;
  color: string | null;
  license_plate: string | null;
  vin: string | null;
  certification: string | null;
  equipment_tags: string | null;
  condition_notes: string | null;
  purchase_price: number;
  transfer_fee: number | null;
  detailing_cost: number | null;
  repair_cost: number | null;
  floor_price: number | null;
  selling_price: number | null;
  final_price: number | null;
  // 進貨與付款追蹤
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_note: string | null;
  // 行政過戶與第三方認證
  transfer_date: string | null;
  transfer_status: TransferStatus | null;
  inspection_agency: string | null;
  inspection_date: string | null;
  inspection_status: string | null;
  // 二胎／人頭車：這四個是表單原始輸入，實際會不會寫進資料庫要看
  // computeNomineeFields() 的判斷（已標記過 has_used_as_nominee 的車輛，
  // 這四個欄位一律被忽略，見該函式的說明）。
  nominee_company: string | null;
  nominee_days: string | null;
  nominee_start_date: string | null;
  id_return_date: string | null;
  // 前台展示開關
  is_public: boolean;
  status: CarStatus;
}

interface ClosingFields {
  closed_at?: string | null;
  closed_prep_cost?: number | null;
  closed_total_cost?: number | null;
}

interface NomineeFields {
  nominee_company?: string | null;
  nominee_days?: string | null;
  nominee_start_date?: string | null;
  id_return_date?: string | null;
  has_used_as_nominee?: boolean;
}

/**
 * 二胎／人頭車防呆核心：has_used_as_nominee 是永久旗標。
 *
 * - 如果這輛車「已經」標記過（alreadyUsedAsNominee = true），不管表單這次
 *   送上來什麼二胎/人頭欄位，一律忽略、完全不寫進 update payload——這是
 *   「阻止重複登記人頭」的伺服器端強制執行，不能只靠前端把欄位設成
 *   disabled（那只是 UX 層的提示，繞過前端直接呼叫 Server Action 一樣
 *   會被這裡擋下來）。回傳空物件，Supabase update 就完全不會碰這四個
 *   欄位跟旗標，維持資料庫裡原本的值。
 * - 如果還沒標記過，只要四個欄位裡任一個有填，就把 has_used_as_nominee
 *   設成 true（從此永久鎖定）；都沒填就維持 false。
 */
function computeNomineeFields(
  submitted: Pick<ParsedCar, "nominee_company" | "nominee_days" | "nominee_start_date" | "id_return_date">,
  alreadyUsedAsNominee: boolean
): NomineeFields {
  if (alreadyUsedAsNominee) {
    return {};
  }

  const provided =
    submitted.nominee_company || submitted.nominee_days || submitted.nominee_start_date || submitted.id_return_date;

  return {
    nominee_company: submitted.nominee_company,
    nominee_days: submitted.nominee_days,
    nominee_start_date: submitted.nominee_start_date,
    id_return_date: submitted.id_return_date,
    has_used_as_nominee: !!provided,
  };
}

/**
 * 會計結帳邏輯核心：只有在「這次要把狀態改成 sold、而且之前不是 sold」
 * 的那一刻，才把當下已核准的維修整備費加總、連同收購價/規費封存成
 * closed_prep_cost / closed_total_cost，並記錄 closed_at。
 *
 * 之後不管 repair_items 又核准了多少新項目，這輛車的已結帳數字都不會
 * 再變動 —— 車行經營數據看板統計「已實現毛利」時一律讀這三個欄位，
 * 不會重新加總 repair_items（見 analytics-module.tsx）。
 *
 * 如果狀態從 sold 改回其他狀態（例如登記錯誤要更正），封存欄位會被清空，
 * 這輛車重新回到「用即時資料計算」的在庫車輛邏輯；下次再變成 sold 時，
 * 會用當下最新的資料重新封存一次。
 *
 * 如果目標狀態是 sold、但這輛車本來就已經是 sold（只是重新存檔沒有真的
 * 換狀態），完全不動這三個欄位 —— 已經封存的數字不會因為編輯其他欄位
 * 而被悄悄重算。
 */
async function computeClosingFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  carId: string | null,
  previousStatus: CarStatus | null,
  newStatus: CarStatus,
  purchasePrice: number,
  transferFee: number | null
): Promise<ClosingFields> {
  const wasSold = previousStatus === "sold";

  if (newStatus === "sold" && !wasSold) {
    let prepCost = 0;
    if (carId) {
      const { data: approved } = await supabase
        .from("repair_items")
        .select("amount")
        .eq("car_id", carId)
        .eq("status", "approved");
      prepCost = (approved ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
    }
    return {
      closed_at: new Date().toISOString(),
      closed_prep_cost: prepCost,
      closed_total_cost: purchasePrice + prepCost + Number(transferFee ?? 0),
    };
  }

  if (newStatus !== "sold" && wasSold) {
    return { closed_at: null, closed_prep_cost: null, closed_total_cost: null };
  }

  return {};
}

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

function optionalInt(formData: FormData, name: string, label: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
    throw new Error(`${label}格式不正確，請輸入正整數。`);
  }
  return num;
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

function optionalEnum<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  label: string
): T | null {
  const value = optionalText(formData, name);
  if (value === null) return null;
  if (!allowed.includes(value as T)) {
    throw new Error(`${label}不正確。`);
  }
  return value as T;
}

/**
 * 解析並驗證表單資料；任何一項不合法就丟錯誤訊息，不寫入資料庫。
 * 注意：不處理 image_url ——車輛照片改成檔案上傳，上傳跟資料庫寫入的
 * 時機不一樣（新增時要先有 car id 才能決定上傳路徑），交給呼叫端另外處理。
 * 也不處理「行照號碼」——已依需求從表單移除，資料庫欄位還在但不再收集。
 */
function parseCarForm(formData: FormData): ParsedCar {
  const brand = optionalText(formData, "brand");
  const modelName = String(formData.get("model_name") ?? "").trim();
  const status = String(formData.get("status") ?? "in_stock");

  if (!modelName) {
    throw new Error("請輸入車型名稱。");
  }
  if (!VALID_STATUSES.includes(status as CarStatus)) {
    throw new Error("車輛狀態不正確。");
  }

  const year = optionalInt(formData, "year", "出廠年份");
  if (year !== null && (year < 1900 || year > 2100)) {
    throw new Error("出廠年份請輸入西元年，例如 2022。");
  }
  const licenseYear = optionalInt(formData, "license_year", "領牌年份");
  if (licenseYear !== null && (licenseYear < 1900 || licenseYear > 2100)) {
    throw new Error("領牌年份請輸入西元年，例如 2022。");
  }
  const mileage = optionalInt(formData, "mileage", "里程數");
  const engineCc = optionalInt(formData, "engine_cc", "排氣量");

  const purchasePriceRaw = String(formData.get("purchase_price") ?? "").trim();
  const purchasePrice = Number(purchasePriceRaw);
  if (purchasePriceRaw === "" || !Number.isFinite(purchasePrice) || purchasePrice < 0) {
    throw new Error("請輸入正確的收購進價。");
  }

  return {
    brand,
    model_name: modelName,
    model: [brand, modelName].filter(Boolean).join(" "),
    year,
    license_year: licenseYear,
    mileage,
    engine_cc: engineCc,
    transmission: optionalText(formData, "transmission"),
    color: optionalText(formData, "color"),
    license_plate: optionalText(formData, "license_plate"),
    vin: optionalText(formData, "vin"),
    certification: optionalText(formData, "certification"),
    equipment_tags: optionalText(formData, "equipment_tags"),
    condition_notes: optionalText(formData, "condition_notes"),
    purchase_price: purchasePrice,
    transfer_fee: optionalMoney(formData, "transfer_fee", "過戶費/規費"),
    detailing_cost: optionalMoney(formData, "detailing_cost", "整理美容成本"),
    repair_cost: optionalMoney(formData, "repair_cost", "整備維修成本"),
    floor_price: optionalMoney(formData, "floor_price", "底價"),
    selling_price: optionalMoney(formData, "selling_price", "開價"),
    final_price: optionalMoney(formData, "final_price", "最終成交價"),
    paid_amount: optionalMoney(formData, "paid_amount", "已付金額"),
    payment_method: optionalEnum(formData, "payment_method", VALID_PAYMENT_METHODS, "付款方式"),
    payment_note: optionalText(formData, "payment_note"),
    transfer_date: optionalText(formData, "transfer_date"),
    transfer_status: optionalEnum(formData, "transfer_status", VALID_TRANSFER_STATUSES, "過戶狀態"),
    inspection_agency: optionalText(formData, "inspection_agency"),
    inspection_date: optionalText(formData, "inspection_date"),
    inspection_status: optionalText(formData, "inspection_status"),
    nominee_company: optionalText(formData, "nominee_company"),
    nominee_days: optionalText(formData, "nominee_days"),
    nominee_start_date: optionalText(formData, "nominee_start_date"),
    id_return_date: optionalText(formData, "id_return_date"),
    // checkbox 只有勾選時才會出現在 FormData 裡，has() 就是「有沒有勾」。
    is_public: formData.has("is_public"),
    status: status as CarStatus,
  };
}

export async function createCar(
  _prevState: CarFormState | undefined,
  formData: FormData
): Promise<CarFormState> {
  // 驗證登入身份、角色，並確認已被指派車行；車輛一律綁在自己的車行底下。
  const { profile } = await requireTenantUser();

  // RBAC：前端「+新增車輛」按鈕已經會依權限隱藏，這裡是後端第二道防線
  // ——避免一般業務繞過前端、直接呼叫這支 Server Action。
  if (!getEffectivePermissions(profile).canEditCars) {
    return { error: "沒有權限新增車輛，請聯繫車行管理員開啟「新增/編輯車輛資料」權限。" };
  }

  let values: ParsedCar;
  try {
    values = parseCarForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();

  // 新車幾乎不會一開始就是 sold，但還是處理這個邊界情況：如果真的一建立
  // 就選了「已售出」，直接結帳封存（此時不可能有任何 repair_items，
  // 加總自然是 0）。
  const closingFields = await computeClosingFields(
    supabase,
    null,
    null,
    values.status,
    values.purchase_price,
    values.transfer_fee
  );

  // 新車不可能「已經」被標記過人頭（alreadyUsedAsNominee 一律 false），
  // 這裡只是要把原始的 nominee_* 欄位從 values 拆出來，改用
  // computeNomineeFields() 的回傳值，跟 updateCar 走同一套邏輯、行為一致。
  const { nominee_company, nominee_days, nominee_start_date, id_return_date, ...restValues } = values;
  const nomineeFields = computeNomineeFields(
    { nominee_company, nominee_days, nominee_start_date, id_return_date },
    false
  );

  // 先建立車輛列，拿到 id 之後才知道照片要上傳到哪個路徑
  // （<tenant_id>/<car_id>/...），所以照片一定是第二步驟。
  const { data: inserted, error } = await supabase
    .from("cars")
    .insert({ ...restValues, ...nomineeFields, ...closingFields, tenant_id: profile.tenant_id! })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `新增車輛失敗：${error?.message ?? "未知錯誤"}` };
  }

  // 車輛本身已經寫入成功，接下來的照片上傳是「錦上添花」的第二步驟：
  // 就算上傳失敗（或途中丟出未預期例外），也絕對不能讓這次新增整體失敗、
  // 卡住表單或擋掉下面的 revalidatePath——只在伺服器端記一筆 log 方便排查，
  // 使用者那邊照樣視為新增成功，Modal 正常關閉，列表也會立刻看到新車。
  let photoWarning: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      const { url, error: uploadError } = await uploadCarPhoto(
        supabase,
        profile.tenant_id!,
        inserted.id,
        photo
      );
      if (uploadError) {
        console.error(`[createCar] 照片上傳失敗（車輛 ${inserted.id} 已成功建立）：${uploadError}`);
        photoWarning = `車輛已成功新增，但照片上傳失敗（${uploadError}），請稍後編輯車輛重新上傳照片。`;
      } else if (url) {
        await supabase.from("cars").update({ image_url: url }).eq("id", inserted.id);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "未知錯誤";
      console.error(`[createCar] 照片上傳發生未預期錯誤（車輛 ${inserted.id} 已成功建立）：`, e);
      photoWarning = `車輛已成功新增，但照片上傳發生未預期錯誤（${message}），請稍後編輯車輛重新上傳照片。`;
    }
  }

  revalidatePath("/dashboard");
  return { success: true, warning: photoWarning };
}

export async function updateCar(
  _prevState: CarFormState | undefined,
  formData: FormData
): Promise<CarFormState> {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canEditCars) {
    return { error: "沒有權限編輯車輛，請聯繫車行管理員開啟「新增/編輯車輛資料」權限。" };
  }

  const carId = String(formData.get("id") ?? "");
  if (!carId) {
    return { error: "缺少車輛 ID，無法更新。" };
  }

  let values: ParsedCar;
  try {
    values = parseCarForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();

  const { data: existingCar } = await supabase
    .from("cars")
    .select("status, has_used_as_nominee")
    .eq("id", carId)
    .single();

  const closingFields = await computeClosingFields(
    supabase,
    carId,
    (existingCar?.status as CarStatus | undefined) ?? null,
    values.status,
    values.purchase_price,
    values.transfer_fee
  );

  // 二胎/人頭車防呆：已經標記過的車輛，表單這次送上來的 nominee_* 欄位
  // 一律忽略（見 computeNomineeFields() 的說明），不會覆蓋既有紀錄，也
  // 不允許重新登記——前端會把這幾個欄位設成 disabled，這裡是後端不可被
  // 繞過的第二道防線。
  const { nominee_company, nominee_days, nominee_start_date, id_return_date, ...restValues } = values;
  const nomineeFields = computeNomineeFields(
    { nominee_company, nominee_days, nominee_start_date, id_return_date },
    existingCar?.has_used_as_nominee === true
  );

  // 只有真的選了新照片才上傳並覆蓋 image_url；沒選檔案就完全不碰這個欄位，
  // 保留原本的照片，不會因為編輯其他欄位而把照片清掉。
  // 跟 createCar 一樣：照片上傳失敗（或丟出未預期例外）絕對不能擋掉其他
  // 欄位的更新——使用者可能只是想改個售價或狀態，不該因為照片上傳問題
  // 整筆存檔都失敗，只記 log、image_url 維持原樣即可。
  let photoWarning: string | undefined;
  const photo = formData.get("photo");
  const updatePayload: typeof restValues & NomineeFields & ClosingFields & { image_url?: string } = {
    ...restValues,
    ...nomineeFields,
    ...closingFields,
  };
  if (photo instanceof File && photo.size > 0) {
    try {
      const { url, error: uploadError } = await uploadCarPhoto(
        supabase,
        profile.tenant_id!,
        carId,
        photo
      );
      if (uploadError) {
        console.error(`[updateCar] 照片上傳失敗（車輛 ${carId} 其餘欄位仍會更新）：${uploadError}`);
        photoWarning = `車輛資料已成功更新，但照片上傳失敗（${uploadError}），照片維持原樣，請稍後重新嘗試。`;
      } else if (url) {
        updatePayload.image_url = url;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "未知錯誤";
      console.error(`[updateCar] 照片上傳發生未預期錯誤（車輛 ${carId} 其餘欄位仍會更新）：`, e);
      photoWarning = `車輛資料已成功更新，但照片上傳發生未預期錯誤（${message}），照片維持原樣，請稍後重新嘗試。`;
    }
  }

  // 不需要額外檢查這輛車是不是自己車行的 —— RLS 的 cars_tenant_scoped
  // policy 已經強制限制只能更新 tenant_id 等於自己車行的資料列，就算帶了
  // 別間車行的車輛 id 上來，這個 update 也只會影響 0 筆、不會報錯但也
  // 不會誤改到別人的資料。
  const { error } = await supabase.from("cars").update(updatePayload).eq("id", carId);

  if (error) {
    return { error: `更新車輛失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true, warning: photoWarning };
}

/** 快捷操作：只改狀態，不用開整個編輯表單。一樣會觸發結帳封存邏輯。 */
export async function updateCarStatus(carId: string, status: CarStatus) {
  await requireTenantUser();

  if (!VALID_STATUSES.includes(status)) {
    return { error: "車輛狀態不正確。" };
  }

  const supabase = await createClient();

  const { data: existingCar } = await supabase
    .from("cars")
    .select("status, purchase_price, transfer_fee")
    .eq("id", carId)
    .single();

  if (!existingCar) {
    return { error: "找不到這輛車。" };
  }

  const closingFields = await computeClosingFields(
    supabase,
    carId,
    existingCar.status as CarStatus,
    status,
    Number(existingCar.purchase_price),
    existingCar.transfer_fee != null ? Number(existingCar.transfer_fee) : null
  );

  const { error } = await supabase
    .from("cars")
    .update({ status, ...closingFields })
    .eq("id", carId);

  if (error) {
    return { error: `更新車輛狀態失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 刪除車輛 —— 軟刪除：只寫 deleted_at，不會真的 DELETE FROM cars。
 *
 * 為什麼不做真刪除：repair_items（維修請款）跟 deals（買賣合約）對 cars
 * 都是 on delete cascade，真的刪列會把這輛車的維修/合約歷史紀錄一起
 * 刪掉，車行的財務/合約紀錄不該因為「不想再顯示這輛車」而消失。軟刪除
 * 後車輛會從庫存列表（CarsManager）預設隱藏，但資料、車輛相簿
 * （car_photos）、關聯的維修/合約紀錄完全不受影響，之後也可以用
 * restoreCar() 復原。
 */
export async function deleteCar(carId: string) {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canEditCars) {
    return { error: "沒有權限刪除車輛，請聯繫車行管理員開啟「新增/編輯車輛資料」權限。" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cars")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", carId);

  if (error) {
    return { error: `刪除車輛失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/** 復原一輛先前被軟刪除的車輛（清空 deleted_at）。 */
export async function restoreCar(carId: string) {
  const { profile } = await requireTenantUser();

  if (!getEffectivePermissions(profile).canEditCars) {
    return { error: "沒有權限復原車輛，請聯繫車行管理員開啟「新增/編輯車輛資料」權限。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cars").update({ deleted_at: null }).eq("id", carId);

  if (error) {
    return { error: `復原車輛失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
