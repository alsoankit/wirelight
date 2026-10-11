import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type AmbientLight, Color, type DirectionalLight, Fog, type PointLight } from "three";
import { blend } from "../kit/regionMaterials";
import { ruin } from "../ruin";

// Region 1 light on the ruin dial (region-1 brief, 0021):
// - Ruin: a cold moon pouring through the broken walls (it casts the room's only shadows), deep
//   blue-grey fog, and candles burning low. Eerie and haunting, never frightening.
// - Restored: the candles and torch burn warm and steady; the moon is still there, softer.
// Candle flicker is slow and gentle: a drift over seconds, never a fast strobe.

const MOON_RUINED = new Color("#8FA8E0");
const MOON_RESTORED = new Color("#C7C9D8");
const AMBIENT_RUINED = new Color("#4A5878");
const AMBIENT_RESTORED = new Color("#8A7058");
const FOG_RUINED = new Color("#1E2433");
const FOG_RESTORED = new Color("#3a2d22");

type Flame = { position: [number, number, number]; colour: string; strength: number };

export const MOON_POSITION: [number, number, number] = [-9, 13, -8];
export const MOON_TARGET: [number, number, number] = [1.5, 0, 1.5];

// Two slow sines, a few seconds each: the candle drifts rather than flickers.
function drift(t: number, seed: number): number {
  return Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 2.1 + seed * 2.3) * 0.4;
}

export function RoomLights({ flames }: { flames: Flame[] }) {
  const { scene } = useThree();
  const ambient = useRef<AmbientLight>(null);
  const moon = useRef<DirectionalLight>(null);
  const points = useRef<(PointLight | null)[]>([]);
  const fog = useMemo(() => new Fog(FOG_RUINED.clone(), 20, 40), []);

  useEffect(() => {
    scene.fog = fog;
    const m = moon.current;
    if (m) {
      m.target.position.set(...MOON_TARGET);
      scene.add(m.target);
    }
    return () => {
      scene.fog = null;
      if (m) scene.remove(m.target);
    };
  }, [scene, fog]);

  useFrame(({ clock }) => {
    const r = ruin.value;
    const warm = 1 - r;
    const t = clock.elapsedTime;
    if (ambient.current) {
      blend(ambient.current.color, AMBIENT_RUINED, AMBIENT_RESTORED, r);
      ambient.current.intensity = 0.9 + warm * 0.1;
    }
    if (moon.current) {
      blend(moon.current.color, MOON_RUINED, MOON_RESTORED, r);
      moon.current.intensity = 1.4 + r * 3.6;
    }
    blend(fog.color, FOG_RUINED, FOG_RESTORED, r);
    fog.near = 20 + warm * 8;
    fog.far = 40 + warm * 16;
    flames.forEach((flame, i) => {
      const light = points.current[i];
      if (!light) return;
      const wobble = 1 + drift(t, i * 1.7) * (0.02 + r * 0.06);
      light.intensity = flame.strength * (0.3 + warm * 0.7) * wobble;
    });
  });

  return (
    <>
      <ambientLight ref={ambient} />
      <directionalLight
        ref={moon}
        position={MOON_POSITION}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      {flames.map((flame, i) => (
        <pointLight
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of lights
          key={i}
          ref={(light) => {
            points.current[i] = light;
          }}
          color={flame.colour}
          position={flame.position}
          distance={7}
          decay={2}
        />
      ))}
    </>
  );
}
