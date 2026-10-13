// Before/after shots of the rooms' finishing pass (apps/web/src/world/post), and its frame cost.
// Needs the dev server (pnpm dev). One browser, one page, rooms in turn (the machine may be busy).
// Usage:
//   node tools/post/shots.mjs <outDir> [tier] [room…]      shots: ruin 1|0 × post 0|1 per room
//   node tools/post/shots.mjs <outDir> --fps [tier] [room]  median fps with post 0 and 1, vsync off
// Extra query (e.g. tm=agx) via POST_QUERY="tm=agx"; ONLY_AFTER=1 skips the post=0 shots.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { tidy } from "../shots/play/lib.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5173/play";
const EXTRA = process.env.POST_QUERY ? `&${process.env.POST_QUERY}` : "";
const ROOMS = ["f1.two-rooms", "f3.many-doors", "f5.where-not-who", "f8.other-street"];

const argv = process.argv.slice(2);
const fps = argv.includes("--fps");
const [out = "post-shots", tier = "medium", ...rest] = argv.filter((a) => a !== "--fps");
const rooms = rest.length ? rest : ROOMS;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-angle=vulkan",
    "--ignore-gpu-blocklist",
    ...(fps ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : []),
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`);
});

async function show(room, ruin, post) {
  await page.goto(`${BASE}?room=${room}&onboarded=1&ruin=${ruin}&post=${post}&tier=${tier}${EXTRA}`);
  await page.waitForSelector(".plate", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);
  await tidy(page);
  await page.waitForTimeout(1500);
}

/** Frames per second over `ms`, counted with requestAnimationFrame. */
async function measure(ms) {
  return page.evaluate(
    (span) =>
      new Promise((done) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now) => {
          frames++;
          if (now - start < span) requestAnimationFrame(tick);
          else done((frames * 1000) / (now - start));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

if (fps) {
  const room = rooms[0];
  const runs = { 0: [], 1: [] };
  // Interleaved, so a busy machine weighs on both sides alike.
  for (let round = 0; round < 3; round++) {
    for (const post of [0, 1]) {
      await show(room, 1, post);
      await measure(1000); // warm up
      runs[post].push(await measure(4000));
    }
  }
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const post of [0, 1]) {
    const m = median(runs[post]);
    console.log(
      `${room} ${tier} post=${post}: median ${m.toFixed(1)} fps (${(1000 / m).toFixed(2)} ms) runs ${runs[post].map((x) => x.toFixed(0)).join(", ")}`,
    );
  }
} else {
  for (const room of rooms) {
    for (const ruin of [1, 0]) {
      for (const post of process.env.ONLY_AFTER ? [1] : [0, 1]) {
        await show(room, ruin, post);
        const file = `${out}/${room}-${tier}-ruin${ruin}-post${post}${EXTRA.replace(/[&=]/g, "-")}.png`;
        await page.screenshot({ path: file });
        console.log(file);
      }
    }
  }
}
if (problems.length) console.log(problems.slice(0, 10).join("\n"));
await browser.close();
