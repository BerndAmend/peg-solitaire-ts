import asc from "assemblyscript/asc";

export enum MoveDirections {
  Horizontal,
  Vertical,
  LeftDiagonal,
  RightDiagonal,
}

export type State = bigint;
export type Lut = number[][];
export type Transformation = Map<number, State>;

export const EMPTY_STATE: State = 0n;

export class BoardSet {
  /// In the interest of memory-savings, we start with the smallest feasible
  /// power-of-two table size that can hold three items without rehashing. If we
  /// started with a size of 2, we'd have to expand as soon as the second item
  /// was added.
  readonly INITIAL_SIZE: number = 1 << 5;

  #length: number;
  #data: BigInt64Array;

  /// Returns the number of elements in the set.
  get length(): number {
    return this.#length;
  }

  get data(): BigInt64Array {
    return this.#data;
  }

  constructor(expected_size: number = 0) {
    const size = this.compute_capacity_for_size(
      expected_size,
      this.INITIAL_SIZE,
    );
    this.#data = new BigInt64Array(size);
    this.#length = 0;
  }

  /// Reserves capacity for at least additional more elements to be inserted in the HashSet.
  /// The collection may reserve more space to avoid frequent reallocations.
  reserve(additional: number) {
    const expected_size = this.#length + additional;
    if (this.size_fits_into_capacity(expected_size, this.#data.length)) {
      return;
    }

    const new_obj = new BoardSet(expected_size);
    if (this.#length !== 0) {
      new_obj.fast_insert_all(this.#data);
    }

    this.#data = new_obj.#data;
  }

  /// current fill state in percent
  used(): number {
    return this.#length === 0 ? 1 : (this.#length / this.data.length);
  }

  /// Clears the set, removing all values and freeing the memory.
  clear() {
    this.#length = 0;
    this.#data.fill(0n);
  }

  /// Returns true if the set contains a value.
  contains(value: State): boolean {
    return this.#data[this.find_or_empty(value)] !== EMPTY_STATE;
  }

  /// Adds a value to the set.
  insert(value: State) {
    this.reserve(1);
    this.fast_insert(value);
  }

  /// Adds a value to the set without checking if it is large enough.
  fast_insert(o: State) {
    const index = this.find_or_empty(o);
    if (this.#data[index] === EMPTY_STATE) {
      this.#length++;
      this.#data[index] = o;
    }
  }

  // add the elements without checking if there is enough space
  fast_insert_all(other: BigInt64Array) {
    for (const x of other) {
      if (x !== EMPTY_STATE) {
        this.fast_insert(x);
      }
    }
  }

  private size_fits_into_capacity(expected: number, current: number): boolean {
    return 4 * expected < 3 * current;
  }

  private compute_capacity_for_size(expected: number, current: number): number {
    let new_capacity = current;
    while (!this.size_fits_into_capacity(expected, new_capacity)) {
      new_capacity <<= 1;
    }
    return new_capacity;
  }

  private get_index_from_state(value: State): number {
    let h = value;
    h *= 0x85ebca6bn;
    h ^= h >> 13n;
    return Number(h & (BigInt(this.#data.length) - 1n));
  }

  /// Returns the index in the table at which a particular item resides, or the
  /// index of an empty slot in the table where this item should be inserted if
  /// it is not already in the table.
  /// @return index
  private find_or_empty(o: State): number {
    let index = this.get_index_from_state(o);

    while (true) {
      const existing = this.#data[index];
      if (existing === EMPTY_STATE || o === existing) {
        return index;
      } else {
        index = (index + 1) & (this.#data.length - 1);
      }
    }
  }
}

export class Description {
  layout: string;
  directions: MoveDirections[];
  pegs: number;

  /// Describes how (x,y)-positions (map-key) inside the layout correspond
  /// to the bit position used to represent the board
  lut: Lut;

  /// ...111... required to mask bits effected by a move and execute the move
  move_mask: State[];

  /// ...110... required to check if a move is possible
  check_mask1: State[];

  /// ...011... required to check if a move is possible
  check_mask2: State[];

  transformations: Transformation[];

  constructor(layout: string, directions: MoveDirections[]) {
    if (directions.length === 0) {
      throw new Error("no move directions were provided");
    }

    if (layout.length === 0) {
      throw new Error("layout cannot be empty");
    }

    for (const x of layout) {
      if (x !== "." && x !== "o" && x !== "\n") {
        throw new Error(
          `layout contains the invalid character '${x}' allowed is .o\\n`,
        );
      }
    }

    this.layout = layout;
    this.directions = directions;

    this.pegs = 0;
    for (const x of layout) {
      if (x === "o") {
        this.pegs++;
      }
    }

    if (this.pegs < 3) {
      throw new Error("peg solitaire requires at least 3 pegs");
    }

    if (this.pegs > 63) {
      throw new Error("implementation supports only 63 pegs");
    }

    const lines = layout.split("\n");
    if (
      lines.map((value) => value.length).reduce((accumulator, currentValue) =>
        accumulator === currentValue ? currentValue : -1
      ) === -1
    ) {
      throw new Error("not every layout line has the same length");
    }

    this.lut = (() => {
      let pos = this.pegs;
      return layout.split("\n")
        .map((line) => {
          return line.split("")
            .map((x) => {
              if (x === "o") {
                pos--;
                return pos;
              }
              return -1;
            });
        });
    })();

    // calculate the 3 required bit masks required to detect if a move is possible and to perform it
    {
      const lut = this.lut;
      const y_max = lut.length;
      const x_max = lut[0].length;

      this.move_mask = [];
      this.check_mask1 = [];
      this.check_mask2 = [];

      for (let y = 0; y < y_max; ++y) {
        for (let x = 0; x < x_max; ++x) {
          if (lut[y][x] === -1) {
            continue;
          }

          for (const dir of this.directions) {
            const [valid, x1, y1, x2, y2] =
              ((): [boolean, number, number, number, number] => {
                switch (dir) {
                  case MoveDirections.Horizontal:
                    return [true, x + 1, y, x + 2, y];
                  case MoveDirections.Vertical:
                    return [true, x, y + 1, x, y + 2];
                  case MoveDirections.LeftDiagonal:
                    return [true, x + 1, y + 1, x + 2, y + 2];
                  case MoveDirections.RightDiagonal:
                    if (x > 2) {
                      return [true, x - 1, y + 1, x - 2, y + 2];
                    }
                    return [false, 0, 0, 0, 0];
                }
                throw new Error(
                  "a new MoveDirections was added without handling it",
                );
              })();

            if (
              valid && x1 < x_max && y1 < y_max && lut[y1][x1] !== -1 &&
              x2 < x_max && y2 < y_max &&
              lut[y2][x2] !== -1
            ) {
              this.move_mask.push(
                (1n << BigInt(lut[y][x])) | (1n << BigInt(lut[y1][x1])) |
                  (1n << BigInt(lut[y2][x2])),
              );
              this.check_mask1.push(
                (1n << BigInt(lut[y][x])) | (1n << BigInt(lut[y1][x1])),
              );
              this.check_mask2.push(
                (1n << BigInt(lut[y1][x1])) | (1n << BigInt(lut[y2][x2])),
              );
            }
          }
        }
      }
    }

    if (this.move_mask.length === 0) {
      throw new Error("No moves are possible");
    }

    // calculate transformations
    {
      const vertical_flip = (lut: Lut): Lut => lut.map((x) => [...x]).reverse();
      const horizontal_flip = (lut: Lut): Lut =>
        lut.map((x) => [...x].reverse());

      const transpose = (lut: Lut): Lut => {
        const r = lut.map((x) => [...x]);
        for (let y = 0; y < r.length; ++y) {
          for (let x = 0; x < r[0].length; ++x) {
            if (x > y) {
              continue;
            }
            const tmp = r[y][x];
            r[y][x] = r[x][y];
            r[x][y] = tmp;
          }
        }
        return r;
      };

      const have_same_shape = (in1: Lut, in2: Lut): boolean => {
        if (in1.length !== in2.length || in1[0].length !== in2[0].length) {
          return false;
        }
        for (let y = 0; y < in1.length; ++y) {
          for (let x = 0; x < in2[0].length; ++x) {
            if (
              (in1[y][x] === -1 || in2[y][x] === -1) && in1[y][x] !== in2[y][x]
            ) {
              return false;
            }
          }
        }
        return true;
      };

      const transformations: Lut[] = [];
      {
        const movemask_as_vec: Lut[] = [];
        for (const x of this.move_mask) {
          try {
            const v = this.to_vec(x);
            movemask_as_vec.push(v);
          } catch {
            // ignore exceptions thrown by to_vec
          }
        }

        const add_transformation = (func: (lut: Lut) => Lut) => {
          const x = func(this.lut);
          if (
            have_same_shape(this.lut, x) &&
            movemask_as_vec.every((i) => {
              try {
                return this.move_mask.includes(this.from_vec(func(i)));
              } catch {
                return false;
              }
            })
          ) {
            transformations.push(x);
          }
        };

        add_transformation(vertical_flip);
        add_transformation(horizontal_flip);
        add_transformation((lut: Lut) => horizontal_flip(vertical_flip(lut)));

        // if transpose is possible
        if (this.lut.length === this.lut[0].length) {
          add_transformation(transpose);
          add_transformation((lut: Lut) => vertical_flip(transpose(lut)));
          add_transformation((lut: Lut) => horizontal_flip(transpose(lut)));
          add_transformation((lut: Lut) =>
            horizontal_flip(vertical_flip(transpose(lut)))
          );
        }
      }

      this.transformations = [];
      for (const trans of transformations) {
        const field = [];

        for (const y of trans) {
          for (const x of y) {
            if (x !== -1) {
              field.push(x);
            }
          }
        }

        const output: Transformation = new Map();
        for (let i = field.length - 1; i >= 0; --i) {
          const e = field[field.length - 1 - i];
          const diff = e - i;

          let mask = 1n << BigInt(i);
          const cur = output.get(diff);
          if (cur !== undefined) {
            mask |= cur;
          }

          output.set(diff, mask);
        }
        this.transformations.push(output);
      }
    }
  }

  public is_valid(state: State): boolean {
    return state <= ((1n << BigInt(this.pegs)) - 1n);
  }

  /// creates a human-readable version of a field, the output as described by the layout
  /// Throws an exception if the state was invalid
  public to_string(state: State): string {
    if (!this.is_valid(state)) {
      throw new Error("state does not describe a valid game field");
    }

    let pos = this.pegs;
    return this.layout.split("").map((x) => {
      switch (x) {
        case ".":
          return " ";
        case "\n":
          return "\n";
        case "o":
          pos -= 1;
          return (state & (1n << BigInt(pos))) !== 0n ? "x" : ".";
      }
    }).join("");
  }

  /// converts a human-readable version into the internal representation
  /// Throws an exception if the state was invalid
  public from_string(state: string): State {
    let pos = 0n;
    let result: State = EMPTY_STATE;

    if (state.length !== this.layout.length) {
      throw new Error("state length does not match the layout length");
    }

    if (
      !this.layout.split("").every((l, i) => {
        const s = state[i];
        switch (l) {
          case "o":
            return s === "x" || s === ".";
          case ".":
            return s === " ";
          case "\n":
            return s === "\n";
          default:
            return false;
        }
      })
    ) {
      throw new Error("invalid state");
    }

    for (const x of state.split("").reverse()) {
      if (pos > this.pegs) {
        throw new Error("invalid state");
      }

      switch (x) {
        case "\n":
        case " ":
        case "\t":
          // nothing todo
          break;
        case "x":
          result |= 1n << pos;
          pos++;
          break;
        case ".":
          pos++;
          break;
        default:
          throw new Error("invalid state");
      }
    }

    if (pos > this.pegs) {
      throw new Error("invalid state");
    }

    return result;
  }

  /// blocked fields get -1, empty fields get 0, used fields 1
  /// Throws an exception if the state was invalid
  public to_vec(state: State): Lut {
    if (!this.is_valid(state)) {
      throw new Error("invalid state");
    }

    return this.lut.map((o) =>
      o.map((x) => {
        if (x === -1) {
          return -1;
        } else if ((state & (1n << BigInt(x))) === 0n) {
          return 0;
        } else {
          return 1;
        }
      })
    );
  }

  /// Throws an exception if the state does not match the internal game field
  public from_vec(state: Lut): State {
    let r = EMPTY_STATE;
    for (let y = 0; y < state.length; ++y) {
      for (let x = 0; x < state[0].length; ++x) {
        switch (state[y][x]) {
          case 1:
            r |= 1n << BigInt(this.lut[y][x]);
            break;
          case 0:
            if (this.lut[y][x] === -1) {
              throw new Error("state does not match the game field");
            }
            break;
          case -1:
            if (this.lut[y][x] !== -1) {
              throw new Error("state does not match the game field");
            }
            break;
          default:
            throw new Error("unexpected state entry");
        }
      }
    }
    return r;
  }

  public generate_wasm_code_normalize(): string {
    let ret = `export function normalize(state: u64): u64 { let r = state;\n`;
    const states = this.transformations.map((trans) => {
      const ops: string[] = [];
      for (const [shift, pos] of trans) {
        if (shift === 0) {
          ops.push(`(state & ${pos})`);
        } else {
          ops.push(
            `(state & ${pos})${shift > 0 ? " << " : " >> "}${
              shift > 0 ? shift : Math.abs(shift)
            }`,
          );
        }
      }
      return ops.join(" | ");
    });

    for (const s of states) {
      ret += `{const c = ${s}; if (c < r) r = c}\n`;
    }
    ret += "return r}\n";
    return ret;
  }

  public async generate_normalize_function(): Promise<(state: State) => State> {
    // @ts-ignore: I have no idea on how to fix this
    const result = await asc.compileString(this.generate_wasm_code_normalize());
    if (result.error) {
      throw Error(`Compilation error ${result.stderr.toString()}`);
    }

    const wasmModule = new WebAssembly.Module(result.binary);
    const wasmInstance = new WebAssembly.Instance(wasmModule);
    const normalize = wasmInstance.exports.normalize as (state: State) => State;
    return normalize;
  }

  public async solve(
    start: State,
    before?: (pegs: number) => void,
    after?: (possible_fields: number) => void,
  ): Promise<BoardSet[]> {
    const normalize = await this.generate_normalize_function();

    if (!this.is_valid(start)) {
      throw Error("invalid state");
    }

    const solution: BoardSet[] = [];

    let current: BoardSet = new BoardSet();
    current.insert(normalize(start));

    const size = this.move_mask.length;
    while (current.length !== 0) {
      if (before) {
        before(solution.length + 2);
      }
      const next: BoardSet = new BoardSet();
      for (const field of current.data) {
        if (field === EMPTY_STATE) {
          continue;
        }
        next.reserve(size);
        for (let i = 0; i < size; ++i) {
          const v = field & this.move_mask[i];
          if (v === this.check_mask1[i] || v === this.check_mask2[i]) {
            next.fast_insert(normalize(field ^ this.move_mask[i]));
          }
        }
      }

      solution.push(current);
      current = next;
      if (after) {
        after(current.length);
      }
    }

    return solution;
  }
}
