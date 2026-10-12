import {
  type BackendCapabilities,
  type CmdSource,
  type DeviceId,
  type ExecHandle,
  type Fault,
  type NetworkBackend,
  type SimEvent,
  Simulator,
  type Topology,
  type Unsubscribe,
  type WorldState,
  type WorldView,
} from "@wirelight/sim";
import { type ExecOptions, Shell } from "./shell";
import type { ShellContent } from "./types";

/** The MVP backend (SIM-42): the simulator plus the shell, behind NetworkBackend. */
export class SimBackend implements NetworkBackend {
  private sim: Simulator | null = null;
  private readonly shell: Shell;
  private readonly listeners = new Set<(e: SimEvent) => void>();
  private detach: Unsubscribe | null = null;

  /** Which tools and comforts apply to a device's shell; set by the game from progress and the room. */
  options: (device: DeviceId) => ExecOptions = () => ({ tools: new Set(), subtitles: true });

  constructor(content: ShellContent) {
    this.shell = new Shell(content);
  }

  get world(): Simulator {
    if (!this.sim) throw new Error("SimBackend: load() first");
    return this.sim;
  }

  get shellFlags() {
    return this.shell.flags;
  }

  history(device: DeviceId): readonly string[] {
    return this.shell.history(device);
  }

  async load(topology: Topology, faults: Fault[], seed: number): Promise<void> {
    this.loadSync(topology, faults, seed);
  }

  /** Synchronous load, for tests and the room validator. */
  loadSync(topology: Topology, faults: Fault[], seed: number): void {
    this.detach?.();
    this.sim = new Simulator(topology, faults, seed);
    this.detach = this.sim.subscribe((e) => {
      for (const fn of this.listeners) fn(e);
    });
  }

  exec(deviceId: DeviceId, line: string, source: CmdSource): ExecHandle {
    const r = this.shell.exec(this.world, deviceId, line, source, this.options(deviceId));
    const sim = this.world;
    return { execId: r.execId, exitCode: r.exitCode, interrupt: () => sim.interrupt(deviceId, r.execId) };
  }

  advance(to: number): void {
    this.world.advance(to);
  }
  nextEventTime(): number | null {
    return this.world.nextEventTime();
  }
  now(): number {
    return this.world.now;
  }
  inFlight(): number {
    return this.world.inFlight();
  }
  subscribe(listener: (e: SimEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  trace(): readonly SimEvent[] {
    return this.world.trace;
  }
  state(): WorldView {
    return this.world;
  }
  snapshot(): WorldState {
    return this.world.snapshot();
  }
  restore(s: WorldState): void {
    this.world.restore(s);
  }
  reset(): void {
    this.world.reset();
  }
  capabilities(): BackendCapabilities {
    return { richDecisions: true };
  }
}
