// Perfboard model: parsing hole names, checking the wiring against the
// declared netlist, and drawing the board as SVG (top and bottom view).
//
// Holes are named like on printed perfboards: column letter + row number,
// e.g. "E4" = column E, row 4. "A1" is the top-left hole of the top view.

const PITCH = 24; // px per 2.54 mm hole
const PAD_SIDE = 120; // room for coordinates, overhanging parts and off-board leads
const PAD_TOP = 34;
const PAD_BOTTOM = 26;

// Pin names per kind, in the order the drawing functions receive them.
const KIND_PINS = {
  resistor: ['1', '2'],
  led: ['A', 'K'],
  buzzer: ['+', '-'],
  terminal: ['1', '2'],
  transistor: ['C', 'B', 'E'],
  ldr: ['1', '2'],
  elko: ['+', '-'],
  cap: ['1', '2'],
  button: ['1', '2'],
  jumper: ['1', '2'],
  toroid: ['r1', 'r2', 'g1', 'g2'],
};

/** Pin names of a catalog entry (DIP chips and off-board leads are configurable). */
export function pinsOf(entry) {
  if (!entry) return undefined;
  if (entry.kind === 'leads') return entry.leads?.pins || ['+', '-'];
  const dip = /^dip(\d+)$/.exec(entry.kind || '');
  if (dip) return Array.from({ length: Number(dip[1]) }, (_, i) => String(i + 1));
  return KIND_PINS[entry.kind];
}

export function parseHole(name) {
  const m = /^([A-Z])([0-9]{1,2})$/.exec(name);
  if (!m) throw new Error(`invalid hole "${name}" (expected e.g. "E4")`);
  return { c: m[1].charCodeAt(0) - 65, r: Number(m[2]) - 1 };
}

const holeName = (c, r) => String.fromCharCode(65 + c) + (r + 1);

/**
 * Pin holes of a DIP chip (in its socket) from the hole of pin 1.
 * rotate 0:   notch up, pin 1 top-left, pins 1..n/2 go down, the rest come back up 3 columns right.
 * rotate 270: notch left, pin 1 bottom-left, pins 1..n/2 go right, the rest come back 3 rows up.
 * (90 and 180 are the same turned further.)
 */
export function dipPins(pin1, n, rotate = 0) {
  const { c, r } = parseHole(pin1);
  const half = n / 2;
  const turn = ({ x, y }) => ({ 0: [x, y], 90: [-y, x], 180: [-x, -y], 270: [y, -x] }[rotate]);
  const pins = {};
  for (let k = 1; k <= half; k++) {
    const [dx, dy] = turn({ x: 0, y: k - 1 });
    pins[k] = holeName(c + dx, r + dy);
    const [ex, ey] = turn({ x: 3, y: k - 1 });
    pins[n + 1 - k] = holeName(c + ex, r + ey);
  }
  return pins;
}

// ---------------------------------------------------------------- checking

/**
 * Verifies a project's board: holes on the board, no two pins in one hole,
 * bridges straight and not running over foreign holes, and the resulting
 * connections exactly match project.nets. Returns a list of error strings.
 * A net with a single pin means "not connected" (e.g. an unused chip pin).
 */
