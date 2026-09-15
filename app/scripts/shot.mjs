// Captures FlashLearn states via system Edge (no Chromium download).
import { chromium } from "playwright";

const url = process.env.URL ?? "http://localhost:4173/";
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 });

async function shot(name) {
  await page.waitForTimeout(550);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log("captured", name);
}
async function click(sel) {
  const el = page.locator(sel).first();
  if (await el.count()) await el.click().catch(() => {});
}

try {
  await page.goto(url, { waitUntil: "networkidle" });
  await shot("01-welcome");

  await click(".welcome .cta");
  await shot("02-chooser");

  await click(".selall");
  await click(".start");
  await shot("03-card");

  await page.locator(".qchoice:not([disabled])").first().click();
  await page.waitForTimeout(750);
  await shot("04-answered");

  for (let i = 0; i < 16; i++) {
    const btn = page.locator(".qchoice:not([disabled])").first();
    if (await btn.count() === 0) break;
    await btn.click().catch(() => {});
    await page.waitForTimeout(1750);
  }
  await page.waitForTimeout(600);
  await shot("05-results");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await shot("06-mobile");
} finally {
  await browser.close();
}
