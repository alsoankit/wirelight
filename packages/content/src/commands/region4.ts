import type { CommandMemory } from "../commands";

/**
 * Region 4's command memories (0041), by id (floors/floor-8.md, floor-9.md), word for word. Each
 * output is the room's real output, captured by running the room (8.2, 8.4, 8.5, 9.3).
 */
export const REGION_4_COMMANDS: Record<string, CommandMemory> = {
  "CMD-08": {
    id: "CMD-08",
    command: "ip route",
    room: "f8.across-the-street",
    intro: "The routing board: which way to send.",
    anatomy: [
      { word: "ip", role: "tool", meaning: "the network tool" },
      { word: "route", role: "about what", meaning: "the routing board: which way to send" },
      { word: "add", role: "do what", meaning: "add a line" },
      { word: "default", role: "which one", meaning: "for anywhere not listed" },
      { word: "via 10.0.1.1", role: "how", meaning: "hand it to this router door" },
    ],
    forms: [
      { line: "ip route", meaning: "show the board" },
      { line: "ip route add default via <gateway>", meaning: "where to send everything else" },
      { line: "ip route add <street> via <gateway>", meaning: "a way to one particular street" },
      { line: "ip route del …", meaning: "remove a line" },
    ],
    output: {
      text: ["default via 10.0.1.1 dev eth0 ", "10.0.1.0/24 dev eth0 proto kernel scope link src 10.0.1.5 "].join("\n"),
      marks: [
        {
          match: "10.0.1.0/24 dev eth0",
          meaning: "my own street is right outside door eth0 (added by itself when you got your address)",
        },
        { match: "default via 10.0.1.1 dev eth0", meaning: "anything else: hand it to 10.0.1.1, out of eth0" },
        {
          match: "default",
          meaning:
            "how it's read: for each packet, find the line that matches its destination. If none does, use default.",
        },
      ],
      dimmed: "proto kernel scope link src 10.0.1.5: ignore for now.",
    },
    action: { say: "Now ask it yourself.", type: "ip route" },
  },
  "CMD-09": {
    id: "CMD-09",
    command: "tcpdump",
    room: "f8.no-way-back",
    intro: "Listen at a door and print every message that passes. The Scanner's Capture button does exactly this.",
    anatomy: [
      { word: "tcpdump", role: "tool", meaning: "listen at a door and print every message that passes" },
      { word: "-n", role: "how", meaning: "show numbers, don't look up names" },
      { word: "-i eth0", role: "which one", meaning: "at this door" },
    ],
    forms: [
      { line: "tcpdump -n -i eth0", meaning: "listen at eth0" },
      { line: "tcpdump -n -i eth0 icmp", meaning: "only pings and their kind" },
      { line: "tcpdump -n -e -i eth0", meaning: "also show the frame's door names" },
      { line: "Ctrl+C", meaning: "stop it" },
    ],
    output: {
      text: [
        "tcpdump: verbose output suppressed, use -v[v]... for full protocol decode",
        "listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes",
        "21:00:06.016203 IP 10.0.1.5 > 10.0.2.7: ICMP echo request, id 54892, seq 2, length 64",
        "21:00:07.040203 IP 10.0.1.5 > 10.0.2.7: ICMP echo request, id 54892, seq 3, length 64",
      ].join("\n"),
      marks: [
        { match: "21:00:06.016203", meaning: "the time" },
        { match: "IP", meaning: "a packet" },
        { match: "10.0.1.5 > 10.0.2.7", meaning: "from → to" },
        { match: "ICMP echo request", meaning: "a ping" },
        { match: "seq 2", meaning: "which one" },
        {
          match: "listening on eth0",
          meaning: "If nothing is printed, nothing passed this door. That's an answer too.",
        },
      ],
      dimmed: "The first two lines, and id and length: ignore for now.",
    },
    action: { say: "Press Capture on the Scanner (or type it) at your own door.", type: "tcpdump -n -i eth0" },
  },
  "CMD-10": {
    id: "CMD-10",
    command: "sysctl",
    room: "f8.sleeping-keeper",
    intro: "Read or change one of a machine's settings.",
    anatomy: [
      { word: "sysctl", role: "tool", meaning: "read or change one of a machine's settings" },
      { word: "-w", role: "do what", meaning: "write (change) it" },
      {
        word: "net.ipv4.ip_forward",
        role: "which one",
        meaning: "the setting: may this machine pass packets between its doors?",
      },
      { word: "=1", role: "how", meaning: "yes (0 is no)" },
    ],
    forms: [
      { line: "sysctl net.ipv4.ip_forward", meaning: "read it" },
      { line: "sysctl -w net.ipv4.ip_forward=1", meaning: "switch it on" },
    ],
    output: {
      text: "net.ipv4.ip_forward = 0",
      marks: [{ match: "net.ipv4.ip_forward = 0", meaning: "not allowed; after the change, net.ipv4.ip_forward = 1" }],
      dimmed: "",
    },
    action: { say: "Ask crossing.", type: "sysctl net.ipv4.ip_forward" },
  },
  "CMD-11": {
    id: "CMD-11",
    command: "ping -t",
    room: "f9.one-step-only",
    intro:
      "Words starting with a dash change how a command works. You've used -c already: how many times. Every command has its flags; man ping lists them all.",
    anatomy: [
      { word: "ping", role: "tool", meaning: "are you there?" },
      { word: "-c 1", role: "how", meaning: "once" },
      { word: "-t 1", role: "how", meaning: "set the countdown (TTL) to 1" },
      { word: "10.0.3.7", role: "which one", meaning: "the house" },
    ],
    forms: [
      { line: "ping -t 64 …", meaning: "the usual countdown" },
      { line: "ping -t 1 …", meaning: "dies at the first crossing" },
      { line: "ping -t 2 …", meaning: "dies at the second" },
    ],
    output: {
      text: [
        "PING 10.0.3.7 (10.0.3.7) 56(84) bytes of data.",
        "From 10.0.1.1 icmp_seq=1 Time to live exceeded",
        "",
        "--- 10.0.3.7 ping statistics ---",
        "1 packets transmitted, 0 received, +1 errors, 100% packet loss, time 0ms",
      ].join("\n"),
      marks: [
        {
          match: "From 10.0.1.1 icmp_seq=1 Time to live exceeded",
          meaning: "the router at 10.0.1.1 says your packet's countdown ran out there",
        },
        { match: "+1 errors", meaning: "one note came back instead of an answer" },
      ],
      dimmed: "You can ignore this for now.",
    },
    action: { say: "Now send one yourself.", type: "ping -c 1 -t 1 10.0.3.7" },
  },
};
