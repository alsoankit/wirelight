/**
 * Golden tests for every captured command family (SH-08): each case in golden/manifest.json is rebuilt
 * in the simulator (the same topology, the same setup steps, at the same moments) and the command's
 * output must equal what real Linux printed, after the capture's own normalisation (tools/golden/lib.sh).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SimEvent, Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { SimBackend, type ToolId } from "../src";
import { testContent as shellContent } from "./content";

const dir = join(import.meta.dirname, "golden");

type Case = {
  family: string;
  case: string;
  file: string;
  topology: string;
  device: string;
  setup: string[];
  command: string;
  actualCommand: string;
  exit: number;
};

const host = (id: string, iface: string, mac: string, cidr?: string, gw?: string) => ({
  id,
  hostname: id,
  kind: "host" as const,
  interfaces: [{ name: iface, mac }],
  addrs: cidr ? [{ dev: iface, cidr }] : [],
  routes: gw ? [{ dst: "default", via: gw }] : [],
});

/** The capture's topologies (tools/golden/lib.sh), rebuilt. */
function topology(name: string): Topology {
  if (name === "lan" || name === "lan-bare") {
    const bare = name === "lan-bare";
    return {
      devices: [
        host("observatory", "eth0", "02:00:00:00:00:05", bare ? undefined : "10.0.0.5/24"),
        host("lantern", "eth0", "02:00:00:00:00:07", bare ? undefined : "10.0.0.7/24"),
      ],
      links: [{ id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
    };
  }
  if (name === "switch" || name === "switch-ip") {
    const ip = name === "switch-ip";
    return {
      devices: [
        {
          id: "hall",
          hostname: "hall",
          kind: "host",
          interfaces: [
            { name: "eth1", mac: "02:00:00:00:00:11" },
            { name: "eth2", mac: "02:00:00:00:00:12" },
            { name: "eth3", mac: "02:00:00:00:00:13" },
          ],
          bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"] }],
        },
        host("a", "eth0", "02:00:00:00:00:0a", ip ? "10.0.0.1/24" : undefined),
        host("b", "eth0", "02:00:00:00:00:0b", ip ? "10.0.0.2/24" : undefined),
        host("c", "eth0", "02:00:00:00:00:0c", ip ? "10.0.0.3/24" : undefined),
      ],
      links: [
        { id: "l1", a: { device: "hall", iface: "eth1" }, b: { device: "a", iface: "eth0" } },
        { id: "l2", a: { device: "hall", iface: "eth2" }, b: { device: "b", iface: "eth0" } },
        { id: "l3", a: { device: "hall", iface: "eth3" }, b: { device: "c", iface: "eth0" } },
      ],
    };
  }
  const m = name.match(/^routed-fwd-(on|off)(-nogw)?$/);
  if (!m) throw new Error(`unknown golden topology ${name}`);
  const gw = !m[2];
  return {
    devices: [
      host("left", "eth0", "02:00:00:00:00:21", "10.0.1.10/24", gw ? "10.0.1.1" : undefined),
      {
        id: "bridgehead",
        hostname: "bridgehead",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:00:31" },
          { name: "eth1", mac: "02:00:00:00:00:32" },
        ],
        addrs: [
          { dev: "eth0", cidr: "10.0.1.1/24" },
          { dev: "eth1", cidr: "10.0.2.1/24" },
        ],
        sysctl: m[1] === "on" ? { "net.ipv4.ip_forward": "1" } : {},
      },
      host("right", "eth0", "02:00:00:00:00:41", "10.0.2.20/24", gw ? "10.0.2.1" : undefined),
    ],
    links: [
      { id: "l1", a: { device: "left", iface: "eth0" }, b: { device: "bridgehead", iface: "eth0" } },
      { id: "l2", a: { device: "bridgehead", iface: "eth1" }, b: { device: "right", iface: "eth0" } },
    ],
  };
}

const ALL: ToolId[] = [
  "ip link",
  "ip addr",
  "ip route",
  "ip neigh",
  "bridge fdb",
  "ping",
  "sysctl",
  "tcpdump",
  "lab send-frame",
];

/** The capture's normalisation (tools/golden/lib.sh, normalize), applied to our output. */
function normalise(line: string): string {
  return line
    .replace(/time=[0-9.]+ ms/, "time=<time> ms")
    .replace(/, time [0-9]+ms/, ", time <time>ms")
    .replace(/= [0-9.]+\/[0-9.]+\/[0-9.]+\/[0-9.]+ ms/, "= <time>/<time>/<time>/<time> ms")
    .replace(/^[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6} /, "<time> ")
    .replace(/(ICMP echo (request|reply), id )[0-9]+/, "$1<id>")
    .replace(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\.[0-9]+ > (.*UDP, length)/, "$1.<port> > $2");
}

function exitOf(b: SimBackend, execId: number): number | null {
  const e = b
    .trace()
    .find((x): x is Extract<SimEvent, { kind: "proc.exit" }> => x.kind === "proc.exit" && x.execId === execId);
  return e ? e.exitCode : null;
}

/** Runs a line on a device; a streaming command runs until it ends by itself (or `limitMs`). */
function run(b: SimBackend, device: string, line: string, limitMs = 30_000): number {
  const h = b.exec(device, line, "script");
  if (h.exitCode !== null) return h.execId;
  const until = b.now() + limitMs;
  while (exitOf(b, h.execId) === null && b.now() < until) b.advance(b.now() + 10);
  return h.execId;
}

/** A setup step, as tools/golden/lib.sh records it ("dev: command", "wait Ns"). */
function setupStep(b: SimBackend, step: string): void {
  const wait = step.match(/^wait ([0-9.]+)s/);
  if (wait) {
    b.advance(b.now() + Number(wait[1]) * 1000);
    return;
  }
  const m = step.match(/^(\S+): (.*)$/);
  if (!m) throw new Error(`setup step not understood: ${step}`);
  const [, device = "", cmd = ""] = m;
  const ageing = cmd.match(/^ip link set (\S+) type bridge ageing_time (\d+)$/);
  if (ageing) {
    b.world.setBridgeAgeing(device, ageing[1] as string, Number(ageing[2]) * 10);
    return;
  }
  const background = cmd.match(/^timeout \S+ (ping .*) &$/);
  if (background) {
    b.exec(device, background[1] as string, "script");
    return;
  }
  run(b, device, cmd);
  // lib.sh waits for link changes to settle.
  if (cmd.includes("link set")) b.advance(b.now() + 1200);
}

function runCase(c: Case): { lines: string[]; exit: number | null } {
  const b = new SimBackend(shellContent);
  b.options = () => ({ tools: new Set(ALL), subtitles: false });
  b.loadSync(topology(c.topology), [], 1);
  // The switch topology waits 2.5 s for the bridge's own IGMP reports to pass before anything runs.
  if (c.topology.startsWith("switch")) b.advance(2500);
  const during = c.setup.filter((s) => s.startsWith("during capture, ")).map((s) => s.slice("during capture, ".length));
  for (const s of c.setup.filter((x) => !x.startsWith("during capture, "))) setupStep(b, s);
  const interrupt = c.actualCommand.match(/timeout -s INT ([0-9.]+) /);
  const h = b.exec(c.device, c.command, "script");
  // The "during capture" traffic starts once the capture is listening.
  for (const s of during) {
    const [, device = "", cmd = ""] = s.match(/^(\S+): (.*)$/) ?? [];
    if (cmd.startsWith("echo ")) {
      const udp = cmd.match(/^echo (\S+) > \/dev\/udp\/(\S+)\/(\d+)$/);
      if (udp) b.world.sendUdp(device, udp[2] as string, Number(udp[3]), `${udp[1]}\n`);
    } else b.exec(device, cmd, "script");
  }
  if (h.exitCode === null) {
    const until = b.now() + (interrupt ? Number(interrupt[1]) * 1000 : 30_000);
    while (exitOf(b, h.execId) === null && b.now() < until) b.advance(Math.min(until, b.now() + 10));
    if (exitOf(b, h.execId) === null) b.world.interrupt(c.device, h.execId);
  }
  const lines = b
    .trace()
    .filter(
      (e): e is Extract<SimEvent, { kind: "proc.output" }> =>
        e.kind === "proc.output" && e.execId === h.execId && (e.stream === "stdout" || e.stream === "stderr"),
    )
    .map((e) => normalise(e.text));
  return { lines, exit: h.exitCode ?? exitOf(b, h.execId) };
}

/**
 * Bytes Linux picks at random per run (tools/golden/capture-tcpdump.sh): IPv4 identification and
 * header checksum, the ICMP echo identifier and checksum, ping's send time in the payload, a UDP
 * source port and checksum; inside an ICMP error, the same fields of the quoted packet (and so the
 * error's own checksum). Offsets are into the frame.
 */
function variable(frame: number[]): Set<number> {
  const v = new Set<number>();
  const mark = (from: number, to: number) => {
    for (let i = from; i <= to; i++) v.add(i);
  };
  const ip = (at: number) => {
    mark(at + 4, at + 5); // identification
    mark(at + 10, at + 11); // header checksum
    const proto = frame[at + 9];
    const l4 = at + 20;
    if (proto === 1) {
      mark(l4 + 2, l4 + 3); // ICMP checksum
      const type = frame[l4];
      if (type === 0 || type === 8) {
        mark(l4 + 4, l4 + 5); // echo identifier
        mark(l4 + 8, l4 + 23); // ping's send time
      } else if (type === 3 || type === 11) ip(l4 + 8); // the quoted packet
    } else if (proto === 17) {
      mark(l4, l4 + 1); // source port
      mark(l4 + 6, l4 + 7); // UDP checksum
    }
  };
  if (frame[12] === 0x08 && frame[13] === 0x00) ip(14);
  return v;
}

function hexFrames(lines: string[]): number[][] {
  const frames: number[][] = [];
  for (const line of lines) {
    const m = line.match(/^\t0x([0-9a-f]{4}): {2}(.*)$/);
    if (!m) {
      if (/^<time> |^[0-9]{2}:/.test(line)) frames.push([]);
      continue;
    }
    const bytes = (m[2] ?? "").replace(/ /g, "").match(/../g) ?? [];
    frames.at(-1)?.push(...bytes.map((b) => Number.parseInt(b, 16)));
  }
  return frames;
}

const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { cases: Case[] };
const families = [...new Set(manifest.cases.map((c) => c.family))].filter((f) => f !== "bytes");

describe("golden: bytes (every frame, byte for byte, except what Linux randomises)", () => {
  for (const c of manifest.cases.filter((x) => x.family === "bytes")) {
    it(c.case, () => {
      const text = readFileSync(join(dir, c.file), "utf8").replace(/\n$/, "").split("\n");
      const real = hexFrames(text.slice(2, -1).map(normalise));
      const ours = hexFrames(runCase(c).lines);
      expect(ours.length, "frames").toBe(real.length);
      real.forEach((r, n) => {
        const o = ours[n] ?? [];
        const skip = variable(r);
        const show = (f: number[]) => f.map((b, i) => (skip.has(i) ? "··" : b.toString(16).padStart(2, "0"))).join("");
        expect(show(o), `frame ${n + 1}`).toBe(show(r));
      });
    });
  }
});

for (const family of families) {
  describe(`golden: ${family}`, () => {
    for (const c of manifest.cases.filter((x) => x.family === family)) {
      it(c.case, () => {
        const text = readFileSync(join(dir, c.file), "utf8").replace(/\n$/, "").split("\n");
        const expected = text.slice(2, -1);
        const exit = Number(text.at(-1)?.match(/\[exit (\d+)\]/)?.[1]);
        const ours = runCase(c);
        const show = (l: string[]) => l.map((x) => `      | ${x}`).join("\n");
        const message = `\n    linux (exit ${exit}):\n${show(expected)}\n    sim (exit ${ours.exit}):\n${show(ours.lines)}\n`;
        expect(ours.lines, message).toEqual(expected);
        expect(ours.exit, message).toBe(exit);
      });
    }
  });
}
