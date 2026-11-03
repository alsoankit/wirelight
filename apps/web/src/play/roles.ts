import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { DeviceSpec, Topology } from "@wirelight/sim";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";

// Role tags (decision 0113): a machine keeps its palace-room name, and once the player has cleared the
// room that teaches its role, the role joins the name wherever the machine is shown ("crossing ·
// router"). Before that it's only the name: the router rooms are about finding out it's a router.

export type Role = "switch" | "router" | "dhcp";

/** The room whose debrief teaches each role (3.1: MAC table, 7.2: DHCP, 8.1: router). */
export const ROLE_TAUGHT: Record<Role, string> = {
  switch: "f3.many-doors",
  dhcp: "f7.ask-for-an-address",
  router: "f8.other-street",
};

/** What a machine is, from how it's set up: forwarding makes a router, bridges a switch. */
export function roleOf(spec: DeviceSpec | undefined): Role | undefined {
  if (!spec) return undefined;
  if (spec.sysctl && "net.ipv4.ip_forward" in spec.sysctl) return "router";
  if (spec.bridges?.length) return "switch";
  if (spec.dhcpServer) return "dhcp";
  return undefined;
}

/** A machine's name as shown, with its role once that role has been taught. */
export function machineLabel(
  device: string,
  topology: Topology | undefined,
  cleared: Readonly<Record<string, unknown>>,
): string {
  const role = roleOf(topology?.devices.find((d) => d.id === device));
  if (!role || !cleared[ROLE_TAUGHT[role]]) return device;
  return fill(voice.roles.label, { name: device, role: voice.roles[role] });
}

/** The labeller for the room you're in: `label("crossing")` → "crossing · router" once taught. */
export function useMachineLabel(): (device: string) => string {
  const roomId = useSession((s) => s.roomId);
  const cleared = useProgress((s) => s.cleared);
  const topology = roomId ? roomById(roomId)?.topology : undefined;
  return (device) => machineLabel(device, topology, cleared);
}
