/**
 * Runs a scenario on real Linux (0045): one network namespace per machine inside an unprivileged
 * user namespace (`unshare -rmn`, no root), veth pairs for cables with the room's MACs, bridges
 * (`vlan_default_pvid 0`, as rooms configure them), addresses, routes, sysctls; IPv6 off everywhere
 * (the game is IPv4-only). `tcpdump` listens on every door; then the steps run in real time, and
 * the final tables are read as JSON.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Fault, SYSCTL_DEFAULTS } from "@wirelight/sim";
import type { Scenario } from "./scenario";

export interface LinuxRun {
  /** Per step: the command's stdout+stderr lines and exit code. */
  outputs: { lines: string[]; exit: number }[];
  /** Per "device:iface": tcpdump lines, in order. */
  captures: Record<string, string[]>;
  /** Per device: `ip -j neigh`, `ip -j route`, `bridge -j fdb` (raw JSON text). */
  tables: Record<string, { neigh: unknown[]; route: unknown[]; fdb: unknown[] }>;
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function faultCommands(f: Fault): string[] {
  switch (f.kind) {
    case "iface-down":
      return [`ip -n ${f.device} link set ${f.iface} down`];
    case "fdb-static":
      return [
        `ip netns exec ${f.device} bridge fdb add ${f.mac} dev ${f.port} master static${f.sticky ? " sticky" : ""}`,
      ];
    case "addr-remove":
      return [`ip -n ${f.device} addr del ${f.cidr} dev ${f.dev}`];
    case "addr-set":
      return [`ip -n ${f.device} addr add ${f.cidr} dev ${f.dev}`];
    case "route-remove":
      return [`ip -n ${f.device} route del ${f.dst}`];
    case "route-set":
      return [
        `ip -n ${f.device} route replace ${f.route.dst}${f.route.via ? ` via ${f.route.via}` : ""}${f.route.dev ? ` dev ${f.route.dev}` : ""}`,
      ];
    case "sysctl":
      return [`ip netns exec ${f.device} sysctl -qw ${f.key}=${f.value}`];
    default:
      throw new Error(`difftest: fault "${f.kind}" has no real-Linux form yet`);
  }
}

/**
 * DHCP on the real side: dnsmasq (the host's) for each machine with a `dhcpServer`, run as the
 * goldens run it; and, if $DHCP_ROOT is set, a `dhclient` on PATH that adds the paths a real install
 * has (tools/golden/capture-dhcp.sh, with the same one-line PATH change to Fedora's script).
 */
function dhcpSetup(sc: Scenario, dir: string): string[] {
  const L: string[] = [];
  const root = process.env.DHCP_ROOT;
  if (root) {
    const bin = join(dir, "bin");
    L.push(
      `mkdir -p ${q(bin)} /run/systemd/resolve && touch /run/systemd/resolve/stub-resolv.conf`,
      `cp ${q(`${root}/usr/bin/ipcalc`)} ${q(bin)}/`,
      `sed 's#^PATH=/bin:/usr/bin:/sbin#PATH=${bin}:/bin:/usr/bin:/sbin#' ${q(`${root}/usr/bin/dhclient-script`)} > ${q(join(dir, "dhclient-script"))}`,
      `chmod +x ${q(join(dir, "dhclient-script"))}`,
      // dhclient's first retransmission is random (3–8 s after, from the next whole second): it can
      // beat dnsmasq's 3 s ping wait and add frames the simulator's seeded run doesn't have. Here
      // (only) the first wait starts at 5 s so the run is repeatable; nothing else changes.
      `echo 'initial-interval 5;' > ${q(join(dir, "dhclient.conf"))}`,
      `printf '%s\\n' '#!/bin/bash' 'ns=$(ip netns identify $$)' ${q(`exec ${root}/usr/bin/dhclient -sf ${join(dir, "dhclient-script")} -cf ${join(dir, "dhclient.conf")} -lf ${dir}/$ns.leases -pf ${dir}/$ns.pid "$@"`)} > ${q(join(bin, "dhclient"))}`,
      `chmod +x ${q(join(bin, "dhclient"))}`,
      `export PATH=${q(bin)}:$PATH`,
    );
  }
  for (const d of sc.topology.devices) {
    const s = d.dhcpServer;
    if (!s) continue;
    const flags = [
      `-i ${s.dev ?? d.interfaces[0]?.name ?? "eth0"}`,
      `--dhcp-range=${s.range[0]},${s.range[1]},${s.leaseSecs ?? 3600}`,
      s.pingCheck === false ? "--no-ping" : "",
      s.sequential ? "--dhcp-sequential-ip" : "",
      s.router === null ? "--dhcp-option=3" : s.router ? `--dhcp-option=3,${s.router}` : "",
    ].filter(Boolean);
    L.push(
      `ip netns exec ${d.id} dnsmasq --no-daemon -C /dev/null --port=0 -u root --bind-interfaces ${flags.join(" ")} --dhcp-leasefile=${q(join(dir, `dnsmasq.${d.id}.leases`))} --pid-file=${q(join(dir, `dnsmasq.${d.id}.pid`))} > /dev/null 2>&1 &`,
    );
  }
  return L;
}

