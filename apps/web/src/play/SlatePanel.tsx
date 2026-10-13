import { voice } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";
import type { SlateLayer, SlateLayerName, SlateOpen } from "@wirelight/sim";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../engine/store";

// The Slate (0043, CORE-22a): every catch tagged and listed; opened one envelope at a time, frame →
// packet → message. Floor 8 adds Capture (listen at a door: `tcpdump -n -i <door>`), Floor 9 the
// tracer and Compare. It only reads; every button runs the real command it stands for.

const NONE: never[] = [];
const ETHERTYPE: Record<number, string> = { 2048: "IPv4", 2054: "ARP", 34997: "lab", 34998: "lab answer" };
const PROTOCOL: Record<number, string> = { 1: "ICMP", 17: "UDP" };

function LayerView({ l }: { l: SlateLayer }) {
  if (l.layer === "frame")
    return (
      <dl className="catch-layer">
        <dt>{voice.slate.layers.frame}</dt>
        <dd>
          {voice.jar.to} <code>{l.to}</code> · {voice.jar.from} <code>{l.from}</code>
        </dd>
        <dd>
          {voice.jar.carrying} <code>{ETHERTYPE[l.type] ?? `0x${l.type.toString(16)}`}</code>
        </dd>
      </dl>
    );
  if (l.layer === "packet")
    return (
      <dl className="catch-layer">
        <dt>{voice.slate.layers.packet}</dt>
        <dd>
          {voice.jar.to} <code>{l.to}</code> · {voice.jar.from} <code>{l.from}</code>
        </dd>
        <dd>
          {voice.slate.ttl} <code>{l.ttl}</code> · {voice.slate.protocol} <code>{PROTOCOL[l.proto] ?? l.proto}</code> ·{" "}
          {voice.slate.checksum} <code>0x{l.checksum.toString(16).padStart(4, "0")}</code>
        </dd>
      </dl>
    );
  const text =
    l.kind === "udp"
      ? `${l.text} (${voice.slate.port} ${l.toPort})`
      : l.kind === "icmp"
        ? l.type === 8
          ? `echo request ${l.seq}: are you there?`
          : l.type === 0
            ? `echo reply ${l.seq}: yes, I'm here`
            : `icmp type ${l.type} code ${l.code}`
        : l.kind === "lab"
          ? l.text
          : l.kind === "arp"
            ? l.op === 1
              ? `who has ${l.targetIp}? tell ${l.senderIp}`
              : `${l.senderIp} is at ${l.senderMac}`
            : `${l.bytes} bytes`;
  return (
    <dl className="catch-layer">
      <dt>{voice.slate.layers.message}</dt>
      <dd>{text}</dd>
    </dl>
  );
}

/** The output lines of one command, from the trace. */
function useOutput(execId: number | null) {
  const events = useSession((s) => s.events);
  return useMemo(
    () =>
      execId === null
        ? NONE
        : events
            .filter((e) => e.kind === "proc.output" && e.execId === execId && e.stream === "stdout")
            .map((e) => (e.kind === "proc.output" ? e.text : "")),
    [events, execId],
  );
}

export function SlatePanel() {
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here) ?? "observatory";
  const jar = useSession((s) => s.jar);
  const exec = useSession((s) => s.exec);
  const interrupt = useSession((s) => s.interrupt);
  const openCatch = useSession((s) => s.openCatch);
  const close = useSession((s) => s.closePanel);
  const [from, setFrom] = useState("");
  const [open, setOpen] = useState<{ n: number; shown: SlateOpen } | null>(null);
  const [door, setDoor] = useState("eth0");
  const [capture, setCapture] = useState<number | null>(null);
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
  const [compared, setCompared] = useState<number | null>(null);
  const captured = useOutput(capture);
  const comparison = useOutput(compared);
  const room = roomId ? roomById(roomId) : undefined;
  const doors = room?.topology.devices.find((d) => d.id === here)?.interfaces.map((i) => i.name) ?? [];
  const running = useSession((s) =>
    capture === null ? false : !s.events.some((e) => e.kind === "proc.exit" && e.execId === capture),
  );
  const firstDoor = doors[0] ?? "eth0";
  useEffect(() => setDoor(firstDoor), [firstDoor]);
  if (!room?.controls.slate) return null;
  const slate = room.controls.slate;

  const show = async (n: number, layer: SlateLayerName) => setOpen({ n, shown: await openCatch(here, n, layer) });

  return (
    <section className="panel slate" aria-label={voice.slate.title}>
      <h2>{voice.slate.title}</h2>
      {slate.catch && (
        <form
          className="addr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void exec(here, `lab slate catch --next${from.trim() ? ` --from ${from.trim()}` : ""}`, "click");
          }}
        >
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder={voice.slate.from}
            spellCheck={false}
          />
          <button type="submit">{voice.slate.catchNext}</button>
        </form>
      )}
      {slate.trace && (
        <div className="panel-actions">
          <button type="button" onClick={() => void exec(here, "lab slate trace --next", "click")}>
            {voice.slate.trace}
          </button>
        </div>
      )}
      {jar.length === 0 && <p className="panel-note">{voice.slate.empty}</p>}
      <ol className="catch-list">
        {jar.map((c) => (
          <li key={c.n}>
            <span>
              {c.n}. {(c.t / 1000).toFixed(1)} s · {c.device} {c.iface} {c.dir}
              {c.traced ? " ◆" : ""}
            </span>{" "}
            {(["frame", "packet", "message"] as const).map((layer) => (
              <button key={layer} type="button" className="link inline" onClick={() => void show(c.n, layer)}>
                {voice.slate.layers[layer]}
              </button>
            ))}
          </li>
        ))}
      </ol>
      {open?.shown.ok && (
        <div>
          {open.shown.layers.map((l) => (
            <LayerView key={l.layer} l={l} />
          ))}
          {!open.shown.reached && <p className="panel-note">{voice.jar.sealed}</p>}
        </div>
      )}
      {slate.trace && jar.length >= 2 && (
        <form
          className="addr-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await exec(here, `lab slate compare ${a} ${b}`, "click");
            setCompared(r.execId);
          }}
        >
          <input type="number" min={1} max={jar.length} value={a} onChange={(e) => setA(Number(e.target.value))} />
          <input type="number" min={1} max={jar.length} value={b} onChange={(e) => setB(Number(e.target.value))} />
          <button type="submit">{voice.slate.compare}</button>
        </form>
      )}
      {comparison.length > 0 && <pre className="cmd-output">{comparison.join("\n")}</pre>}
      {slate.capture && (
        <div className="field">
          <span>{voice.slate.capture}</span>
          <div className="addr-form">
            <select value={door} onChange={(e) => setDoor(e.target.value)}>
              {doors.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            {running ? (
              <button type="button" onClick={() => capture !== null && void interrupt(here, capture)}>
                {voice.slate.stop}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const r = await exec(here, `tcpdump -n -i ${door}`, "click");
                  setCapture(r.execId);
                }}
              >
                {voice.slate.start}
              </button>
            )}
          </div>
          {captured.length > 0 && <pre className="cmd-output">{captured.slice(-14).join("\n")}</pre>}
        </div>
      )}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={close}>
          {voice.jar.close}
        </button>
      </div>
    </section>
  );
}
