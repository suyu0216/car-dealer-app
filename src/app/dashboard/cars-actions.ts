"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadCarPhotos } from "@/lib/supabase/storage";
import { getEffectivePermissions } from "@/lib/permissions";
import { createNotification } from "@/lib/supabase/notifications";
import { VALID_BODY_TYPES } from "@/lib/supabase/types";
import type { CarStatus, DealStatus, PaymentMethod, TransferStatus } from "@/lib/supabase/types";

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
  tax_amount: number | null;
  detailing_cost: number | null;
  repair_cost: number | null;
  floor_price: number | null;
  selling_price: number | null;
  final_price: number | null;
  /** 真實最終成本，只有 canViewFinalCost 的人送出的值才會真的寫進資料庫
   * （見 createCar/updateCar 怎麼把這欄從 restValues 拆出來、依權限決定
   * 要不要放進 insert/update payload）。 */
  final_cost_price: number | null;
  // 進貨與付款追蹤
  paid_amount: number | null;
  payment_method: PaymentMethod | null;
  payment_note: string | null;
  /** 採購業務：跟 created_by（新增當下寫入一次、不能改）不一樣，這個
   * 欄位可以隨編輯車輛隨時修改，見 types.ts 對 Car.purchased_by 的說明。 */
  purchased_by: string | null;
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
  // 車型分類／熱門推薦／大圖卡——見 types.ts 對 Car.body_type /
  // is_featured / is_large_card 的說明。
  body_type: (typeof VALID_BODY_TYPES)[number] | null;
  is_featured: boolean;
  is_large_card: boolean;
}

