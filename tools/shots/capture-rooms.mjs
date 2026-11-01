// Captures rooms as pictures (prototype, 2.5D): each room alone, ruined and restored, at twice 1600×900.
// Usage: node tools/shots/capture-rooms.mjs http://localhost:5174/play
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const [base] = process.argv.slice(2);
const OUT = new URL("../../apps/web/public/prerender/", import.meta.url).pathname;
const ROOMS = [
  { id: "r1-observatory-d1", room: "f1.two-rooms" },
  { id: "r1-house-d1", room: "f1.two-rooms", walk: "lantern" },
  { id: "r2-observatory-d1", room: "f3.boss-busy-hall" },
];
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
for (const { id, room, walk } of ROOMS) {
  for (const [state, ruin] of [
    ["ruin", 1],
    ["lit", 0],
  ]) {
    await page.goto(`${base}?room=${room}&onboarded=1&ruin=${ruin}&capture=1&tier=high`);
    // Long enough for painted art and statues, which load on their own after the room.
    await page.waitForTimeout(14000);
    if (walk) {
      await page.evaluate((to) => window.__wirelight.useSession.getState().goTo(to), walk);
      await page.waitForTimeout(6000);
    }
    await page.addStyleTag({ content: "body *{visibility:hidden!important} canvas{visibility:visible!important}" });
    await page.waitForTimeout(600);
    const png = `${OUT}${id}-${state}.png`;
    await page.screenshot({ path: png });
    // Ruin stays cold and quiet, but every shape must read: a gentle lift, never fog.
    const clearer = state === "ruin" ? ["-level", "6%,58%,1.05", "-modulate", "100,112"] : [];
    execFileSync("magick", [png, ...clearer, "-quality", "86", `${OUT}${id}-${state}.webp`]);
    execFileSync("rm", [png]);
    console.log(id, state);
  }
}
await browser.close();
