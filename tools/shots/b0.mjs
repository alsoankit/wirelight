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
  const png = await page.screenshot({ path: out });
  // Brightness of the central area (where the room is): mean, percentiles, and the share of
  // near-black and blown-out pixels, to keep ruin and restored comfortable to look at (0051).
  const light = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const x0 = Math.round(img.width * 0.25),
      y0 = Math.round(img.height * 0.2);
    const { data } = g.getImageData(x0, y0, Math.round(img.width * 0.5), Math.round(img.height * 0.6));
    const ys = [];
    for (let i = 0; i < data.length; i += 4)
      ys.push((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    ys.sort((a, b) => a - b);
    const pct = (p) => ys[Math.floor(p * (ys.length - 1))].toFixed(2);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const dark = ys.filter((y) => y < 0.06).length / ys.length;
    const blown = ys.filter((y) => y > 0.92).length / ys.length;
    return `mean ${mean.toFixed(2)} · p10 ${pct(0.1)} p50 ${pct(0.5)} p90 ${pct(0.9)} · near-black ${(dark * 100).toFixed(1)}% · blown ${(blown * 100).toFixed(1)}%`;
  }, png.toString("base64"));
  console.log(`saved ${out} · ${gpu}`);
  console.log(`light: ${light}`);
  for (const p of [...new Set(problems)]) console.log(p.slice(0, 300));
} finally {
  await browser.close();
}
