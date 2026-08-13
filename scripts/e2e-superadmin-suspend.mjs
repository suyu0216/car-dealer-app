import { chromium } from "playwright";

const [adminEmail, adminPassword, targetTenantName] = process.argv.slice(2);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("dialog", (d) => d.accept()); // 接受 window.confirm() 的停權確認對話框

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', adminEmail);
await page.fill('input[name="password"]', adminPassword);
await page.click('button[type="submit"]');
await page.waitForURL("**/super-admin", { timeout: 15000 });

const row = page.locator("tr", { hasText: targetTenantName });
await row.waitFor({ timeout: 10000 });
await row.locator('button:has-text("停權")').click();
await page.waitForTimeout(1500);

const rowText = await row.innerText();
console.log("停權後那一列：", rowText.replace(/\n+/g, " | "));

await browser.close();
