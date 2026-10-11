import type { ToolId } from "@wirelight/shell";
import type { RoomDef } from "./types";

/** Tools each floor hands out when its boss is cleared (SRS §7.4). */
export const FLOOR_TOOLS: Record<number, ToolId[]> = {
  [-1]: [],
  0: ["ip link", "lab send-frame", "lab card", "workbench"],
  1: ["bridge fdb"],
  2: ["ip addr", "ping", "ip neigh", "dhclient"],
  3: ["ip route", "tcpdump", "sysctl"],
};

/**
 * Tools available in a room: everything from floors below, plus what this floor's rooms have
 * introduced up to and including this one, minus the room's restrictions (FR-CON-10).
 * Derived, never stored (FR-PROG-03).
 */
export function toolsIn(room: RoomDef, all: readonly RoomDef[]): Set<ToolId> {
  const out = new Set<ToolId>();
  for (const [floor, tools] of Object.entries(FLOOR_TOOLS))
    if (Number(floor) < room.floor) for (const t of tools) out.add(t);
  for (const r of all)
    if (r.floor === room.floor && r.order <= room.order) for (const t of r.tools.unlock ?? []) out.add(t);
  for (const t of room.tools.restrict ?? []) out.delete(t);
  return out;
}
