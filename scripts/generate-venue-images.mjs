/**
 * Generates a placeholder image for every venue.
 *
 * These stand in for photography of the Playhouse spaces. Each is drawn in
 * one-point perspective so it reads as a room rather than a pattern: a
 * customer scanning the listing can tell a theatre from a rehearsal studio
 * before reading the caption, and an unphotographed venue still looks
 * deliberate rather than broken.
 *
 * Deliberately text-free. The venue name is rendered by the page, and these
 * images are also used as page heroes, where baked-in text would duplicate the
 * heading.
 *
 * Run:  node scripts/generate-venue-images.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";

const W = 800;
const H = 500;
const OUT = "public/venues";

const n = (v) => Number(v).toFixed(1);

/**
 * Shared scaffolding: wall wash, a light pool near the vanishing point, edge
 * vignette and a floor shadow gradient.
 */
function frame(id, palette, body) {
  const { wall, deep, light } = palette;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Venue placeholder">
  <defs>
    <linearGradient id="w${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${deep}"/>
      <stop offset="45%" stop-color="${wall}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="pool${id}" cx="0.5" cy="0.54" r="0.5">
      <stop offset="0%" stop-color="${light}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${light}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fl${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.62"/>
    </linearGradient>
    <linearGradient id="ceil${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0.62"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.06"/>
    </linearGradient>
    <radialGradient id="vig${id}" cx="0.5" cy="0.5" r="0.78">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <radialGradient id="lamp${id}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fff8e2" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#ffe9b0" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#ffd98a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#w${id})"/>
  <rect width="${W}" height="${H}" fill="url(#pool${id})"/>
${body}
  <rect width="${W}" height="${H}" fill="url(#vig${id})"/>
</svg>`;
}

/** A soft practical light. */
const lamp = (id, x, y, r) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#lamp${id})"/>`;

// ---------------------------------------------------------------- theatre

/**
 * Auditorium seen from the stage, in one of three house types.
 *
 * The Playhouse's theatres differ structurally, not just in decor, so the
 * placeholders differ the same way. Recolouring one drawing three times made
 * them read as the same room, which is the opposite of useful in a listing.
 *
 *   grand     two tiers, balcony, side boxes, ornate arch   (Opera, 1 224)
 *   midscale  single tier, curved ceiling baffles           (Drama, 468)
 *   blackbox  retractable bleachers, exposed rig, no arch   (Loft, 136)
 */
function theatre(id, p, variant) {
  const seat = p.seat;
  const cfg = {
    grand:    { rows: 14, frontY: 458, backY: 246, nearHalf: 384, farHalf: 196, seatNear: 22, seatFar: 8 },
    midscale: { rows: 11, frontY: 460, backY: 282, nearHalf: 372, farHalf: 218, seatNear: 23, seatFar: 11 },
    blackbox: { rows: 7,  frontY: 462, backY: 330, nearHalf: 322, farHalf: 214, seatNear: 26, seatFar: 15 },
  }[variant];

  const stalls = [];
  for (let r = 0; r < cfg.rows; r++) {
    const t = r / (cfg.rows - 1);
    const y = cfg.frontY - t * (cfg.frontY - cfg.backY);
    const half = cfg.nearHalf - t * (cfg.nearHalf - cfg.farHalf);
    const seatH = cfg.seatNear - t * (cfg.seatNear - cfg.seatFar);
    const count = variant === "blackbox" ? 13 : 19;
    const gap = variant === "blackbox" ? 4.5 - t * 2 : 3.4 - t * 1.7;
    const seatW = (half * 2) / count - gap;
    const cells = [];
    for (let i = 0; i < count; i++) {
      const x = 400 - half + i * (seatW + gap);
      const norm = (i - (count - 1) / 2) / ((count - 1) / 2);
      // A curved house bows its rows; a black box seats in straight bleachers.
      const bow = variant === "blackbox" ? 0 : norm * norm * (15 - t * 9);
      cells.push(
        `<rect x="${n(x)}" y="${n(y - bow)}" width="${n(seatW)}" height="${n(seatH)}" rx="${n(seatH * 0.34)}"/>`,
      );
    }
    // Bleachers sit on visible risers rather than a smooth rake.
    const riser =
      variant === "blackbox"
        ? `<rect x="${n(400 - half - 8)}" y="${n(y + seatH)}" width="${n(half * 2 + 16)}" height="7" fill="#000" opacity="0.5"/>`
        : "";
    stalls.push(
      `<g fill="${seat}" opacity="${(0.9 - t * 0.34).toFixed(2)}">${cells.join("")}</g>${riser}`,
    );
  }

  // ---- grand house only: balcony rows, fascia and side boxes
  let upper = "";
  if (variant === "grand") {
    const balcony = [];
    for (let r = 0; r < 4; r++) {
      const t = r / 3;
      const y = 202 - t * 26;
      const half = 212 - t * 22;
      const count = 17;
      const seatW = (half * 2) / count - 1.6;
      const cells = [];
      for (let i = 0; i < count; i++) {
        cells.push(
          `<rect x="${n(400 - half + i * (seatW + 1.6))}" y="${n(y)}" width="${n(seatW)}" height="7" rx="2.5"/>`,
        );
      }
      balcony.push(
        `<g fill="${seat}" opacity="${(0.42 + t * 0.1).toFixed(2)}">${cells.join("")}</g>`,
      );
    }
    upper = `  <path d="M146 230 L654 230 L640 258 L160 258 z" fill="#000" opacity="0.5"/>
  <rect x="158" y="172" width="484" height="60" fill="#000" opacity="0.30"/>
${balcony.join("\n")}
  <g fill="${p.gilt}" opacity="0.34">
    ${[196, 292, 400, 508, 604].map((x) => `<rect x="${x}" y="240" width="26" height="4" rx="2"/>`).join("")}
  </g>
  <!-- side boxes -->
  <g fill="#000" opacity="0.42">
    <path d="M108 236 L158 224 L158 288 L108 302 z"/>
    <path d="M${W - 108} 236 L${W - 158} 224 L${W - 158} 288 L${W - 108} 302 z"/>
  </g>
  <g fill="${p.gilt}" opacity="0.28">
    <rect x="112" y="248" width="42" height="4" rx="2"/>
    <rect x="${W - 154}" y="248" width="42" height="4" rx="2"/>
  </g>
  <!-- gilt banding along the balcony front and box fronts -->
  <path d="M158 168 Q400 150 642 168" fill="none" stroke="${p.gilt}" stroke-opacity="0.26" stroke-width="3"/>`;
  }

  // ---- mid-scale only: curved ceiling baffles, as in the Drama Theatre
  let ceiling = "";
  if (variant === "midscale") {
    ceiling = `  <g fill="none" stroke="${p.gilt}" stroke-opacity="0.22" stroke-width="14" stroke-linecap="round">
    <path d="M60 96 Q400 30 740 96"/>
    <path d="M96 148 Q400 88 704 148"/>
    <path d="M140 196 Q400 144 660 196"/>
  </g>
  <g fill="#fff" opacity="0.10">
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${112 + i * 82}" cy="${122 - Math.abs(3.5 - i) * 5}" r="3.5"/>`).join("")}
  </g>`;
  }

  // ---- black box only: exposed truss and prominent lanterns
  let rig = "";
  if (variant === "blackbox") {
    rig = `  <g stroke="#000" stroke-opacity="0.62" stroke-width="5">
    <line x1="40" y1="40" x2="760" y2="40"/>
    <line x1="40" y1="96" x2="760" y2="96"/>
    <line x1="40" y1="152" x2="760" y2="152"/>
    <line x1="120" y1="30" x2="120" y2="162"/>
    <line x1="400" y1="30" x2="400" y2="162"/>
    <line x1="680" y1="30" x2="680" y2="162"/>
  </g>
  ${[96, 236, 400, 564, 704].map((x) => lamp(id, x, 40, 42)).join("\n  ")}
  ${[168, 320, 480, 632].map((x) => lamp(id, x, 96, 32)).join("\n  ")}
  <g fill="#000" opacity="0.7">
    ${[96, 236, 400, 564, 704].map((x) => `<rect x="${x - 9}" y="30" width="18" height="20" rx="4"/>`).join("")}
    ${[168, 320, 480, 632].map((x) => `<rect x="${x - 7}" y="88" width="14" height="17" rx="3"/>`).join("")}
  </g>`;
  }

  const houseLights =
    variant === "blackbox"
      ? ""
      : `  <g stroke="#000" stroke-opacity="0.5" stroke-width="6">
    <line x1="90" y1="46" x2="710" y2="46"/>
  </g>
  ${[150, 262, 400, 538, 650].map((x) => lamp(id, x, 46, 32)).join("\n  ")}
  <g fill="#000" opacity="0.55">
    ${[150, 262, 400, 538, 650].map((x) => `<rect x="${x - 7}" y="38" width="14" height="16" rx="3"/>`).join("")}
  </g>`;

  return `  <rect x="0" y="0" width="${W}" height="${variant === "blackbox" ? 200 : 150}" fill="url(#ceil${id})"/>
${ceiling}
${rig}
${houseLights}
  <!-- side walls converging toward the rear -->
  <path d="M0 0 L118 168 L118 356 L0 500 z" fill="#000" opacity="${variant === "blackbox" ? 0.5 : 0.34}"/>
  <path d="M${W} 0 L${W - 118} 168 L${W - 118} 356 L${W} 500 z" fill="#000" opacity="${variant === "blackbox" ? 0.5 : 0.34}"/>
${upper}
  <!-- exit signs -->
  <rect x="128" y="292" width="22" height="11" rx="2" fill="#6fe08a" opacity="0.55"/>
  <rect x="650" y="292" width="22" height="11" rx="2" fill="#6fe08a" opacity="0.55"/>

${stalls.join("\n")}

  <!-- stage lip in the foreground -->
  <path d="M0 500 L0 470 Q400 452 ${W} 470 L${W} 500 z" fill="#000" opacity="0.55"/>
  <path d="M0 474 Q400 456 ${W} 474" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2"/>`;
}

