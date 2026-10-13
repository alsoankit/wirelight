import { fill, voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { SlateLayer, SlateOpen } from "@wirelight/sim";
import { useEffect, useState } from "react";
import { useSession } from "../engine/store";

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

/** The jar button (bottom left, UI layout): how many catches, and opens the jar. */
export function JarButton() {
  const room = useRoom();
  const count = useSession((s) => s.jar.length);
  const openPanel = useSession((s) => s.openPanel);
  if (!room?.controls.catching) return null;
  return (
    <button type="button" className="jar-button" onClick={() => openPanel({ kind: "jar" })}>
      {voice.jar.name} · {count}
    </button>
  );
}

export function ToolPanels() {
  const panel = useSession((s) => s.panel);
  if (panel?.kind === "workbench") return <WorkbenchPanel />;
  if (panel?.kind === "card") return <CardPanel />;
  if (panel?.kind === "jar") return <JarPanel open={panel.open} />;
  return null;
}
