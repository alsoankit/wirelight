import {
  cards,
  commandMemories,
  floors,
  floorTexts,
  guide,
  pathChoice,
  regions,
  roomTexts,
  terms,
  voice,
} from "@wirelight/content";
import { onPath, type Path, rooms } from "@wirelight/rooms";
import { useEffect, useState } from "react";
import { type Panel, useSession } from "../engine/store";
import { useProgress } from "../progress/progress";
import { CommandMemory } from "./CommandMemory";
import { goToRoom } from "./RoomHud";

// The menu (M, UI-13): the dungeon (every floor and room with its status), the Codex (objects, words,
// the Command book, journal pages), the Field Guide (topics open as their rooms are reached), the
// keyring and Settings (path, replay intro). A drawer from the left; Esc closes it.

type Tab = NonNullable<Extract<Panel, { kind: "menu" }>["tab"]>;
const TABS: Tab[] = ["dungeon", "codex", "guide", "keys", "settings"];

function useOpened(): Set<string> {
  // A room is open when it's cleared, or it's the first on the path not yet cleared (CORE-04),
  // or the room the player is in.
  const cleared = useProgress((s) => s.cleared);
  const path = useProgress((s) => (s.path ?? "new") as Path);
  const roomId = useSession((s) => s.roomId);
  const open = new Set(Object.keys(cleared));
  const next = rooms.find((r) => onPath(r, path) && !cleared[r.id]);
  if (next) open.add(next.id);
  if (roomId) open.add(roomId);
  // Optional rooms (off the path) open once the room after them on the path is reached.
  rooms.forEach((r, i) => {
    if (!onPath(r, path) && rooms.slice(i + 1).some((x) => open.has(x.id))) open.add(r.id);
  });
  return open;
}

