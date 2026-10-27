import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import { Box3, type Group, type Object3D } from "three";
import { pieceUrl } from "../world/kit/Piece";
import { restyle } from "../world/kit/regionMaterials";
import { doorsOpen } from "./approach";

// The outer gate's doors (0088): the kit's round-arch pair, hung in the arch and shut. On the way in
// they swing inward on their hinges, opening onto the path to the palace before the camera reaches
// them. They move, so they're lit at runtime (the moon, the sky's fill), not baked with the gate.

const WIDE = Math.PI * 0.56; // a little past square: thrown open, not merely ajar
const DEPTH = -0.12; // inside the wall's thickness
// The kit's doors are made for a smaller arch than this gate's: grown to fill it, edges in the stone.
const FIT: [number, number, number] = [1.18, 1.2, 1.1];

type Leaf = { pivot: number; mesh: Object3D };

export function Doors({ progress }: { progress: RefObject<number> }) {
  const { scene } = useGLTF(pieceUrl("Doors_RoundArch"));
  const leaves = useMemo(() => {
    const copy = restyle(scene.clone());
    // Each leaf turns about its outer edge (left leaf: its left edge; right leaf: its right edge).
    const out: Leaf[] = [];
    for (const child of [...copy.children]) {
      const box = new Box3().setFromObject(child);
      const left = (box.min.x + box.max.x) / 2 < 0;
      const pivot = left ? box.min.x : box.max.x;
      child.position.x -= pivot;
      out.push({ pivot, mesh: child });
    }
    return out.sort((a, b) => a.pivot - b.pivot);
  }, [scene]);

  const hinges = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const angle = doorsOpen(progress.current) * WIDE;
    hinges.current.forEach((h, i) => {
      // Inward is −z: the left leaf turns one way, the right the other.
      if (h) h.rotation.y = i === 0 ? angle : -angle;
    });
  });

  return (
    <group position={[0, 0, DEPTH]} scale={FIT}>
      {leaves.map((leaf, i) => (
        <group
          key={leaf.mesh.uuid}
          position={[leaf.pivot, 0, 0]}
          ref={(g) => {
            hinges.current[i] = g;
          }}
        >
          <primitive object={leaf.mesh} />
        </group>
      ))}
    </group>
  );
}
