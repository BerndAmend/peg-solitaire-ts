import { openSync } from "fs";
import vm from "vm";

export enum MoveDirections {
    Horizontal,
    Vertical,
    LeftDiagonal,
    RightDiagonal,
}

export type State = bigint;
export type Lut = number[][];
export type Transformation = Map<number, State>

export const EMPTY_STATE: bigint = 0n;

export class BoardSet {
    /// In the interest of memory-savings, we start with the smallest feasible
    /// power-of-two table size that can hold three items without rehashing. If we
    /// started with a size of 2, we'd have to expand as soon as the second item
    /// was added.
    readonly INITIAL_SIZE: number = 1 << 5
    
    private _length: number
    private _data: BigUint64Array
    
    /// Returns the number of elements in the set.
    get length(): number {
        return this._length
    }
    
    get data(): BigUint64Array {
        return this._data
    }

    constructor(expected_size: number = 0) {
        const size = this.compute_capacity_for_size(expected_size, this.INITIAL_SIZE);
        this._data = new BigUint64Array(size)
        this._length = 0
    }

    /// Reserves capacity for at least additional more elements to be inserted in the HashSet.
    /// The collection may reserve more space to avoid frequent reallocations.
    reserve(additional: number) {
        let expected_size = this._length + additional
        if (this.size_fits_into_capacity(expected_size, this._data.length))
            return

        let new_obj = new BoardSet(expected_size)
        if (this._length != 0)
            new_obj.fast_insert_all(this._data)

        this._data = new_obj._data
    }

    /// current fill state in percent
    used(): number {
        return this._length === 0 ? 1 : (this._length / this.data.length)
    }

    /// Clears the set, removing all values and freeing the memory.
    clear() {
        this._length = 0
        this._data.fill(0n)
    }

    /// Returns true if the set contains a value.
    contains(value: State): boolean {
        return this._data[this.find_or_empty(value)] !== EMPTY_STATE
    }

    /// Adds a value to the set.
    insert(value: State) {
        this.reserve(1)
        this.fast_insert(value)
    }

    /// Adds a value to the set without checking if it is large enough.
    fast_insert(o: State) {
        const index = this.find_or_empty(o);
        if (this._data[index] == EMPTY_STATE) {
            this._length++
            this._data[index] = o
        }
    }

    // add the elements without checking if there is enough space
    fast_insert_all(other: BigUint64Array) {
        for(let x of other) {
            if (x !== EMPTY_STATE)
                this.fast_insert(x)
        }
    }

    private size_fits_into_capacity(expected: number, current: number): boolean {
        return 4 * expected < 3 * current
    }

    private compute_capacity_for_size(expected: number, current: number): number {
        let new_capacity = current
        while (!this.size_fits_into_capacity(expected, new_capacity)) {
            new_capacity <<= 1
        }
        return new_capacity
    }

    private get_index_from_state(value: State): number {
        let h = value
        h *= 0x85ebca6bn
        h ^= h >> 13n;
        return Number(h & (BigInt(this._data.length) - 1n))
    }

    /// Returns the index in the table at which a particular item resides, or the
    /// index of an empty slot in the table where this item should be inserted if
    /// it is not already in the table.
    /// @return index
    private find_or_empty(o: State): number {
        let index = this.get_index_from_state(o)

        while(true) {
            let existing = this._data[index];
            if (existing == EMPTY_STATE || o == existing) {
                return index
            } else {
                index = (index + 1) & (this._data.length - 1)
            }
        }
    }
}


export class Description {
    name: string
    layout: string
    directions: MoveDirections[]
    pegs: number

    /// Describes how (x,y)-positions (map-key) inside the layout correspond
    /// to the bit position used to represent the board
    lut: Lut

    /// ...111... required to mask bits effected by a move and execute the move
    move_mask: State[]

    /// ...110... required to check if a move is possible
    check_mask1: State[]

    /// ...011... required to check if a move is possible
    check_mask2: State[]

    transformations: Transformation[]

