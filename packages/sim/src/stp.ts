/**
 * The Linux bridge's spanning tree (kernel STP, IEEE 802.1D), following net/bridge/br_stp.c,
 * br_stp_timer.c, br_stp_if.c and br_stp_bpdu.c function for function, so the same events give the
 * same port states, BPDUs and timings as measured on kernel 7.1 (tools/golden/LINUX-FACTS.md,
 * "Spanning tree").
 *
 * In short: every bridge starts out believing it is the root and sends configuration BPDUs on its
 * designated ports every hello time (2 s). A bridge that hears a better root (lower bridge id:
 * priority, then MAC) takes the port it heard it on as its root port and relays the root's BPDUs. On
 * each segment the port with the best path to the root is designated; any other port is blocked.
 * A port that may forward first listens (forward delay, 15 s), then learns addresses (15 s), then
 * forwards. Stored root information ages out after max age (20 s) without a refresh. A forwarding
 * change is a topology change: notifications (TCN) go up to the root, which sets the TC flag for
 * max age + forward delay, during which addresses age out after forward delay instead of 300 s.
 *
 * Port states are kept even with STP off: `stp_state 0` leaves a blocked port blocked until its
 * stored BPDU ages out (then it forwards at once), as measured.
 *
 * Timers are kernel timers (wheel.ts): hello and hold timers are also rounded to a whole second
 * (round_jiffies), which is why hellos come 1.984, 1.984, 2.048 s apart on a real machine.
 */
import { fdbGcArm, fdbPortDown } from "./bridge";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import type { Mac } from "./mac";
import { type Bpdu, bridgeIdOf, type ConfigBpdu, decodeBpdu, encodeBpdu } from "./proto/stp";
import type {
  BridgeSpec,
  BridgeState,
  DeviceId,
  IfaceName,
  Scheduled,
  StpBridge,
  StpPort,
  StpPortState,
} from "./types";
import { kernelTimer } from "./wheel";

/** Linux's defaults (br_stp_if.c, br_if.c): priority 32768; timers in ms; veth's path cost 2 (10 Gbit/s). */
export const STP_DEFAULTS = {
  priority: 0x8000,
  maxAge: 20_000,
  helloTime: 2_000,
  forwardDelay: 15_000,
  portPriority: 32,
  portCost: 2,
} as const;

/** BR_HOLD_TIME: at most one configuration BPDU a second per port. */
const HOLD_MS = 1000;
/** MESSAGE_AGE_INCR: (HZ / 256) + 1 jiffies added to the age of a relayed BPDU. */
const MESSAGE_AGE_INCR = 4;
/** Ranges the kernel accepts (br_private.h), ms. */
const RANGE = {
  forwardDelay: [2_000, 30_000],
  helloTime: [1_000, 10_000],
  maxAge: [6_000, 40_000],
} as const;

/** A fresh bridge's spanning tree: STP off unless the spec says so, every port disabled until enabled. */
export function newBridgeStp(
  mac: Mac,
  ports: IfaceName[],
  spec?: Pick<BridgeSpec, "stp" | "priority" | "ageingMs">,
): StpBridge {
  const priority = spec?.priority ?? STP_DEFAULTS.priority;
  const bridgeId = bridgeIdOf(priority, mac);
  return {
    enabled: spec?.stp ?? false,
    priority,
    bridgeId,
    designatedRoot: bridgeId,
    rootPathCost: 0,
    rootPort: 0,
    maxAge: STP_DEFAULTS.maxAge,
    helloTime: STP_DEFAULTS.helloTime,
    forwardDelay: STP_DEFAULTS.forwardDelay,
    bridgeMaxAge: STP_DEFAULTS.maxAge,
    bridgeHelloTime: STP_DEFAULTS.helloTime,
    bridgeForwardDelay: STP_DEFAULTS.forwardDelay,
    ageingNow: spec?.ageingMs ?? 300_000,
    topologyChange: false,
    topologyChangeDetected: false,
    timers: {},
    stamp: 0,
    ports: ports.map((name, n) => ({
      name,
      portNo: n + 1,
      priority: STP_DEFAULTS.portPriority,
      cost: STP_DEFAULTS.portCost,
      state: "disabled",
      portId: (STP_DEFAULTS.portPriority << 10) | (n + 1),
      designatedRoot: bridgeId,
      designatedCost: 0,
      designatedBridge: bridgeId,
      designatedPort: (STP_DEFAULTS.portPriority << 10) | (n + 1),
      designatedAge: 0,
      topologyChangeAck: false,
      configPending: false,
    })),
  };
}

