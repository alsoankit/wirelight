#!/usr/bin/env node
// Exports every distinct static room layout for baking in Blender (tools/bake/bake.py).
//
// A layout is a room kind (Observatory, a computer's room, a hall) in a region with a number of
// doors; every room the game can show uses one of them. For each, this assembles the static geometry
// exactly as the game does (apps/web/src/world/bake/assemble.ts, shared with kit/StaticRoom.tsx),
// makes its lightmap UVs (bake/lightmapUv.ts, which the game repeats at load), and writes:
//   assets-src/bake/in/<id>.glb   geometry, lightmap UVs (TEXCOORD_0), one primitive per material
//   assets-src/bake/in/<id>.json  materials' colours, the lights (moon, lamps, glowing materials)
//   assets-src/bake/in/layouts.json   the list, with each layout's key, signature and atlas size
//
//   node tools/bake/export.mjs [--out dir] [--only id,id]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = join(repo, "apps/web");
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const out = resolve(flag("--out") ?? join(repo, "assets-src/bake/in"));
const only = (() => {
  const i = process.argv.indexOf("--only");
  return i > 0 ? new Set(process.argv[i + 1].split(",")) : null;
})();

// The game's modules expect a browser here and there (the engine starts a worker on import): stubs.
globalThis.Worker ??= class {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
};
globalThis.window ??= globalThis;
globalThis.self ??= globalThis;

// Vite loads the game's TypeScript modules as they are (same three.js instance for everything).
const { createServer } = await import(join(web, "node_modules/vite/dist/node/index.js"));
const server = await createServer({
  root: web,
  configFile: join(web, "vite.config.ts"),
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  logLevel: "error",
});
const load = (p) => server.ssrLoadModule(p.startsWith("/") || p.startsWith(".") ? join(web, p) : p);

const THREE = await load("three");
const { GLTFLoader } = await load("three/addons/loaders/GLTFLoader.js");
const { MeshoptDecoder } = await load("three/addons/libs/meshopt_decoder.module.js");
const { rooms } = await load("@wirelight/rooms");
const { assembleRoom, kitLayoutKey, layoutKey } = await load("src/world/bake/assemble.ts");
const { assembleKit } = await load("src/world/kits/assembleKit.ts");
const { KITS } = await load("src/world/kits/catalog.ts");
const { CARVED, carvedPiece, carvedUrl } = await load("src/world/kits/carvedKit.ts");
const { standing } = await load("src/world/room/standing.ts");
const kitTest = process.argv.includes("--kittest") ? (await load("src/world/kits/kitTest.ts")).kitTestPieces : null;
const { unwrapLightmap, geometrySignature } = await load("src/world/bake/lightmapUv.ts");
const { atlasSize } = await load("src/world/bake/lightmapUv.ts");
const { swatchColours } = await load("src/world/kit/regionMaterials.ts");
const { pieceUrl } = await load("src/world/kit/Piece.tsx");
const { LOOKS } = await load("src/world/region.ts");
const { TO_MOON } = await load("src/world/moon.ts");
const { RUNE_GLOWS } = await load("src/world/observatory/Runes.tsx");
const { observatoryLayout } = await load("src/world/observatory/layout.ts");
const { houseLayout } = await load("src/world/house/layout.ts");
const { hallLayout } = await load("src/world/hall/layout.ts");
const { planOf, layoutKey: planKey, slotsOf } = await load("src/world/room/plan.ts");
const { corridorDressing } = await load("src/world/corridor/dressing.ts");
const { corridorHalf, endArches } = await load("src/world/corridor/frame.ts");

// Kept in step with the scenes by hand (they are consts inside the components):
// RoomCamera.tsx VIEW_DIRECTION, HouseScene.tsx LAMP, HallScene.tsx glows.
const VIEW_DIRECTION = new THREE.Vector3(1, 0.9, 1).normalize();
const HOUSE_LAMP = [{ position: [-2.4, 1.9, -3.2], colour: "#FFC27A", strength: 3.2 }];
const HALL_LAMP = [{ position: [0, 2.6, -1], colour: "#FFC27A", strength: 2.6 }];

