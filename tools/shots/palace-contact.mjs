// Capture one observatory, house, hall and corridor in each region, ruined and restored.
// Usage: node tools/shots/palace-contact.mjs http://127.0.0.1:5173/play <output-directory>
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const [base, out] = process.argv.slice(2);
if (!base || !out)
  throw new Error("Usage: node tools/shots/palace-contact.mjs http://127.0.0.1:5173/play <output-directory>");
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(join(root, "apps/web/package.json"));
const { createServer } = await import(require.resolve("vite"));
const vite = await createServer({
  configFile: join(root, "apps/web/vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
});
let rooms;
try {
  ({ rooms } = await vite.ssrLoadModule(join(root, "packages/rooms/src/index.ts")));
} finally {
  await vite.close();
}

function targets(region) {
  const candidates = rooms.filter((room) => room.region === region);
  const result = new Map();
  for (const kind of ["observatory", "house", "hall", "corridor"]) {
    for (const room of candidates) {
      const devices = room.topology.devices;
      const target = devices.find((device) => {
        if (kind === "observatory") return device.id === "observatory";
        if (kind === "house")
          return device.id !== "observatory" && !device.bridges?.length && device.interfaces.length === 1;
        if (kind === "hall")
          return device.id !== "observatory" && (!!device.bridges?.length || device.interfaces.length > 1);
        return false;
      });
      if (kind === "corridor") {
        const link = room.topology.links.find((candidate) => devices.some((d) => d.id === candidate.a.device));
        if (link) {
          result.set(kind, { room, link, device: link.a.device });
          break;
        }
      } else if (target) {
        result.set(kind, { room, device: target.id });
        break;
      }
    }
    if (!result.has("hall")) {
      const fallback = candidates.find((room) => {
        const device = room.topology.devices.find((d) => d.id === room.playerDevice);
        return device?.interfaces.length >= 2;
      });
      if (fallback) result.set("hall", { room: fallback, device: fallback.playerDevice, synthetic: true });
    }
    if (!result.has(kind)) throw new Error(`No ${kind} layout in Region ${region}`);
  }
  return result;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));

try {
  for (const region of [1, 2, 3, 4]) {
    const images = [];
    for (const kind of ["observatory", "house", "hall", "corridor"]) {
      const target = targets(region).get(kind);
      for (const [state, ruin] of [
        ["ruin", 1],
        ["restored", 0],
      ]) {
        const room = target.room;
        const contactKind = target.synthetic ? "&contact=hall" : "";
        await page.goto(
          `${base}?room=${encodeURIComponent(room.id)}&onboarded=1&ruin=${ruin}&pre=0&capture=1&tier=high${contactKind}`,
        );
        await page.waitForTimeout(10000);
        if (kind === "corridor") {
          await page.evaluate(({ link, from }) => window.__wirelight.useSession.getState().enterCorridor(link, from), {
            link: target.link.id,
            from: target.device,
          });
          await page.waitForTimeout(9000);
        } else if (target.device !== "observatory") {
          await page.evaluate((device) => window.__wirelight.useSession.getState().goTo(device), target.device);
          await page.waitForTimeout(9000);
        }
        await page.addStyleTag({ content: "body *{visibility:hidden!important}canvas{visibility:visible!important}" });
        await page.waitForTimeout(500);
        const image = join(out, `region${region}-${kind}-${state}.png`);
        await page.screenshot({ path: image });
        images.push(image);
        console.log(`Region ${region} ${kind} ${state}: ${room.id}`);
      }
    }
    const sheet = join(out, `region${region}.png`);
    execFileSync("magick", [
      "montage",
      ...images,
      "-set",
      "label",
      "%f",
      "-font",
      "AvantGarde-Book",
      "-pointsize",
      "17",
      "-geometry",
      "800x450+6+6",
      "-tile",
      "2x4",
      sheet,
    ]);
    console.log(`Saved ${sheet}`);
  }
} finally {
  await browser.close();
}
if (problems.length) throw new Error(`Capture page errors:\n${[...new Set(problems)].join("\n")}`);