export function stpPort(br: BridgeState, name: IfaceName): StpPort | undefined {
  return br.stp.ports.find((p) => p.name === name);
}

/** May this port carry frames (send, flood, forward)? */
export function portForwards(br: BridgeState, name: IfaceName): boolean {
  return stpPort(br, name)?.state === "forwarding";
}

// ── Context, timers, notifications ─────────────────────────────────────────────────────────

interface Ctx {
  k: Kernel;
  device: DeviceId;
  br: BridgeState;
  s: StpBridge;
}

function ctx(k: Kernel, device: DeviceId, br: BridgeState): Ctx {
  return { k, device, br, s: br.stp };
}

/** round_jiffies: to the nearest whole second, but only down if within 250 ms; never into the past. */
function roundJiffies(j: number, now: number): number {
  const rem = j % 1000;
  const r = rem < 250 ? j - rem : j - rem + 1000;
  return r <= now ? j : r;
}

/** mod_timer(jiffies + delay), optionally round_jiffies'd. */
function arm(c: Ctx, name: string, delay: number, round = false): void {
  const now = c.k.s.t;
  const at = round
    ? kernelTimer(now, roundJiffies(Math.floor(now) + delay, now) - now)
    : kernelTimer(now, Math.max(0, delay));
  const stamp = ++c.s.stamp;
  c.s.timers[name] = { at, stamp };
  c.k.schedule({ t: at, kind: "stp", device: c.device, bridge: c.br.name, timer: name, stamp });
}

function disarm(c: Ctx, name: string): void {
  delete c.s.timers[name];
}

function pending(c: Ctx, name: string): boolean {
  return name in c.s.timers;
}

/**
 * Runs one kernel entry point and then reports each port whose state changed (the kernel's
 * br_ifinfo_notify): a port passing through a state inside one step (blocking while it is
 * initialised) isn't reported, just as `bridge monitor` never shows it.
 */
function notifying<T>(c: Ctx, fn: () => T): T {
  const before = c.s.ports.map((p) => p.state);
  const out = fn();
  c.s.ports.forEach((p, i) => {
    const was = before[i] as StpPortState;
    if (p.state !== was)
      c.k.emit({
        kind: "table.change",
        t: c.k.s.t,
        device: c.device,
        table: "stp",
        op: "set",
        key: p.name,
        before: was,
        after: p.state,
      });
  });
  return out;
}

const newestFirst = (s: StpBridge) => [...s.ports].reverse();
const byNo = (s: StpBridge, no: number) => s.ports.find((p) => p.portNo === no);
const isRoot = (s: StpBridge) => s.bridgeId === s.designatedRoot;
const isDesignated = (s: StpBridge, p: StpPort) => p.designatedBridge === s.bridgeId && p.designatedPort === p.portId;
const bridgeUp = (c: Ctx) => !!ifaceOf(deviceOf(c.k, c.device), c.br.name)?.adminUp;

// ── Sending (br_stp_bpdu.c) ────────────────────────────────────────────────────────────────

function send(c: Ctx, p: StpPort, b: Bpdu): void {
  if (!c.s.enabled) return;
  const mac = ifaceOf(deviceOf(c.k, c.device), p.name)?.mac;
  if (mac) c.k.wire(c.device, p.name, encodeBpdu(mac, b), "kernel");
}

/** br_transmit_config: a configuration BPDU out of a designated port, at most one a second. */
function transmitConfig(c: Ctx, p: StpPort): void {
  const { s } = c;
  if (pending(c, `${p.name}:hold`)) {
    p.configPending = true;
    return;
  }
  let messageAge = 0;
  if (!isRoot(s)) {
    const root = byNo(s, s.rootPort);
    messageAge = Math.floor(c.k.s.t) - (root?.designatedAge ?? 0) + MESSAGE_AGE_INCR;
  }
  if (messageAge >= s.maxAge) return;
  send(c, p, {
    type: "config",
    topologyChange: s.topologyChange,
    topologyChangeAck: p.topologyChangeAck,
    root: s.designatedRoot,
    rootPathCost: s.rootPathCost,
    bridgeId: s.bridgeId,
    portId: p.portId,
    messageAge,
    maxAge: s.maxAge,
    helloTime: s.helloTime,
    forwardDelay: s.forwardDelay,
  });
  p.topologyChangeAck = false;
  p.configPending = false;
  if (s.enabled) arm(c, `${p.name}:hold`, HOLD_MS, true);
}

