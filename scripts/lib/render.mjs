// HTML templates. Every project page has the same sections in the same order,
// both on the website and in the A4 print version (see docs/PROJECT-STRUCTURE.md).
import { marked } from 'marked';
import { renderBoard, renderPartIcon, formatValue } from './board.mjs';

export const LANGS = ['de', 'en'];
export const PRINT_DIR = { de: 'drucken', en: 'print' };

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) => marked.parse(s || '');
const mdInline = (s) => marked.parseInline(s || '');
const fill = (tpl, n) => tpl.replace('{n}', n);

export function urls(base) {
  return {
    home: (lang) => `${base}${lang}/`,
    project: (lang, p) => `${base}${lang}/${p.slug[lang]}/`,
    print: (lang, p) => `${base}${lang}/${p.slug[lang]}/${PRINT_DIR[lang]}/`,
    asset: (file) => `${base}assets/${file}`,
    projectFile: (p, file) => `${base}projects/${p.id}/${file}`,
    sim: (lang, circuit) =>
      `${base}sim/circuitjs.html?lang=${lang}${lang === 'de' ? '&euroResistors=true' : ''}${circuit ? `&startCircuit=${circuit}` : ''}`,
  };
}

/** Path of a localized circuit inside CircuitJS's circuits/ folder. */
export const circuitPath = (p, file, lang) => `projects/${p.id}/${file.replace(/\.txt$/, '')}.${lang}.txt`;

// ------------------------------------------------------------------ frame

