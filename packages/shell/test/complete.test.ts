/** Tab completion (UI-09): only unlocked tools, their words, and this machine's door names. */
import { Simulator, type Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { complete, type ToolId } from "../src";

const topo: Topology = {
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [
        { name: "eth0", mac: "02:00:00:00:00:05" },
        { name: "eth1", mac: "02:00:00:00:00:06" },
      ],
    },
  ],
  links: [],
};
const sim = new Simulator(topo);
const tab = (line: string, tools: ToolId[]) => complete(sim, "observatory", line, new Set(tools));

describe("tab completion", () => {
  it("completes a command the player has, and never one they haven't found", () => {
    expect(tab("i", ["ip link"]).line).toBe("ip ");
    expect(tab("p", ["ip link"]).candidates).toEqual([]);
    expect(tab("p", ["ip link", "ping"]).line).toBe("ping ");
    expect(tab("", []).candidates).toEqual(["clear", "exit", "help", "history", "hostname", "man"]);
  });

  it("completes words, stopping where candidates differ", () => {
    expect(tab("ip l", ["ip link"]).line).toBe("ip link ");
    expect(tab("ip a", ["ip link"]).candidates).toEqual([]);
    expect(tab("ip link s", ["ip link"])).toEqual({ candidates: ["set", "show"], line: "ip link s" });
    expect(tab("lab scanner ", ["lab scanner"]).candidates).toEqual(["catch", "list", "open"]);
    expect(tab("lab scanner ", ["lab scanner", "lab scanner trace"]).candidates).toContain("trace");
  });

  it("knows this machine's doors, and up or down after a door", () => {
    expect(tab("ip link set e", ["ip link"]).candidates).toEqual(["eth0", "eth1"]);
    expect(tab("ip link set eth0 u", ["ip link"]).line).toBe("ip link set eth0 up ");
    expect(tab("ip addr add 10.0.1.5/24 dev e", ["ip addr"]).line).toBe("ip addr add 10.0.1.5/24 dev eth");
  });
});
