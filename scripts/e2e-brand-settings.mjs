// 真的透過 /login 登入 + 開後台「品牌設定」分頁 + 填資料 + 上傳 Logo +
// 儲存，確認整條路（表單 -> Server Action -> RLS -> DB）都通。
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
console.log("✓ 登入成功");

await page.click('button:has-text("品牌設定")');
await page.waitForSelector("text=車行品牌設定", { timeout: 10000 });
console.log("✓ 進入品牌設定分頁");

const logoPath = path.join(DIR, "migrate-super-garage", "data", "photos", "V2026081200012", "00.jpg");
await page.setInputFiles('input[name="logo"]', logoPath);

await page.fill('input[name="phone"]', "03-535-5216");
await page.fill('input[name="address"]', "新竹市東區經國路一段289號");
await page.fill('input[name="business_hours"]', "週一至週日 09:30-23:00");
await page.fill('input[name="line_id"]', "@687lwemu");
console.log("✓ 已填寫表單");

await page.click('button[type="submit"]:has-text("儲存變更")');
await page.waitForSelector("text=已儲存", { timeout: 15000 });
console.log("✓ 儲存成功，畫面顯示「已儲存」");

console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
await browser.close();