interface ClosingFields {
  closed_at?: string | null;
  closed_prep_cost?: number | null;
  closed_commission_cost?: number | null;
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
 * 的那一刻，才把當下已核准的維修整備費、對應合約的業務抽成加總，連同
 * 收購價/規費/稅金封存成 closed_prep_cost / closed_commission_cost /
 * closed_total_cost，並記錄 closed_at。
 *
 * 業務抽成的來源：查這輛車底下狀態是「已交車」的合約（deals），取最新
 * 一筆的 commission_amount——正常情況一輛車只會有一筆已交車的合約，
 * 這裡容錯用「取最新」處理極少數重複建約的邊界情況。沒有對應合約，或
 * 合約沒填抽成，就當作 0。這樣不管是從「買賣合約」交車自動觸發
 * （syncCarStatusFromDeal），還是車輛詳情頁「設為已售出」快捷操作手動
 * 觸發，只要資料庫裡已經有這筆合約，抽成都會被正確封存進去，不用另外
 * 從呼叫端把抽成金額當參數一路傳進來。
 *
 * 之後不管 repair_items 又核准了多少新項目、合約抽成事後又被改了多少，
 * 這輛車的已結帳數字都不會再變動 —— 車行經營數據看板統計「已實現毛利」
 * 時一律讀這幾個欄位，不會重新加總 repair_items／deals（見
 * analytics-module.tsx）。
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
  transferFee: number | null,
  taxAmount: number | null
): Promise<ClosingFields> {
  const wasSold = previousStatus === "sold";

  if (newStatus === "sold" && !wasSold) {
    let prepCost = 0;
    let commissionCost = 0;
    if (carId) {
      const [{ data: approved }, { data: deal }] = await Promise.all([
        supabase.from("repair_items").select("amount").eq("car_id", carId).eq("status", "approved"),
        supabase
          .from("deals")
          .select("commission_amount")
          .eq("car_id", carId)
          .eq("status", "delivered")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      prepCost = (approved ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
      commissionCost = deal?.commission_amount != null ? Number(deal.commission_amount) : 0;
    }
    return {
      closed_at: new Date().toISOString(),
      closed_prep_cost: prepCost,
      closed_commission_cost: commissionCost,
      closed_total_cost:
        purchasePrice + prepCost + Number(transferFee ?? 0) + Number(taxAmount ?? 0) + commissionCost,
    };
  }

  if (newStatus !== "sold" && wasSold) {
    return { closed_at: null, closed_prep_cost: null, closed_commission_cost: null, closed_total_cost: null };
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
    tax_amount: optionalMoney(formData, "tax_amount", "稅金/發票稅金"),
    detailing_cost: optionalMoney(formData, "detailing_cost", "整理美容成本"),
    repair_cost: optionalMoney(formData, "repair_cost", "整備維修成本"),
    floor_price: optionalMoney(formData, "floor_price", "底價"),
    selling_price: optionalMoney(formData, "selling_price", "開價"),
    final_price: optionalMoney(formData, "final_price", "最終成交價"),
    final_cost_price: optionalMoney(formData, "final_cost_price", "最終成本價格"),
    paid_amount: optionalMoney(formData, "paid_amount", "已付金額"),
    payment_method: optionalEnum(formData, "payment_method", VALID_PAYMENT_METHODS, "付款方式"),
    payment_note: optionalText(formData, "payment_note"),
    purchased_by: optionalText(formData, "purchased_by"),
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
    body_type: optionalEnum(formData, "body_type", VALID_BODY_TYPES, "車型分類"),
    is_featured: formData.has("is_featured"),
    is_large_card: formData.has("is_large_card"),
  };
}

export async function createCar(
  _prevState: CarFormState | undefined,
  formData: FormData
): Promise<CarFormState> {
  // 驗證登入身份、角色，並確認已被指派車行；車輛一律綁在自己的車行底下。
  const { profile } = await requireTenantUser();
  const permissions = getEffectivePermissions(profile);

  // RBAC：前端「+新增車輛」按鈕已經會依權限隱藏，這裡是後端第二道防線
  // ——避免一般業務繞過前端、直接呼叫這支 Server Action。
  if (!permissions.canEditCars) {
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
    values.transfer_fee,
    values.tax_amount
  );

  // 新車不可能「已經」被標記過人頭（alreadyUsedAsNominee 一律 false），
  // 這裡只是要把原始的 nominee_* 欄位從 values 拆出來，改用
  // computeNomineeFields() 的回傳值，跟 updateCar 走同一套邏輯、行為一致。
  // final_cost_price 也拆出來另外處理——只有 canViewFinalCost 的人送出
  // 的值才會真的寫進資料庫，見下面 finalCostField 的說明。
  const { nominee_company, nominee_days, nominee_start_date, id_return_date, final_cost_price, ...restValues } =
    values;
  const nomineeFields = computeNomineeFields(
    { nominee_company, nominee_days, nominee_start_date, id_return_date },
    false
  );
  // 2026-08-31：沒有 canViewFinalCost 權限的人，這個 key 完全不會出現在
  // insert payload 裡（不是帶 null）——這個人本來就看不到真實最終成本，
  // 表單上這個欄位也不會渲染，就算有人繞過前端硬塞一個值上來，這裡也
  // 一律忽略，不會被寫進資料庫。
  const finalCostField = permissions.canViewFinalCost ? { final_cost_price } : {};

  // 先建立車輛列，拿到 id 之後才知道照片要上傳到哪個路徑
  // （<tenant_id>/<car_id>/...），所以照片一定是第二步驟。
  const { data: inserted, error } = await supabase
    .from("cars")
    .insert({
      ...restValues,
      ...nomineeFields,
      ...closingFields,
      ...finalCostField,
      tenant_id: profile.tenant_id!,
      // 上架人：記錄是誰在系統裡新增這輛車，只在新增當下寫入一次，之後
      // 編輯車輛（updateCar）不會、也不應該覆蓋這欄，見 types.ts 對
      // Car.created_by 的說明。
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `新增車輛失敗：${error?.message ?? "未知錯誤"}` };
  }

  // 2026-08-31 新增：安安要求新增車輛入庫時「底價」一定要填，但底價
  // 屬於成本類敏感資訊，員工（負責新增車輛入庫的人）預設看不到、也
  // 填不到這個欄位（見 canViewCost），沒辦法強制他們填。改成新增當下
  // 如果沒有底價，就發一則通知鈴鐺提醒會計/老闆回頭補填——link 帶上
  // highlight=車輛 id，點通知會直接跳到「車輛庫存管理」分頁並自動開啟
  // 這輛車的編輯表單（見 cars-manager.tsx）。dashboard/layout.tsx 已經
  // 把鈴鐺放寬成 canManageStaff 或 canManageFinance 都看得到，會計才收
  // 得到這則提醒。
  if (values.floor_price == null) {
    await createNotification({
      tenantId: profile.tenant_id!,
      type: "car_floor_price_missing",
      title: "新車入庫，尚待填寫底價",
      message: `${profile.name ?? "有人"} 新增了「${values.brand ? `${values.brand} ` : ""}${values.model_name}」，還沒有底價，請回頭補填。`,
      actorName: profile.name,
      link: `?module=inventory&highlight=${inserted.id}`,
    });
  }

  // 車輛本身已經寫入成功，接下來的照片上傳是「錦上添花」的第二步驟：
  // 就算上傳失敗（或途中丟出未預期例外），也絕對不能讓這次新增整體失敗、
  // 卡住表單或擋掉下面的 revalidatePath——只在伺服器端記一筆 log 方便排查，
  // 使用者那邊照樣視為新增成功，Modal 正常關閉，列表也會立刻看到新車。
  // 2026-08-31：安安要求「車輛照片」能一次選多張上傳——表單的 file input
  // 從 name="photo" 改成 name="photos"（multiple），這裡改用
  // formData.getAll() 一次拿全部檔案。第一張當主圖（cars.image_url，
  // 全站目前絕大多數畫面都只讀這一欄），全部（含第一張）都寫進
  // car_photos 相簿表——不能只把「第一張以外」的寫進相簿：前台展間的
  // photosFor()（見 showroom-cars-section.tsx）只要 car_photos 有資料
  // 就完全取代 image_url 當唯一來源，不是取聯集，漏寫主圖進去的話主圖
  // 反而會從前台相簿裡消失。
  let photoWarning: string | undefined;
  const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (photoFiles.length > 0) {
    try {
      const results = await uploadCarPhotos(supabase, profile.tenant_id!, inserted.id, photoFiles);
      const uploaded = results.filter(
        (r): r is { url: string; error: null; fileName: string } => r.url != null
      );
      const failed = results.filter((r) => r.url == null);
      if (uploaded.length > 0) {
        await supabase.from("cars").update({ image_url: uploaded[0].url }).eq("id", inserted.id);
        await supabase.from("car_photos").insert(
          uploaded.map((u, i) => ({
            tenant_id: profile.tenant_id!,
            car_id: inserted.id,
            url: u.url,
            sort_order: i,
          }))
        );
      }
      if (failed.length > 0) {
        console.error(
          `[createCar] ${failed.length} 張照片上傳失敗（車輛 ${inserted.id} 已成功建立）：${failed.map((f) => f.fileName).join("、")}`
        );
        photoWarning = `車輛已成功新增，但有 ${failed.length} 張照片上傳失敗（${failed
          .map((f) => f.fileName)
          .join("、")}），請稍後編輯車輛重新上傳。`;
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
  const permissions = getEffectivePermissions(profile);

  if (!permissions.canEditCars) {
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
    values.transfer_fee,
    values.tax_amount
  );

  // 二胎/人頭車防呆：已經標記過的車輛，表單這次送上來的 nominee_* 欄位
  // 一律忽略（見 computeNomineeFields() 的說明），不會覆蓋既有紀錄，也
  // 不允許重新登記——前端會把這幾個欄位設成 disabled，這裡是後端不可被
  // 繞過的第二道防線。
  // final_cost_price 一樣拆出來另外處理——見下面 finalCostField 的說明。
  const { nominee_company, nominee_days, nominee_start_date, id_return_date, final_cost_price, ...restValues } =
    values;
  const nomineeFields = computeNomineeFields(
    { nominee_company, nominee_days, nominee_start_date, id_return_date },
    existingCar?.has_used_as_nominee === true
  );
  // 2026-08-31：沒有 canViewFinalCost 權限的人，這個 key 完全不會出現在
  // update payload 裡（不是帶 null）——Supabase update 沒帶到的欄位不會
  // 被覆蓋，這個人本來就看不到真實最終成本，沒辦法、也不應該把它「原封
  // 不動送回去」（不像其他成本欄位那樣可以靠隱藏欄位保留原值——因為這
  // 個人的瀏覽器一開始就沒拿到真實的 final_cost_price，見 page.tsx 怎麼
  // 在資料離開伺服器前就先清掉）。
  const finalCostField = permissions.canViewFinalCost ? { final_cost_price } : {};

  // 只有真的選了新照片才上傳並覆蓋 image_url；沒選檔案就完全不碰這個欄位，
  // 保留原本的照片，不會因為編輯其他欄位而把照片清掉。
  // 跟 createCar 一樣：照片上傳失敗（或丟出未預期例外）絕對不能擋掉其他
  // 欄位的更新——使用者可能只是想改個售價或狀態，不該因為照片上傳問題
  // 整筆存檔都失敗，只記 log、image_url 維持原樣即可。
  // 2026-08-31：跟 createCar 一樣改成一次可以選多張（見上面的說明）。
  // 編輯既有車輛時，新上傳的照片要接在既有 car_photos 相簿「後面」，不
  // 能整批固定從 sort_order 0 開始——不然會蓋掉之前已經上傳過的相簿照片
  // 排序（多筆 sort_order 重複也不影響顯示對錯，只是排序會亂掉，這裡還
  // 是先查一次目前最大值，維持相簿的排序穩定）。
  let photoWarning: string | undefined;
  const photoFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const updatePayload: typeof restValues &
    NomineeFields &
    ClosingFields &
    typeof finalCostField & { image_url?: string } = {
    ...restValues,
    ...nomineeFields,
    ...closingFields,
    ...finalCostField,
  };
  if (photoFiles.length > 0) {
    try {
      const results = await uploadCarPhotos(supabase, profile.tenant_id!, carId, photoFiles);
      const uploaded = results.filter(
        (r): r is { url: string; error: null; fileName: string } => r.url != null
      );
      const failed = results.filter((r) => r.url == null);
      if (uploaded.length > 0) {
        updatePayload.image_url = uploaded[0].url;
        const { data: existingPhotos } = await supabase
          .from("car_photos")
          .select("sort_order")
          .eq("car_id", carId)
          .order("sort_order", { ascending: false })
          .limit(1);
        const nextSortOrder = (existingPhotos?.[0]?.sort_order ?? -1) + 1;
        await supabase.from("car_photos").insert(
          uploaded.map((u, i) => ({
            tenant_id: profile.tenant_id!,
            car_id: carId,
            url: u.url,
            sort_order: nextSortOrder + i,
          }))
        );
      }
      if (failed.length > 0) {
        console.error(
          `[updateCar] ${failed.length} 張照片上傳失敗（車輛 ${carId} 其餘欄位仍會更新）：${failed.map((f) => f.fileName).join("、")}`
        );
        photoWarning = `車輛資料已成功更新，但有 ${failed.length} 張照片上傳失敗（${failed
          .map((f) => f.fileName)
          .join("、")}），請稍後重新嘗試。`;
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

/**
 * 快捷操作：只改狀態，不用開整個編輯表單。一樣會觸發結帳封存邏輯。
 *
 * finalPrice 是選填的最終成交價——快捷操作「設為已售出」原本只改
 * status，完全不會寫入 final_price，車輛詳情頁「定價」區塊的「最終成交價」
 * 因此永遠是空的（除非另外開編輯表單手動填，或走「買賣合約與交易」
 * 建立合約、交車時由 syncCarStatusFromDeal() 自動同步過來）。這裡加這個
 * 選填參數，讓車輛詳情頁（car-detail-modal.tsx）可以在點「設為已售出」
 * 快捷按鈕的當下順便問一次成交價，一次到位，不用事後再回頭補。只有
 * newStatus === 'sold' 且有帶值才會寫入，其餘狀態變更（退回整備中/
 * 設為已預訂）完全不受影響。
 */
export async function updateCarStatus(carId: string, status: CarStatus, finalPrice?: number) {
  const { profile } = await requireTenantUser();

  // 2026-08-30 修正：這支「快捷切換車輛狀態」的 action 原本漏掉權限檢查
  // ——只驗證有沒有登入，沒有像 createCar/updateCar/deleteCar 一樣確認
  // canEditCars。前端雖然只在有權限的人畫面上才會出現這些快捷按鈕，但
  // 後端沒擋的話，任何登入的車行成員（包含被明確關掉「編輯車輛」權限的
  // 會計、一般員工）都能直接呼叫這支 action 把車輛標記已售出、寫入結帳
  // 快照，這裡補上跟其他車輛異動 action 一致的後端第二道防線。
  if (!getEffectivePermissions(profile).canEditCars) {
    return { error: "沒有權限編輯車輛狀態，請聯繫車行管理員開啟「新增/編輯車輛資料」權限。" };
  }

  if (!VALID_STATUSES.includes(status)) {
    return { error: "車輛狀態不正確。" };
  }

  const supabase = await createClient();

  const { data: existingCar } = await supabase
    .from("cars")
    .select("status, purchase_price, transfer_fee, tax_amount")
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
    existingCar.transfer_fee != null ? Number(existingCar.transfer_fee) : null,
    existingCar.tax_amount != null ? Number(existingCar.tax_amount) : null
  );

  const finalPriceField =
    status === "sold" && finalPrice != null && Number.isFinite(finalPrice)
      ? { final_price: finalPrice }
      : {};

  const { error } = await supabase
    .from("cars")
    .update({ status, ...closingFields, ...finalPriceField })
    .eq("id", carId);

  if (error) {
    return { error: `更新車輛狀態失敗：${error.message}` };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * 從「買賣合約」狀態同步車輛庫存狀態 —— 給 deals-actions.ts 的
 * createDeal / updateDeal 在合約成功寫入後呼叫。
 *
 * 為什麼需要這個：合約（deals）跟車輛庫存（cars）原本是兩個完全獨立的
 * 表、也是兩個完全獨立的操作。業務把合約狀態改成「已交車」，車輛在
 * 庫存列表、車行經營數據看板（AnalyticsModule 的「場內在庫營運狀況」
 * 「本月成交台數」「已實現總毛利」全部只認 cars.status === 'sold'，
 * 完全不會去看 deals 表）裡卻還是顯示成待售中／在庫資產，直到有人想到
 * 要另外跑一趟車輛詳情頁手動改狀態——資料庫兩張表就這樣悄悄兜不起來。
 *
 * 只會把狀態往前推進，不會自動往回降級：
 * - 合約簽約（signed）：車輛目前是 preparing/in_stock（都還沒被預訂）
 *   才會推進成 reserved；已經是 reserved 或 sold 就不動，避免蓋掉更
 *   進階的狀態。
 * - 合約交車（delivered）：只要車輛還不是 sold，就推進成 sold，並沿用
 *   跟 updateCarStatus 完全一樣的結帳封存邏輯（computeClosingFields），
 *   確保這輛車不管是從詳情頁手動改、還是這裡自動改，封存的整備成本/
 *   結帳快照算法永遠一致。
 * - 合約如果事後被改回 draft/signed（例如訂正打錯的狀態），不會自動把
 *   已經是 sold 的車輛打回 reserved／清掉結帳快照——那屬於「取消交易」
 *   的更正動作，需要到車輛詳情頁手動處理，避免自動邏輯誤刪已經封存好
 *   的財務紀錄。
 *
 * 找不到這輛車、或資料庫寫入失敗都只記錄錯誤，不拋出例外——车輛狀態
 * 沒同步成功不該讓合約本身的新增/更新跟著失敗，那是兩件事。
 *
 * dealFinalPrice：合約上談定的成交價。交車（delivered）時會一併同步
 * 寫進車輛的「最終成交價」欄位——不然車輛狀態雖然自動變成已售出，
 * 「最終成交價」還是空的或維持舊值，業務得自己再手動打一次，忘了填的
 * 話「已實現總毛利」這類數據會退回用「展示開價」估算，不是真正談定的
 * 價格（見 analytics-module.tsx 的 revenueBasis）。這一步不受「只從
 * preparing/in_stock 推進」那條限制——就算合約事後修正金額、車輛當下
 * 已經是 sold，也應該把最新談定的價格同步過去，不然車輛紀錄上的成交價
 * 會停在第一次交車當下的（可能打錯的）數字；但結帳成本快照
 * （closed_prep_cost/closed_total_cost）只在「這次才第一次變成 sold」
 * 才會重新計算，之後只是價格更正不會重算，維持既有「售出當下封存」的
 * 設計。
 */
export async function syncCarStatusFromDeal(
  carId: string,
  dealStatus: DealStatus,
  dealFinalPrice?: number | null
) {
  if (dealStatus !== "signed" && dealStatus !== "delivered") return;
  if (!carId) return;

  try {
    const supabase = await createClient();
    const { data: car } = await supabase
      .from("cars")
      .select("status, purchase_price, transfer_fee, tax_amount")
      .eq("id", carId)
      .single();
    if (!car) return;

    const currentStatus = car.status as CarStatus;

    if (dealStatus === "delivered") {
      const updatePayload: Record<string, unknown> = {};

      if (dealFinalPrice != null) {
        updatePayload.final_price = dealFinalPrice;
      }

      if (currentStatus !== "sold") {
        const closingFields = await computeClosingFields(
          supabase,
          carId,
          currentStatus,
          "sold",
          Number(car.purchase_price),
          car.transfer_fee != null ? Number(car.transfer_fee) : null,
          car.tax_amount != null ? Number(car.tax_amount) : null
        );
        updatePayload.status = "sold";
        Object.assign(updatePayload, closingFields);
      }

      if (Object.keys(updatePayload).length === 0) return;

      const { error } = await supabase.from("cars").update(updatePayload).eq("id", carId);
      if (error) console.error(`[syncCarStatusFromDeal] 車輛 ${carId} 自動結帳失敗：`, error.message);
      return;
    }

    // dealStatus === "signed"：只從還沒被預訂的狀態推進，不覆蓋 reserved/sold。
    if (currentStatus === "preparing" || currentStatus === "in_stock") {
      const { error } = await supabase.from("cars").update({ status: "reserved" }).eq("id", carId);
      if (error) console.error(`[syncCarStatusFromDeal] 車輛 ${carId} 自動標記保留失敗：`, error.message);
    }
  } catch (e) {
    console.error(`[syncCarStatusFromDeal] 車輛 ${carId} 狀態同步發生未預期錯誤：`, e);
  }
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
