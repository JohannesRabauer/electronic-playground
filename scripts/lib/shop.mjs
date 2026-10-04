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

// ------------------------------------------------------------------ Amazon carts

const MARKET = { de: { key: 'de', host: 'www.amazon.de' }, en: { key: 'com', host: 'www.amazon.com' } };
const GROUPS = ['parts', 'tools', 'microbit'];

/**
 * Amazon products (parts/products.yaml) that cover the catalog parts a set of projects needs, split into groups.
 * Amazon only fills a basket from one link if it carries a partner tag (associate_tags in products.yaml).
 * Without a tag for the market, `oneClick` is false and the page shows direct product links instead.
 */
export function amazonCarts(projects, catalog, productsFile, lang) {
  const market = MARKET[lang];
  const tag = productsFile.associate_tags?.[market.key];
  const needed = new Set(projects.flatMap((p) => p.parts.map((x) => x.part)));
  const covered = new Set();
  const groups = Object.fromEntries(GROUPS.map((g) => [g, []]));
  const withTag = (url) => (tag ? `${url}${url.includes('?') ? '&' : '?'}tag=${encodeURIComponent(tag)}` : url);
  for (const [id, prod] of Object.entries(productsFile.products)) {
    const asin = prod.amazon[market.key];
    if (!asin || (prod.markets && !prod.markets.includes(market.key))) continue;
    if (!prod.covers.some((c) => needed.has(c))) continue;
    prod.covers.forEach((c) => covered.add(c));
    groups[prod.group].push({ id, asin, name: prod.name[lang], url: withTag(`https://${market.host}/dp/${asin}`) });
  }
  const cartUrl = (items) => `https://${market.host}/gp/aws/cart/add.html?AssociateTag=${encodeURIComponent(tag)}&${items.map((it, i) => `ASIN.${i + 1}=${it.asin}&Quantity.${i + 1}=1`).join('&')}`;
  const notCovered = [...needed].filter((c) => !covered.has(c)).map((c) => catalog[c]);
  return {
    oneClick: Boolean(tag),
    groups: Object.fromEntries(GROUPS.filter((g) => groups[g].length).map((g) => [g, { items: groups[g], url: tag ? cartUrl(groups[g]) : null }])),
    elsewhere: notCovered.filter((e) => e.buy.where),
    missing: notCovered.filter((e) => !e.buy.where),
    checked: productsFile.checked,
  };
}

export function cartBox(projects, { catalog, products, t, lang, esc }, title, compact = false) {
  const carts = amazonCarts(projects, catalog, products, lang);
  if (!Object.keys(carts.groups).length) return '';
  const label = { parts: `🧩 ${t.cart_parts}`, tools: `🔧 ${t.cart_tools}`, microbit: `💻 ${t.cart_microbit}` };
  // Partner links are advertising: marked as such and rel="sponsored".
  const rel = carts.oneClick ? 'sponsored noopener noreferrer' : 'noopener noreferrer nofollow';
  const link = (href, text, cls = '') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="${rel}">${text}</a>`;
  const productList = (c) => c.items.map((it) => link(it.url, esc(it.name))).join(' · ');
  const names = (list) => [...new Set(list.map((e) => e.name[lang]))].map(esc).join(', ');
  const extra = [
    carts.missing.length ? `${esc(t.cart_missing)} ${names(carts.missing)}` : '',
    carts.elsewhere.length ? `${esc(t.cart_elsewhere)} ${names(carts.elsewhere)}` : '',
  ].filter(Boolean).map((s) => `<p class="hint">${s}</p>`).join('');
  const date = new Date(carts.checked).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  if (!carts.oneClick) {
    // No partner tag: the exact products, each one click away from "add to basket".
    const plain = { parts: `🧩 ${t.group_parts}`, tools: `🔧 ${t.group_tools}`, microbit: `💻 ${t.group_microbit}` };
    const lists = Object.entries(carts.groups).map(([g, c]) => `<li><strong>${plain[g]}:</strong> ${productList(c)}</li>`).join('');
    return `<div class="cart-box${compact ? ' compact' : ''}">
  <h3>🛒 ${esc(compact ? t.products_title_project : t.products_title)}</h3>
  <p>${esc(t.products_intro)}</p>
  <ul class="cart-contents">${lists}</ul>
  ${extra}
  <p class="hint cart-note">${esc(t.products_note.replace('{date}', date))}</p>
</div>`;
  }

  const buttons = Object.entries(carts.groups).map(([g, c], i) =>
    link(c.url, `${label[g]} <span class="count">${c.items.length}</span>`, `button ${i ? 'secondary' : ''}`)).join('');
  const contents = Object.entries(carts.groups).map(([g, c]) => `<li><strong>${label[g]}:</strong> ${productList(c)}</li>`).join('');
  return `<div class="cart-box${compact ? ' compact' : ''}">
  <h3>🛒 ${esc(title)} <span class="ad-label">${esc(t.ad_label)}</span></h3>
  <div class="cart-buttons">${buttons}</div>
  <details><summary>${esc(t.cart_contents)}</summary><ul class="cart-contents">${contents}</ul></details>
  ${extra}
  <p class="hint cart-note">${esc(t.cart_note.replace('{date}', date))} <strong>${esc(t.partner_disclosure)}</strong></p>
</div>`;
}
