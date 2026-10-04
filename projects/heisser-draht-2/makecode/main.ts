let {{fehler|mistakes}} = 0
let {{laeuft|running}} = false
let {{startzeit|startTime}} = 0
input.onPinPressed(TouchPin.P0, function () {
    {{laeuft|running}} = false
    {{fehler|mistakes}} = 0
    basic.showArrow(ArrowNames.East)
})
input.onPinReleased(TouchPin.P0, function () {
    {{laeuft|running}} = true
    {{startzeit|startTime}} = input.runningTime()
    basic.clearScreen()
})
input.onPinPressed(TouchPin.P1, function () {
    if ({{laeuft|running}}) {
        {{fehler|mistakes}} += 1
        music.playTone(131, music.beat(BeatFraction.Quarter))
        basic.showNumber({{fehler|mistakes}})
    }
})
input.onPinPressed(TouchPin.P2, function () {
    if ({{laeuft|running}}) {
        {{laeuft|running}} = false
        soundExpression.happy.play()
        basic.showString("" + Math.round((input.runningTime() - {{startzeit|startTime}}) / 1000) + "s " + {{fehler|mistakes}} + "{{F|M}}")
    }
})
basic.showIcon(IconNames.Yes)
