// Builds the static website into dist/.
//
//   node scripts/build.mjs           build once (fails on any project error)
//   node scripts/build.mjs --check   only validate projects
//   node scripts/build.mjs --watch   rebuild whenever content changes (polling,
//                                    because file events do not cross Docker
//                                    bind mounts on Windows/macOS)
//
// Environment:
//   BASE_PATH      URL path the site lives under, e.g. "/electronic-playground/" (default "/")
//   SITE_URL       absolute URL of the site, used for QR codes (default http://localhost:8080/)
//   CIRCUITJS_DIR  compiled CircuitJS site to copy into dist/sim (set in the Docker image)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { loadAll } from './lib/load.mjs';
import { LANGS, urls, circuitPath, projectPage, printPage, homePage, rootPage } from './lib/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const withSlash = (s) => (s.endsWith('/') ? s : `${s}/`);
const BASE = withSlash(process.env.BASE_PATH || '/');
if (!BASE.startsWith('/')) throw new Error(`BASE_PATH must start with "/" (got "${BASE}")`);
const SITE_URL = withSlash(process.env.SITE_URL || 'http://localhost:8080/');
const CIRCUITJS_DIR = process.env.CIRCUITJS_DIR;
const SIM_DIR = path.join(DIST, 'sim');
const CIRCUITS_DIR = path.join(SIM_DIR, 'circuitjs1', 'circuits');

const args = new Set(process.argv.slice(2));

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/**
 * Picks one language in a CircuitJS file: "{{Deutsch|English}}" -> one of both.
 * Spaces inside text elements ("x" lines) are escaped as \s, as CircuitJS expects.
 */
export function localizeCircuit(text, lang) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      const l = line.replace(/\{\{([^|}]*)\|([^}]*)\}\}/g, (_, de, en) => (lang === 'de' ? de : en));
      if (!l.startsWith('x ')) return l;
      const parts = l.split(' ');
      return [...parts.slice(0, 7), parts.slice(7).join('\\s')].join(' ');
    })
    .join('\n');
}

function copySimulator() {
  if (!CIRCUITJS_DIR) {
    console.warn('! CIRCUITJS_DIR not set - the simulator is not included (use Docker, see README).');
    return;
  }
  fs.rmSync(SIM_DIR, { recursive: true, force: true });
  fs.cpSync(CIRCUITJS_DIR, SIM_DIR, { recursive: true });
}

function buildCircuitsAndMenu({ projects, sandbox, i18n }) {
  fs.rmSync(path.join(CIRCUITS_DIR, 'projects'), { recursive: true, force: true });
  fs.rmSync(path.join(CIRCUITS_DIR, 'sandbox'), { recursive: true, force: true });
  const menu = ['### setuplist.txt first line must be a comment'];
  let first = true;
  const entry = (file, title) => {
    menu.push(`${first ? '>' : ''}${file} ${title}`);
    first = false;
  };

  for (const lang of LANGS) {
    menu.push(`+${i18n[lang].sim_menu_projects}`);
    for (const p of projects) {
      const files = [[p.simulation.circuit, ''], ...p.variations.filter((v) => v.circuit).map((v) => [v.circuit, ` – ${v.title[lang]}`])];
      for (const [file, suffix] of files) {
        const src = fs.readFileSync(path.join(p.dir, file), 'utf8');
        const rel = circuitPath(p, file, lang);
        write(path.join(CIRCUITS_DIR, rel), localizeCircuit(src, lang));
        entry(rel, `${p.number}. ${p.title[lang]}${suffix}`);
      }
    }
    menu.push('-');
  }

  menu.push(`+${i18n.de.sim_menu_sandbox} / ${i18n.en.sim_menu_sandbox}`);
  for (const s of sandbox) {
    const src = fs.readFileSync(path.join(ROOT, 'sandbox', s.file), 'utf8');
    for (const lang of LANGS) write(path.join(CIRCUITS_DIR, 'sandbox', s.file.replace(/\.txt$/, `.${lang}.txt`)), localizeCircuit(src, lang));
    entry(`sandbox/${s.file.replace(/\.txt$/, '.de.txt')}`, `${s.title.de} / ${s.title.en}`);
  }
  menu.push('-');

  // Keep CircuitJS's own example list below ours, without its default-circuit marker.
  const stock = CIRCUITJS_DIR && path.join(CIRCUITJS_DIR, 'circuitjs1', 'setuplist.txt');
  if (stock && fs.existsSync(stock)) {
    menu.push(...fs.readFileSync(stock, 'utf8').replace(/\r/g, '').split('\n').slice(1).map((l) => l.replace(/^>/, '')));
  }
  write(path.join(SIM_DIR, 'circuitjs1', 'setuplist.txt'), menu.join('\n'));
}

async function buildSite(data) {
  for (const dir of [...LANGS, 'assets', 'projects']) fs.rmSync(path.join(DIST, dir), { recursive: true, force: true });
  const u = urls(BASE);
  const ctx = { ...data, u };

  fs.cpSync(path.join(ROOT, 'site', 'assets'), path.join(DIST, 'assets'), { recursive: true });
  write(path.join(DIST, 'index.html'), rootPage(ctx));
  write(path.join(DIST, '.nojekyll'), '');

  for (const p of data.projects) {
    for (const f of fs.readdirSync(p.dir, { recursive: true })) {
      if (/\.(svg|png|jpe?g|webp)$/i.test(f)) {
        const dest = path.join(DIST, 'projects', p.id, f);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(p.dir, f), dest);
      }
    }
  }

  for (const lang of LANGS) {
    write(path.join(DIST, lang, 'index.html'), homePage(ctx, lang));
    for (const p of data.projects) {
      const pageUrl = new URL(u.project(lang, p).slice(BASE.length), SITE_URL).href;
      const qr = await QRCode.toString(pageUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
      const dir = path.join(DIST, lang, p.slug[lang]);
      write(path.join(dir, 'index.html'), projectPage(ctx, p, lang));
      write(path.join(dir, u.print(lang, p).split('/').at(-2), 'index.html'), printPage(ctx, p, lang, qr));
    }
  }
}

async function buildOnce({ simulator }) {
  const started = Date.now();
  const data = loadAll(ROOT);
  if (data.errors.length) {
    console.error(`✗ ${data.errors.length} problem(s):\n${data.errors.map((e) => `  - ${e}`).join('\n')}`);
    return false;
  }
  if (args.has('--check')) {
    console.log(`✓ ${data.projects.length} project(s) OK`);
    return true;
  }
  if (simulator) copySimulator();
  buildCircuitsAndMenu(data);
  await buildSite(data);
  console.log(`✓ built ${data.projects.length} project(s) into dist/ in ${Date.now() - started} ms (base ${BASE})`);
  return true;
}

function signature() {
  let sig = '';
  for (const dir of ['projects', 'parts', 'site', 'sandbox']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
      const st = fs.statSync(path.join(ROOT, dir, f));
      sig += `${f}:${st.mtimeMs}:${st.size};`;
    }
  }
  return sig;
}

if (args.has('--watch')) {
  let last = signature();
  copySimulator();
  await buildOnce({ simulator: false });
  console.log('… watching projects/, parts/, site/ and sandbox/ for changes');
  setInterval(async () => {
    const now = signature();
    if (now === last) return;
    last = now;
    try { await buildOnce({ simulator: false }); } catch (e) { console.error(e); }
  }, 1000);
} else {
  const ok = await buildOnce({ simulator: true });
  process.exitCode = ok ? 0 : 1;
}
