import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it, vi } from "vitest";

// The session store with a stand-in for the engine worker (and saved progress), so its own logic runs.
const engine = vi.hoisted(() => ({ reset: vi.fn(), catches: vi.fn() }));
vi.mock("../src/engine/connect", () => ({ startEngine: () => ({ engine, stop: () => undefined }) }));
vi.mock("../src/progress/progress", () => ({ useProgress: { getState: () => ({ voiceGiven: true }) } }));

const { useSession } = await import("../src/engine/store");

const status = { roomId: "f2.wrong-name", now: 0, won: false } as never;
const batch = (events: SimEvent[]) => ({ events, status });

describe("Reset room", () => {
  it("empties Captures: the network is back as it was, with nothing caught", async () => {
    const caught = {
      n: 1,
      t: 1200,
      device: "observatory",
      iface: "eth0",
      dir: "in",
      frameId: 4,
      hex: "",
      traced: false,
    };
    useSession.setState({ jar: [caught] as never, status });
    engine.reset.mockResolvedValue(batch([{ kind: "world.reset", t: 3000 }]));
    engine.catches.mockResolvedValue([]);
    await useSession.getState().reset();
    await vi.waitFor(() => expect(useSession.getState().jar).toEqual([]));
  });
});
