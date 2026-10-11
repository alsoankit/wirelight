/**
 * Golden tests (NFR-09): our output must match output captured on real Linux by
 * tools/golden/capture.sh, after normalizing what differs between a veth pair and a real NIC.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { SimBackend } from "../src";
import { testContent } from "./content";

const dir = join(import.meta.dirname, "golden");

const topology: Topology = {
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
    },
    { id: "lantern", hostname: "lantern", kind: "host", interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }] },
  ],
  links: [{ id: "c1", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
};

/** veth artifacts → physical NIC (docs/sim-deviations.md). */
function normalize(line: string): string {
  return line
    .replace(/^(\d+: \w+)@if\d+:/, "$1:")
    .replace(/ link-netns \S+$/, "")
    .replace(/qdisc noqueue state (UP|DOWN)/, "qdisc fq_codel state $1");
}

function scenario(obs: string, lantern: string): SimBackend {
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(["ip link"]), subtitles: false });
  b.loadSync(topology, obs === "never" ? [{ kind: "iface-down", device: "observatory", iface: "eth0" }] : [], 1);
  if (obs === "down") b.world.setAdmin("observatory", "eth0", false);
  if (lantern === "down") b.world.setAdmin("lantern", "eth0", false);
  return b;
}

describe("golden: ip", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".txt"))) {
    it(file.replace(/\.txt$/, ""), () => {
      const lines = readFileSync(join(dir, file), "utf8").trimEnd().split("\n");
      const [setup = "", cmd = "", ...rest] = lines;
      const [, obs = "", lantern = ""] = /# obs=(\w+) lantern=(\w+)/.exec(setup) ?? [];
      const exit = Number(/\[exit (\d+)\]/.exec(rest.pop() ?? "")?.[1]);
      const b = scenario(obs, lantern);
      const h = b.exec("observatory", cmd.replace(/^\$ /, ""), "typed");
      const ours = b
        .trace()
        .filter((e) => e.kind === "proc.output" && e.execId === h.execId)
        .map((e) => (e.kind === "proc.output" ? e.text : ""));
      expect(ours).toEqual(rest.map(normalize));
      expect(h.exitCode).toBe(exit);
    });
  }
});
