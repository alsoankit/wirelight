import { useMemo } from "react";
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, time, vec3 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

// Low mist over the clearing (ONB-01): a few stacked sheets near the ground whose thickness drifts
// with slow noise, so it moves like air, not like a texture. Thin enough to read the path through.

const LAYERS = [0.12, 0.35, 0.7];

export function Mist() {
  const materials = useMemo(
    () =>
      LAYERS.map((_, i) => {
        const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
        const drift = time.mul(0.05 + i * 0.02);
        const p = positionWorld.mul(vec3(0.16, 0, 0.22)).add(vec3(drift, i * 3.1, drift.mul(0.6)));
        const thick = smoothstep(-0.25, 0.7, mx_noise_float(p));
        // Thicker toward the trees, thin on the path near the camera.
        const away = smoothstep(4, 14, positionWorld.xz.sub(vec3(0, 0, 4).xz).length());
        // Faintly teal where it drifts over the rune-line at the gate.
        const nearGate = float(1).sub(smoothstep(0.5, 3.5, positionWorld.xz.sub(vec3(0, 0, 1.5).xz).length()));
        m.colorNode = mix(color("#4f5f82"), color("#57d5de"), nearGate.mul(0.25));
        m.opacityNode = thick.mul(float(0.16).add(away.mul(0.22))).mul(1 - i * 0.25);
        return m;
      }),
    [],
  );
  return (
    <>
      {LAYERS.map((y, i) => (
        <mesh key={y} position={[0, y, -1]} rotation={[-Math.PI / 2, 0, 0]} material={materials[i]}>
          <planeGeometry args={[46, 34]} />
        </mesh>
      ))}
    </>
  );
}
