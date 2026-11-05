import { useEffect, useRef } from "react";
import { emptyLog, type RoomVisit, recordVisits, touch } from "../dev/playtest";
import { frameTimes } from "../render/frameTimes";
import type { Tier } from "../render/quality";
import { logsOn, useAccount } from "./account";
import { playLogs } from "./logs";
import { sendEntry } from "./supabase";
import type { Device } from "./types";

// The play logs at work (account/logs.ts), in the play page. Only while a signed-in player has switched
// them on: each room is recorded by the playtest log's own recorder (dev/playtest.ts) and its record is
// queued and sent once, when the room ends: when it's restored, or left unfinished (another room, or
// the page closing). A room already under way when the switch goes on is left out, so every record is a
// whole room. While the switch is off nothing is recorded at all.

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked: the queue lives in memory for this visit
  }
}

const logs = playLogs({
  consent: () => {
    const s = useAccount.getState();
    return { userId: s.account?.userId ?? null, on: logsOn(s) };
  },
  send: sendEntry,
  storage: browserStorage(),
  online: () => navigator.onLine !== false,
  later: (run, ms) => {
    const id = window.setTimeout(run, ms);
    return () => window.clearTimeout(id);
  },
  onQueue: (waiting) => useAccount.setState({ waiting }),
});

/** `tier` and `auto`: the graphics tier the palace is drawn at, and whether the game picked it (PlayPage). */
export function PlayLogs({ tier, auto }: { tier: Tier; auto: boolean }) {
  const on = useAccount(logsOn);
  const drawing = useRef({ tier, auto });
  drawing.current = { tier, auto };

  // As the game opens: a record kept by a page closed mid-room is queued; then the queue follows the
  // switch and the signed-in player (switching off or signing out forgets what wasn't sent).
  useEffect(() => {
    logs.start();
    const off = useAccount.subscribe((s, prev) => {
      if (logsOn(s) !== logsOn(prev) || s.account?.userId !== prev.account?.userId) logs.sync();
    });
    const online = () => void logs.flush();
    window.addEventListener("online", online);
    return () => {
      off();
      window.removeEventListener("online", online);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    const device = (): Device => ({ ...drawing.current, frameMs: frameTimes.median() });
    const done = new WeakSet<RoomVisit>();
    const finish = (v: RoomVisit) => {
      if (done.has(v)) return;
      done.add(v);
      logs.ended(v, device());
    };
    const rec = recordVisits(
      emptyLog(new Date()),
      {
        started: () => frameTimes.clear(),
        won: (v) => {
          touch(v, new Date());
          finish(v);
        },
        ended: finish,
      },
      { skipOpenRoom: true },
    );
    // The page going out of sight may be its end: keep the room's record so far, sent next time if
    // this page never comes back (and replaced by the full record if it does and the room ends here).
    const keep = () => {
      const v = rec.visit();
      if (!v || done.has(v)) return;
      touch(v, new Date());
      logs.keep(v, device());
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") keep();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", keep);
    return () => {
      rec.stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", keep);
    };
  }, [on]);

  return null;
}
