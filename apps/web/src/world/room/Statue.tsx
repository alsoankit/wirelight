import { useGLTF } from "@react-three/drei";
import { type ReactNode, Suspense, useMemo } from "react";
import type { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { type CarvedOptions, carvedMaterial } from "../kit/carved";

// A reworked model standing in a room (tools/rework → public/assets/models): one mesh, one carved
// material in the region's colour. Static: nothing moves but the light on it, so it costs one draw.

export const modelUrl = (slug: string) => `/assets/models/${slug}.glb`;

/**
 * The model's mesh, its maps and its node's transform, from its GLB (one mesh, one material:
 * tools/rework/ship.mjs). Keep the transform: the compressed positions are quantised, and the node's
 * scale and offset turn them back into metres.
 */
export function useModel(slug: string): { geometry: BufferGeometry; source: MeshStandardMaterial; matrix: Matrix4 } {
  const { scene } = useGLTF(modelUrl(slug));
  return useMemo(() => {
    scene.updateMatrixWorld(true);
    let found: Mesh | undefined;
    scene.traverse((o) => {
      if (!found && (o as Mesh).isMesh) found = o as Mesh;
    });
    if (!found) throw new Error(`${slug}: no mesh`);
    return {
      geometry: found.geometry,
      source: found.material as MeshStandardMaterial,
      matrix: found.matrixWorld.clone(),
    };
  }, [scene, slug]);
}

type Props = CarvedOptions & {
  slug: string;
  position: [number, number, number];
  /** Turn about the vertical (radians); the models face +z. */
  turn?: number;
  scale?: number;
  children?: ReactNode;
};

function Carved({ slug, position, turn = 0, scale = 1, children, ...look }: Props) {
  const { geometry, source, matrix } = useModel(slug);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the look is fixed per placement (a new object each render)
  const material = useMemo(() => carvedMaterial(source, look), [source]);
  return (
    <group position={position} rotation={[0, turn, 0]} scale={scale}>
      <mesh geometry={geometry} material={material} matrix={matrix} matrixAutoUpdate={false} castShadow receiveShadow />
      {children}
    </group>
  );
}

/** Loads on its own (its own Suspense), never holding up the room. */
export function Statue(props: Props) {
  return (
    <Suspense fallback={null}>
      <Carved {...props} />
    </Suspense>
  );
}