function transmitTcn(c: Ctx): void {
  const p = byNo(c.s, c.s.rootPort);
  if (p) send(c, p, { type: "tcn" });
}

function configBpduGeneration(c: Ctx): void {
  for (const p of newestFirst(c.s)) if (p.state !== "disabled" && isDesignated(c.s, p)) transmitConfig(c, p);
}

// ── Choosing roles (br_stp.c) ──────────────────────────────────────────────────────────────

function shouldBecomeRootPort(c: Ctx, p: StpPort, rootPort: number): boolean {
  const { s } = c;
  if (p.state === "disabled" || isDesignated(s, p)) return false;
  if (s.bridgeId <= p.designatedRoot) return false;
  if (!rootPort) return true;
  const rp = byNo(s, rootPort);
  if (!rp) return true;
  if (p.designatedRoot !== rp.designatedRoot) return p.designatedRoot < rp.designatedRoot;
  const a = p.designatedCost + p.cost;
  const b = rp.designatedCost + rp.cost;
  if (a !== b) return a < b;
  if (p.designatedBridge !== rp.designatedBridge) return p.designatedBridge < rp.designatedBridge;
  if (p.designatedPort !== rp.designatedPort) return p.designatedPort < rp.designatedPort;
  return p.portId < rp.portId;
}

function rootSelection(c: Ctx): void {
  const { s } = c;
  let rootPort = 0;
  for (const p of newestFirst(s)) if (shouldBecomeRootPort(c, p, rootPort)) rootPort = p.portNo;
  s.rootPort = rootPort;
  const rp = byNo(s, rootPort);
  if (!rp) {
    s.designatedRoot = s.bridgeId;
    s.rootPathCost = 0;
  } else {
    s.designatedRoot = rp.designatedRoot;
    s.rootPathCost = rp.designatedCost + rp.cost;
  }
}

function becomeDesignatedPort(c: Ctx, p: StpPort): void {
  p.designatedRoot = c.s.designatedRoot;
  p.designatedCost = c.s.rootPathCost;
  p.designatedBridge = c.s.bridgeId;
  p.designatedPort = p.portId;
}

function shouldBecomeDesignatedPort(c: Ctx, p: StpPort): boolean {
  const { s } = c;
  if (isDesignated(s, p)) return true;
  if (p.designatedRoot !== s.designatedRoot) return true;
  if (s.rootPathCost !== p.designatedCost) return s.rootPathCost < p.designatedCost;
  if (s.bridgeId !== p.designatedBridge) return s.bridgeId < p.designatedBridge;
  return p.portId < p.designatedPort;
}

function designatedPortSelection(c: Ctx): void {
  for (const p of newestFirst(c.s))
    if (p.state !== "disabled" && shouldBecomeDesignatedPort(c, p)) becomeDesignatedPort(c, p);
}

function configurationUpdate(c: Ctx): void {
  rootSelection(c);
  designatedPortSelection(c);
}

// ── Port states ────────────────────────────────────────────────────────────────────────────

/** __br_set_topology_change: during a topology change addresses are kept only 2 × forward delay. */
function setTopologyChange(c: Ctx, val: boolean): void {
  const { s } = c;
  if (s.enabled && s.topologyChange !== val) s.ageingNow = val ? 2 * s.forwardDelay : c.br.ageingMs;
  s.topologyChange = val;
}

function topologyChangeDetection(c: Ctx): void {
  const { s } = c;
  if (!s.enabled) return;
  if (isRoot(s)) {
    setTopologyChange(c, true);
    arm(c, "tc", s.bridgeForwardDelay + s.bridgeMaxAge);
  } else if (!s.topologyChangeDetected) {
    transmitTcn(c);
    arm(c, "tcn", s.bridgeHelloTime);
  }
  s.topologyChangeDetected = true;
}

function makeForwarding(c: Ctx, p: StpPort): void {
  if (p.state !== "blocking") return;
  if (!c.s.enabled || c.s.forwardDelay === 0) {
    p.state = "forwarding";
    topologyChangeDetection(c);
    disarm(c, `${p.name}:fwd`);
    return;
  }
  p.state = "listening";
  arm(c, `${p.name}:fwd`, c.s.forwardDelay);
}

