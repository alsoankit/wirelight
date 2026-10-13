#!/usr/bin/env node
// Converts the pieces each region uses from the raw art kits (git-ignored, assets-src/_downloads) into
// game-ready glTF binaries, one .glb per piece, and writes the catalogue the game reads
// (apps/web/src/world/kits/catalog.ts). Re-runnable: a kit's output folder is rebuilt from scratch.
//
// Per piece: weld, dedupe, meshopt compression (quantised, as convert-ruins.sh does), materials kept by
// name (never merged: the restyling shader targets them). Textures are shared per kit: each source image
// is written once, as WebP, to <kit>/textures/, resized to at most 1024 px (512 px when only small props
// use it), and every piece's .glb points at it by relative URI. (KTX2 would need `toktx`; not installed.)
//
// Usage (from the repo root):
//   node tools/assets/convert-kit.mjs region-2          convert the pieces in tools/assets/kits/region-2.json
//   node tools/assets/convert-kit.mjs --all             every tools/assets/kits/region-*.json
//   node tools/assets/convert-kit.mjs --catalog         rebuild catalog.ts from the shipped files only
//   node tools/assets/convert-kit.mjs --inspect <src>   list every piece of a source kit (size, triangles,
//                                                        materials), for choosing pieces; <src> is a key of SOURCES
// Converting also rebuilds the catalogue. OBJ sources go through obj2gltf (npx, pinned as in convert-ruins.sh).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Format, NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOWNLOADS = join(ROOT, "assets-src/_downloads");
const KITS_DIR = join(ROOT, "tools/assets/kits");
const PUBLIC = join(ROOT, "apps/web/public");
const CATALOG = join(ROOT, "apps/web/src/world/kits/catalog.ts");
const OBJ2GLTF = ["-y", "obj2gltf@3.2.0"]; // 3.1.6 crashes on Node 24
const MAX_TEXTURE = 1024;
const SMALL_TEXTURE = 512;
const SMALL_PIECE = 1.0; // metres (after the kit's scale factor): a piece this size or less is a small prop
const HEAVY = 3000; // triangles: flagged in the report and the catalogue

// The raw kits. `dirs` are searched in order for <piece>.<format>.
const SOURCES = {
  "quaternius-ultimate-modular-ruins": {
    title: "Ultimate Modular Ruins Pack",
    author: "Quaternius",
    link: "https://quaternius.com/packs/ultimatemodularruins.html",
    licence: "CC0 1.0 (pack's License.txt); Quaternius Asset License v1.0 (decisions 0048, 0072)",
    format: "obj",
    dirs: ["quaternius-ultimate-modular-ruins/Ultimate Modular Ruins Pack - Aug 2021/OBJ"],
  },
  "quaternius-stylized-nature": {
    title: "Stylized Nature MegaKit (Standard)",
    author: "Quaternius",
    link: "https://quaternius.com/packs/stylizednaturemegakit.html",
    licence: "CC0 1.0 (pack's License_Standard.txt); Quaternius Asset License v1.0 (0072)",
    format: "gltf",
    dirs: ["quaternius-stylized-nature/glTF"],
  },
  "quaternius-medieval-village": {
    title: "Medieval Village MegaKit (Standard)",
    author: "Quaternius",
    link: "https://quaternius.com/packs/medievalvillagemegakit.html",
    licence: "CC0 1.0 (pack's licence file); Quaternius Asset License v1.0 (0072)",
    format: "gltf",
    dirs: ["quaternius-medieval-village/Medieval Village MegaKit[Standard]/glTF"],
  },
  "quaternius-fantasy-props": {
    title: "Fantasy Props MegaKit (Standard)",
    author: "Quaternius",
    link: "https://quaternius.com/packs/fantasypropsmegakit.html",
    licence: "CC0 1.0 (pack's License_Standard.txt); Quaternius Asset License v1.0 (0072)",
    format: "gltf",
    dirs: ["quaternius-fantasy-props/Exports/glTF"],
  },
  "quaternius-turret-pack": {
    title: "Turret Pack (March 2020)",
    author: "Quaternius",
    link: "https://quaternius.com/packs/turretpack.html",
    licence: "CC0 1.0 (pack's License.txt); Quaternius Asset License v1.0 (0072)",
    format: "obj",
    dirs: ["quaternius-turret-pack/Turret Pack - March 2020/OBJ"],
  },
  "sigilsvault-modular-cathedral": {
    title: "Modular Cathedral Kit",
    author: "SigilsVault",
    link: "https://sigilsvault.itch.io/modular-cathedral-kit",
    licence: "CC0 1.0 (kit's LICENSE.txt)",
    format: "glb",
    dirs: [
      "sigilsvault-modular-cathedral/Modular Cathedral Kit/Modular Cathedral Pieces/GLB Format",
      "sigilsvault-modular-cathedral/Modular Cathedral Kit/Props/GLB Format",
    ],
  },
};

