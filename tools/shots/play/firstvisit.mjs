// A first visit, as a new player: the gift of sight, the path, the tour, the Prologue, then on
// through the debrief's Continue into Floor 1. Then a reload: the game resumes where it was (ONB-20).
import { chromium } from "playwright-core";

// Screenshots go to the given prefix, or the system temp folder (never "undefined-*.png" in the repo).
const [base, outArg] = process.argv.slice(2);
const out = outArg ?? `${(await import("node:os")).tmpdir()}/wirelight-firstvisit`;
const b = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(`pageerror: ${e}`));
await p.goto(base);
await p.waitForSelector(".lines", { timeout: 20000 });
let n = 0;
while (await p.$(".lines")) {
  await p.click(".lines button");
  await p.waitForTimeout(120);
  n++;
}
console.log("sight lines:", n);
await p.screenshot({ path: `${out}-path.png` });
await p.click(".path-options button >> nth=0");
await p.waitForSelector(".tour-card", { timeout: 5000 });
for (let i = 0; i < 5; i++) {
  if (i === 2) await p.screenshot({ path: `${out}-tour.png` });
  await p.click(".tour-card .panel-actions button:not(.quiet)");
  await p.waitForTimeout(250);
}
console.log("tour done:", !(await p.$(".tour-card")));
// Discovery cards and the first tip may wait their turn: take them.
const tidy = async () => {
  for (let k = 0; k < 8; k++) {
    if (await p.$(".lines")) await p.click(".lines button");
    else if (await p.$(".discovery")) await p.click(".discovery .panel-actions button:not(.quiet)");
    else break;
    await p.waitForTimeout(150);
  }
};
await tidy();
await p.click(".send");
await p.waitForSelector(".debrief", { timeout: 20000 });
await p.screenshot({ path: `${out}-debrief.png` });
console.log("prologue won; next button:", await p.textContent(".debrief .panel-actions button:last-child"));
await p.click(".debrief .panel-actions button:last-child");
await p.waitForTimeout(3000);
await tidy();
console.log("now in:", await p.textContent(".room-title"));
await p.reload();
await p.waitForSelector(".room-title", { timeout: 20000 });
await p.waitForTimeout(1500);
console.log(
  "after reload:",
  await p.textContent(".room-title"),
  "| onboarding again?",
  !!(await p.$(".path-choice, .tour-card")),
);
await p.keyboard.press("m");
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}-menu.png` });
console.log(errs.join("\n") || "no errors");
await b.close();
