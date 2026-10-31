// Measures rooms in a real browser on this machine's GPU: frame time, draw calls and triangles, ruined
// and restored, on the High tier. Run it alone on a quiet machine. The display caps frames at 60, so
// SCALE=2 draws twice the resolution, to push a capable machine under the cap and show real differences.
// (Uncapping the browser instead starves the page: models never finish loading.)
// Usage: [SCALE=2] [MIN_TRIS=60000] [REPEAT=2] node tools/shots/perf.mjs http://localhost:5174/play [room …]
import { chromium } from "playwright-core";

const [base, ...asked] = process.argv.slice(2);
const rooms = asked.length
  ? asked
  : ["f1.two-rooms", "f3.boss-busy-hall", "f5.boss-quiet-street", "f8.across-the-street"];

const launch = () =>
  chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
  });

// MIN_TRIS: the room's full triangle count, so a partly loaded room can't pass. REPEAT: readings per state.
const MIN_TRIS = Number(process.env.MIN_TRIS ?? 20000);
const REPEAT = Number(process.env.REPEAT ?? 1);
const SCALE = Number(process.env.SCALE ?? 1);

const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor(values.length * q)] ?? 0;

async function measure(room, ruin) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: SCALE });
  await page.goto(`${base}?room=${room}&onboarded=1&ruin=${ruin}&perf=1&tier=high`);
  // The room is in when its triangle count has stopped climbing (models load after the shell).
  let last = 0;
  let steady = 0;
  for (let i = 0; i < 20 && steady < 4; i++) {
    await page.waitForTimeout(1000);
    const tail = await page.evaluate(() => window.__perf?.samples?.slice(-30).map((s) => s.triangles) ?? []);
    const top = Math.max(0, ...tail);
    steady = top >= MIN_TRIS && top <= last * 1.02 ? steady + 1 : 0;
    last = Math.max(last, top);
  }
  await page.evaluate(() => {
    if (window.__perf) window.__perf.samples = [];
  });
  await page.waitForTimeout(8000);
  const samples = (await page.evaluate(() => window.__perf?.samples ?? [])).slice(5);
  await browser.close();
  return { samples, loaded: steady >= 4 };
}

console.log("room                            state      fps    p95 ms  draws  triangles");
for (const room of rooms) {
  for (const ruin of Array.from({ length: REPEAT }, () => [1, 0]).flat()) {
    let reading = await measure(room, ruin);
    for (let tries = 0; !reading.loaded && tries < 4; tries++) reading = await measure(room, ruin);
    const { samples, loaded } = reading;
    const ms = samples.map((s) => s.ms);
    const mean = ms.reduce((a, b) => a + b, 0) / Math.max(ms.length, 1);
    const draws = quantile(
      samples.map((s) => s.draws),
      0.5,
    );
    const tris = quantile(
      samples.map((s) => s.triangles),
      0.5,
    );
    console.log(
      `${room.padEnd(31)} ${(ruin ? "ruin" : "restored").padEnd(9)} ${(1000 / mean).toFixed(0).padStart(4)} ${quantile(ms, 0.95).toFixed(1).padStart(8)} ${String(draws).padStart(6)} ${String(tris).padStart(10)}${loaded ? "" : "  NOT FULLY LOADED"}`,
    );
  }
}
