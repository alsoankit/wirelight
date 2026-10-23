// Plays every room of Region 4 (Floors 8 and 9) by clicking and typing, as a player would.
// Usage: node region4.mjs http://127.0.0.1:5173/play
import { arrived, closeConsole, launch, open, tidy, type, waitPrompt, won } from "./lib.mjs";

const [base] = process.argv.slice(2);
const { browser, page: p, errors } = await launch();
const results = [];
const check = async (name) => results.push([name, await won(p, name)]);
const isWon = () => p.evaluate(() => !!window.__wirelight.useSession.getState().status?.won);
/** Walks through doors, one machine after another (each name is the room at the far end). */
const walk = async (...rooms) => {
  for (const to of rooms) {
    // Won on the way (a ping already in flight came back): the debrief comes up and the room's labels
    // hide under it (0076), so there's nothing left to walk to. Checked before and while clicking.
    if (await isWon()) return;
    await tidy(p);
    await closeConsole(p);
    for (let tries = 1; ; tries++) {
      const clicked = await p
        .click(`text=→ ${to} >> nth=0`, { timeout: 4000 })
        .then(() => true)
        .catch(() => false);
      if (clicked) break;
      if (await isWon()) return;
      if (tries === 15) throw new Error(`walk: no way through to ${to} after a minute`);
    }
    await arrived(p, to);
    await tidy(p);
  }
};
const slate = async () => {
  await tidy(p);
  await p.click(".jar-button");
  await p.waitForTimeout(300);
};

// 8.1: two pings across one street each.
await open(p, base, "f8.other-street");
await type(p, "ping -c 1 10.0.1.1");
await walk("nave", "crossing", "cloister", "vesper");
await type(p, "ping -c 1 10.0.2.1");
await check("8.1");

// 8.2: the routing board works: a default line via crossing.
await open(p, base, "f8.across-the-street");
await p.click("text=Routing board");
await p.waitForSelector(".panel .addr-form input");
await p.fill(".panel .addr-form input", "10.0.1.1");
await p.click(".panel .addr-form button");
await p.waitForTimeout(500);
await type(p, "ping -c 3 10.0.2.7");
await check("8.2");

// 8.3: directions on crossing.
await open(p, base, "f8.directions");
await walk("nave", "crossing");
await type(p, "ip route add 10.0.3.0/24 via 10.0.2.2");
await walk("nave", "observatory");
await type(p, "ping -c 3 10.0.3.7");
await check("8.3");

// 8.4: listen in vesper's room with the Slate's Capture, then give vesper a way back.
await open(p, base, "f8.no-way-back");
await p.click(".console-bar");
await p.click(".console-term");
await p.keyboard.type("ping -c 4 10.0.2.7");
await p.keyboard.press("Enter");
await walk("nave", "crossing", "cloister", "vesper");
await slate();
await p.click(".panel button:has-text('Start')");
await p.waitForTimeout(4000);
await p.screenshot({
  path: "/tmp/r4-capture.png",
});
await p.click(".panel button:has-text('Stop')");
await p.click(".panel .quiet");
await type(p, "ip route add default via 10.0.2.1");
await walk("cloister", "crossing", "nave", "observatory");
await waitPrompt(p);
await type(p, "ping -c 3 10.0.2.7");
await check("8.4");

// 8.5: the navigator sleeps; forward by hand at the lectern, then let it forward.
await open(p, base, "f8.sleeping-keeper");
await p.click(".console-bar");
await p.click(".console-term");
await p.keyboard.type("ping -c 1 10.0.2.7");
await p.keyboard.press("Enter");
await walk("nave", "crossing");
await p.click("text=Lectern");
await p.waitForSelector(".panel button:has-text('Ask everyone')", { timeout: 10000 });
await p.click(".panel button:has-text('Ask everyone')");
await p.waitForTimeout(800);
await p.check(".panel .radio input");
await p.fill(".panel .desk-wrap input", "02:00:00:00:00:27");
await p.click(".panel button:has-text('Send') >> nth=-1");
await p.waitForFunction(() => document.querySelector(".panel")?.textContent?.includes("from 10.0.2.7"), null, {
  timeout: 15000,
});
await p.check(".panel .radio input");
await p.fill(".panel .desk-wrap input", "02:00:00:00:00:05");
await p.click(".panel button:has-text('Send') >> nth=-1");
await p.waitForTimeout(800);
await p.click(".panel .quiet");
await type(p, "sysctl -w net.ipv4.ip_forward=1");
await walk("nave", "observatory");
await waitPrompt(p);
await type(p, "ping -c 3 10.0.2.7");
await check("8.5");

