import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Group, type Mesh, Shape, ShapeGeometry } from "three";

// A winged silhouette crossing the sky now and then (ONB-01): dark against the moonlit sky, slow
// wingbeats, a long gap between crossings. Our own shape (no icon asset).

const EVERY = 34; // seconds between crossings
const CROSS = 14; // seconds a crossing takes
const FIRST = 6; // the first one comes soon after the page opens

function wing(side: 1 | -1): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(side * 0.45, 0.22, side * 1.0, 0.05);
  s.quadraticCurveTo(side * 0.6, -0.02, side * 0.55, -0.12);
  s.quadraticCurveTo(side * 0.3, -0.06, 0, -0.1);
  return new ShapeGeometry(s, 6);
}

export function Bird() {
  const group = useRef<Group>(null);
  const left = useRef<Mesh>(null);
  const right = useRef<Mesh>(null);
  const shapes = useMemo(() => ({ left: wing(-1), right: wing(1) }), []);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || !left.current || !right.current) return;
    const t = clock.elapsedTime - FIRST;
    const phase = ((t % EVERY) + EVERY) % EVERY;
    g.visible = t >= 0 && phase < CROSS;
    if (!g.visible) return;
    const k = phase / CROSS;
    // Right to left, high over the trees, gently rising and falling.
    g.position.set(34 - k * 76, 26 + Math.sin(k * Math.PI * 2) * 1.5, -46);
    const flap = Math.sin(clock.elapsedTime * 4.2) * 0.5;
    left.current.rotation.y = flap;
    right.current.rotation.y = -flap;
  });

  return (
    <group ref={group} scale={1.6} visible={false}>
      <mesh ref={left} geometry={shapes.left}>
        <meshBasicMaterial color="#07080c" side={DoubleSide} fog={false} />
      </mesh>
      <mesh ref={right} geometry={shapes.right}>
        <meshBasicMaterial color="#07080c" side={DoubleSide} fog={false} />
      </mesh>
    </group>
  );
}
