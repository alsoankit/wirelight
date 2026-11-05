// The game session (tech/architecture.md): one room's network, shell and rules, run where the main
// thread can't block on it (a Web Worker, worker.ts). It knows nothing about rendering or the DOM.
// Everything it reports comes from the simulator's one trace: the main thread receives new events in
// batches and derives every view from them; the session adds only what the room's rules say about
// them (won, health checks, detectors fired).
import {
  applyRules,
  type CorridorState,
  ExchangeTracker,
  facts,
  LIT_FOR_MS,
  loadRoom,
  type RoomDef,
  roomById,
  rooms,
  toolsIn,
} from "@wirelight/rooms";
import { type Completion, complete, type SimBackend, type ToolId } from "@wirelight/shell";
import {
  type CmdSource,
  type DeviceId,
  decodeEth,
  decodeIPv4,
  fromHex,
  type ScannerCatch,
  type ScannerLayerName,
  type ScannerOpen,
  type SimEvent,
  type WorldState,
} from "@wirelight/sim";

export type RoomStatus = {
  roomId: string;
  /** Network time, ms. */
  now: number;
  won: boolean;
  /** Each health check by id: does that part of the room work now? */
  health: Record<string, boolean>;
  /** Detectors that have fired since the room (re)started, in the order they fired. */
  detectors: string[];
  /** Every corridor (cable) by link id: dark, lit or broken (CORE-12). */
  corridors: Record<string, CorridorState>;
  /** Every door by "device:iface": its address, whether it's switched on, and whether its link is up. */
  doors: Record<string, { mac: string; adminUp: boolean; up: boolean; addrs: string[] }>;
  /** Every cable end by "device:iface": plugged into that door, or out (a loose end on the floor). */
  cableEnds: Record<string, "in" | "out">;
  /** Each machine's routing board (CORE-27): its lines, as `ip route` would print them. */
  routes: Record<string, { dst: string; via: string | null; dev: string }[]>;
  /** Each machine's messengers' cards, in order ("" is a blank card). */
  cards: Record<string, string[]>;
  /** Keepers that have forgotten their job (0042): which desk, and what waits on it, oldest first. */
  desks: Record<string, { desk: "switch" | "host" | "router"; waiting: { from: string; to: string; door: string }[] }>;
};

/** What the main thread gets after each call: the trace events it hasn't seen yet, and the status. */
export type Batch = { events: SimEvent[]; status: RoomStatus };

/** A room in progress, for saves: enough to put the network back exactly as it was. */
export type RoomSave = { roomId: string; world: WorldState };

/** At most this long (screen ms) between rechecks of the room's checks when nothing meaningful happened. */
const CHECK_MS = 400;
/** Events after which the room's checks rerun at once: what the player did, and what arrived. */
const MEANINGFUL = new Set<SimEvent["kind"]>([
  "cmd.exec",
  "proc.exit",
  "proc.output",
  "app.deliver",
  "echo.heard",
  "control.touch",
  "keeper.step",
  "scanner.catch",
  "scanner.open",
  "scanner.compare",
  "world.reset",
]);

export class Session {
  private backend: SimBackend | null = null;
  private room: RoomDef | null = null;
  /** How much of the trace the main thread has already been sent. */
  private sent = 0;
  private fired: string[] = [];
  private subtitles: boolean | null = null;

  /** Loads a room from its fresh, faulted start, or from a save of it. */
  loadRoom(roomId: string, save?: RoomSave): Batch {
    const room = roomById(roomId);
    if (!room) throw new Error(`no room "${roomId}"`);
    if (save && save.roomId !== roomId) throw new Error(`save is for "${save.roomId}", not "${roomId}"`);
    this.room = room;
    this.backend = loadRoom(room, rooms);
    const own = this.backend.options;
    this.backend.options = (device) => {
      const o = own(device);
      return { ...o, subtitles: this.subtitles ?? o.subtitles };
    };
    if (save) this.backend.restore(save.world);
    this.sent = 0;
    this.fired = [];
    this.checks = null;
    this.corridorsSeen = 0;
    this.exchanges = new ExchangeTracker();
    return this.batch();
  }

