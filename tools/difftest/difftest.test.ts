/**
 * `pnpm difftest` (0045, tech/quality.md): every scenario on real Linux and on the simulator; they
 * must agree. Needs unprivileged user namespaces, iproute2 and tcpdump; takes real time (seconds per
 * scenario), so it isn't part of `pnpm test`.
 */
import { describe, expect, it } from "vitest";
import { compare } from "./compare";
import { runOnLinux } from "./linux";
import { SCENARIOS } from "./scenarios";
import { runOnSim } from "./simrun";

describe.each(SCENARIOS.map((s) => [s.name, s] as const))("%s", (_name, scenario) => {
  it("the simulator agrees with Linux", () => {
    const linux = runOnLinux(scenario);
    const sim = runOnSim(scenario);
    const diffs = compare(
      linux,
      sim,
      scenario.topology.devices.map((d) => d.id),
    );
    expect(diffs, diffs.join("\n")).toEqual([]);
  }, 120_000);
});
