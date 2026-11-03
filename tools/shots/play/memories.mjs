// Guardian memories and ride-alongs (0036, 0037): opens the floor memory from a real debrief, then
// replays memories from the Codex (marked seen through the dev hook) and screenshots each ride.
// Usage: node memories.mjs http://127.0.0.1:5173/play <screenshot folder>
import { arrived, launch, open, plateSwitch, tidy, won } from "./lib.mjs";

// Screenshots go to the given folder, or the system temp folder (never a folder named "undefined").
const [base, outArg] = process.argv.slice(2);
const out = outArg ?? `${(await import("node:os")).tmpdir()}/wirelight-memories`;
(await import("node:fs")).mkdirSync(out, { recursive: true });
const { browser, page: p, errors } = await launch();
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` });

// 1. A real debrief: win 1.B, then "The Gardener remembers".
await open(p, base, "f1.boss-dark-corridor");
await plateSwitch(p);
await p.click("text=→ kitchen");
await arrived(p, "kitchen");
await tidy(p);
await p.click("text=Cable end");
await p.waitForTimeout(600);
await plateSwitch(p);
await won(p, "1.B");
await tidy(p);
await p.click("text=The Gardener remembers");
await p.waitForSelector(".glass.memory");
await p.waitForTimeout(500);
await shot("f1-ch1");
await p.click(".memory-caption button:not(.quiet)");
await p.click(".memory-caption button:not(.quiet)");
await p.waitForSelector(".ride-card");
await p.waitForTimeout(700);
await shot("f1-ride");
await p.keyboard.press("Escape");
console.log("closed with Esc:", !(await p.$(".glass.memory")));

// 2. From the Notebook: Floor 9's memory, marked seen, replayed.
await p.evaluate(() => {
  const w = window.__wirelight;
  w.useProgress.getState().seeFloorMemory(9);
  w.useProgress.getState().seeFloorMemory(5);
  w.useProgress.getState().seeFloorMemory(3);
  w.useProgress.getState().seeMemory("F1-BLD-02");
});
await p.keyboard.press("m");
await p.click("text=Notebook");
await p.waitForTimeout(300);
await shot("codex");
await p.click("text=How they built it: ");
await p.waitForSelector(".glass.memory");
await p.waitForTimeout(400);
await shot("building");
await p.click(".memory-caption button:not(.quiet)");
await p.click("text=The stone warden remembers");
await p.waitForSelector(".glass.memory");
await p.keyboard.press("ArrowRight");
await p.keyboard.press("ArrowRight");
await p.waitForSelector(".ride-card");
for (const [i, ms] of [
  [1, 1500],
  [2, 2600],
  [3, 2600],
  [4, 2600],
]) {
  await p.waitForTimeout(ms);
  await shot(`f9-ride-${i}`);
}
await p.click("text=Pause");
await p.click("text=Step forward");
await p.click("text=Step forward");
await p.click("text=Step forward");
await p.waitForTimeout(1300);
await shot("f9-ride-paused");
await p.keyboard.press("Escape");
await p.click("text=The Lamplighter remembers");
await p.waitForSelector(".glass.memory");
await p.keyboard.press("ArrowRight");
await p.keyboard.press("ArrowRight");
await p.waitForTimeout(1500);
await shot("f5-ride");
await p.keyboard.press("Escape");
await p.click("text=The clockwork owl remembers");
await p.keyboard.press("ArrowRight");
await p.keyboard.press("ArrowRight");
await p.waitForTimeout(3600);
await shot("f3-ride");
// Reduced motion.
await p.keyboard.press("Escape");
await p.evaluate(() => window.__wirelight.useProgress.getState().setSettings({ motion: "reduced" }));
await p.click("text=The stone warden remembers");
await p.keyboard.press("ArrowRight");
await p.keyboard.press("ArrowRight");
await p.waitForTimeout(800);
await shot("f9-ride-reduced");
console.log("errors:", errors);
await browser.close();
