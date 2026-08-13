// 真的透過 /login 登入 + 開後台編輯車輛表單 + 上傳一張真實照片，確認
// Storage RLS 修好之後，真實使用者的正常上傳流程（不是我自己模擬的
// storage.upload() 呼叫）沒有被誤傷——這正是原本放寬 RLS 的理由。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
function loadEnvLocal() {
  const envPath = path.join(DIR, "..", ".env.local");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return { ...env, ...process.env };
}
const env = loadEnvLocal();

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', env.SCRAPER_EMAIL);
await page.fill('input[name="password"]', env.SCRAPER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard", { timeout: 15000 });
console.log("✓ 登入成功，進入 /dashboard");

// 切到表格檢視比較好抓第一列，點第一輛車開詳情，再點編輯
await page.waitForSelector("text=車輛進銷存");
await page.click("text=☰ 清單表格");
await page.waitForTimeout(500);
const firstRow = page.locator("table tbody tr").first();
await firstRow.click();
await page.waitForSelector("text=編輯車輛", { timeout: 10000 });
await page.click("text=編輯車輛");
await page.waitForSelector('input[name="photo"]', { timeout: 10000 });
console.log("✓ 開啟編輯表單");

const photoPath = path.join(DIR, "migrate-super-garage", "data", "photos", "V2026081200012", "00.jpg");
await page.setInputFiles('input[name="photo"]', photoPath);
console.log("✓ 已選擇照片檔案：", photoPath);

await page.click('button[type="submit"]:has-text("儲存")');
await page.waitForTimeout(2500);

// 表單送出後應該關閉 modal（沒有殘留的錯誤訊息），且不應該跳出「照片上傳失敗」的 toast
const stillOpen = await page.locator('input[name="photo"]').isVisible().catch(() => false);
const warningToast = await page.locator("text=照片上傳失敗").isVisible().catch(() => false);
const warningToast2 = await page.locator("text=發生未預期錯誤").isVisible().catch(() => false);

console.log("\n表單是否還開著（應為 false）：", stillOpen);
console.log("是否出現照片上傳失敗提示（應為 false）：", warningToast || warningToast2);
console.log("console errors:", consoleErrors.length ? consoleErrors : "none");

if (!stillOpen && !warningToast && !warningToast2) {
  console.log("\n✅ 真實使用者上傳流程正常，Storage RLS 修復沒有誤傷合法上傳。");
} else {
  console.log("\n❌ 疑似有問題，需要進一步檢查。");
}

await browser.close();
