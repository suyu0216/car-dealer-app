"use server";

import { revalidatePath } from "next/cache";
import { requireTenantUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadIdentityDocuments, createIdentityDocumentSignedUrls } from "@/lib/supabase/storage";
import { VALID_CUSTOMER_TYPES } from "@/lib/supabase/types";
import type { CustomerFollowUpStatus } from "@/lib/supabase/types";

export interface CustomerFormState {
  error?: string;
  success?: boolean;
  /** 2026-09-06 新增：跟 cars-actions.ts 的 CarFormState 同一套設計——
   * 客戶本身已經新增/更新成功，但證件照片上傳失敗，用非阻斷性警告
   * 讓使用者知道要回來補傳，不會擋住表單關閉。 */
  warning?: string;
}

const VALID_STATUSES: CustomerFollowUpStatus[] = [
  "new",
  "test_drive_followup",
  "deposit_received",
  "delivery_care",
];

/** 2026-09-06 新增：客戶證件照片一次最多上傳 10 張——前端表單 UI 上會
 * 提示，這裡是伺服器端不可被繞過的第二道防線。 */
const MAX_CUSTOMER_ID_PHOTOS = 10;

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

function parseCustomerForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("follow_up_status") ?? "new");
  const customerType = String(formData.get("customer_type") ?? "個人");

  if (!name) {
    throw new Error("請輸入客戶姓名。");
  }
  if (!VALID_STATUSES.includes(status as CustomerFollowUpStatus)) {
    throw new Error("跟進狀態不正確。");
  }
  if (!VALID_CUSTOMER_TYPES.includes(customerType as (typeof VALID_CUSTOMER_TYPES)[number])) {
    throw new Error("客戶類型不正確。");
  }

  return {
    name,
    phone: optionalText(formData, "phone"),
    interested_model: optionalText(formData, "interested_model"),
    budget_min: optionalMoney(formData, "budget_min", "預算下限"),
    budget_max: optionalMoney(formData, "budget_max", "預算上限"),
    follow_up_status: status as CustomerFollowUpStatus,
    line_id: optionalText(formData, "line_id"),
    note: optionalText(formData, "note"),
    // 2026-09-06 新增：客戶分類（個人／公司／車商），跟競品 Hocar 比較
    // 後補上，見 types.ts 對 Customer.customer_type 的說明。
    customer_type: customerType as (typeof VALID_CUSTOMER_TYPES)[number],
  };
}

