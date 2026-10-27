import { HOUSE_LOCKED } from "./floor5";
import type { RoomText } from "./types";

/**
 * Region 3's secret room, *The Binary Behind /24* (floors/floor-7.md, "Secret room": draft for owner
 * review). Found after the census: a narrow door behind the street sign. Placeholders: {bell}, {lantern}.
 */
export const binaryBehind24: RoomText = {
  title: "The Binary Behind /24",
  mission: "Behind the street sign, bell lives on the square at house 200. Your house won't even try to reach it.",
  access: { lantern: HOUSE_LOCKED },
  notes: [
    "Someone changed my plate from /24 to /25 while I was counting houses. Just one more. Half the square went quiet. One more what?",
  ],
  hints: [
    { text: "Ping lantern, then ping bell. Only one of them answers. Why that one?" },
    { text: "Compare the `/` on your plate with the one on the street sign." },
    {
      text: "An address is 32 bits, four numbers of 8. The `/` counts how many bits, from the left, are the street. One more bit cuts the street in half.",
      codex: "thirty-two-bits",
    },
    { text: "Give your house its whole street back: the same house number, with the square's `/`." },
    {
      text: "`ip addr del 10.0.1.5/25 dev eth0`, then `ip addr add 10.0.1.5/24 dev eth0`, then `ping -c 3 {bell}`.",
    },
  ],
  detectors: {
    "street-too-big": {
      note: "Bell answers, but now your house thinks the street is far bigger than the square. Read the street sign again.",
      tried: "You made your street much bigger than the square, with a smaller number after the `/`.",
    },
    "other-half": {
      note: "Now bell's half hears you, and lantern's doesn't. A `/25` is only half a street.",
      tried: "You moved your house to bell's half of the street, and lost lantern's half.",
    },
    "move-bell": {
      note: "Bell's house is where it's always been. It's your plate that cut the street in two.",
      tried: "You moved bell, when it was your own plate that had split the street.",
    },
  },
  debrief: {
    happened:
      "An address is 32 bits: four numbers of 8 bits each, and a bit is a light that's on or off. `/24` means the first 24 bits, the first three numbers, are the street. That leaves 8 bits for the house: 256 numbers, `.0` to `.255`. `.0` names the street itself and `.255` calls everyone, so 254 houses can live there. Your plate said `/25`: one more bit of street, one fewer of house. That cut the square into two halves, `.0` to `.127` and `.128` to `.255`, and bell, at `.200`, was on the other half. With `/24` again, the street was whole. A `/16` goes the other way: only two numbers of street, and 65,536 numbers in it.",
    terms: [],
  },
  guardian: [
    {
      q: "Why 24?",
      a: "Count the bits, love. Each of the four numbers is 8: that's 8, 16, 24. Three numbers' worth is the street.",
    },
    {
      q: "What's a bit?",
      a: "A little light, on or off. Eight of them together make a number from 0 to 255.",
    },
    {
      q: "Why can't a house live at .0 or .255?",
      a: "`.0` is the street's own name, and `.255` calls every house at once. Nobody wants to live at either.",
    },
    {
      q: "Why would anyone cut a street in half?",
      a: "When a town gets too big for one street, you split it. You'll see streets of every size, further up.",
    },
  ],
};
