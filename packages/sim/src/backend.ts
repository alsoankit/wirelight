import type { Mac } from "./mac";
import type {
  CmdSource,
  DeviceId,
  DeviceState,
  EndRef,
  Fault,
  IfaceName,
  IfaceState,
  LinkState,
  SimEvent,
  Topology,
  Unsubscribe,
  WorldState,
} from "./types";

/** Read-only views for plates, boards, health checks and the shell (SIM-41 `state()`). */
export interface WorldView {
  readonly now: number;
  devices(): readonly Readonly<DeviceState>[];
  device(id: DeviceId): Readonly<DeviceState> | undefined;
  iface(device: DeviceId, name: IfaceName): Readonly<IfaceState> | undefined;
  links(): readonly Readonly<LinkState>[];
  peer(device: DeviceId, name: IfaceName): EndRef | null;
  oper(device: DeviceId, name: IfaceName): { adminUp: boolean; carrier: boolean; up: boolean };
}

export interface ExecHandle {
  readonly execId: number;
  /** null while a streaming command is still running. */
  readonly exitCode: number | null;
  /** Ctrl+C. */
  interrupt(): void;
}

export interface BackendCapabilities {
  /** Whether the backend reports keeper decisions (`fwd.decision`). Real mode won't. */
  richDecisions: boolean;
}

/**
 * The only way the game talks to a network (SIM-41). Output of `exec` arrives as
 * `proc.output` events in the trace, so the console reads the same trace as everything else.
 */
export interface NetworkBackend {
  load(topology: Topology, faults: Fault[], seed: number): Promise<void>;
  exec(deviceId: DeviceId, line: string, source: CmdSource): ExecHandle;
  /** A worn-out control was touched (0040): nothing runs; the trace records it. */
  touch(deviceId: DeviceId, control: string): void;
  advance(toNetworkTime: number): void;
  nextEventTime(): number | null;
  now(): number;
  inFlight(): number;
  subscribe(listener: (e: SimEvent) => void): Unsubscribe;
  trace(): readonly SimEvent[];
  state(): WorldView;
  snapshot(): WorldState;
  restore(s: WorldState): void;
  reset(): void;
  capabilities(): BackendCapabilities;
}

export type { Mac };
