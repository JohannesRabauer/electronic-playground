// Shopping list: adds up the parts of a set of projects and links to plain shop searches.
// No prices (they change all the time) and no affiliate links.
import { renderPartIcon, formatValue } from './board.mjs';

const CATEGORY_ORDER = ['component', 'board', 'material', 'tool'];
export const SHOP_DIR = { de: 'einkaufsliste', en: 'shopping-list' };

/** One row per catalog part, with its values (e.g. resistances), quantities and the projects that need it. */
export function aggregateParts(projects, catalog) {
  const rows = new Map();
  for (const p of projects) {
    for (const x of p.parts) {
      const row = rows.get(x.part) || { id: x.part, entry: catalog[x.part], values: new Map(), qtys: [], projects: new Set() };
      row.qtys.push(x.qty);
      if (x.value != null) row.values.set(x.value, (row.values.get(x.value) || 0) + (typeof x.qty === 'number' ? x.qty : 1));
      row.projects.add(p);
      rows.set(x.part, row);
    }
  }
  const order = Object.keys(catalog);
  return [...rows.values()].sort((a, b) =>
    CATEGORY_ORDER.indexOf(a.entry.category) - CATEGORY_ORDER.indexOf(b.entry.category)
    || order.indexOf(a.id) - order.indexOf(b.id));
}

/** Search links for a part, in the shops that suit it (falls back to Amazon/AliExpress for English). */
export function shopLinks(entry, shops, lang, esc) {
  const buy = entry.buy;
  if (buy.where) return `<span class="where">${esc(buy.where[lang])}</span>`;
  const words = buy.search[lang];
  let ids = buy.shops.filter((s) => shops[s].links[lang]);
  if (!ids.length) ids = ['amazon', 'aliexpress'];
  return ids.flatMap((id) => shops[id].links[lang].map((tpl) => {
    const url = tpl.replace('{q}', encodeURIComponent(words)).replace('{q-}', encodeURIComponent(words.replace(/\s+/g, '-')));
    const label = shops[id].links[lang].length > 1 ? new URL(url).hostname.replace(/^www\./, '') : shops[id].name;
    return `<a class="shop-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)} ↗</a>`;
  })).join(' ');
}

const quantity = (row, esc) => {
  if (row.entry.category === 'tool') return '✓';
  if (row.qtys.every((q) => typeof q === 'number')) return String(row.qtys.reduce((a, b) => a + b, 0));
  return [...new Set(row.qtys.map(String))].map(esc).join('<br>');
};

export function shopTable(rows, { shops, u, t, lang, esc, mdInline, showProjects }) {
  return `<table class="parts shop-table">
<thead><tr><th></th><th>${esc(t.col_qty)}</th><th>${esc(t.col_part)}</th>${showProjects ? `<th>${esc(t.col_for)}</th>` : ''}<th>${esc(t.col_buy)}</th></tr></thead>
<tbody>${rows.map((row) => {
    const values = [...row.values].sort((a, b) => a[0] - b[0])
      .map(([v, n]) => `<span class="value-chip">${esc(formatValue(row.entry.kind, v))} ×${n}</span>`).join(' ');
    const icon = row.entry.kind ? renderPartIcon(row.entry, { value: row.values.keys().next().value }) : `<span class="emoji" aria-hidden="true">${row.entry.icon || '•'}</span>`;
    const tip = row.entry.buy.tip ? `<div class="hint">💡 ${mdInline(row.entry.buy.tip[lang])}</div>` : '';
    const projects = [...row.projects].sort((a, b) => a.number - b.number)
      .map((p) => `<a class="proj-chip" href="${u.project(lang, p)}" title="${esc(p.title[lang])}">#${p.number}</a>`).join(' ');
    return `<tr>
  <td class="icon-cell">${icon}</td><td class="qty shop-qty">${quantity(row, esc)}</td>
  <td><strong>${esc(row.entry.name[lang])}</strong>${values ? `<div class="values">${values}</div>` : ''}${tip}</td>
  ${showProjects ? `<td>${projects}</td>` : ''}
  <td class="buy">${shopLinks(row.entry, shops, lang, esc)}</td>
</tr>`;
  }).join('')}</tbody></table>`;
}