  /** Runs one command line on a device, now. Clicks arrive here too, as the command they stand for. */
  exec(device: DeviceId, line: string, source: CmdSource): Batch & { execId: number; exitCode: number | null } {
    const { execId, exitCode } = this.live().exec(device, line, source);
    return { ...this.batch(), execId, exitCode };
  }

  /** Settings → Error subtitles (UI-08): always on, always off, or null for the room's own rule. */
  setSubtitles(on: boolean | null): void {
    this.subtitles = on;
  }

  /** Ctrl+C: stops a command that keeps running (ping, tcpdump) and reports its end. */
  interrupt(device: DeviceId, execId: number): Batch {
    this.live().world.interrupt(device, execId);
    return this.batch();
  }

  /** What was typed on a machine's console, oldest first (↑/↓). */
  history(device: DeviceId): string[] {
    return [...this.live().history(device)];
  }

  /** Tab: the typed word completed, from the tools the player has and this machine's doors (UI-09). */
  complete(device: DeviceId, line: string): Completion {
    return complete(this.live().world, device, line, toolsIn(this.current(), rooms) as Set<ToolId>);
  }

  /** Catches a copy of a message in flight into Captures (CORE-18); it goes on its way. */
  catchFrame(frameId: number): Batch & { n: number | null } {
    const n = this.live().world.catchFrame(frameId);
    return { ...this.batch(), n };
  }

  /** Opens a catch down to a layer (CORE-20; the Scanner peels it, 0043). */
  openCatch(device: DeviceId, n: number, layer: ScannerLayerName): Batch & { open: ScannerOpen } {
    const open = this.live().world.scannerOpen(device, n, layer);
    return { ...this.batch(), open };
  }

  /** Every catch so far: number, when, where, and its bytes as hex. */
  catches(): ScannerCatch[] {
    return [...this.live().world.scannerCatches()];
  }

  /** Touches a worn-out control (0040): nothing runs, but the room notices. */
  touch(device: DeviceId, control: string): Batch {
    this.live().touch(device, control);
    return this.batch();
  }

  /**
   * Lets network time run up to `t` (the main thread's presentation clock decides how fast). Never
   * goes backwards; asking for the past just returns what's new.
   *
   * With `until: "cable"`, time stops early at the moment a message enters a cable, so the clock can
   * slow down to show the crossing (a crossing is a fraction of a millisecond of network time,
   * shorter than one screen frame at real speed; CORE-14, CORE-42).
   */
  advanceTo(t: number, until?: "cable"): Batch {
    const b = this.live();
    if (until !== "cable") {
      if (t > b.now()) b.advance(t);
      return this.batch();
    }
    const from = b.trace().length;
    for (let guard = 0; guard < 10_000 && b.now() < t; guard++) {
      const next = b.nextEventTime();
      if (next === null || next > t) {
        b.advance(t);
        break;
      }
      b.advance(Math.max(next, b.now()));
      if (
        b
          .trace()
          .slice(from)
          .some((e) => e.kind === "link.enter")
      )
        break;
    }
    return this.batch();
  }

  /** Back to the room's faulted start, at the current time (the trace keeps a `world.reset` marker). */
  reset(): Batch {
    this.live().reset();
    this.fired = [];
    this.checks = null;
    return this.batch();
  }

  snapshot(): RoomSave {
    return { roomId: this.current().id, world: this.live().snapshot() };
  }

  /** The tools the player has in this room (for the console's help and completion). */
  tools(): string[] {
    return [...toolsIn(this.current(), rooms)];
  }

