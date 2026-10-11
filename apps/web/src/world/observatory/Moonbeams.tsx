import { useMemo } from "react";
import { AdditiveBlending, Quaternion, Vector3 } from "three";
import { abs, color, float, mix, positionLocal, smoothstep } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";

// Shafts of moonlight where the room is broken open: the eerie, haunting light of a ruin (0021).
// Each shaft is a soft additive box aligned with the moon, fading at its edges and toward the floor.
// Strongest in ruin; restored, the moon is still there but the room's own warmth outshines it.

type Beam = { from: [number, number, number]; width: number; depth: number };

export function Moonbeams({ beams, direction }: { beams: Beam[]; direction: [number, number, number] }) {
  const material = useMemo(() => {
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
    const strength = mix(float(0.07), float(0.3), ruinHere);
    m.colorNode = color("#9AB4E8").mul(across.mul(along).mul(strength));
    return m;
  }, []);

  const placed = useMemo(() => {
    const dir = new Vector3(...direction).normalize();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), dir);
    return beams.map((b) => {
      // Long enough to reach the floor from where it enters.
      const length = b.from[1] / Math.max(0.2, -dir.y);
      return { ...b, quaternion, length };
    });
  }, [beams, direction]);

  return (
    <>
      {placed.map((b) => (
        <group key={b.from.join(",")} position={b.from} quaternion={b.quaternion}>
          {/* a unit box hanging below its origin, scaled to the shaft */}
          <mesh position={[0, -b.length / 2, 0]} scale={[b.width, b.length, b.depth]} material={material}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