export function buildScript(sc: Scenario, dir: string): string {
  const L: string[] = ["set -u", "mount -t tmpfs none /run && mkdir -p /run/netns"];
  const { devices, links } = sc.topology;
  for (const d of devices) {
    L.push(`ip netns add ${d.id}`);
    L.push(`ip netns exec ${d.id} sysctl -qw net.ipv6.conf.all.disable_ipv6=1 net.ipv6.conf.default.disable_ipv6=1`);
    // New namespaces copy the host's IPv4 settings (this host forwards): set the game's baseline.
    const baseline = {
      ...SYSCTL_DEFAULTS,
      "net.ipv4.conf.default.forwarding": "0",
      "net.ipv4.conf.all.rp_filter": "0",
      "net.ipv4.conf.default.rp_filter": "0",
    };
    L.push(
      `ip netns exec ${d.id} sysctl -qw ${Object.entries(baseline)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")}`,
    );
    L.push(`ip -n ${d.id} link set lo up`);
  }
  for (const l of links) {
    const ma = devices.find((d) => d.id === l.a.device)?.interfaces.find((i) => i.name === l.a.iface)?.mac;
    const mb = devices.find((d) => d.id === l.b.device)?.interfaces.find((i) => i.name === l.b.iface)?.mac;
    L.push(
      `ip -n ${l.a.device} link add ${l.a.iface} address ${ma} type veth peer name ${l.b.iface} netns ${l.b.device} address ${mb}`,
    );
  }
  for (const d of devices) {
    for (const b of d.bridges ?? []) {
      L.push(`ip -n ${d.id} link add ${b.name} type bridge vlan_default_pvid 0${b.mac ? ` address ${b.mac}` : ""}`);
      for (const p of b.ports) L.push(`ip -n ${d.id} link set ${p} master ${b.name}`);
    }
    for (const [k, v] of Object.entries(d.sysctl ?? {})) L.push(`ip netns exec ${d.id} sysctl -qw ${k}=${v}`);
    for (const i of d.interfaces) if (i.adminUp !== false) L.push(`ip -n ${d.id} link set ${i.name} up`);
    for (const b of d.bridges ?? []) if (b.adminUp !== false) L.push(`ip -n ${d.id} link set ${b.name} up`);
  }
  // Carrier on fresh veths settles asynchronously: wait for every door that should be up.
  L.push("sleep 0.5");
  for (const d of devices) {
    for (const a of d.addrs ?? []) L.push(`ip -n ${d.id} addr add ${a.cidr} dev ${a.dev}`);
    for (const r of d.routes ?? [])
      L.push(`ip -n ${d.id} route add ${r.dst}${r.via ? ` via ${r.via}` : ""}${r.dev ? ` dev ${r.dev}` : ""}`);
  }
  for (const f of sc.faults ?? []) L.push(...faultCommands(f));
  L.push(...dhcpSetup(sc, dir));
  // Listen on every door (not loopback, not bridges: the ports show the wire).
  for (const d of devices)
    for (const i of d.interfaces)
      L.push(
        `ip netns exec ${d.id} tcpdump -Z root -n -e -l -tt -i ${i.name} > ${q(join(dir, `cap.${d.id}.${i.name}`))} 2>/dev/null &`,
      );
  L.push("sleep 0.6");
  sc.steps.forEach((s, n) => {
    const out = q(join(dir, `out.${n}`));
    const cmd =
      "ping" in s
        ? `ping -n -c ${s.ping.count}${s.ping.ttl ? ` -t ${s.ping.ttl}` : ""}${s.ping.waitS ? ` -W ${s.ping.waitS}` : ""} ${s.ping.dst}`
        : s.run;
    L.push(`ip netns exec ${s.device} ${cmd} > ${out} 2>&1; echo "[exit $?]" >> ${out}`);
    L.push(`sleep ${(s.settleMs / 1000).toFixed(3)}`);
  });
  L.push("sleep 0.3");
  for (const d of devices) {
    L.push(`ip -n ${d.id} -j neigh > ${q(join(dir, `neigh.${d.id}`))}`);
    L.push(`ip -n ${d.id} -j route > ${q(join(dir, `route.${d.id}`))}`);
    L.push(
      `ip netns exec ${d.id} bridge -j fdb show > ${q(join(dir, `fdb.${d.id}`))} 2>/dev/null || echo '[]' > ${q(join(dir, `fdb.${d.id}`))}`,
    );
  }
  if (process.env.DHCP_ROOT) L.push(`pkill -f ${q(`${process.env.DHCP_ROOT}/usr/bin/dhclient`)} 2>/dev/null`);
  L.push("kill $(jobs -p) 2>/dev/null; wait 2>/dev/null; true");
  return L.join("\n");
}

export function runOnLinux(sc: Scenario): LinuxRun {
  const dir = mkdtempSync(join(tmpdir(), "wirelight-difftest-"));
  try {
    const script = buildScript(sc, dir);
    writeFileSync(join(dir, "run.sh"), script);
    execFileSync("unshare", ["-rmn", "bash", join(dir, "run.sh")], { stdio: "pipe", timeout: 120_000 });
    const outputs = sc.steps.map((_, n) => {
      const text = readFileSync(join(dir, `out.${n}`), "utf8").replace(/\n$/, "");
      const lines = text.split("\n");
      const exitLine = lines.pop() ?? "[exit 0]";
      return { lines, exit: Number(exitLine.match(/\[exit (\d+)\]/)?.[1] ?? 0) };
    });
    const captures: LinuxRun["captures"] = {};
    for (const f of readdirSync(dir).filter((x) => x.startsWith("cap."))) {
      const [, device, iface] = f.split(".");
      captures[`${device}:${iface}`] = readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean);
    }
    const json = (f: string): unknown[] => {
      const text = readFileSync(join(dir, f), "utf8").trim();
      return text ? (JSON.parse(text) as unknown[]) : [];
    };
    const tables: LinuxRun["tables"] = {};
    for (const d of sc.topology.devices)
      tables[d.id] = { neigh: json(`neigh.${d.id}`), route: json(`route.${d.id}`), fdb: json(`fdb.${d.id}`) };
    return { outputs, captures, tables };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
