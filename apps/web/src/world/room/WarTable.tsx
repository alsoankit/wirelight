import { BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, PlaneGeometry, SRGBColorSpace } from "three";
import { regionMaterial } from "../kit/regionMaterials";
import type { RegionId } from "../region";

// The planning table in the player's room: a heavy table with an old plan of the palace laid on it and
// a few markers left where someone stopped working. Decoration only: it never changes, so it reads as
// furniture, not as a broken screen. The live map is the one in the corner of the screen.

/** Each region's wood, for its furniture. */
export const WOOD: Record<RegionId, string> = { 1: "Wood", 2: "Walnut", 3: "Timber", 4: "DarkWood" };
const TOP = new BoxGeometry(1.9, 0.08, 1.25);
const LEG = new BoxGeometry(0.12, 0.76, 0.12);
const FRAME = new BoxGeometry(1.6, 0.06, 0.95);
const PLAN = new PlaneGeometry(1.62, 1.02);
const TOWER = new CylinderGeometry(0.035, 0.05, 0.13, 6);
const POINT = new ConeGeometry(0.045, 0.1, 6);
const LEGS = [
  [-0.8, -0.5],
  [0.8, -0.5],
  [-0.8, 0.5],
  [0.8, 0.5],
] as const;

type Box = readonly [x: number, y: number, width: number, height: number];
const WEST: Box = [60, 60, 96, 70];
const HALL: Box = [230, 44, 110, 82];
const EAST: Box = [392, 88, 78, 62];
const SOUTH: Box = [120, 200, 104, 76];
const YARD: Box = [300, 196, 120, 80];
const LINKS: readonly (readonly [Box, Box])[] = [
  [WEST, HALL],
  [HALL, EAST],
  [WEST, SOUTH],
  [SOUTH, YARD],
  [HALL, YARD],
];

let plan: CanvasTexture | undefined;

/** The plan, drawn once and shared: faded paper, rooms as outlines, cables as thin lines between them. */
function planTexture() {
  if (plan) return plan;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const c = canvas.getContext("2d") as CanvasRenderingContext2D;
  c.fillStyle = "#b9a988";
  c.fillRect(0, 0, 512, 320);
  c.strokeStyle = "#a3936f";
  c.lineWidth = 16;
  c.strokeRect(0, 0, 512, 320);
  c.strokeStyle = "#5b4a35";
  c.lineWidth = 3;
  c.beginPath();
  for (const [from, to] of LINKS) {
    c.moveTo(from[0] + from[2] / 2, from[1] + from[3] / 2);
    c.lineTo(to[0] + to[2] / 2, to[1] + to[3] / 2);
  }
  c.stroke();
  c.lineWidth = 5;
  c.fillStyle = "#c9ba98";
  for (const [x, y, width, height] of [WEST, HALL, EAST, SOUTH, YARD]) {
    c.fillRect(x, y, width, height);
    c.strokeRect(x, y, width, height);
  }
  plan = new CanvasTexture(canvas);
  plan.colorSpace = SRGBColorSpace;
  return plan;
}

export function WarTable({ position, region }: { position: [number, number, number]; region: RegionId }) {
  const wood = regionMaterial(WOOD[region], region);
  const iron = regionMaterial("Iron", region);
  return (
    <group position={position} rotation={[0, -0.25, 0]}>
      <mesh geometry={TOP} material={wood} position={[0, 0.8, 0]} />
      <mesh geometry={FRAME} material={wood} position={[0, 0.34, 0]} />
      {LEGS.map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={LEG} material={wood} position={[x, 0.38, z]} />
      ))}
      <mesh geometry={PLAN} position={[0, 0.843, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial map={planTexture()} roughness={1} />
      </mesh>
      <mesh geometry={TOWER} material={iron} position={[-0.42, 0.91, -0.22]} />
      <mesh geometry={TOWER} material={iron} position={[0.32, 0.91, 0.26]} />
      <mesh geometry={POINT} material={iron} position={[0.02, 0.9, -0.3]} />
    </group>
  );
}
