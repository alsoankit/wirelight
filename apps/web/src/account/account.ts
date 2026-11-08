import { create } from "zustand";

// Who is signed in (account/supabase.ts), and whose play logs are switched on (account/logs.ts). Both are
// kept in this browser, so the game knows them as it opens, before the sign-in service has loaded (it
// loads only when it's needed). The switch is each person's own and starts off: it can be switched on
// only while signed in, and signing out, or someone else signing in here, finds it off.

export type Account = { userId: string; email: string };

/**
 * What's kept in this browser: who is signed in, and whose play logs are switched on (each person's own
 * switch, off at first).
 */
export type Saved = { account: Account | null; logsFor: string | null };

/**
 * Asking for a sign-in link, or finishing one: nothing yet; sending; sent (to `sentTo`); not an address
 * (or one the service won't take); too many asked for just now; couldn't be sent (offline, say); and for
 * a link opened: too old (or used already), or one that couldn't sign in.
 */
export type LinkState = "idle" | "sending" | "sent" | "invalid" | "busy" | "failed" | "expired" | "broken";

export type AccountState = Saved & {
  link: LinkState;
  /** Where the last link went (shown while `link` is "sent"). */
  sentTo: string | null;
  /** Play logs waiting to be sent (account/logs.ts). */
  waiting: number;
};

export const ACCOUNT_KEY = "wirelight.account";

/** True when the signed-in player has switched their play logs on. */
export function logsOn(s: Saved): boolean {
  return s.account !== null && s.logsFor === s.account.userId;
}

/** This browser's storage, or null where there's none (reading it throws where it's blocked). */
function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function asAccount(x: unknown): Account | null {
  if (typeof x !== "object" || x === null) return null;
  const { userId, email } = x as { userId?: unknown; email?: unknown };
  if (typeof userId !== "string" || userId === "") return null;
  return { userId, email: typeof email === "string" ? email : "" };
}

/** What this browser kept: nobody signed in when there's nothing, it's unreadable, or storage is blocked. */
export function readSaved(storage: Pick<Storage, "getItem"> | null = browserStorage()): Saved {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(ACCOUNT_KEY) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      const { account, logsFor } = saved as { account?: unknown; logsFor?: unknown };
      const who = asAccount(account);
      // The switch belongs to whoever is signed in: one kept for anyone else is off.
      if (who) return { account: who, logsFor: logsFor === who.userId ? who.userId : null };
    }
  } catch {
    // Storage blocked or the saved value unreadable: nobody is signed in.
  }
  return { account: null, logsFor: null };
}

export const useAccount = create<AccountState>(() => ({ ...readSaved(), link: "idle", sentTo: null, waiting: 0 }));

// Who is signed in and the switch are written back whenever either changes; the rest is for this visit.
useAccount.subscribe((s, prev) => {
  if (s.account === prev.account && s.logsFor === prev.logsFor) return;
  try {
    browserStorage()?.setItem(ACCOUNT_KEY, JSON.stringify({ account: s.account, logsFor: s.logsFor }));
  } catch {
    // Storage full or blocked: the game still knows for this visit.
  }
});

/** Switches the signed-in player's play logs on or off (it stays off while nobody is signed in). */
export function setLogs(on: boolean): void {
  useAccount.setState((s) => ({ logsFor: on && s.account ? s.account.userId : null }));
}

/** Someone signed in (account/supabase.ts): their own switch is kept, so anyone else finds it off. */
export function signedIn(account: Account): void {
  useAccount.setState((s) => {
    // The same person again (as each session refresh says) keeps the same object, so nothing redraws.
    const same = s.account !== null && s.account.userId === account.userId && s.account.email === account.email;
    return {
      account: same ? s.account : { userId: account.userId, email: account.email },
      logsFor: s.logsFor === account.userId ? s.logsFor : null,
      link: "idle",
      sentTo: null,
    };
  });
}

/** Signed out: the game forgets who it was and the switch, so signing in again finds it off. */
export function signedOut(): void {
  useAccount.setState({ account: null, logsFor: null });
}
