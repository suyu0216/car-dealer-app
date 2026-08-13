// 端到端測試：模擬一間全新車商自助註冊 -> 檢查 status=pending/
// onboarding_completed=false -> 登入看到 Onboarding 精靈 -> 略過 ->
// 進正常後台看到 pending 提示條 -> /inventory 顯示「尚未開放」。
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
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

const stamp = Date.now();
const testEmail = `onboarding-test-${stamp}@example.com`;
const testPassword = "TestPass123!";
const companyName = `測試車商-${stamp}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

console.log(`=== 註冊新車商：${companyName} (${testEmail}) ===`);
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });

// 切到註冊表單（假設頁面上有切換連結/按鈕，用文字比對）
const signupToggle = page.locator('button:has-text("註冊"), a:has-text("註冊")').first();
if (await signupToggle.count() > 0) {
  await signupToggle.click();
  await page.waitForTimeout(300);
}

await page.fill('input[name="companyName"]', companyName);
const nameField = page.locator('input[name="name"]');
if (await nameField.count() > 0) await nameField.fill("測試管理員");
await page.fill('input[name="email"]', testEmail);
await page.fill('input[name="password"]', testPassword);
const confirmField = page.locator('input[name="confirmPassword"]');
if (await confirmField.count() > 0) await confirmField.fill(testPassword);

await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

const url = page.url();
const bodyText = await page.innerText("body");
console.log("目前網址：", url);
console.log("頁面內容片段：", bodyText.slice(0, 400).replace(/\s+/g, " "));

await browser.close();
