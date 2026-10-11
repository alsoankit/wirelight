/**
 * The console of the machine whose room you're in (SRS §7). It prints from the trace: commands
 * (`cmd.exec`) and their output (`proc.output`) for this device. Clicked actions appear dimmed
 * with a ↳ marker (FR-CON-16); lab tools print in their own color (FR-CON-07).
 */
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { voice } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { current, useGame } from "../game/store";

const RESET = "\x1b[0m";
const DIM = "\x1b[38;2;150;138;120m";
const LAB = "\x1b[38;2;199;164;255m";
const ECHO = "\x1b[38;2;170;158;138m";
const SUB = "\x1b[3;38;2;150;138;120m";

function prompt(host: string) {
  return `\x1b[38;2;242;165;74mroot@${host}${RESET}:\x1b[38;2;94;224;232m~${RESET}# `;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Console({ device, typing }: { device: string; typing: boolean }) {
  const open = useGame((s) => s.consoleOpen);
  const roomId = useGame((s) => s.roomId);
  const toggle = useGame((s) => s.toggleConsole);
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const hostname = current().backend.state().device(device)?.hostname ?? device;

  useEffect(() => {
    if (!host.current) return;
    const t = new Terminal({
      fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: "rgba(0,0,0,0)",
        foreground: cssVar("--text"),
        cursor: cssVar("--live"),
        selectionBackground: "rgba(94,224,232,0.25)",
      },
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
    };
  }, []);

  // (Re)attach to this device's shell: replay its history from the trace, then follow new events.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roomId means a new backend
  useEffect(() => {
    const t = term.current;
    if (!t) return;
    const { backend } = current();
    const labExec = new Set<number>();
    let buf = "";
    let promptQueued = false;
    let echoNoteShown = false;
    const P = prompt(hostname);
    const writePrompt = () => {
      promptQueued = false;
      t.write(P + buf);
    };
    const queuePrompt = () => {
      if (promptQueued) return;
      promptQueued = true;
      queueMicrotask(writePrompt);
    };
    const show = (e: SimEvent, live: boolean) => {
      if (e.kind === "world.reset") {
        t.write(`\x1b[2K\r${DIM}— room reset —${RESET}\r\n`);
        if (live) queuePrompt();
        return;
      }
      if (!("device" in e) || e.device !== device) return;
      if (e.kind === "cmd.exec") {
        if (e.line.startsWith("lab")) labExec.add(e.execId);
        if (e.source !== "typed" || !live) {
          const shown = e.source === "typed" ? e.line : `${ECHO}↳ ${e.line}${RESET}`;
          t.write(`\x1b[2K\r${P}${shown}\r\n`);
        }
        if (live) queuePrompt();
      } else if (e.kind === "proc.output") {
        if (e.stream === "control") {
          if (e.text === "clear" && live) t.clear();
          if (e.text === "exit" && live) useGame.getState().toggleConsole(false);
          return;
        }
        const color = e.stream === "note" ? SUB : labExec.has(e.execId) && e.stream === "stdout" ? LAB : "";
        t.write(`${color}${e.text}${RESET}\r\n`);
      }
    };

    t.reset();
    t.writeln(`${DIM}Console of ${hostname}.${typing ? "" : ` ${voice.console.echoOnly}`}${RESET}`);
    for (const e of backend.trace()) show(e, false);
    writePrompt();
    const unsub = backend.subscribe((e) => show(e, true));

    const history = () => backend.history(device);
    let hi = history().length;
    const replace = (s: string) => {
      t.write("\b \b".repeat(buf.length));
      buf = s;
      t.write(s);
    };
    const input = t.onData((d) => {
      if (!typing) {
        if (!echoNoteShown) {
          echoNoteShown = true;
          t.write(`\r\n${SUB}${voice.console.cantType}${RESET}\r\n`);
          writePrompt();
        }
        return;
      }
      if (d === "\r") {
        const line = buf;
        buf = "";
        t.write("\r\n");
        if (line.trim()) useGame.getState().run(line, "typed", device);
        else writePrompt();
        hi = history().length;
        return;
      }
      if (d === "\x7f") {
        if (buf.length) {
          buf = buf.slice(0, -1);
          t.write("\b \b");
        }
        return;
      }
      if (d === "\x03") {
        buf = "";
        t.write("^C\r\n");
        writePrompt();
        return;
      }
      if (d === "\x0c") {
        t.clear();
        return;
      }
      if (d === "\x1b[A") {
        if (hi > 0) replace(history()[--hi] ?? "");
        return;
      }
      if (d === "\x1b[B") {
        hi = Math.min(history().length, hi + 1);
        replace(history()[hi] ?? "");
        return;
      }
      if (d.startsWith("\x1b")) return;
      const printable = [...d].filter((ch) => ch >= " ").join("");
      buf += printable;
      t.write(printable);
    });
    return () => {
      unsub();
      input.dispose();
    };
  }, [device, roomId, typing, hostname]);

  useEffect(() => {
    if (!open) {
      term.current?.blur();
      return;
    }
    const id = setTimeout(() => {
      fit.current?.fit();
      term.current?.focus();
    }, 260);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <motion.section
      aria-label="Console"
      className="glass-strong pointer-events-auto absolute right-4 bottom-0 left-4 z-30 flex flex-col overflow-hidden rounded-t-2xl"
      initial={false}
      animate={{ height: open ? "38vh" : 44 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <button
        type="button"
        onClick={() => toggle()}
        className="flex h-11 shrink-0 items-center gap-3 px-4 text-left text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--live)] shadow-[0_0_10px_var(--live)]" />
        <span className="font-medium text-[var(--text)]">Console</span>
        <span className="font-mono">root@{hostname}</span>
        {!typing && <span className="text-[12px]">· shows what your actions do</span>}
        <span className="ml-auto flex items-center gap-2">
          <kbd className="kbd">`</kbd>
          {open ? "hide" : "open"}
        </span>
      </button>
      <div className="min-h-0 flex-1 px-4 pb-3">
        <div ref={host} className="h-full w-full" />
      </div>
    </motion.section>
  );
}
