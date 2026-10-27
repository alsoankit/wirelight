// Ships reworked models to the game (decision 0089): from assets-src/rework/<slug>/ (tools/rework)
// to apps/web/public/assets/models/<slug>.glb, small. The game colours them from the region's
// palette (world/kit/carved.ts), so the model's own colour travels only as a small detail picture;
// the normal and ambient-occlusion maps carry the carving. Geometry meshopt-compressed and quantised;
// pictures WebP at the sizes below.
// Usage: node tools/rework/ship.mjs <slug> [<slug> …]
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "assets-src/rework");
const OUT = join(ROOT, "apps/web/public/assets/models");

/** Picture sizes: the carving (normal) matters most; colour is only a faint detail. */
const SIZES = {
  character: { normal: 1024, ao: 512, colour: 256 },
  statue: { normal: 512, ao: 512, colour: 256 },
  ruin: { normal: 1024, ao: 512, colour: 256 },
  prop: { normal: 512, ao: 256, colour: 256 },
};

async function webp(file, size) {
  return sharp(file).resize(size, size).webp({ quality: 82 }).toBuffer();
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const assets = JSON.parse(readFileSync(join(ROOT, "tools/rework/assets.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

for (const slug of process.argv.slice(2)) {
  const spec = assets.find((a) => a.slug === slug);
  if (!spec) throw new Error(`no ${slug} in assets.json`);
  const dir = join(SRC, slug);
  const doc = await io.read(join(dir, "low.glb"));
  const root = doc.getRoot();
  // Drop what Blender exported for materials; one "carved" material with the three baked maps.
  for (const t of root.listTextures()) t.dispose();
  for (const m of root.listMaterials()) m.dispose();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const sizes = SIZES[spec.role] ?? SIZES.statue;
  const tex = async (name) =>
    doc
      .createTexture(name)
      .setImage(await webp(join(dir, `${name}.png`), sizes[name]))
      .setMimeType("image/webp");
  const material = doc
    .createMaterial("carved")
    .setBaseColorTexture(await tex("colour"))
    .setNormalTexture(await tex("normal"))
    .setOcclusionTexture(await tex("ao"))
    .setRoughnessFactor(0.85)
    .setMetallicFactor(0);
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) p.setMaterial(material);
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  const out = join(OUT, `${slug}.glb`);
  await io.write(out, doc);
  const kb = Math.round((await import("node:fs")).statSync(out).size / 1024);
  console.log(`${slug.padEnd(22)} ${String(kb).padStart(5)} KB`);
}
