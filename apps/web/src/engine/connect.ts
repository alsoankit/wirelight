import type { Session } from "@wirelight/engine";
import { type Remote, wrap } from "comlink";

// Starts the game session in a Web Worker (tech/architecture.md: the network never runs on the main
// thread) and returns it wrapped by Comlink: every method is the Session's, but async.
export function startEngine(): { engine: Remote<Session>; stop: () => void } {
  const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module", name: "engine" });
  return { engine: wrap<Session>(worker), stop: () => worker.terminate() };
}
