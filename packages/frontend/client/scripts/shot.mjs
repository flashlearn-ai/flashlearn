// Captures FlashLearn states via system Edge (no Chromium download).
//
// Playwright is not a dependency of this package: CI never runs this script, and
// carrying it would add ~14 MB to every install for a local-only tool. Install it
// when you want screenshots:  npm i -D playwright --workspace @flashlearn/frontend
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("playwright is not installed. Run:\n  npm i -D playwright --workspace @flashlearn/frontend");
  process.exit(1);
}

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

  // A deck too small to supply a wrong answer renders no choices at all.
  await click(".qchoice:not([disabled])");
  await page.waitForTimeout(750);
  await shot("04-answered");

  // Answering alone does not advance — a card only moves on once it is graded.
  for (let i = 0; i < 24; i++) {
    const choice = page.locator(".qchoice:not([disabled])").first();
    if (await choice.count()) {
      await choice.click().catch(() => {});
      await page.waitForTimeout(400);
    }
    const grade = page.locator(".g-primary, .g-easy").first();
    if (await grade.count() === 0) break;
    await grade.click().catch(() => {});
    await page.waitForTimeout(1500);
    if (i === 2) await shot("05-handoff");
  }
  await page.waitForTimeout(600);
  await shot("06-results");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await shot("07-mobile");
} finally {
  await browser.close();
}
