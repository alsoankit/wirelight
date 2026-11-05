// The answer a sign-in link brings back (account/supabase.ts finishes signing in with it). The link opens
// the game with it after `#` in the address (the sign-in service's implicit flow): the session's tokens,
// or why it couldn't sign in (which the service may put in the query instead). It's read by hand as the
// page opens, before anything can change the address (the landing pushing /play, say, which drops the
// part after `#`), and taken out of the address at once, so the tokens never stay in the address bar,
// the history, or a link the player copies from there.

export type LinkAnswer =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; code: string };

/** What a sign-in link adds to the query, all taken out again (the part after `#` goes whole). */
const LINK_PARAMS = new Set([
  "access_token",
  "refresh_token",
  "expires_in",
  "expires_at",
  "token_type",
  "type",
  "provider_token",
  "provider_refresh_token",
  "error",
  "error_code",
  "error_description",
]);

const ERROR_PARAMS = ["error", "error_code", "error_description"];
const TOKEN_PARAMS = ["access_token", "refresh_token"];

function answerIn(hash: URLSearchParams, query: URLSearchParams): LinkAnswer | null {
  const has = (name: string) => hash.has(name) || query.has(name);
  // An empty value counts as none, so the code falls back to the next.
  const value = (name: string) => hash.get(name) || query.get(name) || null;
  // An error wins over tokens, as in the service's own library.
  if (ERROR_PARAMS.some(has)) return { kind: "error", code: value("error_code") ?? value("error") ?? "unknown" };
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  return accessToken && refreshToken ? { kind: "tokens", accessToken, refreshToken } : null;
}

/** The query without what the link added, every other option exactly as it was (`?room=x`). */
function gameOptions(search: string): string {
  const kept = search
    .replace(/^\?/, "")
    .split("&")
    .filter((pair) => {
      if (pair === "") return false;
      const [name] = [...new URLSearchParams(pair).keys()];
      return name === undefined || !LINK_PARAMS.has(name);
    });
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

/**
 * Takes a sign-in link's answer from the address, if it has one, and leaves the address without it: the
 * path and the game's own options stay, the part after `#` goes. A token that came without the other is
 * no answer, but is taken out all the same. Null, and the address left alone, when nothing in it is a
 * sign-in's.
 */
export function takeLinkAnswer(
  loc: Pick<Location, "pathname" | "search" | "hash">,
  history: Pick<History, "state" | "replaceState">,
): LinkAnswer | null {
  const hash = new URLSearchParams(loc.hash.replace(/^#/, ""));
  const query = new URLSearchParams(loc.search);
  const answer = answerIn(hash, query);
  if (!answer && !TOKEN_PARAMS.some((name) => hash.has(name) || query.has(name))) return null;
  try {
    history.replaceState(history.state, "", loc.pathname + gameOptions(loc.search));
  } catch {
    // The browser refused (too many changes at once, say): the answer still signs in.
  }
  return answer;
}
