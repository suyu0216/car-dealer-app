import { chromium } from "playwright";

const [adminEmail, adminPassword, targetTenantName] = process.argv.slice(2);
if (!adminEmail || !adminPassword || !targetTenantName) {
  console.error("用法：node scripts/e2e-superadmin-approve.mjs <admin email> <admin password> <目標車行名稱片段>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', adminEmail);
await page.fill('input[name="password"]', adminPassword);
await page.click('button[type="submit"]');
await page.waitForURL("**/super-admin", { timeout: 15000 });
console.log("✓ 以 super_admin 身分登入，進入 /super-admin");

await page.waitForSelector("text=待審核車商");
const pendingCountText = await page.locator("text=待審核車商").locator("xpath=following-sibling::p").innerText().catch(() => null);
console.log("待審核車商統計卡片：", pendingCountText);

// 找到目標車行那一列
const row = page.locator("tr", { hasText: targetTenantName });
await row.waitFor({ timeout: 10000 });
const rowText = await row.innerText();
console.log("\n目標車行那一列（核准前）：\n", rowText.replace(/\n+/g, " | "));

await row.locator('button:has-text("核准開通")').click();
await page.waitForTimeout(1500);

const rowTextAfter = await row.innerText();
console.log("\n目標車行那一列（核准後）：\n", rowTextAfter.replace(/\n+/g, " | "));

console.log("\nconsole errors:", consoleErrors.length ? consoleErrors : "none");
await browser.close();
