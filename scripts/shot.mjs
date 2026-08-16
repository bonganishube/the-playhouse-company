import puppeteer from "puppeteer-core";

const [url, out, w = "1440", h = "800"] = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle2" });
await page.screenshot({ path: out });
await browser.close();
console.log("wrote", out);
