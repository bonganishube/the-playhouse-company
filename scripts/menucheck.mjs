import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

// --- desktop dropdown ---
const d = await b.newPage();
await d.setViewport({ width: 1280, height: 460 });
await d.goto("http://localhost:3000/venues", { waitUntil: "networkidle2" });
await d.hover('nav[aria-label="Primary"] a[href="/venues"]');
await new Promise((r) => setTimeout(r, 400));
const dd = await d.evaluate(() => {
  const el = [...document.querySelectorAll("nav a[href='/venues'] ~ div, .group > div")]
    .find((n) => n.querySelector("a[href*='#theatre']"));
  if (!el) return "dropdown not found";
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { opacity: cs.opacity, bg: cs.backgroundColor, filter: cs.filter, width: Math.round(r.width) };
});
console.log("desktop dropdown:", JSON.stringify(dd));
await d.screenshot({ path: "/tmp/m-dropdown.png" });

// --- mobile drawer ---
const m = await b.newPage();
await m.setViewport({ width: 390, height: 700 });
await m.goto("http://localhost:3000/venues", { waitUntil: "networkidle2" });
await m.click('button[aria-label="Open menu"]');
await new Promise((r) => setTimeout(r, 400));
const dr = await m.evaluate(() => {
  const el = document.querySelector("#site-menu");
  if (!el) return "drawer not found";
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    opacity: cs.opacity,
    bg: cs.backgroundColor,
    // A fixed child inside a filtered/masked ancestor gets trapped; these
    // numbers show whether it really covers the viewport.
    rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log("mobile drawer:  ", JSON.stringify(dr));
await m.screenshot({ path: "/tmp/m-drawer.png" });
await b.close();
