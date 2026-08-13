import { chromium } from "playwright";

const [email, password] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', password);
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

const bodyText = await page.innerText("body");
console.log("網址：", page.url());
console.log("是否顯示「帳號已被停權」：", bodyText.includes("帳號已被停權"));
console.log("是否還看得到後台功能（不應該）：", bodyText.includes("車輛進銷存"));

await browser.close();
