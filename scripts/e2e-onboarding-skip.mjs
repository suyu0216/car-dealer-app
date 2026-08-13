import { chromium } from "playwright";

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("用法：node scripts/e2e-onboarding-skip.mjs <email> <password>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard", { timeout: 15000 });
await page.waitForSelector("text=歡迎加入", { timeout: 10000 });
console.log("✓ 再次登入仍看到 Onboarding 精靈（符合預期，因為還沒完成過）");

await page.click('button:has-text("稍後再設定")');
await page.waitForTimeout(2000);

const bodyText = await page.innerText("body");
const stillWizard = bodyText.includes("歡迎加入");
const hasPendingBanner = bodyText.includes("等待平台審核");
const hasDashboard = bodyText.includes("車輛進銷存");

console.log("略過後還在 Wizard（應為 false）：", stillWizard);
console.log("看到後台正常畫面（應為 true）：", hasDashboard);
console.log("看到 pending 提示條（應為 true）：", hasPendingBanner);

await browser.close();
