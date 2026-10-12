/**
 * What the protocol layers (bridge, IPv4, neighbours, ping) need from the simulator core. The core
 * (world.ts) owns time, the queue, cables and the trace; the layers own the packet path, in the
 * order Linux runs it (tech/simulator.md, "The packet path").
 */

import type {
  DeviceId,
  DeviceState,
  FrameOrigin,
  IfaceName,
  IfaceState,
  Scheduled,
  SimEvent,
  WorldState,
} from "./types";
import type { OperState } from "./world";

export type Unscheduled = Scheduled extends infer S ? (S extends Scheduled ? Omit<S, "seq"> : never) : never;

export interface Kernel {
  readonly s: WorldState;
  emit(e: SimEvent): void;
  schedule(item: Unscheduled): void;
  /** A seeded float in [0, 1). */
  random(): number;
  oper(device: DeviceId, iface: IfaceName): OperState;
  /** Puts bytes on the cable plugged into a physical door. Returns the new frame id. */
  wire(device: DeviceId, iface: IfaceName, bytes: Uint8Array, origin: FrameOrigin, parent?: number): number;
  /** Sends a frame out of a door as the machine would: through its bridge if the door is one. */
  send(device: DeviceId, iface: IfaceName, bytes: Uint8Array, origin: FrameOrigin, parent?: number): void;
  /** A frame reached this machine's own network stack on this door (after any bridge). */
  hostReceive(device: DeviceId, iface: IfaceName, frameId: number, bytes: Uint8Array): void;
}

export function deviceOf(k: Kernel, id: DeviceId): DeviceState | undefined {
  return k.s.devices[id];
}

export function ifaceOf(d: DeviceState | undefined, name: IfaceName): IfaceState | undefined {
  return d?.ifaces.find((i) => i.name === name);
}
