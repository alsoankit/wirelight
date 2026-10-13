import type { Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { SimBackend, type ToolId, tokenize } from "../src";
import { testContent } from "./content";

const topology: Topology = {
  devices: [
    {
      id: "observatory",
      hostname: "observatory",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
    },
    {
      id: "lantern",
      hostname: "lantern",
      kind: "host",
      interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }],
      lab: { mode: "responder", reply: "key: copper-lantern" },
    },
  ],
  links: [{ id: "c1", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
};

function setup(tools: ToolId[] = ["ip link", "lab send-frame"], subtitles = true) {
  const b = new SimBackend(testContent);
  b.options = () => ({ tools: new Set(tools), subtitles });
  b.loadSync(topology, [], 1);
  const run = (line: string, source: "typed" | "click" = "typed") => {
    const h = b.exec("observatory", line, source);
    const out = b
      .trace()
      .filter((e) => e.kind === "proc.output" && e.execId === h.execId)
      .map((e) => (e.kind === "proc.output" ? `${e.stream}: ${e.text}` : ""));
    return { code: h.exitCode, out };
  };
  return { b, run };
}

describe("lab send-frame", () => {
  it("sends, prints the frame size, and the lab note comes first, once", () => {
    const { run } = setup();
    expect(run('lab send-frame --to 02:00:00:00:00:07 --msg "hello there"')).toEqual({
      code: 0,
      out: ["note: lab tools exist only in Wirelight", "stdout: sent 1 frame (to 02:00:00:00:00:07, 25 bytes)"],
    });
    expect(run("lab send-frame --to 02:00:00:00:00:07").out).toEqual([
      "stdout: sent 1 frame (to 02:00:00:00:00:07, 19 bytes)",
    ]);
  });

  it("the reply carrying the key arrives through the simulator", () => {
    const { b, run } = setup();
    run("lab send-frame --to 02:00:00:00:00:07");
    b.advance(10);
    const got = b.trace().filter((e) => e.kind === "app.deliver" && e.device === "observatory");
    expect(got).toMatchObject([{ text: "key: copper-lantern", from: "02:00:00:00:00:07" }]);
  });

  it("normalizes uppercase MACs and reports bad ones", () => {
    const { run } = setup();
    run("lab send-frame --to 02:00:00:00:00:07");
    expect(run("lab send-frame --to 02:00:00:00:00:AB").out).toEqual([
      "stdout: sent 1 frame (to 02:00:00:00:00:ab, 19 bytes)",
    ]);
    expect(run("lab send-frame --to lantern")).toMatchObject({
      code: 2,
      out: ['stderr: lab send-frame: "lantern" is not a MAC address (like 02:00:00:00:00:07)'],
    });
    expect(run("lab send-frame").code).toBe(2);
  });

  it("refuses to send on a door that is down (ENETDOWN)", () => {
    const { run } = setup();
    run("ip link set eth0 down");
    expect(run("lab send-frame --to 02:00:00:00:00:07")).toMatchObject({
      code: 1,
      out: ["note: lab tools exist only in Wirelight", "stderr: lab send-frame: eth0: Network is down"],
    });
  });
});

describe("the shell", () => {
  it("locked tools say so (FR-CON-11), real or game-only", () => {
    const { run } = setup(["ip link"]);
    expect(run("ping 10.0.0.1")).toEqual({ code: 127, out: ["note: You haven't found this tool yet."] });
    expect(run("ip addr")).toEqual({ code: 127, out: ["note: You haven't found this tool yet."] });
    expect(run("lab send-frame --to 02:00:00:00:00:07").out.at(-1)).toBe("note: You haven't found this tool yet.");
  });

  it("unknown commands are not found, like bash", () => {
    expect(setup().run("frobnicate now")).toEqual({ code: 127, out: ["stderr: frobnicate: command not found"] });
  });

  it("sudo runs the command and notes once that you're root", () => {
    const { run } = setup();
    expect(run("sudo ip link set eth0 up")).toEqual({ code: 0, out: ["note: You're already root here."] });
    expect(run("sudo ip link set eth0 up")).toEqual({ code: 0, out: [] });
  });

  it("| grep filters stdout (with -i and -v); other pipes aren't found", () => {
    const { run } = setup();
    expect(run("ip link | grep eth0").out).toEqual([
      "stdout: 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000",
    ]);
    expect(run("ip link | grep -i LINK/ETHER").out).toEqual([
      "stdout:     link/ether 02:00:00:00:00:05 brd ff:ff:ff:ff:ff:ff",
    ]);
    expect(run("ip link | grep -v link/").out).toHaveLength(2);
    expect(run("ip link | grep nothing-matches").code).toBe(1);
    expect(run("ip link | sort")).toEqual({ code: 127, out: ["stderr: sort: command not found"] });
  });

  it("error subtitles follow real errors, and can be turned off", () => {
    expect(setup().run("ip link set eth9 up").out).toEqual([
      'stderr: Cannot find device "eth9"',
      "note: There's no door with that name here.",
    ]);
    expect(setup(["ip link"], false).run("ip link set eth9 up").out).toEqual(['stderr: Cannot find device "eth9"']);
  });

  it("history lists typed and clicked commands; clear and exit are console actions", () => {
    const { run } = setup();
    run("ip link");
    run("ip link set dev eth0 up", "click");
    expect(run("history").out).toEqual([
      "stdout:     1  ip link",
      "stdout:     2  ip link set dev eth0 up",
      "stdout:     3  history",
    ]);
    expect(run("clear").out).toEqual(["control: clear"]);
    expect(run("exit").out).toEqual(["control: exit"]);
  });

  it("every command lands in the trace with its source", () => {
    const { b, run } = setup();
    run("ip link set dev eth0 down", "click");
    const ex = b.trace().filter((e) => e.kind === "cmd.exec");
    expect(ex).toMatchObject([
      { line: "ip link set dev eth0 down", source: "click", exitCode: 0, device: "observatory" },
    ]);
    expect(b.trace().some((e) => e.kind === "table.change" && e.after === false)).toBe(true);
  });
});

describe("tokenize", () => {
  it("handles quotes, escapes and pipes", () => {
    expect(tokenize(`lab send-frame --msg "hi | there" 'a b' c\\ d | grep x`)).toEqual({
      ok: true,
      stages: [
        ["lab", "send-frame", "--msg", "hi | there", "a b", "c d"],
        ["grep", "x"],
      ],
    });
    expect(tokenize('echo "oops')).toEqual({
      ok: false,
      error: "bash: unexpected EOF while looking for matching `\"'",
    });
    expect(tokenize('x ""')).toEqual({ ok: true, stages: [["x", ""]] });
  });
});

describe("lab card", () => {
  const withCard: Topology = {
    ...topology,
    devices: topology.devices.map((d) =>
      d.id === "observatory" ? { ...d, messenger: { to: "02:00:00:00:00:17" } } : d,
    ),
  };
  function cardSetup() {
    const b = new SimBackend(testContent);
    b.options = () => ({ tools: new Set<ToolId>(["lab card"]), subtitles: true });
    b.loadSync(withCard, [], 1);
    b.world.emit({ kind: "world.reset", t: 0 }); // keep the lab note out of the way
    b.shellFlags.labNoteShown = true;
    const run = (line: string, device = "observatory") => {
      const h = b.exec(device, line, "typed");
      return b
        .trace()
        .filter((e) => e.kind === "proc.output" && e.execId === h.execId)
        .map((e) => (e.kind === "proc.output" ? `${e.stream}: ${e.text}` : ""))
        .concat(`exit ${h.exitCode}`);
    };
    return { b, run };
  }

  it("shows the card", () => {
    expect(cardSetup().run("lab card show")).toEqual([
      "stdout: to       02:00:00:00:00:17",
      "stdout: message  hello",
      "stdout: every    4 s",
      "exit 0",
    ]);
    expect(cardSetup().run("lab card")).toHaveLength(4);
  });

  it("set changes the address quietly, and the messenger uses it", () => {
    const { b, run } = cardSetup();
    expect(run("lab card set --to 02:00:00:00:00:07")).toEqual(["exit 0"]);
    expect(b.world.device("observatory")?.messengers[0]?.to).toBe("02:00:00:00:00:07");
  });

  it("rejects bad input and machines without a card", () => {
    const { run } = cardSetup();
    expect(run("lab card set --to lantern")).toEqual([
      'stderr: lab card: "lantern" is not a MAC address (like 02:00:00:00:00:07)',
      "exit 2",
    ]);
    expect(run("lab card set 02:00:00:00:00:07").at(-1)).toBe("exit 2");
    expect(run("lab card show", "lantern")).toEqual([
      "stderr: lab card: there's no address card on this machine",
      "exit 1",
    ]);
  });
});
