# Project structure

Every project is a folder in `projects/` and follows the same structure. The build
(`node scripts/build.mjs`, run automatically by `docker compose up` and in CI)
**refuses to build** if a project breaks one of these rules. The pilot project
[`projects/heisser-draht`](../projects/heisser-draht/project.yaml) is the reference.

## Audience and tone

- Children aged **8–14**, soldering with an adult nearby. Steps talk to the child ("you"),
  `parent` notes talk to the adult.
- Every text exists in **German and English**. No project is published in only one language.
- **Batteries only** (max. 9 V). No mains voltage, no lithium cells without a protection circuit.
- Boards are **perfboard** (2.54 mm pitch, separate pads). Connections on the bottom are
  solder bridges made from cut-off component legs.

## Categories

Every project has a `category`. The home page groups projects by it:

| `category` | de / en | What it means |
|---|---|---|
| `solder` | Löten / Soldering | Classic electronics on perfboard, battery-powered, no computer |
| `microbit` | micro:bit | Programming the BBC micro:bit, no soldering (crocodile clips at most) |
| `microbit-solder` | micro:bit + Löten / micro:bit + soldering | A soldered add-on board controlled by the micro:bit |

### What each category requires

| | `solder` | `microbit` | `microbit-solder` |
|---|---|---|---|
| `simulation` (CircuitJS) | required | – | optional |
| `code` (MakeCode) | – | required | required |
| `board` + `nets` | required | – | required |

## micro:bit projects

```yaml
code:
  program: makecode/main.ts                       # the finished program (MakeCode JavaScript)
  tutorial: { de: makecode/tutorial-de, en: makecode/tutorial-en }   # without .md
  try: { de: "…", en: "…" }
```

- **`main.ts`** is the finished program. Texts and variable names can be bilingual with `{{Deutsch|English}}`.
  The page shows it as MakeCode blocks in the page language, with a **Run** button for the micro:bit simulator
  (`makecode.microbit.org/--docs`). Nothing has to be published on makecode.com.
- **Tutorials** are MakeCode tutorial markdown (`# Title`, `## Step`, a `blocks` code fence per step, `@showdialog`).
  MakeCode loads them straight from GitHub (`#tutorial:github:<repo>/projects/<id>/makecode/tutorial-de`),
  so they only work once pushed. The build keeps the root **`pxt.json`** (which lists all tutorials) in sync – commit it.
- The page loads MakeCode from Microsoft **only after a click** (privacy); visitors can choose to remember that.
- Use the **exact block names** MakeCode shows in each language (e.g. „wenn Knopf A geklickt“ / "on button A pressed").
  Check them by opening the program on the project page.
- micro:bit projects target the **V2** (speaker, microphone, touch logo).

## Folder

```
projects/<id>/
  project.yaml          everything about the project (schema: projects/project.schema.json)
  circuit.txt           CircuitJS simulation of the finished circuit
  variation-*.txt       optional simulations for "Change it!" ideas
  images/               hero picture and step pictures (SVG preferred, PNG/JPG fine)
```

`<id>` is lowercase with dashes and never changes. The URL slugs (`slug.de`, `slug.en`) can differ per language.

## Page structure

The website page and the A4 print version show the same sections **in this order**:

| # | Section (de / en) | Source in `project.yaml` | Notes |
|---|---|---|---|
| 1 | Steckbrief / overview | `title`, `tagline`, `facts`, `hero`, `intro`, `learn` | age, difficulty 1–3, minutes, cost, topics |
| 2 | Ausprobieren / Try it | `simulation` | embedded simulator on the web; a **QR code** to the web page on paper |
| 3 | Das brauchst du / What you need | `parts` + `parts/catalog.yaml` | grouped into components, materials and tools |
| 4 | Die Platine / The board | `board` | top view and mirrored bottom view, drawn from the data |
| 5 | Schritt für Schritt / Step by step | `steps` | one step = one action + one picture + a checkbox |
| 6 | Was passiert da? / What is happening? | `explanation.kids`, `explanation.parents` | simple version + detailed version |
| 7 | Verändere es! / Change it! | `variations` | at least one; may link its own simulation |
| 8 | Funktioniert nicht? / Not working? | `troubleshooting` | at least two problem → solution pairs |
| 9 | Sicherheit / Safety | `safety` + general rules | the general soldering rules are always added |

URLs: `/<lang>/<slug>/` for the page, `/de/<slug>/drucken/` and `/en/<slug>/print/` for the A4 version.

## The board as data

Holes are named like on a printed perfboard: column letter + row number (`A1` = top left, seen from the top).

```yaml
board:
  cols: 12
  rows: 11
  parts:                       # every part with a `ref` in `parts`
    - { ref: R1, pins: { "1": E4, "2": E8 }, label: left }
    - { ref: LED1, pins: { A: E10, K: F10 } }        # A = anode (+), K = cathode (−)
  bridges:                     # solder bridges on the bottom; every point is soldered
    - { id: touch, points: [B4, E4, H4] }
nets:                          # what must be connected
  TOUCH: [X1.2, R1.1, BZ1.+]
```

### Part kinds and their pins

