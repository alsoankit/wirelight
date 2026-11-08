// Plays every room of Region 3 (Floors 5, 6 and 7) by clicking and typing, as a player would.
// Usage: node region3.mjs http://127.0.0.1:5173/play
import { arrived, card, closeConsole, launch, open, tidy, type, won } from "./lib.mjs";

const [base] = process.argv.slice(2);
const { browser, page: p, errors } = await launch();
const results = [];
const check = async (name) => results.push([name, await won(p, name)]);
const walk = async (to) => {
  await tidy(p);
  await closeConsole(p);
  await p.click(`text=→ ${to} >> nth=0`);
  await arrived(p, to);
  await tidy(p);
};
const fast = async () => {
  // 1× → 4× → 16× on the top bar's speed button.
  for (let i = 0; i < 2; i++) await p.click(".top-bar button:has-text('×')");
};
const giveAddress = async (cidr) => {
  await tidy(p);
  await p.click("button.plate >> nth=0");
  await p.waitForTimeout(300);
  await p.fill(".addr-form input", cidr);
  await p.click(".addr-form button");
  await p.waitForTimeout(500);
};
const scanner = async () => {
  await tidy(p);
  await p.click(".captures-button");
  await p.waitForTimeout(300);
};

// 5.1: the card takes a house address.
await open(p, base, "f5.where-not-who");
await card(p, "10.0.1.7");
await check("5.1");

// 5.2: an address by the plate's slot, then ping.
await open(p, base, "f5.place-to-live");
await giveAddress("10.0.1.5/24");
await type(p, "ping -c 3 10.0.1.7");
await check("5.2");

// 5.3: by voice, then everyone answers.
await open(p, base, "f5.roll-call");
await type(p, "ip addr add 10.0.1.5/24 dev eth0");
for (const ip of ["10.0.1.7", "10.0.1.10", "10.0.1.12", "10.0.1.18"]) {
  await type(p, `ping -c 1 ${ip}`);
}
await check("5.3");

// 5.B: an address, the square's door to kitchen, the card.
await open(p, base, "f5.boss-quiet-street");
await type(p, "ip addr add 10.0.1.5/24 dev eth0");
await walk("square");
await type(p, "ip link set eth1 up");
await walk("observatory");
await card(p, "10.0.1.7");
await check("5.B");

// 6.1: the Scanner catches kitchen's announcement and opens it to the message.
await open(p, base, "f6.inside-the-envelope");
await scanner();
await p.fill(".addr-form input", "10.0.1.7");
await p.click(".addr-form button");
await p.waitForSelector(".catch-list li", { timeout: 15000 });
await p.click(".catch-list li >> nth=0 >> text=Message");
await p.waitForTimeout(500);
await p.screenshot({
  path: "/tmp/r3-scanner.png",
});
await check("6.1");

// 6.2: wrapping by hand at the house's desk.
await open(p, base, "f6.who-has-this-address");
await type(p, "ping -c 3 10.0.1.7");
await p.click("text=Keeper's desk");
await p.waitForSelector(".panel button:has-text('Ask everyone')", { timeout: 5000 });
await p.click(".panel button:has-text('Ask everyone')");
await p.waitForTimeout(600);
for (let i = 0; i < 2; i++) {
  await p.waitForFunction(() => document.querySelector(".panel")?.textContent?.includes("A packet from"), null, {
    timeout: 8000,
  });
  await p.fill(".panel .desk-wrap input", "02:00:00:00:00:17");
  await p.click(".panel button:has-text('Send') >> nth=-1");
  await p.waitForTimeout(900);
}
await check("6.2");

// 6.3: library gives kitchen's address back and takes its own; the ledger catches up.
await open(p, base, "f6.two-of-me");
await walk("square");
await walk("library");
await type(p, "ip addr del 10.0.1.7/24 dev eth0");
await type(p, "ip addr add 10.0.1.12/24 dev eth0");
await fast();
await check("6.3");

// 6.B: the pinned line, and chapel's borrowed address.
await open(p, base, "f6.boss-mixed-up-letters");
await type(p, "ip neigh del 10.0.1.7 dev eth0");
await walk("square");
await walk("chapel");
await type(p, "ip addr del 10.0.1.10/24 dev eth0");
await type(p, "ip addr add 10.0.1.18/24 dev eth0");
await walk("square");
await walk("observatory");
await type(p, "ping -c 3 10.0.1.7");
await type(p, "ping -c 3 10.0.1.10");
await check("6.B");

// 7.1: off the wrong street, onto the right one, by the slot.
await open(p, base, "f7.same-street");
await p.click("button.plate >> nth=0");
await p.waitForTimeout(300);
await p.click(".addr-row button");
await p.waitForTimeout(500);
await giveAddress("10.0.1.5/24");
await type(p, "ping -c 3 10.0.1.7");
await check("7.1");

// 7.2: ask the registry.
await open(p, base, "f7.ask-for-an-address");
await type(p, "dhclient -v eth0");
await type(p, "ping -c 3 10.0.1.7");
await check("7.2");

// 7.B: chapel and cellar to their own houses, then ask the registry, then the census.
await open(p, base, "f7.boss-census");
await walk("square");
await walk("chapel");
await type(p, "ip addr del 10.0.1.100/24 dev eth0");
await type(p, "ip addr add 10.0.1.18/24 dev eth0");
await walk("square");
await walk("cellar");
await type(p, "ip addr del 10.0.2.14/24 dev eth0");
await type(p, "ip addr add 10.0.1.14/24 dev eth0");
await walk("square");
await walk("observatory");
await type(p, "dhclient -v eth0");
for (const ip of ["10.0.1.7", "10.0.1.12", "10.0.1.10", "10.0.1.18", "10.0.1.14"]) {
  await type(p, `ping -c 1 ${ip}`);
}
await check("7.B");

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : `all ${results.length} rooms won`);
console.log(errors.join("\n") || "no errors");
await browser.close();
process.exit(failed.length ? 1 : 0);
