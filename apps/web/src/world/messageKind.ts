import { peel } from "@wirelight/sim";

// What a message is, for how it looks (CORE-15) and what hovering it says (CORE-16). Read from its
// real bytes; layers the player hasn't learned yet (the packet inside a frame, before Floor 6) say
// "(sealed)" instead of their contents.

export type MessageKind = "unicast" | "broadcast" | "arp" | "dhcp";

const BROADCAST = "ff:ff:ff:ff:ff:ff";

export function messageKind(bytes: Uint8Array): MessageKind {
  const [frame, inner, message] = peel(bytes);
  if (frame?.layer !== "frame") return "unicast";
  if (inner?.layer === "message" && inner.kind === "arp") return "arp";
  if (message?.layer === "message" && message.kind === "udp" && [67, 68].includes(message.toPort)) return "dhcp";
  return frame.to === BROADCAST ? "broadcast" : "unicast";
}

/** One line, like tcpdump's, about a message in flight (CORE-16). */
export function messageSummary(bytes: Uint8Array, floor: number): string {
  const layers = peel(bytes);
  const [frame, inner, message] = layers;
  if (frame?.layer !== "frame") return "";
  const head = `${frame.from} > ${frame.to}`;
  if (inner?.layer === "message") {
    if (inner.kind === "lab") return `${head}: lab ${inner.answer ? "answer" : "message"} "${inner.text}"`;
    if (inner.kind === "arp")
      return inner.op === 1
        ? `${head}: ARP, who has ${inner.targetIp}? tell ${inner.senderIp}`
        : `${head}: ARP, ${inner.senderIp} is at ${inner.senderMac}`;
    return head;
  }
  if (inner?.layer !== "packet") return head;
  // The packet inside stays sealed until the Scanner opens it (Floor 6, 0043).
  if (floor < 6) return `${head}: (sealed)`;
  const ip = `${inner.from} > ${inner.to}`;
  if (message?.layer === "message" && message.kind === "icmp") {
    const what =
      message.type === 8
        ? `echo request ${message.seq}`
        : message.type === 0
          ? `echo reply ${message.seq}`
          : message.type === 11
            ? "time exceeded"
            : message.type === 3
              ? "unreachable"
              : message.type === 5
                ? "redirect"
                : `type ${message.type}`;
    return `${head}: ${ip}: ICMP ${what}, ttl ${inner.ttl}`;
  }
  if (message?.layer === "message" && message.kind === "udp")
    return `${head}: ${ip}: UDP ${message.fromPort} > ${message.toPort}, ttl ${inner.ttl}`;
  return `${head}: ${ip}`;
}
