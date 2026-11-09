// Capture every unique room layout in the room data, in ruin and restored states.
// Usage: node tools/shots/capture-rooms.mjs http://localhost:5173/play [--only picture-id] [--regions 1,2]
import { execFileSync } from "node:child_process";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const [base, ...args] = process.argv.slice(2);
if (!base) throw new Error("Pass the /play base URL, for example http://localhost:5173/play");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex < 0 ? undefined : args[onlyIndex + 1];
const regionsIndex = args.indexOf("--regions");
const regions = regionsIndex < 0 ? undefined : args[regionsIndex + 1].split(",");
const root = fileURLToPath(new URL("../../", import.meta.url));
const out = join(root, "apps/web/public/prerender");

// Load the authoritative room data and door mapping through the same Vite TS aliases as the app.
const require = createRequire(join(root, "apps/web/package.json"));
const { createServer } = await import(require.resolve("vite"));
const vite = await createServer({
  configFile: join(root, "apps/web/vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
});
let layouts;
try {
  const [{ rooms }, { planOf, layoutKey }] = await Promise.all([
    vite.ssrLoadModule(join(root, "packages/rooms/src/index.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/room/plan.ts")),
  ]);
  const unique = new Map();
  for (const room of rooms) {
    for (const device of room.topology.devices) {
      const obs = device.id === room.playerDevice;
      // Each layout the floor plan makes (0118): halls by doors per wall, mirrored houses apart.
      const plan = planOf(room.topology, room.playerDevice, device.id);
      if (!plan || (!obs && room.access[device.id]?.state !== "enterable")) continue;
      const id = layoutKey(room.region, plan);
      if (!unique.has(id)) unique.set(id, { id, room: room.id, walk: obs ? undefined : device.id });
    }
  }
  layouts = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
} finally {
  await vite.close();
}

if (only && !layouts.some((layout) => layout.id === only)) throw new Error(`Unknown layout: ${only}`);
if (only) layouts = layouts.filter((layout) => layout.id === only);
if (regions) layouts = layouts.filter((layout) => regions.some((r) => layout.id.startsWith(`r${r}-`)));
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));

async function clearRoomIntro() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const next = page.locator(
      ".lines button, .cmd-memory .panel-actions button, .discovery .panel-actions button:not(.quiet)",
    );
    if (!(await next.count())) break;
    await next.first().click();
    await page.waitForTimeout(120);
  }
}

console.log(`Capturing ${layouts.length} layouts in ruin and restored states.`);
try {
  for (const { id, room, walk } of layouts) {
    for (const [state, ruin] of [
      ["ruin", 1],
      ["lit", 0],
    ]) {
      await page.goto(`${base}?room=${room}&onboarded=1&ruin=${ruin}&capture=1&tier=high`);
      // Let the shell, models, and region materials finish loading before taking the room picture.
      await page.waitForTimeout(14000);
      await clearRoomIntro();
      if (walk) {
        await page.evaluate((to) => window.__wirelight.useSession.getState().goTo(to), walk);
        // Layouts with code-built floors and regional kits can render after the room transition.
        // Give the scene time to finish its merged geometry before taking the still.
        await page.waitForTimeout(12000);
        await clearRoomIntro();
      }
      await page.addStyleTag({
        content: "body *{visibility:hidden!important}canvas{visibility:visible!important}",
      });
      await page.waitForTimeout(600);
      const png = join(out, `${id}-${state}.png`);
      const webp = join(out, `${id}-${state}.webp`);
      await page.screenshot({ path: png });
      // Ruin stays cool, but lift the deepest shadows enough for room details to remain legible.
      const clearer = state === "ruin" ? ["-level", "6%,58%,1.05", "-modulate", "100,112"] : [];
      execFileSync("magick", [png, ...clearer, "-quality", "72", "-define", "webp:method=6", webp]);
      await unlink(png);
      console.log(`${id} ${state} ${(await stat(webp)).size} bytes`);
    }
  }
} finally {
  await browser.close();
}
if (problems.length) throw new Error(`Capture page errors:\n${[...new Set(problems)].join("\n")}`);

// The game shows a picture only for layouts listed here (both states captured), so a stale or missing
// picture never stands in for a changed room.
const files = new Set(await readdir(out));
const captured = [...files]
  .filter((f) => f.endsWith("-lit.webp") && files.has(f.replace(/-lit\.webp$/, "-ruin.webp")))
  .map((f) => f.replace(/-lit\.webp$/, ""))
  .sort();
await writeFile(join(root, "apps/web/src/world/prerender/pictures.json"), `${JSON.stringify(captured, null, 2)}\n`);
console.log(`pictures.json: ${captured.length} layouts`);