function layout({ lang, t, u, title, description, altHref, body, bodyClass = '', withHeader = true }) {
  const other = lang === 'de' ? 'en' : 'de';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="${u.asset('favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${u.asset('style.css')}">
<link rel="alternate" hreflang="${other}" href="${altHref}">
</head>
<body class="${bodyClass}">
${withHeader ? `<header class="topbar">
  <a class="brand" href="${u.home(lang)}"><span class="bolt">⚡</span> ${esc(t.site_title)}</a>
  <nav>
    <a href="${u.sim(lang)}">${esc(t.open_sim)}</a>
    <a href="${altHref}" hreflang="${other}" lang="${other}">${esc(t.other_lang)}</a>
  </nav>
</header>` : ''}
${body}
<footer class="footer">${esc(t.footer)}</footer>
<script src="${u.asset('app.js')}" defer></script>
</body>
</html>
`;
}

// ------------------------------------------------------------------ pieces

function facts(p, t, lang) {
  const d = p.facts.difficulty;
  const dots = '●'.repeat(d) + '○'.repeat(3 - d);
  return `<dl class="facts">
  <div><dt>${esc(t.age)}</dt><dd>${esc(fill(t.age_value, p.facts.age))}</dd></div>
  <div><dt>${esc(t.difficulty)}</dt><dd><span class="dots" aria-hidden="true">${dots}</span> ${esc(t.difficulty_names[d - 1])}</dd></div>
  <div><dt>${esc(t.time)}</dt><dd>${esc(fill(t.time_value, p.facts.minutes))}</dd></div>
  <div><dt>${esc(t.cost)}</dt><dd>${esc(fill(t.cost_value, p.facts.cost_eur))}</dd></div>
</dl>
<ul class="topics">${p.facts.topics.map((x) => `<li class="topic topic-${x}">${esc(t.topics[x])}</li>`).join('')}</ul>`;
}

function partsSection(p, catalog, t, lang) {
  const rows = (cats) => p.parts.filter((x) => cats.includes(catalog[x.part].category));
  const name = (x) => {
    const c = catalog[x.part];
    const value = x.value ? ` ${formatValue(c.kind, x.value)}` : '';
    return `${esc(c.name[lang])}${esc(value)}`;
  };
  const icon = (x) => {
    const c = catalog[x.part];
    return c.kind ? renderPartIcon(c, x) : `<span class="emoji" aria-hidden="true">${c.icon || '•'}</span>`;
  };
  const table = (list) => `<table class="parts">
<thead><tr><th></th><th>${esc(t.col_qty)}</th><th>${esc(t.col_ref)}</th><th>${esc(t.col_part)}</th><th>${esc(t.col_note)}</th></tr></thead>
<tbody>${list.map((x) => `<tr>
  <td class="icon-cell">${icon(x)}</td><td class="qty">${esc(x.qty)}</td><td class="ref">${esc(x.ref || '')}</td>
  <td><strong>${name(x)}</strong></td>
  <td class="note">${x.note ? `<span class="pnote">${mdInline(x.note[lang])}</span> ` : ''}<span class="hint">${mdInline(catalog[x.part].hint?.[lang] || '')}</span></td>
</tr>`).join('')}</tbody></table>`;
  const tools = rows(['tool']);
  return `<h3>${esc(t.components)}</h3>${table(rows(['component', 'board']))}
<h3>${esc(t.materials)}</h3>${table(rows(['material']))}
<h3>${esc(t.tools)}</h3>
<ul class="tools">${tools.map((x) => `<li><span class="emoji" aria-hidden="true">${catalog[x.part].icon || '•'}</span> ${esc(catalog[x.part].name[lang])}</li>`).join('')}</ul>`;
}

function boardSection(p, catalog, t, lang) {
  return `<p class="lead">${esc(t.board_hint)}</p>
<div class="board-pair">
  <figure>${renderBoard(p, catalog, { view: 'top', lang, idPrefix: `${p.id}-ov-top` })}<figcaption>${esc(t.board_top)}</figcaption></figure>
  <figure>${renderBoard(p, catalog, { view: 'bottom', lang, idPrefix: `${p.id}-ov-bot` })}<figcaption>${esc(t.board_bottom)}</figcaption></figure>
</div>`;
}

function callout(kind, title, text) {
  return text ? `<aside class="callout callout-${kind}"><strong>${esc(title)}:</strong> ${mdInline(text)}</aside>` : '';
}

function stepsSection(p, catalog, t, lang, u, print) {
  const visible = new Set();
  return `<ol class="steps">${p.steps.map((s, i) => {
    const adds = s.adds || [];
    adds.forEach((a) => visible.add(a));
    let figure = '';
    if (s.view !== 'none') {
      figure = renderBoard(p, catalog, { view: s.view, lang, marks: s.marks, visible: new Set(visible), highlight: new Set(adds), idPrefix: `${p.id}-s${i}${print ? 'p' : ''}` });
    } else if (s.image) {
      figure = `<img src="${u.projectFile(p, s.image)}" alt="">`;
    }
    const caption = s.view === 'top' ? t.board_top : s.view === 'bottom' ? t.board_bottom : '';
    return `<li class="step" id="step-${s.id}">
  <div class="step-head"><span class="step-num">${i + 1}</span><h3>${esc(s.title[lang])}</h3></div>
  <div class="step-grid">
    <div class="step-body">
      ${md(s.text[lang])}
      ${callout('tip', t.tip, s.tip?.[lang])}${callout('warning', t.warning, s.warning?.[lang])}${callout('parent', t.parent, s.parent?.[lang])}
      <label class="check"><input type="checkbox" data-key="${p.id}:${s.id}"> ${esc(t.done)}</label>
    </div>
    ${figure ? `<figure class="step-fig">${figure}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>` : ''}
  </div>
</li>`;
  }).join('\n')}</ol>`;
}

function restSections(p, t, lang, u) {
  const explain = `<div class="explain">
  <div class="explain-kids"><h3>${esc(t.explain_kids)}</h3>${md(p.explanation.kids[lang])}</div>
  <div class="explain-parents"><h3>${esc(t.explain_parents)}</h3>${md(p.explanation.parents[lang])}</div>
</div>`;
  const variations = `<ul class="cards variations">${p.variations.map((v) => `<li class="card">
  <h3>${esc(v.title[lang])}</h3>${md(v.text[lang])}
  ${v.circuit ? `<a class="button small screen-only" href="${u.sim(lang, circuitPath(p, v.circuit, lang))}" target="_blank" rel="noopener">${esc(t.sim_variation)} ↗</a>` : ''}
</li>`).join('')}</ul>`;
  const trouble = `<dl class="trouble">${p.troubleshooting.map((x) => `<div><dt>${mdInline(x.problem[lang])}</dt><dd>${mdInline(x.solution[lang])}</dd></div>`).join('')}</dl>`;
  const safety = `<ul class="safety">${[...p.safety[lang], ...t.safety_general].map((x) => `<li>${mdInline(x)}</li>`).join('')}</ul>`;
  return { explain, variations, trouble, safety };
}

const categoryBadge = (p, t) => `<span class="cat-badge cat-${p.category}">${t.categories[p.category].icon} ${esc(t.categories[p.category].name)}</span>`;

const section = (id, title, html, extraClass = '') => `<section class="sec ${extraClass}" id="${id}"><h2>${esc(title)}</h2>${html}</section>`;

// ------------------------------------------------------------------ pages

export function projectPage(ctx, p, lang) {
  const { catalog, i18n, u } = ctx;
  const t = i18n[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const rest = restSections(p, t, lang, u);
  const simSrc = u.sim(lang, circuitPath(p, p.simulation.circuit, lang));
  const body = `<main class="project">
<section class="hero">
  <div class="hero-text">
    <p class="kicker"><a href="${u.home(lang)}">${esc(t.all_projects)}</a> · <a href="${u.home(lang)}#${p.category}">${categoryBadge(p, t)}</a> · #${p.number}</p>
    <h1>${esc(p.title[lang])}</h1>
    <p class="tagline">${esc(p.tagline[lang])}</p>
    ${facts(p, t, lang)}
    <p><a class="button" href="${u.print(lang, p)}">🖨️ ${esc(t.print)}</a></p>
  </div>
  <img class="hero-img" src="${u.projectFile(p, p.hero)}" alt="">
</section>
<section class="sec intro"><div class="intro-text">${md(p.intro[lang])}</div>
  <div class="learn"><h3>${esc(t.learn)}</h3><ul>${p.learn[lang].map((x) => `<li>${mdInline(x)}</li>`).join('')}</ul></div>
</section>
<nav class="toc">${Object.entries(t.sections).map(([k, v]) => `<a href="#${k}">${esc(v)}</a>`).join('')}</nav>
${section('try', t.sections.try, `<div class="try">${md(p.simulation.try[lang])}</div>
<div class="sim-frame"><iframe src="${simSrc}&hideMenu=true" title="${esc(t.sections.try)}" loading="lazy"></iframe></div>
<p><a class="button small" href="${simSrc}" target="_blank" rel="noopener">${esc(t.sim_open_full)} ↗</a></p>`)}
${section('parts', t.sections.parts, partsSection(p, catalog, t, lang))}
${section('board', t.sections.board, boardSection(p, catalog, t, lang))}
${section('steps', t.sections.steps, stepsSection(p, catalog, t, lang, u, false))}
${section('explain', t.sections.explain, rest.explain)}
${section('variations', t.sections.variations, rest.variations)}
${section('troubleshooting', t.sections.troubleshooting, rest.trouble)}
${section('safety', t.sections.safety, rest.safety)}
</main>`;
  return layout({ lang, t, u, title: `${p.title[lang]} – ${t.site_title}`, description: p.tagline[lang], altHref: u.project(other, p), body });
}

export function printPage(ctx, p, lang, qrSvg) {
  const { catalog, i18n, u } = ctx;
  const t = i18n[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const rest = restSections(p, t, lang, u);
  const body = `<div class="print-toolbar screen-only">
  <a href="${u.project(lang, p)}">← ${esc(p.title[lang])}</a>
  <button type="button" class="button" data-print>🖨️ ${esc(t.print_now)}</button>
  <span class="hint">${esc(t.print_hint)}</span>
</div>
<main class="sheet">
<header class="sheet-head">
  <div>
    <p class="kicker">⚡ ${esc(t.site_title)} · ${categoryBadge(p, t)} · #${p.number}</p>
    <h1>${esc(p.title[lang])}</h1>
    <p class="tagline">${esc(p.tagline[lang])}</p>
    ${facts(p, t, lang)}
  </div>
  <div class="qr">${qrSvg}<span>${esc(t.qr_caption)}</span></div>
</header>
<div class="sheet-intro">
  <img class="hero-img" src="${u.projectFile(p, p.hero)}" alt="">
  <div>${md(p.intro[lang])}<h3>${esc(t.learn)}</h3><ul>${p.learn[lang].map((x) => `<li>${mdInline(x)}</li>`).join('')}</ul></div>
</div>
${section('parts', t.sections.parts, partsSection(p, catalog, t, lang))}
${section('board', t.sections.board, boardSection(p, catalog, t, lang), 'avoid-break')}
${section('steps', t.sections.steps, stepsSection(p, catalog, t, lang, u, true))}
${section('explain', t.sections.explain, rest.explain, 'avoid-break')}
${section('variations', t.sections.variations, rest.variations, 'avoid-break')}
${section('troubleshooting', t.sections.troubleshooting, rest.trouble, 'avoid-break')}
${section('safety', t.sections.safety, rest.safety, 'avoid-break')}
</main>`;
  return layout({ lang, t, u, title: `${p.title[lang]} – ${t.print}`, description: p.tagline[lang], altHref: u.print(other, p), body, bodyClass: 'print-page', withHeader: false });
}

export function homePage(ctx, lang) {
  const { i18n, u, projects } = ctx;
  const t = i18n[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const published = projects.filter((p) => p.status === 'published');
  const card = (p) => `<li class="card project-card">
  <a href="${u.project(lang, p)}">
    <img src="${u.projectFile(p, p.hero)}" alt="">
    <span class="num">#${p.number}</span>
    <h3>${esc(p.title[lang])}</h3>
    <p>${esc(p.tagline[lang])}</p>
    ${facts(p, t, lang)}
  </a>
</li>`;
  const cats = Object.entries(t.categories);
  const nav = `<nav class="cat-nav">${cats.map(([id, c]) => `<a href="#${id}"><span aria-hidden="true">${c.icon}</span> ${esc(c.name)}</a>`).join('')}</nav>`;
  const sections = cats.map(([id, c]) => {
    const list = published.filter((p) => p.category === id);
    return `<section class="sec category" id="${id}">
  <h2><span aria-hidden="true">${c.icon}</span> ${esc(c.name)}</h2>
  <p class="lead">${esc(c.text)}</p>
  ${list.length ? `<ul class="cards project-grid">${list.map(card).join('')}</ul>` : `<p class="card coming-soon">${esc(t.coming_soon)}</p>`}
</section>`;
  }).join('');
  const body = `<main class="home">
<section class="home-hero">
  <h1>${esc(t.site_title)}</h1>
  <p class="tagline">${esc(t.site_tagline)}</p>
  <div class="home-intro">${md(t.home_intro)}</div>
</section>
${nav}
${sections}
<section class="sec two-col">
  <div class="card"><h2>${esc(t.parents_title)}</h2>${md(t.parents_text)}</div>
  <div class="card"><h2>${esc(t.sandbox_title)}</h2><p>${esc(t.sandbox_text)}</p><p><a class="button" href="${u.sim(lang)}">${esc(t.open_sim)} ↗</a></p></div>
</section>
</main>`;
  return layout({ lang, t, u, title: t.site_title, description: t.site_tagline, altHref: u.home(other), body });
}

export function rootPage(ctx) {
  const { i18n, u } = ctx;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(i18n.de.site_title)} · ${esc(i18n.en.site_title)}</title>
<link rel="icon" href="${u.asset('favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${u.asset('style.css')}">
<script>
  try {
    var de = (navigator.languages || [navigator.language || '']).some(function (l) { return /^de\\b/i.test(l); });
    location.replace(de ? '${u.home('de')}' : '${u.home('en')}');
  } catch (e) {}
</script>
</head>
<body>
<main class="lang-choice">
  <h1>⚡</h1>
  <p><a class="button" href="${u.home('de')}">${esc(i18n.de.site_title)} (Deutsch)</a></p>
  <p><a class="button" href="${u.home('en')}">${esc(i18n.en.site_title)} (English)</a></p>
</main>
</body>
</html>
`;
}
