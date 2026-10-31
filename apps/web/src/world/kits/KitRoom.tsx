import { useGLTF } from "@react-three/drei";
import { Component, type ReactNode, useEffect, useMemo } from "react";
import { Cache, type Material, Mesh, type Object3D, type Vector3 } from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { useQuality } from "../../render/quality";
import { kitLayoutKey } from "../bake/assemble";
import { applyLightmapUv, findBake, useLightmaps } from "../bake/lightmap";
import { bakeAgeing } from "../kit/bake";
import type { RegionId } from "../region";
import { assembleKit, isSkinned, placementMatrix } from "./assembleKit";
import { CARVED, carvedUrl } from "./carvedKit";
import { KITS, type KitPiece } from "./catalog";
import { kitMaterial } from "./kitMaterials";
import { kitTestPieces } from "./kitTest";
import type { KitPlacement } from "./placement";

// A room's textured kit pieces (RoomLayout.kitPieces): merged into one mesh per material (a room of a
// hundred pieces draws as a dozen meshes), in the kit's own textures, on the region's ruin dial
// (kitMaterials.ts). Skinned pieces (the chests) are drawn whole, on their own. Nothing here moves.
//
// Each kit's textures are separate .webp files that every piece's .glb points at: with THREE.Cache on,
// each file is fetched and decoded once however many pieces use it.
Cache.enabled = true;

type Catalogue = Record<string, { scaleToRuins: number; pieces: Record<string, KitPiece> }>;
const CATALOGUE = KITS as unknown as Catalogue;

function pieceOf(p: KitPlacement): KitPiece | undefined {
  return CATALOGUE[p.kit]?.pieces[p.piece];
}
const urlOf = (p: KitPlacement) => (p.kit === CARVED ? carvedUrl(p) : pieceOf(p)?.url);
const scaleOf = (p: KitPlacement) => CATALOGUE[p.kit]?.scaleToRuins ?? 1;

/** The .glb files a set of placements needs (unknown pieces are skipped, with a warning in dev). */
export function kitPieceUrls(pieces: readonly KitPlacement[]): string[] {
  const urls = new Set<string>();
  for (const p of pieces) {
    const url = urlOf(p);
    if (url) urls.add(url);
    else if (import.meta.env.DEV) console.warn(`[wirelight] no kit piece ${p.kit} ${p.piece}`);
  }
  return [...urls];
}

/** Starts loading a layout's kit pieces (and, through them, their textures) before the room is shown. */
export function preloadKitPieces(pieces: readonly KitPlacement[] | undefined): void {
  for (const url of kitPieceUrls(pieces ?? [])) useGLTF.preload(url);
}

function kitTestOn(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("kittest") === "1";
}

export function KitRoom({
  pieces,
  region,
  toCamera,
}: {
  pieces: KitPlacement[] | undefined;
  region: RegionId;
  toCamera: Vector3; // from the room toward the fixed camera (RoomCamera's VIEW_DIRECTION)
}) {
  const all = useMemo(
    () => (kitTestOn() ? [...(pieces ?? []), ...kitTestPieces(region)] : (pieces ?? [])),
    [pieces, region],
  );
  const urls = useMemo(() => kitPieceUrls(all), [all]);
  if (urls.length === 0) return null;
  return (
    <KitBoundary key={urls.join(",")}>
      <KitPieces pieces={all} urls={urls} region={region} toCamera={toCamera} />
    </KitBoundary>
  );
}

// A piece that fails to load (a file missing mid-conversion, a bad network) leaves the room without its
// kit pieces instead of taking the whole scene down. The room stays playable.
class KitBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error("[wirelight] kit pieces failed to load; the room is drawn without them.", error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

type Drawn = { key: string; geometry: Mesh["geometry"]; material: Material };

function KitPieces({
  pieces,
  urls,
  region,
  toCamera,
}: {
  pieces: KitPlacement[];
  urls: string[];
  region: RegionId;
  toCamera: Vector3;
}) {
  const quality = useQuality();
  const detail = quality.dpr >= 1; // High and Medium: normal and roughness maps
  const gltfs = useGLTF(urls);
  // drei hands back a new array each render; the scenes inside are cached, so key the work on them.
  const scenesKey = gltfs.map((g) => g.scene.uuid).join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the cached scenes (scenesKey), not the array
  const scenes = useMemo(
    () => new Map<string, Object3D>(urls.map((u, i) => [u, gltfs[i]?.scene as Object3D])),
    [scenesKey, urls],
  );

  // Baked light from Blender, when this layout has it (world/bake): suspends until its maps load.
  const bake = useMemo(() => findBake(kitLayoutKey(pieces, region)), [pieces, region]);
  const maps = useLightmaps(bake);

  const merged = useMemo<Drawn[]>(() => {
    const parts = assembleKit(scenes, pieces, urlOf, scaleOf, toCamera);
    // The bake applies only if the drawn geometry is exactly what was baked (else the moon term).
    const lightmaps = applyLightmapUv(
      maps,
      parts.map((p) => p.geometry),
    )
      ? maps
      : null;
    return parts.map((part) => {
      bakeAgeing(part.geometry);
      const material = kitMaterial(part.kit, part.original, {
        region,
        glow: part.glow,
        detail,
        vertexColour: true,
        ageing: true,
        lightmaps,
      });
      return { key: part.key, geometry: part.geometry, material };
    });
  }, [scenes, pieces, toCamera, region, detail, maps]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const tris = merged.reduce((n, m) => n + m.geometry.getAttribute("position").count / 3, 0);
    console.info(`[wirelight] kit room: ${pieces.length} pieces, ${merged.length} merged meshes, ${tris} triangles`);
  }, [merged, pieces]);

  useEffect(() => {
    return () => {
      for (const m of merged) m.geometry.dispose();
    };
  }, [merged]);

  // Skinned pieces (chests), each a clone of its own, in the same materials (no vertex colours, no ageing).
  const skinned = useMemo(() => {
    const out: { key: string; object: Object3D }[] = [];
    pieces.forEach((p, i) => {
      const url = urlOf(p);
      const scene = url ? scenes.get(url) : undefined;
      if (!scene || !isSkinned(scene)) return;
      const copy = cloneSkinned(scene);
      copy.traverse((o) => {
        if (!(o instanceof Mesh) || Array.isArray(o.material)) return;
        o.material = kitMaterial(p.kit, o.material as Material, {
          region,
          glow: !!p.glow,
          detail,
          vertexColour: false,
          ageing: false,
        });
      });
      placementMatrix(p, scaleOf(p)).decompose(copy.position, copy.quaternion, copy.scale);
      out.push({ key: `${p.kit}/${p.piece}#${i}`, object: copy });
    });
    return out;
  }, [scenes, pieces, region, detail]);

  return (
    <>
      {/* A material whose every face turned from the camera has nothing left to draw. */}
      {merged
        .filter((m) => m.geometry.getAttribute("position").count > 0)
        .map((m) => (
          <mesh key={m.key} geometry={m.geometry} material={m.material} />
        ))}
      {skinned.map((s) => (
        <primitive key={s.key} object={s.object} />
      ))}
    </>
  );
}