    constructor(name: string,
        layout: string,
        directions: MoveDirections[]) {

        if (!name)
            throw new Error("name cannot be empty")

        if (directions.length === 0) {
            throw new Error("no move directions were provided")
        }

        {
            if (layout.length == 0)
                throw new Error("layout cannot be empty")

            for (let x of layout) {
                if (x !== '.' && x !== 'o' && x !== '\n')
                    throw new Error(`layout contains the invalid character '${x}' allowed is .o\\n`)
            }
        }

        this.name = name
        this.layout = layout
        this.directions = directions

        this.pegs = 0;
        for (let x of layout)
            if (x == 'o')
                this.pegs++

        if (this.pegs < 3)
            throw new Error("peg solitaire requires at least 3 pegs")

        if (this.pegs > 63)
            throw new Error("implementation supports only 63 bit")

        const lines = layout.split("\n")
        if (lines.map((value) => value.length).reduce((accumulator, currentValue) => accumulator === currentValue ? currentValue : -1) === -1)
            throw new Error("not every layout line has the same length")

        this.lut = (() => {
            let pos = this.pegs
            return layout.split("\n")
                .map((line) => {
                    return line.split("")
                        .map((x) => {
                            if (x === 'o') {
                                pos--
                                return pos
                            }
                            return -1
                        })
                })
        })()

        // calculate the 3 required bit masks required to detect if a move is possible and to perform it
        {
            let lut = this.lut
            let y_max = lut.length
            let x_max = lut[0].length

            this.move_mask = []
            this.check_mask1 = []
            this.check_mask2 = []

            for (let y = 0; y < y_max; ++y) {
                for (let x = 0; x < x_max; ++x) {
                    if (lut[y][x] === -1)
                        continue

                    for (let dir of this.directions) {
                        let [valid, x1, y1, x2, y2] = ((): [boolean, number, number, number, number] => {
                            switch (dir) {
                                case MoveDirections.Horizontal: return [true, x + 1, y, x + 2, y]
                                case MoveDirections.Vertical: return [true, x, y + 1, x, y + 2]
                                case MoveDirections.LeftDiagonal: return [true, x + 1, y + 1, x + 2, y + 2]
                                case MoveDirections.RightDiagonal:
                                    if (x > 2)
                                        return [true, x - 1, y + 1, x - 2, y + 2]
                                    return [false, 0, 0, 0, 0]
                            }
                            throw new Error("a new MoveDirections was added without handling it")
                        })()

                        if (valid && x1 < x_max && y1 < y_max && lut[y1][x1] != -1 &&
                            x2 < x_max && y2 < y_max &&
                            lut[y2][x2] != -1) {
                            this.move_mask.push((1n << BigInt(lut[y][x])) | (1n << BigInt(lut[y1][x1])) |
                                (1n << BigInt(lut[y2][x2])));
                            this.check_mask1.push((1n << BigInt(lut[y][x])) | (1n << BigInt(lut[y1][x1])))
                            this.check_mask2.push((1n << BigInt(lut[y1][x1])) | (1n << BigInt(lut[y2][x2])))
                        }
                    }
                }
            }
        }

        if (this.move_mask.length == 0)
            throw new Error("No moves are possible")

        // calculate transformations
        {
            const vertical_flip = (lut: Lut): Lut => lut.map((x) => [...x]).reverse()
            const horizontal_flip = (lut: Lut): Lut => lut.map((x) => [...x].reverse())

            const transpose = (lut: Lut): Lut => {
                let r = lut.map((x) => [...x])
                for (let y = 0; y < r.length; ++y) {
                    for (let x = 0; x < r[0].length; ++x) {
                        if (x > y)
                            continue
                        const tmp = r[y][x]
                        r[y][x] = r[x][y]
                        r[x][y] = tmp
                    }
                }
                return r
            }


            const have_same_shape = (in1: Lut, in2: Lut): boolean => {
                if (in1.length !== in2.length || in1[0].length !== in2[0].length)
                    return false
                for (let y = 0; y < in1.length; ++y) {
                    for (let x = 0; x < in2[0].length; ++x) {
                        if ((in1[y][x] == -1 || in2[y][x] == -1) && in1[y][x] != in2[y][x])
                            return false
                    }
                }
                return true
            }

            let transformations: Lut[] = []
            {
                let movemask_as_vec: Lut[] = []
                for (let x of this.move_mask) {
                    try {
                        const v = this.to_vec(x)
                        movemask_as_vec.push(v);
                    } catch {
                        // ignore exceptions thrown by to_vec
                    }
                }

                const add_transformation = (func: (lut: Lut) => Lut) => {
                    let x = func(this.lut)
                    if (have_same_shape(this.lut, x) &&
                        movemask_as_vec.every((i) => {
                            try {
                                return this.move_mask.includes(this.from_vec(func(i)))
                            } catch {
                                return false
                            }
                        })) {
                        transformations.push(x)
                    }
                }

                add_transformation(vertical_flip)
                add_transformation(horizontal_flip)
                add_transformation((lut: Lut) => horizontal_flip(vertical_flip(lut)))

                // if transpose is possible
                if (this.lut.length === this.lut[0].length) {
                    add_transformation(transpose);
                    add_transformation((lut: Lut) => vertical_flip(transpose(lut)))
                    add_transformation((lut: Lut) => horizontal_flip(transpose(lut)))
                    add_transformation((lut: Lut) =>
                        horizontal_flip(vertical_flip(transpose(lut)))
                    );
                }
            }

            this.transformations = []
            for (let trans of transformations) {
                let field = [];

                for (let y of trans) {
                    for (let x of y) {
                        if (x !== -1)
                            field.push(x)
                    }
                }

                let output: Transformation = new Map
                for (let i = field.length - 1; i >= 0; --i) {
                    let e = field[field.length - 1 - i];
                    let diff = e - i;

                    let mask = 1n << BigInt(i)
                    const cur = output.get(diff)
                    if (cur !== undefined)
                        mask |= cur

                    output.set(diff, mask)
                }
                this.transformations.push(output)
            }
        }
    }

