import { useGLTF } from "@react-three/drei";
import type { ThreeElements } from "@react-three/fiber";
import { useMemo } from "react";
import { restyle } from "./regionMaterials";

// One piece of a region's modular kit, loaded once and shared by every placement. Clones share
// geometry; materials are swapped for the region's shared, ruin-driven ones (regionMaterials.ts).
// Region 1 uses Quaternius's Ultimate Modular Ruins (0048).
// The kit's grid: floor tiles are 2 × 2 m; walls are 2 m wide and 2 m tall, their inner face at z = 0
// and their thickness behind it (−z); arch walls and columns are 4 m tall.

const KIT_URL = "/assets/region-1/ruins";

export function pieceUrl(name: string): string {
  return `${KIT_URL}/${name}.glb`;
}

type PieceProps = { name: string } & Omit<ThreeElements["group"], "children">;

export function Piece({ name, ...groupProps }: PieceProps) {
  const { scene } = useGLTF(pieceUrl(name));
  const copy = useMemo(() => restyle(scene.clone()), [scene]);
  return (
    <group {...groupProps}>
      <primitive object={copy} />
    </group>
  );
}
