import * as peg from "./Description.ts";

console.log("peg-solitaire typescript edition");
console.log("Copyright (C) 2021-2022 Bernd Amend <pegsolitaire@berndamend.de>");
console.log(
  "This program is free software: you can redistribute it and/or modify",
);
console.log(
  "it under the terms of the GNU General Public License version 3 as published by",
);
console.log(
  "the Free Software Foundation. This program comes with ABSOLUTELY NO WARRANTY",
);
console.log(`usage deno run main.ts [board]`);
console.log("  boards: english [default], euro, 15");

const [desc, startAsString] = ((): [peg.Description, string] => {
  switch (Deno.args[0]) {
    case "euro":
      return [
        new peg.Description(
          "..ooo..\n.ooooo.\nooooooo\nooooooo\nooooooo\n.ooooo.\n..ooo..",
          [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical],
        ),
        "  xxx  \n xxxxx \nxxxxxxx\nxxx.xxx\nxxxxxxx\n xxxxx \n  xxx  ",
      ];
    case "15":
      return [
        new peg.Description("o....\noo...\nooo..\noooo.\nooooo", [
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
          "..ooo..\n..ooo..\nooooooo\nooooooo\nooooooo\n..ooo..\n..ooo..",
          [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical],
        ),
        "  xxx  \n  xxx  \nxxxxxxx\nxxx.xxx\nxxxxxxx\n  xxx  \n  xxx  ",
      ];
  }
})();

const start = desc.from_string(startAsString);

const startTime = new Date().getTime();
let lastTime = startTime;

const solution = await desc.solve(start, (pegs: number) => {
  lastTime = new Date().getTime();
  console.log(`search fields with ${pegs} removed pegs`);
}, (possible_fields: number) => {
  const endTime = new Date().getTime();
  console.log(
    `, found ${possible_fields} fields in ${endTime - lastTime}ms`,
  );
  lastTime = endTime;
});
console.log(`took ${new Date().getTime() - startTime}ms`);

