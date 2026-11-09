// Check sightlines from every unique room layout's fixed camera to each door, plate, corridor path,
// and keeper. Placed dressing uses measured model or catalogue bounds; structural wall pieces are omitted.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(join(root, "apps/web/package.json"));
const THREE = (await import(require.resolve("three"))).default;
const viteModule = await import(require.resolve("vite"));
const vite = await viteModule.createServer({
  configFile: join(root, "apps/web/vite.config.ts"),
  server: { middlewareMode: true },
  appType: "custom",
});
let rooms,
  planOf,
  slotsOf,
  layoutKey,
  doorGeometry,
  observatoryLayout,
  houseLayout,
  hallLayout,
  KITS,
  standing,
  DRESSING_AT;
try {
  [
    { rooms },
    { planOf, slotsOf, layoutKey },
    { doorGeometry },
    { observatoryLayout },
    { houseLayout },
    { hallLayout },
    { KITS },
    { standing, DRESSING_AT },
  ] = await Promise.all([
    vite.ssrLoadModule(join(root, "packages/rooms/src/index.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/room/plan.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/room/layout.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/observatory/layout.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/house/layout.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/hall/layout.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/kits/catalog.ts")),
    vite.ssrLoadModule(join(root, "apps/web/src/world/room/standing.ts")),
  ]);
} finally {
  await vite.close();
}

const glbBounds = new Map();
async function modelBounds(path) {
  if (glbBounds.has(path)) return glbBounds.get(path);
  let doc;
  try {
    const bytes = await readFile(path);
    let offset = 12;
    while (offset < bytes.length) {
      const length = bytes.readUInt32LE(offset);
      const kind = bytes.readUInt32LE(offset + 4);
      if (kind === 0x4e4f534a) doc = JSON.parse(bytes.toString("utf8", offset + 8, offset + 8 + length));
      offset += length + 8;
    }
  } catch {
    glbBounds.set(path, null);
    return null;
  }
  if (!doc) return null;
  const accessors = doc.accessors ?? [];
  const meshes = doc.meshes ?? [];
  const nodes = doc.nodes ?? [];
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  const include = (min, max, matrix) => {
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          const p = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
          bounds[0] = Math.min(bounds[0], p.x);
          bounds[1] = Math.min(bounds[1], p.y);
          bounds[2] = Math.min(bounds[2], p.z);
          bounds[3] = Math.max(bounds[3], p.x);
          bounds[4] = Math.max(bounds[4], p.y);
          bounds[5] = Math.max(bounds[5], p.z);
        }
  };
  const walk = (index, parent) => {
    const node = nodes[index];
    const local = node.matrix
      ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(
          new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
          new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
        );
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined)
      for (const primitive of meshes[node.mesh]?.primitives ?? []) {
        const accessor = accessors[primitive.attributes?.POSITION];
        if (accessor?.min && accessor?.max) {
          const signed = accessor.componentType === 5120 || accessor.componentType === 5122;
          const divisor =
            accessor.componentType === 5120
              ? 127
              : accessor.componentType === 5122
                ? 32767
                : accessor.componentType === 5121
                  ? 255
                  : accessor.componentType === 5123
                    ? 65535
                    : 1;
          const convert = (value) =>
            accessor.normalized ? (signed ? Math.max(value / divisor, -1) : value / divisor) : value;
          include(accessor.min.map(convert), accessor.max.map(convert), world);
        }
      }
    for (const child of node.children ?? []) walk(child, world);
  };
  const scene = doc.scenes?.[doc.scene ?? 0];
  const identity = new THREE.Matrix4();
  for (const node of scene?.nodes ?? []) walk(node, identity);
  const result = Number.isFinite(bounds[0]) ? bounds : null;
  glbBounds.set(path, result);
  return result;
}

function placedBounds(bounds, position, scale = 1, rotation = [0, 0, 0]) {
  if (!bounds) return null;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(scale, scale, scale),
  );
  const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of [bounds[0], bounds[3]])
    for (const y of [bounds[1], bounds[4]])
      for (const z of [bounds[2], bounds[5]]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        out[0] = Math.min(out[0], p.x);
        out[1] = Math.min(out[1], p.y);
        out[2] = Math.min(out[2], p.z);
        out[3] = Math.max(out[3], p.x);
        out[4] = Math.max(out[4], p.y);
        out[5] = Math.max(out[5], p.z);
      }
  return out;
}

