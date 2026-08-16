import puppeteer from "puppeteer-core";

/**
 * Reports horizontal overflow on a page.
 *
 * Elements clipped by an ancestor with overflow hidden/clip are ignored: a
 * carousel track deliberately extends past the viewport and does not cause the
 * page to scroll, so flagging it would bury the genuine offenders.
 */
const url = process.argv[2];
const width = Number(process.argv[3] ?? 390);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width, height: 900 });
await page.goto(url, { waitUntil: "networkidle2" });

const result = await page.evaluate((vw) => {
  const clipped = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (/hidden|clip|auto|scroll/.test(o.overflowX)) return true;
    }
    return false;
  };

  const offenders = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 1) continue;
    if (clipped(el)) continue;
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute("class") || "").slice(0, 80),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
    });
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    offenders: offenders.slice(0, 10),
  };
}, width);

console.log(JSON.stringify(result, null, 2));
await browser.close();
