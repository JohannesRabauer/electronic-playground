# Name badge

## Let's go @showdialog

Turn your micro:bit into a **name badge**: it shows your name, makes a heart beat
and giggles when someone tickles it!

## Your name on button A

Drag the block ``||input:on button A pressed||`` from the ``||input:Input||`` category onto the workspace.
Put ``||basic:show string||`` from ``||basic:Basic||`` inside it and type **your name** into the white field.

```blocks
input.onButtonPressed(Button.A, function () {
    basic.showString("Hi, I am Kim!")
})
```

## Try it

Click button **A** on the simulator on the left. Does your name scroll across the LEDs?

```blocks
input.onButtonPressed(Button.A, function () {
    basic.showString("Hi, I am Kim!")
})
```

## A heart on button B

Get a second ``||input:on button A pressed||`` block and set it to **B**.
Put ``||loops:repeat 4 times||`` from ``||loops:Loops||`` inside it, and in there two ``||basic:show icon||`` blocks:
a big and a small heart. Then ``||basic:clear screen||``.

```blocks
input.onButtonPressed(Button.B, function () {
    for (let index = 0; index < 4; index++) {
        basic.showIcon(IconNames.Heart)
        basic.showIcon(IconNames.SmallHeart)
    }
    basic.clearScreen()
})
```

## Tickle me!

The golden logo at the top of the micro:bit V2 is a sensor. Drag ``||input:on logo pressed||`` onto the workspace.
Put ``||basic:show icon||`` (smiley) inside it and then ``||music:play sound giggle||`` from ``||music:Music||``.

```blocks
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    basic.showIcon(IconNames.Happy)
    soundExpression.giggle.play()
    basic.clearScreen()
})
```

## A smile to start with

Put a ``||basic:show icon||`` block with the smiley into ``||basic:on start||``. That way everyone sees your badge is on.

```blocks
basic.showIcon(IconNames.Happy)
```

## Put it on the micro:bit @showdialog

Connect the micro:bit with the USB cable and click **Download**. Done – now you are wearing a real name badge!
