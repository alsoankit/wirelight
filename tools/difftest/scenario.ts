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
}
