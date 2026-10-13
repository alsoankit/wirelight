// Plays Floor 1's rooms 1.2, 1.3 and 1.B by clicking, as a player would.
import { chromium } from "playwright-core";

const [base, out] = process.argv.slice(2);
const b = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(`pageerror: ${e}`));
const won = async (name) => {
  const ok = await p
    .waitForSelector(".debrief", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  console.log(name, ok ? "won" : "NOT WON", "| heard:", await p.textContent(".heard").catch(() => "-"));
};
const plateSwitch = async () => {
  await p.click("button.plate");
  await p.waitForTimeout(500);
  await p.click(".panel-actions button:first-child");
  await p.waitForTimeout(800);
};
const open = async (room) => {
  await p.goto(`${base}?room=${room}`);
  await p.waitForSelector(".plate", { timeout: 20000 });
  await p.waitForTimeout(3000);
};
// 1.2: the loose end by your door.
await open("f1.loose-cable");
await p.screenshot({ path: `${out}-12-start.png` });
await p.click("text=Cable end");
await won("1.2");
// 1.3: lantern's door is off; its plate has a switch.
await open("f1.both-ends");
await p.click("text=→ lantern");
await p.waitForTimeout(2500);
await plateSwitch();
await won("1.3");
// 1.B: your door off, lantern's end out, lantern's door off.
await open("f1.boss-dark-corridor");
await plateSwitch();
await p.click("text=→ lantern");
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}-1b-lantern.png` });
await p.click("text=Cable end");
await p.waitForTimeout(800);
await plateSwitch();
await won("1.B");
console.log(errs.join("\n") || "no errors");
await b.close();
