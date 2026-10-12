/** Shared bits for the hand-mode tests: the simulator, and a frame as a short readable line. */
import { decodeArp, decodeEth, decodeIcmp, decodeIPv4, ETHERTYPE } from "../src";

export { type Fault, type SimEvent, Simulator, type Topology } from "../src";

export function keyOf(bytes: Uint8Array): string {
  const f = decodeEth(bytes);
  const head = `${f.src} > ${f.dst}`;
  if (f.type === ETHERTYPE.arp) {
    const a = decodeArp(f.payload);
    return `${head} arp ${a?.op === 1 ? `who-has ${a.targetIp}` : `${a?.senderIp} is-at`}`;
  }
  if (f.type === ETHERTYPE.ipv4) {
    const ip = decodeIPv4(f.payload);
    return `${head} ${ip.src} > ${ip.dst} icmp ${decodeIcmp(ip.payload).type} ttl ${ip.ttl}`;
  }
  return `${head} lab`;
}
