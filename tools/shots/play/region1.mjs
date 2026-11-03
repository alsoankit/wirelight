// Plays every room of Region 1 (the Prologue, Floors 1 and 2) by clicking and typing, as a player
// would. Usage: node region1.mjs http://127.0.0.1:5173/play
import { arrived, bench, card, launch, open, plateSwitch, tidy, type, won } from "./lib.mjs";

const [base] = process.argv.slice(2);
const { browser, page: p, errors } = await launch();
const results = [];
const check = async (name) => results.push([name, await won(p, name)]);

await open(p, base, "p.first-message", ".send");
await p.click(".send");
await check("P");

await open(p, base, "f1.two-rooms");
await p.click("text=→ kitchen");
await arrived(p, "kitchen");
await tidy(p);
await p.click("button.plate");
await check("1.1");

await open(p, base, "f1.loose-cable");
await p.click("text=Cable end");
await check("1.2");

await open(p, base, "f1.both-ends");
await p.click("text=→ kitchen");
await arrived(p, "kitchen");
await plateSwitch(p);
await check("1.3");

await open(p, base, "f1.boss-dark-corridor");
await plateSwitch(p);
await p.click("text=→ kitchen");
await arrived(p, "kitchen");
await tidy(p);
await p.click("text=Cable end");
await p.waitForTimeout(600);
await plateSwitch(p);
await check("1.B");

await open(p, base, "f2.first-light");
await bench(p, "02:00:00:00:00:07");
await check("2.1");

await open(p, base, "f2.wrong-name");
await card(p, "02:00:00:00:00:07");
await check("2.2");

await open(p, base, "f2.who-are-you");
await bench(p, "ff:ff:ff:ff:ff:ff", "eth1");
await p.waitForTimeout(2500);
await bench(p, "02:00:00:00:00:0c", "eth1");
await check("2.3");

// 2.4 in a fresh browser would play the gift; with onboarding seen here, the gift still plays once.
await open(p, base, "f2.lights-out");
await p.click("button.plate");
await p.click("text=This switch is broken");
await p.waitForSelector(".lines", { timeout: 5000 });
while (await p.$(".lines")) await p.click(".lines button");
await p.waitForSelector(".cmd-memory");
while (await p.$(".cmd-memory")) await p.click(".cmd-memory button");
await p.waitForSelector(".console .xterm", { timeout: 5000 });
await type(p, "ip link set eth0 up");
await check("2.4");

await open(p, base, "f2.boss-silent-line", ".console .xterm");
await type(p, "ip link set eth1 up");
await bench(p, "ff:ff:ff:ff:ff:ff", "eth1");
await p.waitForTimeout(2500);
await card(p, "02:00:00:00:00:0e");
await check("2.B");

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : `all ${results.length} rooms won`);
console.log(errors.join("\n") || "no errors");
await browser.close();
process.exit(failed.length ? 1 : 0);
