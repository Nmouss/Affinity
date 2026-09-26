// Rasterizes demo SVGs to the PNG paths Terminal 1's shared/data/products.json references.
// Usage (Next dev server on :3000): node scripts/mission/make-engine-images.mjs
import path from "node:path";
import { chromium } from "playwright-core";

const OUT = path.resolve(import.meta.dirname, "../../public/demo-assets");
const JOBS = [
  ["trailguard-mug.png", "neutral_mugs.svg", ""],
  ["easy-press.png", "easy_press.svg", ""],
  ["basic-pump.png", "basic_pump.svg", ""],
  ["classic-press.png", "glass_press.svg", ""],
  ["smart-dial.png", "compact_press.svg", "hue-rotate(200deg) saturate(1.6)"],
  ["colorway-press.png", "easy_press.svg", "sepia(1) hue-rotate(310deg) saturate(5)"],
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
for (const [out, svg, filter] of JOBS) {
  await page.setContent(`<body style="margin:0;background:transparent"><img id="i" src="http://localhost:3000/demo-assets/products/${svg}" style="width:400px;height:400px;filter:${filter}"></body>`);
  await page.waitForFunction(() => document.getElementById("i").complete);
  await page.locator("#i").screenshot({ path: path.join(OUT, out), omitBackground: true });
  console.log("wrote", out);
}
await browser.close();
