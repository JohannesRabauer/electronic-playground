input.onButtonPressed(Button.A, function () {
    basic.showString("{{Hallo, ich bin Kim!|Hi, I am Kim!}}")
})
input.onButtonPressed(Button.B, function () {
    for (let index = 0; index < 4; index++) {
        basic.showIcon(IconNames.Heart)
        basic.showIcon(IconNames.SmallHeart)
    }
    basic.clearScreen()
})
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    basic.showIcon(IconNames.Happy)
    soundExpression.giggle.play()
    basic.clearScreen()
})
basic.showIcon(IconNames.Happy)
