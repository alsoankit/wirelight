import { BoxGeometry, CylinderGeometry } from "three";
import { describe, expect, it } from "vitest";
import { geometrySignature, unwrapLightmap } from "../src/world/bake/lightmapUv";

// The game remakes the bake's lightmap UVs at load (world/bake/lightmapUv.ts): they must come out the
// same every time, inside the atlas.
function room() {
  const a = new BoxGeometry(8, 0.2, 8).toNonIndexed().translate(0, -0.1, 0);
  const b = new CylinderGeometry(0.3, 0.3, 3, 12).toNonIndexed().translate(1, 1.5, -1);
  return [a, b];
}

describe("lightmap UVs", () => {
  it("are the same on every run", () => {
    const one = unwrapLightmap(room(), 256);
    const two = unwrapLightmap(room(), 256);
    expect(one.uvs.map((u) => Array.from(u))).toEqual(two.uvs.map((u) => Array.from(u)));
    expect(geometrySignature(room())).toBe(geometrySignature(room()));
  });

  it("stay inside the atlas", () => {
    const size = 256;
    const { uvs, charts } = unwrapLightmap(room(), size);
    expect(charts).toBeGreaterThan(2);
    const owner = new Map<string, number>();
    let triangle = 0;
    for (const uv of uvs) {
      for (let t = 0; t < uv.length / 6; t++, triangle++) {
        const xs = [uv[t * 6], uv[t * 6 + 2], uv[t * 6 + 4]] as [number, number, number];
        const ys = [uv[t * 6 + 1], uv[t * 6 + 3], uv[t * 6 + 5]] as [number, number, number];
        for (const v of [...xs, ...ys]) expect(v >= 0 && v <= 1).toBe(true);
        // Texels in use (centroids), to see that the room spreads over the atlas.
        const cx = Math.floor(((xs[0] + xs[1] + xs[2]) / 3) * size);
        const cy = Math.floor(((ys[0] + ys[1] + ys[2]) / 3) * size);
        owner.set(`${cx},${cy}`, triangle);
      }
    }
    expect(owner.size).toBeGreaterThan(10);
  });

  it("change their signature when the room changes", () => {
    const moved = room();
    moved[1]?.translate(0.01, 0, 0);
    expect(geometrySignature(moved)).not.toBe(geometrySignature(room()));
  });
});
