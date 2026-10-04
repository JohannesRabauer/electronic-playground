# Heißer Draht 2.0

## Los geht's @showdialog

Dein heißer Draht bekommt ein Gehirn: Der micro:bit **zählt deine Fehler** und **stoppt die Zeit**.
Die Öse ist mit **GND** verbunden, der Spieldraht mit **P1**, das Start-Feld mit **P0** und das Ziel-Feld mit **P2**.

## Drei Variablen

Öffne ``||variables:Variablen||`` und klick dreimal auf **Erstelle eine Variable**:
**fehler**, **laeuft** und **startzeit**. Setz sie in ``||basic:beim Start||`` auf 0 bzw. falsch und zeig ein Häkchen.

```blocks
let fehler = 0
let laeuft = false
let startzeit = 0
basic.showIcon(IconNames.Yes)
```

## Am Start warten

Wenn die Öse am Start liegt, ist **P0** gedrückt. Nimm ``||input:wenn Pin P0 gedrückt||`` aus ``||input:Eingabe||``.
Darin: **laeuft** auf **falsch**, **fehler** auf **0** und ``||basic:zeige Pfeil Osten||``.

```blocks
let fehler = 0
let laeuft = false
input.onPinPressed(TouchPin.P0, function () {
    laeuft = false
    fehler = 0
    basic.showArrow(ArrowNames.East)
})
```

## Los!

Sobald die Öse den Start verlässt, wird P0 **losgelassen**. Klick im Block ``||input:wenn Pin P0 gedrückt||`` auf
„gedrückt“ und wähl **losgelassen**. Darin: **laeuft** auf **wahr**, **startzeit** auf ``||input:Laufzeit (ms)||``
und ``||basic:Bildschirminhalt löschen||``.

```blocks
let startzeit = 0
let laeuft = false
input.onPinReleased(TouchPin.P0, function () {
    laeuft = true
    startzeit = input.runningTime()
    basic.clearScreen()
})
```

## Autsch – ein Fehler!

Berührt die Öse den Draht, ist **P1** gedrückt. Mach ``||input:wenn Pin P1 gedrückt||`` und darin ``||logic:wenn laeuft dann||``.
Darin: ``||variables:ändere fehler um 1||``, ``||music:spiele Note Tiefes C für 1/4 Schlag||`` und ``||basic:zeige Zahl fehler||``.

```blocks
let fehler = 0
let laeuft = false
input.onPinPressed(TouchPin.P1, function () {
    if (laeuft) {
        fehler += 1
        music.playTone(131, music.beat(BeatFraction.Quarter))
        basic.showNumber(fehler)
    }
})
```

## Im Ziel!

Erreicht die Öse das Ziel, ist **P2** gedrückt. Setz **laeuft** auf **falsch**, spiel ``||music:Soundeffekt glücklich||``
und zeig mit ``||basic:zeige Text||`` und ``||text:verbinde||`` die Zeit in Sekunden und die Fehler.

```blocks
let fehler = 0
let laeuft = false
let startzeit = 0
input.onPinPressed(TouchPin.P2, function () {
    if (laeuft) {
        laeuft = false
        soundExpression.happy.play()
        basic.showString("" + Math.round((input.runningTime() - startzeit) / 1000) + "s " + fehler + "F")
    }
})
```

## Im Simulator testen

Klick im Simulator auf **P0** (Start), dann ein paarmal auf **P1** (Fehler) und zum Schluss auf **P2** (Ziel).
Siehst du Zeit und Fehler?

## Auf den micro:bit laden @showdialog

Schließ den micro:bit an und klick auf **Herunterladen**. Dann die Krokodilklemmen anstecken – und los geht's!
