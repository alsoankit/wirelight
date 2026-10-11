import { regionMaterial } from "../kit/regionMaterials";

// One of the Knight's traces (0052): an unfinished letter, two loose sheets under a brick near the
// Glass (the brick is part of the room's static layout). A detail to notice, never a focus.

export function KnightLetter({ position }: { position: [number, number, number] }) {
  const paper = regionMaterial("Parchment");
  return (
    <group position={position} rotation={[0, 0.5, 0]}>
      <mesh material={paper}>
        <boxGeometry args={[0.3, 0.006, 0.4]} />
      </mesh>
      <mesh position={[0.12, 0.007, 0.06]} rotation={[0, -0.35, 0.02]} material={paper}>
        <boxGeometry args={[0.28, 0.006, 0.38]} />
      </mesh>
    </group>
  );
}
