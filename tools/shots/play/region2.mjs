// Plays every room of Region 2 (Floors 3 and 4) by clicking and typing, as a player would.
// Usage: node region2.mjs http://127.0.0.1:5173/play
import { bench, card, closeConsole, launch, open, tidy, type, won } from "./lib.mjs";

const [base] = process.argv.slice(2);
const { browser, page: p, errors } = await launch();
const results = [];
const check = async (name) => results.push([name, await won(p, name)]);
const walk = async (to) => {
  await tidy(p);
  await closeConsole(p);
  await p.click(`text=→ ${to} >> nth=0`);
  await p.waitForTimeout(1800);
  await tidy(p);
};
const fast = async () => {
  // 1× → 4× → 16× on the top bar's speed button.
  for (let i = 0; i < 2; i++) await p.click(".top-bar button:has-text('×')");
};
/** Waits until `ms` more of network time have passed (the clock slows while frames cross). */
const waitNet = async (ms) => {
  const now = () => p.evaluate(() => window.__wirelight.useSession.getState().status?.now ?? 0);
  const end = (await now()) + ms;
  await p.waitForFunction((t) => (window.__wirelight.useSession.getState().status?.now ?? 0) >= t, end, {
    timeout: 120000,
    polling: 250,
  });
};
/** Waits until the keeper's desk shows a frame from `mac`, then remembers it and sends it out. */
const sortByHand = async (mac, out, learn = true) => {
  await p.waitForFunction((m) => document.querySelector(".panel")?.textContent?.includes(`A frame from ${m}`), mac, {
    timeout: 15000,
  });
  if (learn) await p.click(".panel button:has-text('Remember')");
  await p.waitForTimeout(200);
  await p.selectOption(".panel select", out);
  await p.click(".panel button:has-text('Send') >> nth=-1");
  await p.waitForTimeout(400);
};

// 3.1: the keeper has forgotten; sort the first frames by hand at its desk.
await open(p, base, "f3.many-doors");
await walk("hall");
await p.screenshot({
  path: "/tmp/r2-hall.png",
});
await p.click("text=Keeper's desk");
await sortByHand("02:00:00:00:00:05", "flood");
await sortByHand("02:00:00:00:00:0a", "eth0");
await sortByHand("02:00:00:00:00:05", "eth3", false);
await check("3.1");

// 3.2: everyone speaks, the hall's memory is read by voice (its board is clouded), then gate by name.
await open(p, base, "f3.keepers-memory");
await bench(p, "ff:ff:ff:ff:ff:ff");
await p.waitForTimeout(2500);
await walk("hall");
await type(p, "bridge fdb show");
await walk("observatory");
await bench(p, "02:00:00:00:00:0f");
await check("3.2");

// 3.3: three cards, one per door.
await open(p, base, "f3.find-everyone");
await bench(p, "ff:ff:ff:ff:ff:ff");
await p.waitForTimeout(2500);
await card(p, "02:00:00:00:00:10", 0);
await card(p, "02:00:00:00:00:11", 1);
await card(p, "02:00:00:00:00:12", 2);
await check("3.3");

// 3.B: the hall's eth2 by voice, everyone speaks, wren's name on the card.
await open(p, base, "f3.boss-busy-hall");
await walk("hall");
await type(p, "ip link set eth2 up");
await walk("observatory");
await bench(p, "ff:ff:ff:ff:ff:ff");
await p.waitForTimeout(2500);
await card(p, "02:00:00:00:00:13");
await check("3.B");

// 4.1: the pinned memory, removed.
await open(p, base, "f4.pinned-memory");
await walk("hall");
await type(p, "bridge fdb del 02:00:00:00:00:07 dev eth1 master");
await check("4.1");

// 4.2: everyone speaks, then anvil by name.
await open(p, base, "f4.who-has-the-key");
await bench(p, "ff:ff:ff:ff:ff:ff");
await p.waitForTimeout(3000);
await bench(p, "02:00:00:00:00:0a");
await check("4.2");

// 4.3: plug in the spare, watch the storm, unplug it again, then write to anvil.
await open(p, base, "f4.spare-cable");
await walk("hall-a");
await walk("hall-b");
await type(p, "lab cable plug eth4");
await fast();
await waitNet(3000);
await type(p, "bridge fdb show");
await type(p, "lab cable unplug eth4");
await waitNet(5000);
await walk("hall-a");
await walk("observatory");
await bench(p, "02:00:00:00:00:0a");
await check("4.3");

// 4.B: break the loop in hall-b, remove the wrong memory, write to wren.
await open(p, base, "f4.boss-storm");
await walk("hall-a");
await walk("hall-b");
await type(p, "ip link set eth4 down");
await type(p, "bridge fdb del 02:00:00:00:00:13 dev eth2 master");
await walk("hall-a");
await walk("observatory");
await bench(p, "02:00:00:00:00:13");
await check("4.B");

// The Peacekeeper: the spanning tree on in both halls, the span in use pulled, the spare takes over.
await open(p, base, "f4.secret-peacekeeper");
await walk("hall-a");
await type(p, "ip link set br0 type bridge stp_state 1");
await walk("hall-b");
await type(p, "ip link set br0 type bridge stp_state 1");
await fast();
// The first hello comes 2 s after the peacekeeper wakes; one door blocks when it comes back round.
await waitNet(6000);
await type(p, "bridge link show");
await walk("hall-a");
await type(p, "bridge link show");
await type(p, "lab cable unplug eth3");
// The held door waits for its stale note (20 s), listens 15 s, learns 15 s.
await waitNet(55000);
await walk("observatory");
await bench(p, "02:00:00:00:00:13");
await check("secret: The Peacekeeper");

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : `all ${results.length} rooms won`);
console.log(errors.join("\n") || "no errors");
await browser.close();
process.exit(failed.length ? 1 : 0);
