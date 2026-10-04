// Loads the parts catalog, UI texts, sandbox list and all projects, and checks
// every project against the schema plus the rules a schema cannot express.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkBoard, pinsOf, dipPins } from './board.mjs';

const readYaml = (file) => YAML.parse(fs.readFileSync(file, 'utf8'));

/** Picks one language in "{{Deutsch|English}}" placeholders. */
export const pickLang = (text, lang) => text.replace(/\{\{([^|}]*)\|([^}]*)\}\}/g, (_, de, en) => (lang === 'de' ? de : en));

export function loadAll(root) {
  const errors = [];
  const catalog = readYaml(path.join(root, 'parts/catalog.yaml'));
  const i18n = readYaml(path.join(root, 'site/i18n.yaml'));
  const sandbox = readYaml(path.join(root, 'sandbox/sandbox.yaml'));
  const shops = readYaml(path.join(root, 'site/shops.yaml'));
  for (const s of sandbox) {
    if (!fs.existsSync(path.join(root, 'sandbox', s.file))) errors.push(`sandbox.yaml: file ${s.file} not found`);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const validateCatalog = ajv.compile(readJson('parts/catalog.schema.json'));
  if (!validateCatalog(catalog)) {
    for (const e of validateCatalog.errors) errors.push(`parts/catalog.yaml: ${e.instancePath} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  }
  const validate = ajv.compile(readJson('projects/project.schema.json'));

  const projects = [];
  const projectsDir = path.join(root, 'projects');
  for (const id of fs.readdirSync(projectsDir).sort()) {
    const dir = path.join(projectsDir, id);
    if (!fs.statSync(dir).isDirectory() || id.startsWith('_')) continue;
    const file = path.join(dir, 'project.yaml');
    if (!fs.existsSync(file)) { errors.push(`${id}: project.yaml missing`); continue; }
    let p;
    try { p = readYaml(file); } catch (e) { errors.push(`${id}: ${e.message}`); continue; }
    if (!validate(p)) {
      for (const e of validate.errors) errors.push(`${id}: ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
      continue;
    }
    const before = errors.length;
    checkProject(p, id, dir, catalog, errors);
    if (errors.length === before) projects.push({ ...p, dir });
  }

  const seen = { number: new Map(), de: new Map(), en: new Map() };
  for (const p of projects) {
    for (const [key, val] of [['number', p.number], ['de', p.slug.de], ['en', p.slug.en]]) {
      if (seen[key].has(val)) errors.push(`${p.id}: ${key} "${val}" is already used by ${seen[key].get(val)}`);
      seen[key].set(val, p.id);
    }
  }
  projects.sort((a, b) => a.number - b.number);
  return { catalog, i18n, sandbox, shops, projects, errors };
}

function checkProject(p, id, dir, catalog, errors) {
  const err = (msg) => errors.push(`${id}: ${msg}`);
  if (p.id !== id) err(`id "${p.id}" must equal the folder name`);

  const files = [p.hero, p.simulation?.circuit, ...p.variations.map((v) => v.circuit), ...p.steps.map((s) => s.image),
    p.code?.program, ...(p.code ? [`${p.code.tutorial.de}.md`, `${p.code.tutorial.en}.md`] : [])].filter(Boolean);
  for (const f of files) if (!fs.existsSync(path.join(dir, f))) err(`file ${f} not found`);
  if (p.code && fs.existsSync(path.join(dir, p.code.program))) {
    const src = fs.readFileSync(path.join(dir, p.code.program), 'utf8').replace(/\r/g, '').trim();
    p.programs = { de: pickLang(src, 'de'), en: pickLang(src, 'en') };
  }
  if (!p.board) {
    if (p.steps.some((s) => s.view !== 'none')) err('projects without a board can only have steps with view "none"');
    return;
  }

  // Parts: known ids, unique refs, resistors have a value.
  const byRef = new Map();
  for (const part of p.parts) {
    const entry = catalog[part.part];
    if (!entry) { err(`part "${part.part}" is not in parts/catalog.yaml`); continue; }
    if (part.ref) {
      if (byRef.has(part.ref)) err(`ref ${part.ref} is used twice`);
      byRef.set(part.ref, part);
    }
    if (entry.kind === 'resistor' && !part.value) err(`${part.ref || part.part}: resistors need a value (ohms)`);
    if (['elko', 'cap'].includes(entry.kind) && !part.value) err(`${part.ref || part.part}: capacitors need a value (farads)`);
  }

  // Board parts take their part id, value and colour from the parts list.
  const placed = new Set();
  for (const bp of p.board.parts) {
    const part = byRef.get(bp.ref);
    if (!part) { err(`board part ${bp.ref} is not in parts`); continue; }
    Object.assign(bp, { part: part.part, value: part.value, color: part.color });
    const dip = /^dip(\d+)$/.exec(catalog[part.part].kind || '');
    if (dip) {
      if (!bp.pin1) { err(`${bp.ref}: chips are placed with "pin1" (and optional "rotate")`); continue; }
      bp.pins = dipPins(bp.pin1, Number(dip[1]), bp.rotate || 0);
    } else if (bp.pin1) err(`${bp.ref}: "pin1" is only for chips`);
    placed.add(bp.ref);
  }
  for (const [ref, part] of byRef) {
    if (pinsOf(catalog[part.part]) && !placed.has(ref)) err(`${ref} has a ref but is not placed on the board`);
  }
  if (errors.some((e) => e.startsWith(`${id}: board part`))) return;
  for (const e of checkBoard(p, catalog)) err(`board: ${e}`);

  // Every board part and bridge is built in exactly one step.
  const buildable = new Set([...p.board.parts.map((x) => x.ref), ...p.board.bridges.map((b) => b.id)]);
  const built = new Map();
  for (const s of p.steps) {
    for (const a of s.adds || []) {
      if (!buildable.has(a)) err(`step ${s.id}: "${a}" is neither a board part nor a bridge`);
      if (built.has(a)) err(`"${a}" is added in step ${built.get(a)} and again in step ${s.id}`);
      built.set(a, s.id);
    }
    if (s.view === 'none' && s.adds?.length) err(`step ${s.id}: steps with view "none" cannot add board items`);
  }
  for (const b of buildable) if (!built.has(b)) err(`"${b}" is never added in any step`);
}