  /**
   * The room's checks (win, health, detectors) read the whole trace, so in a busy room (a storm) they
   * rerun when something meaningful happened (a command, a delivery, a catch…) or every CHECK_MS of
   * screen time, not on every step; everything else in the status is cheap and always current.
   */
  private checks: { won: boolean; health: Record<string, boolean> } | null = null;
  private checkedAt = 0;
  private corridorsSeen = 0;
  private exchanges = new ExchangeTracker();

  status(force = false): RoomStatus {
    const room = this.current();
    const b = this.live();
    const trace = b.trace();
    const fresh = trace.slice(this.corridorsSeen);
    this.exchanges.feed(fresh);
    this.corridorsSeen = trace.length;
    const wall = performance.now();
    if (force || !this.checks || wall - this.checkedAt > CHECK_MS || fresh.some((e) => MEANINGFUL.has(e.kind))) {
      const f = facts(trace, b.state());
      for (const m of room.misconceptions) if (!this.fired.includes(m.id) && m.detect(f)) this.fired.push(m.id);
      this.checks = {
        won: room.winCondition(f),
        health: Object.fromEntries(room.healthChecks.map((h) => [h.id, h.check(f)])),
      };
      this.checkedAt = wall;
    }
    const world = b.state();
    const now = b.now();
    const f = { world };
    return {
      roomId: room.id,
      now,
      won: this.checks.won,
      health: this.checks.health,
      detectors: [...this.fired],
      corridors: Object.fromEntries(
        world.links().map((l) => {
          if (!world.oper(l.a.device, l.a.iface).up) return [l.id, "broken"];
          return [l.id, this.exchanges.last(l.id) >= now - LIT_FOR_MS ? "lit" : "dark"];
        }),
      ),
      doors: Object.fromEntries(
        f.world.devices().flatMap((d) =>
          d.ifaces.map((i) => {
            const o = f.world.oper(d.id, i.name);
            const addrs = d.addrs.filter((a) => a.dev === i.name).map((a) => `${a.ip}/${a.prefix}`);
            return [`${d.id}:${i.name}`, { mac: i.mac, adminUp: o.adminUp, up: o.up, addrs }];
          }),
        ),
      ),
      desks: Object.fromEntries(
        f.world
          .devices()
          .filter((d) => d.keeper.asleep !== null)
          .map((d) => [
            d.id,
            {
              desk: d.keeper.asleep as "switch" | "host" | "router",
              waiting: d.keeper.desk.map((item) => {
                const bytes = fromHex(item.hex);
                if (item.kind === "frame") {
                  const eth = decodeEth(bytes);
                  return { from: eth.src, to: eth.dst, door: item.port ?? "" };
                }
                const ip = decodeIPv4(bytes);
                return { from: ip.src, to: ip.dst, door: item.port ?? "" };
              }),
            },
          ]),
      ),
      routes: Object.fromEntries(
        f.world.devices().map((d) => [d.id, d.routes.map((r) => ({ dst: r.dst, via: r.via, dev: r.dev }))]),
      ),
      cards: Object.fromEntries(
        f.world
          .devices()
          .filter((d) => d.messengers.length > 0)
          .map((d) => [d.id, d.messengers.map((m) => m.to)]),
      ),
      cableEnds: Object.fromEntries(
        f.world.links().flatMap((l) => [
          [`${l.a.device}:${l.a.iface}`, l.out.includes("a") ? "out" : "in"],
          [`${l.b.device}:${l.b.iface}`, l.out.includes("b") ? "out" : "in"],
        ]),
      ),
    };
  }

  private batch(): Batch {
    applyRules(this.current(), this.live());
    const trace = this.live().trace();
    const events = trace.slice(this.sent);
    this.sent = trace.length;
    return { events, status: this.status() };
  }

  private live(): SimBackend {
    if (!this.backend) throw new Error("no room loaded: call loadRoom first");
    return this.backend;
  }

  private current(): RoomDef {
    if (!this.room) throw new Error("no room loaded: call loadRoom first");
    return this.room;
  }
}
