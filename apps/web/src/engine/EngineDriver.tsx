import { useFrame } from "@react-three/fiber";
import { useSession } from "./store";

// Moves network time once per rendered frame by the presentation clock (store.tick → clock.ts).
export function EngineDriver() {
  useFrame((_, delta) => {
    // A long stall (a hidden tab) shouldn't fast-forward the network: at most 250 ms per frame. Down
    // to 4 frames a second (a slow machine, or software drawing) the network still runs at real speed.
    useSession.getState().tick(Math.min(delta, 0.25) * 1000);
  });
  return null;
}
