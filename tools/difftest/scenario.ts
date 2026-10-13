import type { Fault, Topology } from "@wirelight/sim";

/**
 * A difftest scenario (0045): a network, its faults, and steps to run on both real Linux and the
 * simulator. Each step runs on one machine, then the network gets `settleMs` before the next.
 */
export type Step =
  | { device: string; ping: { dst: string; count: number; ttl?: number; waitS?: number }; settleMs: number }
  | { device: string; run: string; settleMs: number };

export interface Scenario {
  name: string;
  topology: Topology;
  faults?: Fault[];
  steps: Step[];
  /**
   * Programs the real side needs beyond iproute2 and tcpdump. "dhclient": ISC dhclient, unpacked
   * from Fedora's RPMs into $DHCP_ROOT (tools/golden/capture-dhcp.sh); without it the scenario is skipped.
   */
  needs?: "dhclient"[];
}
