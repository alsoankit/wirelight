import { fill, floors, floorTexts, regions, roomTexts, voice } from "@wirelight/content";
import { floorDefs, roomById, rooms } from "@wirelight/rooms";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { speak, stopVoice } from "../audio/audio";
import { useProgress } from "../progress/progress";
import { FloorMap } from "./Glass";
import { RideAlong } from "./RideAlong";

// Guardian memories in the Scrying Glass (0036, 0037, tech/rendering.md "Memories and
// ride-alongs"): the floor as it was, in a warm sepia-gold grade with a soft vignette ("back in
// time"). A floor memory comes in chapters (the problem, what they built, a ride-along, what's next),
// each line spoken from its audio slot (0047) and always written out; Next and Back move between
// chapters, Skip closes it. A building memory is the same view with one chapter. Opened from the
// debrief and replayable from the Codex.

export type MemoryShow = { kind: "floor"; floor: number } | { kind: "building"; roomId: string };

export const useMemory = create<{ show: MemoryShow | null; open(show: MemoryShow): void; close(): void }>((set) => ({
  show: null,
  open: (show) => set({ show }),
  close: () => set({ show: null }),
}));

/** Opens a memory and remembers it was seen (the Codex lists what's been seen, CORE-46). */
export function openMemory(show: MemoryShow): void {
  const p = useProgress.getState();
  if (show.kind === "floor") p.seeFloorMemory(show.floor);
  else {
    const room = roomById(show.roomId);
    const id = room ? roomTexts[room.content]?.building?.id : undefined;
    if (id) p.seeMemory(id);
  }
  useMemory.getState().open(show);
}

type Chapter = { id: string; title: string; text: string; ride: boolean };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a memory shows: its speaker, the room whose map it's played over, and its chapters. */
function chaptersOf(
  show: MemoryShow,
): { speaker: string; heading: string; mapRoom: string; chapters: Chapter[] } | null {
  if (show.kind === "floor") {
    const text = floorTexts[show.floor];
    const def = floorDefs.find((f) => f.floor === show.floor);
    if (!text || !def) return null;
    const guardian = capitalise(regions[def.region]?.guardian ?? "");
    const chapters: Chapter[] = text.memory.map((c) => ({
      id: c.id,
      title: c.title,
      text: c.text,
      ride: /-FM-03$/.test(c.id),
    }));
    if (text.farewell)
      chapters.push({ id: text.farewell.id, title: voice.memory.farewell, text: text.farewell.text, ride: false });
    return { speaker: guardian, heading: fill(voice.memory.floor, { guardian }), mapRoom: def.boss, chapters };
  }
  const room = roomById(show.roomId);
  const building = room ? roomTexts[room.content]?.building : undefined;
  if (!room || !building) return null;
  const speaker = capitalise(regions[room.region]?.guardian ?? "");
  return {
    speaker,
    heading: fill(voice.memory.floor, { guardian: speaker }),
    mapRoom: room.id,
    chapters: [{ id: building.id, title: voice.memory.building, text: fill(building.text, room.vars), ride: false }],
  };
}

function MemoryView({ show, onClose }: { show: MemoryShow; onClose: () => void }) {
  const memory = useMemo(() => chaptersOf(show), [show]);
  const [i, setI] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const chapters = memory?.chapters ?? [];
  const chapter = chapters[i];
  const room = memory ? roomById(memory.mapRoom) : undefined;
  const last = i + 1 >= chapters.length;
  const next = () => (last ? onClose() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));

  // Each chapter's line plays from its audio slot, if there's a file and Voices is On (0047).
  useEffect(() => {
    if (chapter) void speak(chapter.id);
    return () => stopVoice();
  }, [chapter]);
  useEffect(() => nextButton.current?.focus(), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handler only needs the latest chapter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const onControl = e.target instanceof HTMLElement && /BUTTON|INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || (e.key === "Enter" && !onControl)) {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i]);

  if (!memory || !chapter || !room) return null;
  return (
    <section className="glass memory" aria-label={memory.heading} data-memory={chapter.id}>
      <header className="memory-head">
        <span className="memory-speaker">{memory.heading}</span>
        <span className="memory-title">{chapter.title}</span>
        {chapters.length > 1 && (
          <span className="panel-note">
            {fill(voice.memory.chapter, { n: String(i + 1), total: String(chapters.length) })}
          </span>
        )}
        <button type="button" className="quiet" onClick={onClose}>
          {voice.memory.skip}
        </button>
      </header>
      <div className="memory-stage">
        {chapter.ride ? <RideAlong key={chapter.id} roomId={room.id} /> : <FloorMap room={room} mini={false} memory />}
      </div>
      <div className="memory-caption" aria-live="polite">
        <div className="lines-speaker">{memory.speaker}</div>
        <p className="lines-text">{chapter.text}</p>
        <div className="panel-actions">
          {i > 0 && (
            <button type="button" className="quiet" onClick={back}>
              {voice.memory.back}
            </button>
          )}
          <button type="button" ref={nextButton} onClick={next}>
            {last ? voice.memory.done : voice.memory.next}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The memory being shown, if any; mounted once beside the Glass. */
export function Memory() {
  const show = useMemory((s) => s.show);
  const close = useMemory((s) => s.close);
  if (!show) return null;
  return <MemoryView key={JSON.stringify(show)} show={show} onClose={close} />;
}

/** The Codex's list of Guardian memories seen (CORE-46), each one replayable. */
export function MemoryList() {
  const floorsSeen = useProgress((s) => s.floorMemoriesSeen);
  const seen = useProgress((s) => s.memoriesSeen);
  const built = rooms.filter((r) => {
    const id = roomTexts[r.content]?.building?.id;
    return id !== undefined && seen.includes(id);
  });
  const floorList = [...floorsSeen].sort((a, b) => a - b).filter((n) => floorTexts[n]);
  return (
    <>
      <h3>{voice.menu.guardianMemories}</h3>
      {floorList.length + built.length === 0 && <p className="panel-note">{voice.menu.empty}</p>}
      {floorList.map((n) => {
        const def = floorDefs.find((f) => f.floor === n);
        const guardian = capitalise(regions[def?.region ?? 0]?.guardian ?? "");
        return (
          <button key={`f${n}`} type="button" className="link" onClick={() => openMemory({ kind: "floor", floor: n })}>
            {fill(voice.menu.floorMemory, { guardian, floor: floors[n]?.name ?? String(n) })}
          </button>
        );
      })}
      {built.map((r) => (
        <button
          key={r.id}
          type="button"
          className="link"
          onClick={() => openMemory({ kind: "building", roomId: r.id })}
        >
          {fill(voice.menu.buildingMemory, { room: roomTexts[r.content]?.title ?? r.id })}
        </button>
      ))}
    </>
  );
}