// -------------------------------------------------------------- function

/**
 * Reception room: coffered ceiling, arched windows on the rear wall, trellis
 * side walls, chandeliers receding on the centre line and a polished floor.
 */
function functionRoom(id, p) {
  // Trellis lattice on a side wall, skewed to follow the perspective.
  const lattice = (x1, y1, x2, y2, flip) => {
    const lines = [];
    for (let i = -6; i < 16; i++) {
      const o = i * 34;
      lines.push(
        flip
          ? `<line x1="${n(x1 + o)}" y1="${n(y1)}" x2="${n(x1 + o - 120)}" y2="${n(y2)}"/>`
          : `<line x1="${n(x1 + o)}" y1="${n(y1)}" x2="${n(x1 + o + 120)}" y2="${n(y2)}"/>`,
      );
    }
    return `<g stroke="${p.trellis}" stroke-opacity="0.30" stroke-width="2">${lines.join("")}</g>`;
  };

  const windows = [0, 1, 2].map((i) => {
    const x = 268 + i * 96;
    return `<g>
      <path d="M${x} 320 L${x} 214 q28 -34 56 0 L${x + 56} 320 z" fill="#fff" opacity="0.30"/>
      <path d="M${x} 320 L${x} 214 q28 -34 56 0 L${x + 56} 320 z" fill="none" stroke="#fff" stroke-opacity="0.42" stroke-width="2"/>
      <line x1="${x + 28}" y1="192" x2="${x + 28}" y2="320" stroke="#fff" stroke-opacity="0.34" stroke-width="1.6"/>
      <line x1="${x}" y1="256" x2="${x + 56}" y2="256" stroke="#fff" stroke-opacity="0.34" stroke-width="1.6"/>
    </g>`;
  });

  // Chandeliers shrink as they recede along the centre line.
  const chandelier = (cx, cy, s) => {
    const drops = [-3, -2, -1, 0, 1, 2, 3]
      .map((k) => {
        const x = cx + k * 7 * s;
        const len = (16 - Math.abs(k) * 2.5) * s;
        return `<line x1="${n(x)}" y1="${n(cy)}" x2="${n(x)}" y2="${n(cy + len)}" stroke="#ffe9b8" stroke-opacity="0.6" stroke-width="${n(1.4 * s)}"/><circle cx="${n(x)}" cy="${n(cy + len)}" r="${n(2 * s)}" fill="#fff3d0" opacity="0.85"/>`;
      })
      .join("");
    return `<g>
      ${lamp(id, cx, cy + 8 * s, 46 * s)}
      <line x1="${n(cx)}" y1="${n(cy - 40 * s)}" x2="${n(cx)}" y2="${n(cy - 6 * s)}" stroke="#ffe9b8" stroke-opacity="0.45" stroke-width="${n(1.6 * s)}"/>
      <ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(26 * s)}" ry="${n(5 * s)}" fill="#ffeec2" opacity="0.55"/>
      ${drops}
    </g>`;
  };

  return `  <!-- coffered ceiling -->
  <path d="M0 0 L${W} 0 L560 150 L240 150 z" fill="#000" opacity="0.34"/>
  <g stroke="#fff" stroke-opacity="0.12" stroke-width="2" fill="none">
    <path d="M0 34 L${W} 34"/>
    <path d="M120 0 L268 150"/>
    <path d="M${W - 120} 0 L${W - 268} 150"/>
  </g>

  <!-- side walls -->
  <path d="M0 0 L240 150 L240 330 L0 500 z" fill="#000" opacity="0.30"/>
  <path d="M${W} 0 L560 150 L560 330 L${W} 500 z" fill="#000" opacity="0.30"/>
  ${lattice(-40, 150, -160, 330, false)}
  ${lattice(760, 150, 880, 330, true)}

  <!-- rear wall with arched windows -->
  <rect x="240" y="150" width="320" height="180" fill="#fff" opacity="0.05"/>
  ${windows.join("\n  ")}

  <!-- chandeliers on the centre line -->
  ${chandelier(400, 176, 0.55)}
  ${chandelier(400, 118, 1)}

  <!-- polished floor -->
  <path d="M240 330 L560 330 L${W} 500 L0 500 z" fill="url(#fl${id})"/>
  <g stroke="#fff" stroke-opacity="0.10" stroke-width="1.6">
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<line x1="${n(240 + i * 53.3)}" y1="330" x2="${n(-60 + i * 153)}" y2="500"/>`).join("\n    ")}
  </g>
  <!-- reflections of the windows and chandelier in the floor -->
  <g fill="#fff" opacity="0.11">
    ${[0, 1, 2].map((i) => `<path d="M${268 + i * 96} 332 L${324 + i * 96} 332 L${340 + i * 118} 470 L${256 + i * 118} 470 z"/>`).join("\n    ")}
  </g>
  <path d="M382 332 L418 332 L442 500 L358 500 z" fill="#ffeec2" opacity="0.13"/>
  <line x1="240" y1="330" x2="560" y2="330" stroke="#fff" stroke-opacity="0.20" stroke-width="2"/>`;
}

// ------------------------------------------------------------- rehearsal

/** Studio: mirrored rear wall, barre, sprung floor, strip lighting. */
function rehearsal(id, p) {
  const boards = [];
  for (let i = 0; i <= 9; i++) {
    boards.push(
      `<line x1="${n(226 + i * 38.6)}" y1="336" x2="${n(-140 + i * 120)}" y2="500"/>`,
    );
  }

  return `  <!-- ceiling with strip lights receding -->
  <path d="M0 0 L${W} 0 L574 148 L226 148 z" fill="#000" opacity="0.40"/>
  <g fill="#fff" opacity="0.16">
    <rect x="264" y="120" width="272" height="7" rx="3"/>
    <rect x="188" y="74" width="424" height="8" rx="4"/>
    <rect x="96" y="22" width="608" height="9" rx="4"/>
  </g>
  ${lamp(id, 400, 78, 190)}

  <!-- side walls -->
  <path d="M0 0 L226 148 L226 336 L0 500 z" fill="#000" opacity="0.28"/>
  <path d="M${W} 0 L574 148 L574 336 L${W} 500 z" fill="#000" opacity="0.28"/>

  <!-- mirrored rear wall -->
  <rect x="226" y="148" width="348" height="188" fill="#fff" opacity="0.15"/>
  <rect x="226" y="148" width="348" height="188" fill="none" stroke="#fff" stroke-opacity="0.30" stroke-width="2.5"/>
  <g stroke="#fff" stroke-opacity="0.16" stroke-width="1.6">
    <line x1="342" y1="148" x2="342" y2="336"/>
    <line x1="458" y1="148" x2="458" y2="336"/>
  </g>
  <!-- glancing reflections across the glass -->
  <path d="M240 336 L346 148 L392 148 L286 336 z" fill="#fff" opacity="0.09"/>
  <path d="M430 336 L536 148 L560 148 L454 336 z" fill="#fff" opacity="0.06"/>
  <!-- the room reflected back: a faint second barre and floor line -->
  <line x1="236" y1="286" x2="564" y2="286" stroke="#fff" stroke-opacity="0.20" stroke-width="2"/>

  <!-- barre along the rear wall -->
  <line x1="226" y1="292" x2="574" y2="292" stroke="${p.timber}" stroke-opacity="0.85" stroke-width="6" stroke-linecap="round"/>
  ${[248, 400, 552].map((x) => `<line x1="${x}" y1="292" x2="${x}" y2="336" stroke="#000" stroke-opacity="0.4" stroke-width="4"/>`).join("\n  ")}
  <!-- barre continuing down the left wall, in perspective -->
  <line x1="0" y1="352" x2="226" y2="292" stroke="${p.timber}" stroke-opacity="0.6" stroke-width="6" stroke-linecap="round"/>

  <!-- sprung floor -->
  <path d="M226 336 L574 336 L${W} 500 L0 500 z" fill="url(#fl${id})"/>
  <g stroke="#fff" stroke-opacity="0.09" stroke-width="1.8">
    ${boards.join("\n    ")}
  </g>
  <line x1="226" y1="336" x2="574" y2="336" stroke="#fff" stroke-opacity="0.22" stroke-width="2"/>`;
}

// ---------------------------------------------------------------- studio

/** Control room: acoustic treatment, condenser microphone, monitors, desk. */
function studio(id, p) {
  const panels = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      const x = 248 + c * 39;
      const y = 116 + r * 34;
      // Alternating tilt reads as wedge foam.
      const flip = (r + c) % 2 === 0;
      panels.push(
        `<path d="M${x} ${y} l33 0 l0 28 l-33 0 z" fill="#fff" opacity="${flip ? 0.13 : 0.05}"/>`,
      );
    }
  }

  return `  <!-- ceiling -->
  <path d="M0 0 L${W} 0 L560 100 L240 100 z" fill="#000" opacity="0.45"/>
  ${lamp(id, 400, 128, 200)}

  <!-- side walls with vertical bass traps -->
  <path d="M0 0 L240 100 L240 330 L0 500 z" fill="#000" opacity="0.32"/>
  <path d="M${W} 0 L560 100 L560 330 L${W} 500 z" fill="#000" opacity="0.32"/>
  <g fill="#fff" opacity="0.07">
    <path d="M60 60 L150 108 L150 330 L60 420 z"/>
    <path d="M${W - 60} 60 L${W - 150} 108 L${W - 150} 330 L${W - 60} 420 z"/>
  </g>

  <!-- treated rear wall -->
  <rect x="240" y="100" width="320" height="230" fill="#fff" opacity="0.04"/>
  <g>${panels.join("")}</g>

  <!-- studio monitors flanking the rear wall -->
  <g fill="#000" opacity="0.5">
    <rect x="196" y="216" width="46" height="70" rx="4"/>
    <rect x="558" y="216" width="46" height="70" rx="4"/>
  </g>
  <g fill="#fff" opacity="0.16">
    <circle cx="219" cy="242" r="14"/><circle cx="219" cy="270" r="7"/>
    <circle cx="581" cy="242" r="14"/><circle cx="581" cy="270" r="7"/>
  </g>

  <!-- floor -->
  <path d="M240 330 L560 330 L${W} 500 L0 500 z" fill="url(#fl${id})"/>
  <line x1="240" y1="330" x2="560" y2="330" stroke="#fff" stroke-opacity="0.18" stroke-width="2"/>

  <!-- mixing desk silhouette in the foreground -->
  <path d="M108 500 L146 404 L654 404 L692 500 z" fill="#000" opacity="0.62"/>
  <g fill="#fff" opacity="0.20">
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${186 + i * 44}" y="424" width="26" height="5" rx="2"/>`).join("")}
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<circle cx="${199 + i * 44}" cy="448" r="4"/>`).join("")}
  </g>

  <!-- condenser microphone on a boom -->
  <path d="M628 404 q0 -74 -92 -74 l-58 0" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="6"/>
  <g>
    <rect x="432" y="272" width="52" height="106" rx="26" fill="${p.timber}" opacity="0.55"/>
    <rect x="432" y="272" width="52" height="106" rx="26" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="2.5"/>
    <g stroke="#fff" stroke-opacity="0.28" stroke-width="1.8">
      ${[0, 1, 2, 3, 4].map((i) => `<line x1="440" y1="${292 + i * 16}" x2="476" y2="${292 + i * 16}"/>`).join("")}
    </g>
  </g>
  <!-- pop shield -->
  <ellipse cx="368" cy="322" rx="30" ry="40" fill="#fff" opacity="0.07"/>
  <ellipse cx="368" cy="322" rx="30" ry="40" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2.5"/>
  <path d="M398 322 q22 0 34 24" fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="5"/>`;
}

