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

const url = "https://car-dealer-app-topaz.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`${url}/login`, { waitUntil: "networkidle", timeout: 30000 });
await page.fill('input[name="email"]', env.SCRAPER_EMAIL);
await page.fill('input[name="password"]', env.SCRAPER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

console.log("網址：", page.url());
console.log("是否成功進入 /dashboard：", page.url().includes("/dashboard"));
console.log("console errors:", consoleErrors.length ? consoleErrors : "none");

// 也順手確認公開展間（不需要登入）在正式環境正常
const page2 = await browser.newPage();
await page2.goto(`${url}/inventory?tenant=ab0a6bf8-c384-486c-a760-7b17556a751d`, { waitUntil: "networkidle", timeout: 30000 });
const bodyText = await page2.innerText("body");
console.log("\n/inventory 是否顯示車行名稱：", bodyText.includes("捷恒汽車"));
console.log("/inventory 是否顯示車輛：", /現正展示車輛（\d+ 台）/.test(bodyText));

await browser.close();
