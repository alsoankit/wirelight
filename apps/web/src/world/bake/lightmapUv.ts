import type { BufferGeometry } from "three";

// Lightmap UVs for a merged static room, made in code the same way here and in the exporter
// (tools/bake/export.mjs), so the game never downloads them: the bake only ships its textures.
//
// The room's triangles are welded by position, grown into charts of connected triangles that face
// roughly the same way, each chart flattened onto its own plane, and the charts packed into one square
// atlas at a single texel density (charts too small to hold a texel are stretched to a minimum size).
// Only exact arithmetic (+ − × ÷ √, rounding) is used, on positions rounded to 0.1 mm, so every
// browser produces the same layout as Node did at bake time.

export type Unwrap = {
  /** One `uv1` array (2 floats per vertex) per input geometry, in [0, 1]. */
  uvs: Float32Array[];
  /** Texels per metre, and how many charts. */
  density: number;
  charts: number;
};

const QUANT = 10000; // 0.1 mm
const COS_LIMIT = 0.74; // about 42°: a chart's triangles all face within this of its first one
const PAD = 2; // texels of gap on each side of a chart (filled by the bake's margin)
const MIN_TEXELS = 2; // a chart is at least this many texels across (inside its padding)

type Chart = { tris: number[]; u: Float64Array; v: Float64Array; minU: number; minV: number; w: number; h: number };

