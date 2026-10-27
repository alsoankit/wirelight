import type { RoomText } from "./types";

/**
 * Region 4's secret room, *Inside Your Home Router* (floors/floor-9.md, "Secret room": draft for owner
 * review). Found after the finale: a small door at the foot of the spire. Placeholders: {home},
 * {homeOutside}, {world}. The words for what real home boxes also do (address translation, firewalls)
 * stay out: they're the Frontier's to teach.
 */
export const insideYourHomeRouter: RoomText = {
  title: "Inside Your Home Router",
  mission: "At the foot of the spire, one small box hums with blinking lights. Plug in, and reach the world outside.",
  access: { world: "Sealed. It answers anyone who can reach it, from outside." },
  notes: [
    "Found this at the foot of the spire. It looks just like the box under my desk back home. Same blinking lights. I never once wondered what was inside.",
  ],
  hints: [
    { text: "You have no address. In the Lantern Town, how did you get one without guessing?" },
    {
      text: "With an address, ping the world. If it's silent, walk into home's room: it stands between your street and the world.",
    },
    {
      text: "Home is a switch, a registry and a router in one box. A router only passes packets on when it's allowed to.",
      codex: "home-box",
    },
    { text: "Ask home for an address, let home pass packets on, then ping the world." },
    {
      text: "In the observatory: `dhclient -v eth0`. In home: `sysctl -w net.ipv4.ip_forward=1`. Then from the observatory: `ping -c 3 {world}`.",
    },
  ],
  detectors: {
    "write-your-own": {
      note: "Home hands out addresses on its street. Ask it, and you get directions out as well.",
      tried: "You wrote your own address, when home hands them out (with directions out).",
    },
    "forward-at-your-house": {
      note: "Your house isn't passing anyone's packets on. Which box stands between you and the world?",
      tried: "You let your own house forward, when home is the one between the streets.",
    },
    "route-at-home": {
      note: "Home already has a door on both streets, so it knows both. What isn't it allowed to do yet?",
      tried: "You changed home's routes, when it already knew both streets and only needed to be allowed to forward.",
    },
  },
  debrief: {
    happened:
      "Home was three things you already know, in one box. Its doors joined into one street, `br0`: a switch. On that street it handed you an address, a lease that came with directions out through `{home}`: a registry. And once it was allowed to forward, it passed your ping to the world and the answer back: a router. The box on a shelf at home does exactly this, and most of them use the street `192.168.1`. Real ones do one more trick: the world never sees your house's address, because the box writes its own on everything going out and sorts the answers when they come back. Here, the world was simply told the way back to your street. That trick comes later, in the Frontier.",
    terms: [],
  },
  guardian: [
    { q: "Is this a crossing?", a: "A small one. A crossing, a registry and a square, in one box." },
    { q: "Who is the world?", a: "Everyone outside your door. Here, one machine plays them all." },
    {
      q: "How does the world find its way back?",
      a: "Here, it was told. Real home boxes do something cleverer. You'll meet it further up.",
    },
  ],
};
