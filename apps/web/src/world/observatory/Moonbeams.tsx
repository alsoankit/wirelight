import { useMemo } from "react";
import { AdditiveBlending, Quaternion, Vector3 } from "three";
import { abs, color, float, length, mix, positionLocal, smoothstep, uv } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";

// Shafts of moonlight where the room is broken open: the eerie, haunting light of a ruin (0021).
// Each shaft is a soft additive box aligned with the moon, fading at its edges and toward the floor.
// Strongest in ruin; restored, the moon is still there but the room's own warmth outshines it.

type Beam = { from: [number, number, number]; width: number; depth: number; colour?: string };

type Props = {
  beams: Beam[];
  direction: [number, number, number];
  /** A soft pool of the same light where each shaft meets the floor (stained light on the stones). */
  pools?: boolean;
  /** The light's colour (cold moonlight by default) and its strength in ruin and restored. */
  colour?: string;
  ruined?: number;
  restored?: number;
};

export function Moonbeams({
  beams,
  direction,
  colour = "#9AB4E8",
  ruined = 0.3,
  restored = 0.07,
  pools = false,
}: Props) {
  const materials = useMemo(() => {
    const make = (tint: string) => {
      const m = new MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      });
      // positionLocal is the unit box before scaling: x and z across the shaft, y along it
      // (+0.5 where the light enters, −0.5 at the floor).
      // (Edges are written as 1 − smoothstep: reversed smoothstep ranges are undefined in GLSL.)
      const edgeX = float(1).sub(smoothstep(0.15, 0.5, abs(positionLocal.x)));
      const edgeZ = float(1).sub(smoothstep(0.15, 0.5, abs(positionLocal.z)));
      const fadeOut = smoothstep(-0.5, 0.2, positionLocal.y);
      const fadeIn = float(1).sub(smoothstep(0.42, 0.5, positionLocal.y));
      const across = edgeX.mul(edgeZ);
      const along = fadeOut.mul(fadeIn);
      const strength = mix(float(restored), float(ruined), ruinHere);
      m.colorNode = color(tint).mul(across.mul(along).mul(strength));
      return m;
    };
    const byColour = new Map<string, MeshBasicNodeMaterial>();
    for (const tint of new Set([colour, ...beams.map((b) => b.colour ?? colour)])) byColour.set(tint, make(tint));
    return byColour;
  }, [beams, colour, ruined, restored]);

  const poolMaterials = useMemo(() => {
    const byColour = new Map<string, MeshBasicNodeMaterial>();
    if (!pools) return byColour;
    for (const tint of new Set([colour, ...beams.map((b) => b.colour ?? colour)])) {
      const m = new MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      });
      const falloff = float(1).sub(smoothstep(0.1, 0.5, length(uv().sub(0.5))));
      m.colorNode = color(tint).mul(falloff.mul(mix(float(restored), float(ruined), ruinHere)).mul(0.6));
      byColour.set(tint, m);
    }
    return byColour;
  }, [beams, colour, ruined, restored, pools]);

  const placed = useMemo(() => {
    const dir = new Vector3(...direction).normalize();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir);
    return beams.map((b) => {
      // Long enough to reach the floor from where it enters.
      const span = b.from[1] / Math.max(0.2, -dir.y);
      const land: [number, number, number] = [b.from[0] + dir.x * span, 0.05, b.from[2] + dir.z * span];
      return { ...b, quaternion, length: span, land };
    });
  }, [beams, direction]);

  return (
    <>
      {placed.map((b) => (
        <group key={b.from.join(",")} position={b.from} quaternion={b.quaternion}>
          {/* a unit box hanging below its origin, scaled to the shaft */}
          <mesh
            position={[0, -b.length / 2, 0]}
            scale={[b.width, b.length, b.depth]}
            material={materials.get(b.colour ?? colour)}
          >
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </group>
      ))}
      {pools &&
        placed.map((b) => (
          <mesh
            key={`pool:${b.from.join(",")}`}
            position={b.land}
            rotation={[-Math.PI / 2, 0, Math.atan2(direction[0], direction[2])]}
            material={poolMaterials.get(b.colour ?? colour)}
          >
            <planeGeometry args={[b.width * 1.8, b.width * 2.6]} />
          </mesh>
        ))}
    </>
  );
}
