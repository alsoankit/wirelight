import { useFrame } from "@react-three/fiber";
import { useSession } from "./store";

// Moves network time once per rendered frame by the presentation clock (store.tick → clock.ts).
export function EngineDriver() {
  useFrame((_, delta) => {
    // A long stall (a hidden tab) shouldn't fast-forward the network: at most 100 ms per frame.
    useSession.getState().tick(Math.min(delta, 0.1) * 1000);
  });
  return null;
}
