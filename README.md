# Electronic Playground

Small soldering projects to build with the kids, plus a circuit editor and simulator that runs in the browser.

The editor is [CircuitJS1](https://github.com/pfalstad/circuitjs1) (the Falstad circuit simulator, GPL-2.0).
It is built from source and runs in a small nginx container.
You draw the circuit, and it **simulates while you draw**: the LEDs light up, the moving dots show the current, and the sliders change brightness and resistor values.

## Start

```bash
docker compose up -d
```

Open <http://localhost:8080>. The first build compiles the simulator and takes a few minutes. After that, startup takes a second.

Our projects are in the menu under **Schaltungen → Kinder-Projekte**. Project 1 opens on start.

## Projects

| # | Project | What you learn | Parts |
|---|---|---|---|
| 1 | LED mit Schalter | Closed circuit, why the LED needs a resistor | 9V battery + clip, switch, 470 Ω, red LED |
| 2 | Nachtlicht | Sensor + transistor as a switch | 9V battery + clip, 100 kΩ, LDR (e.g. GL5528), BC547, 470 Ω, yellow LED |
| 3 | Wechselblinker | Capacitors charge and discharge, oscillator | 9V battery + clip, 2× BC547, 2× 47 kΩ, 2× 22 µF electrolytic, 2× 470 Ω, red + green LED |
| 4 | Blinklicht mit NE555 | Using a chip (IC), timing with R and C | 9V battery + clip, NE555 + 8-pin socket, 10 kΩ, 68 kΩ, 10 µF electrolytic, 10 nF, 470 Ω, LED |

The projects get harder in order, so 1 is a good first soldering job. Things to watch:

- **LED**: long leg = **+** (anode). In the drawing, the triangle points toward **−**.
- **Electrolytic capacitor**: the stripe on the case marks **−**.
- **BC547** (flat side facing you, legs down): C – B – E from left to right.
- **NE555**: the notch or dot marks pin 1. Solder the socket first, then plug in the chip.

## Add or change your own circuits

1. In the simulator, draw a circuit or change an existing one.
2. **Datei → Als Text exportieren**, then copy the text into a new file in [circuits/](circuits/), e.g. `circuits/05-mein-projekt.txt`.
3. Add a line to [circuits/menu.txt](circuits/menu.txt): `kids/05-mein-projekt.txt 5. Mein Projekt`
4. Run `docker compose restart`. Circuit files are re-read on every page load; only the menu needs the restart.

To open one circuit directly: `http://localhost:8080/circuitjs.html?startCircuit=kids/05-mein-projekt.txt`

## How it works

- [docker/circuitjs/Dockerfile](docker/circuitjs/Dockerfile): Gradle/GWT build stage, pinned to a CircuitJS commit, followed by nginx.
- [docker/circuitjs/40-kids-menu.sh](docker/circuitjs/40-kids-menu.sh): on container start, puts `circuits/menu.txt` at the top of the simulator's example menu.
- `circuits/` is mounted read-only into the container, so no rebuild is needed after changing it.

To update CircuitJS, change `CIRCUITJS_REF` in the Dockerfile and run `docker compose up -d --build`.
