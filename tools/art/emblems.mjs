// Draws the regions' painted emblems (decision 0091): shields, roundels, banners and cartouches, each
// with one of its region's motifs, field colours and divisions, lit as painted relief (a bevelled rim,
// metallic gold, soft shadows) so they read as carved and painted rather than flat.
// Usage: node tools/art/emblems.mjs → assets-src/art/emblems/*.svg and apps/web/public/art/emblems/*.webp
// (needs inkscape and magick). Twelve variants per region, numbered 0–11; the game picks one per
// machine (world/room/emblems.ts) so neighbouring rooms differ.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = join(root, "assets-src/art/emblems");
const OUT = join(root, "apps/web/public/art/emblems");
const W = 512;
const H = 640;
const INK = "#2A211A";
const BONE = "#E3D6B8";
const GOLD = "url(#gold)";
export const VARIANTS = 12;

// ── Shapes: an outline (in the 512 × 640 picture), its inner field, and where the motif sits ──────
const SHAPES = {
  heater: {
    outer: "M44 70 H468 V300 C468 470 370 568 256 620 C142 568 44 470 44 300 Z",
    centre: [256, 318],
    scale: 1,
  },
  roundel: {
    outer: "M256 92 A220 220 0 1 1 255.9 92 Z",
    centre: [256, 312],
    scale: 0.92,
  },
  banner: {
    // A cloth hung from a rod, cut in a swallowtail.
    outer: "M76 74 H436 V586 L256 512 L76 586 Z",
    centre: [256, 296],
    scale: 0.95,
    rod: true,
  },
  cartouche: {
    outer: "M256 64 C392 64 452 180 452 330 C452 480 392 600 256 600 C120 600 60 480 60 330 C60 180 120 64 256 64 Z",
    centre: [256, 332],
    scale: 0.95,
  },
};