// Which layouts exist: as World.tsx chooses a scene for every room the player can stand in.
function layouts() {
  const found = new Map();
  for (const room of rooms) {
    for (const d of room.topology.devices) {
      const player = d.id === room.playerDevice;
      if (!player && room.access[d.id]?.state !== "enterable") continue;
      // The floor plan's layouts (0118). A mirrored house is the same geometry, so the same bake.
      const plan = planOf(room.topology, room.playerDevice, d.id);
      if (!plan) continue;
      const kind = plan.kind;
      const doors = plan.back.length + plan.left.length;
      const id = planKey(room.region, plan).replace(/-m$/, "");
      const slots = kind === "hall" ? [...slotsOf(plan).values()] : undefined;
      const entry = found.get(id) ?? { id, region: room.region, kind, doors, slots, rooms: [] };
      entry.rooms.push(`${room.id}:${d.id}`);
      found.set(id, entry);
    }
    // Its corridors (0081): one per region, longer in the rooms that have long ones (frame.ts).
    const half = corridorHalf(room.id);
    const id = `r${room.region}-corridor-h${half}`;
    const entry = found.get(id) ?? { id, region: room.region, kind: "corridor", half, rooms: [] };
    for (const l of room.topology.links) entry.rooms.push(`${room.id}:${l.id}`);
    found.set(id, entry);
  }
  return [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function build({ kind, doors, slots, region, half }) {
  if (kind === "corridor") {
    // As CorridorScene draws it: the end arches first, then the region's dressing.
    const d = corridorDressing(region, half);
    const layout = {
      placements: [...endArches(region, half), ...d.placements],
      extras: d.extras,
      kitPieces: d.kitPieces,
      statues: d.statues,
    };
    return { layout, glows: d.glows };
  }
  if (kind === "observatory") {
    const layout = observatoryLayout(doors, region);
    return { layout, glows: [...(layout.glows ?? RUNE_GLOWS), ...(layout.stubGlows ?? [])] };
  }
  if (kind === "house") {
    const layout = houseLayout(region);
    return { layout, glows: [...(layout.glows ?? HOUSE_LAMP), ...(layout.stubGlows ?? [])] };
  }
  const layout = hallLayout(slots ?? doors, region);
  return { layout, glows: [...(layout.glows ?? HALL_LAMP), ...(layout.stubGlows ?? [])] };
}

// Kit pieces, parsed from the files the game serves (textures are never needed: only shapes).
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
await MeshoptDecoder.ready;
const sceneCache = new Map();
function stripTextures(buffer) {
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  if (!json.images && !json.textures) return buffer;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    for (const k of ["normalTexture", "occlusionTexture", "emissiveTexture"]) delete m[k];
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete m.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((e) => !e.includes("texture"));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((e) => !e.includes("texture"));
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jsonChunk = Buffer.from(text);
  const binStart = 20 + buffer.readUInt32LE(12);
  const rest = buffer.subarray(binStart);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + jsonChunk.length + rest.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([header, jsonChunk, rest]);
}
async function scene(url) {
  if (sceneCache.has(url)) return sceneCache.get(url);
  const file = join(web, "public", url);
  const raw = stripTextures(readFileSync(file));
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const gltf = await new Promise((ok, fail) => loader.parse(ab, "", ok, fail));
  sceneCache.set(url, gltf.scene);
  return gltf.scene;
}

// A minimal GLB: one mesh, a primitive per material (POSITION, NORMAL, TEXCOORD_0 = lightmap UV).
function writeGlb(file, parts, uvs, colourOf, casters = []) {
  const chunks = [];
  const accessors = [];
  const views = [];
  let offset = 0;
  const addView = (array, type, count, minmax) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    chunks.push(bytes);
    offset += bytes.length;
    accessors.push({ bufferView: views.length - 1, componentType: 5126, count, type, ...minmax });
    return accessors.length - 1;
  };
  const primitives = [];
  const materials = [];
  parts.forEach((part, i) => {
    const pos = part.geometry.getAttribute("position").array;
    const nor = part.geometry.getAttribute("normal").array;
    const count = pos.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < count; k++)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos[k * 3 + a]);
        max[a] = Math.max(max[a], pos[k * 3 + a]);
      }
    // glTF's V runs down the image; flip so Blender sees the UVs the game uses.
    const uv = new Float32Array(uvs[i].length);
    for (let k = 0; k < uv.length; k += 2) {
      uv[k] = uvs[i][k];
      uv[k + 1] = 1 - uvs[i][k + 1];
    }
    const attributes = {
      POSITION: addView(new Float32Array(pos), "VEC3", count, { min, max }),
      NORMAL: addView(new Float32Array(nor), "VEC3", count),
      TEXCOORD_0: addView(uv, "VEC2", count),
    };
    const c = new THREE.Color(colourOf(part.name));
    materials.push({
      name: part.name,
      pbrMetallicRoughness: { baseColorFactor: [c.r, c.g, c.b, 1], metallicFactor: 0 },
    });
    primitives.push({ attributes, material: materials.length - 1 });
  });
  // Live models, in a mesh of their own: they cast shadows in the bake and take no lightmap.
  const casterPrimitives = casters.map((geometry) => {
    const pos = geometry.getAttribute("position").array;
    const count = pos.length / 3;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < count; k++)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], pos[k * 3 + a]);
        max[a] = Math.max(max[a], pos[k * 3 + a]);
      }
    return {
      attributes: {
        POSITION: addView(new Float32Array(pos), "VEC3", count, { min, max }),
        NORMAL: addView(new Float32Array(geometry.getAttribute("normal").array), "VEC3", count),
      },
    };
  });
  const bin = Buffer.concat(chunks);
  const withCasters = casterPrimitives.length > 0;
  const json = {
    asset: { version: "2.0", generator: "wirelight tools/bake/export.mjs" },
    scene: 0,
    scenes: [{ nodes: withCasters ? [0, 1] : [0] }],
    nodes: [{ name: "room", mesh: 0 }, ...(withCasters ? [{ name: "casters", mesh: 1 }] : [])],
    meshes: [{ name: "room", primitives }, ...(withCasters ? [{ name: "casters", primitives: casterPrimitives }] : [])],
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const jsonChunk = Buffer.from(text);
  const pad = Buffer.alloc((4 - (bin.length % 4)) % 4);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length + pad.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length + pad.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(file, Buffer.concat([header, jh, jsonChunk, bh, bin, pad]));
}

