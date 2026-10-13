import { fill, voice } from "@wirelight/content";
import { type RoomDef, roomById } from "@wirelight/rooms";
import { fromHex, peel, type SlateCatch, type SlateLayer, type SlateLayerName, type SlateOpen } from "@wirelight/sim";
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

/** A catch's packet countdown (TTL), if it carries a packet. */
function ttlOf(c: SlateCatch): number | null {
  const p = peel(fromHex(c.hex)).find((l) => l.layer === "packet");
  return p?.layer === "packet" ? p.ttl : null;
}

/** The street a catch was made on: the hall at the other end of that door's cable, or the cable's name. */
function streetOf(room: RoomDef, c: SlateCatch): string {
  const t = room.topology;
  const link = t.links.find(
    (l) => (l.a.device === c.device && l.a.iface === c.iface) || (l.b.device === c.device && l.b.iface === c.iface),
  );
  if (!link) return c.iface;
  const peer = link.a.device === c.device ? link.b.device : link.a.device;
  return t.devices.find((d) => d.id === peer)?.bridges?.length ? peer : link.id;
}

type Row =
  | { kind: "one"; c: SlateCatch }
  | { kind: "fold"; first: SlateCatch; last: SlateCatch; a: string; b: string; n: number };

/**
 * The strip (9.4): a run of traced catches of one packet going back and forth between the same two
 * machines is folded into one row ("crossing ⇄ arch ×31, countdown 62 → 1"), so a loop reads as a loop.
 */
export function foldRows(jar: SlateCatch[]): Row[] {
  const key = (c: SlateCatch) => `${c.device}|${c.iface}|${c.dir}|${c.traced}`;
  const rows: Row[] = [];
  let i = 0;
  while (i < jar.length) {
    let j = i + 2;
    const ci = jar[i] as SlateCatch;
    const cj = jar[i + 1];
    // A period-two run: catch k is like catch k-2, for traced catches at two different machines.
    while (
      ci.traced &&
      cj &&
      cj.device !== ci.device &&
      j < jar.length &&
      key(jar[j] as SlateCatch) === key(jar[j - 2] as SlateCatch)
    )
      j++;
    if (cj && j - i >= 4) {
      rows.push({ kind: "fold", first: ci, last: jar[j - 1] as SlateCatch, a: ci.device, b: cj.device, n: j - i });
      i = j;
    } else {
      rows.push({ kind: "one", c: ci });
      i++;
    }
  }
  return rows;
}

