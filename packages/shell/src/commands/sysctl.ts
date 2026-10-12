/**
 * `sysctl` (procps-ng 4.0.6): read keys, write them (`-w`, or `key=value`), list everything (`-a`,
 * usually piped to grep). Output and errors match the golden files captured on real Linux
 * (tools/golden/capture-sysctl.sh, packages/shell/test/golden/sysctl).
 */
import type { CommandContext } from "../types";
import { SYSCTL_USAGE } from "./usage";

const path = (key: string) => `/proc/sys/${key.replaceAll(".", "/")}`;

export function sysctl(ctx: CommandContext, args: string[]): number {
  if (!ctx.tools.has("sysctl")) {
    ctx.note(ctx.content.notes.locked);
    return 127;
  }
  let write = false;
  let all = false;
  const vars: string[] = [];
  for (const a of args) {
    if (a === "-w" || a === "--write") write = true;
    else if (a === "-a" || a === "-A" || a === "-X" || a === "--all") all = true;
    else if (a.startsWith("-"))
      continue; // -n, -q, -x and the like: nothing the game needs
    else vars.push(a);
  }
  if (all) {
    for (const [k, v] of ctx.sim.sysctlList(ctx.device)) ctx.out(`${k} = ${v}`);
    return 0;
  }
  if (vars.length === 0) {
    if (args.length > 0) {
      ctx.err("sysctl: no variables specified");
      ctx.err("Try `sysctl --help' for more information.");
      return 1;
    }
    for (const line of SYSCTL_USAGE) ctx.err(line);
    return 1;
  }
  let code = 0;
  for (const v of vars) {
    const eq = v.indexOf("=");
    if (write && eq < 0) {
      ctx.err("sysctl: command line(0): invalid syntax, continuing...");
      return 1;
    }
    const key = (eq < 0 ? v : v.slice(0, eq)).replaceAll("/", ".");
    if (eq < 0) {
      const value = ctx.sim.sysctlRead(ctx.device, key);
      if (value === undefined) {
        ctx.err(`sysctl: cannot stat ${path(key)}: No such file or directory`);
        code = 1;
      } else ctx.out(`${key} = ${value}`);
      continue;
    }
    const value = v.slice(eq + 1);
    const r = ctx.sim.setSysctl(ctx.device, key, value);
    if (r === "unknown") {
      ctx.err(`sysctl: cannot stat ${path(key)}: No such file or directory`);
      code = 1;
    } else if (r === "invalid") {
      ctx.err(`sysctl: setting key "${key}": Invalid argument`);
      code = 1;
    } else ctx.out(`${key} = ${value.trim()}`);
  }
  return code;
}
