// Perfboard model: parsing hole names, checking the wiring against the
// declared netlist, and drawing the board as SVG (top and bottom view).
//
// Holes are named like on printed perfboards: column letter + row number,
// e.g. "E4" = column E, row 4. "A1" is the top-left hole of the top view.

const PITCH = 24; // px per 2.54 mm hole
const PAD_LEFT = 72; // room for coordinates and parts that stick out
const PAD_RIGHT = 120; // room for the battery clip
const PAD_TOP = 34;
const PAD_BOTTOM = 26;

// Which pins each kind of part has (in the order they are drawn).
export const KIND_PINS = {
  resistor: ['1', '2'],
  led: ['A', 'K'],
  buzzer: ['+', '-'],
  terminal: ['1', '2'],
  'battery-clip': ['+', '-'],
};

export function parseHole(name) {
  const m = /^([A-Z])([0-9]{1,2})$/.exec(name);
  if (!m) throw new Error(`invalid hole "${name}" (expected e.g. "E4")`);
  return { c: m[1].charCodeAt(0) - 65, r: Number(m[2]) - 1 };
}

const holeName = (c, r) => String.fromCharCode(65 + c) + (r + 1);

// ---------------------------------------------------------------- checking

/**
 * Verifies a project's board: holes on the board, no two pins in one hole,
 * bridges straight and not running over foreign holes, and the resulting
 * connections exactly match project.nets. Returns a list of error strings.
 */
export function checkBoard(project, catalog) {
  const errors = [];
  const { board, nets } = project;
  const pinAt = new Map(); // hole -> "REF.pin"
  const inBoard = ({ c, r }) => c >= 0 && r >= 0 && c < board.cols && r < board.rows;

  for (const p of board.parts) {
    const kind = catalog[p.part]?.kind;
    const expected = KIND_PINS[kind];
    if (!expected) {
      errors.push(`board part ${p.ref}: part "${p.part}" has no drawable kind`);
      continue;
    }
    const got = Object.keys(p.pins);
    if (got.length !== expected.length || !expected.every((k) => got.includes(k))) {
      errors.push(`board part ${p.ref}: pins must be ${expected.join(', ')} (got ${got.join(', ')})`);
    }
    for (const [pin, hole] of Object.entries(p.pins)) {
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
    if (!seen.has(pin)) errors.push(`pin ${pin} is not part of any net`);
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

function geometry(board, mirror) {
  const width = PAD_LEFT + board.cols * PITCH + PAD_RIGHT;
  const height = PAD_TOP + board.rows * PITCH + PAD_BOTTOM;
  const xy = (hole) => {
    const { c, r } = parseHole(hole);
    const cc = mirror ? board.cols - 1 - c : c;
    return [PAD_LEFT + cc * PITCH + PITCH / 2, PAD_TOP + r * PITCH + PITCH / 2];
  };
  return { width, height, xy };
}

// Angle and helpers for drawing a two-pin part between p1 and p2.
function axis(p1, p2) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  return { mid: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], len, ux: dx / len, uy: dy / len, deg: (Math.atan2(dy, dx) * 180) / Math.PI };
}

const lead = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#a7adb4" stroke-width="3" stroke-linecap="round"/>`;
const label = (x, y, text, anchor = 'start', cls = 'ref') => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(text)}</text>`;

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

const draw = {
  resistor(p, a, b) {
    const ax = axis(a, b);
    const bands = resistorBands(p.value);
    const bodyLen = Math.min(ax.len - 18, 46);
    const x0 = -bodyLen / 2;
    const bandXs = [0.18, 0.34, 0.5, 0.8].map((f) => x0 + f * bodyLen);
    const lp = labelPos(ax, 14, p.label);
    return `${lead(a, b)}
<g transform="translate(${ax.mid[0]} ${ax.mid[1]}) rotate(${ax.deg})">
  <rect x="${x0}" y="-7" width="${bodyLen}" height="14" rx="6" fill="#e9cfa4" stroke="#9c7b4b"/>
  ${bandXs.map((x, i) => `<rect x="${x - 2.5}" y="-7" width="5" height="14" fill="${bands[i]}"/>`).join('')}
</g>${label(lp.x, lp.y, `${p.ref} · ${formatOhms(p.value)}`, lp.anchor)}`;
  },

  led(p, a, k) {
    const ax = axis(a, k);
    const col = p.color || '#e53935';
    const r = 10.5;
    const flat = 9; // flat side of the case marks the cathode (-)
    const yf = Math.sqrt(r * r - flat * flat).toFixed(2);
    const lp = labelPos(ax, 16, p.label);
    const plus = [a[0] - ax.ux * 14, a[1] - ax.uy * 14];
    return `${lead(a, k)}
<g transform="translate(${ax.mid[0]} ${ax.mid[1]}) rotate(${ax.deg})">
  <path d="M ${flat} -${yf} A ${r} ${r} 0 1 0 ${flat} ${yf} Z" fill="${col}" fill-opacity="0.85" stroke="#7a1b1b" stroke-width="1.5"/>
  <circle cx="-3" cy="-3" r="3" fill="#fff" fill-opacity="0.6"/>