function makeBlocking(c: Ctx, p: StpPort): void {
  if (p.state === "disabled" || p.state === "blocking") return;
  if (p.state === "forwarding" || p.state === "learning") topologyChangeDetection(c);
  p.state = "blocking";
  disarm(c, `${p.name}:fwd`);
}

function portStateSelection(c: Ctx): void {
  const { s } = c;
  for (const p of newestFirst(s)) {
    if (p.state === "disabled") continue;
    if (p.portNo === s.rootPort) {
      p.configPending = false;
      p.topologyChangeAck = false;
      makeForwarding(c, p);
    } else if (isDesignated(s, p)) {
      disarm(c, `${p.name}:age`);
      makeForwarding(c, p);
    } else {
      p.configPending = false;
      p.topologyChangeAck = false;
      makeBlocking(c, p);
    }
  }
}

function becomeRootBridge(c: Ctx): void {
  const { s } = c;
  s.maxAge = s.bridgeMaxAge;
  s.helloTime = s.bridgeHelloTime;
  s.forwardDelay = s.bridgeForwardDelay;
  topologyChangeDetection(c);
  disarm(c, "tcn");
  if (bridgeUp(c)) {
    configBpduGeneration(c);
    arm(c, "hello", s.helloTime);
  }
}

function initPort(c: Ctx, p: StpPort): void {
  p.portId = (p.priority << 10) | p.portNo;
  becomeDesignatedPort(c, p);
  p.state = "blocking";
  p.topologyChangeAck = false;
  p.configPending = false;
}

function enablePort(c: Ctx, p: StpPort): void {
  initPort(c, p);
  portStateSelection(c);
}

function disablePort(c: Ctx, p: StpPort): void {
  const wasRoot = isRoot(c.s);
  becomeDesignatedPort(c, p);
  p.state = "disabled";
  p.topologyChangeAck = false;
  p.configPending = false;
  disarm(c, `${p.name}:age`);
  disarm(c, `${p.name}:fwd`);
  disarm(c, `${p.name}:hold`);
  // The port's learned addresses go (br_fdb_delete_by_port).
  fdbPortDown(c.k, c.device, p.name);
  configurationUpdate(c);
  portStateSelection(c);
  if (isRoot(c.s) && !wasRoot) becomeRootBridge(c);
}

// ── Receiving (br_stp_rcv) ─────────────────────────────────────────────────────────────────

function supersedes(c: Ctx, p: StpPort, b: ConfigBpdu): boolean {
  if (b.root !== p.designatedRoot) return b.root < p.designatedRoot;
  if (b.rootPathCost !== p.designatedCost) return b.rootPathCost < p.designatedCost;
  if (b.bridgeId !== p.designatedBridge) return b.bridgeId < p.designatedBridge;
  if (b.bridgeId !== c.s.bridgeId) return true;
  return b.portId <= p.designatedPort;
}

function receivedConfig(c: Ctx, p: StpPort, b: ConfigBpdu): void {
  const { s } = c;
  const wasRoot = isRoot(s);
  if (supersedes(c, p, b)) {
    // br_record_config_information
    p.designatedRoot = b.root;
    p.designatedCost = b.rootPathCost;
    p.designatedBridge = b.bridgeId;
    p.designatedPort = b.portId;
    p.designatedAge = Math.floor(c.k.s.t) - b.messageAge;
    arm(c, `${p.name}:age`, b.maxAge - b.messageAge);
    configurationUpdate(c);
    portStateSelection(c);
    if (!isRoot(s) && wasRoot) {
      disarm(c, "hello");
      if (s.topologyChangeDetected) {
        disarm(c, "tc");
        transmitTcn(c);
        arm(c, "tcn", s.bridgeHelloTime);
      }
    }
    if (p.portNo === s.rootPort) {
      s.maxAge = b.maxAge;
      s.helloTime = b.helloTime;
      s.forwardDelay = b.forwardDelay;
      setTopologyChange(c, b.topologyChange);
      configBpduGeneration(c);
      if (b.topologyChangeAck) {
        s.topologyChangeDetected = false;
        disarm(c, "tcn");
      }
    }
  } else if (isDesignated(s, p)) transmitConfig(c, p);
}

function receivedTcn(c: Ctx, p: StpPort): void {
  if (!isDesignated(c.s, p)) return;
  topologyChangeDetection(c);
  p.topologyChangeAck = true;
  transmitConfig(c, p);
}

