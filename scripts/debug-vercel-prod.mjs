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
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => consoleMsgs.push(`requestfailed: ${r.url()} - ${r.failure()?.errorText}`));
page.on("response", (r) => {
  if (r.url().includes("supabase.co") && !r.ok()) {
    consoleMsgs.push(`bad response: ${r.status()} ${r.url()}`);
  }
});

await page.goto(`${url}/login`, { waitUntil: "networkidle", timeout: 30000 });
await page.fill('input[name="email"]', env.SCRAPER_EMAIL);
await page.fill('input[name="password"]', env.SCRAPER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

const bodyText = await page.innerText("body");
console.log("頁面內容：\n", bodyText.slice(0, 600));
console.log("\n=== console/network ===");
console.log(consoleMsgs.join("\n"));

await browser.close();