</g>${label(plus[0], plus[1] + 4, '+', 'middle', 'pol')}${label(lp.x, lp.y, p.ref, lp.anchor)}`;
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

  'battery-clip'(p, plus, minus, mirror, g) {
    const exitX = g.width - PAD_RIGHT + 30;
    const clipX = g.width - 46;
    const cy = (plus[1] + minus[1]) / 2;
    const wire = (from, col, dy) =>
      `<path d="M ${from[0]} ${from[1]} L ${exitX} ${from[1]} C ${exitX + 30} ${from[1]}, ${clipX - 30} ${cy + dy}, ${clipX - 14} ${cy + dy}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    return `${wire(plus, '#d32f2f', -7)}${wire(minus, '#222', 7)}
<rect x="${clipX - 16}" y="${cy - 22}" width="40" height="44" rx="5" fill="#333"/>
<text x="${clipX + 4}" y="${cy + 5}" class="clip" text-anchor="middle">9V</text>
${label(plus[0] + 6, plus[1] - 7, g.lang === 'de' ? '+ rot' : '+ red', 'start', 'pol')}${label(minus[0] + 6, minus[1] - 7, g.lang === 'de' ? '− schwarz' : '− black', 'start', 'pol')}`;
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
  const bx = PAD_LEFT - 6, by = PAD_TOP - 6;
  const bw = board.cols * PITCH + 12, bh = board.rows * PITCH + 12;
  out.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="${mirror ? '#c8a165' : '#d4b27a'}" stroke="#8d6b38" stroke-width="2"/>`);
  for (let c = 0; c < board.cols; c++) {
    const [x] = g.xy(holeName(c, 0));
    out.push(label(x, PAD_TOP - 12, String.fromCharCode(65 + c), 'middle', 'coord'));
  }
  for (let r = 0; r < board.rows; r++) {
    const [, y] = g.xy(holeName(0, r));
    out.push(label(PAD_LEFT - 14, y + 4, String(r + 1), 'end', 'coord'));
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
  const pinPoints = (p) => KIND_PINS[catalog[p.part].kind].map((pin) => g.xy(p.pins[pin]));
  const shown = board.parts.filter((p) => visible.has(p.ref));

  if (mirror) {
    // Ghost of the parts on the other side, so children can find their way.
    out.push('<g opacity="0.16">');
    for (const p of shown) {
      const kind = catalog[p.part].kind;
      if (kind !== 'battery-clip') out.push(draw[kind](p, ...pinPoints(p), mirror, g));
    }
    out.push('</g>');
    // Solder joints of every built part.
    for (const p of shown) {
      for (const [x, y] of pinPoints(p)) out.push(wrap(p.ref, `<circle cx="${x}" cy="${y}" r="6.5" fill="#d9dde1" stroke="#8a9096"/>`));
    }
    for (const b of board.bridges.filter((b) => visible.has(b.id))) {
      const pts = b.points.map((n) => g.xy(n));
      const path = `<polyline points="${pts.map((q) => q.join(',')).join(' ')}" fill="none" stroke="#b9c0c7" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
      const joints = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6.5" fill="#d9dde1" stroke="#8a9096"/>`).join('');
      out.push(wrap(b.id, path + joints));
    }
  } else {
    for (const p of shown) out.push(wrap(p.ref, draw[catalog[p.part].kind](p, ...pinPoints(p), mirror, g)));
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

/** Small icon of a part kind for the parts list. */
export function renderPartIcon(kind, value, color) {
  const w = 96, h = 40;
  const a = [12, 20], b = [84, 20];
  const p = { ref: '', value: value || 1000, color, opens: 'up' };
  let body;
  switch (kind) {
    case 'resistor': body = draw.resistor(p, a, b); break;
    case 'led': body = draw.led(p, [36, 20], [60, 20]); break;
    case 'buzzer': return `<svg class="icon" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><circle cx="48" cy="20" r="18" fill="#262626"/><circle cx="48" cy="20" r="3.5" fill="#555"/><text x="58" y="13" class="pol pol-light">+</text></svg>`;
    case 'terminal': return `<svg class="icon" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect x="26" y="4" width="44" height="32" rx="3" fill="#2f80d0"/><circle cx="37" cy="20" r="7" fill="#d8dde2"/><circle cx="59" cy="20" r="7" fill="#d8dde2"/></svg>`;
    case 'battery-clip': return `<svg class="icon" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="24" height="24" rx="3" fill="#333"/><path d="M32 16 C 55 16, 60 12, 90 12" stroke="#d32f2f" stroke-width="3" fill="none"/><path d="M32 24 C 55 24, 60 28, 90 28" stroke="#222" stroke-width="3" fill="none"/></svg>`;
    default: return '';
  }
  return `<svg class="icon" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body.replace(/<text[^>]*class="ref"[^>]*>.*?<\/text>/g, '')}</svg>`;
}