/** Compare (9.1), as a table: plain labels, unlearned fields left out, what changed glows. */
function CompareTable({ a, b, room }: { a: SlateCatch; b: SlateCatch; room: RoomDef }) {
  const la = peel(fromHex(a.hex));
  const lb = peel(fromHex(b.hex));
  const fa = la.find((l) => l.layer === "frame");
  const fb = lb.find((l) => l.layer === "frame");
  const pa = la.find((l) => l.layer === "packet");
  const pb = lb.find((l) => l.layer === "packet");
  const R = voice.slate.compareRows;
  const ttlTaught = room.floor > 9 || (room.floor === 9 && room.order >= 3);
  const rows: [string, string, string][] = [];
  if (fa?.layer === "frame" && fb?.layer === "frame") {
    rows.push([R.frameTo, fa.to, fb.to], [R.frameFrom, fa.from, fb.from]);
  }
  if (pa?.layer === "packet" && pb?.layer === "packet") {
    rows.push(
      [R.packetTo, pa.to, pb.to],
      [R.packetFrom, pa.from, pb.from],
      [ttlTaught ? R.ttl : voice.slate.ttlPlain, String(pa.ttl), String(pb.ttl)],
      [R.checksum, `0x${pa.checksum.toString(16).padStart(4, "0")}`, `0x${pb.checksum.toString(16).padStart(4, "0")}`],
    );
  }
  return (
    <table className="slate-compare">
      <thead>
        <tr>
          <th />
          <th>
            {fill(voice.slate.catchN, { n: String(a.n) })} · {fill(voice.slate.onStreet, { street: streetOf(room, a) })}
          </th>
          <th>
            {fill(voice.slate.catchN, { n: String(b.n) })} · {fill(voice.slate.onStreet, { street: streetOf(room, b) })}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, x, y]) => (
          <tr key={label} data-changed={x !== y ? "yes" : "no"}>
            <th scope="row">{label}</th>
            <td>
              <code>{x}</code>
            </td>
            <td>
              <code>{y}</code> <span className="panel-note">{x !== y ? voice.slate.changed : voice.slate.same}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
  const capture = useSession((s) => s.capture);
  const startCapture = useSession((s) => s.startCapture);
  const [a, setA] = useState(1);
  const [b, setB] = useState(2);
  const [compared, setCompared] = useState<[number, number] | null>(null);
  const captured = useOutput(capture?.execId ?? null);
  const room = roomId ? roomById(roomId) : undefined;
  const doors = room?.topology.devices.find((d) => d.id === here)?.interfaces.map((i) => i.name) ?? [];
  const running = capture?.running ?? false;
  const rows = useMemo(() => foldRows(jar), [jar]);
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
            aria-label={voice.slate.from}
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
      {jar.length === 0 && captured.length === 0 && <p className="panel-note">{voice.slate.empty}</p>}
      <ol className="catch-list slate-strip">
        {rows.map((r) => {
          const c = r.kind === "one" ? r.c : r.last;
          const ttl = ttlOf(c);
          const layers = (["frame", "packet", "message"] as const).map((layer) => (
            <button
              key={layer}
              type="button"
              className="link inline"
              aria-label={fill(voice.slate.openLayer, { n: String(c.n), layer: voice.slate.layers[layer] })}
              onClick={() => void show(c.n, layer)}
            >
              {voice.slate.layers[layer]}
            </button>
          ));
          if (r.kind === "fold")
            return (
              <li key={`f${r.first.n}`} className="slate-fold">
                <span>
                  {r.first.n}–{r.last.n}.{" "}
                  {fill(voice.slate.folded, {
                    a: r.a,
                    b: r.b,
                    n: String(Math.floor(r.n / 2)),
                    from: String(ttlOf(r.first) ?? "?"),
                    to: String(ttl ?? "?"),
                  })}
                  {" ◆"}
                </span>{" "}
                {layers}
              </li>
            );
          return (
            <li key={c.n}>
              <span>
                {c.n}. {(c.t / 1000).toFixed(1)} s · {c.device} {c.iface} {c.dir}
                {room ? ` · ${fill(voice.slate.onStreet, { street: streetOf(room, c) })}` : ""}
                {slate.trace && ttl !== null ? ` · ${fill(voice.slate.countdownShort, { ttl: String(ttl) })}` : ""}
                {c.traced ? " ◆" : ""}
              </span>{" "}
              {layers}
            </li>
          );
        })}
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
            await exec(here, `lab slate compare ${a} ${b}`, "click");
            setCompared([a, b]);
          }}
        >
          <input
            type="number"
            aria-label={voice.slate.compareA}
            min={1}
            max={jar.length}
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
          />
          <input
            type="number"
            aria-label={voice.slate.compareB}
            min={1}
            max={jar.length}
            value={b}
            onChange={(e) => setB(Number(e.target.value))}
          />
          <button type="submit">{voice.slate.compare}</button>
        </form>
      )}
      {compared && room && jar[compared[0] - 1] && jar[compared[1] - 1] && (
        <CompareTable a={jar[compared[0] - 1] as SlateCatch} b={jar[compared[1] - 1] as SlateCatch} room={room} />
      )}
      {slate.capture && (
        <div className="field">
          <span>{voice.slate.capture}</span>
          <div className="addr-form">
            <select aria-label={voice.slate.capture} value={door} onChange={(e) => setDoor(e.target.value)}>
              {doors.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            {running && capture ? (
              <button type="button" onClick={() => void interrupt(capture.device, capture.execId)}>
                {voice.slate.stop}
              </button>
            ) : (
              <button type="button" onClick={() => void startCapture(here, door)}>
                {voice.slate.start}
              </button>
            )}
          </div>
          {capture && (
            <p className="panel-note">
              {fill(running ? voice.slate.listening : voice.slate.listened, {
                device: capture.device,
                door: capture.door,
              })}
            </p>
          )}
          {capture && captured.length === 0 && running && <p className="panel-note">{voice.slate.nothingHeard}</p>}
          {captured.length > 0 && <pre className="cmd-output slate-capture">{captured.slice(-14).join("\n")}</pre>}
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
