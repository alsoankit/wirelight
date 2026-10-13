// Where a textured kit piece (from `catalog.ts`) stands in a room. Region layouts list these in
// `RoomLayout.kitPieces`; `KitRoom` merges them by material (keeping UVs and the kit's textures), tints
// them by the region's ruin dial, and draws them as a few static meshes. The Ruins pieces keep using
// `Placement` and `StaticRoom` (restyled in the shader, no textures).

export type KitPlacement = {
  /** A kit from `KITS` in `catalog.ts`, e.g. "region-3/village". */
  kit: string;
  /** The piece's name in that kit, e.g. "Wall_Plaster_Straight". */
  piece: string;
  position: [number, number, number];
  /** Radians about Y (the common case). */
  rotationY?: number;
  /** Full rotation in radians; overrides rotationY. */
  rotation?: [number, number, number];
  /** Multiplies the kit's own scale factor from the catalogue (default 1). */
  scale?: number;
  /** Lit from inside (lamps, windows): kept bright and warm when restored, dark in ruin. */
  glow?: boolean;
  /** Multiplies this piece's colour (both ruined and restored; the ruin still greys it), e.g. "#d8c0a0". */
  tint?: string;
};