export function checkBoard(project, catalog) {
  const errors = [];
  const { board, nets } = project;
  const pinAt = new Map(); // hole -> "REF.pin"
  const inBoard = ({ c, r }) => c >= 0 && r >= 0 && c < board.cols && r < board.rows;

  for (const p of board.parts) {
    const expected = pinsOf(catalog[p.part]);
    if (!expected) {
      errors.push(`board part ${p.ref}: part "${p.part}" has no drawable kind`);
      continue;
    }
    const got = Object.keys(p.pins || {});
    if (got.length !== expected.length || !expected.every((k) => got.includes(k))) {
      errors.push(`board part ${p.ref}: pins must be ${expected.join(', ')} (got ${got.join(', ') || 'none'})`);
    }
    for (const [pin, hole] of Object.entries(p.pins || {})) {
      let h;
      try { h = parseHole(hole); } catch (e) { errors.push(`${p.ref}.${pin}: ${e.message}`); continue; }
      if (!inBoard(h)) errors.push(`${p.ref}.${pin}: hole ${hole} is outside the ${board.cols}x${board.rows} board`);
      if (pinAt.has(hole)) errors.push(`hole ${hole} is used by both ${pinAt.get(hole)} and ${p.ref}.${pin}`);
      pinAt.set(hole, `${p.ref}.${pin}`);
    }
  }

  // Union-find over holes.
  const parent = new Map();
  const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const hole of pinAt.keys()) parent.set(hole, hole);

  // A jumper wire connects its two ends.
  for (const p of board.parts.filter((x) => catalog[x.part]?.kind === 'jumper')) union(p.pins['1'], p.pins['2']);

  const coveredBy = new Map(); // hole -> [{bridge, listed}]
  for (const b of board.bridges) {
    const pts = b.points.map((n) => ({ n, ...parseHole(n) }));
    pts.forEach((p) => { if (!inBoard(p)) errors.push(`bridge ${b.id}: hole ${p.n} is outside the board`); });
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], z = pts[i];
      if (a.c !== z.c && a.r !== z.r) {
        errors.push(`bridge ${b.id}: ${a.n} -> ${z.n} must be straight (same row or same column)`);
        continue;
      }
      const steps = Math.max(Math.abs(z.c - a.c), Math.abs(z.r - a.r));
      for (let s = 0; s <= steps; s++) {
        const c = a.c + Math.sign(z.c - a.c) * s, r = a.r + Math.sign(z.r - a.r) * s;
        const n = holeName(c, r);
        const listed = b.points.includes(n);
        if (!listed && pinAt.has(n)) {
          errors.push(`bridge ${b.id} runs over ${n} (${pinAt.get(n)}) without being soldered there - this would short it`);
        }
        const list = coveredBy.get(n) || [];
        if (!list.some((x) => x.bridge === b.id)) list.push({ bridge: b.id, listed });
        coveredBy.set(n, list);
      }
      union(a.n, z.n);
    }
  }
  for (const [n, list] of coveredBy) {
    if (list.length > 1 && !list.every((x) => x.listed)) {
      errors.push(`bridges ${list.map((x) => x.bridge).join(' and ')} cross at ${n}`);
    }
  }

  // Compare with declared nets.
  const pinHole = new Map([...pinAt].map(([h, p]) => [p, h]));
  const jumperPins = new Set(board.parts.filter((x) => catalog[x.part]?.kind === 'jumper').flatMap((x) => [`${x.ref}.1`, `${x.ref}.2`]));
  const seen = new Set();
  const netOfRoot = new Map();
  for (const [net, pins] of Object.entries(nets)) {
    const roots = new Set();
    for (const pin of pins) {
      if (!pinHole.has(pin)) { errors.push(`net ${net}: pin ${pin} is not on the board`); continue; }
      seen.add(pin);
      roots.add(find(pinHole.get(pin)));
    }
    if (roots.size > 1) errors.push(`net ${net} is not connected on the board (it falls apart into ${roots.size} pieces)`);
    for (const r of roots) {
      if (netOfRoot.has(r)) errors.push(`nets ${netOfRoot.get(r)} and ${net} are shorted together on the board`);
      netOfRoot.set(r, net);
    }
  }
  for (const pin of pinHole.keys()) {
    if (!seen.has(pin) && !jumperPins.has(pin)) errors.push(`pin ${pin} is not part of any net`);
  }
  return errors;
}

// ---------------------------------------------------------------- drawing

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RES_COLORS = ['#111', '#8b4513', '#e02020', '#ff8c00', '#f2d600', '#1e9e3a', '#1f5fd1', '#7b3fbf', '#888', '#fff'];

/** 4-band colour code for a resistance in ohms, e.g. 470 -> yellow violet brown gold. */
export function resistorBands(ohms) {
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const digits = Math.round(ohms / 10 ** exp);
  return [RES_COLORS[Math.floor(digits / 10)], RES_COLORS[digits % 10], RES_COLORS[exp] ?? '#111', '#c9a227'];
}

export function formatOhms(ohms) {
  if (ohms >= 1e6) return `${+(ohms / 1e6).toFixed(2)} MΩ`;
  if (ohms >= 1e3) return `${+(ohms / 1e3).toFixed(2)} kΩ`;
  return `${ohms} Ω`;
}

