import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_KEY, logsOn, readSaved, setLogs, signedIn, signedOut, useAccount } from "../src/account/account";

const ada = { userId: "u1", email: "ada@example.com" };
const bo = { userId: "u2", email: "bo@example.com" };

/** A browser's storage kept in a Map, its writes counted. */
function mapStorage(saved?: unknown) {
  const items = new Map<string, string>();
  if (saved !== undefined) items.set(ACCOUNT_KEY, JSON.stringify(saved));
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => {
      items.set(k, v);
    }),
    removeItem: (k: string) => {
      items.delete(k);
    },
  };
}

beforeEach(() => useAccount.setState({ account: null, logsFor: null, link: "idle", sentTo: null, waiting: 0 }));
afterEach(() => vi.unstubAllGlobals());

describe("the play logs' switch (opt in)", () => {
  it("is off at first", () => {
    expect(logsOn(useAccount.getState())).toBe(false);
  });

  it("can't be switched on while signed out", () => {
    setLogs(true);
    expect(logsOn(useAccount.getState())).toBe(false);
    expect(useAccount.getState().logsFor).toBeNull();
  });

  it("stays off on signing in, until the player switches it on", () => {
    signedIn(ada);
    expect(useAccount.getState().account).toEqual(ada);
    expect(logsOn(useAccount.getState())).toBe(false);
    setLogs(true);
    expect(logsOn(useAccount.getState())).toBe(true);
    expect(useAccount.getState().logsFor).toBe("u1");
  });

  it("switches off", () => {
    signedIn(ada);
    setLogs(true);
    setLogs(false);
    expect(logsOn(useAccount.getState())).toBe(false);
  });

  it("is forgotten on signing out, so signing in again finds it off", () => {
    signedIn(ada);
    setLogs(true);
    signedOut();
    expect(useAccount.getState().account).toBeNull();
    expect(useAccount.getState().logsFor).toBeNull();
    signedIn(ada);
    expect(logsOn(useAccount.getState())).toBe(false);
  });

  it("is each person's own: someone else signing in finds it off", () => {
    signedIn(ada);
    setLogs(true);
    signedIn(bo);
    expect(useAccount.getState().account).toEqual(bo);
    expect(logsOn(useAccount.getState())).toBe(false);
  });

  it("stays on as the same person is heard signed in again (a session refresh), keeping the same account", () => {
    signedIn(ada);
    setLogs(true);
    const before = useAccount.getState().account;
    signedIn({ ...ada });
    expect(useAccount.getState().account).toBe(before);
    expect(logsOn(useAccount.getState())).toBe(true);
  });

  it("clears a link's news on signing in", () => {
    useAccount.setState({ link: "sent", sentTo: "ada@example.com" });
    signedIn(ada);
    expect(useAccount.getState()).toMatchObject({ link: "idle", sentTo: null });
  });
});

describe("what's kept in this browser", () => {
  it("is nobody signed in when there's nothing, garbage, or a storage that throws", () => {
    expect(readSaved(null)).toEqual({ account: null, logsFor: null });
    expect(readSaved(mapStorage())).toEqual({ account: null, logsFor: null });
    const garbage = mapStorage();
    garbage.items.set(ACCOUNT_KEY, "{not json");
    expect(readSaved(garbage)).toEqual({ account: null, logsFor: null });
    expect(readSaved(mapStorage({ account: { userId: 7 }, logsFor: 7 }))).toEqual({ account: null, logsFor: null });
    expect(readSaved(mapStorage([1, 2]))).toEqual({ account: null, logsFor: null });
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readSaved(blocked)).toEqual({ account: null, logsFor: null });
  });

  it("is nobody signed in where the browser has no storage, or reading it throws", () => {
    expect(readSaved()).toEqual({ account: null, logsFor: null });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(readSaved()).toEqual({ account: null, logsFor: null });
    } finally {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("reads who is signed in, and their switch", () => {
    expect(readSaved(mapStorage({ account: ada, logsFor: "u1" }))).toEqual({ account: ada, logsFor: "u1" });
    expect(readSaved(mapStorage({ account: ada, logsFor: null }))).toEqual({ account: ada, logsFor: null });
    expect(readSaved(mapStorage({ account: { userId: "u1" } }))).toEqual({
      account: { userId: "u1", email: "" },
      logsFor: null,
    });
  });

  it("drops a switch kept for anyone but who is signed in", () => {
    expect(readSaved(mapStorage({ account: null, logsFor: "u1" }))).toEqual({ account: null, logsFor: null });
    expect(readSaved(mapStorage({ account: ada, logsFor: "u2" }))).toEqual({ account: ada, logsFor: null });
  });

  it("starts the game from it, and writes each change to who or the switch back", async () => {
    const storage = mapStorage({ account: ada, logsFor: "u1" });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const m = await import("../src/account/account");
    expect(m.useAccount.getState()).toMatchObject({ account: ada, logsFor: "u1", link: "idle", waiting: 0 });
    expect(m.logsOn(m.useAccount.getState())).toBe(true);

    m.useAccount.setState({ waiting: 3, link: "sending" });
    expect(storage.setItem).not.toHaveBeenCalled();

    m.setLogs(false);
    expect(JSON.parse(storage.items.get(ACCOUNT_KEY) ?? "")).toEqual({ account: ada, logsFor: null });
    m.signedIn(bo);
    m.setLogs(true);
    expect(JSON.parse(storage.items.get(ACCOUNT_KEY) ?? "")).toEqual({ account: bo, logsFor: "u2" });
    m.signedOut();
    expect(JSON.parse(storage.items.get(ACCOUNT_KEY) ?? "")).toEqual({ account: null, logsFor: null });
  });

  it("never throws when storage refuses the write", async () => {
    const storage = mapStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    const m = await import("../src/account/account");
    expect(() => m.signedIn(ada)).not.toThrow();
    expect(m.useAccount.getState().account).toEqual(ada);
  });
});
