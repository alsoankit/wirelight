import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { SlateLayer, SlateOpen } from "@wirelight/sim";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../engine/store";
import { SlatePanel } from "./SlatePanel";

/** One empty list, so selectors return the same value when there's nothing (no render loop). */
const NONE: never[] = [];

// The Knight's tools as panels (UI-03): the workbench (CORE-34), the messenger's card (CORE-35) and
// the capture jar (CORE-19, CORE-20). Every action runs a real command or a catch through the engine;
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
  const [to, setTo] = useState(draft.to);
  const [msg, setMsg] = useState(draft.msg);
  const [dev, setDev] = useState(draft.dev);
  const [refused, setRefused] = useState(false);
  if (!room) return null;
  const doors = room.topology.devices.find((d) => d.id === room.playerDevice)?.interfaces.map((i) => i.name) ?? [];
  const send = () => {
    Object.assign(draft, { to, msg, dev });
    const text = msg.replaceAll('"', "'");
    const line = `lab send-frame${dev ? ` --dev ${dev}` : ""}${to.trim() ? ` --to ${to.trim()}` : ""} --msg "${text}"`;
    void exec(room.playerDevice, line, "click");
    // The bench refuses a frame with no name to go to (the command fails, and says so).
    if (!to.trim()) return setRefused(true);
    close();
  };
  return (
    <section className="panel" aria-label={voice.workbench.title}>
      <h2>{voice.workbench.title}</h2>
      <p>{voice.workbench.about}</p>
      <label className="field">
        <span>{voice.workbench.to}</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="02:00:00:00:00:00" spellCheck={false} />
      </label>
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
        <input value={msg} onChange={(e) => setMsg(e.target.value)} />
      </label>
      {refused && <p className="panel-note">{voice.workbench.refused}</p>}
      <div className="panel-actions">
        <button type="button" onClick={send}>
          {voice.workbench.send}
        </button>
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
    </section>
  );
}

function CardPanel() {
  const room = useRoom();
  const cards = useSession((s) => (room ? (s.status?.cards[room.playerDevice] ?? NONE) : NONE));
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const [values, setValues] = useState<string[]>(cards);
  if (!room) return null;
  const write = (i: number) => {
    const line =
      cards.length > 1
        ? `lab card --messenger ${i + 1} --to ${values[i]?.trim()}`
        : `lab card --to ${values[i]?.trim()}`;
    close();
    void exec(room.playerDevice, line, "click");
  };
  return (
    <section className="panel" aria-label={voice.card.title}>
      <h2>{voice.card.title}</h2>
      <p>{voice.card.about}</p>
      {cards.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the cards are numbered by their place on the desk
        <div key={i} className="field">
          <span>{cards.length > 1 ? fill(voice.card.numbered, { n: String(i + 1) }) : voice.card.name}</span>
          <input
            value={values[i] ?? ""}
            placeholder={c || voice.card.blank}
            onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
            spellCheck={false}
          />
          <div className="panel-actions">
            <button type="button" onClick={() => write(i)} disabled={!values[i]?.trim()}>
              {voice.card.write}
            </button>
          </div>
        </div>
      ))}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
    </section>
  );
}

const ETHERTYPE_NAME: Record<number, string> = { 2048: "IPv4", 2054: "ARP", 34997: "lab", 34998: "lab" };

/** One layer of a catch, as the jar shows it before the Slate: the frame, then its message or a seal. */
function Layer({ l, sealed }: { l: SlateLayer; sealed: boolean }) {
  if (l.layer === "frame")
    return (
      <dl className="catch-layer">
        <dt>{voice.jar.frame}</dt>
        <dd>
          {voice.jar.to} <code>{l.to}</code>
        </dd>
        <dd>
          {voice.jar.from} <code>{l.from}</code>
        </dd>
        <dd>
          {voice.jar.carrying} <code>{ETHERTYPE_NAME[l.type] ?? `0x${l.type.toString(16)}`}</code>
        </dd>
      </dl>
    );
  if (sealed) return <p className="panel-note">{voice.jar.sealed}</p>;
  if (l.layer === "message" && l.kind === "lab")
    return (
      <dl className="catch-layer">
        <dt>{voice.jar.message}</dt>
        <dd>{l.text}</dd>
      </dl>
    );
  return null;
}

