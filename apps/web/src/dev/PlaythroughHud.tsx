import { roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useRef, useState } from "react";
import { isTyping } from "../play/keys";
import {
  addNote,
  clearNotes,
  notesMarkdown,
  pausePlaythrough,
  skipRoom,
  stopPlaythrough,
  usePlaythrough,
} from "./playthrough";

// Developer tool (not part of the game): the playthrough's controls, over the game while it plays.
// Shift+N writes a note about what's on screen (the playthrough waits while you type); the notes
// stay in this browser until cleared and copy or download as Markdown.

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function PlaythroughHud() {
  const { running, paused, list, index, doing, notes } = usePlaythrough();
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wasPaused = useRef(false);

  const startNote = () => {
    wasPaused.current = usePlaythrough.getState().paused;
    if (usePlaythrough.getState().running) pausePlaythrough(true);
    setWriting(true);
    setTimeout(() => input.current?.focus(), 0);
  };
  const endNote = (save: boolean) => {
    if (save) addNote(note);
    setNote("");
    setWriting(false);
    if (usePlaythrough.getState().running && !wasPaused.current) pausePlaythrough(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "N" && e.shiftKey && !isTyping(e)) {
        e.preventDefault();
        startNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!running && notes.length === 0 && !writing) return null;
  const roomId = list[index];
  const room = roomId ? roomById(roomId) : undefined;
  const title = room ? (roomTexts[room.content]?.title ?? roomId) : "";
  return (
    <aside className="dev-playthrough" aria-label="Playthrough">
      {running && (
        <p>
          <strong>▶ Playthrough</strong> {index + 1}/{list.length} · {title}
          <br />
          <span className="dev-doing">{paused ? "paused" : doing}</span>
        </p>
      )}
      <div className="dev-actions">
        {running && (
          <>
            <button type="button" onClick={() => pausePlaythrough(!paused)}>
              {paused ? "▶ Resume" : "❚❚ Pause"}
            </button>
            <button type="button" onClick={skipRoom}>
              ⏭ Next room
            </button>
            <button type="button" onClick={stopPlaythrough}>
              ■ Stop
            </button>
          </>
        )}
        <button type="button" onClick={startNote} title="Shift+N">
          ✎ Note
        </button>
        {notes.length > 0 && (
          <>
            <button type="button" onClick={() => void navigator.clipboard?.writeText(notesMarkdown(notes))}>
              Copy {notes.length} notes
            </button>
            <button
              type="button"
              onClick={() =>
                download(`playthrough-notes-${new Date().toISOString().slice(0, 10)}.md`, notesMarkdown(notes))
              }
            >
              Download
            </button>
            <button type="button" onClick={clearNotes}>
              Clear
            </button>
          </>
        )}
      </div>
      {writing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            endNote(true);
          }}
        >
          <input
            ref={input}
            value={note}
            placeholder={`Note on ${roomTitle()}… (Enter saves, Esc cancels)`}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                endNote(false);
              }
            }}
          />
        </form>
      )}
    </aside>
  );
}

/** The room on screen now (notes are about what's in view, even outside a playthrough). */
function roomTitle(): string {
  const { list, index, running } = usePlaythrough.getState();
  const id = running ? list[index] : new URLSearchParams(window.location.search).get("room");
  const room = id ? roomById(id) : undefined;
  return room ? (roomTexts[room.content]?.title ?? room.id) : "this room";
}
