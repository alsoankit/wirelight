import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { assembleKit, THIN_MATERIAL } from "../src/world/kits/assembleKit";
import type { KitPlacement } from "../src/world/kits/placement";

// KitRoom's merge (world/kits/assembleKit.ts): one geometry per material (glowing pieces apart), the
// kit's UVs and colours kept, back faces dropped except on thin cards.

function piece(): Group {
  const root = new Group();
  const stone = new MeshStandardMaterial({ color: new Color(0.5, 0.25, 1) });
  stone.name = "MI_Brick";
  const leaves = new MeshStandardMaterial();
  leaves.name = "Leaves";
  root.add(new Mesh(new BoxGeometry(1, 1, 1), stone));
  root.add(new Mesh(new PlaneGeometry(1, 1), leaves));
  return root;
}

const toCamera = new Vector3(1, 0.9, 1).normalize();
const scenes = new Map([["/a.glb", piece()]]);
const urlOf = () => "/a.glb";

describe("assembleKit", () => {
  it("merges by material, glowing pieces apart", () => {
    const pieces: KitPlacement[] = [
      { kit: "k", piece: "A", position: [0, 0, 0] },
      { kit: "k", piece: "A", position: [2, 0, 0] },
      { kit: "k", piece: "A", position: [0, 0, 2], glow: true },
    ];
    const parts = assembleKit(scenes, pieces, urlOf, () => 1, toCamera);
    expect(parts.map((p) => p.key).sort()).toEqual(["Leaves", "Leaves|glow", "MI_Brick", "MI_Brick|glow"]);
    for (const p of parts) {
      expect(p.geometry.index).toBeNull();
      for (const name of ["position", "normal", "uv", "color"]) expect(p.geometry.getAttribute(name)).toBeDefined();
    }
  });

  it("keeps the material colour × the placement's tint in `color`", () => {
    const parts = assembleKit(
      scenes,
      [{ kit: "k", piece: "A", position: [0, 0, 0], tint: "#ffffff" }],
      urlOf,
      () => 1,
      toCamera,
    );
    const brick = parts.find((p) => p.name === "MI_Brick");
    const colour = brick?.geometry.getAttribute("color");
    expect(colour?.getX(0)).toBeCloseTo(0.5);
    expect(colour?.getY(0)).toBeCloseTo(0.25);
    expect(colour?.getZ(0)).toBeCloseTo(1);
  });

  it("drops faces turned from the camera, but not on thin cards", () => {
    const parts = assembleKit(scenes, [{ kit: "k", piece: "A", position: [0, 0, 0] }], urlOf, () => 1, toCamera);
    const brick = parts.find((p) => p.name === "MI_Brick");
    const leaves = parts.find((p) => p.name === "Leaves");
    expect(brick?.geometry.getAttribute("position").count).toBe(3 * 2 * 3); // three of six box faces
    expect(leaves?.geometry.getAttribute("position").count).toBe(6); // the plane, kept whole
    expect(THIN_MATERIAL.test("Leaves")).toBe(true);
  });

  it("applies the kit's scale and the placement's", () => {
    const pieces: KitPlacement[] = [{ kit: "k", piece: "A", position: [0, 0, 0], scale: 2 }];
    const parts = assembleKit(scenes, pieces, urlOf, () => 0.5, toCamera);
    const leaves = parts.find((p) => p.name === "Leaves");
    const xs = Array.from({ length: 6 }, (_, i) => leaves?.geometry.getAttribute("position").getX(i) ?? 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1); // 1 m plane × 0.5 × 2
  });
});
