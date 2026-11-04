import { commandMemories, roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { giftRoom, useSession } from "../engine/store";
import { CommandMemory } from "./CommandMemory";
import { type Line, Lines } from "./Lines";

// The gift of the voice (0032, floors/floor-2.md 2.4): the first click on the worn-out switch (or 20 s
// in the room) brings the robot's note and four spoken lines; then the command memory
// (CMD-01, automatic the first time); then the console wakes. Before that, the room has no console.

const WAIT_MS = 20_000;

export function Gift() {
  const roomId = useSession((s) => s.roomId);
  const given = useSession((s) => s.voiceGiven);
  const giveVoice = useSession((s) => s.giveVoice);
  const touched = useSession((s) => s.events.some((e) => e.kind === "control.touch"));
  const [phase, setPhase] = useState<"waiting" | "lines" | "memory">("waiting");
  const isGiftRoom = !!giftRoom && roomId === giftRoom.id && !given;

  useEffect(() => {
    if (!isGiftRoom) return;
    setPhase("waiting");
    const timer = setTimeout(() => setPhase((p) => (p === "waiting" ? "lines" : p)), WAIT_MS);
    return () => clearTimeout(timer);
  }, [isGiftRoom]);
  useEffect(() => {
    if (isGiftRoom && touched) setPhase((p) => (p === "waiting" ? "lines" : p));
  }, [isGiftRoom, touched]);
  // The gift takes the stage: whatever panel was open closes.
  useEffect(() => {
    if (phase !== "waiting") useSession.getState().closePanel();
  }, [phase]);

  if (!isGiftRoom || phase === "waiting") return null;
  const room = giftRoom ? roomById(giftRoom.id) : undefined;
  const text = room ? roomTexts[room.content] : undefined;
  const voice = text?.voice ?? [];
  const lines: Line[] = [
    ...(touched ? voice.filter((v) => v.id.endsWith("NOTE-01")) : []),
    ...voice.filter((v) => v.id.includes("GIFT")),
  ];
  const memory = room?.commandMemory ? commandMemories[room.commandMemory] : undefined;
  if (phase === "lines") return <Lines lines={lines} onDone={() => (memory ? setPhase("memory") : giveVoice())} />;
  return memory ? <CommandMemory memory={memory} onDone={giveVoice} /> : null;
}
