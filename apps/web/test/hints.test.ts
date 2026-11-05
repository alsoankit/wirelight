import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { attempts, readOnly } from "../src/play/hints";

const typed = (line: string, execId: number): SimEvent => ({
  kind: "cmd.exec",
  t: 0,
  device: "observatory",
  execId,
  line,
  source: "typed",
  exitCode: 0,
});

describe("the hint ladder's attempts (HELP-09)", () => {
  it("never counts a command that only looks, in any form the shell reads it", () => {
    const looks = [
      "ip link",
      "ip addr show dev eth0",
      "ip a",
      "ip r",
      "ip n",
      "ip l sh",
      "ip addr list",
      "ip neighbour show",
      "ip route get 10.0.1.7",
      "ip",
      "ip help",
      "ip link help",
      "bridge",
      "bridge fdb show",
      "bridge fdb show dev eth1",
      "bridge link",
      "bridge link show",
      "lab",
      "lab card",
      "lab keeper show",
      "lab scanner open 1 --layer packet",
      "lab scanner compare 1 3",
      "sysctl net.ipv4.ip_forward",
      "sysctl -a",
      "tcpdump -i eth0",
      "man ip",
      "sudo ip link",
      "ip addr | grep inet",
    ];
    for (const line of looks) expect(readOnly(line), line).toBe(true);
  });

  it("counts every command that changes or sends something, however it's spelled", () => {
    const changes = [
      "ip link set eth0 up",
      "ip link s eth0 up",
      "ip a add 10.0.1.5/24 dev eth0",
      "ip r add default via 10.0.1.1",
      "ip route flush cache",
      "ip neigh del 10.0.1.7 dev eth0",
      "bridge link set dev eth3 cost 5",
      "bridge fdb del 02:00:00:00:00:07 dev eth1 master",
      "sysctl -w net.ipv4.ip_forward=1",
      "sysctl net.ipv4.ip_forward=1",
      "lab card --to 10.0.1.7",
      "lab scanner catch --next",
      "lab scanner trace --next",
      "lab cable plug eth4",
      "lab send-frame --to 02:00:00:00:00:0a --msg hello",
      "ping -c 1 10.0.1.7",
      "dhclient -v eth0",
      "sudo ip link set eth0 up",
    ];
    for (const line of changes) expect(readOnly(line), line).toBe(false);
  });

  it("brings no hint closer for looking around (the Peacekeeper's `bridge link show`)", () => {
    const events = ["bridge link show", "ip a", "bridge link show", "ip link set br0 type bridge stp_state 1"];
    expect(attempts(events.map(typed))).toBe(1);
  });
});
