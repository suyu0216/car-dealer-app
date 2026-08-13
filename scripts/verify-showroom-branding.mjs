import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 500 } });
await page.goto("http://localhost:3000/inventory?tenant=ab0a6bf8-c384-486c-a760-7b17556a751d", {
  waitUntil: "networkidle",
});
await page.waitForSelector("text=捷恒汽車");
await page.screenshot({ path: "C:\\Users\\User\\Desktop\\car-dealer-app\\scripts\\showroom-header.png" });

const headerText = await page.locator("header").innerText();
console.log(headerText);

const logoVisible = await page.locator('header img[alt="捷恒汽車 Logo"]').isVisible();
console.log("\nLogo 顯示：", logoVisible);

await browser.close();