export function formatFarad(f) {
  if (f >= 1e-6) return `${+(f * 1e6).toFixed(2)} µF`;
  if (f >= 1e-9) return `${+(f * 1e9).toFixed(2)} nF`;
  return `${+(f * 1e12).toFixed(2)} pF`;
}

/** Human-readable value of a part: ohms for resistors, farads for capacitors. */
export function formatValue(kind, value) {
  if (value == null) return '';
  return kind === 'elko' || kind === 'cap' ? formatFarad(value) : formatOhms(value);
}

function geometry(board, mirror) {
  const width = 2 * PAD_SIDE + board.cols * PITCH;
  const height = PAD_TOP + board.rows * PITCH + PAD_BOTTOM;
  const xy = (hole) => {
    const { c, r } = parseHole(hole);
    const cc = mirror ? board.cols - 1 - c : c;
    return [PAD_SIDE + cc * PITCH + PITCH / 2, PAD_TOP + r * PITCH + PITCH / 2];
  };
  return { width, height, xy, left: PAD_SIDE, right: PAD_SIDE + board.cols * PITCH };
}

// Axis helpers for drawing a part between p1 and p2.
function axis(p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  // local (along, across) -> global
  const at = (u, v) => [mid[0] + u * ux - v * uy, mid[1] + u * uy + v * ux];
  return { mid, len, ux, uy, at, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const lead = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#a7adb4" stroke-width="3" stroke-linecap="round"/>`;
const label = (x, y, text, anchor = 'start', cls = 'ref') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(text)}</text>`;
const group = (ax, inner) => `<g transform="translate(${ax.mid[0]} ${ax.mid[1]}) rotate(${ax.deg})">${inner}</g>`;

function labelPos(ax, offset, side) {
  // Default: to the right of vertical parts, below horizontal ones. `side` overrides.
  side ||= Math.abs(ax.uy) > Math.abs(ax.ux) ? 'right' : 'below';
  const [x, y] = ax.mid;
  return {
    right: { x: x + offset, y: y + 4, anchor: 'start' },
    left: { x: x - offset, y: y + 4, anchor: 'end' },
    below: { x, y: y + offset + 10, anchor: 'middle' },
    above: { x, y: y - offset, anchor: 'middle' },
  }[side];
}

// Ref label beside a part; with a value it becomes two short lines ("R2" / "47 kΩ").
const refLabel = (p, ax, offset, value) => {
  const lp = labelPos(ax, offset, p.label);
  if (!value) return label(lp.x, lp.y, p.ref, lp.anchor);
  return label(lp.x, lp.y - 6, p.ref, lp.anchor) + label(lp.x, lp.y + 8, value, lp.anchor, 'ref value');
};

const draw = {
  resistor(p, a, b) {
    const ax = axis(a, b);
    const bands = resistorBands(p.value);
    const bodyLen = Math.min(ax.len - 18, 46);
    const x0 = -bodyLen / 2;
    const bandXs = [0.18, 0.34, 0.5, 0.8].map((f) => x0 + f * bodyLen);
    return `${lead(a, b)}${group(ax, `<rect x="${x0}" y="-7" width="${bodyLen}" height="14" rx="6" fill="#e9cfa4" stroke="#9c7b4b"/>
  ${bandXs.map((x, i) => `<rect x="${x - 2.5}" y="-7" width="5" height="14" fill="${bands[i]}"/>`).join('')}`)}${refLabel(p, ax, 14, formatOhms(p.value))}`;
  },

  led(p, a, k) {
    const ax = axis(a, k);
    const col = p.color || '#e53935';
    const r = 10.5;
    const flat = 9; // flat side of the case marks the cathode (-)
    const yf = Math.sqrt(r * r - flat * flat).toFixed(2);
    const plus = [a[0] - ax.ux * 14, a[1] - ax.uy * 14];
    return `${lead(a, k)}${group(ax, `<path d="M ${flat} -${yf} A ${r} ${r} 0 1 0 ${flat} ${yf} Z" fill="${col}" fill-opacity="0.85" stroke="#333" stroke-width="1.5"/>
  <circle cx="-3" cy="-3" r="3" fill="#fff" fill-opacity="0.6"/>`)}${label(plus[0], plus[1] + 4, '+', 'middle', 'pol')}${refLabel(p, ax, 16)}`;
  },

  buzzer(p, plus, minus) {
    const ax = axis(plus, minus);
    const r = (12 / 2.54) * PITCH / 2; // 12 mm case
    const lp = { x: ax.mid[0] + r + 6, y: ax.mid[1] + 4 };
    return `<circle cx="${ax.mid[0]}" cy="${ax.mid[1]}" r="${r}" fill="#262626" stroke="#000"/>
<circle cx="${ax.mid[0]}" cy="${ax.mid[1]}" r="5" fill="#555"/>
<circle cx="${plus[0]}" cy="${plus[1]}" r="3" fill="#bbb"/><circle cx="${minus[0]}" cy="${minus[1]}" r="3" fill="#bbb"/>
${label(plus[0] + 9, plus[1] + 5, '+', 'start', 'pol pol-light')}${label(lp.x, lp.y, p.ref, 'start')}`;
  },

  terminal(p, p1, p2, mirror) {
    // Screw terminal, 5.08 mm pitch. `opens` = side where the wires go in.
    let opens = p.opens || 'left';
    if (mirror && (opens === 'left' || opens === 'right')) opens = opens === 'left' ? 'right' : 'left';
    const xs = [p1[0], p2[0]], ys = [p1[1], p2[1]];
    const back = 38, front = 34, along = 22; // about 7.5 x 10 mm
    let x, y, w, h, slots;
    if (opens === 'left' || opens === 'right') {
      y = Math.min(...ys) - along; h = Math.abs(ys[1] - ys[0]) + 2 * along;
      x = opens === 'left' ? p1[0] - front : p1[0] - back; w = front + back;
      const sx = opens === 'left' ? x - 4 : x + w - 4;
      slots = [p1, p2].map((q) => `<rect x="${sx}" y="${q[1] - 6}" width="8" height="12" rx="2" fill="#123"/>`).join('');
    } else {
      x = Math.min(...xs) - along; w = Math.abs(xs[1] - xs[0]) + 2 * along;
      y = opens === 'up' ? p1[1] - front : p1[1] - back; h = front + back;
      const sy = opens === 'up' ? y - 4 : y + h - 4;
      slots = [p1, p2].map((q) => `<rect x="${q[0] - 6}" y="${sy}" width="12" height="8" rx="2" fill="#123"/>`).join('');
    }
    const screws = [p1, p2].map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="8" fill="#d8dde2" stroke="#556"/><line x1="${q[0] - 5}" y1="${q[1]}" x2="${q[0] + 5}" y2="${q[1]}" stroke="#556" stroke-width="2"/>`).join('');
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2f80d0" stroke="#1d5a96"/>${slots}${screws}
${label(x + w / 2, y - 6, p.ref, 'middle')}`;
  },

  transistor(p, c, b, e, mirror) {
    // TO-92 seen from above. Flat side faces you when the legs read C B E from left to right (BC547/BC337).
    const ax = axis(c, e);
    const flatSide = mirror ? -1 : 1; // the bottom view is mirrored
    const s = flatSide;
    const body = `<path d="M -16 ${6 * s} L 16 ${6 * s} A 17 17 0 1 ${s > 0 ? 0 : 1} -16 ${6 * s} Z" fill="#2b2b2b" stroke="#000"/>`;
    const legs = [['C', c], ['B', b], ['E', e]].map(([n, q]) => `<circle cx="${q[0]}" cy="${q[1]}" r="3.2" fill="#c9ced3"/>`).join('');
    const letters = [['C', -24], ['B', 0], ['E', 24]].map(([n, u]) => {
      const [x, y] = ax.at(u * 0.9, 13 * s);
      return label(x, y + 4, n, 'middle', 'pin');
    }).join('');
    if (p.label) return `${group(ax, body)}${legs}${letters}${refLabel(p, ax, 28)}`;
    const [lx, ly] = ax.at(0, -30 * s);
    return `${group(ax, body)}${legs}${letters}${label(lx, ly + 4, p.ref, 'middle')}`;
  },

  ldr(p, a, b) {
    const ax = axis(a, b);
    return `${lead(a, b)}${group(ax, `<circle r="12" fill="#f6e7c6" stroke="#8a6d3b" stroke-width="1.5"/>
  <path d="M -7 -6 h 12 v 3 h -12 v 3 h 12 v 3 h -12 v 3 h 12" fill="none" stroke="#c0392b" stroke-width="1.6"/>`)}${refLabel(p, ax, 18)}`;
  },

  elko(p, plus, minus) {
    const ax = axis(plus, minus);
    const plusLabel = [plus[0] + 9, plus[1] - 9];
    return `${lead(plus, minus)}${group(ax, `<circle r="14" fill="#1e3a8a" stroke="#0b1d4d"/>
  <path d="M 6 -12.65 A 14 14 0 0 1 6 12.65 Z" fill="#93c5fd"/>
  <text x="10" y="4" class="pin" text-anchor="middle">−</text>`)}${label(plusLabel[0], plusLabel[1] + 4, '+', 'middle', 'pol')}${refLabel(p, ax, 20, formatFarad(p.value))}`;
  },

  cap(p, a, b) {
    const ax = axis(a, b);
    return `${lead(a, b)}${group(ax, `<ellipse rx="10" ry="7" fill="#e8a33c" stroke="#a4661a"/>`)}${refLabel(p, ax, 14, formatFarad(p.value))}`;
  },

  button(p, a, b) {
    // 6x6 mm push button; only two diagonal legs are kept.
    const ax = axis(a, b);
    const [cx, cy] = ax.mid;
    return `<rect x="${cx - 27}" y="${cy - 27}" width="54" height="54" rx="4" fill="#8d959c" stroke="#59616a"/>
