/**
 * One frame as a comparable line, from either side: real Linux (a `tcpdump -n -e -l` line) or the
 * simulator (its bytes). Kept: who sent it to whom, the protocol, and what it says (ARP question or
 * answer, ICMP type and sequence, addresses). Ignored: lengths (veth doesn't pad short frames as a
 * physical wire does), ICMP ids, IP ids and timestamps.
 */
import {
  decodeArp,
  decodeBpdu,
  decodeEth,
  decodeIcmp,
  decodeIPv4,
  decodeUDP,
  ETHERTYPE,
  ICMP,
  IPPROTO,
  isStpFrame,
} from "@wirelight/sim";

const ICMP_TEXT: Record<string, string> = {
  "0:0": "echo reply",
  "8:0": "echo request",
  "3:0": "net unreachable",
  "3:1": "host unreachable",
  "3:3": "port unreachable",
  "11:0": "time exceeded",
};

/**
 * Multicast (IGMP reports, the bridge's own queries) is Linux background traffic the game doesn't
 * model (docs/sim-deviations.md), so it's left out of comparisons, like IPv6.
 */
export function isMulticastNoise(dst: string): boolean {
  return dst.startsWith("01:00:5e") || dst.startsWith("33:33");
}

export function keyFromBytes(bytes: Uint8Array): string | null {
  const f = decodeEth(bytes);
  if (isMulticastNoise(f.dst) || isStpFrame(bytes)) return null;
  const head = `${f.src} > ${f.dst}`;
  if (f.type === ETHERTYPE.arp) {
    const a = decodeArp(f.payload);
    if (!a) return `${head} ARP ?`;
    return a.op === 1
      ? `${head} ARP who-has ${a.targetIp} tell ${a.senderIp}`
      : `${head} ARP ${a.senderIp} is-at ${a.senderMac}`;
  }
  if (f.type === ETHERTYPE.ipv4) {
    const ip = decodeIPv4(f.payload);
    if (ip.proto === IPPROTO.icmp) {
      const m = decodeIcmp(ip.payload);
      const gw = [m.id >> 8, m.id & 0xff, m.seq >> 8, m.seq & 0xff].join(".");
      const what =
        m.type === ICMP.redirect
          ? `redirect to ${gw}`
          : (ICMP_TEXT[`${m.type}:${m.code}`] ?? `icmp ${m.type}/${m.code}`);
      const seq = m.type === ICMP.echoRequest || m.type === ICMP.echoReply ? ` seq ${m.seq}` : "";
      return `${head} IP ${ip.src} > ${ip.dst} ICMP ${what}${seq}`;
    }
    if (ip.proto === IPPROTO.udp) {
      const u = decodeUDP(ip.payload);
      if ([67, 68].includes(u.srcPort) && [67, 68].includes(u.dstPort))
        return `${head} IP ${ip.src} > ${ip.dst} BOOTP ${u.data[0] === 1 ? "Request" : "Reply"}`;
      return `${head} IP ${ip.src}.${u.srcPort} > ${ip.dst}.${u.dstPort} UDP`;
    }
    return `${head} IP ${ip.src} > ${ip.dst} proto ${ip.proto}`;
  }
  if (f.type === ETHERTYPE.lab || f.type === ETHERTYPE.labAnswer) return `${head} lab`;
  return `${head} type 0x${f.type.toString(16)}`;
}

