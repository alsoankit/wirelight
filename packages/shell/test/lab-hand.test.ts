/** `lab keeper` and `lab cable` through the shell: what they run and say (text keys from content). */
import type { SimEvent, Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { SimBackend } from "../src";
import { testContent } from "./content";

function backend(asleep: boolean): SimBackend {
  const host = (id: string, mac: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
  });
  const topo: Topology = {
    devices: [
      { ...host("observatory", "02:00:00:00:00:05"), messenger: { to: "02:00:00:00:00:0a", intervalMs: 6000 } },
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
      host("anvil", "02:00:00:00:00:0a"),
    ],
    links: [
      { id: "a", a: { device: "observatory", iface: "eth0" }, b: { device: "hall", iface: "eth0" } },
      { id: "b", a: { device: "hall", iface: "eth1" }, b: { device: "anvil", iface: "eth0" } },
    ],
  };
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(["lab keeper", "lab cable"]), subtitles: false });
  b.loadSync(topo, asleep ? [{ kind: "keeper-asleep", device: "hall", desk: "switch" }] : [], 1);
  return b;
}

function run(b: SimBackend, device: string, line: string): { code: number | null; out: string[] } {
  const h = b.exec(device, line, "typed");
  const out = b
    .trace()
    .filter(
      (e): e is Extract<SimEvent, { kind: "proc.output" }> =>
        e.kind === "proc.output" && e.execId === h.execId && e.stream !== "note",
    )
    .map((e) => e.text);
  return { code: h.exitCode, out };
}

describe("lab keeper", () => {
  it("shows the desk, learns and sends, and says what it did", () => {
    const b = backend(true);
    expect(run(b, "hall", "lab keeper show")).toEqual({ code: 0, out: ["keeper.desk-empty"] });
    b.advance(2000);
    expect(run(b, "hall", "lab keeper show").out).toEqual([
      "keeper.desk",
      "keeper.desk-frame 1 02:00:00:00:00:05 02:00:00:00:00:0a eth0",
    ]);
    expect(run(b, "hall", "lab keeper learn 02:00:00:00:00:05 eth0")).toEqual({
      code: 0,
      out: ["keeper.learned 02:00:00:00:00:05 eth0"],
    });
    expect(run(b, "hall", "lab keeper send flood")).toEqual({ code: 0, out: ["keeper.flooded flood"] });
    expect(run(b, "hall", "lab keeper send eth1")).toEqual({ code: 1, out: ["keeper.empty eth1"] });
  });

  it("refuses while the keeper is awake, and explains its usage", () => {
    const b = backend(false);
    expect(run(b, "hall", "lab keeper send flood")).toEqual({ code: 1, out: ["keeper.not-asleep flood"] });
    expect(run(b, "hall", "lab keeper juggle").code).toBe(2);
  });
});

describe("lab cable", () => {
  it("unplugs and plugs a door's cable", () => {
    const b = backend(false);
    expect(run(b, "observatory", "lab cable unplug eth0")).toEqual({ code: 0, out: ["cable.unplugged eth0"] });
    expect(b.world.oper("observatory", "eth0").carrier).toBe(false);
    expect(run(b, "observatory", "lab cable plug eth0")).toEqual({ code: 0, out: ["cable.plugged eth0"] });
    expect(run(b, "observatory", "lab cable plug eth7")).toEqual({ code: 1, out: ["cable.no-door eth7"] });
  });
});