    /// creates a human-readable version of a field, the output as described by the layout
    /// Throws an exception if the state was invalid
    public to_string(state: State): String {
        if (this.pegs < 64 && state > ((1n << BigInt(this.pegs)) - 1n))
            throw new Error("state does not describe a valid game field")

        let pos = this.pegs
        return this.layout.split("").map((x) => {
            switch (x) {
                case '.': return ' '
                case '\n': return '\n'
                case 'o':
                    pos -= 1
                    return (state & (1n << BigInt(pos))) != 0n ? 'x' : '.'
            }
        }).join("")
    }

    /// converts a human-readable version into the internal representation
    /// Throws an exception if the state was invalid
    public from_string(state: string): State {
        let pos = 0n;
        let result: State = EMPTY_STATE;

        if (state.length != this.layout.length)
            throw new Error("state length does not match the layout length")

        if (!this.layout.split("").every((l, i) => {
            const s = state[i]
            switch (l) {
                case 'o': return s == 'x' || s == '.'
                case '.': return s == ' '
                case '\n': return s == '\n'
                default: return false
            }
        }))
            throw new Error("invalid state")

        for (let x of state.split("").reverse()) {
            if (pos > this.pegs)
                throw new Error("invalid state")

            switch (x) {
                case '\n':
                case ' ':
                case '\t':
                    // nothing todo
                    break;
                case 'x':
                    result |= 1n << pos;
                    pos++
                    break
                case '.':
                    pos++
                    break
                default:
                    throw new Error("invalid state")
            }
        }

        if (pos > this.pegs)
            throw new Error("invalid state")

        return result
    }

    /// blocked fields get -1, empty fields get 0, used fields 1
    /// Throws an exception if the state was invalid
    public to_vec(state: State): Lut {
        if (this.pegs < 64n && state > ((1n << BigInt(this.pegs)) - 1n))
            throw new Error("invalid state")

        return this.lut.map((o) =>
            o.map((x) => {
                if (x === -1) {
                    return -1
                } else if ((state & (1n << BigInt(x))) === 0n) {
                    return 0
                } else {
                    return 1
                }
            })
        )
    }

    /// Throws an exception if the state does not match the internal game field
    public from_vec(state: Lut): State {
        let r = EMPTY_STATE
        for (let y = 0; y < state.length; ++y) {
            for (let x = 0; x < state[0].length; ++x) {
                switch (state[y][x]) {
                    case 1:
                        r |= 1n << BigInt(this.lut[y][x])
                        break
                    case 0:
                        if (this.lut[y][x] === -1)
                            throw new Error("state does not match the game field")
                        break
                    case -1:
                        if (this.lut[y][x] !== -1)
                            throw new Error("state does not match the game field")
                        break
                    default:
                        throw new Error("unexpected state entry")
                }
            }
        }
        return r
    }

