import { useMemo } from "react";
import { BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, SRGBColorSpace } from "three";
import { regionMaterial } from "../kit/regionMaterials";
import type { RegionId } from "../region";

// The planning table in the player's room: a heavy table with an old plan of the palace laid on it and
// a few markers left where someone stopped working. Decoration only: it never changes, so it reads as
// furniture, not as a broken screen. The live map is the one in the corner of the screen.

const WOOD: Record<RegionId, string> = { 1: "Wood", 2: "Walnut", 3: "Timber", 4: "DarkWood" };
const TOP = new BoxGeometry(1.9, 0.08, 1.25);
const LEG = new BoxGeometry(0.12, 0.76, 0.12);
const FRAME = new BoxGeometry(1.6, 0.06, 0.95);
const PLAN = new BoxGeometry(1.62, 0.006, 1.02);
const TOWER = new CylinderGeometry(0.035, 0.05, 0.13, 6);
const POINT = new ConeGeometry(0.045, 0.1, 6);

/** The plan: faded paper, rooms as outlines, cables as thin lines between them. */
function planTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 320;
  const c = canvas.getContext("2d") as CanvasRenderingContext2D;
  c.fillStyle = "#b9a988";
  c.fillRect(0, 0, 512, 320);
  c.strokeStyle = "#a3936f";
  c.lineWidth = 16;
  c.strokeRect(0, 0, 512, 320);
  const rooms = [
    [60, 60, 96, 70],
    [230, 44, 110, 82],
    [392, 88, 78, 62],
    [120, 200, 104, 76],
    [300, 196, 120, 80],
  ] as const;
  c.strokeStyle = "#5b4a35";
  c.lineWidth = 3;
  c.beginPath();
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [1, 4],
  ] as const) {
    const p = rooms[a] as readonly number[];
    const q = rooms[b] as readonly number[];
    c.moveTo((p[0] as number) + (p[2] as number) / 2, (p[1] as number) + (p[3] as number) / 2);
    c.lineTo((q[0] as number) + (q[2] as number) / 2, (q[1] as number) + (q[3] as number) / 2);
  }
  c.stroke();
  c.lineWidth = 5;
  for (const [x, y, w, h] of rooms) {
    c.fillStyle = "#c9ba98";
    c.fillRect(x, y, w, h);
    c.strokeRect(x, y, w, h);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function WarTable({ position, region }: { position: [number, number, number]; region: RegionId }) {
  const wood = regionMaterial(WOOD[region], region);
  const iron = regionMaterial("Iron", region);
  const plan = useMemo(planTexture, []);
  return (
    <group position={position} rotation={[0, -0.25, 0]}>
      <mesh geometry={TOP} material={wood} position={[0, 0.8, 0]} />
      <mesh geometry={FRAME} material={wood} position={[0, 0.34, 0]} />
      {[
        [-0.8, -0.5],
        [0.8, -0.5],
        [-0.8, 0.5],
        [0.8, 0.5],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} geometry={LEG} material={wood} position={[x as number, 0.38, z as number]} />
      ))}
      <mesh geometry={PLAN} position={[0, 0.843, 0]}>
        <meshStandardMaterial attach="material-2" map={plan} roughness={1} />
        <meshStandardMaterial attach="material-0" color="#b9a988" roughness={1} />
        <meshStandardMaterial attach="material-1" color="#b9a988" roughness={1} />
        <meshStandardMaterial attach="material-3" color="#b9a988" roughness={1} />
        <meshStandardMaterial attach="material-4" color="#b9a988" roughness={1} />
        <meshStandardMaterial attach="material-5" color="#b9a988" roughness={1} />
      </mesh>
      <mesh geometry={TOWER} material={iron} position={[-0.42, 0.91, -0.22]} />
      <mesh geometry={TOWER} material={iron} position={[0.32, 0.91, 0.26]} />
      <mesh geometry={POINT} material={iron} position={[0.02, 0.9, -0.3]} />
    </group>
  );
}