// ── Each region's people: field colours, rim metal, and three motifs (drawn round 0,0, about ±150) ──
const REGIONS = {
  1: {
    fields: ["#56694A", "#3F5548", "#6B5A3E"],
    rim: "#8A7A55",
    motifs: [
      // Two towers joined by one gold thread, between two leaves.
      () => `
        ${leaf(-120, 70, -12)}${leaf(120, 70, 12, true)}
        <path d="M-92 70 V-40 L-74 -74 L-56 -40 V70Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <path d="M56 70 V-40 L74 -74 L92 -40 V70Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <rect x="-80" y="-18" width="12" height="26" rx="6" fill="${INK}"/><rect x="68" y="-18" width="12" height="26" rx="6" fill="${INK}"/>
        <path d="M-56 -44 C -20 40 20 40 56 -44" fill="none" stroke="${GOLD}" stroke-width="12" stroke-linecap="round"/>
        <circle cx="-16" cy="10" r="16" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>`,
      // Two rings knotted by a gold thread, leaves above and below.
      () => `
        ${leaf(0, -96, 90)}${leaf(0, 104, -90, true)}
        <circle cx="-78" cy="4" r="40" fill="none" stroke="${BONE}" stroke-width="16"/>
        <circle cx="78" cy="4" r="40" fill="none" stroke="${BONE}" stroke-width="16"/>
        <path d="M-44 4 C -20 -44 20 52 44 4" fill="none" stroke="${GOLD}" stroke-width="12" stroke-linecap="round"/>`,
      // A spindle wound with gold thread, two leaves at its foot.
      () => `
        ${leaf(-66, 92, -40)}${leaf(66, 92, 40, true)}
        <path d="M-8 -132 H8 V110 H-8Z" fill="#7A5B3E" stroke="${INK}" stroke-width="5"/>
        <ellipse cx="0" cy="96" rx="52" ry="16" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <ellipse cx="0" cy="-10" rx="44" ry="62" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>
        <path d="M-40 -34 C 0 -24 0 -24 40 -34 M-44 -6 C 0 4 0 4 44 -6 M-40 22 C 0 32 0 32 40 22" fill="none" stroke="#9C6E25" stroke-width="5"/>`,
    ],
  },
  2: {
    fields: ["#5E2B27", "#3F3A40", "#6E4A2A"],
    rim: "#A8823F",
    motifs: [
      // An owl's face inside a gear.
      () => `
        ${gear(0, 0, 150, 128, 24, "#CDBB94")}
        <circle cx="0" cy="0" r="104" fill="#3C3330" stroke="${INK}" stroke-width="6"/>
        <path d="M-80 -50 C -56 -80 -16 -74 0 -50 C 16 -74 56 -80 80 -50" fill="none" stroke="#CDBB94" stroke-width="10" stroke-linecap="round"/>
        <circle cx="-42" cy="-8" r="30" fill="${GOLD}" stroke="${INK}" stroke-width="5"/><circle cx="42" cy="-8" r="30" fill="${GOLD}" stroke="${INK}" stroke-width="5"/>
        <circle cx="-42" cy="-8" r="11" fill="${INK}"/><circle cx="42" cy="-8" r="11" fill="${INK}"/>
        <path d="M0 12 L-14 40 L0 68 L14 40Z" fill="#CDBB94" stroke="${INK}" stroke-width="5"/>`,
      // A wall of drawers; one stands open with its gold inside (who lives where, remembered).
      () => `
        ${gear(0, -118, 46, 36, 12, "#CDBB94")}
        <rect x="-120" y="-80" width="240" height="210" rx="10" fill="#4A3628" stroke="${INK}" stroke-width="7"/>
        ${[0, 1, 2]
          .flatMap((r) =>
            [0, 1].map(
              (c) =>
                `<rect x="${-104 + c * 108}" y="${-64 + r * 64}" width="100" height="54" rx="6" fill="${r === 1 && c === 1 ? GOLD : "#CDBB94"}" stroke="${INK}" stroke-width="5"/><circle cx="${-54 + c * 108}" cy="${-37 + r * 64}" r="6" fill="${INK}"/>`,
            ),
          )
          .join("")}`,
      // A gear sending three gold arrows to three small doors.
      () => `
        ${gear(0, 66, 70, 56, 14, "#CDBB94")}<circle cx="0" cy="66" r="22" fill="#3C3330" stroke="${INK}" stroke-width="5"/>
        ${[-110, 0, 110]
          .map(
            (x) =>
              `<path d="M${x - 30} -60 V-110 C ${x - 30} -140 ${x + 30} -140 ${x + 30} -110 V-60Z" fill="#3C3330" stroke="${BONE}" stroke-width="7"/>`,
          )
          .join("")}
        <g fill="none" stroke="${GOLD}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
          <path d="M-14 20 L-96 -44 M-96 -44 L-70 -44 M-96 -44 L-92 -20"/><path d="M0 12 V-48 M0 -48 L-16 -30 M0 -48 L16 -30"/><path d="M14 20 L96 -44 M96 -44 L70 -44 M96 -44 L92 -20"/>
        </g>`,
    ],
  },
  3: {
    fields: ["#93452F", "#2F3D5A", "#6B4A2E"],
    rim: "#6B4A2E",
    motifs: [
      // A house door with its number (three dots), a gold lantern above.
      () => `
        <path d="M-80 150 V10 C -80 -50 80 -50 80 10 V150Z" fill="#4A3628" stroke="${INK}" stroke-width="7"/>
        <path d="M0 -30 V150" stroke="${INK}" stroke-width="5"/><circle cx="-22" cy="70" r="6" fill="#CDBB94"/>
        ${[-40, 0, 40].map((x) => `<circle cx="${x}" cy="-68" r="12" fill="${BONE}" stroke="${INK}" stroke-width="4"/>`).join("")}
        <path d="M0 -176 V-150" stroke="${INK}" stroke-width="6"/>
        <path d="M-30 -138 H30 L20 -150 H-20Z" fill="#3C3330" stroke="${INK}" stroke-width="5"/>
        <path d="M-24 -138 H24 L18 -96 H-18Z" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>`,
      // Three narrow houses, each with its number; the middle window lit.
      () => `
        ${[-100, 0, 100]
          .map(
            (x, i) => `
          <path d="M${x - 46} 140 V-20 L${x} -80 L${x + 46} -20 V140Z" fill="${i === 1 ? "#E3D6B8" : "#CDBB94"}" stroke="${INK}" stroke-width="6"/>
          <rect x="${x - 16}" y="${i === 1 ? -6 : 10}" width="32" height="40" rx="14" fill="${i === 1 ? GOLD : "#3C3330"}" stroke="${INK}" stroke-width="4"/>
          ${Array.from({ length: i + 1 }, (_, k) => `<circle cx="${x - i * 9 + k * 18}" cy="84" r="7" fill="${INK}"/>`).join("")}`,
          )
          .join("")}`,
      // A sealed envelope with a gold seal and its house's number.
      () => `
        <rect x="-140" y="-80" width="280" height="180" rx="10" fill="${BONE}" stroke="${INK}" stroke-width="7"/>
        <path d="M-140 -80 L0 30 L140 -80" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
        <circle cx="0" cy="30" r="34" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>
        ${[-14, 0, 14].map((x) => `<circle cx="${x}" cy="30" r="5" fill="#9C6E25"/>`).join("")}
        ${[-36, 0, 36].map((x) => `<circle cx="${x}" cy="-126" r="11" fill="${BONE}" stroke="${INK}" stroke-width="4"/>`).join("")}`,
    ],
  },
  4: {
    fields: ["#2F3656", "#553030", "#3B4733"],
    rim: "#C9B497",
    motifs: [
      // A winged pointed arch, a road of gold crossing through it.
      () => `
        <path d="M-60 20 C -106 -30 -160 -30 -196 -66 C -164 -10 -164 20 -136 42 C -156 50 -172 50 -186 46 C -146 80 -96 76 -60 60Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <path d="M60 20 C 106 -30 160 -30 196 -66 C 164 -10 164 20 136 42 C 156 50 172 50 186 46 C 146 80 96 76 60 60Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <path d="M-60 150 V-30 C -60 -100 0 -150 0 -150 C 0 -150 60 -100 60 -30 V150Z" fill="${BONE}" stroke="${INK}" stroke-width="7"/>
        <path d="M-34 150 V-20 C -34 -70 0 -106 0 -106 C 0 -106 34 -70 34 -20 V150Z" fill="#2F3656" stroke="${INK}" stroke-width="5"/>
        <path d="M-160 110 C -56 70 56 70 160 110" fill="none" stroke="${GOLD}" stroke-width="12" stroke-linecap="round"/>`,
      // Four roads meeting at a gold star: the crossing.
      () => `
        <g stroke="${BONE}" stroke-width="30" stroke-linecap="round"><path d="M-150 0 H150"/><path d="M0 -150 V150"/></g>
        <g stroke="${INK}" stroke-width="4" stroke-dasharray="14 12"><path d="M-136 0 H-40 M40 0 H136"/><path d="M0 -136 V-40 M0 40 V136"/></g>
        ${[
          [-150, 0],
          [150, 0],
          [0, -150],
          [0, 150],
        ]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="#CDBB94" stroke="${INK}" stroke-width="5"/>`)
          .join("")}
        <path d="M0 -58 L14 -14 L58 0 L14 14 L0 58 L-14 14 L-58 0 L-14 -14Z" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>`,
      // A bridge of one great arch between two towers, a gold path along its top.
      () => `
        <path d="M-150 120 V-60 L-120 -100 L-90 -60 V120Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <path d="M90 120 V-60 L120 -100 L150 -60 V120Z" fill="${BONE}" stroke="${INK}" stroke-width="6"/>
        <path d="M-90 -20 H90 V120 H60 C 60 30 -60 30 -60 120 H-90Z" fill="#CDBB94" stroke="${INK}" stroke-width="6"/>
        <path d="M-120 -30 H120" stroke="${GOLD}" stroke-width="12" stroke-linecap="round"/>`,
    ],
  },
};

