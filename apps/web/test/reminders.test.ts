import { describe, expect, it } from "vitest";
import { commandOf, LEARNED_AFTER, remindersFor } from "../src/play/reminders";

const BOOK = ["ip link", "bridge fdb", "bridge fdb del", "ping", "ping -t", "ip addr", "ip route", "ip neigh"];

describe("commandOf", () => {
  it("finds the entry a typed line uses", () => {
    expect(commandOf("ip link set eth0 up", BOOK)).toBe("ip link");
    expect(commandOf("ip l", BOOK)).toBe("ip link");
    expect(commandOf("ip a add 10.0.1.5/24 dev eth0", BOOK)).toBe("ip addr");
    expect(commandOf("bridge fdb show", BOOK)).toBe("bridge fdb");
    expect(commandOf("bridge fdb del 02:00:00:00:00:07 dev eth1 master", BOOK)).toBe("bridge fdb del");
    expect(commandOf("ping -c 1 -t 2 10.0.3.9", BOOK)).toBe("ping -t");
    expect(commandOf("ping -c 1 10.0.1.7", BOOK)).toBe("ping");
  });
  it("reads ip's objects from any start of their names, as the shell does", () => {
    const forms: [string, string[]][] = [
      ["ip addr", ["a", "ad", "add", "addr", "addre", "address"]],
      ["ip route", ["r", "ro", "rou", "rout", "route"]],
      ["ip link", ["l", "li", "lin", "link"]],
      ["ip neigh", ["n", "ne", "nei", "neig", "neigh", "neighb", "neighbor", "neighbour"]],
    ];
    for (const [entry, short] of forms) for (const w of short) expect(commandOf(`ip ${w} show`, BOOK), w).toBe(entry);
    expect(commandOf("ip ad add 10.0.1.5/24 dev eth0", BOOK)).toBe("ip addr");
    expect(commandOf("ip nei del 10.0.1.7 dev eth0", BOOK)).toBe("ip neigh");
    // Not a start of any object's name: no entry, as the shell answers "Object … is unknown".
    expect(commandOf("ip lnk set eth0 up", BOOK)).toBeUndefined();
    expect(commandOf("ip addresses", BOOK)).toBeUndefined();
  });
  it("ignores lines that use no entry", () => {
    expect(commandOf("man ip", BOOK)).toBeUndefined();
    expect(commandOf("lab send-frame --to x", BOOK)).toBeUndefined();
  });
});

describe("remindersFor", () => {
  const order = ["a", "b", "c", "d", "e", "f"];
  const commands = [
    { command: "ip link", room: "b" },
    { command: "ping", room: "c" },
  ];
  it("shows nothing before or in the room that teaches it", () => {
    expect(remindersFor("b", order, commands, {})).toEqual([]);
  });
  it("shows a learned command fully until it is typed in a later room, then short, then not at all", () => {
    expect(remindersFor("c", order, commands, { "ip link": ["b"] })).toEqual([{ command: "ip link", level: "full" }]);
    expect(remindersFor("d", order, commands, { "ip link": ["b", "c"] })[1]).toEqual({
      command: "ip link",
      level: "short",
    });
    const typed = { "ip link": ["b", "c", "d", "e"].slice(0, LEARNED_AFTER + 1) };
    expect(remindersFor("f", order, commands, typed).map((r) => r.command)).toEqual(["ping"]);
  });
  it("puts the most recently learned first", () => {
    expect(remindersFor("d", order, commands, {}).map((r) => r.command)).toEqual(["ping", "ip link"]);
  });
});
