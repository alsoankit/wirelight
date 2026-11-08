/** The names the shell answers to (names.ts): what counts as a command line, and that each name is real. */
import type { SimEvent, Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { BUILTIN_COMMANDS, isCommandLine, PROGRAM_COMMANDS, SimBackend, type ToolId } from "../src";
import { testContent } from "./content";

const topology: Topology = {
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
      addrs: [{ dev: "eth0", cidr: "10.0.1.5/24" }],
    },
    {
      id: "kitchen",
      hostname: "kitchen",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }],
      addrs: [{ dev: "eth0", cidr: "10.0.1.7/24" }],
    },
  ],
  links: [{ id: "c1", a: { device: "observatory", iface: "eth0" }, b: { device: "kitchen", iface: "eth0" } }],
};

/** Every tool (`satisfies`: one missing here won't compile), so each program runs rather than being locked. */
const ALL_TOOLS = {
  "ip link": true,
  "lab send-frame": true,
  "lab card": true,
  "lab cable": true,
  "lab keeper": true,
  "lab scanner": true,
  "lab scanner trace": true,
  workbench: true,
  "bridge fdb": true,
  "bridge link": true,
  "ip addr": true,
  ping: true,
  "ip neigh": true,
  dhclient: true,
  "ip route": true,
  tcpdump: true,
  sysctl: true,
} satisfies Record<ToolId, true>;

/** Runs a line on the observatory with every tool; what it printed to stderr. */
function stderr(line: string): string[] {
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(Object.keys(ALL_TOOLS) as ToolId[]), subtitles: false });
  b.loadSync(topology, [], 1);
  const h = b.exec("observatory", line, "typed");
  return b
    .trace()
    .filter(
      (e): e is Extract<SimEvent, { kind: "proc.output" }> =>
        e.kind === "proc.output" && e.execId === h.execId && e.stream === "stderr",
    )
    .map((e) => e.text);
}

const notFound = (line: string) => stderr(line).some((text) => text.endsWith(": command not found"));

describe("command names", () => {
  it("tells a command from other typed text by its first word, after an optional sudo", () => {
    for (const line of ["ip link", "  ping 10.0.0.1", "sudo ip addr", "traceroute 10.0.0.9", "help"]) {
      expect(isCommandLine(line), line).toBe(true);
    }
    for (const line of ["", "   ", "hello there", "sudo", "ipp link", "my email is a@b.c"]) {
      expect(isCommandLine(line), line).toBe(false);
    }
  });

  it("names only commands the real shell answers", () => {
    for (const name of [...BUILTIN_COMMANDS, ...PROGRAM_COMMANDS]) expect(notFound(name), name).toBe(false);
    expect(notFound("nosuchcommand")).toBe(true);
  });
});