const DIVISIONS = ["plain", "pale", "fess", "bordure"];

function leaf(x, y, angle, flip = false) {
  const s = flip ? -1 : 1;
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <path d="M0 0 C ${-34 * s} -40 ${-30 * s} -100 0 -128 C ${30 * s} -100 ${34 * s} -40 0 0Z" fill="#A9B98A" stroke="${INK}" stroke-width="5"/>
    <path d="M0 -6 V-118" stroke="${INK}" stroke-width="3"/></g>`;
}

function gear(cx, cy, outer, inner, teeth, fill) {
  const pts = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const r = i % 2 === 0 ? outer : inner;
    for (const d of [-0.32 / teeth, 0.32 / teeth])
      pts.push(`${(cx + r * Math.cos(a + d * Math.PI)).toFixed(1)} ${(cy + r * Math.sin(a + d * Math.PI)).toFixed(1)}`);
  }
  return `<path d="M${pts.join(" L")}Z" fill="${fill}" stroke="${INK}" stroke-width="6"/>`;
}

/** A field colour a little lighter or darker (for divisions). */
function tint(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(Math.min(255, Math.max(0, c + amount * (amount > 0 ? 255 - c : c))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function division(kind, field) {
  if (kind === "pale") return `<rect x="256" y="0" width="256" height="${H}" fill="${tint(field, 0.14)}"/>`;
  if (kind === "fess") return `<rect x="0" y="330" width="${W}" height="${H}" fill="${tint(field, -0.25)}"/>`;
  return "";
}

function svg(region, variant) {
  const r = REGIONS[region];
  const shapeName = Object.keys(SHAPES)[Math.floor(variant / 3) % 4];
  const shape = SHAPES[shapeName];
  const motif = r.motifs[variant % 3];
  const field = r.fields[(variant + Math.floor(variant / 3)) % 3];
  const div = DIVISIONS[(variant * 5) % 4];
  const [cx, cy] = shape.centre;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<!-- Region ${region}, variant ${variant}: ${shapeName}, motif ${variant % 3}, field ${field}, ${div}. Made by tools/art/emblems.mjs. -->
<defs>
  <clipPath id="shape"><path d="${shape.outer}"/></clipPath>
  <linearGradient id="gold" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="#F6DA86"/><stop offset="0.5" stop-color="#D9A640"/><stop offset="1" stop-color="#A9782E"/>
  </linearGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity="0.32"/>
  </linearGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="${tint(r.rim, 0.45)}"/><stop offset="0.45" stop-color="${r.rim}"/><stop offset="1" stop-color="${tint(r.rim, -0.55)}"/>
  </linearGradient>
  <!-- Painted relief: a highlight from the top left on every raised edge, a soft shadow below. -->
  <filter id="relief" x="-15%" y="-15%" width="130%" height="130%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur"/>
    <feSpecularLighting in="blur" surfaceScale="5" specularConstant="0.75" specularExponent="16" lighting-color="#fff" result="spec">
      <feDistantLight azimuth="225" elevation="40"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.6" k4="0" result="lit"/>
    <feOffset in="SourceAlpha" dx="4" dy="7" result="off"/>
    <feGaussianBlur in="off" stdDeviation="5" result="offBlur"/>
    <feFlood flood-color="#000" flood-opacity="0.45"/>
    <feComposite in2="offBlur" operator="in" result="shadow"/>
    <feMerge><feMergeNode in="shadow"/><feMergeNode in="lit"/></feMerge>
  </filter>
  <filter id="grain" x="0" y="0" width="1" height="1">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="${region * 13 + variant}"/>
    <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.24  0 0 0 0 0.17  0 0 0 0.14 0"/>
    <feComposite in2="SourceGraphic" operator="in"/>
  </filter>
</defs>
${shape.rod ? `<g filter="url(#relief)"><rect x="52" y="58" width="408" height="18" rx="9" fill="#5A4636" stroke="${INK}" stroke-width="5"/><circle cx="52" cy="67" r="15" fill="url(#rim)" stroke="${INK}" stroke-width="4"/><circle cx="460" cy="67" r="15" fill="url(#rim)" stroke="${INK}" stroke-width="4"/></g>` : ""}
<g filter="url(#relief)">
  <g clip-path="url(#shape)">
    <rect width="${W}" height="${H}" fill="${field}"/>
    ${division(div, field)}
    <rect width="${W}" height="${H}" fill="url(#shade)"/>
    <rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)"/>
  </g>
  <path d="${shape.outer}" fill="none" stroke="url(#rim)" stroke-width="${div === "bordure" ? 34 : 22}"/>
  <path d="${shape.outer}" fill="none" stroke="${INK}" stroke-width="5"/>
</g>
<g filter="url(#relief)" transform="translate(${cx} ${cy}) scale(${shape.scale})">${motif()}</g>
</svg>`;
}

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const region of [1, 2, 3, 4])
  for (let v = 0; v < VARIANTS; v++) {
    const name = `r${region}-${String(v).padStart(2, "0")}`;
    const svgPath = join(SRC, `${name}.svg`);
    const png = join(SRC, `${name}.png`);
    writeFileSync(svgPath, svg(region, v));
    execFileSync("inkscape", [svgPath, "-o", png, "-w", String(W)], { stdio: "ignore" });
    execFileSync("magick", [png, "-quality", "88", join(OUT, `${name}.webp`)]);
    execFileSync("rm", [png]);
  }
console.log(`${4 * VARIANTS} emblems written to ${OUT}`);
