import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type AmbientLight, Color, Fog, type HemisphereLight, type PointLight } from "three";
import { blend } from "../kit/regionMaterials";
import { ruin, ruinAtPoint } from "../ruin";

// Region 1 light on the ruin dial (region-1 brief, 0021, 0052):
// - Ruin: cold moonlight through the broken walls, deep blue-grey fog, the runes dark. Eerie and
//   haunting, never frightening.
// - Restored: the carved runes glow warm and steady; the moon is still there, softer.
// The moonlight itself is baked into the static room (bake.ts) and added by its materials: no
// directional light and no shadow maps at runtime. Here: a soft sky/ground fill, ambient light,
// fog, and the rune lights (the keeper carries its own lantern light).
// Balanced for the eyes (0051): the two states differ in colour more than in brightness; check with
// the brightness line from tools/shots/b0.mjs.

const AMBIENT_RUINED = new Color("#4A5878");
const AMBIENT_RESTORED = new Color("#8A7058");
const SKY_RUINED = new Color("#7f93c8");
const SKY_RESTORED = new Color("#a08a70");
const GROUND_RUINED = new Color("#30343c");
const GROUND_RESTORED = new Color("#3a3028");
const FOG_RUINED = new Color("#1E2433");
const FOG_RESTORED = new Color("#3a2d22");

type Glow = { position: [number, number, number]; colour: string; strength: number };

export function RoomLights({ glows }: { glows: Glow[] }) {
  const { scene } = useThree();
  const ambient = useRef<AmbientLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const points = useRef<(PointLight | null)[]>([]);
  const fog = useMemo(() => new Fog(FOG_RUINED.clone(), 20, 40), []);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useFrame(() => {
    const r = ruin.value;
    const warm = 1 - r;
    if (ambient.current) {
      blend(ambient.current.color, AMBIENT_RUINED, AMBIENT_RESTORED, r);
      ambient.current.intensity = 1.4 - warm * 0.6;
    }
    if (fill.current) {
      blend(fill.current.color, SKY_RUINED, SKY_RESTORED, r);
      blend(fill.current.groundColor, GROUND_RUINED, GROUND_RESTORED, r);
      fill.current.intensity = 2.4 - warm * 1.5;
    }
    blend(fog.color, FOG_RUINED, FOG_RESTORED, r);
    fog.near = 20 + warm * 8;
    fog.far = 40 + warm * 16;
    glows.forEach((glow, i) => {
      const light = points.current[i];
      if (!light) return;
      // Each rune group relights when the restoration wave reaches it (CORE-39); steady, no flicker.
      const here = ruinAtPoint(...glow.position);
      light.intensity = glow.strength * (0.02 + (1 - here) * 0.98);
    });
  });

  return (
    <>
      <ambientLight ref={ambient} />
      <hemisphereLight ref={fill} />
      {glows.map((glow, i) => (
        <pointLight
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of lights
          key={i}
          ref={(light) => {
            points.current[i] = light;
          }}
          color={glow.colour}
          position={glow.position}
          distance={7}
          decay={2}
        />
      ))}
    </>
  );
}
