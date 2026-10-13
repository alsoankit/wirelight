// Shared helpers for the play scripts: a browser like a player's, rooms opened with onboarding
// already seen, overlays (cards, memories, lines) taken as they come, and a win check.
import { chromium } from "playwright-core";

export async function launch() {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { browser, page, errors };
}

/** Takes whatever is waiting on screen: spoken lines, discovery cards. */
export async function tidy(p) {
  for (let k = 0; k < 12; k++) {
    if (await p.$(".lines")) await p.click(".lines button");
    else if (await p.$(".discovery")) await p.click(".discovery .panel-actions button:not(.quiet)");
    else return;
    await p.waitForTimeout(120);
  }
}

export async function open(p, base, room, ready = ".plate") {
  await p.goto(`${base}?room=${room}&onboarded=1`);
  await p.waitForSelector(ready, { timeout: 20000 });
  await p.waitForTimeout(2000);
  await tidy(p);
}

export async function won(p, name) {
  const ok = await p
    .waitForSelector(".debrief", { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  console.log(name, ok ? "won" : "NOT WON");
  return ok;
}

export async function type(p, line) {
  if (await p.$('.console[data-open="no"]')) {
    await p.click(".console-bar");
    await p.waitForTimeout(350);
  }
  await p.click(".console-term");
  await p.keyboard.type(line);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(700);
}

export async function bench(p, to, door) {
  await tidy(p);
  await p.click("text=Workbench");
  await p.waitForTimeout(300);
  await p.fill(".panel input >> nth=0", to);
  if (door) await p.selectOption(".panel select", door);
  await p.click("text=Seal and send");
  await p.waitForTimeout(600);
}

export async function card(p, to, n = 0) {
  await tidy(p);
  await p.click("text=Address card");
  await p.waitForTimeout(300);
  await p.fill(`.panel input >> nth=${n}`, to);
  await p.click(`.panel button:has-text("Write it on the card") >> nth=${n}`);
  await p.waitForTimeout(500);
}

export async function plateSwitch(p, nth = 0) {
  await tidy(p);
  await p.click(`button.plate >> nth=${nth}`);
  await p.waitForTimeout(400);
  await p.click(".panel-actions button:first-child");
  await p.waitForTimeout(700);
}
