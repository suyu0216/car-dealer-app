import { chromium } from "playwright";

const stamp = Date.now();
const email = `superadmin-test-${stamp}@example.com`;
const password = "TestPass123!";
const companyName = `super-admin-test-shell-${stamp}`;

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
const signupToggle = page.locator('button:has-text("註冊"), a:has-text("註冊")').first();
if ((await signupToggle.count()) > 0) {
  await signupToggle.click();
  await page.waitForTimeout(300);
}
await page.fill('input[name="companyName"]', companyName);
const nameField = page.locator('input[name="name"]');
if ((await nameField.count()) > 0) await nameField.fill("Super Admin Test");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
const confirmField = page.locator('input[name="confirmPassword"]');
if ((await confirmField.count()) > 0) await confirmField.fill(password);
await page.click('button[type="submit"]');
await page.waitForURL("**/dashboard", { timeout: 15000 });

console.log("email:", email);
console.log("password:", password);

await browser.close();
