# Namensschild

## Los geht's @showdialog

Mach aus deinem micro:bit ein **Namensschild**: Es zeigt deinen Namen, lässt ein Herz schlagen
und kichert, wenn man es kitzelt!

## Dein Name auf Knopf A

Zieh den Block ``||input:wenn Knopf A geklickt||`` aus der Kategorie ``||input:Eingabe||`` auf die Arbeitsfläche.
Leg ``||basic:zeige Text||`` aus ``||basic:Grundlagen||`` hinein und schreib **deinen Namen** in das weiße Feld.

```blocks
input.onButtonPressed(Button.A, function () {
    basic.showString("Hallo, ich bin Kim!")
})
```

## Ausprobieren

Klick im Simulator links auf den Knopf **A**. Läuft dein Name über die LEDs?

```blocks
input.onButtonPressed(Button.A, function () {
    basic.showString("Hallo, ich bin Kim!")
})
```

## Ein Herz auf Knopf B

Hol einen zweiten Block ``||input:wenn Knopf A geklickt||`` und stell darin **B** ein.
Leg ``||loops:4-mal wiederholen||`` aus ``||loops:Schleifen||`` hinein und darin zweimal ``||basic:zeige Symbol||``:
ein großes und ein kleines Herz. Danach ``||basic:Bildschirminhalt löschen||``.

```blocks
input.onButtonPressed(Button.B, function () {
    for (let index = 0; index < 4; index++) {
        basic.showIcon(IconNames.Heart)
        basic.showIcon(IconNames.SmallHeart)
    }
    basic.clearScreen()
})
```

## Kitzel mich!

Das goldene Logo oben auf dem micro:bit V2 ist ein Sensor. Zieh ``||input:wenn Logo gedrückt||`` auf die Arbeitsfläche.
Leg ``||basic:zeige Symbol||`` (Smiley) hinein und dann aus ``||music:Musik||`` den Block ``||music:spiele Soundeffekt kichern||``.

```blocks
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    basic.showIcon(IconNames.Happy)
    soundExpression.giggle.play()
    basic.clearScreen()
})
```

## Zum Start ein Lächeln

Leg in ``||basic:beim Start||`` den Block ``||basic:zeige Symbol||`` mit dem Smiley. So sieht man gleich, dass dein Namensschild an ist.

```blocks
basic.showIcon(IconNames.Happy)
```

## Auf den micro:bit laden @showdialog

Schließ den micro:bit mit dem USB-Kabel an und klick auf **Herunterladen**. Fertig – jetzt bist du ein echtes Namensschild!
