import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { PointLight } from "three";
import type { RegionId } from "../region";
import { ruin } from "../ruin";
import { Statue } from "./Statue";
import { GUARDIANS, type GuardianPlace } from "./standing";

// The region's Guardian (decision 0094): a statue of its part of the palace, standing in the room.
// Static (one mesh, one draw); it comes alive only through light. Silent decoration since 0108:
// questions live behind the top bar's Ask.

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
  return (
    <Statue {...look} position={place.at} turn={place.turn}>
      {region === 3 && <HeldLantern />}
    </Statue>
  );
}
