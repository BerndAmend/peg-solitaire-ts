import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.140.0/testing/asserts.ts";

import * as peg from "./Description.ts";

Deno.test("description needs to have a non empty name ", () => {
  assertThrows(
    () => {
      new peg.Description("", "ooo", [peg.MoveDirections.Horizontal]);
    },
    Error,
    "name cannot be empty",
  );
});

Deno.test("description requires at least 3 pegs ", () => {
  assertThrows(
    () => {
      new peg.Description("test", "o", [peg.MoveDirections.Horizontal]);
    },
    Error,
    "peg solitaire requires at least 3 pegs",
  );
});

Deno.test("description requires at least 1 move direction", () => {
  assertThrows(
    () => {
      new peg.Description("test", "ooo", []);
    },
    Error,
    "no move directions were provided",
  );
});

Deno.test("description only supports up to 63 pegs", () => {
  assertThrows(
    () => {
      new peg.Description("test", "o".repeat(64), [
        peg.MoveDirections.Horizontal,
      ]);
    },
    Error,
    "implementation supports only 63 pegs",
  );
});

Deno.test("description all layout lines have to have the same length", () => {
  assertThrows(
    () => {
      new peg.Description("test", "oo\nooo", [
        peg.MoveDirections.Horizontal,
      ]);
    },
    Error,
    "not every layout line has the same length",
  );
});

Deno.test("description no moves possible", () => {
  assertThrows(
    () => {
      new peg.Description("test", "ooo", [
        peg.MoveDirections.Vertical,
      ]);
    },
    Error,
    "No moves are possible",
  );
});

Deno.test("description invalid layout is detected", () => {
  assertThrows(
    () => {
      new peg.Description("test", " .ooo", [
        peg.MoveDirections.Horizontal,
      ]);
    },
    Error,
    "layout contains the invalid character ' ' allowed is .o\\n",
  );
});

Deno.test("description layout is valid", () => {
  new peg.Description("test", ".ooo", [peg.MoveDirections.Horizontal]);
});

Deno.test("description layout is valid", () => {
  new peg.Description("test", "ooo", [peg.MoveDirections.Horizontal]);
});

Deno.test("description peg count is correct", () => {
  assertEquals(
    new peg.Description("test", "ooooo", [peg.MoveDirections.Horizontal]).pegs,
    5,
  );
});

Deno.test("description to_string is ok 1", () => {
  assertEquals(
    new peg.Description("test", "ooooo", [peg.MoveDirections.Horizontal])
      .to_string(0b10100n),
    "x.x..",
  );
});

Deno.test("description to_string is ok 2", () => {
  assertEquals(
    new peg.Description("test", "o".repeat(63), [peg.MoveDirections.Horizontal])
      .to_string(0x7fffffff_ffffffffn),
    "x".repeat(63),
  );
});

Deno.test("description to_string is ok 3", () => {
  assertEquals(
    new peg.Description("test", ".ooooo.", [peg.MoveDirections.Horizontal])
      .to_string(0b10100n),
    " x.x.. ",
  );
});

Deno.test("description to_string is ok 4", () => {
  assertEquals(
    new peg.Description("test", ".ooooo.\n..ooo..\n...o...", [
      peg.MoveDirections.Horizontal,
      peg.MoveDirections.Vertical,
    ])
      .to_string(0b101000011n),
    " x.x.. \n  ..x  \n   x   ",
  );
});

Deno.test("description to_string detects invalid states", () => {
  assertThrows(
    () => {
      new peg.Description("test", "ooo", [peg.MoveDirections.Horizontal])
        .to_string(0b1111n);
    },
    Error,
    "state does not describe a valid game field",
  );
});

Deno.test("description from_string returns correct result", () => {
  assertEquals(
    new peg.Description("test", ".ooooo.", [peg.MoveDirections.Horizontal])
      .from_string(" x.x.. "),
    0b10100n,
  );
});

Deno.test("description from_string detects invalid states 1", () => {
  assertThrows(
    () => {
      new peg.Description("test", "ooo", [peg.MoveDirections.Horizontal])
        .from_string("xxxx");
    },
    Error,
    "state length does not match the layout length",
  );
});

Deno.test("description from_string detects invalid states 2", () => {
  assertThrows(
    () => {
      new peg.Description("test", "ooo", [peg.MoveDirections.Horizontal])
        .from_string("xxxxb");
    },
    Error,
    "state length does not match the layout length",
  );
});

Deno.test("description from_string detects invalid states 3", () => {
  assertThrows(
    () => {
      new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
        .from_string("  xxx");
    },
    Error,
    "invalid state",
  );
});

Deno.test("description from_string detects invalid states 4", () => {
  assertThrows(
    () => {
      new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
        .from_string(" xxx  ");
    },
    Error,
    "state length does not match the layout length",
  );
});

Deno.test("description to_string and from_string", () => {
  const desc = new peg.Description("test", "..ooooo.", [
    peg.MoveDirections.Horizontal,
  ]);
  const v = 0b11010n;
  assertEquals(desc.from_string(desc.to_string(v)), v);
});

Deno.test("description from_string to_string", () => {
  const desc = new peg.Description("test", "..ooooo.", [
    peg.MoveDirections.Horizontal,
  ]);
  const v = "  ..x.x ";
  const from = desc.from_string(v);
  assertEquals(from, 0b00101n);
  assertEquals(desc.to_string(from), v);
});

Deno.test("description to_vec", () => {
  assertEquals(
    new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
      .to_vec(0b100n),
    [[-1, 1, 0, 0, -1]],
  );
});

Deno.test("description to_vec handles invalid input", () => {
  assertThrows(
    () => {
      new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
        .to_vec(0b1101n);
    },
    Error,
    "invalid state",
  );
});

Deno.test("description from_vec", () => {
  assertEquals(
    new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
      .from_vec([[-1, 1, 0, 0, -1]]),
    0b100n,
  );
});

Deno.test("description from_vec handles invalid input", () => {
  assertThrows(
    () => {
      new peg.Description("test", ".ooo.", [peg.MoveDirections.Horizontal])
        .from_vec([[-1, 1, 0, -1, -1]]);
    },
    Error,
    "state does not match the game field",
  );
});

Deno.test("description to_vec from_vec is as expected", () => {
  const desc = new peg.Description("test", ".ooo.", [
    peg.MoveDirections.Horizontal,
  ]);
  const value = 0b100n;
  assertEquals(desc.from_vec(desc.to_vec(value)), value);
});

Deno.test("solve_test", async () => {
  const desc = new peg.Description(
    "English",
    "..ooo..\n..ooo..\nooooooo\nooooooo\nooooooo\n..ooo..\n..ooo..",
    [peg.MoveDirections.Horizontal, peg.MoveDirections.Vertical],
  );
  const start = desc.from_string(
    "  xxx  \n  xxx  \nxxxxxxx\nxxx.xxx\nxxxxxxx\n  xxx  \n  xxx  ",
  );
  const result = await desc.solve(start);
  const count = result.reduce((o, i) => {
    let ret = 0;
    for (const x of i.data) {
      if (x !== peg.EMPTY_STATE) {
        ret++;
      }
    }
    return o + ret;
  }, 0);
  assertEquals(count, 23475688);
});
