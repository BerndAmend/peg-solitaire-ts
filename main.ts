import * as peg from "./Description.ts";

console.log("peg-solitaire typescript edition");
console.log("Copyright (C) 2021 Bernd Amend <pegsolitaire@berndamend.de>");
console.log(
  "This program is free software: you can redistribute it and/or modify",
);
console.log(
  "it under the terms of the GNU General Public License version 3 as published by",
);
console.log(
  "the Free Software Foundation. This program comes with ABSOLUTELY NO WARRANTY",
);
console.log(`usage bla [board]`);
console.log("  boards: english [default], euro, 15");

const [desc, startAsString] = ((): [peg.Description, string] => {
  switch (Deno.args[0]) {
    case "euro":
      return [
        new peg.Description(
          "European",
          "..ooo..\n.ooooo.\nooooooo\nooooooo\nooooooo\n.ooooo.\n..ooo..",
          [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical],
        ),
        "  xxx  \n xxxxx \nxxxxxxx\nxxx.xxx\nxxxxxxx\n xxxxx \n  xxx  ",
      ];
    case "15":
      return [
        new peg.Description("Holes15", "o....\noo...\nooo..\noooo.\nooooo", [
          peg.MoveDirections.Horizontal,
          peg.MoveDirections.Vertical,
          peg.MoveDirections.LeftDiagonal,
          peg.MoveDirections.RightDiagonal,
        ]),
        "x    \nxx   \nxxx  \nxxxx \n.xxxx",
      ];
    case "english":
    default:
      return [
        new peg.Description(
          "English",
          "..ooo..\n..ooo..\nooooooo\nooooooo\nooooooo\n..ooo..\n..ooo..",
          [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical],
        ),
        "  xxx  \n  xxx  \nxxxxxxx\nxxx.xxx\nxxxxxxx\n  xxx  \n  xxx  ",
      ];
  }
})();

const start = desc.from_string(startAsString);
await desc.solve(start);