function Dungeon() {
  const cleared = useProgress((s) => s.cleared);
  const path = useProgress((s) => (s.path ?? "new") as Path);
  const roomId = useSession((s) => s.roomId);
  const opened = useOpened();
  const close = useSession((s) => s.closePanel);
  return (
    <div className="menu-dungeon">
      {Object.values(floors).map((f) => {
        const mine = rooms.filter((r) => r.floor === f.n);
        return (
          <section key={f.n}>
            <h3>
              {f.n === 0 ? f.name : `${f.n} · ${f.name}`} <span className="panel-note">{regions[f.region]?.name}</span>
            </h3>
            {mine.length === 0 && <p className="panel-note">{voice.menu.status.planned}</p>}
            <ul>
              {mine.map((r) => {
                const state = cleared[r.id]
                  ? voice.menu.status.cleared
                  : !onPath(r, path)
                    ? voice.menu.status.optional
                    : opened.has(r.id)
                      ? voice.menu.status.next
                      : voice.menu.status.locked;
                return (
                  <li key={r.id} data-here={r.id === roomId ? "yes" : "no"}>
                    <span>{roomTexts[r.content]?.title}</span> <span className="panel-note">{state}</span>
                    {opened.has(r.id) && r.id !== roomId && (
                      <button
                        type="button"
                        className="link inline"
                        onClick={() => {
                          close();
                          goToRoom(r.id);
                        }}
                      >
                        {cleared[r.id] ? voice.menu.replay : voice.menu.play}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Codex() {
  const cardsSeen = useProgress((s) => s.cardsSeen);
  const cleared = useProgress((s) => s.cleared);
  const pages = useProgress((s) => s.journalPages);
  const [memory, setMemory] = useState<string | null>(null);
  const words = Object.entries(terms).filter(([, t]) => cleared[t.room]);
  const learned = rooms.filter((r) => r.commandMemory && cleared[r.id]).map((r) => r.commandMemory as string);
  const shown = memory ? commandMemories[memory] : undefined;
  if (shown) return <CommandMemory memory={shown} onDone={() => setMemory(null)} />;
  return (
    <div>
      <h3>{voice.menu.objects}</h3>
      {cardsSeen.length === 0 && <p className="panel-note">{voice.menu.empty}</p>}
      <dl>
        {cardsSeen.map((id) =>
          cards[id] ? (
            <div key={id}>
              <dt>{cards[id]?.title}</dt>
              <dd>{cards[id]?.text}</dd>
            </div>
          ) : null,
        )}
      </dl>
      <h3>{voice.menu.words}</h3>
      {words.length === 0 && <p className="panel-note">{voice.menu.empty}</p>}
      <dl>
        {words.map(([id, t]) => (
          <div key={id}>
            <dt>{t.term}</dt>
            <dd>{t.meaning}</dd>
          </div>
        ))}
      </dl>
      <h3>{voice.menu.commands}</h3>
      {learned.length === 0 && <p className="panel-note">{voice.menu.empty}</p>}
      {learned.map((id) => (
        <button key={id} type="button" className="link" onClick={() => setMemory(id)}>
          <code>{commandMemories[id]?.command}</code>
        </button>
      ))}
      <h3>{voice.menu.journal}</h3>
      {pages.length === 0 && <p className="panel-note">{voice.menu.empty}</p>}
      {Object.values(floorTexts)
        .filter((f) => pages.includes(f.journal.page))
        .map((f) => (
          <blockquote key={f.journal.page} className="journal">
            <strong>{f.journal.title}</strong>
            <p>{f.journal.text}</p>
          </blockquote>
        ))}
    </div>
  );
}

function Guide() {
  const opened = useOpened();
  const [topic, setTopic] = useState<string | null>(null);
  // Topics about objects open in the room where the player first meets them (UI-13).
  const open = guide.filter((t) => !t.from || opened.has(t.from));
  const shown = open.find((t) => t.id === topic);
  return (
    <div>
      {shown ? (
        <>
          <button type="button" className="link" onClick={() => setTopic(null)}>
            ←
          </button>
          <h3>{shown.title}</h3>
          {shown.body.map((p) => (
            <p key={p}>{p.replace(/\[\[(.+?)\]\]/g, "$1")}</p>
          ))}
        </>
      ) : (
        <ul className="questions">
          {open.map((t) => (
            <li key={t.id}>
              <button type="button" className="link" onClick={() => setTopic(t.id)}>
                {t.title}
              </button>{" "}
              <span className="panel-note">{t.blurb}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Keys() {
  const keys = useProgress((s) => s.keys);
  if (keys.length === 0) return <p className="panel-note">{voice.menu.noKeys}</p>;
  return (
    <ul className="keyring">
      {keys.map((k) => (
        <li key={k}>
          <code>{k}</code>
        </li>
      ))}
    </ul>
  );
}

function Choice<T extends string | number>({
  title,
  value,
  options,
  onPick,
}: {
  title: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="choice">
      <legend>{title}</legend>
      {options.map(([v, label]) => (
        <label key={String(v)} className="radio">
          <input type="radio" checked={value === v} onChange={() => onPick(v)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function Settings() {
  const path = useProgress((s) => s.path ?? "new");
  const choosePath = useProgress((s) => s.choosePath);
  const replayIntro = useProgress((s) => s.replayIntro);
  const settings = useProgress((s) => s.settings);
  const set = useProgress((s) => s.setSettings);
  const m = voice.menu;
  return (
    <div>
      <h3>{m.sound}</h3>
      {(["master", "music", "effects", "voices"] as const).map((k) => (
        <label key={k} className="slider">
          <span>{m.volume[k]}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volumes[k]}
            onChange={(e) => set({ volumes: { ...settings.volumes, [k]: Number(e.target.value) } })}
          />
        </label>
      ))}
      <Choice
        title={m.voices.title}
        value={settings.voices}
        options={[
          ["on", m.voices.on],
          ["text", m.voices.text],
        ]}
        onPick={(voices) => set({ voices })}
      />
      <Choice
        title={m.subtitles.title}
        value={settings.subtitles}
        options={[
          ["auto", m.subtitles.auto],
          ["on", m.subtitles.on],
          ["off", m.subtitles.off],
        ]}
        onPick={(subtitles) => set({ subtitles })}
      />
      <Choice
        title={m.textSize}
        value={settings.textSize}
        options={[
          [1, "100%"],
          [1.25, "125%"],
          [1.5, "150%"],
        ]}
        onPick={(textSize) => set({ textSize })}
      />
      <Choice
        title={m.motion.title}
        value={settings.motion}
        options={[
          ["system", m.motion.system],
          ["reduced", m.motion.reduced],
          ["full", m.motion.full],
        ]}
        onPick={(motion) => set({ motion })}
      />
      <Choice
        title={m.quality.title}
        value={settings.quality}
        options={(["auto", "high", "medium", "low", "simple"] as const).map((q) => [q, m.quality[q]])}
        onPick={(quality) => set({ quality })}
      />
      <h3>{voice.menu.path}</h3>
      {pathChoice.options.map((o) => (
        <label key={o.id} className="radio">
          <input type="radio" name="path" checked={path === o.id} onChange={() => choosePath(o.id as Path)} />
          <span>
            <strong>{o.title}</strong> — {o.line}
          </span>
        </label>
      ))}
      <div className="panel-actions">
        <button type="button" className="quiet" onClick={replayIntro}>
          {voice.menu.replayIntro}
        </button>
      </div>
    </div>
  );
}

export function Menu() {
  const panel = useSession((s) => s.panel);
  const openPanel = useSession((s) => s.openPanel);
  const close = useSession((s) => s.closePanel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      const inConsole = e.target instanceof HTMLElement && !!e.target.closest(".console");
      if ((e.key === "m" || e.key === "M") && !typing && !inConsole) {
        const s = useSession.getState();
        s.panel?.kind === "menu" ? s.closePanel() : s.openPanel({ kind: "menu" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (panel?.kind !== "menu") return null;
  const tab = panel.tab ?? "dungeon";
  return (
    <aside className="menu" aria-label={voice.menu.title}>
      <nav className="menu-tabs">
        {TABS.map((t) => (
          <button key={t} type="button" aria-pressed={t === tab} onClick={() => openPanel({ kind: "menu", tab: t })}>
            {voice.menu.tabs[t]}
          </button>
        ))}
        <button type="button" className="quiet" onClick={close}>
          {voice.menu.close}
        </button>
      </nav>
      <div className="menu-body">
        {tab === "dungeon" && <Dungeon />}
        {tab === "codex" && <Codex />}
        {tab === "guide" && <Guide />}
        {tab === "keys" && <Keys />}
        {tab === "settings" && <Settings />}
      </div>
    </aside>
  );
}