export async function createCustomer(
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  const { profile } = await requireTenantUser();

  let values;
  try {
    values = parseCustomerForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  // owner_profile_id 一律填目前登入者，不開放前端表單自己指定——客戶
  // 資料隱私保護（見 supabase_schema.sql 的 customers RLS policy）要靠
  // 這欄準確反映「這筆客戶名單真的是誰開發、建立的」，不能讓使用者假冒
  // 別人名下建立客戶。
  const { data: inserted, error } = await supabase
    .from("customers")
    .insert({ ...values, tenant_id: profile.tenant_id!, owner_profile_id: profile.id })
    .select("id")
    .single();

  if (error || !inserted) {
    return { error: `新增客戶失敗：${error?.message ?? "未知錯誤"}` };
  }

  // 2026-09-06 新增：證件照片是「錦上添花」的第二步驟，跟 cars-actions.ts
  // 的車輛照片一樣——上傳失敗只警告，不擋客戶本身已經新增成功這件事。
  const warning = await uploadCustomerIdPhotos(
    supabase,
    profile.tenant_id!,
    profile.id,
    inserted.id,
    formData,
    0
  );

  revalidatePath("/dashboard");
  return { success: true, warning };
}

/**
 * 2026-09-06 新增：把表單裡的 "id_photos" 檔案上傳到私有的
 * identity-documents bucket，並寫進 customer_id_photos 表——
 * createCustomer／updateCustomer 共用同一段邏輯，`startSortOrder`
 * 是編輯模式下已有照片時要接續的排序起點（新增模式固定是 0）。
 * owner_profile_id 直接沿用這筆客戶本身的 owner，不開放前端指定，
 * 跟 customers 資料表的隱私保護模型保持一致。
 */
async function uploadCustomerIdPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ownerProfileId: string | null,
  customerId: string,
  formData: FormData,
  startSortOrder: number
): Promise<string | undefined> {
  const files = formData.getAll("id_photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return undefined;

  if (files.length > MAX_CUSTOMER_ID_PHOTOS) {
    return `客戶已成功儲存，但一次最多只能上傳 ${MAX_CUSTOMER_ID_PHOTOS} 張證件照片，請分次上傳其餘照片。`;
  }

  try {
    const results = await uploadIdentityDocuments(supabase, tenantId, "customer", customerId, files);
    const uploaded = results.filter((r): r is { path: string; error: null; fileName: string } => r.path != null);
    const failed = results.filter((r) => r.path == null);

    if (uploaded.length > 0) {
      await supabase.from("customer_id_photos").insert(
        uploaded.map((u, i) => ({
          tenant_id: tenantId,
          customer_id: customerId,
          owner_profile_id: ownerProfileId,
          path: u.path,
          sort_order: startSortOrder + i,
        }))
      );
    }

    if (failed.length > 0) {
      console.error(
        `[uploadCustomerIdPhotos] ${failed.length} 張證件照片上傳失敗（客戶 ${customerId}）：${failed.map((f) => f.fileName).join("、")}`
      );
      return `客戶已成功儲存，但有 ${failed.length} 張證件照片上傳失敗，請稍後重新嘗試。`;
    }
  } catch (e) {
    console.error(`[uploadCustomerIdPhotos] 證件照片上傳發生未預期錯誤（客戶 ${customerId}）：`, e);
    return "客戶已成功儲存，但證件照片上傳發生未預期錯誤，請稍後重新嘗試。";
  }

  return undefined;
}

export async function updateCustomer(
  _prevState: CustomerFormState | undefined,
  formData: FormData
): Promise<CustomerFormState> {
  const { profile } = await requireTenantUser();

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { error: "缺少客戶 ID，無法更新。" };
  }

  let values;
  try {
    values = parseCustomerForm(formData);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "表單資料不正確。" };
  }

  const supabase = await createClient();
  const { data: existingCustomer, error } = await supabase
    .from("customers")
    .update(values)
    .eq("id", id)
    .select("owner_profile_id")
    .single();

  if (error) {
    return { error: `更新客戶失敗：${error.message}` };
  }

  // 2026-09-06 新增：新上傳的證件照片接在既有相簿「後面」，不能整批固定
  // 從 sort_order 0 開始，理由跟 cars-actions.ts 的車輛照片一致。
  let photoWarning: string | undefined;
  const files = formData.getAll("id_photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 0) {
    const { data: existingPhotos } = await supabase
      .from("customer_id_photos")
      .select("id")
      .eq("customer_id", id);
    if ((existingPhotos?.length ?? 0) + files.length > MAX_CUSTOMER_ID_PHOTOS) {
      photoWarning = `客戶已成功更新，但這位客戶目前已有 ${existingPhotos?.length ?? 0} 張證件照片，加上這次要上傳的會超過 ${MAX_CUSTOMER_ID_PHOTOS} 張上限，這次的照片沒有上傳，請先移除幾張既有照片再試一次。`;
    } else {
      const { data: sorted } = await supabase
        .from("customer_id_photos")
        .select("sort_order")
        .eq("customer_id", id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextSortOrder = (sorted?.[0]?.sort_order ?? -1) + 1;
      photoWarning = await uploadCustomerIdPhotos(
        supabase,
        profile.tenant_id!,
        existingCustomer?.owner_profile_id ?? profile.id,
        id,
        formData,
        nextSortOrder
      );
    }
  }

  revalidatePath("/dashboard");
  return { success: true, warning: photoWarning };
}

/**
 * 2026-09-06 新增：查一位客戶目前的證件照片，並幫每張現查現簽短效期
 * signed URL，做法跟 cars-actions.ts 的 getCarSellerIdPhotos() 一致，
 * 只在 customer-form-modal.tsx 開啟「編輯」某位客戶時才呼叫。RLS
 * （customer_id_photos_owner_or_tenant_admin）已經確保一般員工只查得到
 * 自己名下客戶的證件照，老闆例外看得到全部。
 */
export async function getCustomerIdPhotos(customerId: string): Promise<{ id: string; url: string }[]> {
  await requireTenantUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("customer_id_photos")
    .select("id, path")
    .eq("customer_id", customerId)
    .order("sort_order", { ascending: true });

  const photos = data ?? [];
  if (photos.length === 0) return [];

  const urls = await createIdentityDocumentSignedUrls(
    supabase,
    photos.map((p) => p.path)
  );

  return photos.filter((p) => urls[p.path]).map((p) => ({ id: p.id, url: urls[p.path] }));
}

/** 2026-09-06 新增：移除一張客戶證件照片（連同 storage 裡的物件一起
 * 刪除）。RLS 已經限制只能刪到自己看得到的資料列（自己名下客戶，或
 * 老闆看全部），這裡不用再另外檢查。 */
export async function deleteCustomerIdPhoto(photoId: string) {
  await requireTenantUser();
  const supabase = await createClient();

  const { data: photo } = await supabase
    .from("customer_id_photos")
    .select("path")
    .eq("id", photoId)
    .maybeSingle();

  await supabase.from("customer_id_photos").delete().eq("id", photoId);

  if (photo?.path) {
    await supabase.storage.from("identity-documents").remove([photo.path]);
  }

  revalidatePath("/dashboard");
  return { success: true };
}