/** The same key from a `tcpdump -n -e -l -tt` line, or null for lines that aren't frames. */
export function keyFromTcpdump(line: string): string | null {
  // tcpdump -e names the broadcast address "Broadcast".
  const m = line.match(
    /^\d+\.\d+ ([0-9a-f:]{17}) > ([0-9a-f:]{17}|Broadcast), ethertype (\S+) \(0x([0-9a-f]{4})\), length \d+: ?(.*)$/,
  );
  if (!m) return null;
  const [, src, rawDst = "", , type, rest = ""] = m;
  const dst = rawDst === "Broadcast" ? "ff:ff:ff:ff:ff:ff" : rawDst;
  if (isMulticastNoise(dst)) return null;
  const head = `${src} > ${dst}`;
  if (type === "0806") {
    // "(Broadcast)" marks a request whose target MAC is ff:ff:ff:ff:ff:ff (arping -D's probes).
    const req = rest.match(/Request who-has (\S+) (?:\(Broadcast\) )?tell (\S+),/);
    if (req) return `${head} ARP who-has ${req[1]} tell ${req[2]}`;
    const rep = rest.match(/Reply (\S+) is-at ([0-9a-f:]{17}),/);
    if (rep) return `${head} ARP ${rep[1]} is-at ${rep[2]}`;
    return `${head} ARP ?`;
  }
  if (type === "0800") {
    const icmp = rest.match(/^(\S+) > (\S+): ICMP (.*)$/);
    if (icmp) {
      const [, a, b, body = ""] = icmp;
      const echo = body.match(/^echo (request|reply), id \d+, seq (\d+)/);
      if (echo) return `${head} IP ${a} > ${b} ICMP echo ${echo[1]} seq ${echo[2]}`;
      const redirect = body.match(/^redirect \S+ to host (\S+),/);
      if (redirect) return `${head} IP ${a} > ${b} ICMP redirect to ${redirect[1]}`;
      const what = /time exceeded/.test(body)
        ? "time exceeded"
        : /net \S+ unreachable/.test(body)
          ? "net unreachable"
          : /host \S+ unreachable/.test(body)
            ? "host unreachable"
            : /port \d+ unreachable/.test(body)
              ? "port unreachable"
              : `? ${body}`;
      return `${head} IP ${a} > ${b} ICMP ${what}`;
    }
    const udp = rest.match(/^(\S+) > (\S+): UDP/);
    if (udp) return `${head} IP ${udp[1]} > ${(udp[2] ?? "").replace(/:$/, "")} UDP`;
    // tcpdump names DHCP's ports even with -n: "0.0.0.0.bootpc > 255.255.255.255.bootps: BOOTP/DHCP, Request …"
    const bootp = rest.match(/^(\S+)\.boot(?:pc|ps) > (\S+)\.boot(?:pc|ps): BOOTP\/DHCP, (Request|Reply)/);
    if (bootp) return `${head} IP ${bootp[1]} > ${bootp[2]} BOOTP ${bootp[3]}`;
    return `${head} IP ${rest}`;
  }
  if (type === "88b5" || type === "88b6") return `${head} lab`;
  return `${head} type 0x${type}`;
}

/**
 * Spanning-tree BPDUs are compared on their own (compare.ts): their send times follow kernel timers
 * whose phase differs per run, so where they fall between other frames isn't comparable. A key holds
 * what tcpdump -n -e prints without -v: sender, kind, flags, bridge id and port.
 */
export function stpKeyFromBytes(bytes: Uint8Array): string | null {
  if (!isStpFrame(bytes)) return null;
  const src = decodeEth(bytes).src;
  const b = decodeBpdu(bytes);
  if (!b) return `${src} STP ?`;
  if (b.type === "tcn") return `${src} STP TCN`;
  const flags = [b.topologyChange ? "TC" : "", b.topologyChangeAck ? "TC-ACK" : ""].filter(Boolean).join("+") || "none";
  const id = `${b.bridgeId.slice(0, 4)}.${b.bridgeId.slice(4).replace(/(..)(?!$)/g, "$1:")}`;
  return `${src} STP config ${flags} ${id}.${b.portId.toString(16).padStart(4, "0")}`;
}

export function stpKeyFromTcpdump(line: string): string | null {
  const m = line.match(
    /^\d+\.\d+ ([0-9a-f:]{17}) > 01:80:c2:00:00:00, 802\.3, length \d+: LLC, .*?: STP 802\.1d, (.*)$/,
  );
  if (!m) return null;
  const [, src, rest = ""] = m;
  if (rest.startsWith("Topology Change")) return `${src} STP TCN`;
  const c = rest.match(/^Config, Flags \[(.*?)\], bridge-id (\S+)\.([0-9a-f]{4}), length/);
  if (!c) return `${src} STP ?`;
  const flags =
    (c[1] ?? "")
      .split(", ")
      .map((f) => (f === "Topology change" ? "TC" : f === "Topology change ACK" ? "TC-ACK" : ""))
      .filter(Boolean)
      .join("+") || "none";
  return `${src} STP config ${flags} ${c[2]}.${c[3]}`;
}
