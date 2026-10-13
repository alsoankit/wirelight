// Pluggable audio (0047, gameplay/audio.md). Every sound is a named slot in one manifest
// (public/audio/manifest.json); code asks only for slot IDs. A missing slot plays nothing and never
// errors, so the game is complete with no audio files at all. Voices are the content's line IDs and
// play only when Voices is On (Text only plays none). Muted until the first click (browsers require
// it). Music follows the room's ruin: muffled in ruin, opening up as it restores; speech dips it.

type Slot = { src: string; volume?: number; loop?: boolean; credit?: string };
export type Channel = "music" | "effects" | "voices";
export type Volumes = Record<"master" | Channel, number>;

let manifest: Record<string, Slot> = {};
let ctx: AudioContext | null = null;
let buses: Record<Channel, GainNode> | null = null;
let master: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let volumes: Volumes = { master: 0.8, music: 0.6, effects: 0.7, voices: 0.9 };
let textOnly = false;
let music: { slot: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;
let voice: AudioBufferSourceNode | null = null;
const lastPlayed = new Map<string, number>();

/** Reads the manifest once; nothing plays until it's in, and a missing manifest is no audio at all. */
export async function loadManifest(url = "/audio/manifest.json"): Promise<void> {
  try {
    const r = await fetch(url);
    if (r.ok) manifest = ((await r.json()) as { slots?: Record<string, Slot> }).slots ?? {};
  } catch {
    manifest = {};
  }
}

/** The first click or key: browsers allow sound from here on. */
export function unlock(): void {
  if (ctx) return void ctx.resume();
  try {
    ctx = new AudioContext();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicFilter = ctx.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 18000;
  buses = {
    music: ctx.createGain(),
    effects: ctx.createGain(),
    voices: ctx.createGain(),
  };
  buses.music.connect(musicFilter);
  musicFilter.connect(master);
  buses.effects.connect(master);
  buses.voices.connect(master);
  applyVolumes();
}

export function setVolumes(v: Volumes): void {
  volumes = v;
  applyVolumes();
}

/** Voices: On, or Text only (no voice line plays anywhere; 0047). */
export function setTextOnly(on: boolean): void {
  textOnly = on;
  if (on) stopVoice();
}

function applyVolumes(): void {
  if (!ctx || !buses || !master) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(volumes.master, t, 0.05);
  for (const c of ["music", "effects", "voices"] as const) buses[c].gain.setTargetAtTime(volumes[c], t, 0.05);
}

function buffer(slot: string): Promise<AudioBuffer | null> {
  const s = manifest[slot];
  if (!s?.src || !ctx) return Promise.resolve(null);
  let b = buffers.get(slot);
  if (!b) {
    const c = ctx;
    b = fetch(`/audio/${s.src}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    buffers.set(slot, b);
  }
  return b;
}

/** A sound effect. `throttleMs` keeps a repeated sound (a broadcast's copies) from piling up. */
export async function effect(slot: string, throttleMs = 0): Promise<void> {
  if (!ctx || !buses) return;
  const now = performance.now();
  if (throttleMs && now - (lastPlayed.get(slot) ?? 0) < throttleMs) return;
  lastPlayed.set(slot, now);
  const b = await buffer(slot);
  if (!b || !ctx || !buses) return;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = manifest[slot]?.volume ?? 1;
  src.buffer = b;
  src.connect(g).connect(buses.effects);
  src.start();
}

/** The music slot for where the player is; crossfades from what was playing (2 s). */
export async function playMusic(slot: string | null): Promise<void> {
  if (!ctx || !buses) return;
  if (music?.slot === slot) return;
  const old = music;
  music = null;
  if (old) {
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    old.source.stop(ctx.currentTime + 3);
  }
  if (!slot) return;
  const b = await buffer(slot);
  if (!b || !ctx || !buses) return;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(manifest[slot]?.volume ?? 1, ctx.currentTime, 0.6);
  source.buffer = b;
  source.loop = manifest[slot]?.loop ?? true;
  source.connect(gain).connect(buses.music);
  source.start();
  music = { slot, source, gain };
}

/** Ruin to restoration, live (0018): a ruined room's music is muffled; restored, it opens up. */
export function setRuin(level: number): void {
  if (!ctx || !musicFilter) return;
  const hz = 600 + (1 - Math.min(Math.max(level, 0), 1)) ** 2 * 17400;
  musicFilter.frequency.setTargetAtTime(hz, ctx.currentTime, 0.8);
}

/**
 * A voiced line (its content ID is its slot). Resolves when it has finished, or at once when there's
 * nothing to play (no file, Text only, muted). Music and effects dip under speech.
 */
export async function speak(lineId: string): Promise<void> {
  stopVoice();
  if (textOnly || !ctx || !buses) return;
  const b = await buffer(lineId);
  if (!b || !ctx || !buses || textOnly) return;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.connect(buses.voices);
  const t = ctx.currentTime;
  buses.music.gain.setTargetAtTime(volumes.music * 0.35, t, 0.15);
  buses.effects.gain.setTargetAtTime(volumes.effects * 0.5, t, 0.15);
  voice = src;
  await new Promise<void>((done) => {
    src.onended = () => done();
    src.start();
  });
  if (voice === src) voice = null;
  if (ctx && buses) {
    buses.music.gain.setTargetAtTime(volumes.music, ctx.currentTime, 0.4);
    buses.effects.gain.setTargetAtTime(volumes.effects, ctx.currentTime, 0.4);
  }
}

export function stopVoice(): void {
  try {
    voice?.stop();
  } catch {
    // already stopped
  }
  voice = null;
}

/** Every slot the game asks for that the manifest has no file for (dev aid; `pnpm audio:check`). */
export function hasSlot(slot: string): boolean {
  return !!manifest[slot]?.src;
}