| Kind | Pins | Placement options |
|---|---|---|
| `resistor` | `1 2` | |
| `led` | `A K` (A = anode, long leg) | |
| `ldr`, `cap` | `1 2` | |
| `elko` | `+ -` | |
| `buzzer` | `+ -` | |
| `transistor` | `C B E` | flat side is drawn automatically (C B E left to right when the flat side faces you) |
| `button` | `1 2` | two diagonally opposite legs of a 6×6 mm button |
| `terminal` | `1 2` | `opens: left/right/up/down` |
| `leads` | from the catalog, e.g. `+ -` | `exits: left/right` (wires leaving the board: battery clips, probes) |
| `dip8`, `dip16` | `1 … n` | `pin1: C10` and `rotate: 0` (notch up) or `270` (notch left) instead of `pins` |
| `jumper` | `1 2` | insulated wire on the component side, may cross anything; `via: [B1, O1]` for its route |
| `toroid` | `r1 r2 g1 g2` (red/green wire, start/end) | `center: D5` |

Every part can also take `label: left/right/above/below` to move its label and `text: "5"` to replace it.
The colour of LEDs and jumper wires comes from `color` in `parts`.

A net with a single pin means "not connected", e.g. `CONTROL: [IC1.5]` for an unused chip pin.

The build checks that:

- every pin sits in a hole on the board, and no two pins share a hole;
- bridges run straight (row or column) and never pass over a hole they do not solder (that would be a short);
- bridges do not cross each other;
- the connections on the board **exactly** match `nets`: nothing missing, nothing shorted;
- every board part and bridge is added in exactly one step.

Step pictures are generated: each step shows what is built so far, glows the new parts and
tags their holes ("E4"). Use `view: bottom` for soldering bridges (the picture is mirrored,
like the real board turned over), `view: none` with an optional `image` for steps off the board,
and `marks: [A1]` to point at extra holes.

New part kinds need a drawing function in `scripts/lib/board.mjs` (`draw` and `KIND_PINS`),
the kind in `parts/catalog.schema.json` and an entry in `parts/catalog.yaml`.

**YAML tip:** in `{ de: …, en: … }` one-liners, a comma or a `: ` inside the text breaks the line apart.
Put such texts in quotes: `{ de: "Kurz an, lang aus", en: "Short on, long off" }`.

## The simulation

- `circuit.txt` is a CircuitJS file: draw it in the simulator, then **File → Export As Text** and save it.
- Text labels can be bilingual: `{{Summer|Buzzer}}`. The build creates `circuit.de.txt` and `circuit.en.txt`.
- Make it interactive: whatever the child does in real life (touch, press, cover the LDR)
  should be a switch, push button or slider in the simulation.
- **Check it works** before publishing: `docker compose up`, open the project page, try it.

## Shopping list

The page `/de/einkaufsliste/` · `/en/shopping-list/` is generated from the `parts` of all published projects:
everything, per category and per project, with quantities added up. Every catalog entry needs a `buy` block:

```yaml
buy: { search: { de: "BC547", en: "BC547 transistor" }, shops: [reichelt, aliexpress], tip: { de: "…", en: "…" } }
buy: { where: { de: "Baumarkt", en: "hardware store" } }      # for things you do not order online
```

- Links are **plain shop searches** (`site/shops.yaml`), never affiliate links, and the site shows **no prices**.
- `shops` lists the German shops that suit the part best; English pages use Amazon (US/UK) and AliExpress.
- Use `tip` to point to the cheap option, e.g. an assortment or the micro:bit Go bundle.

### One-click carts

`parts/products.yaml` lists concrete Amazon products (amazon.de for German pages, amazon.com for English pages).
Each product `covers` catalog parts. For any set of projects the build picks the covering products, split into
**parts**, **tools** and **micro:bit**. They appear for everything, per category and per project, and on every project page.

- **Without a partner tag** (`associate_tags` in `products.yaml` empty): a list of direct product links.
- **With a partner tag** for a market: one-click "add to cart" buttons (`/gp/aws/cart/add.html?AssociateTag=…&ASIN.1=…`).
  Amazon only fills the basket from such a link if it carries a partner tag. These buttons are partner links, so they are
  labelled **Werbung / Ad**, carry the Amazon partner disclosure and `rel="sponsored"`. The search links stay ad-free.
- Partner buttons also require a complete legal notice in `site/imprint.yaml` (published as `/de/impressum/`,
  `/en/legal-notice/`). Without it, the build keeps them off and prints a warning.

- Prefer assortments that cover many projects; check the contents (e.g. resistor values) on the product page.
- Every catalog part a project needs should be covered by a product, or have `buy.where` (hardware store, at home).
- No prices on the site. Update `checked` after re-checking the listings.

## Checklist for a new project

1. Copy `projects/heisser-draht` to `projects/<new-id>`, set `id`, `number`, `slug`, `status: draft`.
2. Build the circuit in the simulator (`http://localhost:8080/sim/circuitjs.html`), save it as `circuit.txt`.
3. Add any new parts to `parts/catalog.yaml`.
4. Lay out the board, declare `nets`, write the steps. The build tells you what is wrong.
5. Write all texts in German and English.
6. Check the web page and the A4 version (print preview, "background graphics" on).
7. Build it for real with a child. Fix what was confusing. Then set `status: published`.