    public generate_js_code_normalize(): string {
        let ret = `function normalize(state) {\n`
        ret += `    return [state,`
        ret += this.transformations.map((trans) => {
            let ops: string[] = []
            for (let [shift, pos] of trans) {
                if (shift == 0) {
                    ops.push(`(state & ${pos}n)`)
                } else {
                    ops.push(`(state & ${pos}n)${shift > 0 ? " << " : " >> "}${shift > 0 ? shift : Math.abs(shift)}n`)
                }
            }
            return ops.join(" | ")
        }).join(",\n")
        ret += "].reduce((accumulator, value) => accumulator < value ? accumulator : value)\n"
        ret += "}\nnormalize"
        return ret
    }

    public solve(start: State): BoardSet[] {
        let normalize: (state: State) => State = vm.runInThisContext(this.generate_js_code_normalize());

        //assert_eq!(start.count_ones(), this.pegs - 1);

        let solution: BoardSet[] = []

        let current: BoardSet = new BoardSet
        current.insert(normalize(start))

        let startTime = new Date().getTime()
        const size = this.move_mask.length
        while (current.length != 0) {
            console.log(`search fields with ${solution.length + 2} removed pegs`)
            let next: BoardSet = new BoardSet
            for (const field of current.data) {
                if(field == EMPTY_STATE)
                    continue
                next.reserve(size)
                for (let i = 0; i < size; ++i) {
                    const v = field & this.move_mask[i]
                    if (v === this.check_mask1[i] || v === this.check_mask2[i])
                        next.fast_insert(normalize(field ^ this.move_mask[i]))
                }
            }

            solution.push(current)
            current = next
            let endTime = new Date().getTime()
            console.log(`, found ${current.length} fields in ${endTime-startTime}ms`)
            startTime = endTime
        }

        //     println!("number of possible fields {} in {}",
        //              solution.iter().fold(0, |o, i| o + i.len()), t);

        return solution
    }
}

