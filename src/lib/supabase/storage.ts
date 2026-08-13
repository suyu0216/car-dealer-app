// 注意：這個專案沒有安裝 `server-only` 套件（先前拿掉過，見 client.ts /
// server.ts 的說明），這裡故意不 import 它，避免建置時噴 module not found。
import type { SupabaseClient } from "@supabase/supabase-js";

// 上傳路徑一律是 "<tenant_id>/<car_id>/<時間戳記>-<檔名>"，跟
// supabase_schema.sql 裡 storage.objects 的 RLS policy
// （用 storage.foldername(name) 比對第一層資料夾）搭配使用，
// 確保每個車行只能碰自己上傳的檔案。
function buildObjectPath(tenantId: string, carId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${tenantId}/${carId}/${Date.now()}-${safeName}`;
}

/** 品牌 Logo 沒有對應的 car_id，路徑固定放在 "<tenant_id>/branding/..."—— 一樣落在
 * 自己車行的資料夾第一層底下，car-photos 的 RLS policy 不用另外處理。 */
function buildBrandingObjectPath(tenantId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${tenantId}/branding/${Date.now()}-${safeName}`;
}

/**
 * 上傳車輛照片到公開的 car-photos bucket，回傳可以直接當 <img src> 用的公開網址。
 * 整段包 try/catch：Supabase SDK 正常情況下會把錯誤放在回傳值的 error 欄位，
 * 但網路異常等情況仍可能直接丟出例外，這裡一律接住、轉成統一的
 * { url: null, error } 格式，確保呼叫端（Server Action）不會被未捕捉的例外
 * 整個中斷，導致表單卡住或整頁報錯。
 */
export async function uploadCarPhoto(
  supabase: SupabaseClient,
  tenantId: string,
  carId: string,
  file: File | null
): Promise<{ url: string | null; error: string | null }> {
  if (!file || file.size === 0) {
    return { url: null, error: null };
  }

  try {
    const path = buildObjectPath(tenantId, carId, file);
    const { error } = await supabase.storage
      .from("car-photos")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) {
      return { url: null, error: error.message };
    }

    const { data } = supabase.storage.from("car-photos").getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "照片上傳時發生未預期的錯誤。" };
  }
}

/**
 * 上傳車行 Logo 到公開的 car-photos bucket（沿用同一個 bucket、同一套已經
 * 做好租戶隔離的 storage policy，不用另開新 bucket），回傳可以直接當
 * <img src> 用的公開網址。錯誤處理方式跟 uploadCarPhoto() 一致。
 */
export async function uploadTenantLogo(
  supabase: SupabaseClient,
  tenantId: string,
  file: File | null
): Promise<{ url: string | null; error: string | null }> {
  if (!file || file.size === 0) {
    return { url: null, error: null };
  }

  try {
    const path = buildBrandingObjectPath(tenantId, file);
    const { error } = await supabase.storage
      .from("car-photos")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) {
      return { url: null, error: error.message };
    }

    const { data } = supabase.storage.from("car-photos").getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : "Logo 上傳時發生未預期的錯誤。" };
  }
}

/**
 * 上傳維修單據/發票到私有的 repair-evidences bucket，回傳物件路徑（不是網址）。
 * 同樣整段包 try/catch，理由同上。
 */
export async function uploadReceiptFile(
  supabase: SupabaseClient,
  tenantId: string,
  carId: string,
  file: File | null
): Promise<{ path: string | null; error: string | null }> {
  if (!file || file.size === 0) {
    return { path: null, error: null };
  }

  try {
    const path = buildObjectPath(tenantId, carId, file);
    const { error } = await supabase.storage
      .from("repair-evidences")
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) {
      return { path: null, error: error.message };
    }

    return { path, error: null };
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : "憑證上傳時發生未預期的錯誤。" };
  }
}

/**
 * 批次幫一批私有憑證物件簽發短效期（預設 1 小時）的 signed URL。
 * 這只是用來「顯示」既有憑證，失敗就靜靜回傳空物件（該筆憑證顯示不出來），
 * 不應該讓整頁 Server Component 崩潰，所以一樣包 try/catch。
 */
export async function createReceiptSignedUrls(
  supabase: SupabaseClient,
  paths: string[],
  expiresInSeconds = 3600
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  try {
    const { data, error } = await supabase.storage
      .from("repair-evidences")
      .createSignedUrls(paths, expiresInSeconds);

    if (error || !data) return {};

    const map: Record<string, string> = {};
    for (const item of data) {
      if (item.signedUrl && item.path) {
        map[item.path] = item.signedUrl;
      }
    }
    return map;
  } catch {
    return {};
  }
}
