/** `ping -t 0`, measured on Linux (iputils 20250605): refused after the route check, exit 2. */
import type { SimEvent, Topology } from "@wirelight/sim";
import { expect, it } from "vitest";
import { SimBackend } from "../src";
import { testContent } from "./content";

const topo: Topology = {
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
      addrs: [{ dev: "eth0", cidr: "10.0.1.5/24" }],
    },
  ],
  links: [],
};

function run(line: string): { code: number | null; err: string[] } {
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(["ping"]), subtitles: false });
  b.loadSync(topo, [], 1);
  const h = b.exec("observatory", line, "typed");
  const err = b
    .trace()
    .filter((e): e is Extract<SimEvent, { kind: "proc.output" }> => e.kind === "proc.output" && e.stream === "stderr")
    .map((e) => e.text);
  return { code: h.exitCode, err };
}

it("refuses a time-to-live of 0 once the address is reachable", () => {
  expect(run("ping -c 1 -t 0 10.0.1.7")).toEqual({
    code: 2,
    err: ["ping: cannot set unicast time-to-live: Invalid argument"],
  });
});

it("says the network is unreachable first when there's no route", () => {
  expect(run("ping -c 1 -t 0 10.0.9.7")).toEqual({ code: 2, err: ["ping: connect: Network is unreachable"] });
});
