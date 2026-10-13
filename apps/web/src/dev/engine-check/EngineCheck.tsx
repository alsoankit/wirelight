import { useEffect, useState } from "react";
import { startEngine } from "../../engine/connect";

// Dev page (/dev/engine-check): proves the engine runs in a Web Worker in this browser. It loads
// Lights Out, types the solution as real commands, lets network time pass, and prints what came back.
// Not part of the game.

const LANTERN = "02:00:00:00:00:07";

export function EngineCheck() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const { engine, stop } = startEngine();
    const say = (line: string) => setLines((l) => [...l, line]);
    (async () => {
      const started = performance.now();
      const load = await engine.loadRoom("f2.lights-out");
      say(`loaded ${load.status.roomId}: won ${load.status.won}, health ${JSON.stringify(load.status.health)}`);
      for (const line of ["ip link set eth0 up", `lab send-frame --to ${LANTERN}`]) {
        const r = await engine.exec("observatory", line, "typed");
        say(`$ ${line}  → exit ${r.exitCode}, ${r.events.length} events`);
        for (const e of r.events) if (e.kind === "proc.output") say(`  ${e.text}`);
      }
      const end = await engine.advanceTo(10_000);
      say(`t=${end.status.now} ms: won ${end.status.won}, health ${JSON.stringify(end.status.health)}`);
      say(`${end.events.length} events in the last batch · ${Math.round(performance.now() - started)} ms`);
      say(end.status.won ? "ENGINE OK" : "ENGINE FAILED");
    })().catch((e: unknown) => say(`ENGINE FAILED: ${String(e)}`));
    return stop;
  }, []);
  return (
    <pre style={{ padding: 24, font: "13px/1.5 var(--mono)" }} data-testid="engine-check">
      {lines.join("\n")}
    </pre>
  );
}