/*

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn description_has_no_name() {
        assert_eq!(Description::new("", "ooo", &[MoveDirections::Horizontal]).err(),
                   Some(DescriptionError::NoName));
    }

    #[test]
    fn description_has_not_enough_pegs() {
        assert_eq!(Description::new("test", "o", &[MoveDirections::Horizontal]).err(),
                   Some(DescriptionError::NotEnoughPegs));
    }

    #[test]
    fn description_has_no_move_directions() {
        assert_eq!(Description::new("test", "ooo", &[]).err(),
                   Some(DescriptionError::NoMoveDirections));
    }

    #[test]
    fn description_too_many_pegs() {
        assert_eq!(Description::new("test",
                                    &(0..65).map(|_| "o").collect::<String>(),
                                    &[MoveDirections::Horizontal])
                       .err(),
                   Some(DescriptionError::TooManyPegs));
    }

    #[test]
    fn description_line_length_not_equal() {
        assert_eq!(Description::new("test", "oo\nooo", &[MoveDirections::Horizontal]).err(),
                   Some(DescriptionError::LineLengthNotEqual));
    }

    #[test]
    fn description_no_moves_possible() {
        assert_eq!(Description::new("test", "ooo", &[MoveDirections::Vertical]).err(),
                   Some(DescriptionError::NoMovesPossible));
    }

    #[test]
    fn description_invalid_layout_is_detected() {
        assert_eq!(Description::new("test", " .ooo", &[MoveDirections::Horizontal]).err(),
                   Some(DescriptionError::InvalidLayout));
    }

    #[test]
    fn description_layout_is_valid() {
        assert!(Description::new("test", ".ooo", &[MoveDirections::Horizontal]).is_ok());
    }

    #[test]
    fn description_valid() {
        assert!(Description::new("test", "ooo", &[MoveDirections::Horizontal]).is_ok());
    }

    #[test]
    fn description_peg_count_is_correct() {
        assert_eq!(Description::new("test", "ooooo", &[MoveDirections::Horizontal]).unwrap().pegs,
                   5);
    }

    #[test]
    fn description_to_string_is_ok_1() {
        assert_eq!(Description::new("test", "ooooo", &[MoveDirections::Horizontal])
                       .unwrap()
                       .to_string(0b10100_u64)
                       .unwrap(),
                   "x.x..");
    }

    #[test]
    fn description_to_string_is_ok_2() {
        assert_eq!(Description::new("test",
                                    &(0..64).map(|_| "o").collect::<String>(),
                                    &[MoveDirections::Horizontal])
                       .unwrap()
                       .to_string(!0u64)
                       .unwrap(),
                   (0..64).map(|_| "x").collect::<String>());
    }

    #[test]
    fn description_to_string_is_ok_3() {
        assert_eq!(Description::new("test", ".ooooo.", &[MoveDirections::Horizontal])
                       .unwrap()
                       .to_string(0b10100_u64)
                       .unwrap(),
                   " x.x.. ");
    }

    #[test]
    fn description_to_string_is_ok_4() {
        assert_eq!(Description::new("test",
                                    ".ooooo.\n..ooo..\n...o...",
                                    &[MoveDirections::Horizontal, MoveDirections::Vertical])
                       .unwrap()
                       .to_string(0b101000011_u64)
                       .unwrap(),
                   " x.x.. \n  ..x  \n   x   ");
    }

    #[test]
    fn description_to_string_detects_invalid_state() {
        assert!(Description::new("test", "ooo", &[MoveDirections::Horizontal])
            .unwrap()
            .to_string(0b1111_u64)
            .is_none());
    }

    #[test]
    fn description_from_string_is_ok() {
        assert_eq!(Description::new("test", ".ooooo.", &[MoveDirections::Horizontal])
                       .unwrap()
                       .from_string(" x.x.. ")
                       .unwrap(),
                   0b10100_u64);
    }

    #[test]
    fn description_from_string_detects_invalid_state_1() {
        assert!(Description::new("test", "ooo", &[MoveDirections::Horizontal])
            .unwrap()
            .from_string("xxxx")
            .is_none());
    }

    #[test]
    fn description_from_string_detects_invalid_state_2() {
        assert!(Description::new("test", "ooo", &[MoveDirections::Horizontal])
            .unwrap()
            .from_string("xxxxb")
            .is_none());
    }

    #[test]
    fn description_from_string_detects_invalid_state_3() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .from_string("  xxx")
            .is_none());
    }

    #[test]
    fn description_from_string_detects_invalid_state_4() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .from_string(" xxx  ")
            .is_none());
    }

    #[test]
    fn description_to_string_from_string() {
        let desc = Description::new("test", "..ooooo.", &[MoveDirections::Horizontal]).unwrap();
        let v = 0b11010u64;
        assert_eq!(desc.from_string(&desc.to_string(v).unwrap()).unwrap(), v);
    }

    #[test]
    fn description_from_string_to_string() {
        let desc = Description::new("test", "..ooooo.", &[MoveDirections::Horizontal]).unwrap();
        let v = "  ..x.x ";
        let from = desc.from_string(v).unwrap();
        assert_eq!(from, 0b00101u64);
        assert_eq!(desc.to_string(from).unwrap(), v);
    }

    #[test]
    fn description_to_vec_is_some() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .to_vec(0b100u64)
            .is_some());
    }

    #[test]
    fn description_to_vec_is_none() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .to_vec(0b1101u64)
            .is_none());
    }

    #[test]
    fn description_from_vec_is_some() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .from_vec(vec![vec![-1, 1, 0, 0, -1]])
            .is_some());
    }

    #[test]
    fn description_from_vec_is_none() {
        assert!(Description::new("test", ".ooo.", &[MoveDirections::Horizontal])
            .unwrap()
            .from_vec(vec![vec![-1, 1, 0, -1, -1]])
            .is_none());
    }

    #[test]
    fn description_to_vec_from_vec_works() {
        let desc = Description::new("test", ".ooo.", &[MoveDirections::Horizontal]).unwrap();
        let value = 0b100u64;
        assert_eq!(desc.from_vec(desc.to_vec(value).unwrap()).unwrap(), value);
    }

    #[test]
    fn solve_test() {
        let desc = Description::new("English",
                                "..ooo..\n..ooo..\nooooooo\nooooooo\nooooooo\n..ooo..\n..ooo..",
                                &[MoveDirections::Horizontal, MoveDirections::Vertical]).unwrap();
        let start = desc.from_string("  xxx  \n  xxx  \nxxxxxxx\nxxx.xxx\nxxxxxxx\n  xxx  \n  xxx  ").unwrap();
        let count = desc.solve(start)
            .iter()
            .fold(0, |o, i| {
                let mut sol = i.clone();
                sol.sort();
                sol.dedup();
                o + sol.iter().filter(|&&x| x != EMPTY_STATE).count()
            });
        assert_eq!(count, 23475688);
    }
}
*/