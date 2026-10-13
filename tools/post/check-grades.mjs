// Checks that no region's grade moves the reserved colours off their meaning (art-direction.md):
// cyan stays cyan, amber amber, violet violet. Runs each reserved colour through every grade (CPU
// mirror of the shader), at full brightness, dimmed, and mixed with grey (a glow over stone), and
// prints the hue shift in degrees. Fails (exit 1) when any shift passes the limit. Reserved colours
// are lights in the world (messages, lit corridors, hints, lab tools); for reference it also prints
// what the grade alone would do to them as unlit surfaces (no limit: scenery avoids these hues).
// Usage: node tools/post/check-grades.mjs
import { applyGrade, GRADES, hex, RESERVED } from "../../apps/web/src/world/post/grades.ts";

const LIMIT = 6; // degrees

function hue([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const variants = {
  full: (c) => c,
  dim: (c) => c.map((v) => v * 0.55),
  "over stone": (c) => c.map((v) => v * 0.6 + 0.4 * 0.35),
};

let worst = 0;
for (const [region, grade] of Object.entries(GRADES)) {
  for (const state of ["ruined", "restored"]) {
    const row = [];
    for (const [name, value] of Object.entries(RESERVED)) {
      for (const [how, f] of Object.entries(variants)) {
        const before = f(hex(value));
        const after = applyGrade(before, grade[state]);
        let shift = Math.abs(hue(after) - hue(before));
        shift = Math.min(shift, 360 - shift);
        worst = Math.max(worst, shift);
        if (how === "full" || shift > 2) row.push(`${name}${how === "full" ? "" : ` ${how}`} ${shift.toFixed(1)}°`);
      }
      const bare = applyGrade(hex(value), grade[state], 0);
      let raw = Math.abs(hue(bare) - hue(hex(value)));
      raw = Math.min(raw, 360 - raw);
      row.push(`(${name} unlit ${raw.toFixed(1)}°)`);
    }
    console.log(`Region ${region} ${state.padEnd(8)} ${row.join(" · ")}`);
  }
}
console.log(`worst hue shift ${worst.toFixed(1)}° (limit ${LIMIT}°)`);
process.exit(worst > LIMIT ? 1 : 0);
