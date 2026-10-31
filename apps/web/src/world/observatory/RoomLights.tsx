import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { type AmbientLight, Color, Fog, type HemisphereLight, type PointLight } from "three";
import { blend } from "../kit/regionMaterials";
import { LOOKS, type RegionId } from "../region";
import { ruin, ruinAtPoint } from "../ruin";

// A room's light on the ruin dial, in its region's colours (region.ts LOOKS; Region 1 described here:
// region-1 brief, 0021, 0052):
// - Ruin: cold moonlight through the broken walls, deep blue-grey fog, the runes dark. Eerie and
//   haunting, never frightening.
// - Restored: the carved runes glow warm and steady; the moon is still there, softer.
// The moonlight itself is baked into the static room (bake.ts) and added by its materials: no
// directional light and no shadow maps at runtime. Here: a soft sky/ground fill, ambient light,
// fog, and the rune lights (the keeper carries its own lantern light).
// Balanced for the eyes (0051): the two states differ in colour more than in brightness; check with
// the brightness line from tools/shots/b0.mjs.

type Glow = { position: [number, number, number]; colour: string; strength: number };

function pair(p: { ruined: string; restored: string }) {
  return { ruined: new Color(p.ruined), restored: new Color(p.restored) };
}

export function RoomLights({
  glows,
  region = 1,
  baked = false,
}: {
  glows: Glow[];
  region?: RegionId;
  /** The room's bake holds its lamps (0101): no live lamps, only the ambient fill and fog. */
  baked?: boolean;
}) {
  const { scene } = useThree();
  const c = useMemo(() => {
    const look = LOOKS[region];
    return { ambient: pair(look.ambient), sky: pair(look.sky), ground: pair(look.ground), fog: pair(look.fog) };
  }, [region]);
  const ambient = useRef<AmbientLight>(null);
  const fill = useRef<HemisphereLight>(null);
  const points = useRef<(PointLight | null)[]>([]);
  const fog = useMemo(() => new Fog(new Color(), 20, 40), []);

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
      blend(ambient.current.color, c.ambient.ruined, c.ambient.restored, r);
      ambient.current.intensity = 1.4 - warm * 0.6;
    }
    if (fill.current) {
      blend(fill.current.color, c.sky.ruined, c.sky.restored, r);
      blend(fill.current.groundColor, c.ground.ruined, c.ground.restored, r);
      fill.current.intensity = 2.4 - warm * 1.5;
    }
    blend(fog.color, c.fog.ruined, c.fog.restored, r);
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
      {(baked ? [] : glows).map((glow, i) => (
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
