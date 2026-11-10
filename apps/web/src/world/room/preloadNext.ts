import { useGLTF } from "@react-three/drei";
import { roomById } from "@wirelight/rooms";
import { hallLayout } from "../hall/layout";
import { houseLayout } from "../house/layout";
import { pieceUrl } from "../kit/Piece";
import { preloadKitPieces } from "../kits/KitRoom";
import { observatoryLayout } from "../observatory/layout";
import { asRegion } from "../region";
import type { RoomLayout } from "./layout";
import { hallSlots, layoutKey, planOf } from "./plan";

// The next rooms' models, fetched while this one is played (tech/rendering.md, loading): every
// machine the player can walk to from here gets its layout's kit pieces requested, so walking in
// never waits on the network. Which layout a machine gets follows World.tsx's Scene.

const requested = new Set<string>();

/** Requests the models of every room reachable from `here` (enterable machines through its doors). */
export function preloadNeighbours(roomId: string, here: string): void {
  const room = roomById(roomId);
  if (!room) return;
  const region = asRegion(room.region);
  const peers = new Set<string>();
  for (const link of room.topology.links) {
    if (link.a.device === here) peers.add(link.b.device);
    if (link.b.device === here) peers.add(link.a.device);
  }
  for (const peer of peers) {
    if (room.access[peer]?.state !== "enterable" && peer !== room.playerDevice) continue;
    const spec = room.topology.devices.find((d) => d.id === peer);
    const doors = spec?.interfaces.length ?? 1;
    const kind = peer === room.playerDevice ? "observatory" : spec?.bridges?.length || doors > 1 ? "hall" : "house";
    const plan = planOf(room.topology, room.playerDevice, peer);
    const key = plan ? layoutKey(region, plan) : `${kind}:${region}:${doors}`;
    if (requested.has(key)) continue;
    requested.add(key);
    // Each kind of room is asked for once (its pieces are then cached by drei's loader).
    const layout: RoomLayout =
      kind === "observatory"
        ? observatoryLayout(doors, region)
        : kind === "hall"
          ? hallLayout(hallSlots(room.topology, room.playerDevice, peer), region)
          : houseLayout(region);
    for (const piece of new Set(layout.placements.map((p) => p.piece))) useGLTF.preload(pieceUrl(piece));
    preloadKitPieces(layout.kitPieces);
  }
}
