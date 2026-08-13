// 把 1-scrape.mjs / 2-download-photos.mjs 準備好的資料寫進 Supabase：
//   1. 用 .env.local 的 anon key + SCRAPER_EMAIL/SCRAPER_PASSWORD 登入，
//      取得該帳號的 tenant_id（車行）—— 所有寫入都會走這個身分，
//      RLS 會自動限制只能寫進這個 tenant_id 底下。
//   2. 每輛車 insert 進 cars。
//   3. 把本機已下載好的照片依序上傳到 car-photos bucket，insert 進
//      car_photos，car.image_url 設成第一張照片的公開網址。
//
// 冪等：進度存在 data/import-map.json（vehicle_id -> {car_id, photos_done,
// status}），中斷重跑會：
//   - status "done" 的車輛整個跳過。
//   - status "car_created" 的車輛沿用既有 car_id，只補上傳還沒上傳的照片
//     （用本機檔案數 vs 已記錄的 photos_done 比對），不會重複建立車輛列。
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  IMPORT_MAP_JSON,
  PHOTOS_DIR,
  STATUS_MAP,
  VEHICLES_JSON,
  ensureDataDirs,
  loadEnvLocal,
  readJsonIfExists,
  writeJson,
} from "./lib.mjs";

const EXPECTED_TENANT_NAME = "捷恒汽車";

function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function joinTags(val) {
  if (!val) return null;
  const arr = Array.isArray(val) ? val : [val];
  const flat = arr
    .map((x) => (typeof x === "string" ? x : x?.name || x?.title || null))
    .filter(Boolean);
  return flat.length ? flat.join(",") : null;
}

/** 把爬到的一輛車資料轉成 cars 表要 insert 的欄位。
 * 注意：舊官網公開頁面本來就不會顯示收購成本/底價這些內部財務數字，
 * 所以 purchase_price 這裡固定填 0、floor_price/paid_amount 等成本欄位
 * 一律留 null —— 這些要車行自己之後在系統裡補上真實數字，不是這支腳本
 * 能從公開網站上抓到的資訊。同理，已售出車輛的結帳快照
 * （closed_at/closed_prep_cost/closed_total_cost）也不在這裡寫，維持
 * 系統原本「只有透過售出流程才會封存結帳數字」的設計，避免留下數字對不
 * 起來的假結帳紀錄。 */
function buildCarRow(v, tenantId) {
  const modelName = (v.vehicle_summary || v.model || "").trim() || v.model || "未命名車輛";
  return {
    tenant_id: tenantId,
    brand: v.brand || null,
    model_name: modelName,
    year: toIntOrNull(v.vehicle_year),
    license_year: null,
    mileage: toIntOrNull(v.mileage),
    engine_cc: toIntOrNull(v.displacement),
    transmission: v.transmission_system || null,
    color: v.vehicle_color || null,
    license_plate: v.advanced_info?.plate_number || null,
    vin: v.vin || null,
    registration_number: null,
    certification: v.document?.certification_unit || null,
    equipment_tags: joinTags(v.document?.optional_equipments) || joinTags(v.optional_info),
    condition_notes: v.vehicle_remarks || null,
    purchase_price: 0,
    transfer_fee: null,
    detailing_cost: null,
    repair_cost: null,
    floor_price: null,
    selling_price: v.price_info?.sale_price || null,
    final_price: null,
    paid_amount: null,
    payment_method: null,
    payment_note: null,
    transfer_date: null,
    transfer_status: null,
    inspection_agency: null,
    inspection_date: null,
    inspection_status: null,
    nominee_company: null,
    nominee_days: null,
    nominee_start_date: null,
    id_return_date: null,
    has_used_as_nominee: false,
    is_public: true,
    status: STATUS_MAP[v.status] ?? "in_stock",
  };
}

