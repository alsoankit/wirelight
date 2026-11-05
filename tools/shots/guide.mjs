// Captures the Field Guide's pictures from the real game (UI-13): each topic's room, its numbered
// callouts placed on the real objects (read from their HTML labels on screen). Writes
// apps/web/public/guide/<topic>.jpg and apps/web/public/guide/marks.json.
// Usage: node guide.mjs http://127.0.0.1:5173/play
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const [base] = process.argv.slice(2);
const OUT = new URL("../../apps/web/public/guide/", import.meta.url).pathname;
const b = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 760 } });

/** Where things are on screen: the centre of the HTML label each target has in the room. */
const TARGETS = {
  door: '[data-tour="door"]',
  plate: "button.plate",
  keeper: '.world-chip:text-is("Keeper")',
  workbench: '.world-chip:text-is("Workbench")',
  glass: '[data-guide="glass"]',
  pause: '.top-bar button:has-text("Pause")',
  speed: '.top-bar button:has-text("×")',
  reset: '.top-bar button:has-text("Reset")',
};
// The room picture is the middle of the screen; callouts are relative to that crop.
const CROP = { x: 140, y: 60, width: 880, height: 600 };

async function centre(selector) {
  const box = await p
    .locator(selector)
    .first()
    .boundingBox()
    .catch(() => null);
  return box ? { x: box.x + box.width / 2 - CROP.x, y: box.y + box.height / 2 - CROP.y } : null;
}

async function open(room, extra = "") {
  await p.goto(`${base}?room=${room}&onboarded=1${extra}`);
  await p.waitForSelector("button.plate", { timeout: 20000 });
  await p.waitForTimeout(3500);
  // Nothing in front of the room: no cards, lines or panels.
  for (let i = 0; i < 10; i++) {
    if (await p.$(".lines")) await p.click(".lines button");
    else if (await p.$(".discovery")) await p.click(".discovery .panel-actions button:not(.quiet)");
    else break;
  }
  await p.addStyleTag({ content: ".mission-card,.dev-badge,.captures-button{visibility:hidden}" });
  await p.waitForTimeout(800);
}

const marks = {};
async function shoot(id, targets, clip = CROP) {
  const found = [];
  for (const t of targets) {
    const c = TARGETS[t] ? await centre(TARGETS[t]) : null;
    if (c) found.push({ target: t, x: Math.round(c.x), y: Math.round(c.y) });
  }
  await p.screenshot({ path: `${OUT}${id}.jpg`, clip, type: "jpeg", quality: 82 });
  marks[id] = { width: clip.width, height: clip.height, marks: found };
  console.log(id, found.map((f) => f.target).join(","));
}

await open("f2.first-light");
await shoot("room", ["door", "plate", "keeper", "glass", "workbench"]);
await shoot("controls", ["pause", "speed", "glass", "reset"], { x: 0, y: 0, width: 1280, height: 760 });
await open("f2.first-light", "&ruin=1");
await shoot("ruins-before", []);
await open("f2.first-light", "&ruin=0");
await shoot("ruins-after", []);
await open("f2.first-light");
await p.keyboard.press("g");
await p.waitForTimeout(800);
await shoot("glass", []);

writeFileSync(`${OUT}marks.json`, `${JSON.stringify(marks, null, 2)}\n`);
await b.close();