function blocksView(camera, target, box) {
  if (!box) return false;
  const delta = target.map((v, i) => v - camera[i]);
  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const min = box[axis],
      max = box[axis + 3],
      d = delta[axis];
    if (Math.abs(d) < 1e-6) {
      if (camera[axis] < min || camera[axis] > max) return false;
      continue;
    }
    let a = (min - camera[axis]) / d,
      b = (max - camera[axis]) / d;
    if (a > b) [a, b] = [b, a];
    enter = Math.max(enter, a);
    exit = Math.min(exit, b);
    if (enter > exit) return false;
  }
  return exit > 0.015 && enter < 0.97;
}

const structural = /^(Wall|Door|Floor|Roof|Window|Arch|Column|Pillar|Cornice|Beam|Stair|Trim|Flag|Course|Railing)/i;
const observations = new Map();
for (const room of rooms)
  for (const device of room.topology.devices) {
    // The floor plan's layout (0118). A mirrored house is checked unmirrored: the mirror is across the
    // camera's own diagonal, so what blocks the view is the same.
    const plan = planOf(room.topology, room.playerDevice, device.id);
    if (!plan || plan.back.length + plan.left.length === 0) continue;
    const kind = plan.kind;
    const bySlot = slotsOf(plan);
    const layout =
      kind === "observatory"
        ? observatoryLayout(plan.back.length + plan.left.length, room.region)
        : kind === "hall"
          ? hallLayout([...bySlot.values()], room.region)
          : houseLayout(room.region);
    const slots = [...bySlot.values()];
    const key = layoutKey(room.region, plan).replace(/-m$/, "");
    if (!observations.has(key)) observations.set(key, { room, device, kind, layout, slots });
  }

const failures = [];
for (const [key, { room, kind, layout, slots }] of observations) {
  // One view for every room (0116).
  const direction = new THREE.Vector3(1, 0.9, 1).normalize();
  const cameraV = new THREE.Vector3(0, 1.1, -0.6).addScaledVector(direction, 19);
  const camera = cameraV.toArray();
  const targets = [{ name: "keeper", point: layout.keeper }];
  for (let i = 0; i < slots.length; i++) {
    const geometry = doorGeometry(slots[i]);
    targets.push({ name: `door ${i + 1}`, point: geometry.doorway });
    targets.push({ name: `plate ${i + 1}`, point: geometry.plate });
  }
  const blockers = [];
  for (const p of layout.placements ?? []) {
    if (structural.test(p.piece)) continue;
    const box = await modelBounds(join(root, "apps/web/public/assets/region-1/ruins", `${p.piece}.glb`));
    const world = placedBounds(box, p.position, p.scale ?? 1, p.rotation ?? [0, p.rotationY ?? 0, 0]);
    if (world) blockers.push({ name: p.piece, box: world });
  }
  for (const p of layout.kitPieces ?? []) {
    if (structural.test(p.piece)) continue;
    const kit = KITS[p.kit];
    const piece = kit?.pieces[p.piece];
    if (!piece) continue;
    const scale = kit.scaleToRuins * (p.scale ?? 1);
    const box = piece.min.concat(piece.max).map((v) => v * scale);
    blockers.push({
      name: `${p.kit}/${p.piece}`,
      box: placedBounds(box, p.position, 1, p.rotation ?? [0, p.rotationY ?? 0, 0]),
    });
  }
  for (const p of layout.statues ?? []) {
    const box = await modelBounds(join(root, "apps/web/public/assets/models", `${p.slug}.glb`));
    if (!box) failures.push(`${key}: ${p.slug} has no model bounds`);
    else blockers.push({ name: p.slug, box: placedBounds(box, p.position, p.scale ?? 1, [0, p.turn ?? 0, 0]) });
  }
  if (kind === "observatory") {
    for (const p of standing(kind, room.region)) {
      const box = await modelBounds(join(root, "apps/web/public/assets/models", `${p.slug}.glb`));
      if (box) blockers.push({ name: p.slug, box: placedBounds(box, p.position, p.scale, [0, p.turn, 0]) });
    }
    const dressing = DRESSING_AT[room.region];
    if (dressing) {
      const box = await modelBounds(join(root, "apps/web/public/assets/models", `${dressing.slug}.glb`));
      if (box)
        blockers.push({
          name: dressing.slug,
          box: placedBounds(box, dressing.position, dressing.scale ?? 1, [0, dressing.turn ?? 0, 0]),
        });
    }
  }
  for (const target of targets)
    for (const blocker of blockers) {
      if (blocksView(camera, target.point, blocker.box)) {
        const suffix = process.env.DEBUG_SIGHTLINES
          ? ` box=${blocker.box.map((v) => v.toFixed(1))} target=${target.point}`
          : "";
        failures.push(`${key}: ${blocker.name} blocks ${target.name}${suffix}`);
      }
    }
}

console.log(`Checked ${observations.size} unique room layouts across ${rooms.length} rooms.`);
if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("All doors, plates and keepers have clear camera sightlines.");
}
