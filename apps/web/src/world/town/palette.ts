import type { RegionLook } from "../region";

// Region 3, the Lantern Town (world/art-briefs/region-3-lantern-town.md): its swatches for the kit and
// the pieces made in code (kit/regionMaterials.ts reads them as REGION_3), and its light on the ruin
// dial (region.ts LOOKS[3]). Kept here with the rest of the town (agent D).
//
// Ruin is a sleeping town, not a blue one: grey plaster, slate roofs beside faded terracotta, dull
// moss-green stone underfoot, lanterns out; the moonlight a cool grey. Restored: cream and peach
// plaster, terracotta and teal roofs, mossy green stone, lanterns and windows warm. Lantern glass
// glows softly (a strong glow read as white boxes with blown-out hot spots on the walls).

type Swatch = {
  ruined: string;
  restored: string;
  roughness?: number;
  metalness?: number;
  glow?: number;
  ember?: number;
  aged?: boolean;
};

export const TOWN_SWATCHES: Record<string, Swatch> = {
  Floor: { ruined: "#55594F", restored: "#6F8F5E", roughness: 0.95, aged: true },
  Cobble: { ruined: "#5f6159", restored: "#8a806c", roughness: 0.95, aged: true },
  Boards: { ruined: "#5e5852", restored: "#8a6646", roughness: 0.85 },
  Main: { ruined: "#7A7670", restored: "#d8c9a8", roughness: 0.95, aged: true },
  Main2: { ruined: "#726e69", restored: "#cdbd9c", roughness: 0.95, aged: true },
  Stone: { ruined: "#77736d", restored: "#d4c4a2", roughness: 0.95, aged: true },
  Highlights: { ruined: "#7d7973", restored: "#d6a98e", roughness: 0.95, aged: true },
  Plaster: { ruined: "#7A7670", restored: "#E9D9B8", roughness: 0.95, aged: true },
  PlasterPeach: { ruined: "#78706a", restored: "#E0AE92", roughness: 0.95, aged: true },
  // Terracotta, faded to a dusky brown in ruin; slate grey that turns teal when restored.
  Roof: { ruined: "#5e4740", restored: "#C46A4B", roughness: 0.85 },
  RoofTeal: { ruined: "#4C4E55", restored: "#3F8A8C", roughness: 0.85 },
  Timber: { ruined: "#3e3833", restored: "#5a3d28", roughness: 0.85 },
  Iron: { ruined: "#24272c", restored: "#2a2826", roughness: 0.55, metalness: 0.75 },
  Lantern: { ruined: "#2e2c28", restored: "#FFC468", glow: 0.85, ember: 0.02 },
  Window: { ruined: "#1f2128", restored: "#E8A85A", glow: 0.6, ember: 0.02 },
};

export const TOWN_LOOK: RegionLook = {
  background: "#0b0c12",
  // Night in ruin is a cool grey, not lilac: the kit's own colours (faded terracotta roofs beside grey
  // plaster, mossy stone) keep showing through it, so the town isn't all one blue.
  ambient: { ruined: "#60656e", restored: "#8a7a70" },
  sky: { ruined: "#8d939e", restored: "#9a96a8" },
  ground: { ruined: "#26272c", restored: "#3a3026" },
  fog: { ruined: "#1B1E2A", restored: "#22304A" },
  moon: { ruined: "#a7aebd", restored: "#9fb0d8", strengthRuined: 1.2, strengthRestored: 0.5 },
  moss: { ruined: "#55594F", restored: "#6F8F5E", amount: 0.9 },
  fireflies: "#E8D890",
  dust: "#c4cce0",
  // Ruin greys the kit's textures less than elsewhere (faded colour, not none), and lit windows and
  // lanterns glow softer than the default (big arched panes read blown out at 1.8).
  kitRuinGrey: 0.5,
  kitGlow: 1.3,
};
