// The console of the machine whose room you're in (gameplay/interface.md UI-06..UI-11): a real
// terminal (xterm.js, MIT). It prints only from the trace: commands (`cmd.exec`) and their output
// (`proc.output`) for this machine. Clicks show as the real command, dimmed, marked ↳ (UI-07); lab
// tools print in violet (UI-10). Commands that keep running (ping, tcpdump) hold the prompt until
// their `proc.exit`; Ctrl+C stops them.
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { shellContent, voice } from "@wirelight/content";
import type { SimEvent } from "@wirelight/sim";
import { useEffect, useRef } from "react";
import { ask, useSession } from "../engine/store";

const RESET = "\x1b[0m";
const DIM = "\x1b[38;2;185;173;156m";
const LAB = "\x1b[38;2;199;164;255m";
const SUB = "\x1b[3;38;2;185;173;156m";

const prompt = (host: string) => `\x1b[38;2;242;165;74mroot@${host}${RESET}:\x1b[38;2;94;224;232m~${RESET}# `;

/**
 * `subtitles`: error subtitles are on for this room (UI-08). The shell adds them to errors a command
 * prints as it starts; lines a running command prints later (ping's "Time to live exceeded") get
 * theirs here.
 */
/** Slides the console up or down (a function of the store, so it never changes between renders). */
function setOpen(v: boolean | ((o: boolean) => boolean)): void {
  const s = useSession.getState();
  s.setConsoleOpen(typeof v === "function" ? v(s.consoleOpen) : v);
}

