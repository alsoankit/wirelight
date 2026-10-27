import { useTexture } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from "three";
import { color, mix, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { paintedMaterial, WallArt } from "../room/WallArt";
import { ruinHere } from "../ruin";

// The Knight's corner in his base (0052: one or two traces of the Knight; 0091): his portrait painted
// on the left wall, his shield and sword leaning against it below. Shield and sword are made here, in
// the palace's carved look (0089): iron, worn wood, a painted face.

const FACE = -3.965; // the left wall's inner face (x)
const SHIELD_W = 0.72; // metres across the shield's full width
const SHIELD_H = (SHIELD_W * 600) / 512;
const DEPTH = 0.035;
const LEAN = 0.2; // radians back toward the wall

/** A plain material that greys and darkens in ruin, like the room's own. */
function worn(hex: string, { metalness = 0, roughness = 0.8 } = {}) {
  const m = new MeshStandardNodeMaterial({ metalness, roughness });
  const c = color(hex);
  m.colorNode = mix(c, vec3(c.r.add(c.g).add(c.b).div(3)).mul(0.55), ruinHere.mul(0.8));
  return m;
}

/** A heater shield, the same outline as the painted emblems (512 × 600 picture space, in 0–1). */
function shieldGeometry(): ExtrudeGeometry {
  const p = (x: number, y: number): [number, number] => [x / 512, 1 - y / 600];
  const s = new Shape();
  s.moveTo(...p(24, 24));
  s.lineTo(...p(488, 24));
  s.lineTo(...p(488, 250));
  s.bezierCurveTo(...p(488, 420), ...p(380, 520), ...p(256, 580));
  s.bezierCurveTo(...p(132, 520), ...p(24, 420), ...p(24, 250));
  s.closePath();
  // Extruded in picture space so its face's UVs are the picture's; then scaled to metres (x, y only).
  const g = new ExtrudeGeometry(s, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.012 / SHIELD_W,
    bevelSegments: 2,
    curveSegments: 16,
  });
  g.translate(-0.5, -0.5, 0);
  g.scale(SHIELD_W, SHIELD_H, 1);
  return g;
}

function Shield({ along }: { along: number }) {
  const map = useTexture("/art/knight-shield.webp");
  const { geometry, materials } = useMemo(
    () => ({
      geometry: shieldGeometry(),
      // Group 0 is the face (and back), group 1 the rim.
      materials: [paintedMaterial(map, { aspect: 512 / 600, seed: 11 }), worn("#5A4636")],
    }),
    [map],
  );
  // Its foot on the floor, its back against the wall, leaning back a little.
  const h = SHIELD_H * 0.92; // the point sits a little above the bottom of the picture
  return (
    <group position={[FACE, 0, along]} rotation={[0, Math.PI / 2, 0]}>
      <mesh
        geometry={geometry}
        material={materials}
        position={[0, (h / 2) * Math.cos(LEAN), (h / 2) * Math.sin(LEAN) + DEPTH]}
        rotation={[-LEAN, 0, 0]}
        castShadow
        receiveShadow
      />
    </group>
  );
}

function Sword({ along }: { along: number }) {
  const parts = useMemo(() => {
    const iron = worn("#9A9DA3", { metalness: 0.3, roughness: 0.45 });
    const bronze = worn("#9C7A45", { metalness: 0.3, roughness: 0.5 });
    const leather = worn("#4A3628");
    return [
      { g: new BoxGeometry(0.05, 0.82, 0.012), m: iron, y: 0.41 }, // blade
      { g: new BoxGeometry(0.26, 0.035, 0.04), m: bronze, y: 0.84 }, // crossguard
      { g: new CylinderGeometry(0.016, 0.016, 0.16, 10), m: leather, y: 0.94 }, // grip
      { g: new SphereGeometry(0.03, 12, 8), m: bronze, y: 1.04 }, // pommel
    ];
  }, []);
  const lean = 0.16;
  return (
    <group position={[FACE, 0, along]} rotation={[0, Math.PI / 2, 0]}>
      <group position={[0, 0, 0.035 + 1.04 * Math.sin(lean)]} rotation={[-lean, 0, 0.05]}>
        {parts.map((p) => (
          <mesh key={p.y} geometry={p.g} material={p.m} position={[0, p.y, 0]} castShadow />
        ))}
      </group>
    </group>
  );
}

/** Where the corner stands on the left wall (centre of the portrait, metres along z). */
export function KnightCorner({ along = 1.2 }: { along?: number }) {
  return (
    <>
      <WallArt url="/art/knight-portrait.webp" wall="left" along={along} y={2.05} width={0.95} aspect={512 / 768} />
      {/* The shield waits for its painted face on its own, like the wall art. */}
      <Suspense fallback={null}>
        <Shield along={along - 0.1} />
      </Suspense>
      <Sword along={along - 0.55} />
    </>
  );
}