/** A stable hash of what the room draws: the bake applies only to exactly this geometry. */
export function geometrySignature(geometries: BufferGeometry[]): string {
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    h = Math.imul(h ^ (x | 0), 16777619);
  };
  for (const g of geometries) {
    const p = g.getAttribute("position");
    mix(p.count);
    for (let i = 0; i < p.count; i++) {
      mix(Math.round(p.getX(i) * 1000));
      mix(Math.round(p.getY(i) * 1000));
      mix(Math.round(p.getZ(i) * 1000));
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function unwrapLightmap(geometries: BufferGeometry[], size: number): Unwrap {
  // Gather every triangle, with rounded positions.
  const counts = geometries.map((g) => g.getAttribute("position").count);
  const total = counts.reduce((a, b) => a + b, 0);
  const pos = new Float64Array(total * 3);
  let o = 0;
  for (const g of geometries) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      pos[o++] = Math.round(p.getX(i) * QUANT) / QUANT;
      pos[o++] = Math.round(p.getY(i) * QUANT) / QUANT;
      pos[o++] = Math.round(p.getZ(i) * QUANT) / QUANT;
    }
  }
  const triCount = total / 3;

  // Weld corners by position.
  const ids = new Int32Array(total);
  const seen = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const key = `${pos[i * 3]},${pos[i * 3 + 1]},${pos[i * 3 + 2]}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = seen.size;
      seen.set(key, id);
    }
    ids[i] = id;
  }

  // Unit face normals (zero for degenerate triangles).
  const normals = new Float64Array(triCount * 3);
  const live = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = t * 9;
    const e1x = (pos[a + 3] as number) - (pos[a] as number);
    const e1y = (pos[a + 4] as number) - (pos[a + 1] as number);
    const e1z = (pos[a + 5] as number) - (pos[a + 2] as number);
    const e2x = (pos[a + 6] as number) - (pos[a] as number);
    const e2y = (pos[a + 7] as number) - (pos[a + 1] as number);
    const e2z = (pos[a + 8] as number) - (pos[a + 2] as number);
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-9) continue;
    live[t] = 1;
    normals[t * 3] = nx / len;
    normals[t * 3 + 1] = ny / len;
    normals[t * 3 + 2] = nz / len;
  }

  // Triangles sharing an edge.
  const edges = new Map<string, number[]>();
  const edgeKey = (p: number, q: number) => (p < q ? `${p}:${q}` : `${q}:${p}`);
  for (let t = 0; t < triCount; t++) {
    if (!live[t]) continue;
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(ids[t * 3 + k] as number, ids[t * 3 + ((k + 1) % 3)] as number);
      const list = edges.get(key);
      if (list) list.push(t);
      else edges.set(key, [t]);
    }
  }

  // Grow charts, in triangle order.
  const chartOf = new Int32Array(triCount).fill(-1);
  const charts: Chart[] = [];
  for (let seed = 0; seed < triCount; seed++) {
    if (!live[seed] || chartOf[seed] !== -1) continue;
    const cx = normals[seed * 3] as number;
    const cy = normals[seed * 3 + 1] as number;
    const cz = normals[seed * 3 + 2] as number;
    const index = charts.length;
    const tris: number[] = [seed];
    chartOf[seed] = index;
    for (let q = 0; q < tris.length; q++) {
      const t = tris[q] as number;
      for (let k = 0; k < 3; k++) {
        const list = edges.get(edgeKey(ids[t * 3 + k] as number, ids[t * 3 + ((k + 1) % 3)] as number));
        if (!list) continue;
        for (const n of list) {
          if (chartOf[n] !== -1) continue;
          const d =
            (normals[n * 3] as number) * cx + (normals[n * 3 + 1] as number) * cy + (normals[n * 3 + 2] as number) * cz;
          if (d < COS_LIMIT) continue;
          chartOf[n] = index;
          tris.push(n);
        }
      }
    }
    // Flatten onto the plane of the first triangle: u along the world axis least like the normal.
    const ax = Math.abs(cx);
    const ay = Math.abs(cy);
    const az = Math.abs(cz);
    let rx = 0;
    let ry = 0;
    let rz = 0;
    if (ax <= ay && ax <= az) rx = 1;
    else if (ay <= az) ry = 1;
    else rz = 1;
    const dot = rx * cx + ry * cy + rz * cz;
    let ux = rx - cx * dot;
    let uy = ry - cy * dot;
    let uz = rz - cz * dot;
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = cy * uz - cz * uy;
    const vy = cz * ux - cx * uz;
    const vz = cx * uy - cy * ux;
    const u = new Float64Array(tris.length * 3);
    const v = new Float64Array(tris.length * 3);
    let minU = Number.POSITIVE_INFINITY;
    let minV = Number.POSITIVE_INFINITY;
    let maxU = Number.NEGATIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    tris.forEach((t, j) => {
      for (let k = 0; k < 3; k++) {
        const c = (t * 3 + k) * 3;
        const px = pos[c] as number;
        const py = pos[c + 1] as number;
        const pz = pos[c + 2] as number;
        const pu = px * ux + py * uy + pz * uz;
        const pv = px * vx + py * vy + pz * vz;
        u[j * 3 + k] = pu;
        v[j * 3 + k] = pv;
        if (pu < minU) minU = pu;
        if (pu > maxU) maxU = pu;
        if (pv < minV) minV = pv;
        if (pv > maxV) maxV = pv;
      }
    });
    charts.push({ tris, u, v, minU, minV, w: maxU - minU, h: maxV - minV });
  }

  // Pack at the highest density that fits: shelves, tallest charts first.
  const order = charts.map((_, i) => i);
  let area = 0;
  for (const c of charts) area += c.w * c.h;
  let density = Math.floor(Math.sqrt((size * size * 0.55) / Math.max(area, 1e-6)));
  const rects = new Float64Array(charts.length * 4); // x, y, scaleU, scaleV
  const texels = (extent: number) => Math.max(Math.ceil(extent * density), MIN_TEXELS);
  for (; density > 1; density = Math.floor(density * 0.95)) {
    order.sort((a, b) => {
      const ca = charts[a] as Chart;
      const cb = charts[b] as Chart;
      return texels(cb.h) - texels(ca.h) || a - b;
    });
    let x = 0;
    let y = 0;
    let shelf = 0;
    let fits = true;
    for (const i of order) {
      const c = charts[i] as Chart;
      const w = texels(c.w) + PAD * 2;
      const h = texels(c.h) + PAD * 2;
      if (x + w > size) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      if (y + h > size || w > size) {
        fits = false;
        break;
      }
      rects[i * 4] = x + PAD;
      rects[i * 4 + 1] = y + PAD;
      rects[i * 4 + 2] = c.w > 0 ? texels(c.w) / c.w : 0;
      rects[i * 4 + 3] = c.h > 0 ? texels(c.h) / c.h : 0;
      x += w;
      if (h > shelf) shelf = h;
    }
    if (fits) break;
  }

  // Write each corner's lightmap UV back to its own geometry.
  const flat = new Float32Array(total * 2);
  charts.forEach((c, i) => {
    const x = rects[i * 4] as number;
    const y = rects[i * 4 + 1] as number;
    const su = rects[i * 4 + 2] as number;
    const sv = rects[i * 4 + 3] as number;
    c.tris.forEach((t, j) => {
      for (let k = 0; k < 3; k++) {
        const corner = t * 3 + k;
        flat[corner * 2] = (x + ((c.u[j * 3 + k] as number) - c.minU) * su) / size;
        flat[corner * 2 + 1] = (y + ((c.v[j * 3 + k] as number) - c.minV) * sv) / size;
      }
    });
  });
  const uvs: Float32Array[] = [];
  let start = 0;
  for (const count of counts) {
    uvs.push(flat.slice(start * 2, (start + count) * 2));
    start += count;
  }
  return { uvs, density, charts: charts.length };
}

/** The atlas size a room gets (exporter only; the game reads it from the manifest): by surface area. */
export function atlasSize(geometries: BufferGeometry[]): number {
  let area = 0;
  for (const g of geometries) {
    const p = g.getAttribute("position");
    for (let t = 0; t < p.count; t += 3) {
      const ax = p.getX(t + 1) - p.getX(t);
      const ay = p.getY(t + 1) - p.getY(t);
      const az = p.getZ(t + 1) - p.getZ(t);
      const bx = p.getX(t + 2) - p.getX(t);
      const by = p.getY(t + 2) - p.getY(t);
      const bz = p.getZ(t + 2) - p.getZ(t);
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    }
  }
  return area > 90 ? 1024 : 512;
}
