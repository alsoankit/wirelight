import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "../src/account/types";

type User = { id: string; email?: string };
type Heard = (event: string, session: { user: User } | null) => void;
type Failure = { status?: number; code?: string } | null;

/** The library's client, as far as the game uses it; each test sets its answers. */
function fakeClient() {
  let heard: Heard = () => {};
  const insert = vi.fn(async (_row: unknown) => ({ data: null, error: null as { code: string } | null, status: 201 }));
  const auth = {
    onAuthStateChange: vi.fn((callback: Heard) => {
      heard = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    }),
    signInWithOtp: vi.fn(async (_credentials: unknown) => ({ data: {}, error: null as Failure })),
    setSession: vi.fn(async (_tokens: unknown) => ({ data: {}, error: null as Failure })),
    getSession: vi.fn(async () => ({ data: { session: null as { user: User } | null }, error: null })),
    signOut: vi.fn(async (_options: unknown) => ({ error: null as Failure })),
    stopAutoRefresh: vi.fn(async () => {}),
  };
  return {
    auth,
    insert,
    from: vi.fn((_table: string) => ({ insert })),
    hear: (e: string, s: { user: User } | null) => heard(e, s),
  };
}

const lib = vi.hoisted(() => {
  const state = { client: undefined as unknown };
  return { state, createClient: vi.fn((_url: string, _key: string, _options: unknown) => state.client) };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: lib.createClient }));

let fake = fakeClient();
let items = new Map<string, string>();

/** The modules as a fresh page has them, built with the project's settings or (`builtIn` false) without. */
async function load(builtIn = true) {
  vi.stubEnv("VITE_SUPABASE_URL", builtIn ? "https://example.supabase.co" : "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", builtIn ? "anon" : "");
  vi.resetModules();
  return { ...(await import("../src/account/account")), ...(await import("../src/account/supabase")) };
}

const ada = { userId: "u1", email: "ada@example.com" };
const entry: Entry = {
  id: "e1",
  userId: "u1",
  roomId: "1.1",
  payload: {
    v: 1,
    roomId: "1.1",
    seconds: 30,
    won: true,
    hints: 0,
    mistakes: [],
    commands: ["ip addr"],
    device: { tier: null, auto: true, frameMs: null },
  },
};

