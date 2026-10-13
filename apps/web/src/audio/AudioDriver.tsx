import { roomById } from "@wirelight/rooms";
import { useEffect, useRef } from "react";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { effect, loadManifest, playAmbience, playMusic, setRuin, setTextOnly, setVolumes, unlock } from "./audio";

// Plays the game's sound from what happens (gameplay/audio.md): the floor's music (muffled in ruin,
// opening as the room restores), and effects from the trace: a soft chime for each broadcast copy
// (throttled), a click when a keeper decides, the cable plugging in and out, a plate switching (or
// refusing), the Slate catching, the swell and the key on a win, and a soft click on any button. The
// region's ambience beds blend from ruined to restored with the room (0021).
// Every slot may be missing: then nothing plays (0047).

export function AudioDriver() {
  const roomId = useSession((s) => s.roomId);
  const settings = useProgress((s) => s.settings);
  const seen = useRef(0);

  useEffect(() => {
    void loadManifest();
    const first = () => unlock();
    window.addEventListener("pointerdown", first, { once: true });
    window.addEventListener("keydown", first, { once: true });
    const click = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("button, [role='button']")) void effect("sfx.ui.click", 40);
    };
    window.addEventListener("pointerdown", click);
    return () => {
      window.removeEventListener("pointerdown", first);
      window.removeEventListener("keydown", first);
      window.removeEventListener("pointerdown", click);
      void playAmbience(null);
    };
  }, []);

  useEffect(() => {
    setVolumes(settings.volumes);
    setTextOnly(settings.voices === "text");
  }, [settings.volumes, settings.voices]);

  useEffect(() => {
    const room = roomId ? roomById(roomId) : undefined;
    if (!room) return;
    void playMusic(room.kind === "boss" ? "music.boss" : `music.region.${room.region}`);
    void playAmbience(`ambience.region.${room.region}`);
    seen.current = 0;
  }, [roomId]);

  // Effects and the ruin's filter, from new events and the status (subscribed, not rendered).
  useEffect(
    () =>
      useSession.subscribe((s, prev) => {
        const checks = Object.values(s.status?.health ?? {});
        if (checks.length) setRuin(checks.filter((ok) => !ok).length / checks.length);
        if (s.status?.won && !prev.status?.won) {
          void effect("sfx.restore");
          setTimeout(() => void effect("sfx.key"), 1800);
        }
        // `seen` counts the whole trace; the store may have let the oldest events go.
        if (s.dropped + s.events.length < seen.current) seen.current = 0;
        for (const e of s.events.slice(Math.max(0, seen.current - s.dropped))) {
          if (e.kind === "link.enter" && e.bytes[0] === 0xff && e.bytes[5] === 0xff) void effect("sfx.broadcast", 250);
          else if (e.kind === "fwd.decision") void effect("sfx.keeper.decide", 150);
          else if (e.kind === "cmd.exec" && /^lab cable plug/.test(e.line)) void effect("sfx.cable.plug");
          else if (e.kind === "cmd.exec" && /^lab cable unplug/.test(e.line)) void effect("sfx.cable.unplug");
          else if (e.kind === "cmd.exec" && /^lab slate catch/.test(e.line)) void effect("sfx.slate.catch");
          else if (e.kind === "cmd.exec" && e.source !== "script" && /^ip link set \S+ (up|down)$/.test(e.line))
            void effect(e.exitCode ? "sfx.plate.broken" : e.line.endsWith("up") ? "sfx.plate.on" : "sfx.plate.off", 80);
        }
        seen.current = s.dropped + s.events.length;
      }),
    [],
  );

  return null;
}
