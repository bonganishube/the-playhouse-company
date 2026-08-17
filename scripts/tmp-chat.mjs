import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle2" });

// Open via the launcher, exactly as a visitor would.
await page.evaluate(() => [...document.querySelectorAll("button")].find(b => /Ask about booking/.test(b.innerText)).click());
await page.waitForSelector('input[aria-label="Message"]', { timeout: 15000 });

async function say(text) {
  await page.type('input[aria-label="Message"]', text);
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Send").click());
  await page.waitForFunction(() => !document.body.innerText.includes("Checking…"), { timeout: 90000 });
  const msgs = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] p')].map(p => p.innerText.trim()));
  console.log(`\n> ${text}\n  ${msgs.at(-2)?.slice(0, 400).replace(/\n/g, "\n  ")}`);
}

await say("What rehearsal rooms do you have and what do they cost?");
await say("Is Room 503 free on 15 October 2026? I need 2 hours in the morning.");
await page.screenshot({ path: process.argv[2] });
console.log("\nscreenshot written");
await browser.close();
