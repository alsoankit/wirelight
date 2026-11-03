// Plays the Prologue and room 0.1 in Chrome and saves screenshots: a visual end-to-end check.
// Usage: node tools/shots/play.mjs <url> <outdir>
import { chromium } from "playwright-core";

const [url = "http://localhost:5179/", out = "."] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await wait(1500);
  await shot("p1-prologue");
  await page.getByRole("button", { name: "Skip intro" }).click();
  await page.getByRole("button", { name: "Switch on message view" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.keyboard.press("Escape"); // the Glass opens on Send; close it to see the room
  await wait(1200);
  await shot("p2-sending");
  await wait(2600);
  await shot("p3-returned");
  await page.getByRole("dialog", { name: "Debrief" }).waitFor({ timeout: 8000 });
  await shot("p4-debrief");
  await page.getByRole("button", { name: "Continue" }).click();
  await wait(1200);
  await shot("r1-first-light");
  await page.getByRole("button", { name: "Workbench" }).click();
  await wait(400);
  await shot("r2-workbench");
  await page.getByRole("button", { name: "Seal and send" }).click();
  await wait(2500);
  await shot("r3-ignored");
  await page.getByRole("button", { name: "Walk through door eth0" }).click();
  await wait(600);
  await shot("r4-corridor");
  await page.getByRole("button", { name: "Into lantern's room" }).click();
  await wait(600);
  await shot("r5a-lantern-room");
  await page.getByRole("button", { name: "Plate of door eth0" }).click();
  await wait(400);
  await shot("r5-lantern-plate");
  await page.keyboard.press("Escape");
  await page.keyboard.press("1");
  await wait(500);
  await shot("r6-corridor-from-lantern");
  await page.keyboard.press("ArrowRight");
  await wait(500);
  await page.getByRole("button", { name: "Workbench" }).click();
  await page.getByRole("textbox").first().fill("02:00:00:00:00:07");
  await page.getByRole("button", { name: "Seal and send" }).click();
  await wait(450);
  await shot("r6b-just-sent");
  await page.keyboard.press("`");
  await wait(1500);
  await shot("r7-sent");
  await wait(2200);
  await shot("r8-won");
  await page.getByRole("dialog", { name: "Debrief" }).waitFor({ timeout: 8000 });
  await shot("r9-debrief");
  console.log(page.url());
} catch (e) {
  await shot("zz-failure");
  console.log(`FAILED: ${e.message.split("\n")[0]}`);
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
