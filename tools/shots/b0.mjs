// Screenshots of the B0 room in headless Chrome (animation frames always run, unlike a covered window).
// Usage: node tools/shots/b0.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from "playwright-core";

const [url = "http://127.0.0.1:5173/", out = "b0.png", waitMs = "5000", width = "1600", height = "900"] =
  process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const problems = [];
page.on("pageerror", (e) => problems.push(`pageerror: ${e}`));
page.on("response", (r) => {
  if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`);
});
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
});

try {
  await page.goto(url);
  await page.waitForTimeout(Number(waitMs));
  const gpu = await page.evaluate(async () => {
    if (!navigator.gpu) return "no navigator.gpu";
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ? `WebGPU: ${adapter.info?.vendor ?? "?"} ${adapter.info?.architecture ?? ""}` : "no adapter";
  });
  await page.screenshot({ path: out });
  console.log(`saved ${out} · ${gpu}`);
  for (const p of [...new Set(problems)]) console.log(p.slice(0, 300));
} finally {
  await browser.close();
}
