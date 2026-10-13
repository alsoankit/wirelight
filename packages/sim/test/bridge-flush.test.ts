/**
 * A bridge port that stops forwarding loses its learned entries; static ones stay (measured on
 * kernel 7.1.13: carrier loss and admin down both flush, `bridge fdb add … static [sticky]` survives).
 */
import { describe, expect, it } from "vitest";
import { Simulator, type Topology } from "../src";

function hall(): Topology {
  return {
    devices: [
      {
        id: "hall",
        hostname: "hall",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:30" },
          { name: "eth1", mac: "02:00:00:00:00:31" },
        ],
        bridges: [{ name: "br0", ports: ["eth0", "eth1"] }],
      },
      { id: "a", hostname: "a", kind: "host", interfaces: [{ name: "eth0", mac: "02:00:00:00:00:0a" }] },
      { id: "b", hostname: "b", kind: "host", interfaces: [{ name: "eth0", mac: "02:00:00:00:00:0b" }] },
    ],
    links: [
      { id: "la", a: { device: "a", iface: "eth0" }, b: { device: "hall", iface: "eth0" } },
      { id: "lb", a: { device: "b", iface: "eth0" }, b: { device: "hall", iface: "eth1" } },
    ],
  };
}

const learned = (sim: Simulator) =>
  (sim.device("hall")?.bridges.br0?.fdb ?? [])
    .filter((e) => !e.local)
    .map((e) => `${e.mac} ${e.port}${e.static ? " static" : ""}`);

describe("bridge port down", () => {
  for (const how of ["carrier", "admin"] as const)
    it(`flushes what was learned on the port (${how}), keeping static entries`, () => {
      const sim = new Simulator(hall(), [
        { kind: "fdb-static", device: "hall", mac: "02:00:00:00:00:cc", port: "eth0", sticky: true },
      ]);
      sim.sendLabFrame("a", { to: "ff:ff:ff:ff:ff:ff", msg: "hi" });
      sim.sendLabFrame("b", { to: "ff:ff:ff:ff:ff:ff", msg: "hi" });
      sim.advance(100);
      expect(learned(sim)).toEqual(expect.arrayContaining(["02:00:00:00:00:0a eth0", "02:00:00:00:00:0b eth1"]));
      if (how === "carrier") sim.setAdmin("a", "eth0", false);
      else sim.setAdmin("hall", "eth0", false);
      expect(learned(sim).sort()).toEqual(["02:00:00:00:00:0b eth1", "02:00:00:00:00:cc eth0 static"]);
    });
});
