/**
 * One frame as a comparable line, from either side: real Linux (a `tcpdump -n -e -l` line) or the
 * simulator (its bytes). Kept: who sent it to whom, the protocol, and what it says (ARP question or
 * answer, ICMP type and sequence, addresses). Ignored: lengths (veth doesn't pad short frames as a
 * physical wire does), ICMP ids, IP ids and timestamps.
 */
import { decodeArp, decodeEth, decodeIcmp, decodeIPv4, decodeUDP, ETHERTYPE, ICMP, IPPROTO } from "@wirelight/sim";

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
  if (isMulticastNoise(f.dst)) return null;
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
      const what = ICMP_TEXT[`${m.type}:${m.code}`] ?? `icmp ${m.type}/${m.code}`;
      const seq = m.type === ICMP.echoRequest || m.type === ICMP.echoReply ? ` seq ${m.seq}` : "";
      return `${head} IP ${ip.src} > ${ip.dst} ICMP ${what}${seq}`;
    }
    if (ip.proto === IPPROTO.udp) {
      const u = decodeUDP(ip.payload);
      return `${head} IP ${ip.src}.${u.srcPort} > ${ip.dst}.${u.dstPort} UDP`;
    }
    return `${head} IP ${ip.src} > ${ip.dst} proto ${ip.proto}`;
  }
  if (f.type === ETHERTYPE.lab) return `${head} lab`;
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
    const req = rest.match(/Request who-has (\S+) tell (\S+),/);
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
    return `${head} IP ${rest}`;
  }
  if (type === "88b5") return `${head} lab`;
  return `${head} type 0x${type}`;
}
