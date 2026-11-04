import { HOUSE_LOCKED } from "./floor5";
import type { RoomText } from "./types";

/**
 * Region 3's secret room, *The Binary Behind /24* (floors/floor-7.md, "Secret room": draft for owner
 * review). Found after the census: a narrow door behind the street sign. Placeholders: {chapel}, {kitchen}.
 */
export const binaryBehind24: RoomText = {
  title: "Half a Street",
  mission: "Chapel is on the square at .200, but your machine won't even try to reach it. Find out why.",
  access: { kitchen: HOUSE_LOCKED },
  notes: ["Someone changed my plate from /24 to /25 while I was counting houses. Half the square went quiet."],
  hints: [
    { text: "Ping kitchen, then ping chapel. Only one of them answers. Why that one?" },
    { text: "Compare the `/` on your plate with the one on the street sign." },
    {
      text: "An address is 32 bits, four numbers of 8. The `/` (the prefix length) counts how many bits, from the left, are the subnet. One more bit cuts the subnet in half.",
      codex: "thirty-two-bits",
    },
    { text: "Give your house its whole subnet back: the same house number, with the square's prefix length." },
    {
      text: "`ip addr del 10.0.1.5/25 dev eth0`, then `ip addr add 10.0.1.5/24 dev eth0`, then `ping -c 3 {chapel}`.",
    },
  ],
  detectors: {
    "street-too-big": {
      note: "Chapel answers, but now your house thinks the subnet is far bigger than the square. Read the street sign again.",
      tried: "You made your subnet much bigger than the square, with a smaller number after the `/`.",
    },
    "other-half": {
      note: "Now chapel's half hears you, and kitchen's doesn't. A `/25` is only half the subnet.",
      tried: "You moved your house to chapel's half of the subnet, and lost kitchen's half.",
    },
    "move-chapel": {
      note: "Chapel's house is where it's always been. It's your prefix length that cut the subnet in two.",
      tried: "You moved chapel, when it was your own prefix length that had split the subnet.",
    },
  },
  debrief: {
    happened:
      "An address is 32 bits: four numbers of 8 bits each, and a bit is a light that's on or off. `/24` is the prefix length: the first 24 bits, the first three numbers, are the subnet. That leaves 8 bits for the machines on it: 256 numbers, `.0` to `.255`. `.0` names the subnet itself and `.255` reaches everyone on it, so 254 machines fit. Your plate said `/25`: one more bit of subnet, one fewer for machines. That cut the square into two halves, `.0` to `.127` and `.128` to `.255`, and chapel, at `.200`, was on the other half. With `/24` again, the subnet was whole. A `/16` goes the other way: only two numbers of subnet, and 65,536 addresses in it.",
    terms: [],
  },
  questions: [
    {
      q: "Why 24?",
      a: "Count the bits. Each of the four numbers is 8 bits: that's 8, 16, 24. Three numbers' worth is the subnet.",
    },
    {
      q: "What's a bit?",
      a: "A little light, on or off. Eight of them together make a number from 0 to 255.",
    },
    {
      q: "Why can't a house live at .0 or .255?",
      a: "`.0` is the subnet's own address, and `.255` reaches every machine on it at once. Nobody can use either.",
    },
    {
      q: "Why would anyone cut a subnet in half?",
      a: "When a network gets too big for one subnet, you split it. You'll see subnets of every size further up.",
    },
  ],
};
