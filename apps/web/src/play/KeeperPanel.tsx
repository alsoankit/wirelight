import { type DropReason, fill, keeperSays, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { useEffect, useMemo, useState } from "react";
import { ask, useSession } from "../engine/store";
import { messageSummary } from "../world/messageKind";

// Asking the keeper why (CORE-25): what it handled lately, and for each one, in plain words, exactly
// what it did and the table line it used. Once the matching command is unlocked, asking also runs it
// in the console (`ip route get …`, `bridge fdb show | grep …`). Keepers never lie and never fix.

type Decision = Extract<SimEvent, { kind: "fwd.decision" }>;

export function KeeperPanel({ device }: { device: string }) {
  const events = useSession((s) => s.events);
  const floor = useSession((s) => (s.roomId ? (roomById(s.roomId)?.floor ?? 0) : 0));
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const [picked, setPicked] = useState<number | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  useEffect(() => {
    void ask.tools().then(setTools);
  }, []);

  // The latest decisions here, newest first, each with its frame's bytes and why it was let go.
  const recent = useMemo(() => {
    const bytes = new Map<number, Uint8Array>();
    const reason = new Map<number, DropReason>();
    const out: Decision[] = [];
    for (const e of events) {
      if (e.kind === "link.enter") bytes.set(e.frameId, e.bytes);
      if (e.kind === "frame.drop" && e.device === device) reason.set(e.frameId, e.reason as DropReason);
      if (e.kind === "fwd.decision" && e.device === device) out.push(e);
    }
    return out
      .slice(-8)
      .reverse()
      .map((d) => ({ d, bytes: bytes.get(d.frameId), reason: reason.get(d.frameId) }));
  }, [events, device]);

  const chosen = recent.find((r) => r.d.frameId === picked) ?? recent[0];
  const command = chosen
    ? chosen.d.layer === "l3" && chosen.d.tableRef.ip && tools.includes("ip route")
      ? `ip route get ${chosen.d.tableRef.ip}`
      : chosen.d.layer === "l2" && chosen.d.tableRef.fdb !== undefined && tools.includes("bridge fdb")
        ? `bridge fdb show | grep ${chosen.d.tableRef.dst}`
        : null
    : null;

  return (
    <section className="panel" aria-label={voice.keeper.title}>
      <h2>
        {voice.keeper.title} · {device}
      </h2>
      <p className="panel-note">{voice.keeper.about}</p>
      {recent.length === 0 && <p>{voice.keeper.idle}</p>}
      <ol className="catch-list">
        {recent.map(({ d, bytes }) => (
          <li key={`${d.frameId}-${d.t}`}>
            <button
              type="button"
              data-open={chosen?.d === d ? "yes" : "no"}
              aria-pressed={chosen?.d === d}
              onClick={() => setPicked(d.frameId)}
            >
              {fill(voice.keeper.item, {
                time: (d.t / 1000).toFixed(1),
                what: bytes ? messageSummary(bytes, floor) : d.tableRef.dst,
              })}
            </button>
          </li>
        ))}
      </ol>
      {chosen && (
        <p className="note" aria-live="polite">
          {keeperSays(chosen.d, chosen.reason)}
        </p>
      )}
      <div className="panel-actions">
        {command && (
          <button type="button" onClick={() => void exec(device, command, "click")}>
            {voice.keeper.askMachine}: <code>{command}</code>
          </button>
        )}
        <button type="button" className="quiet" onClick={close}>
          {voice.keeper.close}
        </button>
      </div>
    </section>
  );
}
