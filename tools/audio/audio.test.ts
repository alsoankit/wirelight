/**
 * `pnpm audio:check`: every slot the game asks for that has no file yet (a to-do list, 0047).
 * `pnpm voices:export`: every voiced line to tools/audio/lines.csv, for recording.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MUSIC_AND_EFFECTS, voiceLines } from "./slots";

const manifest = JSON.parse(readFileSync("apps/web/public/audio/manifest.json", "utf8")) as {
  slots: Record<string, { src?: string }>;
};

describe("audio slots", () => {
  it("voice line ids are unique", () => {
    const ids = voiceLines().map((l) => l.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("lists what's still missing", () => {
    const wanted = [...MUSIC_AND_EFFECTS, ...voiceLines().map((l) => l.id)];
    const missing = wanted.filter((id) => !manifest.slots[id]?.src);
    console.log(`audio: ${wanted.length - missing.length} of ${wanted.length} slots have a file.`);
    if (process.env.AUDIO_LIST) console.log(missing.join("\n"));
    expect(wanted.length).toBeGreaterThan(0);
  });

  it.runIf(process.env.VOICES_EXPORT)("exports lines.csv", () => {
    const q = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const rows = voiceLines().map((l) => [l.id, l.speaker, l.text].map(q).join(","));
    writeFileSync("tools/audio/lines.csv", ["id,speaker,text", ...rows].join("\n"));
  });
});
