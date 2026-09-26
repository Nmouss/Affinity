// Completes the demo with the keyboard only (Tab / Shift+Tab / Enter / Space / arrow keys / Esc).
import { chromium } from "playwright-core";

const BASE = process.env.AFFINITY_URL ?? "http://localhost:5180/?api=mock";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route("**/*", (r) => (["localhost", "127.0.0.1"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
const log = [];
const screen = () => page.locator(".app").getAttribute("data-screen");
const active = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    return (el?.getAttribute("aria-label") || el?.labels?.[0]?.textContent || el?.textContent || "").trim().slice(0, 60);
  });

/** Tab forward until the focused element's label matches, then press key. Proves keyboard reachability. */
async function tabTo(pattern, key = "Enter") {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press("Tab");
    const text = await active();
    if (pattern.test(text)) {
      const visible = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== "none");
      log.push(`${await screen()}: ${text}${visible ? "" : " (NO FOCUS RING)"}`);
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(150);
      return;
    }
  }
  throw new Error(`Could not Tab to ${pattern} on ${await screen()}`);
}
const waitScreen = (n) => page.waitForFunction((n) => document.querySelector(".app")?.dataset.screen === n, n, { timeout: 10000 });

await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
await waitScreen("HOME");
await tabTo(/Describe your group mission|Plan a cabin/i, null);
await page.keyboard.type("Plan a three-day Blue Ridge cabin trip for me, Maya, Alex, and one guest. Keep shared supplies under $400.");
await tabTo(/^Create mission$/);
await waitScreen("MISSION_BRIEF");
await tabTo(/^Looks right$/);
await waitScreen("PARTICIPANT_RESOLUTION");
await tabTo(/^Create shopper here$/);
await waitScreen("SHOPPER_CREATION");
await tabTo(/^Learn my cabin taste$/);
await waitScreen("QUICK_CHOICES");
for (const key of ["ArrowRight", "ArrowLeft", "ArrowLeft", "s"]) {
  await page.waitForFunction(() => ![...document.querySelectorAll(".choice-controls button")].some((b) => b.disabled));
  await page.keyboard.press(key);
  await page.waitForTimeout(150);
}
await waitScreen("PROFILE_CONFIRMATION");
await tabTo(/^Looks right$/);
await waitScreen("MISSION_SPACE");
await tabTo(/Mission table/, null);
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
log.push(`3D stage: ${await page.locator(".scene__controls .caption").textContent()}`);
// "Remove products with glass." is a known Terminal 1 parser gap (parsed as a cart removal); this
// phrasing is a glass exclusion in both the engine and the mock.
await tabTo(/^Type a command$/, null);
await page.keyboard.type("Show a cheaper option without glass.");
await page.keyboard.press("Enter");
await page.getByRole("alertdialog").waitFor();
log.push(`dialog focus: ${await active()}`);
await page.keyboard.press("Escape");
log.push(`after Esc dialog open: ${await page.getByRole("alertdialog").count()}`);
await tabTo(/^Select Easy Press/);
await tabTo(/^Try it$/);
await waitScreen("LEAP_CHECK");
await tabTo(/^One hand \(right\)$/);
await tabTo(/^Required$/);
await tabTo(/^Continue: look for savings$/);
await waitScreen("SUBSTITUTION_APPROVAL");
await tabTo(/^Override with approval$/);
await page.getByRole("alertdialog").waitFor();
await page.keyboard.press("Escape");
await tabTo(/^Choose compatible alternative$/);
await tabTo(/^Ask everyone for approval$/);
await page.getByRole("alertdialog").waitFor();
log.push(`approval dialog focus: ${await active()}`);
await page.keyboard.press("Enter");
await waitScreen("COMPLETE");
console.log(log.join("\n"));
console.log("final:", await screen());
await browser.close();
