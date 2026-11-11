// Registers the effects and ambience beds built by tools/audio/make-sfx.sh in the audio manifest
// (0047). Only these slots are written; music and voice slots already in the manifest are kept.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const file = join(root, "apps/web/public/audio/manifest.json");

const made = "Made for Wirelight (synthesised)";
const kenney = (pack) => `Kenney, ${pack} (CC0)`;
const madeWith = (packs) => `${made}, with ${packs.join(" and ")} by Kenney (CC0)`;

/** slot → [file under public/audio, volume, credit, loop?] */
const slots = {
  // Wired in AudioDriver.tsx.
  "sfx.broadcast": ["sfx/broadcast-chime.ogg", 0.45, made],
  "sfx.keeper.decide": ["sfx/keeper-decide.ogg", 0.45, kenney("Interface Sounds")],
  "sfx.cable.plug": ["sfx/cable-plug.ogg", 0.8, kenney("RPG Audio")],
  "sfx.cable.unplug": ["sfx/cable-unplug.ogg", 0.8, kenney("Interface Sounds")],
  "sfx.plate.on": ["sfx/plate-on.ogg", 0.6, kenney("Interface Sounds")],
  "sfx.plate.off": ["sfx/plate-off.ogg", 0.6, kenney("Interface Sounds")],
  "sfx.plate.broken": ["sfx/plate-broken.ogg", 0.6, kenney("Impact Sounds")],
  "sfx.slate.catch": ["sfx/slate-catch.ogg", 0.55, made],
  "sfx.restore": ["sfx/restore-swell.ogg", 0.9, made],
  "sfx.ui.click": ["sfx/ui-click.ogg", 0.3, kenney("UI Audio")],
  "ambience.region.1.ruin": ["ambience/region1-ruin.ogg", 1, madeWith(["RPG Audio"]), true],
  "ambience.region.1.restored": ["ambience/region1-restored.ogg", 0.85, made, true],
  "ambience.region.2.ruin": ["ambience/region2-ruin.ogg", 1, madeWith(["RPG Audio", "Impact Sounds"]), true],
  "ambience.region.2.restored": ["ambience/region2-restored.ogg", 0.85, made, true],
  "ambience.region.3.ruin": ["ambience/region3-ruin.ogg", 1, madeWith(["RPG Audio"]), true],
  "ambience.region.3.restored": ["ambience/region3-restored.ogg", 0.85, made, true],
  "ambience.region.4.ruin": ["ambience/region4-ruin.ogg", 1, madeWith(["Impact Sounds"]), true],
  "ambience.region.4.restored": ["ambience/region4-restored.ogg", 0.85, madeWith(["Impact Sounds"]), true],
  // Ready for the scenes and panels to ask for (gameplay/audio.md's effects list).
  "sfx.key.lock": ["sfx/key-lock.ogg", 0.75, kenney("RPG Audio")],
  "sfx.ui.hover": ["sfx/ui-hover.ogg", 0.2, kenney("UI Audio")],
  "sfx.ui.open": ["sfx/ui-open.ogg", 0.3, kenney("Interface Sounds")],
  "sfx.ui.close": ["sfx/ui-close.ogg", 0.3, kenney("Interface Sounds")],
  "sfx.console.key": ["sfx/console-key.ogg", 0.2, kenney("UI Audio")],
  "sfx.slate.tap": ["sfx/slate-tap.ogg", 0.45, kenney("Interface Sounds")],
  "sfx.slate.capture": ["sfx/slate-capture.ogg", 0.6, made],
  "sfx.message.whoosh": ["sfx/message-whoosh.ogg", 0.25, made],
  "sfx.shimmer": ["sfx/shimmer.ogg", 0.6, made],
  "sfx.memory.rewind": ["sfx/memory-rewind.ogg", 0.6, made],
  "sfx.keeper.gears": ["sfx/keeper-gears.ogg", 0.45, made],
  "sfx.door.open.1": ["sfx/door-open-1.ogg", 0.7, kenney("RPG Audio")],
  "sfx.door.open.2": ["sfx/door-open-2.ogg", 0.7, made],
  "sfx.door.open.3": ["sfx/door-open-3.ogg", 0.7, kenney("RPG Audio")],
  "sfx.door.open.4": ["sfx/door-open-4.ogg", 0.7, made],
  "sfx.step.stone.1": ["sfx/step-stone-1.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.step.stone.2": ["sfx/step-stone-2.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.step.stone.3": ["sfx/step-stone-3.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.step.wood.1": ["sfx/step-wood-1.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.step.wood.2": ["sfx/step-wood-2.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.step.wood.3": ["sfx/step-wood-3.ogg", 0.3, kenney("Impact Sounds")],
  "sfx.wind.gust": ["sfx/wind-gust.ogg", 0.5, made],
  "sfx.drip": ["sfx/drip.ogg", 0.45, made],
  "sfx.bell.far": ["sfx/bell-far.ogg", 0.5, kenney("Impact Sounds")],
  "ambience.machine.hum": ["ambience/machine-hum.ogg", 0.25, made, true],
  "ambience.door.hum": ["ambience/door-hum.ogg", 0.25, made, true],
};

const manifest = JSON.parse(readFileSync(file, "utf8"));
manifest.slots ??= {};
for (const [id, [src, volume, credit, loop]] of Object.entries(slots)) {
  manifest.slots[id] = loop ? { src, volume, loop: true, credit } : { src, volume, credit };
}
manifest.slots = Object.fromEntries(Object.entries(manifest.slots).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${Object.keys(slots).length} effect and ambience slots registered`);
