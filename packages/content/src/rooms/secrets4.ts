import type { RoomText } from "./types";

/**
 * Region 4's secret room, *Inside Your Home Router* (floors/floor-9.md, "Secret room": draft for owner
 * review). Found after the finale: a small door at the foot of the spire. Placeholders: {home},
 * {homeOutside}, {world}. The words for what real home boxes also do (address translation, firewalls)
 * stay out: they're the Frontier's to teach.
 */
export const insideYourHomeRouter: RoomText = {
  title: "The Box at Home",
  mission: "At the foot of the spire, one small box hums with blinking lights. Plug in, and reach the world outside.",
  access: { world: "Sealed. It answers anyone who can reach it, from outside." },
  notes: [
    "Found this at the foot of the spire. It looks like the little boxes people keep at home, with the blinking lights. A whole network in one box.",
  ],
  hints: [
    { text: "You have no address. In the Lantern Town, how did you get one without guessing?" },
    {
      text: "With an address, ping the world. If it's silent, walk into home's room: it stands between your subnet and the world.",
    },
    {
      text: "Home is a switch, a DHCP server and a router in one box. A router only forwards when it's allowed to.",
      codex: "home-box",
    },
    { text: "Ask home for an address, let home pass packets on, then ping the world." },
    {
      text: "In the observatory: `dhclient -v eth0`. In home: `sysctl -w net.ipv4.ip_forward=1`. Then from the observatory: `ping -c 3 {world}`.",
    },
  ],
  detectors: {
    "write-your-own": {
      note: "Home hands out addresses on its subnet with DHCP. Ask it, and you get a default gateway as well.",
      tried: "You wrote your own address, when home hands them out (with directions out).",
    },
    "forward-at-your-house": {
      note: "Your house isn't passing anyone's packets on. Which box stands between you and the world?",
      tried: "You let your own house forward, when home is the router between the subnets.",
    },
    "route-at-home": {
      note: "Home already has a door on both subnets, so it knows both. What isn't it allowed to do yet?",
      tried: "You changed home's routes, when it already knew both subnets and only needed IP forwarding on.",
    },
  },
  debrief: {
    happened:
      "Home was three things you already know, in one box. Its doors joined into one subnet, `br0`: a switch. On that subnet it handed you an address by DHCP, a lease that came with a default gateway, `{home}`. And once IP forwarding was on, it passed your ping to the world and the answer back: a router. The box on a shelf at home does exactly this, and most of them use the subnet `192.168.1.0/24`. Real ones do one more trick: the world never sees your house's address, because the box writes its own on everything going out and sorts the answers when they come back. Here, the world was simply told the way back to your subnet. That trick comes later, in the Frontier.",
    terms: [],
  },
  guardian: [
    { q: "Is this a router?", a: "A small one. A router, a DHCP server and a switch, in one box." },
    { q: "Who is the world?", a: "Everyone outside your door. Here, one machine plays them all." },
    {
      q: "How does the world find its way back?",
      a: "Here, it was told. Real home boxes do something cleverer. You'll meet it further up.",
    },
  ],
};
