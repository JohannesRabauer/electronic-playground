# Electronics Playground · Elektronik-Spielplatz

Soldering projects for kids aged 8–14, in German and English. Every project has:

- a shopping list,
- a perfboard layout,
- a step-by-step guide with a picture for every step,
- a **circuit simulator** to try the circuit before soldering,
- a printable **A4 version** for the workbench.

The website is static and published to GitHub Pages. The simulator is
[CircuitJS1](https://github.com/pfalstad/circuitjs1) by Paul Falstad and Iain Sharp (GPL-2.0),
compiled from source during the build.

## Run it locally

You only need Docker:

```bash
docker compose up --build
```

Open <http://localhost:8080>. If port 8080 is taken, start with `WEB_PORT=8090 docker compose up --build` instead. The first build compiles the simulator and takes a few minutes.

The `builder` container watches `projects/`, `parts/`, `site/` and `sandbox/` and rebuilds
within a second or two of every save. Reload the page to see the change. Validation errors
appear in the log:

```bash
docker compose logs -f builder
```

Changes to `scripts/` need a restart: `docker compose restart builder`.

## Repository layout

| Path | What |
|---|---|
| `projects/<id>/` | One folder per project: `project.yaml`, simulation, images |
| `projects/project.schema.json` | The rules every project must follow |
| `docs/PROJECT-STRUCTURE.md` | **How to write a project**, start here |
| `parts/catalog.yaml` | All parts, materials and tools (DE/EN names, buying hints) |
| `sandbox/` | Loose circuits for the simulator menu (ideas, not projects yet) |
| `site/` | UI texts (`i18n.yaml`), shops for the shopping list (`shops.yaml`), stylesheet, small script |
| `scripts/` | The static site generator (Node, no framework) |
| `site/imprint.yaml` | Impressum details. Until they are filled in, the Amazon partner buttons stay off and no Impressum or privacy page is published |
| `pxt.json` | Generated list of MakeCode tutorials – MakeCode reads it from GitHub, so commit it |
| `docker/` | Dockerfile (simulator build + site build) and nginx config |

## Publishing

`.github/workflows/pages.yml` builds the site with the same Dockerfile and deploys it to
GitHub Pages on every push to `main`. Pull requests only build, which also validates all projects.

To update the simulator, change `CIRCUITJS_REF` in `docker/builder/Dockerfile`.
