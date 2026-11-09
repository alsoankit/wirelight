import { useMemo } from "react";
import { AdditiveBlending, type BufferGeometry, CatmullRomCurve3, PlaneGeometry, TubeGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { color, float, length, smoothstep, uv, vec2 } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { regionMaterial } from "../kit/regionMaterials";
import { addTo, box, rod } from "../kit/shapes";
import type { RegionId } from "../region";
import { type DoorSlot, doorGeometry } from "./layout";

// A sealed doorway (a room the player can't enter, CORE-10): never a plain black arch. Each region
// closes it in its own way (art briefs): thick roots grown across it with a faint glow behind in the
// Overgrown Halls and the Lantern Town; a riveted shutter pulled down in the Works; great doors
// barred with an iron beam in the Cathedral. Built in code, one or two draw calls per doorway.
// Local frame: x across the doorway, y up from the floor, −z out through the wall.

// mulberry32: deterministic, never Math.random.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roots grown across a doorway: a few thick ones from the top, thinner ones wandering between. */
function rootsGeometry(seed: number, width: number, height: number): BufferGeometry | null {
  const random = seeded(seed);
  const parts: BufferGeometry[] = [];
  const half = width / 2;
  for (let i = 0; i < 9; i++) {
    const thick = i < 4;
    const x0 = (random() - 0.5) * width * 0.9;
    const x1 = Math.max(-half, Math.min(half, x0 + (random() - 0.5) * 1.4));
    const top = height * (0.82 + random() * 0.18);
    const bottom = thick ? 0 : height * random() * 0.5;
    const points: Vector3[] = [];
    const steps = 5;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = x0 + (x1 - x0) * t + Math.sin(t * Math.PI * (1.5 + random())) * 0.18;
      const y = top + (bottom - top) * t;
      const z = -0.12 - random() * 0.12 + Math.sin(t * Math.PI) * 0.08;
      points.push(new Vector3(x, y, z));
    }
    const radius = thick ? 0.05 + random() * 0.03 : 0.018 + random() * 0.015;
    const tube = new TubeGeometry(new CatmullRomCurve3(points), 14, radius, 5, false);
    tube.deleteAttribute("uv");
    parts.push(tube.toNonIndexed());
  }
  // A crossing root or two, sagging from one side to the other.
  for (let i = 0; i < 2; i++) {
    const y = height * (0.35 + random() * 0.35);
    const points = [
      new Vector3(-half, y + 0.1, -0.15),
      new Vector3(-half * 0.3, y - 0.18, -0.08),
      new Vector3(half * 0.4, y - 0.12, -0.1),
      new Vector3(half, y + 0.15, -0.16),
    ];
    const tube = new TubeGeometry(new CatmullRomCurve3(points), 16, 0.035, 5, false);
    tube.deleteAttribute("uv");
    parts.push(tube.toNonIndexed());
  }
  return mergeGeometries(parts);
}

/** A riveted shutter pulled down across a hall doorway (the Works). */
function shutterParts(width: number, height: number): Record<string, BufferGeometry[]> {
  const bag: Record<string, BufferGeometry[]> = {};
  addTo(bag, "DarkMetal", box([width, height, 0.05], [0, height / 2, -0.15]));
  for (let y = 0.25; y < height; y += 0.32) addTo(bag, "Copper", box([width - 0.08, 0.05, 0.04], [0, y, -0.11]));
  for (const x of [-width / 2 + 0.08, width / 2 - 0.08])
    for (let y = 0.2; y < height; y += 0.4) addTo(bag, "Brass", box([0.04, 0.04, 0.03], [x, y, -0.1]));
  return bag;
}

/** Great doors shut and barred with an iron beam (the Cathedral). */
function barredParts(width: number, height: number): Record<string, BufferGeometry[]> {
  const bag: Record<string, BufferGeometry[]> = {};
  for (const side of [-1, 1]) {
    addTo(bag, "Iron", box([width / 2 - 0.02, height, 0.08], [(side * width) / 4, height / 2, -0.18]));
    for (const y of [0.4, height - 0.5])
      addTo(bag, "Iron", box([width / 2 - 0.1, 0.07, 0.03], [(side * width) / 4, y, -0.13]));
  }
  addTo(bag, "Iron", box([width + 0.3, 0.14, 0.1], [0, height * 0.48, -0.08]));
  for (const side of [-1, 1])
    addTo(
      bag,
      "Iron",
      rod(
        [side * (width / 2 + 0.05), height * 0.48 - 0.12, -0.05],
        [side * (width / 2 + 0.05), height * 0.48 + 0.12, -0.05],
        0.03,
        6,
      ),
    );
  return bag;
}

function glowMaterial() {
  const m = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  // Soft, faint, brighter toward the bottom middle: light from a room beyond, never a hint colour.
  const d = length(uv().sub(vec2(0.5, 0.35)).mul(vec2(1.4, 1)));
  m.colorNode = color("#A9B89A").mul(
    float(1)
      .sub(smoothstep(0.05, 0.6, d))
      .mul(0.22),
  );
  return m;
}

export function Sealed({ slot, region, size }: { slot: DoorSlot; region: RegionId; size?: [number, number] }) {
  const g = doorGeometry(slot);
  const rotationY = slot.wall === "left" ? Math.PI / 2 : 0;
  const [width, height] = size ?? (slot.plate === "above" ? [1.75, 2.4] : [1.6, 2.5]);
  const seed = Math.round((slot.at + 10) * 97 + (slot.wall === "back" ? 0 : 7));
  const parts = useMemo(() => {
    if (region === 2) return shutterParts(width, height);
    if (region === 4) return barredParts(width, height);
    const roots = rootsGeometry(seed, width, height);
    return roots ? { Bark: [roots] } : {};
  }, [region, seed, width, height]);
  const merged = useMemo(
    () =>
      Object.entries(parts)
        .map(([name, list]) => ({ name, geometry: list.length === 1 ? list[0] : mergeGeometries(list) }))
        .filter((m): m is { name: string; geometry: BufferGeometry } => !!m.geometry),
    [parts],
  );
  const glow = useMemo(() => (region === 1 || region === 3 ? glowMaterial() : null), [region]);
  const plane = useMemo(() => new PlaneGeometry(width * 0.9, height * 0.95), [width, height]);
  return (
    <group position={[g.doorway[0], 0, g.doorway[2]]} rotation={[0, rotationY, 0]}>
      {merged.map((m) => (
        <mesh key={m.name} geometry={m.geometry} material={regionMaterial(m.name, region)} />
      ))}
      {glow && <mesh geometry={plane} material={glow} position={[0, height * 0.47, -0.22]} />}
    </group>
  );
}
