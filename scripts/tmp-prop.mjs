import puppeteer from "puppeteer-core";
const S = process.argv[2];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
for (const [scheme, name] of [["light","light"],["dark","dark"]]) {
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }]);
  await p.setViewport({ width: 1100, height: 1400, deviceScaleFactor: 2 });
  await p.goto("file://" + S + "/playhouse-proposal.html", { waitUntil: "networkidle0" });
  const health = await p.evaluate(() => ({
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    height: document.body.scrollHeight,
  }));
  console.log(`${name}: bg=${health.bodyBg} text=${health.bodyColor} h-overflow=${health.overflow}px page=${health.height}px`);
  await p.screenshot({ path: `${S}/prop-${name}.png` });
  await p.close();
}
// Narrow check
const p = await b.newPage();
await p.setViewport({ width: 390, height: 900 });
await p.goto("file://" + S + "/playhouse-proposal.html", { waitUntil: "networkidle0" });
console.log("390px h-overflow:", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "px");
await b.close();