function localPhotoFiles(vehicleId) {
  const dir = path.join(PHOTOS_DIR, vehicleId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d+\./.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function guessContentType(file) {
  const ext = path.extname(file).toLowerCase();
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" }[ext] || "application/octet-stream";
}

async function uploadPhoto(supabase, tenantId, carId, filePath, index) {
  const buf = fs.readFileSync(filePath);
  const objectPath = `${tenantId}/${carId}/${Date.now()}-${index}${path.extname(filePath)}`;
  const { error } = await supabase.storage
    .from("car-photos")
    .upload(objectPath, buf, { contentType: guessContentType(filePath), upsert: false });
  if (error) throw new Error(`上傳照片失敗 (${objectPath})：${error.message}`);
  const { data } = supabase.storage.from("car-photos").getPublicUrl(objectPath);
  return data.publicUrl;
}

async function main() {
  ensureDataDirs();
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = env.SCRAPER_EMAIL;
  const password = env.SCRAPER_PASSWORD;

  if (!url || !anonKey) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY，請檢查 .env.local");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("缺少 SCRAPER_EMAIL / SCRAPER_PASSWORD，請先在 .env.local 加上這兩行（見 README）");
    process.exit(1);
  }

  const store = readJsonIfExists(VEHICLES_JSON, null);
  if (!store) {
    console.error(`找不到 ${VEHICLES_JSON}，請先跑 1-scrape.mjs`);
    process.exit(1);
  }

  const supabase = createClient(url, anonKey);

  console.log(`登入中... (${email})`);
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    console.error("登入失敗：", authError?.message);
    process.exit(1);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, name")
    .eq("id", authData.user.id)
    .single();
  if (profileError || !profile) {
    console.error("讀取 profile 失敗：", profileError?.message);
    process.exit(1);
  }
  if (!profile.tenant_id) {
    console.error("這個帳號沒有 tenant_id（不屬於任何車行），無法匯入。");
    process.exit(1);
  }

  const { data: tenant } = await supabase.from("tenants").select("id, name").eq("id", profile.tenant_id).single();
  console.log(`已登入：${profile.name || email}（${profile.role}），車行：${tenant?.name || profile.tenant_id}`);
  if (tenant?.name !== EXPECTED_TENANT_NAME) {
    console.warn(
      `⚠️ 這個帳號所屬車行是「${tenant?.name}」，跟預期的「${EXPECTED_TENANT_NAME}」不一樣。` +
        ` 如果這是故意的請忽略；如果不是，請確認登入的帳密是否正確，5 秒後會繼續匯入...`
    );
    await new Promise((r) => setTimeout(r, 5000));
  }

  const tenantId = profile.tenant_id;
  const map = readJsonIfExists(IMPORT_MAP_JSON, {});

  let created = 0;
  let skipped = 0;
  let photosUploaded = 0;
  let failed = 0;

  for (const v of store.vehicles) {
    const entry = map[v.id];
    if (entry?.status === "done") {
      skipped += 1;
      continue;
    }

    try {
      let carId = entry?.car_id;
      if (!carId) {
        const row = buildCarRow(v, tenantId);
        const { data: inserted, error: insertError } = await supabase
          .from("cars")
          .insert(row)
          .select("id")
          .single();
        if (insertError) throw new Error(`insert cars 失敗：${insertError.message}`);
        carId = inserted.id;
        map[v.id] = { car_id: carId, status: "car_created", photos_done: 0 };
        writeJson(IMPORT_MAP_JSON, map);
        created += 1;
        console.log(`  ✓ 建立車輛 ${v.brand} ${v.model} (${v.id}) -> ${carId}`);
      }

      const files = localPhotoFiles(v.id);
      const alreadyDone = map[v.id].photos_done || 0;
      let firstUrl = null;
      for (let i = alreadyDone; i < files.length; i++) {
        const publicUrl = await uploadPhoto(supabase, tenantId, carId, files[i], i);
        if (i === 0) firstUrl = publicUrl;
        const { error: photoError } = await supabase
          .from("car_photos")
          .insert({ tenant_id: tenantId, car_id: carId, url: publicUrl, sort_order: i });
        if (photoError) throw new Error(`insert car_photos 失敗 (index ${i})：${photoError.message}`);
        photosUploaded += 1;
        map[v.id].photos_done = i + 1;
        writeJson(IMPORT_MAP_JSON, map);
      }

      if (files.length > 0 && alreadyDone === 0) {
        // 第一次上傳完照片，把 image_url 設成第一張照片（相簿的主圖）。
        await supabase.from("cars").update({ image_url: firstUrl }).eq("id", carId);
      }

      map[v.id].status = "done";
      writeJson(IMPORT_MAP_JSON, map);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ 車輛 ${v.id} (${v.brand} ${v.model}) 失敗：${e.message}`);
    }
  }

  console.log("\n=== 匯入完成 ===");
  console.log(`新建車輛：${created}`);
  console.log(`已跳過（先前已完成）：${skipped}`);
  console.log(`上傳照片：${photosUploaded}`);
  console.log(`失敗：${failed}（可直接重跑這支腳本，會自動接續未完成的部分）`);
}

main().catch((err) => {
  console.error("匯入失敗：", err);
  process.exit(1);
});