/** A BPDU reached a port of a bridge running STP (br_stp_rcv). */
export function stpReceive(k: Kernel, device: DeviceId, br: BridgeState, port: IfaceName, frame: Uint8Array): void {
  const c = ctx(k, device, br);
  const p = stpPort(br, port);
  if (!p || !c.s.enabled || !bridgeUp(c) || p.state === "disabled") return;
  const b = decodeBpdu(frame);
  if (!b) return;
  notifying(c, () => {
    if (b.type === "tcn") receivedTcn(c, p);
    else if (b.messageAge <= b.maxAge) receivedConfig(c, p, b);
  });
}

// ── Timers (br_stp_timer.c) ────────────────────────────────────────────────────────────────

export function stpTimer(k: Kernel, ev: Extract<Scheduled, { kind: "stp" }>): void {
  const br = deviceOf(k, ev.device)?.bridges[ev.bridge];
  const tm = br?.stp.timers[ev.timer];
  if (!br || !tm || tm.stamp !== ev.stamp) return;
  const c = ctx(k, ev.device, br);
  disarm(c, ev.timer);
  const { s } = c;
  notifying(c, () => {
    if (ev.timer === "hello") {
      if (!bridgeUp(c)) return;
      configBpduGeneration(c);
      if (s.enabled) arm(c, "hello", s.helloTime, true);
      return;
    }
    if (ev.timer === "tcn") {
      if (!isRoot(s) && bridgeUp(c)) {
        transmitTcn(c);
        arm(c, "tcn", s.bridgeHelloTime);
      }
      return;
    }
    if (ev.timer === "tc") {
      s.topologyChangeDetected = false;
      setTopologyChange(c, false);
      return;
    }
    const [name, what] = ev.timer.split(":");
    const p = s.ports.find((x) => x.name === name);
    if (!p) return;
    if (what === "age") {
      // The root's information on this port is gone (max age without a refresh).
      if (p.state === "disabled") return;
      const wasRoot = isRoot(s);
      becomeDesignatedPort(c, p);
      configurationUpdate(c);
      portStateSelection(c);
      if (isRoot(s) && !wasRoot) becomeRootBridge(c);
    } else if (what === "fwd") {
      if (p.state === "listening") {
        p.state = "learning";
        arm(c, `${p.name}:fwd`, s.forwardDelay);
      } else if (p.state === "learning") {
        p.state = "forwarding";
        if (s.ports.some((x) => x.state !== "disabled" && x.designatedBridge === s.bridgeId))
          topologyChangeDetection(c);
      }
    } else if (what === "hold") {
      if (p.configPending) transmitConfig(c, p);
    }
  });
}

// ── The bridge and its ports going up and down (br_stp_if.c) ───────────────────────────────

/** The bridge device came up (br_stp_enable_bridge): timers start, ports with carrier are enabled. */
export function stpBridgeUp(k: Kernel, device: DeviceId, br: BridgeState): void {
  const c = ctx(k, device, br);
  notifying(c, () => {
    if (c.s.enabled) arm(c, "hello", c.s.helloTime);
    fdbGcArm(k, device, br, 100);
    configBpduGeneration(c);
    for (const p of newestFirst(c.s)) if (k.oper(device, p.name).up) enablePort(c, p);
  });
}

/** The bridge device went down (br_stp_disable_bridge): every port is disabled. */
export function stpBridgeDown(k: Kernel, device: DeviceId, br: BridgeState): void {
  const c = ctx(k, device, br);
  notifying(c, () => {
    for (const p of newestFirst(c.s)) if (p.state !== "disabled") disablePort(c, p);
    setTopologyChange(c, false);
    c.s.topologyChangeDetected = false;
    disarm(c, "hello");
    disarm(c, "tc");
    disarm(c, "tcn");
    br.gc = null;
  });
}

/** A port's carrier changed (br_port_carrier_check): enable or disable it to match. */
export function stpSyncPorts(k: Kernel, device: DeviceId, br: BridgeState): void {
  const c = ctx(k, device, br);
  if (!bridgeUp(c)) return;
  for (const p of c.s.ports) {
    const up = k.oper(device, p.name).up;
    if (up && p.state === "disabled") notifying(c, () => enablePort(c, p));
    else if (!up && p.state !== "disabled") notifying(c, () => disablePort(c, p));
  }
}

// ── Settings: `ip link set <br> type bridge …`, `bridge link set dev <port> …` ─────────────

