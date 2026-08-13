// 讀 1-scrape.mjs 產出的 vehicles.json，把每輛車相簿裡的照片下載到本機
// data/photos/<vehicle_id>/<兩位數序號>.jpg，之後 3-import.mjs 再從本機
// 檔案上傳到 Supabase Storage（不會佔用舊官網的頻寬兩次）。
//
// 冪等：檔案已經存在且大小 > 0 就跳過，可以放心中斷重跑，不會重新下載已經
// 抓過的照片。
import fs from "node:fs";
import path from "node:path";
import { request } from "playwright";
import { PHOTOS_DIR, VEHICLES_JSON, ensureDataDirs, readJsonIfExists, sleep } from "./lib.mjs";

const CONCURRENCY = 6;
const DELAY_MS = 50;

function extFromUrl(url) {
  const m = /\.(jpg|jpeg|png|webp|gif)(?:\?|$)/i.exec(url);
  return m ? m[1].toLowerCase() : "jpg";
}

async function downloadOne(ctx, url, destPath) {
  const res = await ctx.get(url);
  if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
  const buf = await res.body();
  fs.writeFileSync(destPath, buf);
}

async function main() {
  ensureDataDirs();
  const store = readJsonIfExists(VEHICLES_JSON, null);
  if (!store) {
    console.error(`找不到 ${VEHICLES_JSON}，請先跑 1-scrape.mjs`);
    process.exit(1);
  }

  const jobs = [];
  for (const v of store.vehicles) {
    const images = v.advanced_info?.vehicle_images || [];
    const dir = path.join(PHOTOS_DIR, v.id);
    fs.mkdirSync(dir, { recursive: true });
    images.forEach((img, i) => {
      const dest = path.join(dir, `${String(i).padStart(2, "0")}.${extFromUrl(img.url)}`);
      jobs.push({ url: img.url, dest, vehicleId: v.id });
    });
  }

  const todo = jobs.filter((j) => !fs.existsSync(j.dest) || fs.statSync(j.dest).size === 0);
  console.log(`共 ${jobs.length} 張照片，${jobs.length - todo.length} 張已下載過，還要下載 ${todo.length} 張。`);

  const ctx = await request.newContext();
  try {
    let done = 0;
    let failed = 0;
    let idx = 0;
    async function worker() {
      for (;;) {
        const i = idx++;
        if (i >= todo.length) return;
        const job = todo[i];
        try {
          await downloadOne(ctx, job.url, job.dest);
        } catch (e) {
          failed += 1;
          console.warn(`  ⚠️ 下載失敗 ${job.vehicleId} <- ${job.url}：${e.message}`);
        }
        done += 1;
        if (done % 50 === 0 || done === todo.length) {
          console.log(`  下載進度 ${done}/${todo.length}（失敗 ${failed}）`);
        }
        await sleep(DELAY_MS);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`✅ 完成。失敗 ${failed} 張（可重跑這支腳本補下載失敗的部分）。`);
  } finally {
    await ctx.dispose();
  }
}

main().catch((err) => {
  console.error("下載失敗：", err);
  process.exit(1);
});
