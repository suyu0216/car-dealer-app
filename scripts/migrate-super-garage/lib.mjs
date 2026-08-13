// 共用常數與小工具，給 1-scrape.mjs / 2-download-photos.mjs / 3-import.mjs 用。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(DIR, "data");
export const PHOTOS_DIR = path.join(DATA_DIR, "photos");
export const VEHICLES_JSON = path.join(DATA_DIR, "vehicles.json");
export const IMPORT_MAP_JSON = path.join(DATA_DIR, "import-map.json");

export const STORE_WEBSITE = "JHC";
export const API_BASE = "https://dashboard2.super-garage.com.tw/api/car_dealer_front";

// 舊官網 status(數字) -> 新系統 CarStatus 的對應。
// 0 = 上架中(在庫), 1 = 已保留, 2 = 已售出(賀成交) —— 從 filter-list 數量
// 統計 + 列表頁「賀成交」字樣比對確認過，見遷移紀錄。
export const STATUS_MAP = { 0: "in_stock", 1: "reserved", 2: "sold" };

export function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

export function readJsonIfExists(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

export function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 讀 .env.local（純 KEY=VALUE，不處理引號/多行值——這個專案的 .env.local 一直都是這種簡單格式）。 */
export function loadEnvLocal() {
  const envPath = path.join(DIR, "..", "..", ".env.local");
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return { ...env, ...process.env };
}
