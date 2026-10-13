/**
 * Every audio slot the game asks for (0047): each voiced line's ID (from packages/content), and the
 * music and effect slots the web app plays. Used by `pnpm audio:check` and `pnpm voices:export`.
 */
import {
  commandMemories,
  firstReleaseEnding,
  floorTexts,
  region2Arrival,
  region3Arrival,
  region4Arrival,
  roomTexts,
} from "../../packages/content/src/index";

export type VoiceLine = { id: string; speaker: string; text: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every voiced line (gameplay/audio.md: memories, gifts, Guardians, bosses, floor memories, journal pages, the ending). */
export function voiceLines(): VoiceLine[] {
  const out: VoiceLine[] = [];
  for (const t of Object.values(roomTexts)) {
    for (const m of t.memories ?? []) out.push({ id: m.id, speaker: "The Knight", text: m.text });
    for (const v of t.voice ?? []) out.push({ id: v.id, speaker: cap(v.speaker), text: v.text });
    if (t.building) out.push({ id: t.building.id, speaker: "Guardian", text: t.building.text });
  }
  for (const [floor, f] of Object.entries(floorTexts)) {
    for (const c of f.memory) out.push({ id: c.id, speaker: "Guardian", text: c.text });
    if (f.farewell) out.push({ id: f.farewell.id, speaker: cap(f.farewell.speaker), text: f.farewell.text });
    out.push({ id: `F${floor}-JOURNAL`, speaker: "The Knight", text: f.journal.text });
  }
  for (const m of Object.values(commandMemories)) out.push({ id: m.id, speaker: "The Knight", text: m.intro });
  const extra = [region2Arrival, region3Arrival, region4Arrival].flatMap((r) =>
    (Array.isArray(r) ? r : (r as { lines: VoiceLine[] }).lines).map((l) => ({ ...l, speaker: cap(l.speaker) })),
  );
  const ending = firstReleaseEnding as unknown as { lines?: VoiceLine[] };
  return [...out, ...extra, ...(ending.lines ?? [])];
}

/** Music and effects the web app plays (apps/web/src/audio/AudioDriver.tsx). */
export const MUSIC_AND_EFFECTS = [
  "music.landing",
  "music.region.1",
  "music.region.2",
  "music.region.3",
  "music.region.4",
  "music.boss",
  "sfx.broadcast",
  "sfx.keeper.decide",
  "sfx.cable.plug",
  "sfx.restore",
  "sfx.key",
];
