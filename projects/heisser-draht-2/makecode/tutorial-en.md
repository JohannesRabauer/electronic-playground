# Buzz Wire 2.0

## Let's go @showdialog

Your buzz wire gets a brain: the micro:bit **counts your mistakes** and **times your run**.
The loop is connected to **GND**, the game wire to **P1**, the start pad to **P0** and the finish pad to **P2**.

## Three variables

Open ``||variables:Variables||`` and click **Make a Variable** three times:
**mistakes**, **running** and **startTime**. Set them to 0 or false in ``||basic:on start||`` and show a tick.

```blocks
let mistakes = 0
let running = false
let startTime = 0
basic.showIcon(IconNames.Yes)
```

## Waiting at the start

When the loop rests at the start, **P0** is pressed. Take ``||input:on pin P0 pressed||`` from ``||input:Input||``.
Inside it: **running** to **false**, **mistakes** to **0** and ``||basic:show arrow East||``.

```blocks
let mistakes = 0
let running = false
input.onPinPressed(TouchPin.P0, function () {
    running = false
    mistakes = 0
    basic.showArrow(ArrowNames.East)
})
```

## Go!

As soon as the loop leaves the start, P0 is **released**. In a block ``||input:on pin P0 pressed||`` click "pressed"
and choose **released**. Inside it: **running** to **true**, **startTime** to ``||input:running time (ms)||``
and ``||basic:clear screen||``.

```blocks
let startTime = 0
let running = false
input.onPinReleased(TouchPin.P0, function () {
    running = true
    startTime = input.runningTime()
    basic.clearScreen()
})
```

## Ouch – a mistake!

When the loop touches the wire, **P1** is pressed. Make ``||input:on pin P1 pressed||`` with ``||logic:if running then||`` inside.
In there: ``||variables:change mistakes by 1||``, ``||music:play tone Low C for 1/4 beat||`` and ``||basic:show number mistakes||``.

```blocks
let mistakes = 0
let running = false
input.onPinPressed(TouchPin.P1, function () {
    if (running) {
        mistakes += 1
        music.playTone(131, music.beat(BeatFraction.Quarter))
        basic.showNumber(mistakes)
    }
})
```

## Finish!

When the loop reaches the finish, **P2** is pressed. Set **running** to **false**, play ``||music:sound happy||``
and use ``||basic:show string||`` with ``||text:join||`` to show the time in seconds and the mistakes.

```blocks
let mistakes = 0
let running = false
let startTime = 0
input.onPinPressed(TouchPin.P2, function () {
    if (running) {
        running = false
        soundExpression.happy.play()
        basic.showString("" + Math.round((input.runningTime() - startTime) / 1000) + "s " + mistakes + "M")
    }
})
```

## Test in the simulator

In the simulator, click **P0** (start), then **P1** a few times (mistakes) and finally **P2** (finish).
Do you see the time and the mistakes?

## Put it on the micro:bit @showdialog

Connect the micro:bit and click **Download**. Then clip on the crocodile clips – and off you go!
