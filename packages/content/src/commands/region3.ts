import type { CommandMemory } from "../commands";

/** Region 3's command memories (0041), by id: floors/floor-5.md, floor-6.md, floor-7.md. */
export const REGION_3_COMMANDS: Record<string, CommandMemory> = {
  "CMD-04": {
    id: "CMD-04",
    command: "ping",
    room: "f5.place-to-live",
    intro:
      "Every ping is an *echo request*. A house that's home sends an *echo reply*. It keeps asking, once a second, until you stop it with Ctrl+C.",
    anatomy: [
      { word: "ping", role: "tool", meaning: "ask a house: are you there?" },
      { word: "10.0.1.7", role: "which one", meaning: "which house" },
    ],
    forms: [
      { line: "ping 10.0.1.7", meaning: "keeps asking, once a second, until you stop it with Ctrl+C" },
      { line: "ping -c 3 10.0.1.7", meaning: "ask three times, then stop" },
    ],
    // The room's real output (5.2's solution, `ping -c 3 10.0.1.7`).
    output: {
      text: [
        "PING 10.0.1.7 (10.0.1.7) 56(84) bytes of data.",
        "64 bytes from 10.0.1.7: icmp_seq=1 ttl=64 time=0.404 ms",
        "64 bytes from 10.0.1.7: icmp_seq=2 ttl=64 time=0.203 ms",
        "64 bytes from 10.0.1.7: icmp_seq=3 ttl=64 time=0.203 ms",
        "",
        "--- 10.0.1.7 ping statistics ---",
        "3 packets transmitted, 3 received, 0% packet loss, time 2028ms",
        "rtt min/avg/max/mdev = 0.203/0.270/0.404/0.095 ms",
      ].join("\n"),
      marks: [
        { match: "64 bytes from 10.0.1.7", meaning: "an answer, from this house" },
        { match: "icmp_seq=1", meaning: "the first one, the second…" },
        { match: "time=0.404 ms", meaning: "how long the round trip took" },
        { match: "3 received, 0% packet loss", meaning: "every question was answered" },
        {
          match: "Network is unreachable",
          meaning: "an error you'll meet: you can't send there at all from here",
        },
        {
          match: "Destination Host Unreachable",
          meaning: "an error you'll meet: nobody on the street answered to that address",
        },
      ],
      dimmed: "`ttl=64` and `56(84) bytes`: you can ignore these for now.",
    },
    action: { say: "Now ask lantern yourself. It fails, for now.", type: "ping -c 3 10.0.1.7" },
  },
  "CMD-05": {
    id: "CMD-05",
    command: "ip addr",
    room: "f5.roll-call",
    intro: "The same network tool as before, now asking about addresses.",
    anatomy: [
      { word: "ip", role: "tool", meaning: "the network tool, as before" },
      { word: "addr", role: "about what", meaning: "addresses" },
      { word: "add", role: "do what", meaning: "give one" },
      {
        word: "10.0.1.5/24",
        role: "which one",
        meaning: "this address. The `/24` is part of how an address is written; the street sign explains it later.",
      },
      { word: "dev eth0", role: "where", meaning: "on this door" },
    ],
    forms: [
      { line: "ip addr", meaning: "show every door's addresses" },
      { line: "ip addr add <address> dev <door>", meaning: "give a door an address" },
      { line: "ip addr del <address> dev <door>", meaning: "take one away" },
    ],
    // The room's real output (5.3, after `ip addr add 10.0.1.5/24 dev eth0`).
    output: {
      text: [
        "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000",
        "    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00",
        "    inet 127.0.0.1/8 scope host lo",
        "       valid_lft forever preferred_lft forever",
        "2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000",
        "    link/ether 02:00:00:00:00:05 brd ff:ff:ff:ff:ff:ff",
        "    inet 10.0.1.5/24 scope global eth0",
        "       valid_lft forever preferred_lft forever",
      ].join("\n"),
      marks: [
        { match: "inet 10.0.1.5/24", meaning: "your house address" },
        { match: "link/ether 02:00:00:00:00:05", meaning: "your door's name, as in `ip link`" },
        { match: "state UP", meaning: "switched on" },
      ],
      dimmed: "`scope`, `valid_lft` and the rest: ignore for now.",
    },
    action: { say: "Now ask your machine for its addresses.", type: "ip addr" },
  },
  "CMD-06": {
    id: "CMD-06",
    command: "ip neigh",
    room: "f6.who-has-this-address",
    intro: "The network tool again, this time about your neighbours.",
    anatomy: [
      { word: "ip", role: "tool", meaning: "the network tool" },
      { word: "neigh", role: "about what", meaning: "neighbours: the ledger of house address → door name" },
    ],
    forms: [
      { line: "ip neigh", meaning: "show the ledger" },
      { line: "ip neigh del <address> dev <door>", meaning: "cross a line out" },
      { line: "ip neigh flush dev <door>", meaning: "clear the whole ledger for a door" },
    ],
    // The room's real output (6.2, after lantern's door was asked for and written down).
    output: {
      text: "10.0.1.7 dev eth0 lladdr 02:00:00:00:00:17 REACHABLE ",
      marks: [
        { match: "10.0.1.7", meaning: "the house" },
        { match: "lladdr 02:00:00:00:00:17", meaning: "its door name" },
        { match: "REACHABLE", meaning: "heard from recently" },
        { match: "STALE", meaning: "not heard from in a while; it'll check again before trusting it" },
        { match: "FAILED", meaning: "asked, nobody answered" },
      ],
      dimmed: "",
    },
    action: { say: "Now read your own ledger.", type: "ip neigh" },
  },
  "CMD-07": {
    id: "CMD-07",
    command: "dhclient",
    room: "f7.ask-for-an-address",
    intro: "Not every address has to be written by hand. You can ask the town for one.",
    anatomy: [
      { word: "dhclient", role: "tool", meaning: "ask the town's registry for an address" },
      { word: "-v", role: "how", meaning: "tell me every step" },
      { word: "eth0", role: "which one", meaning: "for this door" },
    ],
    forms: [
      { line: "dhclient eth0", meaning: "ask quietly" },
      { line: "dhclient -v eth0", meaning: "ask, and show each step" },
      { line: "dhclient -r eth0", meaning: "give the address back" },
    ],
    // Room 7.2's real output (the simulator's dhclient, checked against Fedora's dhclient 4.4.3-P1).
    output: {
      text: [
        "Internet Systems Consortium DHCP Client 4.4.3-P1",
        "Copyright 2004-2022 Internet Systems Consortium.",
        "All rights reserved.",
        "For info, please visit https://www.isc.org/software/dhcp/",
        "",
        "Listening on LPF/eth0/02:00:00:00:00:05",
        "Sending on   LPF/eth0/02:00:00:00:00:05",
        "Sending on   Socket/fallback",
        "DHCPDISCOVER on eth0 to 255.255.255.255 port 67 interval 4 (xid=0x9b272b38)",
        "DHCPOFFER of 10.0.1.100 from 10.0.1.2",
        "DHCPREQUEST for 10.0.1.100 on eth0 to 255.255.255.255 port 67 (xid=0x9b272b38)",
        "DHCPACK of 10.0.1.100 from 10.0.1.2 (xid=0x9b272b38)",
        "bound to 10.0.1.100 -- renewal in 1360 seconds.",
      ].join("\n"),
      marks: [
        { match: "DHCPDISCOVER", meaning: "is anyone handing out addresses?" },
        { match: "DHCPOFFER", meaning: "you can have this one" },
        { match: "DHCPREQUEST", meaning: "I'll take it" },
        { match: "DHCPACK", meaning: "it's yours" },
        { match: "renewal in 1360 seconds", meaning: "the lease: you'll ask to keep it before it runs out" },
      ],
      dimmed: "The banner, `LPF`, `xid`, `255.255.255.255` and `port 67`: you can ignore these for now.",
    },
    action: { say: "Now ask the registry yourself.", type: "dhclient -v eth0" },
  },
};
