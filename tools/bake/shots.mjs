#!/usr/bin/env node
// Before/after screenshots of baked rooms (dev server): each room, ruined and restored, with the
// Blender bake (bake=1) and with the code bake (bake=0).
//   node tools/bake/shots.mjs <out-dir> <room>:<device>[,…] [--base http://127.0.0.1:5173/play]
// e.g. p.first-message:observatory,f3.many-doors:hall
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [out, list] = process.argv.slice(2);
const baseFlag = process.argv.indexOf("--base");
const base = baseFlag > 0 ? process.argv[baseFlag + 1] : "http://127.0.0.1:5173/play";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
for (const spec of list.split(",")) {
  const [room, device] = spec.split(":");
  for (const ruin of [1, 0]) {
    for (const bake of [0, 1]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error" || m.text().includes("bake")) errors.push(m.text());
      });
      await page.goto(`${base}?room=${room}&onboarded=1&ruin=${ruin}&bake=${bake}`);
      await page.waitForFunction(() => window.__wirelight?.useSession.getState().here, null, { timeout: 60000 });
      if (device && device !== "observatory") {
        await page.evaluate((d) => window.__wirelight.useSession.setState({ here: d }), device);
      }
      await page.waitForTimeout(Number(process.env.WAIT ?? 9000));
      const file = join(out, `${room}-${device}-${ruin ? "ruin" : "restored"}-${bake ? "baked" : "code"}.png`);
      await page.screenshot({ path: file });
      console.log(file, errors.length ? `\n  ${errors.join("\n  ")}` : "");
      await page.close();
    }
  }
}
await browser.close();
