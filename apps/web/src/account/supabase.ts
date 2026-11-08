import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { type LinkState, signedIn, signedOut, useAccount } from "./account";
import type { LinkAnswer } from "./link";
import type { Entry, SendResult } from "./types";

// The optional sign-in service (Supabase): signing in by a link sent by email, and sending play logs
// (account/logs.ts). It's built in only when both of the project's settings are set (.env.example), and
// its library loads only when it's needed: to send a link, finish one, sign out, or send a play log. So
// the game never waits for it, and plays the same without it or offline: nothing here throws. Only the
// project's address and its public key are in the game; the table's own rules
// (supabase/migrations/0001_play_logs.sql) decide what a signed-in player may do.

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** True when this build has the sign-in service (both settings set). */
export const accountsBuiltIn = Boolean(url && key);

/** Where the library keeps its session in this browser. */
export const SESSION_KEY = "wirelight.auth";

let client: Promise<SupabaseClient | null> | null = null;

/**
 * Sign-outs under way. The session being signed out can still be announced meanwhile (when signing out
 * is what loads the library, it first finds the session kept here), and mustn't sign the player back in.
 */
let signingOut = 0;

/** Whether the library's session is still kept in this browser (none where storage is blocked). */
function sessionKept(): boolean {
  try {
    return (globalThis.localStorage?.getItem(SESSION_KEY) ?? null) !== null;
  } catch {
    return false;
  }
}

function forgetSession(): void {
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the library kept its session in memory, and that goes with its client.
  }
}

/** What the library says about the session. Kept synchronous: the library warns against awaiting it here. */
function heard(event: AuthChangeEvent, session: Session | null): void {
  try {
    const user = session?.user;
    if (user) {
      if (signingOut === 0) signedIn({ userId: user.id, email: user.email ?? "" });
    } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !sessionKept())) {
      // A session that couldn't be refreshed offline is still kept, so it isn't a sign-out.
      signedOut();
    }
  } catch {
    // The store has it; a listener failing isn't the library's business (it would take it for its own).
  }
}

async function open(): Promise<SupabaseClient | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const made = createClient(url, key, {
      auth: {
        storageKey: SESSION_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // A link's answer is read by hand as the page opens (account/link.ts), and gone from the address.
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    });
    made.auth.onAuthStateChange(heard);
    return made;
  } catch {
    return null; // offline (the library didn't load), or it couldn't be made
  }
}

/**
 * The sign-in service's client, made (and its library loaded) on first need. Null when it isn't built in,
 * or couldn't load: a failed try isn't kept, so the next call tries again (back online, say).
 */
export function supabase(): Promise<SupabaseClient | null> {
  if (!accountsBuiltIn) return Promise.resolve(null);
  if (!client) {
    const opening = open();
    client = opening;
    void opening.then((made) => {
      if (!made && client === opening) client = null;
    });
  }
  return client;
}

/** A loose check before asking for a link (the service has the last word): name@somewhere.tld, no spaces. */
export function looksLikeEmail(text: string): boolean {
  const email = text.trim();
  if (email.length > 254 || /\s/.test(email)) return false;
  const parts = email.split("@");
  const [name = "", domain = ""] = parts;
  return parts.length === 2 && name !== "" && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/** Why the service didn't send a link: too many asked for, an address it won't take, or anything else. */
function refused(status: number | undefined, code: string | undefined): LinkState {
  if (status === 429 || code?.startsWith("over_")) return "busy";
  if (code === "email_address_invalid" || code === "validation_failed") return "invalid";
  return "failed";
}

/** Asks for a sign-in link to be sent to `email` (Settings); `link` says how it went. */
export async function sendLink(email: string): Promise<void> {
  const to = email.trim();
  if (!looksLikeEmail(to)) {
    useAccount.setState({ link: "invalid" });
    return;
  }
  useAccount.setState({ link: "sending", sentTo: null });
  const made = await supabase();
  if (!made) {
    useAccount.setState({ link: "failed" });
    return;
  }
  try {
    const { error } = await made.auth.signInWithOtp({
      email: to,
      // The link comes back to the landing, which finishes signing in (account/link.ts).
      options: { emailRedirectTo: `${window.location.origin}/`, shouldCreateUser: true },
    });
    useAccount.setState(error ? { link: refused(error.status, error.code) } : { link: "sent", sentTo: to });
  } catch {
    useAccount.setState({ link: "failed" });
  }
}

/** Finishes signing in with a link's answer (account/link.ts). Success is heard from the library. */
export async function finishSignIn(answer: LinkAnswer): Promise<void> {
  if (answer.kind === "error") {
    useAccount.setState({ link: answer.code === "otp_expired" ? "expired" : "broken" });
    return;
  }
  const made = await supabase();
  if (!made) {
    useAccount.setState({ link: "broken" });
    return;
  }
  try {
    const { error } = await made.auth.setSession({
      access_token: answer.accessToken,
      refresh_token: answer.refreshToken,
    });
    if (error) useAccount.setState({ link: "broken" });
  } catch {
    useAccount.setState({ link: "broken" });
  }
}

async function signedOutThere(made: SupabaseClient): Promise<boolean> {
  try {
    return (await made.auth.signOut({ scope: "local" })).error === null;
  } catch {
    return false;
  }
}

/**
 * Signs out. The game forgets at once, so nothing more is sent; then the library signs out in this
 * browser. Where it can't (offline, say, it may keep its session), or didn't load, its session is removed
 * here and its client dropped, so the session can't come back by itself.
 */
export async function signOut(): Promise<void> {
  signedOut();
  signingOut += 1;
  try {
    const made = await supabase();
    if (made && (await signedOutThere(made))) return;
    if (made) {
      try {
        await made.auth.stopAutoRefresh();
      } catch {
        // Nothing more to stop.
      }
    }
    forgetSession();
    if (made) client = null; // the next call starts a fresh one
  } finally {
    signingOut -= 1;
  }
}

/**
 * How one try at sending a play log went, from the answer's HTTP status and Postgres error code: sent (or
 * already there: an earlier try got through); worth another try later (offline, the session out of date,
 * the table not made yet, a timeout, too many at once, the service failing); or never going to work
 * (refused by the table's rules, or a row it won't take).
 */
export function resultOf(status: number, code: string | null): SendResult {
  if ((status >= 200 && status < 300) || code === "23505") return "sent";
  if ([0, 401, 404, 408, 429].includes(status) || status >= 500) return "retry";
  return "drop";
}

/** Sends one play log (account/logs.ts), only ever as the player it was recorded for. Never throws. */
export async function sendEntry(entry: Entry): Promise<SendResult> {
  const made = await supabase();
  if (!made) return "retry";
  try {
    const { data } = await made.auth.getSession();
    const user = data.session?.user;
    if (!user) return "retry";
    // Recorded for someone else (another player has signed in since): never sent as this one.
    if (user.id !== entry.userId) return "drop";
    const { error, status } = await made
      .from("play_logs")
      .insert({ id: entry.id, user_id: entry.userId, room_id: entry.roomId, payload: entry.payload });
    return resultOf(status, error?.code ?? null);
  } catch {
    return "retry";
  }
}
