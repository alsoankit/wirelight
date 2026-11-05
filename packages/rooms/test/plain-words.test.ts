/**
 * Plain words (world/voice.md): no text in packages/content uses a name from the game's old fantasy
 * setting. Every value @wirelight/content exports is walked, and every string inside it is checked.
 */
import * as content from "@wirelight/content";
import { describe, expect, it } from "vitest";

/** The old names, found as whole words in any case. A phrase matches with any spaces between its words. */
const OLD_WORDS = [
  "Knight",
  "Guardian",
  "Gardener",
  "Lamplighter",
  "warden",
  "Scrying",
  "Codex",
  "Slate",
  "weaver",
  "weavers",
  "navigator",
  "lectern",
  "Deep Network",
  "Capture jar",
];
const OLD = new RegExp(`\\b(?:${OLD_WORDS.map((w) => w.split(" ").join("\\s+")).join("|")})\\b`, "i");

/** Every string inside `value`, each with where it was found (like `voice.menu.title`). */
function stringsIn(value: unknown, path: string, out: { path: string; text: string }[], seen: Set<object>): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  for (const [key, inner] of Object.entries(value)) stringsIn(inner, `${path}.${key}`, out, seen);
}

describe("plain words", () => {
  it("finds an old word only as a whole word, in any case", () => {
    expect(OLD.test("the knight's notes")).toBe(true);
    expect(OLD.test("a capture  jar")).toBe(true);
    expect(OLD.test("translate")).toBe(false);
    expect(OLD.test("the Lantern Town")).toBe(false);
    expect(OLD.test("the bell tower")).toBe(false);
  });

  it("no string in packages/content uses an old word", () => {
    const all: { path: string; text: string }[] = [];
    const seen = new Set<object>();
    for (const [name, value] of Object.entries(content)) stringsIn(value, name, all, seen);
    // The walk reaches the text itself, not just a few names.
    expect(all.length).toBeGreaterThan(1000);
    expect(all.filter((s) => OLD.test(s.text)).map((s) => `${s.path}: ${s.text}`)).toEqual([]);
  });
});
