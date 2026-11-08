import { describe, expect, it, vi } from "vitest";
import { takeLinkAnswer } from "../src/account/link";

/** A page opened at `pathname` + `search` + `hash`, with a history that records what replaces the address. */
function opened(pathname: string, search = "", hash = "") {
  const history = { state: { from: "landing" }, replaceState: vi.fn() };
  return { loc: { pathname, search, hash }, history };
}

describe("a sign-in link's answer", () => {
  it("takes the tokens from the hash, and out of the address, keeping the game's own options", () => {
    const { loc, history } = opened(
      "/play",
      "?room=x",
      "#access_token=a1&expires_at=1&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink",
    );
    expect(takeLinkAnswer(loc, history)).toEqual({ kind: "tokens", accessToken: "a1", refreshToken: "r1" });
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledWith({ from: "landing" }, "", "/play?room=x");
  });

  it("reads an expired link's error from the hash", () => {
    const { loc, history } = opened(
      "/",
      "",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(takeLinkAnswer(loc, history)).toEqual({ kind: "error", code: "otp_expired" });
    expect(history.replaceState).toHaveBeenCalledWith({ from: "landing" }, "", "/");
  });

  it("reads an error from the query too, taking it out and keeping the rest exactly", () => {
    const { loc, history } = opened("/", "?room=a%20b&error=access_denied&error_description=Gone&tier=low");
    expect(takeLinkAnswer(loc, history)).toEqual({ kind: "error", code: "access_denied" });
    expect(history.replaceState).toHaveBeenCalledWith({ from: "landing" }, "", "/?room=a%20b&tier=low");
  });

  it("calls an error with no name unknown", () => {
    const { loc, history } = opened("/", "", "#error_description=Something+went+wrong");
    expect(takeLinkAnswer(loc, history)).toEqual({ kind: "error", code: "unknown" });
  });

  it("wants both tokens: one alone is no answer, but is still taken out of the address", () => {
    const { loc, history } = opened("/play", "?room=x", "#access_token=a1&expires_in=3600");
    expect(takeLinkAnswer(loc, history)).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith({ from: "landing" }, "", "/play?room=x");
  });

  it("leaves an address with nothing of a sign-in in it alone", () => {
    for (const [search, hash] of [
      ["", ""],
      ["?room=x&playtest=1", ""],
      ["?room=x", "#somewhere"],
      ["", "#type=whatever&expires_in=3"],
    ] as const) {
      const { loc, history } = opened("/play", search, hash);
      expect(takeLinkAnswer(loc, history)).toBeNull();
      expect(history.replaceState).not.toHaveBeenCalled();
    }
  });

  it("still answers when the browser refuses to change the address", () => {
    const { loc, history } = opened("/", "", "#access_token=a1&refresh_token=r1");
    history.replaceState.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(takeLinkAnswer(loc, history)).toEqual({ kind: "tokens", accessToken: "a1", refreshToken: "r1" });
  });
});
