import type { ShellContent } from "../src";

/** Minimal content for tests; the real text lives in packages/rooms. */
export const testContent: ShellContent = {
  help: (tools) => [`tools: ${tools.join(", ")}`],
  man: (cmd) => (cmd === "ip" ? ["ip - show and change network settings"] : undefined),
  lab: (key, vars) => (vars ? `${key} ${Object.values(vars).join(" ")}` : key),
  subtitle: (line) => (line.startsWith("Cannot find device") ? "There's no door with that name here." : undefined),
  notes: {
    lab: "lab tools exist only in Wirelight",
    sudo: "You're already root here.",
    locked: "You haven't found this tool yet.",
  },
};
