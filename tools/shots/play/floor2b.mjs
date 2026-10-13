// Plays 2.4 (the gift of the voice, then the console) and 2.B (the region's grand boss).
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
  console.log(name, ok ? "won" : "NOT WON");
};
const type = async (line) => {
  await p.click(".console-term");
  await p.keyboard.type(line);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(700);
};
// 2.4: the switch is worn out; touching it brings the gift.
await p.goto(`${base}?room=f2.lights-out`);
await p.waitForSelector(".plate", { timeout: 20000 });
await p.waitForTimeout(2500);
console.log("console before the gift:", (await p.$(".console")) !== null);
await p.click("button.plate");
await p.click("text=The switch is cracked");
await p.waitForSelector(".lines", { timeout: 5000 });
let n = 0;
while (await p.$(".lines")) {
  if (n === 1) await p.screenshot({ path: `${out}-gift.png` });
  await p.click(".lines button");
  await p.waitForTimeout(150);
  n++;
}
console.log("lines:", n);
await p.waitForSelector(".cmd-memory");
for (let i = 0; i < 4; i++) {
  if (i === 2) await p.screenshot({ path: `${out}-cmd01.png` });
  await p.click(".cmd-memory button");
  await p.waitForTimeout(150);
}
await p.waitForSelector(".console .xterm", { timeout: 5000 });
await type("ip link");
await type("ip link set eth0 up");
await won("2.4");
// 2.B: eth1 on by voice, broadcast out of eth1, write moth's name on the card.
await p.goto(`${base}?room=f2.boss-silent-line`);
await p.waitForSelector(".console .xterm", { timeout: 20000 });
await p.waitForTimeout(2000);
await type("ip link set eth1 up");
await p.click("text=Workbench");
await p.fill(".panel input >> nth=0", "ff:ff:ff:ff:ff:ff");
await p.selectOption(".panel select", "eth1");
await p.click("text=Seal and send");
await p.waitForTimeout(3000);
await p.click("text=Address card");
await p.fill(".panel input", "02:00:00:00:00:0e");
await p.click("text=Write it on the card");
await won("2.B");
console.log(errs.join("\n") || "no errors");
await b.close();
