import type { SimEvent } from "@wirelight/sim";
import type { Panel } from "../engine/store";

// When each discovery card shows (CORE-46; interface.md: left side, one at a time, never blocking).
// A card about an OBJECT shows the first time the player looks at that object or sees the event it
// explains (the Slate card when the Slate opens, "Ignored mark" when the first mark appears). A card
// that names an IDEA a room teaches waits until the room is won and its debrief is up, so it never
// gives the lesson away (the owner's decision after the Region 4 playtest). A card not listed here
// is an object in plain view: it shows on arriving, after the room's opening lines.

/** What has been seen in this visit: the moments' tags (momentRules.ts) and the cards' own (below). */
export type Seen = ReadonlySet<string>;

type When = "arrive" | "after-win" | ((seen: Seen) => boolean);

const any =
  (...what: string[]) =>
  (seen: Seen) =>
    what.some((w) => seen.has(w));

export const CARD_WHEN: Record<string, When> = {
  // Prologue
  cable: "arrive",
  message: any("moving"),
  "scrying-glass": any("glass-open"),
  // Floor 1
  door: "arrive",
  plate: any("panel:plate"),
  "link-light": any("panel:plate"),
  "cable-end": any("near-cable", "plugged", "panel:plate"),
  "door-switch": any("switch-seen"),
  // Floor 2
  frame: any("panel:workbench", "sent-frame", "caught"),
  "mac-address": any("panel:plate", "panel:workbench"),
  workbench: any("panel:workbench"),
  messenger: "arrive",
  "capture-jar": any("moving", "panel:jar", "caught"),
  "ignored-mark": any("ignored"),
  "everyone-address": (s) => s.has("caught-announcement") && s.has("opened-catch"),
  "sealed-room": "arrive",
  "source-address": "after-win",
  console: any("voice-given"),
  "makers-mark": "after-win",
  // Floors 3–4
  switch: any("walked", "panel:desk", "board-open"),
  "mac-board": any("board-open"),
  "keepers-desk": any("panel:desk"),
  "clouded-board": any("board-open"),
  "pinned-memory": any("board-open"),
  span: any("walked"),
  loop: "after-win",
  peacekeeper: "after-win",
  // Floors 5–7
  "ip-address": "after-win",
  register: "arrive",
  "address-slot": any("panel:plate"),
  echo: any("ping"),
  slate: any("slate-open"),
  packet: any("packet-opened"),
  "neighbour-ledger": any("board:ledger"),
  "arp-question": "after-win",
  "two-answers": "after-win",
  "street-sign": "arrive",
  prefix: "after-win",
  registry: "arrive",
  lease: "after-win",
  "thirty-two-bits": "after-win",
  // Floors 8–9
  router: "after-win",
  navigator: any("panel:keeper", "panel:desk"),
  "routing-board": any("board:routes"),
  "default-gateway": "after-win",
  "specific-route": "after-win",
  capture: any("slate-open"),
  lectern: any("panel:desk"),
  tracer: any("trace-armed", "slate-open"),
  compare: any("compared"),
  hop: "after-win",
  ttl: "after-win",
  "icmp-note": any("icmp-error"),
  "routing-loop": "after-win",
  "home-box": "arrive",
};

/** Whether a card is due: its moment has come in this visit (`won`: the debrief is up). */
export function cardDue(id: string, seen: Seen, won: boolean): boolean {
  const when = CARD_WHEN[id] ?? "arrive";
  if (when === "arrive") return true;
  if (when === "after-win") return won;
  return when(seen);
}

/** The cards' own tags, from what the interface shows and what the trace says. Pure; adds to `out`. */
export function readForCards(
  v: { panel: Panel | null; moving: number; events: readonly SimEvent[] },
  out: Set<string>,
): void {
  const p = v.panel;
  if (p) out.add(`panel:${p.kind}`);
  if (p?.kind === "board") out.add(`board:${p.board}`);
  if (v.moving > 0) out.add("moving");
  for (const e of v.events) {
    if (e.kind === "frame.drop" && e.reason === "not-for-me") out.add("ignored");
    else if (e.kind === "cmd.exec" && /^ping\b/.test(e.line)) out.add("ping");
    else if (e.kind === "slate.compare") out.add("compared");
    else if (e.kind === "slate.open" && e.layer !== "frame") out.add("packet-opened");
    else if (e.kind === "icmp.error" && e.type !== "redirect") out.add("icmp-error");
  }
}
