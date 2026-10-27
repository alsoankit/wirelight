// Every Guardian memory, chapter by chapter, and every building memory (0036, 0037, 0066, 0071):
// screenshots of each chapter's picture as it builds and when it's finished, and of each ride-along's
// steps. Usage: node memory-chapters.mjs http://127.0.0.1:5173/play <screenshot folder> [floors] [WxH]
import { launch, tidy } from "./lib.mjs";

// Screenshots go to the given folder, or the system temp folder (never a folder named "undefined").
const [base, outArg, only, size] = process.argv.slice(2);
const out = outArg ?? `${(await import("node:os")).tmpdir()}/wirelight-memory-chapters`;
(await import("node:fs")).mkdirSync(out, { recursive: true });
const { browser, page: p, errors } = await launch();
p.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("unmount")) errors.push(m.text().slice(0, 400));
});
if (size) {
  const [w, h] = size.split("x").map(Number);
  await p.setViewportSize({ width: w, height: h });
}
const overlaps = [];
// Words on the maps that overprint each other (both visible, boxes crossing by more than 3px): the
// memory maps' SVG labels, and the world map's legend beside the palace model (HTML: title, region
// names, each floor's name and state, the deeper note).
const worldWords =
  ".world-map .world-legend :is(.world-title, .world-region-name, .world-floor-name, .world-floor-state, .world-deeper-name, .world-turn)";
const checkLabels = async (name) => {
  const found = await p.evaluate((worldWords) => {
    const seen = (el) => {
      for (let e = el; e && e.tagName !== "svg"; e = e.parentElement)
        if (Number(getComputedStyle(e).opacity) < 0.35 || Number(e.getAttribute("opacity") ?? 1) < 0.35) return false;
      return true;
    };
    const boxes = [...document.querySelectorAll(`.mem-map text, ${worldWords}`)]
      .filter((t) => t.textContent.trim() && seen(t) && !t.classList.contains("mem-msg-mark"))
      .map((t) => ({ t: t.textContent.trim(), r: t.getBoundingClientRect() }));
    const out = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // A plate's name written over the door's own name is the same word, on purpose.
        if (w > 3 && h > 3 && boxes[i].t !== boxes[j].t) out.push(`${boxes[i].t} × ${boxes[j].t}`);
      }
    return out;
  }, worldWords);
  for (const f of found) overlaps.push(`${name}: ${f}`);
};
const shot = async (n) => {
  await p.screenshot({ path: `${out}/${n}.png` });
  await checkLabels(n);
};
const floors = only ? only.split(",").map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
const buildings = [
  "p.first-message",
  "f1.two-rooms",
  "f1.loose-cable",
  "f1.both-ends",
  "f2.first-light",
  "f2.wrong-name",
  "f2.who-are-you",
  "f2.lights-out",
  "f3.many-doors",
  "f3.keepers-memory",
  "f3.find-everyone",
  "f4.pinned-memory",
  "f4.who-has-the-key",
  "f4.spare-cable",
];

await p.goto(`${base}?room=f1.two-rooms&onboarded=1`);
await p.waitForFunction(() => !!window.__wirelightMemory, null, { timeout: 30000 });
await p.waitForTimeout(2500);
await tidy(p);

// Another tab's hot reload can reload the page: wait for the hook again before each memory.
const openMem = async (show) => {
  await p.waitForFunction(() => !!window.__wirelightMemory, null, { timeout: 30000 });
  await tidy(p);
  await p.evaluate((s) => window.__wirelightMemory.openMemory(s), show);
};

// A hot reload from another tab can cut a memory short: try it once more.
const retry = async (name, run) => {
  for (let k = 0; k < 2; k++) {
    try {
      await run();
      return;
    } catch (e) {
      console.log(`${name}: ${k ? "gave up" : "again"} (${String(e.message).split("\n")[0]})`);
      await p.waitForTimeout(3000);
      await p.keyboard.press("Escape").catch(() => {});
    }
  }
};

for (const f of floors)
  await retry(`floor ${f}`, async () => {
    await openMem({ kind: "floor", floor: f });
    await p.waitForSelector(".glass.memory");
    for (let c = 1; c < 8; c++) {
      if (!(await p.$(".glass.memory"))) break;
      const ride = await p.$(".ride, .memory-wait");
      if (ride) {
        await p.waitForSelector(".ride", { timeout: 15000 });
        for (let s = 1; s <= 6; s++) {
          await p.waitForTimeout(s === 1 ? 900 : 3200);
          await shot(`f${f}-ch${c}-ride${s}`);
        }
      } else {
        await p.waitForTimeout(1800);
        await shot(`f${f}-ch${c}-a`);
        await p.waitForTimeout(5200);
        await shot(`f${f}-ch${c}-b`);
      }
      await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(250);
    }
    await p.keyboard.press("Escape");
  });
if (!only)
  for (const roomId of buildings)
    await retry(roomId, async () => {
      await openMem({ kind: "building", roomId });
      await p.waitForSelector(".glass.memory");
      await p.waitForTimeout(1500);
      await shot(`bld-${roomId}-a`);
      await p.waitForTimeout(6000);
      await shot(`bld-${roomId}-b`);
      await p.keyboard.press("Escape");
    });
console.log("label overlaps:", overlaps.length ? `\n  ${overlaps.join("\n  ")}` : "none");
console.log("errors:", errors);
await browser.close();
