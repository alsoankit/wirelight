// Plays the secret rooms that no region script plays (Regions 1, 3 and 4's, on Floors 2, 7 and 9) by
// clicking and typing, as a player would. Usage: node secrets.mjs http://127.0.0.1:5173/play
import { tmpdir } from "node:os";
import { arrived, bench, closeConsole, launch, open, tidy, type, won } from "./lib.mjs";

const [base] = process.argv.slice(2);
const { browser, page: p, errors } = await launch();
const results = [];
/** Plays one room: its steps, then the win. A step that fails is that room's failure, not the run's. */
const play = async (name, steps) => {
  try {
    await steps();
    results.push([name, await won(p, name)]);
  } catch (e) {
    console.log(name, "NOT WON:", e.message.split("\n")[0]);
    results.push([name, false]);
  }
};
/** Walks through doors, one machine after another (each name is the room at the far end). */
const walk = async (...rooms) => {
  for (const to of rooms) {
    await tidy(p);
    await closeConsole(p);
    // Drawing in software, a click can take seconds to go through (8 s at under two frames a second).
    const why = await p
      .click(`text=→ ${to} >> nth=0`, { timeout: 120000 })
      .then(() => null)
      .catch((e) =>
        e.message
          .split("\n")
          .filter((l) => /intercepts|visible|stable|outside/.test(l))
          .join(" | "),
      );
    if (why !== null) {
      await p.screenshot({ path: `${tmpdir()}/wirelight-walk-${to}.png` }).catch(() => {});
      throw new Error(`walk: no way through to ${to} after two minutes: ${why}`);
    }
    await arrived(p, to);
    await tidy(p);
  }
};
/** Reads, in Captures, who sent what last arrived at one of the player's doors (no catch needed). */
const lastFrom = async (door) => {
  await tidy(p);
  await p.click(".jar-button");
  const from = await p.waitForFunction(
    (d) =>
      [...document.querySelectorAll(".arrived-list li")]
        .find((li) => li.querySelector(".arrived-door")?.textContent === d)
        ?.textContent?.match(/from ([0-9a-f]{2}(?::[0-9a-f]{2}){5})/)?.[1],
    door,
    { timeout: 60000, polling: 250 },
  );
  const mac = await from.jsonValue();
  await p.click(".panel button:has-text('Close')");
  await p.waitForTimeout(300);
  return mac;
};

// Region 1's, Why 48 Bits?: everyone called out of eth1, the vault's factory name read off Captures,
// then a frame to that name.
await play("secret: Why 48 Bits?", async () => {
  await open(p, base, "f2.secret-48-bits");
  await bench(p, "ff:ff:ff:ff:ff:ff", "eth1");
  const vault = await lastFrom("eth1");
  console.log("the vault answered from", vault);
  await bench(p, vault, "eth1");
});

// Region 3's, Half a Street: the plate's slot is broken, so the house gets its /24 back by voice.
await play("secret: Half a Street", async () => {
  await open(p, base, "f7.secret-binary");
  await type(p, "ip addr del 10.0.1.5/25 dev eth0");
  await type(p, "ip addr add 10.0.1.5/24 dev eth0");
  await type(p, "ping -c 3 10.0.1.200");
});

// Region 4's, The Box at Home: a lease from home, the world silent, IP forwarding on in home's room,
// then the world again from the observatory.
await play("secret: The Box at Home", async () => {
  await open(p, base, "f9.secret-home-router");
  await type(p, "dhclient -v eth0");
  await type(p, "ping -c 2 10.0.9.7");
  await walk("home");
  await type(p, "sysctl -w net.ipv4.ip_forward=1");
  await walk("observatory");
  await type(p, "ping -c 3 10.0.9.7");
});

const failed = results.filter(([, ok]) => !ok).map(([n]) => n);
console.log(failed.length ? `FAILED: ${failed.join(", ")}` : `all ${results.length} rooms won`);
console.log(errors.join("\n") || "no errors");
await browser.close();
process.exit(failed.length ? 1 : 0);
