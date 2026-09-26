// Drives the full mock-mode demo in the installed Google Chrome with every non-localhost request
// blocked, and saves a screenshot per screen. Usage (dev server running on :5173):
//   node scripts/demo-smoke.mjs [outDir]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.AFFINITY_URL ?? "http://localhost:5173/?api=mock";
const out = path.resolve(process.argv[2] ?? "/tmp/affinity-shots");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const blocked = [];
await page.route("**/*", (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
  blocked.push(url.href);
  return route.abort();
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let step = 0;
const shot = async (name) => page.screenshot({ path: path.join(out, `${String(++step).padStart(2, "0")}-${name}.png`), fullPage: true });
const click = (name, opts = {}) => page.getByRole("button", { name, exact: opts.exact ?? false }).first().click();
const screen = () => page.locator(".app").getAttribute("data-screen");
const expectScreen = async (name) => {
  await page.waitForFunction((n) => document.querySelector(".app")?.getAttribute("data-screen") === n, name, { timeout: 10000 });
};

const started = Date.now();
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
await expectScreen("HOME");
await shot("home");

// Voice path via the preloaded transcript (no microphone in headless Chrome).
await click("the preloaded cabin transcript");
await expectScreen("TRANSCRIPT_CONFIRMATION");
await shot("transcript");
await click("Use this");
await expectScreen("MISSION_BRIEF");
await shot("brief");
await click("Looks right");
await expectScreen("PARTICIPANT_RESOLUTION");
await shot("participants");
await click("Create shopper here");
await expectScreen("SHOPPER_CREATION");
await page.getByLabel("Name").fill("Sam");
await shot("shopper");
await click("Learn my cabin taste");
await expectScreen("QUICK_CHOICES");
await shot("choice-1");
for (const choice of ["Product B", "Product A", "Product A", "Skip"]) {
  await page.getByRole("button", { name: choice, exact: false }).first().click();
  await page.waitForFunction(() => !document.querySelector(".busy .spinner"));
}
await expectScreen("PROFILE_CONFIRMATION");
await shot("profile");
await click("Looks right");
await expectScreen("MISSION_SPACE");
await page.waitForTimeout(2500); // let GLBs render
await shot("mission-space");
await page.getByRole("button", { name: /^Select / }).click();
await shot("product-selected");
await click("Try it");
await expectScreen("LEAP_CHECK");
await click("Play recorded session");
await page.waitForTimeout(1200);
await shot("leap-recording");
await page.getByRole("button", { name: "Required" }).waitFor({ timeout: 10000 });
await shot("leap-observed");
await click("Required");
await click("Continue: look for savings");
await expectScreen("SUBSTITUTION_APPROVAL");
await shot("substitution-paused");
await click("Override with approval");
await shot("override-dialog");
await click("Cancel");
await click("Choose compatible alternative");
await page.getByText("Compatible alternative approved").waitFor();
await shot("substitution-approved");
await click("Ask everyone for approval");
await shot("approval-dialog");
await click("Ask everyone", { exact: true });
await expectScreen("COMPLETE");
await shot("complete");

console.log(JSON.stringify({ ok: true, finalScreen: await screen(), seconds: (Date.now() - started) / 1000, blocked, errors, out }, null, 2));
await browser.close();
