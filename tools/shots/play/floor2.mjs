// Plays Floor 2's rooms by clicking and typing, as a player would.
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
    .waitForSelector(".debrief", { timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  console.log(name, ok ? "won" : "NOT WON", "| heard:", await p.textContent(".heard").catch(() => "-"));
};
const open = async (room) => {
  await p.goto(`${base}?room=${room}`);
  await p.waitForSelector(".plate", { timeout: 20000 });
  await p.waitForTimeout(2500);
};
const bench = async (to, door) => {
  await p.click("text=Workbench");
  await p.waitForTimeout(300);
  await p.fill(".panel input >> nth=0", to);
  if (door) await p.selectOption(".panel select", door);
  await p.click("text=Seal and send");
  await p.waitForTimeout(600);
};
// 2.1: write lantern's name on a frame.
await open("f2.first-light");
await p.screenshot({ path: `${out}-21.png` });
await bench("02:00:00:00:00:07");
await won("2.1");
// 2.2: catch one of the messenger's frames, then fix its card.
await open("f2.wrong-name");
await p.click("text=Capture jar");
await p.waitForTimeout(300);
console.log("jar:", (await p.textContent(".panel"))?.slice(0, 60));
await p.click(".panel .quiet");
await p.click("text=Address card");
await p.waitForTimeout(300);
await p.fill(".panel input", "02:00:00:00:00:07");
await p.click("text=Write it on the card");
await won("2.2");
// 2.3: call everyone out of eth1, then speak to quill by name.
await open("f2.who-are-you");
await p.screenshot({ path: `${out}-23.png` });
await bench("ff:ff:ff:ff:ff:ff", "eth1");
await p.waitForTimeout(3000);
await bench("02:00:00:00:00:0c", "eth1");
await won("2.3");
console.log(errs.join("\n") || "no errors");
await b.close();