// 8.B: four faults across four machines.
await open(p, base, "f8.boss-closed-crossing");
await type(p, "ip route add default via 10.0.1.1");
await walk("nave", "crossing");
await type(p, "ip route add 10.0.3.0/24 via 10.0.2.2");
await walk("cloister", "arch");
await type(p, "sysctl -w net.ipv4.ip_forward=1");
await walk("tower", "lumen");
await type(p, "ip route del default");
await type(p, "ip route add default via 10.0.3.1");
await walk("tower", "arch", "cloister", "crossing", "nave", "observatory");
await type(p, "ping -c 3 10.0.3.7");
await check("8.B");

// 9.1: trace one ping and compare two of its catches.
await open(p, base, "f9.two-envelopes");
await slate();
await p.click(".panel button:has-text('Trace')");
await p.click(".panel .quiet");
await type(p, "ping -c 1 10.0.3.7");
await slate();
await p.waitForSelector(".catch-list li >> nth=2", { timeout: 15000 });
await p.fill(".panel .addr-form input[type=number] >> nth=0", "1");
await p.fill(".panel .addr-form input[type=number] >> nth=1", "3");
await p.click(".panel button:has-text('Compare')");
await p.waitForTimeout(800);
await p.screenshot({
  path: "/tmp/r4-compare.png",
});
await check("9.1");

// 9.2: wren gets a way off its street, then traces its own ping home.
await open(p, base, "f9.show-the-way");
await walk("nave", "crossing", "cloister", "arch", "tower", "wren");
await type(p, "ip route add default via 10.0.3.1");
await slate();
await p.click(".panel button:has-text('Trace')");
await p.click(".panel .quiet");
await type(p, "ping -c 1 10.0.1.5");
await check("9.2");

// 9.3: one step, then two.
await open(p, base, "f9.one-step-only");
await type(p, "ping -c 1 -t 1 10.0.3.7");
await type(p, "ping -c 1 -t 2 10.0.3.7");
await check("9.3");

// 9.4: arch's missing line ends the loop.
await open(p, base, "f9.round-and-round");
await walk("nave", "crossing", "cloister", "arch");
await type(p, "ip route add 10.0.4.0/24 via 10.0.3.2");
await walk("cloister", "crossing", "nave", "observatory");
await type(p, "ping -c 3 10.0.4.7");
await check("9.4");

// 9.B: the crossing, by voice, machine by machine.
await open(p, base, "f9.boss-crossing");
await walk("nave", "crossing");
await type(p, "ip route add 10.0.3.0/24 via 10.0.2.2");
await type(p, "ip route add 10.0.4.0/24 via 10.0.2.2");
await walk("cloister", "arch");
await type(p, "ip route add 10.0.4.0/24 via 10.0.3.2");
await walk("tower", "spire");
await type(p, "sysctl -w net.ipv4.ip_forward=1");
await walk("window", "halo");
await type(p, "ip route del default");
await type(p, "ip route add default via 10.0.4.1");
await walk("window", "spire", "tower", "arch", "cloister", "crossing", "nave", "observatory");
await type(p, "ping -c 3 10.0.4.7");
await check("9.B");

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : `all ${results.length} rooms won`);
console.log(errors.join("\n") || "no errors");
await browser.close();
process.exit(failed.length ? 1 : 0);