let io;
async function getIO() {
  if (io) return io;
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  return io;
}

// ---- Measuring ----------------------------------------------------------------------------------------

function primitiveTriangles(prim) {
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0;
  const mode = prim.getMode();
  if (mode === 4) return Math.floor(count / 3); // TRIANGLES
  if (mode === 5 || mode === 6) return Math.max(0, count - 2); // STRIP, FAN
  return 0;
}

/** Triangles, material names and bounds of a document's default scene (node transforms applied). */
function measure(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  let tris = 0;
  const materials = new Set();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrix = meshMatrix(node);
    const p = [0, 0, 0];
    for (const prim of mesh.listPrimitives()) {
      tris += primitiveTriangles(prim);
      const name = prim.getMaterial()?.getName();
      if (name) materials.add(name);
      const position = prim.getAttribute("POSITION");
      for (let i = 0; i < (position?.getCount() ?? 0); i++) {
        const w = transformPoint(matrix, position.getElement(i, p));
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
    }
  });
  const r = (v) => Math.round(v * 1000) / 1000;
  const animations = doc
    .getRoot()
    .listAnimations()
    .map((a) => a.getName());
  return { tris, materials: [...materials].sort(), min: min.map(r), max: max.map(r), animations };
}

/**
 * Where a mesh's vertices land at rest. A skinned mesh ignores its node: its vertices go through the
 * joints (and quantisation folds its scale into the inverse bind matrices), so at the bind pose the
 * transform is joint₀'s world matrix × its inverse bind matrix.
 */