beforeEach(() => {
  fake = fakeClient();
  lib.state.client = fake;
  lib.createClient.mockClear();
  items = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  });
  vi.stubGlobal("window", { location: { origin: "https://game.example" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the sign-in service", () => {
  it("is left out of a build without the project's settings", async () => {
    const m = await load(false);
    expect(m.accountsBuiltIn).toBe(false);
    expect(await m.supabase()).toBeNull();
    expect(lib.createClient).not.toHaveBeenCalled();
  });

  it("makes one client, its session kept under SESSION_KEY, and tries again after a failed load", async () => {
    const m = await load();
    expect(m.accountsBuiltIn).toBe(true);
    lib.createClient.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    expect(await m.supabase()).toBeNull();
    expect(await m.supabase()).toBe(fake);
    expect(await m.supabase()).toBe(fake);
    expect(lib.createClient).toHaveBeenCalledTimes(2);
    expect(lib.createClient).toHaveBeenLastCalledWith("https://example.supabase.co", "anon", {
      auth: {
        storageKey: m.SESSION_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    });
  });

  it("checks an address loosely before asking for a link", async () => {
    const { looksLikeEmail } = await load();
    for (const ok of ["ada@example.com", "  ada@example.com ", "a.b+c@mail.example.co.uk"])
      expect(looksLikeEmail(ok)).toBe(true);
    for (const no of ["", "ada", "@example.com", "ada@", "ada@example", "ada@@example.com", "a@b@example.com"])
      expect(looksLikeEmail(no)).toBe(false);
    for (const no of ["ada lovelace@example.com", "ada@example.", "ada@.com", `${"a".repeat(243)}@example.com`])
      expect(looksLikeEmail(no)).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(242)}@example.com`)).toBe(true); // 254 characters
  });

  it("sends a link back to the game's own address", async () => {
    const m = await load();
    await m.sendLink("  ada@example.com ");
    expect(fake.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ada@example.com",
      options: { emailRedirectTo: "https://game.example/", shouldCreateUser: true },
    });
    expect(m.useAccount.getState()).toMatchObject({ link: "sent", sentTo: "ada@example.com" });
  });

  it("says what went wrong with a link: not an address, too many, refused, or not sent", async () => {
    const m = await load();
    await m.sendLink("not an address");
    expect(m.useAccount.getState().link).toBe("invalid");
    expect(lib.createClient).not.toHaveBeenCalled();

    fake.auth.signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { status: 429, code: "over_email_send_rate_limit" },
    });
    await m.sendLink("ada@example.com");
    expect(m.useAccount.getState().link).toBe("busy");

    fake.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: { status: 400, code: "email_address_invalid" } });
    await m.sendLink("ada@example.com");
    expect(m.useAccount.getState().link).toBe("invalid");

    fake.auth.signInWithOtp.mockRejectedValueOnce(new Error("offline"));
    await m.sendLink("ada@example.com");
    expect(m.useAccount.getState()).toMatchObject({ link: "failed", sentTo: null });
  });

  it("finishes a link: too old, broken, or a session made from its tokens", async () => {
    const m = await load();
    await m.finishSignIn({ kind: "error", code: "otp_expired" });
    expect(m.useAccount.getState().link).toBe("expired");
    await m.finishSignIn({ kind: "error", code: "access_denied" });
    expect(m.useAccount.getState().link).toBe("broken");
    expect(lib.createClient).not.toHaveBeenCalled(); // an error loads nothing

    m.useAccount.setState({ link: "idle" });
    await m.finishSignIn({ kind: "tokens", accessToken: "a1", refreshToken: "r1" });
    expect(fake.auth.setSession).toHaveBeenCalledWith({ access_token: "a1", refresh_token: "r1" });
    expect(m.useAccount.getState().link).toBe("idle"); // success is heard from the library

    fake.auth.setSession.mockResolvedValueOnce({ data: {}, error: { status: 403, code: "bad_jwt" } });
    await m.finishSignIn({ kind: "tokens", accessToken: "a1", refreshToken: "r1" });
    expect(m.useAccount.getState().link).toBe("broken");
  });

  it("follows what the library hears about the session", async () => {
    const m = await load();
    await m.supabase();
    fake.hear("SIGNED_IN", { user: { id: "u1", email: "ada@example.com" } });
    expect(m.useAccount.getState().account).toEqual(ada);
    fake.hear("SIGNED_OUT", null);
    expect(m.useAccount.getState().account).toBeNull();

    m.signedIn(ada);
    items.set(m.SESSION_KEY, "{}"); // a session it couldn't refresh offline is still kept
    fake.hear("INITIAL_SESSION", null);
    expect(m.useAccount.getState().account).toEqual(ada);
    items.delete(m.SESSION_KEY);
    fake.hear("INITIAL_SESSION", null);
    expect(m.useAccount.getState().account).toBeNull();
  });
});

describe("signing out", () => {
  it("forgets at once, even when the library can't sign out; then removes its session and drops its client", async () => {
    const m = await load();
    m.signedIn(ada);
    m.setLogs(true);
    items.set(m.SESSION_KEY, "{}");
    fake.auth.signOut.mockResolvedValueOnce({ error: { status: 0 } });
    const done = m.signOut();
    expect(m.useAccount.getState()).toMatchObject({ account: null, logsFor: null });
    await done;
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(fake.auth.stopAutoRefresh).toHaveBeenCalled();
    expect(items.has(m.SESSION_KEY)).toBe(false);
    await m.supabase();
    expect(lib.createClient).toHaveBeenCalledTimes(2); // a fresh client next time
  });

  it("isn't signed back in by the session being signed out, announced as the library loads", async () => {
    const m = await load();
    m.signedIn(ada);
    fake.auth.signOut.mockImplementationOnce(async () => {
      fake.hear("SIGNED_IN", { user: { id: "u1", email: "ada@example.com" } });
      fake.hear("SIGNED_OUT", null);
      return { error: null };
    });
    await m.signOut();
    expect(m.useAccount.getState().account).toBeNull();
    expect(fake.auth.stopAutoRefresh).not.toHaveBeenCalled();
    fake.hear("SIGNED_IN", { user: { id: "u1", email: "ada@example.com" } });
    expect(m.useAccount.getState().account).toEqual(ada); // a later sign-in is heard again
  });
});

describe("sending a play log", () => {
  it("maps the service's answer to sent, retry or drop", async () => {
    const { resultOf } = await load();
    const table: [number, string | null, string][] = [
      [201, null, "sent"],
      [204, null, "sent"],
      [409, "23505", "sent"],
      [0, "", "retry"],
      [401, "PGRST301", "retry"],
      [404, "PGRST205", "retry"],
      [408, null, "retry"],
      [429, null, "retry"],
      [500, null, "retry"],
      [503, null, "retry"],
      [400, "22P02", "drop"],
      [403, "42501", "drop"],
      [409, "23503", "drop"],
      [413, null, "drop"],
    ];
    for (const [status, code, result] of table)
      expect([status, code, resultOf(status, code)]).toEqual([status, code, result]);
  });

  it("sends only as the player it was recorded for", async () => {
    const m = await load();
    expect(await m.sendEntry(entry)).toBe("retry"); // no session
    fake.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u2" } } }, error: null });
    expect(await m.sendEntry(entry)).toBe("drop");
    expect(fake.insert).not.toHaveBeenCalled();
  });

  it("sends the row, and reads how it went", async () => {
    const m = await load();
    fake.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    expect(await m.sendEntry(entry)).toBe("sent");
    expect(fake.from).toHaveBeenCalledWith("play_logs");
    expect(fake.insert).toHaveBeenCalledWith({ id: "e1", user_id: "u1", room_id: "1.1", payload: entry.payload });

    fake.insert.mockResolvedValueOnce({ data: null, error: { code: "23505" }, status: 409 });
    expect(await m.sendEntry(entry)).toBe("sent");
    fake.insert.mockResolvedValueOnce({ data: null, error: { code: "" }, status: 0 });
    expect(await m.sendEntry(entry)).toBe("retry");
    fake.insert.mockResolvedValueOnce({ data: null, error: { code: "42501" }, status: 403 });
    expect(await m.sendEntry(entry)).toBe("drop");
    fake.insert.mockRejectedValueOnce(new Error("offline"));
    expect(await m.sendEntry(entry)).toBe("retry");
  });
});