function JarPanel({ open }: { open?: number }) {
  const room = useRoom();
  const here = useSession((s) => s.here);
  const jar = useSession((s) => s.jar);
  const openCatch = useSession((s) => s.openCatch);
  const openPanel = useSession((s) => s.openPanel);
  const close = useSession((s) => s.closePanel);
  const [shown, setShown] = useState<SlateOpen | null>(null);
  useEffect(() => {
    if (!open || !here) return setShown(null);
    // Before the Slate (Floor 6), a jar opens the frame; a lab message inside is plain to read.
    void openCatch(here, open, "message").then(setShown);
  }, [open, here, openCatch]);
  if (!room) return null;
  const beforeSlate = room.floor < 6;
  return (
    <section className="panel" aria-label={voice.jar.title}>
      <h2>{voice.jar.title}</h2>
      {jar.length === 0 && <p>{voice.jar.empty}</p>}
      <ol className="catch-list">
        {jar.map((c) => (
          <li key={c.n}>
            <button
              type="button"
              data-open={c.n === open ? "yes" : "no"}
              onClick={() => openPanel({ kind: "jar", open: c.n })}
            >
              {c.n}. {(c.t / 1000).toFixed(1)} s · {c.device} {c.iface}
            </button>
          </li>
        ))}
      </ol>
      {shown?.ok &&
        shown.layers.map((l) => (
          <Layer
            key={l.layer}
            l={l}
            sealed={beforeSlate && l.layer !== "frame" && !(l.layer === "message" && l.kind === "lab")}
          />
        ))}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
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
          <pre className="cmd-output">{lines.map((e) => (e.kind === "proc.output" ? e.text : "")).join("\n")}</pre>
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
      <pre className="cmd-output">
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
          <input value={via} onChange={(e) => setVia(e.target.value)} placeholder="10.0.1.1" spellCheck={false} />
          <button type="submit">{voice.routes.add}</button>
        </form>
      ) : (
        <p className="panel-note">{voice.routes.cracked}</p>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
    </section>
  );
}

/** A keeper's desk in hand mode (0042): the waiting message, then the keeper's two steps by hand. */
function DeskPanel({ device }: { device: string }) {
  const room = useRoom();
  const desk = useSession((s) => s.status?.desks[device]);
  const exec = useSession((s) => s.exec);
  const close = useSession((s) => s.closePanel);
  const doors = room?.topology.devices.find((d) => d.id === device)?.interfaces.map((i) => i.name) ?? [];
  const [out, setOut] = useState("flood");
  const [mac, setMac] = useState("");
  const first = desk?.waiting[0];
  const act = (line: string) => void exec(device, line, "click");
  return (
    <section className="panel" aria-label={voice.desk.title}>
      <h2>{voice.desk.title}</h2>
      {!desk ? (
        <p>{voice.desk.awake}</p>
      ) : (
        <>
          <p className="panel-note">{voice.desk.asleep}</p>
          {desk.waiting.length === 0 && <p>{voice.desk.empty}</p>}
          <ol className="catch-list">
            {desk.waiting.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the desk's queue, in order
              <li key={i}>
                {fill(desk.desk === "switch" ? voice.desk.frame : voice.desk.packet, {
                  from: w.from,
                  to: w.to,
                  door: w.door,
                })}
              </li>
            ))}
          </ol>
          {first && desk.desk !== "switch" && (
            <div className="panel-actions">
              <button type="button" onClick={() => act(`lab keeper arp-ask ${first.to}`)}>
                {fill(voice.desk.ask, { to: first.to })}
              </button>
              <label className="field inline">
                <span>{desk.desk === "host" ? voice.desk.wrap : voice.desk.forward}</span>
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
                onClick={() => act(`lab keeper ${desk.desk === "host" ? "wrap" : "forward"} ${mac.trim()}`)}
              >
                {voice.desk.go}
              </button>
            </div>
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
              <button type="button" onClick={() => act(`lab keeper send ${out}`)}>
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

/** The jar button (bottom left, UI layout): how many catches, and opens the jar. */
export function JarButton() {
  const room = useRoom();
  const count = useSession((s) => s.jar.length);
  // Never under the open console (UI-02): it rises above it.
  const raised = useSession((s) => s.consoleOpen && s.voiceGiven);
  const openPanel = useSession((s) => s.openPanel);
  // From Floor 6 the Slate replaces the jar (0043).
  if (room?.controls.slate)
    return (
      <button
        type="button"
        className="jar-button"
        data-raised={raised ? "yes" : "no"}
        onClick={() => openPanel({ kind: "slate" })}
      >
        {voice.slate.name} · {count}
      </button>
    );
  if (!room?.controls.catching) return null;
  return (
    <button
      type="button"
      className="jar-button"
      data-raised={raised ? "yes" : "no"}
      onClick={() => openPanel({ kind: "jar" })}
    >
      {voice.jar.name} · {count}
    </button>
  );
}

export function ToolPanels() {
  const panel = useSession((s) => s.panel);
  if (panel?.kind === "workbench") return <WorkbenchPanel />;
  if (panel?.kind === "card") return <CardPanel />;
  if (panel?.kind === "jar") return <JarPanel open={panel.open} />;
  if (panel?.kind === "board" && panel.board === "routes")
    return <RoutesPanel device={panel.device} execId={panel.execId} />;
  if (panel?.kind === "board") return <BoardPanel device={panel.device} board={panel.board} execId={panel.execId} />;
  if (panel?.kind === "desk") return <DeskPanel device={panel.device} />;
  if (panel?.kind === "slate") return <SlatePanel />;
  return null;
}
