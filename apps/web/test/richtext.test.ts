import { rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { CARD_WHEN, cardDue, readForCards } from "../src/play/cardRules";
import { pieces, plain } from "../src/play/RichText";

describe("RichText", () => {
  it("shows `code`, *italics* and [[keys]] as marks, never raw", () => {
    expect(pieces("Type `ip link` then press [[Enter]]: the *to* changes.")).toEqual([
      { kind: "text", text: "Type " },
      { kind: "code", text: "ip link" },
      { kind: "text", text: " then press " },
      { kind: "kbd", text: "Enter" },
      { kind: "text", text: ": the " },
      { kind: "em", text: "to" },
      { kind: "text", text: " changes." },
    ]);
  });
  it("keeps an asterisk inside code, and a lone star, as text", () => {
    expect(pieces("`a*b*c` and 2 * 3")).toEqual([
      { kind: "code", text: "a*b*c" },
      { kind: "text", text: " and 2 * 3" },
    ]);
    expect(plain("the `/24` after *an* address")).toBe("the /24 after an address");
  });
});

describe("discovery cards", () => {
  it("an object waits for its moment, an idea for the debrief", () => {
    const seen = new Set<string>();
    expect(cardDue("door", seen, false)).toBe(true);
    expect(cardDue("plate", seen, false)).toBe(false);
    expect(cardDue("source-address", seen, false)).toBe(false);
    expect(cardDue("source-address", seen, true)).toBe(true);
    readForCards({ panel: { kind: "plate", device: "observatory", iface: "eth0" }, moving: 0, events: [] }, seen);
    expect(cardDue("plate", seen, false)).toBe(true);
    expect(cardDue("message", seen, false)).toBe(false);
  });
});

it("every room's card has its moment written down", () => {
  const missing = rooms.flatMap((r) => r.cards).filter((c) => !(c in CARD_WHEN));
  expect(missing).toEqual([]);
});
