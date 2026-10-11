// Captures console errors and warnings so each check can report what it caused.
// WebGPU and TSL problems often show up only as console messages, not thrown errors.

export type LogEntry = { level: "error" | "warn"; text: string; check: string };

const entries: LogEntry[] = [];
let currentCheck = "(setup)";

export function setCurrentCheck(id: string) {
  currentCheck = id;
}

export function entriesFor(id: string): LogEntry[] {
  return entries.filter((e) => e.check === id);
}

function stringify(args: unknown[]): string {
  return args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : safeJson(a)))
    .join(" ")
    .slice(0, 400);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let installed = false;

export function installConsoleCapture() {
  if (installed) return;
  installed = true;
  const original = { error: console.error.bind(console), warn: console.warn.bind(console) };
  console.error = (...args: unknown[]) => {
    entries.push({ level: "error", text: stringify(args), check: currentCheck });
    original.error(...args);
  };
  console.warn = (...args: unknown[]) => {
    entries.push({ level: "warn", text: stringify(args), check: currentCheck });
    original.warn(...args);
  };
  window.addEventListener("error", (e) => {
    entries.push({ level: "error", text: `uncaught: ${e.message}`, check: currentCheck });
  });
  window.addEventListener("unhandledrejection", (e) => {
    entries.push({ level: "error", text: `unhandled rejection: ${stringify([e.reason])}`, check: currentCheck });
  });
}