mkdirSync(out, { recursive: true });
const list = [];
for (const entry of layouts()) {
  if (only && !only.has(entry.id)) continue;
  const started = performance.now();
  const { layout, glows } = build(entry);
  const names = [...new Set(layout.placements.map((p) => p.piece))];
  const scenes = new Map();
  for (const n of names) scenes.set(n, await scene(pieceUrl(n)));
  const region = entry.region;
  const { parts } = assembleRoom(scenes, layout.placements, layout.extras ?? [], VIEW_DIRECTION, (n) =>
    Boolean(swatchColours(n, region)),
  );
  // Textured kit pieces (world/kits), drawn by KitRoom with an atlas of their own.
  // --kittest: add the kit test pieces (world/kits/kitTest.ts), to try the kit path before layouts use it.
  const kitPieces = [...(layout.kitPieces ?? []), ...(kitTest ? kitTest(region) : [])];
  const kitUrl = (p) => (p.kit === CARVED ? carvedUrl(p) : KITS[p.kit]?.pieces?.[p.piece]?.url);
  const kitScenes = new Map();
  for (const p of kitPieces) {
    const url = kitUrl(p);
    if (url && !kitScenes.has(url)) kitScenes.set(url, await scene(url));
  }
  // As KitRoom draws them (world/kits/KitRoom.tsx: the catalogue's scale; the placement's own is
  // applied by assembleKit).
  const kitParts = assembleKit(kitScenes, kitPieces, kitUrl, (p) => KITS[p.kit]?.scaleToRuins ?? 1, VIEW_DIRECTION);
  // The live models standing in the room (room/standing.ts): uncut, as they stand.
  const standers = [...standing(entry.kind, region), ...(layout.statues ?? [])].map((s) =>
    carvedPiece(s.slug, s.position, { turn: s.turn, scale: s.scale }),
  );
  for (const p of standers) {
    const url = kitUrl(p);
    if (url && !kitScenes.has(url)) kitScenes.set(url, await scene(url));
  }
  const casters = assembleKit(kitScenes, standers, kitUrl, () => 1, null).map((p) => p.geometry);
  const geometries = parts.map((p) => p.geometry);
  const size = atlasSize(geometries);
  const t0 = performance.now();
  const unwrap = unwrapLightmap(geometries, size);
  const unwrapMs = performance.now() - t0;
  const kitGeometries = kitParts.map((p) => p.geometry);
  const kit = kitParts.length
    ? (() => {
        const kitSize = atlasSize(kitGeometries);
        const u = unwrapLightmap(kitGeometries, kitSize);
        return {
          key: kitLayoutKey(kitPieces, region),
          signature: geometrySignature(kitGeometries),
          size: kitSize,
          density: u.density,
          uvs: u.uvs,
        };
      })()
    : null;
  const look = LOOKS[region];
  const materials = {};
  for (const p of parts) {
    const s = swatchColours(p.name, region);
    const own = p.original?.color ? `#${p.original.color.getHexString()}` : "#808080";
    materials[p.name] = s ?? { ruined: own, restored: own };
  }
  // Kit pieces are textured: what their light bounces off is their average vertex colour (the
  // material's colour × the piece's tint) over a mid stone; glowing pieces are lit lamps.
  for (const p of kitParts) {
    if (p.glow) {
      materials[`kit:${p.key}`] = { ruined: "#3a3530", restored: "#FFC46B", glow: 1.5, ember: 0.05 };
      continue;
    }
    const c = p.geometry.getAttribute("color");
    const sum = [0, 0, 0];
    for (let i = 0; i < (c?.count ?? 0); i++) for (let k = 0; k < 3; k++) sum[k] += c.getComponent(i, k);
    const avg = new THREE.Color(0.45, 0.43, 0.4);
    if (c?.count) avg.setRGB((sum[0] / c.count) * 0.45, (sum[1] / c.count) * 0.43, (sum[2] / c.count) * 0.4);
    const hex = `#${avg.getHexString()}`;
    materials[`kit:${p.key}`] = { ruined: hex, restored: hex };
    if (p.kit === CARVED) {
      materials[`kit:${p.key}`] = { ...look.carved.tint };
      continue;
    }
    // A recoloured material (`kitTones`, 0096) bounces its palette colour, greyed in ruin as the shader does.
    const tone = look.kitTones?.find((t) => t.material === p.key);
    if (tone) {
      const restored = new THREE.Color(tone.colour);
      const lum = 0.2126 * restored.r + 0.7152 * restored.g + 0.0722 * restored.b;
      const ruined = restored
        .clone()
        .lerp(new THREE.Color(lum, lum, lum), look.kitRuinGrey ?? 0.72)
        .multiplyScalar(0.8);
      materials[`kit:${p.key}`] = { ruined: `#${ruined.getHexString()}`, restored: `#${restored.getHexString()}` };
    }
  }
  const meta = {
    id: entry.id,
    region,
    kind: entry.kind,
    doors: entry.doors,
    rooms: entry.rooms,
    key: layoutKey(layout.placements, layout.extras ?? [], region),
    signature: geometrySignature(geometries),
    size,
    density: unwrap.density,
    charts: unwrap.charts,
    kit: kit && { key: kit.key, signature: kit.signature, size: kit.size, density: kit.density },
    triangles: geometries.reduce((a, g) => a + g.getAttribute("position").count / 3, 0),
    materials,
    // The light to bake. Units follow the game: the moon adds tint × colour × strength × cos (as the
    // old vertex bake did); a lamp is a three.js point light (candela, decay 2, cut off at `distance`).
    lights: {
      moon: {
        toward: [TO_MOON.x, TO_MOON.y, TO_MOON.z],
        ruined: { colour: look.moon.ruined, strength: look.moon.strengthRuined },
        restored: { colour: look.moon.restored, strength: look.moon.strengthRestored },
      },
      lamps: glows.map((g) => ({ position: g.position, colour: g.colour, strength: g.strength, distance: 7 })),
      ambient: look.ambient,
      sky: look.sky,
      ground: look.ground,
    },
  };
  writeGlb(
    join(out, `${entry.id}.glb`),
    [...parts, ...kitParts.map((p) => ({ ...p, name: `kit:${p.key}` }))],
    [...unwrap.uvs, ...(kit?.uvs ?? [])],
    (n) => materials[n].ruined,
    casters,
  );
  writeFileSync(join(out, `${entry.id}.json`), `${JSON.stringify(meta, null, 1)}\n`);
  list.push({
    id: meta.id,
    key: meta.key,
    signature: meta.signature,
    size,
    triangles: meta.triangles,
    rooms: entry.rooms.length,
    kit: meta.kit,
  });
  console.log(
    `${entry.id}: ${meta.triangles} tris, ${unwrap.charts} charts, ${size}² at ${unwrap.density} texels/m, unwrap ${Math.round(unwrapMs)} ms, total ${Math.round(performance.now() - started)} ms`,
  );
}
if (!only) writeFileSync(join(out, "layouts.json"), `${JSON.stringify(list, null, 1)}\n`);
await server.close();