const MOTIFS = { theatre, functionRoom, rehearsal, studio };

/**
 * slug, motif, palette. Hues vary per venue so neighbouring cards in the
 * listing stay distinguishable at a glance.
 */
const VENUES = [
  ["opera-theatre", "theatre", { wall: "#7a1230", deep: "#22000a", light: "#ffcda6", seat: "#c0102b", gilt: "#e8c07a" }, "grand"],
  ["drama-theatre", "theatre", { wall: "#4a3f6e", deep: "#150f28", light: "#cfc0ff", seat: "#b8324a", gilt: "#c9b6f0" }, "midscale"],
  ["loft-theatre", "theatre", { wall: "#26262b", deep: "#0a0a0c", light: "#ffe3b0", seat: "#d4342f", gilt: "#8f8f96" }, "blackbox"],

  ["grand-foyer", "functionRoom", { wall: "#8d6f22", deep: "#2b1f04", light: "#ffe6a8", trellis: "#ffe8b0" }],
  ["alhambra", "functionRoom", { wall: "#2f6b58", deep: "#0a2019", light: "#d8fff0", trellis: "#bff0dc" }],
  ["vip-room", "functionRoom", { wall: "#6a3730", deep: "#210d0a", light: "#ffcfae", trellis: "#ffd9bd" }],
  ["tudor-room", "functionRoom", { wall: "#4f3b1c", deep: "#180f04", light: "#ffdda0", trellis: "#f0d7a8" }],

  ["room-503", "rehearsal", { wall: "#2c5c46", deep: "#0a1c14", light: "#cfffe6", timber: "#e8c48a" }],
  ["room-506", "rehearsal", { wall: "#23565c", deep: "#071c1f", light: "#cdf3ff", timber: "#e8c48a" }],
  ["room-507", "rehearsal", { wall: "#2a4a66", deep: "#08161f", light: "#cfe6ff", timber: "#e8c48a" }],
  ["room-508", "rehearsal", { wall: "#383a68", deep: "#101024", light: "#d7d5ff", timber: "#e8c48a" }],
  ["room-410", "rehearsal", { wall: "#4a5526", deep: "#161a08", light: "#eaffb8", timber: "#e8c48a" }],
  ["room-a1", "rehearsal", { wall: "#553f66", deep: "#1a1122", light: "#f0d9ff", timber: "#e8c48a" }],

  ["studio-3", "studio", { wall: "#22394a", deep: "#060f16", light: "#a8d8ff", timber: "#d8dde2" }],
];

mkdirSync(OUT, { recursive: true });

for (const [slug, motif, palette, variant] of VENUES) {
  const id = slug.replace(/[^a-z0-9]/gi, "");
  writeFileSync(
    `${OUT}/${slug}.svg`,
    frame(id, palette, MOTIFS[motif](id, palette, variant)),
  );
}

console.log(`wrote ${VENUES.length} venue placeholders to ${OUT}/`);
for (const m of Object.keys(MOTIFS)) {
  console.log(`  ${m.padEnd(14)} ${VENUES.filter((v) => v[1] === m).length}`);
}