<circle cx="${cx}" cy="${cy}" r="15" fill="#2b2f33"/>
<circle cx="${a[0]}" cy="${a[1]}" r="3.2" fill="#c9ced3"/><circle cx="${b[0]}" cy="${b[1]}" r="3.2" fill="#c9ced3"/>
${label(cx, cy - 32, p.ref, 'middle')}`;
  },

  jumper(p, a, b) {
    // Insulated wire on the component side; it may cross anything.
    const pts = [a, ...(p.via || []).map((h) => p.xy(h)), b];
    const d = pts.map((q, i) => `${i ? 'L' : 'M'} ${q[0]} ${q[1]}`).join(' ');
    const col = p.color || '#1e88e5';
    return `<path d="${d}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
<path d="${d}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${a[0]}" cy="${a[1]}" r="3" fill="#c9ced3"/><circle cx="${b[0]}" cy="${b[1]}" r="3" fill="#c9ced3"/>`;
  },

  toroid(p, r1, r2, g1, g2) {
    // Hand-wound ferrite ring: red wire r1 -> r2, green wire g1 -> g2.
    const pts = [r1, r2, g1, g2];
    const cx = p.center ? p.xy(p.center)[0] : pts.reduce((s, q) => s + q[0], 0) / 4;
    const cy = p.center ? p.xy(p.center)[1] : pts.reduce((s, q) => s + q[1], 0) / 4;
    const R = 26;
    const turns = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const col = i % 2 ? '#2e7d32' : '#c62828';
      return `<line x1="${cx + Math.cos(a) * (R - 9)}" y1="${cy + Math.sin(a) * (R - 9)}" x2="${cx + Math.cos(a) * (R + 9)}" y2="${cy + Math.sin(a) * (R + 9)}" stroke="${col}" stroke-width="3"/>`;
    }).join('');
    const leadTo = (q, col) => {
      const a = Math.atan2(q[1] - cy, q[0] - cx);
      return `<line x1="${cx + Math.cos(a) * (R + 8)}" y1="${cy + Math.sin(a) * (R + 8)}" x2="${q[0]}" y2="${q[1]}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
    };
    return `${leadTo(r1, '#c62828')}${leadTo(r2, '#c62828')}${leadTo(g1, '#2e7d32')}${leadTo(g2, '#2e7d32')}
<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#4a4a4a" stroke-width="14"/>${turns}
${label(cx, cy + 4, p.ref, 'middle')}`;
  },

  leads(p, q1, q2, mirror, g) {
    // Two wires leaving the board, e.g. a battery clip or sensor probes.
    let exits = p.exits || 'right';
    if (mirror) exits = exits === 'right' ? 'left' : 'right';
    const dir = exits === 'right' ? 1 : -1;
    const edge = exits === 'right' ? g.right + 24 : g.left - 24;
    const endX = exits === 'right' ? g.width - 46 : 46;
    const cy = (q1[1] + q2[1]) / 2;
    const cols = p.leads?.colors || ['#d32f2f', '#222'];
    const wire = (from, col, dy) =>
      `<path d="M ${from[0]} ${from[1]} L ${edge} ${from[1]} C ${edge + dir * 30} ${from[1]}, ${endX - dir * 30} ${cy + dy}, ${endX - dir * 14} ${cy + dy}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    const names = p.leads?.labels?.[g.lang] || [];
    const tag = p.leads?.tag || '';
    const lx = (q) => (dir > 0 ? q[0] + 6 : q[0] - 6);
    return `${wire(q1, cols[0], -7)}${wire(q2, cols[1], 7)}
<rect x="${endX - 20}" y="${cy - 22}" width="40" height="44" rx="5" fill="#333"/>
<text x="${endX}" y="${cy + 5}" class="clip" text-anchor="middle">${esc(tag)}</text>
${names[0] ? label(lx(q1), q1[1] - 7, names[0], dir > 0 ? 'start' : 'end', 'pol') : ''}${names[1] ? label(lx(q2), q2[1] - 7, names[1], dir > 0 ? 'start' : 'end', 'pol') : ''}`;
  },

  dip(p, pinPts) {
    // Chip in its socket. A notch and a dot mark pin 1.
    const n = pinPts.length;
    const xs = pinPts.map((q) => q[0]), ys = pinPts.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const horizontal = maxX - minX > maxY - minY;
    const pad = 14, inset = 5;
    const [x, y, w, h] = horizontal
      ? [minX - pad, minY + inset, maxX - minX + 2 * pad, maxY - minY - 2 * inset]
      : [minX + inset, minY - pad, maxX - minX - 2 * inset, maxY - minY + 2 * pad];
    const p1 = pinPts[0];
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    // Notch on the short side next to pin 1, dot just inside pin 1.
    const notch = horizontal ? [p1[0] < cx ? x : x + w, cy] : [cx, p1[1] < cy ? y : y + h];
    const dot = [p1[0] + Math.sign(cx - p1[0]) * 10, p1[1] + Math.sign(cy - p1[1]) * 12];
    const pins = pinPts.map((q) => `<rect x="${q[0] - 4}" y="${q[1] - 4}" width="8" height="8" fill="#c9ced3"/>`).join('');
    const nums = pinPts.map((q, i) => (horizontal
      ? label(q[0], q[1] + (q[1] > cy ? 18 : -10), String(i + 1), 'middle', 'pinnum')
      : label(q[0] + (q[0] > cx ? 14 : -14), q[1] + 4, String(i + 1), 'middle', 'pinnum'))).join('');
    return `<rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="3" fill="#3a3a3a" stroke="#222"/>${pins}
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#1d1d1f"/>
<circle cx="${notch[0]}" cy="${notch[1]}" r="6" fill="#3a3a3a"/>
<circle cx="${dot[0]}" cy="${dot[1]}" r="2.5" fill="#bbb"/>
<text x="${x + w / 2}" y="${y + h / 2 + 4}" class="chip" text-anchor="middle">${esc(p.chip || p.ref)}</text>${nums}`;
  },
};

/**
 * Draws the board.
 * @param {object} opts
 *   view: 'top' | 'bottom'
 *   visible: Set of part refs / bridge ids that are already built (default: all)
 *   highlight: Set of refs / ids to emphasise (the current step)
 *   idPrefix: unique prefix for SVG ids on the page
 *   lang: 'de' | 'en' for the few words drawn on the board
 *   marks: extra hole names to point out (e.g. ["A1"])
 */
export function renderBoard(project, catalog, opts) {
  const { board } = project;
  const mirror = opts.view === 'bottom';
  const g = { ...geometry(board, mirror), lang: opts.lang };
  const all = new Set([...board.parts.map((p) => p.ref), ...board.bridges.map((b) => b.id)]);
  const visible = opts.visible || all;
  const highlight = opts.highlight || new Set();
  const fid = `${opts.idPrefix || 'b'}-glow`;
  const out = [];

  out.push(`<svg class="board" viewBox="0 0 ${g.width} ${g.height}" xmlns="http://www.w3.org/2000/svg" role="img">`);
  out.push(`<defs><filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#ffb300" flood-opacity="1"/></filter></defs>`);

  // Board and holes.
  const bx = g.left - 6, by = PAD_TOP - 6;
  const bw = board.cols * PITCH + 12, bh = board.rows * PITCH + 12;
  out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="${mirror ? '#c8a165' : '#d4b27a'}" stroke="#8d6b38" stroke-width="2"/>`);
  for (let c = 0; c < board.cols; c++) {
    const [x] = g.xy(holeName(c, 0));
    out.push(label(x, PAD_TOP - 12, String.fromCharCode(65 + c), 'middle', 'coord'));
  }
  for (let r = 0; r < board.rows; r++) {
    const [, y] = g.xy(holeName(0, r));
    out.push(label(g.left - 14, y + 4, String(r + 1), 'end', 'coord'));
  }
  for (let c = 0; c < board.cols; c++) {
    for (let r = 0; r < board.rows; r++) {
      const [x, y] = g.xy(holeName(c, r));
      out.push(mirror
        ? `<circle cx="${x}" cy="${y}" r="7.5" fill="#c97a3f"/><circle cx="${x}" cy="${y}" r="2.6" fill="#3b2a14"/>`
        : `<circle cx="${x}" cy="${y}" r="3" fill="#6d5226"/>`);
    }
  }

  const wrap = (key, svg) => (highlight.has(key) ? `<g filter="url(#${fid})">${svg}</g>` : svg);
  const shown = board.parts.filter((p) => visible.has(p.ref));
  const drawPart = (p) => {
    const entry = catalog[p.part];
    const pts = pinsOf(entry).map((pin) => g.xy(p.pins[pin]));
    const q = { ...p, xy: g.xy, leads: entry.leads, chip: entry.chip };
    if (entry.kind === 'leads') return draw.leads(q, pts[0], pts[1], mirror, g);
    if (/^dip/.test(entry.kind)) return draw.dip(q, pts);
    return draw[entry.kind](q, ...pts, mirror, g);
  };

  if (mirror) {
    // Ghost of the parts on the other side, so children can find their way.
    out.push('<g opacity="0.16">');
    for (const p of shown) if (!['leads', 'jumper'].includes(catalog[p.part].kind)) out.push(drawPart(p));
    out.push('</g>');
    // Solder joints of every built part.
    for (const p of shown) {
      for (const hole of Object.values(p.pins)) {
        const [x, y] = g.xy(hole);
        out.push(wrap(p.ref, `<circle cx="${x}" cy="${y}" r="6.5" fill="#d9dde1" stroke="#8a9096"/>`));
      }
    }
    for (const b of board.bridges.filter((b) => visible.has(b.id))) {
      const pts = b.points.map((n) => g.xy(n));
      const path = `<polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="#b9c0c7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
      const joints = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="#d9dde1" stroke="#8a9096"/>`).join('');
      out.push(wrap(b.id, path + joints));
    }
  } else {
    // Big flat parts first, wires last, so nothing important is hidden.
    const order = (p) => ({ jumper: 3, leads: 2 }[catalog[p.part].kind] || 1);
    for (const p of [...shown].sort((a, b) => order(a) - order(b))) out.push(wrap(p.ref, drawPart(p)));
  }

  // Name the holes of the highlighted items - "put the leg into E4".
  const marks = [];
  for (const p of board.parts.filter((p) => highlight.has(p.ref))) marks.push(...Object.values(p.pins));
  for (const b of board.bridges.filter((b) => highlight.has(b.id))) marks.push(...b.points);
  marks.push(...(opts.marks || []));
  const markSet = new Set(marks);
  for (const n of markSet) {
    const [x, y] = g.xy(n);
    const { c, r } = parseHole(n);
    // The visually right-hand neighbour (mirrored on the bottom) gets the right side.
    const rightNeighbour = holeName(mirror ? c - 1 : c + 1, r);
    const leftSide = markSet.has(rightNeighbour);
    const w = n.length * 8 + 8;
    const rx = leftSide ? x - 9 - w : x + 9;
    out.push(`<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="#ff6d00" stroke-width="2.5"/>`);
    out.push(`<g class="hole-tag"><rect x="${rx}" y="${y - 25}" width="${w}" height="16" rx="4"/>${label(rx + 4, y - 13, n, 'start', 'tag')}</g>`);
  }

  out.push('</svg>');
  return out.join('\n');
}

/** Small icon of a part for the parts list. */
export function renderPartIcon(entry, part) {
  const w = 96, h = 40;
  const svg = (inner) => `<svg class="icon" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const strip = (s) => s.replace(/<text[^>]*class="(ref|pol|pin)[^"]*"[^>]*>.*?<\/text>/g, '');
  const p = { ref: '', value: part.value || 1000, color: part.color, opens: 'up' };
  const a = [12, 20], b = [84, 20];
  switch (entry.kind) {
    case 'resistor': return svg(strip(draw.resistor(p, a, b)));
    case 'led': return svg(strip(draw.led(p, [36, 20], [60, 20])));
    case 'ldr': return svg(strip(draw.ldr(p, [24, 20], [72, 20])));
    case 'elko': return svg(strip(draw.elko(p, [30, 20], [66, 20])));
    case 'cap': return svg(strip(draw.cap(p, [30, 20], [66, 20])));
    case 'buzzer': return svg('<circle cx="48" cy="20" r="18" fill="#262626"/><circle cx="48" cy="20" r="3.5" fill="#555"/><text x="58" y="13" class="pol pol-light">+</text>');
    case 'terminal': return svg('<rect x="26" y="4" width="44" height="32" rx="3" fill="#2f80d0"/><circle cx="37" cy="20" r="7" fill="#d8dde2"/><circle cx="59" cy="20" r="7" fill="#d8dde2"/>');
    case 'transistor': return svg('<path d="M 32 26 L 64 26 A 17 17 0 0 0 32 26 Z" fill="#2b2b2b"/><line x1="40" y1="26" x2="40" y2="38" stroke="#a7adb4" stroke-width="2"/><line x1="48" y1="26" x2="48" y2="38" stroke="#a7adb4" stroke-width="2"/><line x1="56" y1="26" x2="56" y2="38" stroke="#a7adb4" stroke-width="2"/>');
    case 'button': return svg('<rect x="32" y="4" width="32" height="32" rx="3" fill="#8d959c"/><circle cx="48" cy="20" r="9" fill="#2b2f33"/>');
    case 'jumper': return svg('<path d="M 10 28 C 30 4, 66 4, 86 28" fill="none" stroke="#1e88e5" stroke-width="5" stroke-linecap="round"/>');
    case 'toroid': return svg('<circle cx="48" cy="20" r="13" fill="none" stroke="#4a4a4a" stroke-width="8"/><path d="M 40 9 l 4 6 M 52 9 l -4 6 M 58 20 h -6 M 38 20 h 6" stroke="#c62828" stroke-width="2"/>');
    case 'leads': {
      const [c1, c2] = entry.leads?.colors || ['#d32f2f', '#222'];
      return svg(`<rect x="8" y="8" width="24" height="24" rx="3" fill="#333"/><path d="M32 16 C 55 16, 60 12, 90 12" stroke="${c1}" stroke-width="3" fill="none"/><path d="M32 24 C 55 24, 60 28, 90 28" stroke="${c2}" stroke-width="3" fill="none"/>`);
    }
    default:
      if (/^dip/.test(entry.kind || '')) return svg('<rect x="22" y="8" width="52" height="24" rx="2" fill="#1d1d1f"/><circle cx="22" cy="20" r="4" fill="#fff"/>' + [30, 40, 50, 60].map((x) => `<rect x="${x}" y="3" width="4" height="5" fill="#c9ced3"/><rect x="${x}" y="32" width="4" height="5" fill="#c9ced3"/>`).join(''));
      return '';
  }
}
