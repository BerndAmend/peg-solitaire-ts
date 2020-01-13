import * as peg from "./Description"

console.log("peg-solitaire rust edition")
console.log("Copyright (C) 2019 Bernd Amend <berndamend+pegsolitaire@gmail.com>")
console.log("This program is free software: you can redistribute it and/or modify")
console.log("it under the terms of the GNU General Public License version 3 as published by")
console.log("the Free Software Foundation. This program comes with ABSOLUTELY NO WARRANTY")
console.log(`usage ${process.argv[0]} [board]`)
console.log("  boards: english [default], euro, 15")

const boardSelection = process.argv[0].includes("node") ? 2 : 1

const [desc, startAsString] = ((): [peg.Description, string] => {
    switch(process.argv[boardSelection]) {
    case "euro":
        return [new peg.Description("European",
                            "..ooo..\n.ooooo.\nooooooo\nooooooo\nooooooo\n.ooooo.\n..ooo..",
                            [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical]),
            "  xxx  \n xxxxx \nxxxxxxx\nxxx.xxx\nxxxxxxx\n xxxxx \n  xxx  "]
    case "15":
        return [new peg.Description("Holes15",
                            "o....\noo...\nooo..\noooo.\nooooo",
                            [peg.MoveDirections.Horizontal,
                             peg.MoveDirections.Vertical,
                             peg.MoveDirections.LeftDiagonal,
                             peg.MoveDirections.RightDiagonal]),
            "x    \nxx   \nxxx  \nxxxx \n.xxxx"]
    case "english":
    default:
        return [new peg.Description("English",
                            "..ooo..\n..ooo..\nooooooo\nooooooo\nooooooo\n..ooo..\n..ooo..",
                            [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical]),
            "  xxx  \n  xxx  \nxxxxxxx\nxxx.xxx\nxxxxxxx\n  xxx  \n  xxx  "]
    }
})()

const start = desc.from_string(startAsString)
desc.solve(start)