function meshMatrix(node) {
  const skin = node.getSkin();
  if (!skin) return node.getWorldMatrix();
  const ibm = skin.getInverseBindMatrices()?.getElement(0, new Array(16).fill(0));
  const joint = skin.listJoints()[0];
  return ibm && joint ? multiply(joint.getWorldMatrix(), ibm) : node.getWorldMatrix();
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function transformPoint(m, [x, y, z]) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

const MAP_SLOTS = {
  baseColorTexture: "baseColor",
  normalTexture: "normal",
  metallicRoughnessTexture: "metallicRoughness",
  occlusionTexture: "occlusion",
  emissiveTexture: "emissive",
};

/** For each material: which texture (by URI) fills which slot. */
function materialMaps(doc) {
  const out = {};
  for (const mat of doc.getRoot().listMaterials()) {
    const maps = {};
    for (const [getter, slot] of Object.entries(MAP_SLOTS)) {
      const tex = mat[`get${getter[0].toUpperCase()}${getter.slice(1)}`]();
      if (tex) maps[slot] = tex.getURI();
    }
    out[mat.getName()] = maps;
  }
  return out;
}

// ---- Reading sources ----------------------------------------------------------------------------------

function findSource(src, piece) {
  const ext = src.format === "gltf" ? ".gltf" : `.${src.format}`;
  for (const dir of src.dirs) {
    const p = join(DOWNLOADS, dir, piece + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

async function readSource(src, file, tmp) {
  const nodeIO = await getIO();
  if (src.format !== "obj") return nodeIO.read(file);
  const out = join(tmp, `${basename(file, ".obj")}.glb`);
  execFileSync("npx", [...OBJ2GLTF, "-i", file, "-o", out], { stdio: ["ignore", "ignore", "inherit"] });
  return nodeIO.read(out);
}

function listSourcePieces(src) {
  const ext = src.format === "gltf" ? ".gltf" : `.${src.format}`;
  const names = [];
  for (const dir of src.dirs) {
    const abs = join(DOWNLOADS, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) if (f.endsWith(ext)) names.push(f.slice(0, -ext.length));
  }
  return names.sort();
}

// ---- Writing ------------------------------------------------------------------------------------------

/** A .glb whose images stay outside it (shared per kit), built from the glTF JSON gltf-transform writes. */
async function writeGlbWithExternalImages(doc, file) {
  const { json, resources } = await (await getIO()).writeJSON(doc, { format: Format.GLTF, basename: "piece" });
  const isFallback = (b) => b.extensions?.EXT_meshopt_compression?.fallback === true;
  const mains = (json.buffers ?? []).map((b, i) => (isFallback(b) ? -1 : i)).filter((i) => i >= 0);
  if (mains.length > 1 || (mains.length === 1 && mains[0] !== 0)) {
    throw new Error(`${file}: expected one data buffer at index 0, got ${JSON.stringify(mains)}`);
  }
  let bin = new Uint8Array(0);
  for (const b of json.buffers ?? []) {
    if (!isFallback(b) && b.uri) bin = resources[b.uri];
    delete b.uri;
  }
  const pad = (n) => (4 - (n % 4)) % 4;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(pad(jsonBytes.length), 0x20)]);
  const binChunk = Buffer.concat([Buffer.from(bin), Buffer.alloc(pad(bin.byteLength), 0)]);
  const chunks = [chunkHeader(jsonChunk.length, 0x4e4f534a), jsonChunk];
  if (binChunk.length) chunks.push(chunkHeader(binChunk.length, 0x004e4942), binChunk);
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  writeFileSync(file, Buffer.concat([header, body]));
}

function chunkHeader(length, type) {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(length, 0);
  h.writeUInt32LE(type, 4);
  return h;
}

function cleanName(s) {
  return (
    s
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "texture"
  );
}

async function encodeTexture(entry) {
  const quality = entry.slots.has("normal") ? 90 : 82;
  return sharp(Buffer.from(entry.data))
    .resize({ width: entry.size, height: entry.size, fit: "inside", withoutEnlargement: true })
    .webp({ quality, alphaQuality: 90, effort: 5 })
    .toBuffer();
}

// ---- Converting a region ------------------------------------------------------------------------------

function readRegion(id) {
  const file = join(KITS_DIR, `${id}.json`);
  if (!existsSync(file)) throw new Error(`No ${relative(ROOT, file)}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function pieceUse(entry) {
  return typeof entry === "string" ? { use: entry } : entry;
}

async function convertRegion(id) {
  const region = readRegion(id);
  const tmp = mkdtempSync(join(tmpdir(), "wirelight-kit-"));
  const report = [];
  try {
    for (const kit of region.kits) {
      const src = SOURCES[kit.source];
      if (!src) throw new Error(`${id}/${kit.id}: unknown source ${kit.source}`);
      const outDir = join(PUBLIC, "assets", `region-${region.region}`, kit.id);
      if (kit.id === "ruins") throw new Error("region-1/ruins belongs to convert-ruins.sh");
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(join(outDir, "textures"), { recursive: true });
      const textures = new Map(); // source image hash -> { name, data, size, slots }
      const names = new Map(); // texture name -> hash (to keep names unique)
      const scale = kit.scaleToRuins ?? 1;

      for (const [piece, raw] of Object.entries(kit.pieces)) {
        const opts = pieceUse(raw);
        const file = findSource(src, piece);
        if (!file) throw new Error(`${id}/${kit.id}: no source for ${piece}`);
        const doc = await readSource(src, file, tmp);
        doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
        const before = measure(doc);
        const extent = Math.max(...before.max.map((v, i) => v - before.min[i])) * scale;
        const small = opts.small ?? extent <= SMALL_PIECE;

        // Keep every material, never merge them (no `dedup` of materials, no `optimize`).
        await doc.transform(
          dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
          prune({ keepAttributes: true, keepExtras: true }),
          unpartition(),
          weld(),
        );

        // Shared textures: one WebP per source image per kit, referenced by URI.
        const webp = doc.createExtension(EXTTextureWebP).setRequired(true);
        let usesTextures = false;
        for (const tex of doc.getRoot().listTextures()) {
          // A kit can swap an embedded image for a better file from the pack (e.g. its 1024 px trim sheet).
          const replace = kit.textureReplace?.[cleanName(tex.getName() || basename(tex.getURI() || ""))];
          const data = replace ? readFileSync(join(DOWNLOADS, replace.file)) : tex.getImage();
          if (!data) continue;
          usesTextures = true;
          const hash = createHash("sha1").update(data).digest("hex");
          let entry = textures.get(hash);
          if (!entry) {
            let name = replace?.name ?? cleanName(tex.getName() || basename(tex.getURI() || "texture"));
            if (names.has(name) && names.get(name) !== hash) name = `${name}_${hash.slice(0, 6)}`;
            names.set(name, hash);
            entry = { name, data, size: 0, slots: new Set(), pieces: new Set() };
            textures.set(hash, entry);
          }
          entry.size = Math.max(entry.size, small ? SMALL_TEXTURE : MAX_TEXTURE);
          entry.pieces.add(piece);
          for (const edge of doc.getGraph().listParentEdges(tex)) {
            const slot = MAP_SLOTS[edge.getName()];
            if (slot) entry.slots.add(slot);
          }
          tex.setURI(`textures/${entry.name}.webp`).setMimeType("image/webp");
        }
        if (!usesTextures) webp.dispose();

        await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
        const out = join(outDir, `${piece}.glb`);
        await writeGlbWithExternalImages(doc, out);
        report.push({ kit: kit.id, piece, tris: before.tris, bytes: statSync(out).size, small });
        console.log(`  ${kit.id}/${piece}  ${before.tris} tris  ${(statSync(out).size / 1024).toFixed(1)} KB`);
      }

      for (const entry of textures.values()) {
        const buf = await encodeTexture(entry);
        writeFileSync(join(outDir, "textures", `${entry.name}.webp`), buf);
        const { width, height } = await sharp(buf).metadata();
        console.log(
          `  ${kit.id}/textures/${entry.name}.webp  ${width}×${height}  ${(buf.length / 1024).toFixed(1)} KB`,
        );
      }
      if (textures.size === 0) rmSync(join(outDir, "textures"), { recursive: true, force: true });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return report;
}

// ---- Catalogue ----------------------------------------------------------------------------------------

function dirBytes(dir) {
  let total = 0;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    total += f.isDirectory() ? dirBytes(p) : statSync(p).size;
  }
  return total;
}

async function buildCatalog() {
  const nodeIO = await getIO();
  const regionFiles = readdirSync(KITS_DIR)
    .filter((f) => /^region-\d+\.json$/.test(f))
    .sort();
  const kits = [];
  const heavy = [];
  for (const f of regionFiles) {
    const region = readRegion(basename(f, ".json"));
    for (const kit of region.kits) {
      const src = SOURCES[kit.source];
      const folder = `assets/region-${region.region}/${kit.id}`;
      const dir = join(PUBLIC, folder);
      if (!existsSync(dir)) {
        console.warn(`  skipped ${folder}: not converted yet`);
        continue;
      }
      const pieces = {};
      const materials = {};
      for (const [piece, raw] of Object.entries(kit.pieces)) {
        const file = join(dir, `${piece}.glb`);
        if (!existsSync(file))
          throw new Error(`${folder}/${piece}.glb missing: run the converter for region-${region.region}`);
        const doc = await nodeIO.read(file);
        const m = measure(doc);
        for (const [name, maps] of Object.entries(materialMaps(doc))) {
          const full = Object.fromEntries(Object.entries(maps).map(([slot, uri]) => [slot, `/${folder}/${uri}`]));
          materials[name] = { ...materials[name], ...full };
        }
        if (m.tris > HEAVY) heavy.push({ kit: `region-${region.region}/${kit.id}`, piece, tris: m.tris });
        pieces[piece] = {
          url: `/${folder}/${piece}.glb`,
          min: m.min,
          max: m.max,
          tris: m.tris,
          materials: m.materials,
          bytes: statSync(file).size,
          use: pieceUse(raw).use,
          ...(m.animations.length ? { animations: m.animations } : {}),
        };
      }
      kits.push({
        id: `region-${region.region}/${kit.id}`,
        region: region.region,
        title: src.title,
        author: src.author,
        link: src.link,
        licence: src.licence,
        folder: `/${folder}`,
        scaleToRuins: kit.scaleToRuins ?? 1,
        grid: kit.grid,
        bytes: dirBytes(dir),
        materials,
        pieces,
      });
    }
  }

  const ruinsDir = join(PUBLIC, "assets/region-1/ruins");
  const ruinsRef = {};
  for (const piece of ["Wall", "Wall_ArchRound", "Floor_Standard", "Column_Round", "Arch_Gothic"]) {
    const file = join(ruinsDir, `${piece}.glb`);
    if (existsSync(file)) {
      const m = measure(await nodeIO.read(file));
      ruinsRef[piece] = { min: m.min, max: m.max, tris: m.tris };
    }
  }

  const header = `// biome-ignore-all lint/suspicious/noApproximativeNumericConstant: measured sizes (0.693 m is not ln 2)
// Generated by tools/assets/convert-kit.mjs --catalog from the shipped files in apps/web/public/assets
// and the selections in tools/assets/kits/region-*.json. Do not edit by hand: change the selection, re-run.
//
// Every piece is one .glb (meshopt-compressed: load with a Meshopt decoder, as drei's useGLTF does), its
// materials kept by name. Textures are shared per kit in <folder>/textures/*.webp (EXT_texture_webp) and
// referenced by each .glb, so load a kit's textures once (THREE.Cache, or per material from \`materials\`).
// Bounds are in the kit's own units (metres) with node transforms applied; multiply by \`scaleToRuins\` to
// match Region 1's Ultimate Modular Ruins grid (RUINS_REFERENCE). Pieces over ${HEAVY} triangles are in HEAVY_PIECES.

export type Vec3 = readonly [number, number, number];

export type KitPiece = {
  readonly url: string;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly tris: number;
  readonly materials: readonly string[];
  readonly bytes: number;
  readonly use: string;
  /** Skinned and animated (e.g. a chest lid): load on its own, don't fuse into the static room. */
  readonly animations?: readonly string[];
};

export type MaterialMaps = Partial<
  Record<"baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive", string>
>;

export type Kit = {
  readonly id: string;
  readonly region: number;
  readonly title: string;
  readonly author: string;
  readonly link: string;
  readonly licence: string;
  readonly folder: string;
  readonly scaleToRuins: number;
  readonly grid: string;
  readonly bytes: number;
  readonly materials: Readonly<Record<string, MaterialMaps>>;
  readonly pieces: Readonly<Record<string, KitPiece>>;
};
`;
  const body = `
/** Region 1's Ultimate Modular Ruins (apps/web/public/assets/region-1/ruins), measured: the grid every kit is scaled to. */
export const RUINS_REFERENCE = ${JSON.stringify(ruinsRef)} as const;

export const KITS = ${JSON.stringify(Object.fromEntries(kits.map((k) => [k.id, k])))} as const satisfies Record<string, Kit>;

export type KitId = keyof typeof KITS;

/** Pieces over ${HEAVY} triangles: fine as a room's centrepiece, not for repeating. */
export const HEAVY_PIECES: readonly { kit: KitId; piece: string; tris: number }[] = ${JSON.stringify(heavy)};

/** Shipped bytes per region (pieces and textures). */
export const REGION_BYTES: Readonly<Record<number, number>> = ${JSON.stringify(
    kits.reduce((acc, k) => {
      acc[k.region] = (acc[k.region] ?? 0) + k.bytes;
      return acc;
    }, {}),
  )};

export function kitPiece(kit: KitId, piece: string): KitPiece | undefined {
  return (KITS[kit].pieces as Record<string, KitPiece>)[piece];
}
`;
  mkdirSync(dirname(CATALOG), { recursive: true });
  writeFileSync(CATALOG, header + body);
  execFileSync(join(ROOT, "node_modules/.bin/biome"), ["format", "--write", CATALOG], { stdio: "ignore" });
  console.log(`Catalogue: ${relative(ROOT, CATALOG)} (${kits.length} kits)`);
  for (const k of kits) {
    const tris = Object.values(k.pieces).map((p) => p.tris);
    console.log(
      `  ${k.id}: ${tris.length} pieces, ${(k.bytes / 1024 / 1024).toFixed(2)} MB, triangles ${Math.min(...tris)}–${Math.max(...tris)} (sum ${tris.reduce((a, b) => a + b, 0)})`,
    );
  }
  if (heavy.length)
    console.log(`  over ${HEAVY} triangles: ${heavy.map((h) => `${h.kit}/${h.piece} (${h.tris})`).join(", ")}`);
}

// ---- Inspecting a source kit --------------------------------------------------------------------------

async function inspect(key) {
  const src = SOURCES[key];
  if (!src) throw new Error(`Unknown source "${key}"; one of: ${Object.keys(SOURCES).join(", ")}`);
  const tmp = mkdtempSync(join(tmpdir(), "wirelight-kit-"));
  try {
    for (const piece of listSourcePieces(src)) {
      const doc = await readSource(src, findSource(src, piece), tmp);
      const m = measure(doc);
      const size = m.max.map((v, i) => (v - m.min[i]).toFixed(2)).join(" × ");
      const textures = doc
        .getRoot()
        .listTextures()
        .map((t) => t.getName() || basename(t.getURI()));
      console.log(
        `${piece}\t${size}\tmin ${m.min.join(",")}\t${m.tris} tris\t${m.materials.join(",")}\t${textures.join(",")}`,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- Main ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args[0] === "--inspect") {
  await inspect(args[1]);
} else if (args[0] === "--catalog") {
  await buildCatalog();
} else if (args.length) {
  const ids =
    args[0] === "--all"
      ? readdirSync(KITS_DIR)
          .filter((f) => /^region-\d+\.json$/.test(f))
          .map((f) => basename(f, ".json"))
      : args;
  for (const id of ids) {
    console.log(`${id}:`);
    await convertRegion(id);
  }
  await buildCatalog();
} else {
  console.log("Usage: convert-kit.mjs <region-N>... | --all | --catalog | --inspect <source>");
  process.exitCode = 1;
}