/** `stp_state` (br_stp_set_enabled): starting runs a port state selection; stopping only stops. */
export function stpSetEnabled(k: Kernel, device: DeviceId, br: BridgeState, on: boolean): void {
  const c = ctx(k, device, br);
  const { s } = c;
  if (on === s.enabled) return;
  notifying(c, () => {
    if (!on) {
      s.enabled = false;
      return;
    }
    // br_stp_start: forward delay clamped to what STP allows, then kernel STP.
    const [lo, hi] = RANGE.forwardDelay;
    s.bridgeForwardDelay = Math.min(hi, Math.max(lo, s.bridgeForwardDelay));
    if (isRoot(s)) s.forwardDelay = s.bridgeForwardDelay;
    s.enabled = true;
    if (bridgeUp(c)) arm(c, "hello", s.helloTime);
    portStateSelection(c);
  });
  k.emit({ kind: "table.change", t: k.s.t, device, table: "stp", op: "set", key: br.name, before: !on, after: on });
}

/** Bridge priority (br_stp_set_bridge_priority): a new bridge id, then a new election. */
export function stpSetBridgePriority(k: Kernel, device: DeviceId, br: BridgeState, priority: number): void {
  const c = ctx(k, device, br);
  const { s } = c;
  notifying(c, () => {
    const wasRoot = isRoot(s);
    const id = (old: string) => priority.toString(16).padStart(4, "0") + old.slice(4);
    for (const p of s.ports)
      if (p.state !== "disabled" && isDesignated(s, p)) p.designatedBridge = id(p.designatedBridge);
    s.bridgeId = id(s.bridgeId);
    s.priority = priority;
    configurationUpdate(c);
    portStateSelection(c);
    if (isRoot(s) && !wasRoot) becomeRootBridge(c);
  });
}

export type StpTimes = { forwardDelay?: number; helloTime?: number; maxAge?: number };

/** forward_delay / hello_time / max_age (br_set_*): "range" is the kernel's ERANGE. */
export function stpSetTimes(k: Kernel, device: DeviceId, br: BridgeState, t: StpTimes): "ok" | "range" {
  const { s } = ctx(k, device, br);
  const out = (v: number, [lo, hi]: readonly [number, number]) => v < lo || v > hi;
  if (t.forwardDelay !== undefined) {
    if (s.enabled && out(t.forwardDelay, RANGE.forwardDelay)) return "range";
    s.bridgeForwardDelay = t.forwardDelay;
    if (isRoot(s)) s.forwardDelay = t.forwardDelay;
  }
  if (t.helloTime !== undefined) {
    if (out(t.helloTime, RANGE.helloTime)) return "range";
    s.bridgeHelloTime = t.helloTime;
    if (isRoot(s)) s.helloTime = t.helloTime;
  }
  if (t.maxAge !== undefined) {
    if (out(t.maxAge, RANGE.maxAge)) return "range";
    s.bridgeMaxAge = t.maxAge;
    if (isRoot(s)) s.maxAge = t.maxAge;
  }
  return "ok";
}

/** A port's path cost (br_stp_set_path_cost): 1–65535, then a new election. */
export function stpSetPortCost(
  k: Kernel,
  device: DeviceId,
  br: BridgeState,
  port: IfaceName,
  cost: number,
): "ok" | "range" {
  const c = ctx(k, device, br);
  const p = stpPort(br, port);
  if (!p) return "range";
  if (cost < 1 || cost > 65535) return "range";
  notifying(c, () => {
    p.cost = cost;
    configurationUpdate(c);
    portStateSelection(c);
  });
  return "ok";
}

/** A port's priority (br_stp_set_port_priority): 0–63; it changes the port id. */
export function stpSetPortPriority(
  k: Kernel,
  device: DeviceId,
  br: BridgeState,
  port: IfaceName,
  priority: number,
): "ok" | "range" {
  const c = ctx(k, device, br);
  const p = stpPort(br, port);
  if (!p) return "range";
  if (priority < 0 || priority > 63) return "range";
  notifying(c, () => {
    const id = (priority << 10) | p.portNo;
    if (isDesignated(c.s, p)) p.designatedPort = id;
    p.portId = id;
    p.priority = priority;
    if (p.designatedBridge === c.s.bridgeId && p.portId < p.designatedPort) {
      becomeDesignatedPort(c, p);
      portStateSelection(c);
    }
  });
  return "ok";
}