export function Console({ device, subtitles }: { device: string; subtitles: boolean }) {
  const open = useSession((s) => s.consoleOpen);

  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  /** How many of the store's events have been written. */
  const written = useRef(0);
  const state = useRef({ buf: "", running: null as number | null, labExecs: new Set<number>(), hi: -1, tabbed: false });
  const events = useSession((s) => s.events);
  const dropped = useSession((s) => s.dropped);
  const roomId = useSession((s) => s.roomId);
  const P = prompt(device);

  // The terminal itself, once.
  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      allowTransparency: true,
      theme: { background: "#00000000", foreground: "#f3e9dc", cursor: "#5ee0e8" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    f.fit();
    term.current = t;
    fit.current = f;
    const ro = new ResizeObserver(() => f.fit());
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      t.dispose();
      term.current = null;
    };
  }, []);

  // A new room: start clean.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomId means a fresh trace
  useEffect(() => {
    term.current?.reset();
    written.current = 0;
    state.current = { buf: "", running: null, labExecs: new Set(), hi: -1, tabbed: false };
    term.current?.write(P);
  }, [roomId, device]);

  // New events from the trace: write what belongs to this machine.
  useEffect(() => {
    const t = term.current;
    if (!t) return;
    const st = state.current;
    // `written` counts the whole trace; the store may have let the oldest events go.
    const fresh = events.slice(Math.max(0, written.current - dropped));
    written.current = dropped + events.length;
    if (fresh.length === 0) return;
    let out = "";
    let needPrompt = false;
    const show = (e: SimEvent) => {
      if (e.kind === "world.reset") {
        out += `${DIM}${voice.console.reset}${RESET}\r\n`;
        st.running = null;
        needPrompt = true;
        return;
      }
      if (!("device" in e) || e.device !== device) return;
      if (e.kind === "cmd.exec") {
        if (e.line.startsWith("lab")) st.labExecs.add(e.execId);
        // A typed line is already on screen; a click's command is shown for it (UI-07).
        if (e.source !== "typed") out += `${DIM}↳ ${e.line}${RESET}\r\n`;
        if (e.exitCode === null) st.running = e.execId;
        else needPrompt = true;
      } else if (e.kind === "proc.output") {
        if (e.stream === "control") {
          if (e.text === "clear") out += "\x1b[2J\x1b[H";
          if (e.text === "exit") setOpen(false);
          return;
        }
        const color = e.stream === "note" ? SUB : st.labExecs.has(e.execId) && e.stream === "stdout" ? LAB : "";
        out += `${color}${e.text}${RESET}\r\n`;
        const later = e.stream !== "note" && e.execId === st.running;
        const meaning = later && subtitles ? shellContent.subtitle(e.text) : undefined;
        if (meaning) out += `${SUB}${meaning}${RESET}\r\n`;
      } else if (e.kind === "proc.exit" && e.execId === st.running) {
        st.running = null;
        needPrompt = true;
      }
    };
    for (const e of fresh) show(e);
    if (!out && !needPrompt) return;
    // Output arrives above the line being typed: clear it, write, then put the prompt back.
    t.write(`\x1b[2K\r${out}`);
    if (st.running === null) t.write(P + st.buf);
  }, [events, dropped, device, P, subtitles]);

  // Keys.
  useEffect(() => {
    const t = term.current;
    if (!t) return;
    const st = state.current;
    const replace = (s: string) => {
      t.write(`\x1b[2K\r${P}${s}`);
      st.buf = s;
    };
    const sub = t.onData((d) => {
      const store = useSession.getState();
      if (d === "\x03") {
        // Ctrl+C: stop what's running, or drop the line.
        if (st.running !== null) void store.interrupt(device, st.running);
        else {
          t.write(`^C\r\n${P}`);
          st.buf = "";
        }
        return;
      }
      if (st.running !== null) return; // typing waits until the command ends
      if (d === "\r") {
        const line = st.buf;
        st.buf = "";
        st.hi = -1;
        t.write("\r\n");
        if (line.trim()) void store.exec(device, line, "typed");
        else t.write(P);
        return;
      }
      if (d === "\x7f") {
        if (st.buf) replace(st.buf.slice(0, -1));
        return;
      }
      if (d === "\x0c") {
        t.write(`\x1b[2J\x1b[H${P}${st.buf}`);
        return;
      }
      if (d === "\t") {
        void ask.complete(device, st.buf).then((c) => {
          if (c.line !== st.buf) {
            replace(c.line);
            st.tabbed = false;
          } else if (c.candidates.length > 1) {
            // A second Tab lists what fits.
            if (st.tabbed) t.write(`\r\n${c.candidates.join("  ")}\r\n${P}${st.buf}`);
            st.tabbed = !st.tabbed;
          }
        });
        return;
      }
      if (d === "\x1b[A" || d === "\x1b[B") {
        void ask.history(device).then((h) => {
          if (h.length === 0) return;
          if (st.hi < 0) st.hi = h.length;
          st.hi = d === "\x1b[A" ? Math.max(0, st.hi - 1) : Math.min(h.length, st.hi + 1);
          replace(h[st.hi] ?? "");
        });
        return;
      }
      if (d.startsWith("\x1b")) return;
      const printable = [...d].filter((ch) => ch >= " ").join("");
      st.buf += printable;
      st.tabbed = false;
      t.write(printable);
    });
    return () => sub.dispose();
  }, [device, P]);

  // ` opens and closes it (UI-06).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "`") return;
      // Typing in a field elsewhere: the key is just a character there.
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.closest(".console")) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      term.current?.blur();
      return;
    }
    const id = setTimeout(() => {
      fit.current?.fit();
      term.current?.focus();
    }, 200);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <section className="console" data-open={open ? "yes" : "no"} aria-label={voice.console.title}>
      <button
        type="button"
        className="console-bar"
        aria-expanded={open}
        aria-keyshortcuts="`"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="console-live" />
        <span className="console-title">{voice.console.title}</span>
        <span className="console-host">root@{device}</span>
        <span className="console-toggle">
          <kbd>`</kbd> {open ? voice.console.hide : voice.console.open}
        </span>
      </button>
      {/* Slid down, the terminal is out of reach (Tab skips it, UI-18); ` or the bar brings it back. */}
      <div className="console-body" inert={!open}>
        <div ref={host} className="console-term" />
      </div>
    </section>
  );
}
