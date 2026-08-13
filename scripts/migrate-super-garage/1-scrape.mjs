// 用 Playwright 的 APIRequestContext 呼叫超級車庫(super-garage.com.tw)的
// 前台 JSON API，把捷恒汽車(JHC)全部車輛的完整資料（含相簿照片網址）抓下來。
//
// 這個網站的前台其實是 SPA，畫面資料都是靠 JS fetch
// dashboard2.super-garage.com.tw/api/car_dealer_front/... 這組公開 API
// 拿到的（沒有登入驗證），比起用 Playwright 操作瀏覽器逐頁點擊、解析 DOM
// 穩定很多，也不會因為改版換 class name 就爬不到 —— 用 request context
// 而不是完整開瀏覽器，一樣是 Playwright，但快非常多。
//
// vehicle/list 一次就會回傳所有欄位「跟」相簿照片網址（advanced_info.
// vehicle_images），但缺 vin / 配備 / 認證報告這幾個欄位，所以每輛車再補打
// 一次 vehicle/info?id=... 補齊。
import { request } from "playwright";
import {
  API_BASE,
  STORE_WEBSITE,
  VEHICLES_JSON,
  ensureDataDirs,
  sleep,
  writeJson,
} from "./lib.mjs";

const CONCURRENCY = 4;
const DELAY_MS = 150; // 每輛車detail request之間的小延遲，避免對舊站造成負擔

async function fetchVehicleList(ctx) {
  const all = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const res = await ctx.post(`${API_BASE}/vehicle/list`, {
      data: { page, per_page: perPage, store_website: STORE_WEBSITE },
    });
    if (!res.ok()) {
      throw new Error(`vehicle/list 失敗：HTTP ${res.status()}`);
    }
    const json = await res.json();
    if (!json.success) throw new Error(`vehicle/list 回傳 success=false`);
    all.push(...json.data);
    console.log(`  已抓清單第 ${page} 頁，累計 ${all.length}/${json.total} 輛`);
    if (all.length >= json.total || json.data.length === 0) break;
    page += 1;
  }
  return all;
}

/** 判斷一個值是不是「空」（null/undefined/空字串/空陣列），用來決定合併 list
 * 跟 detail 兩份回應時要留哪一邊——這兩個 API 對同一個欄位有時候型別/內容
 * 不一致（例如 optional_info 在 list 是有內容的陣列，detail 卻固定回空
 * 字串），不能單純用「後面蓋前面」的 object spread，會把 list 裡才有的
 * 真實資料蓋掉。 */
function isEmptyValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return val.trim() === "";
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/** 合併 list、detail 兩份同一輛車的資料：同一個 key 兩邊都有值時，優先留
 * 「非空」的那一邊；都非空則 detail 較新/較完整優先。 */
function mergeVehicle(listItem, detailItem) {
  if (!detailItem) return listItem;
  const merged = { ...listItem };
  for (const [key, detailVal] of Object.entries(detailItem)) {
    if (key === "advanced_info") {
      merged.advanced_info = mergeVehicle(listItem.advanced_info || {}, detailVal || {});
      continue;
    }
    merged[key] = isEmptyValue(detailVal) && !isEmptyValue(listItem[key]) ? listItem[key] : detailVal;
  }
  return merged;
}

async function fetchVehicleDetail(ctx, id) {
  const res = await ctx.get(`${API_BASE}/vehicle/info`, { params: { id } });
  if (!res.ok()) {
    console.warn(`  ⚠️ 車輛 ${id} 詳情抓取失敗：HTTP ${res.status()}，只會用列表資料`);
    return null;
  }
  const json = await res.json();
  if (!json.success) {
    console.warn(`  ⚠️ 車輛 ${id} 詳情回傳 success=false，只會用列表資料`);
    return null;
  }
  return json.data;
}

async function main() {
  ensureDataDirs();
  console.log(`開始抓取 ${STORE_WEBSITE} 的車輛資料...`);

  const ctx = await request.newContext();
  try {
    const list = await fetchVehicleList(ctx);
    console.log(`清單抓取完成，共 ${list.length} 輛車，開始補抓每輛車的詳情...`);

    const merged = new Array(list.length);
    let done = 0;
    let idx = 0;
    async function worker() {
      for (;;) {
        const i = idx++;
        if (i >= list.length) return;
        const v = list[i];
        const detail = await fetchVehicleDetail(ctx, v.id);
        merged[i] = mergeVehicle(v, detail);
        done += 1;
        if (done % 10 === 0 || done === list.length) {
          console.log(`  詳情進度 ${done}/${list.length}`);
        }
        await sleep(DELAY_MS);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    writeJson(VEHICLES_JSON, {
      scraped_at: new Date().toISOString(),
      store_website: STORE_WEBSITE,
      count: merged.length,
      vehicles: merged,
    });

    const totalImages = merged.reduce(
      (sum, v) => sum + (v.advanced_info?.vehicle_images?.length || 0),
      0
    );
    console.log(`✅ 完成！已存到 ${VEHICLES_JSON}`);
    console.log(`   共 ${merged.length} 輛車、${totalImages} 張照片網址。`);
  } finally {
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error("爬取失敗：", err);
  process.exit(1);
});
