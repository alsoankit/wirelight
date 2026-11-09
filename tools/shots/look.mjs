// Screenshots of rooms on a running server: node tools/shots/look.mjs <url>/play <out-dir> room[:machine|-[:bench|birds|corridor=<link>]] …
import { chromium } from "playwright-core";

const [base, out, ...shots] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
for (const shot of shots) {
  const [room, walk, extra] = shot.split(":");
  await page.goto(`${base}?room=${room}&onboarded=1&ruin=0`, { timeout: 90000 });
  await page.waitForTimeout(9000);
  for (let i = 0; i < 12; i++) {
    const next = page.locator(
      ".lines button, .cmd-memory .panel-actions button, .discovery .panel-actions button:not(.quiet)",
    );
    if (!(await next.count())) break;
    await next
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(150);
  }
  if (walk && walk !== "-") {
    await page.evaluate((to) => window.__wirelight.useSession.getState().goTo(to), walk);
    await page.waitForTimeout(7000);
  }
  if (extra === "bench")
    await page.evaluate(() => window.__wirelight.useSession.getState().openPanel({ kind: "workbench" }));
  if (extra === "birds") await page.keyboard.press("b");
  if (extra?.startsWith("corridor=")) {
    const link = extra.slice(9);
    await page.evaluate(
      (l) => window.__wirelight.useSession.getState().enterCorridor(l, window.__wirelight.useSession.getState().here),
      link,
    );
    await page.waitForTimeout(6000);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${room}-${walk}-${(extra ?? "").replace(/[^a-z0-9-]/gi, "_")}.png` });
  console.log("shot", room, walk, extra ?? "");
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
