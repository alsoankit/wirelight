import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { ScannerLayer, ScannerOpen } from "@wirelight/sim";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../engine/store";
import { KeeperPanel } from "./KeeperPanel";
import { noteMoment } from "./momentRules";
import { arrivalText, plainSummary, sayDoor } from "./names";
import { ScannerPanel } from "./ScannerPanel";

/** One empty list, so selectors return the same value when there's nothing (no render loop). */
const NONE: never[] = [];

// The robot's tools as panels (UI-03): the workbench (CORE-34), the messenger's card (CORE-35) and
// Captures (CORE-19, CORE-20). Every action runs a real command or a catch through the engine;
// acting closes the panel so the player watches what happens (UI-04); drafts are kept while closed.

const draft = { to: "", msg: "hello", dev: "" };

function useRoom() {
  const roomId = useSession((s) => s.roomId);
  return roomId ? roomById(roomId) : undefined;
}

function WorkbenchPanel() {
  const room = useRoom();
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const repeating = useSession((s) => s.status?.repeatingSends ?? NONE);
  const [to, setTo] = useState(draft.to);
  const [msg, setMsg] = useState(draft.msg);
  const [dev, setDev] = useState(draft.dev);
  const [refused, setRefused] = useState(false);
  if (!room) return null;
  const doors = room.topology.devices.find((d) => d.id === room.playerDevice)?.interfaces.map((i) => i.name) ?? [];
  const send = (repeat = false) => {
    Object.assign(draft, { to, msg, dev });
    const text = msg.replaceAll('"', "'");
    const line = `lab send-frame${dev ? ` --dev ${dev}` : ""}${to.trim() ? ` --to ${to.trim()}` : ""} --msg "${text}"${repeat ? " --repeat" : ""}`;
    void exec(room.playerDevice, line, "click");
    // The bench refuses a frame with no name to go to (the command fails, and says so).
    if (!to.trim()) return setRefused(true);
    if (!repeat) close();
  };
  const broadcastTaught =
    room.region > 1 || room.floor > 2 || (room.region === 1 && room.floor === 2 && room.order >= 3);
  return (
    <section className="panel" aria-label={voice.workbench.title}>
      <h2>{voice.workbench.title}</h2>
      <p>{voice.workbench.about}</p>
      <label className="field">
        <span>{voice.workbench.to}</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="02:00:00:00:00:00" spellCheck={false} />
      </label>
      {broadcastTaught && (
        <button type="button" className="quiet" onClick={() => setTo("ff:ff:ff:ff:ff:ff")}>
          {voice.workbench.broadcast}
        </button>
      )}
      {doors.length > 1 && (
        <label className="field">
          <span>{voice.workbench.door}</span>
          <select value={dev || doors[0]} onChange={(e) => setDev(e.target.value)}>
            {doors.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>{voice.workbench.message}</span>
        <input
          value={msg}
          onChange={(e) => {
            setMsg(e.target.value);
            if (e.target.value.trim()) noteMoment("workbench-message");
          }}
        />
      </label>
      {refused && <p className="panel-note">{voice.workbench.refused}</p>}
      <div className="panel-actions">
        <button type="button" onClick={() => send()}>
          {voice.workbench.send}
        </button>
        <button type="button" onClick={() => send(true)}>
          {voice.workbench.repeat}
        </button>
        <button type="button" className="quiet" onClick={close}>
          {voice.captures.close}
        </button>
      </div>
      {repeating.length > 0 && (
        <ul className="repeat-sends" aria-label={voice.workbench.running}>
          {repeating.map((item) => (
            <li key={item.id}>
              <span>{`${item.id}: ${item.to} · ${item.dev ?? doors[0]}`}</span>
              <button
                type="button"
                className="quiet"
                onClick={() => void exec(room.playerDevice, `lab send-frame --stop ${item.id}`, "click")}
              >
                {voice.workbench.stop}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A catch, as Captures shows it before the Scanner (Floor 6): the frame's *to* and *from* in plain words,
 * then its message if it's a plain lab message, or one note that there's more inside, sealed. No
 * ethertypes, no tcpdump text: those come with the Scanner.
 */
function Opened({ layers }: { layers: ScannerLayer[] }) {
  const room = useRoom();
  const frame = layers.find((l) => l.layer === "frame");
  const lab = layers.find((l) => l.layer === "message" && l.kind === "lab");
  const sealed = !lab && layers.some((l) => l.layer !== "frame");
  return (
    <>
      {frame?.layer === "frame" && (
        <dl className="catch-layer">
          <dt>{voice.captures.frame}</dt>
          <dd>
            {voice.captures.to} <code>{sayDoor(frame.to, room)}</code>
          </dd>
          <dd>
            {voice.captures.from} <code>{sayDoor(frame.from, room)}</code>
          </dd>
        </dl>
      )}
      {lab?.layer === "message" && lab.kind === "lab" && (
        <dl className="catch-layer">
          <dt>{voice.captures.message}</dt>
          <dd>{lab.text}</dd>
        </dl>
      )}
      {sealed && <p className="panel-note">{voice.captures.sealed}</p>}
    </>
  );
}

/**
 * What reached the player's own doors lately (one line per door): an answer can be read here even if
 * it wasn't caught in flight. With how many arrived, and how many of them the door ignored.
 */
function Arrived() {
  const room = useRoom();
  const here = useSession((s) => s.here);
  const arrivals = useSession((s) => s.arrivals);
  if (!room || !here) return null;
  const doors = room.topology.devices.find((d) => d.id === here)?.interfaces.map((i) => i.name) ?? [];
  const rows = doors.flatMap((door) => {
    const a = arrivals[`${here}:${door}`];
    return a ? [{ door, a }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <>
      <h3 className="panel-sub">{fill(voice.arrived.title, { machine: here })}</h3>
      <ul className="arrived-list">
        {rows.map(({ door, a }) => (
          <li key={door}>
            <span className="arrived-door">{door}</span> {arrivalText(a.bytes, room)}
            <span className="arrived-count">
              {" "}
              · {fill(a.count === 1 ? voice.arrived.countOne : voice.arrived.count, { n: String(a.count) })}
              {a.ignored > 0 && `, ${fill(voice.arrived.ignored, { n: String(a.ignored) })}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Catching by keyboard (UI-18): the messages crossing this room's doors right now, each with a
 * button that catches a copy, as clicking it in the room does. Pausing time (Space) holds them still.
 */
function Moving() {
  const here = useSession((s) => s.here);
  const onCables = useSession((s) => s.onCables);
  const catchFrame = useSession((s) => s.catchFrame);
  const room = useRoom();
  const moving = onCables.filter((c) => c.from === here || c.to === here);
  if (moving.length === 0) return null;
  return (
    <>
      <h3 className="panel-sub">{voice.captures.moving}</h3>
      <ul className="catch-list">
        {moving.map((c) => (
          <li key={c.frameId}>
            <button type="button" onClick={() => void catchFrame(c.frameId)}>
              {voice.captures.catchThis}: {plainSummary(c.bytes, room)}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CapturesPanel({ open }: { open?: number }) {
  const room = useRoom();
  const here = useSession((s) => s.here);
  const captures = useSession((s) => s.captures);
  const openCatch = useSession((s) => s.openCatch);
  const openPanel = useSession((s) => s.openPanel);
  const close = useSession((s) => s.closePanel);
  const [shown, setShown] = useState<ScannerOpen | null>(null);
  useEffect(() => {
    if (!open || !here) return setShown(null);
    // Before the Scanner (Floor 6), Captures opens the frame; a lab message inside is plain to read.
    void openCatch(here, open, "message").then(setShown);
  }, [open, here, openCatch]);
  if (!room) return null;
  return (
    <section className="panel" aria-label={voice.captures.title}>
      <h2>{voice.captures.title}</h2>
      {captures.length === 0 && <p>{voice.captures.empty}</p>}
      {room.controls.catching && <Moving />}
      <Arrived />
      <ol className="catch-list">
        {captures.map((c) => (
          <li key={c.n}>
            <button
              type="button"
              data-open={c.n === open ? "yes" : "no"}
              aria-pressed={c.n === open}
              onClick={() => openPanel({ kind: "captures", open: c.n })}
            >
              {c.n}. {(c.t / 1000).toFixed(1)} s · {c.device} {c.iface}
            </button>
          </li>
        ))}
      </ol>
      {shown?.ok && <Opened layers={shown.layers} />}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.captures.close}
        </button>
      </div>
    </section>
  );
}

/** The MAC board (CORE-27): what `bridge fdb show` printed when it was read, or clouded glass. */
function BoardPanel({
  device,
  board,
  execId,
}: {
  device: string;
  board: "mac" | "ledger" | "routes";
  execId?: number;
}) {
  const events = useSession((s) => s.events);
  // Filtered here, not in the selector: a selector must return the same value for the same state.
  const lines = useMemo(
    () =>
      execId === undefined
        ? NONE
        : events.filter((e) => e.kind === "proc.output" && e.execId === execId && e.stream === "stdout"),
    [events, execId],
  );
  const close = useSession((s) => s.closePanel);
  return (
    <section className="panel" aria-label={board === "mac" ? voice.board.title : voice.ledger.title}>
      <h2>
        {board === "mac" ? voice.board.title : voice.ledger.title} · {device}
      </h2>
      {execId === undefined ? (
        <p className="panel-note">{voice.board.clouded}</p>
      ) : (
        <>
          <p>{board === "mac" ? voice.board.about : voice.ledger.about}</p>
          <pre className="cmd-output board-output">
            {lines.map((e, i) => {
              const text = e.kind === "proc.output" ? e.text : "";
              // The hall's own door names (`permanent`) are dimmed: they aren't learned (CMD-02).
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the board's lines, in order
                <span key={i} className={/\bpermanent\b/.test(text) ? "board-permanent" : undefined}>
                  {text}
                  {"\n"}
                </span>
              );
            })}
          </pre>
        </>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.board.close}
        </button>
      </div>
    </section>
  );
}

/**
 * A routing board (CORE-27): read when it works (`ip route show`, its real output) and a line can be
 * added (8.2: `ip route add default via <gateway>`); cracked from 8.3, it can still be read, but no
 * command runs for it (0040), so its lines come from the machine's state.
 */
function RoutesPanel({ device, execId }: { device: string; execId?: number }) {
  const events = useSession((s) => s.events);
  const routes = useSession((s) => s.status?.routes[device] ?? NONE);
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const [via, setVia] = useState("");
  const output = useMemo(
    () =>
      execId === undefined
        ? NONE
        : events
            .filter((e) => e.kind === "proc.output" && e.execId === execId && e.stream === "stdout")
            .map((e) => (e.kind === "proc.output" ? e.text : "")),
    [events, execId],
  );
  const works = execId !== undefined;
  return (
    <section className="panel" aria-label={voice.routes.title}>
      <h2>
        {voice.routes.title} · {device}
      </h2>
      <p>{voice.routes.about}</p>
      <pre className="cmd-output board-output">
        {works
          ? output.join("\n")
          : routes
              .map((r) => `${r.dst}${r.via ? ` ${voice.routes.via} ${r.via}` : ""} · ${voice.routes.door} ${r.dev}`)
              .join("\n")}
      </pre>
      {works ? (
        <form
          className="addr-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!via.trim()) return;
            close();
            void exec(device, `ip route add default via ${via.trim()}`, "click");
          }}
        >
          <span className="panel-note">{voice.routes.addDefault}</span>
          <input
            aria-label={voice.routes.addDefault}
            value={via}
            onChange={(e) => setVia(e.target.value)}
            placeholder="10.0.1.1"
            spellCheck={false}
          />
          <button type="submit">{voice.routes.add}</button>
        </form>
      ) : (
        <p className="panel-note">{voice.routes.cracked}</p>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.captures.close}
        </button>
      </div>
    </section>
  );
}

/** What a machine's ledger (neighbour table) says, read from the trace: address → door name, or asking. */
function useLedger(device: string): { ip: string; mac: string | null }[] {
  const events = useSession((s) => s.events);
  return useMemo(() => {
    const out = new Map<string, string | null>();
    for (const e of events)
      if (e.kind === "table.change" && e.table === "neigh" && e.device === device) {
        const ip = e.key.split(" ")[0] ?? e.key;
        const after = e.after as { mac?: string | null } | null;
        if (e.op === "del" || !after) out.delete(ip);
        else out.set(ip, after.mac ?? out.get(ip) ?? null);
      }
    return [...out].map(([ip, mac]) => ({ ip, mac }));
  }, [events, device]);
}

/** A keeper's desk in hand mode (0042): the waiting message, then the keeper's steps by hand. */
function DeskPanel({ device }: { device: string }) {
  const room = useRoom();
  const desk = useSession((s) => s.status?.desks[device]);
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const doors = room?.topology.devices.find((d) => d.id === device)?.interfaces.map((i) => i.name) ?? [];
  const [out, setOut] = useState("flood");
  const [mac, setMac] = useState("");
  const [countdown, setCountdown] = useState(false);
  const ledger = useLedger(device);
  const first = desk?.waiting[0];
  // Each send starts the next choice afresh: nothing carries over to the next frame.
  const act = (line: string, fresh = false) => {
    if (fresh) {
      setOut("flood");
      setMac("");
      setCountdown(false);
    }
    void exec(device, line, "click");
  };
  // Identical waiting lines (the same frame again) are shown once, counted.
  const lines: { text: string; n: number }[] = [];
  for (const w of desk?.waiting ?? []) {
    const text = fill(desk?.desk === "switch" ? voice.desk.frame : voice.desk.packet, {
      from: w.from,
      to: w.to,
      door: w.door,
    });
    const last = lines.at(-1);
    // The first line is the one being worked on: never folded into the ones behind it.
    if (last && lines.length > 1 && last.text === text) last.n++;
    else lines.push({ text, n: 1 });
  }
  const router = desk?.desk === "router";
  const kind = router ? voice.desk.lectern : voice.desk;
  return (
    <section className="panel desk-panel" aria-label={router ? voice.desk.lectern.title : voice.desk.title}>
      <h2>
        {router ? voice.desk.lectern.title : voice.desk.title} · {device}
      </h2>
      {!desk ? (
        <p>{kind.awake}</p>
      ) : (
        <>
          <p className="panel-note">{kind.asleep}</p>
          {desk.waiting.length === 0 && <p>{voice.desk.empty}</p>}
          <ol className="catch-list desk-queue">
            {lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the desk's queue, in order
              <li key={i} data-current={i === 0 ? "yes" : "no"}>
                {l.text}
                {l.n > 1 && <span className="panel-note"> {fill(voice.desk.times, { n: String(l.n) })}</span>}
                {i === 0 && <span className="desk-now"> ← {voice.desk.now}</span>}
              </li>
            ))}
          </ol>
          {first && desk.desk !== "switch" && (
            <>
              <div className="panel-actions">
                <button type="button" onClick={() => act(`lab keeper arp-ask ${first.to}`)}>
                  {fill(voice.desk.ask, { to: first.to })}
                </button>
              </div>
              <div className="desk-ledger">
                <h3 className="panel-sub">{voice.desk.ledger}</h3>
                {ledger.length === 0 && <p className="panel-note">{voice.desk.ledgerEmpty}</p>}
                <ul className="arrived-list">
                  {ledger.map((l) => (
                    <li key={l.ip}>
                      {l.mac ? (
                        <>
                          {fill(voice.desk.ledgerAt, { ip: l.ip, mac: l.mac })}{" "}
                          <button type="button" className="link inline" onClick={() => setMac(l.mac ?? "")}>
                            {voice.desk.pick}
                          </button>
                        </>
                      ) : (
                        <span className="panel-note">{fill(voice.desk.ledgerAsking, { ip: l.ip })}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {router && (
                <label className="radio">
                  <input type="checkbox" checked={countdown} onChange={(e) => setCountdown(e.target.checked)} />
                  {voice.desk.countdown}
                </label>
              )}
              <div className="desk-wrap">
                <label className="field">
                  <span>{router ? voice.desk.wrapSend : voice.desk.wrap}</span>
                  <input
                    value={mac}
                    onChange={(e) => setMac(e.target.value)}
                    placeholder="02:00:00:00:00:00"
                    spellCheck={false}
                  />
                </label>
                <button
                  type="button"
                  disabled={!mac.trim()}
                  onClick={() => act(`lab keeper ${router && countdown ? "forward" : "wrap"} ${mac.trim()}`, true)}
                >
                  {voice.desk.go}
                </button>
              </div>
            </>
          )}
          {first && desk.desk === "switch" && (
            <div className="panel-actions">
              <button type="button" onClick={() => act(`lab keeper learn ${first.from} ${first.door}`)}>
                {fill(voice.desk.learn, { from: first.from, door: first.door })}
              </button>
              <label className="field inline">
                <span>{voice.desk.sendOut}</span>
                <select value={out} onChange={(e) => setOut(e.target.value)}>
                  <option value="flood">{voice.desk.everyOther}</option>
                  {doors.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => act(`lab keeper send ${out}`, true)}>
                {voice.desk.send}
              </button>
            </div>
          )}
        </>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.desk.close}
        </button>
      </div>
    </section>
  );
}

/** The Captures button (bottom left, UI layout): how many catches, and opens Captures. */
export function CapturesButton() {
  const room = useRoom();
  const count = useSession((s) => s.captures.length);
  // Never under the open console (UI-02): it rises above it.
  const raised = useSession((s) => s.consoleOpen && s.voiceGiven);
  const openPanel = useSession((s) => s.openPanel);
  // From Floor 6 the Scanner replaces Captures (0043).
  if (room?.controls.scanner)
    return (
      <button
        type="button"
        className="captures-button"
        data-raised={raised ? "yes" : "no"}
        onClick={() => openPanel({ kind: "scanner" })}
      >
        {voice.scanner.name} · {count}
      </button>
    );
  if (!room?.controls.catching) return null;
  return (
    <button
      type="button"
      className="captures-button"
      data-raised={raised ? "yes" : "no"}
      onClick={() => openPanel({ kind: "captures" })}
    >
      {voice.captures.name} · {count}
    </button>
  );
}

export function ToolPanels() {
  const panel = useSession((s) => s.panel);
  if (panel?.kind === "workbench") return <WorkbenchPanel />;
  if (panel?.kind === "captures") return <CapturesPanel open={panel.open} />;
  if (panel?.kind === "board" && panel.board === "routes")
    return <RoutesPanel device={panel.device} execId={panel.execId} />;
  if (panel?.kind === "board") return <BoardPanel device={panel.device} board={panel.board} execId={panel.execId} />;
  if (panel?.kind === "desk") return <DeskPanel device={panel.device} />;
  if (panel?.kind === "scanner") return <ScannerPanel />;
  if (panel?.kind === "keeper") return <KeeperPanel device={panel.device} />;
  return null;
}
