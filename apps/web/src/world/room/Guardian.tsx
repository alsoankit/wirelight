import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PointLight } from "three";
import { useSession } from "../../engine/store";
import type { CarvedOptions } from "../kit/carved";
import type { RegionId } from "../region";
import { ruin } from "../ruin";
import { Statue } from "./Statue";

// The region's Guardian (decision 0094): a statue of its part of the palace, standing in the room.
// Static (one mesh, one draw); it comes alive only through light. Clicking it opens its questions
// (the Ask panel), as the top bar's Ask does.

type GuardianLook = CarvedOptions & { slug: string; scale: number };

export const GUARDIANS: Record<RegionId, GuardianLook> = {
  // The outer gardens: the Gardener, a seated stone woman with roses, moss on her shoulders and lap.
  1: { slug: "frauenfigur", scale: 0.8, tint: { restored: "#BDB6A7", ruined: "#6A6F78" }, moss: 0.85, detail: 0.3 },
  // The works: the clockwork owl, in bronze.
  2: {
    slug: "owl-carved",
    scale: 0.85,
    tint: { restored: "#A98245", ruined: "#5A5550" },
    metalness: 0.35,
    roughness: 0.55,
    detail: 0.4,
  },
  // The town: the Lamplighter, a robed figure in warm stone.
  3: { slug: "lamplighter-mourner", scale: 1.0, tint: { restored: "#C8B89C", ruined: "#6D6F76" }, detail: 0.3 },
  // The cathedral: the stone warden, the winged grave angel, in sandstone.
  4: { slug: "warden-grab", scale: 0.85, tint: { restored: "#D2C2A2", ruined: "#7A7B80" }, detail: 0.3 },
};

/** Where it stands in a room: on the floor (or a cabinet top), and which way it faces (radians). */
export type GuardianPlace = { at: [number, number, number]; turn: number };

/**
 * Facing the camera: the Lamplighter's scan faces +z, the Gardener's, the owl's and the warden's −z.
 */
export const FACING: Record<RegionId, number> = { 1: 3.9, 2: 3.9, 3: 0.7, 4: 3.9 };

/**
 * In a house or a hall: on the open right-hand side (no wall there: the camera's side), between the
 * routes board at the front and the back wall's furniture.
 */
export const SIDE_PLACE = (region: RegionId): GuardianPlace => ({ at: [3.0, 0, -1.0], turn: FACING[region] });

/**
 * The Lamplighter's lantern, held out at his side: a faint ember while his town is in ruin, lit as it
 * is restored (the town's own gold).
 */
function HeldLantern() {
  const light = useRef<PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 0.1 + 0.8 * (1 - ruin.value);
  });
  return (
    <group position={[0.34, 0.78, 0.18]}>
      <Statue
        slug="lantern"
        position={[0, 0, 0]}
        scale={0.8}
        tint={{ restored: "#B08A4A", ruined: "#5E5A54" }}
        metalness={0.4}
        roughness={0.5}
      />
      <pointLight ref={light} position={[0, 0.2, 0]} color="#FFD9A0" intensity={0.9} distance={2.4} decay={2} />
    </group>
  );
}

export function Guardian({ region, place }: { region: RegionId; place: GuardianPlace }) {
  const look = GUARDIANS[region];
  const openPanel = useSession((s) => s.openPanel);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a 3D statue is pointed at (raycast); the top bar's Ask is the keyboard way
    <group
      onClick={(e) => {
        e.stopPropagation();
        openPanel({ kind: "ask" });
      }}
    >
      <Statue {...look} position={place.at} turn={place.turn}>
        {region === 3 && <HeldLantern />}
      </Statue>
    </group>
  );
}
