//! Line pattern detection: classify the strongest stone pattern through a
//! given position, for each of the 4 board directions, *as if* a stone were
//! just placed there.
//!
//! Design note (see also `board.rs` module doc): we walk coordinates via
//! `row_col` rather than bit-shift tricks, for the same reason board.rs
//! avoids shift-based line extraction on a 15-wide (non-power-of-two) board.
//!
//! Algorithm: for each direction, take an 11-cell window centered on the
//! hypothetical stone (offsets -5..=5 from `pos`), find the maximal
//! contiguous run of the placing color's stones through the center, and
//! classify it from the run length plus whether the cells immediately (and
//! one further) beyond each end are empty ("open").
//!
//! Known limitation (documented for Batch B/C, not required by the current
//! spec's test cases): this only recognizes *contiguous* runs. "Broken"
//! patterns with a single gap (e.g. `OO.OO`, a five-in-waiting with one
//! empty cell) are not detected as Four here, even though filling the gap
//! would complete a five. The VCF/VCT threat-space solver (Batch B/C) needs
//! that broader detection and should extend or replace `classify_line`
//! rather than working around this module.

use smallvec::SmallVec;

use crate::board::{row_col, Board};
use crate::renju::{evaluate_move, RenjuResult};
use crate::types::{Color, Pos, BOARD_SIZE};

/// One of the 4 lines a stone participates in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Horizontal,
    Vertical,
    Diagonal,
    AntiDiagonal,
}

/// (delta_col, delta_row) step for each direction, matching the plan doc's
/// `dx` notation (first component is the column step).
const DIRECTIONS: [(Direction, (isize, isize)); 4] = [
    (Direction::Horizontal, (1, 0)),
    (Direction::Vertical, (0, 1)),
    (Direction::Diagonal, (1, 1)),
    (Direction::AntiDiagonal, (1, -1)),
];

/// Classified line pattern, strongest first. `Overline` outranks `Five`
/// because it is checked first in `classify_line` (a run of 5 exactly is
/// `Five`; a run of 6+ is always `Overline`, never also reported as `Five`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pattern {
    None,
    Two,
    OpenTwo,
    Three,
    OpenThree,
    Four,
    OpenFour,
    Five,
    Overline,
}

/// State of a single cell along a line, relative to the color being
/// evaluated (`Own` = same color as the hypothetical placement).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CellState {
    Empty,
    Own,
    Opp,
    OffBoard,
}

const WINDOW_RADIUS: isize = 5;
const WINDOW_LEN: usize = (WINDOW_RADIUS * 2 + 1) as usize; // 11
const CENTER: usize = WINDOW_RADIUS as usize; // index of the hypothetical stone

/// Return the strongest pattern through `pos` in each of the 4 directions,
/// assuming a stone of `color` is placed at `pos`. Does not mutate `board`;
/// the hypothetical stone is applied virtually while building each window.
pub fn line_patterns_after(board: &Board, pos: Pos, color: Color) -> Vec<(Direction, Pattern)> {
    let (row, col) = row_col(pos);
    DIRECTIONS
        .iter()
        .map(|&(dir, (dcol, drow))| {
            let window = build_window(board, row, col, dcol, drow, color);
            (dir, classify_line(&window))
        })
        .collect()
}

/// Build the 11-cell window along one direction, centered on the
/// hypothetical stone at `(row, col)`.
fn build_window(
    board: &Board,
    row: usize,
    col: usize,
    dcol: isize,
    drow: isize,
    color: Color,
) -> [CellState; WINDOW_LEN] {
    let mut cells = [CellState::OffBoard; WINDOW_LEN];
    for (i, offset) in (-WINDOW_RADIUS..=WINDOW_RADIUS).enumerate() {
        if offset == 0 {
            cells[i] = CellState::Own; // the hypothetical placement itself
            continue;
        }
        let r = row as isize + drow * offset;
        let c = col as isize + dcol * offset;
        cells[i] = if r < 0 || c < 0 || r as usize >= BOARD_SIZE || c as usize >= BOARD_SIZE {
            CellState::OffBoard
        } else {
            let p: Pos = (r as usize) * BOARD_SIZE + (c as usize);
            match board.color_at(p) {
                Some(stone_color) if stone_color == color => CellState::Own,
                Some(_) => CellState::Opp,
                None => CellState::Empty,
            }
        };
    }
    cells
}

/// Classify the pattern formed by the contiguous run of `Own` cells through
/// the window's center.
fn classify_line(cells: &[CellState; WINDOW_LEN]) -> Pattern {
    // Read a cell by signed index relative to the window; anything outside
    // the window is treated as OffBoard (blocked), matching the hint that
    // +/-5 is enough to see any relevant pattern.
    let state_at = |i: isize| -> CellState {
        if i < 0 || i as usize >= WINDOW_LEN {
            CellState::OffBoard
        } else {
            cells[i as usize]
        }
    };

    let mut left = CENTER;
    while left > 0 && cells[left - 1] == CellState::Own {
        left -= 1;
    }
    let mut right = CENTER;
    while right < WINDOW_LEN - 1 && cells[right + 1] == CellState::Own {
        right += 1;
    }
    let run = right - left + 1;

    let left_i = left as isize - 1;
    let right_i = right as isize + 1;
    let left_open = state_at(left_i) == CellState::Empty;
    let right_open = state_at(right_i) == CellState::Empty;
    let far_left_open = state_at(left_i - 1) == CellState::Empty;
    let far_right_open = state_at(right_i + 1) == CellState::Empty;

    match run {
        n if n >= 6 => Pattern::Overline,
        5 => Pattern::Five,
        4 => {
            if left_open && right_open {
                Pattern::OpenFour
            } else if left_open || right_open {
                Pattern::Four
            } else {
                Pattern::None
            }
        }
        3 => {
            // An "open three" must be able to become an *open* four in one
            // move: both immediate flanks empty, and at least one side has
            // room one further out so the resulting four isn't blocked at
            // its far end.
            if left_open && right_open && (far_left_open || far_right_open) {
                Pattern::OpenThree
            } else if left_open || right_open {
                Pattern::Three
            } else {
                Pattern::None
            }
        }
        2 => {
            if left_open && right_open {
                Pattern::OpenTwo
            } else if left_open || right_open {
                Pattern::Two
            } else {
                Pattern::None
            }
        }
        _ => Pattern::None,
    }
}

/// A "four"-equivalent threat: one move away from completing a five in
/// `direction` through the hypothetically placed stone. `completion_squares`
/// lists every empty square that alone would complete the five (usually 1;
/// 2 for an open four, since either flank works -- an unstoppable double
/// completion, not two separate threats).
#[derive(Debug, Clone)]
pub struct FiveThreat {
    pub direction: Direction,
    pub completion_squares: SmallVec<[Pos; 2]>,
}

/// Map a window-relative offset (from the hypothetical stone at `pos`) back
/// to an absolute board `Pos`, or `None` if it falls off the board.
fn offset_to_pos(row: usize, col: usize, dcol: isize, drow: isize, offset: isize) -> Option<Pos> {
    let r = row as isize + drow * offset;
    let c = col as isize + dcol * offset;
    if r < 0 || c < 0 || r as usize >= BOARD_SIZE || c as usize >= BOARD_SIZE {
        None
    } else {
        Some((r as usize) * BOARD_SIZE + (c as usize))
    }
}

/// Find every "four"-equivalent threat through `pos`, assuming a stone of
/// `color` is placed there, across all 4 directions. Unlike
/// `line_patterns_after` (which only sees *contiguous* runs), this also
/// detects "jump" shapes with a single gap (e.g. `OO.OO`, `OOO.O`) that are
/// one move away from a five -- needed for VCF search, where missing these
/// would let the solver overlook real forcing moves.
///
/// For Black, a completion square that would actually be forbidden to play
/// (overline takes priority over five in `renju::evaluate_move`) is dropped
/// from that threat's `completion_squares`, since it isn't a real threat --
/// Black could never legally finish it. If every completion square for a
/// direction is dropped this way, that direction contributes no threat at
/// all. This does one extra `evaluate_move` call per completion square
/// (spec-permitted "one level of recursion", not open-ended).
pub fn five_threats_after(board: &Board, pos: Pos, color: Color) -> Vec<FiveThreat> {
    let (row, col) = row_col(pos);
    let mut threats = Vec::new();

    for &(dir, (dcol, drow)) in DIRECTIONS.iter() {
        let cells = build_window(board, row, col, dcol, drow, color);
        let mut squares: SmallVec<[Pos; 2]> = SmallVec::new();

        // 5-cell sub-windows that contain the center (index CENTER=5):
        // start s must satisfy s <= 5 <= s+4, i.e. s in [1, 5].
        for start in 1..=5usize {
            let slice = &cells[start..start + 5];
            let own = slice.iter().filter(|&&c| c == CellState::Own).count();
            let blocked = slice
                .iter()
                .filter(|&&c| matches!(c, CellState::Opp | CellState::OffBoard))
                .count();
            if own != 4 || blocked != 0 {
                continue;
            }
            let Some(empty_local) = slice.iter().position(|&c| c == CellState::Empty) else {
                continue;
            };
            let local_idx = start + empty_local;
            let offset = local_idx as isize - CENTER as isize;
            if let Some(p) = offset_to_pos(row, col, dcol, drow, offset) {
                if !squares.contains(&p) {
                    squares.push(p);
                }
            }
        }

        if squares.is_empty() {
            continue;
        }

        if color == Color::Black {
            let mut hypothetical = board.clone();
            hypothetical.force_set(pos, color);
            squares.retain(|sq| {
                matches!(
                    evaluate_move(&hypothetical, *sq, color),
                    RenjuResult::Win
                )
            });
        }

        if !squares.is_empty() {
            threats.push(FiveThreat {
                direction: dir,
                completion_squares: squares,
            });
        }
    }

    threats
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Board;
    use crate::types::str_to_pos;

    /// Build a board where every position in `black_moves` ends up Black,
    /// by interleaving far-away dummy White moves (Board::play alternates
    /// strictly by turn, so consecutive same-color placements need padding).
    fn board_with_black(black_moves: &[&str]) -> Board {
        let dummies = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
        assert!(black_moves.len() <= dummies.len(), "add more dummy cells");
        let mut moves = Vec::new();
        for (m, dummy) in black_moves.iter().zip(dummies.iter()) {
            moves.push(str_to_pos(m).unwrap());
            moves.push(str_to_pos(dummy).unwrap());
        }
        Board::from_moves(&moves).unwrap()
    }

    fn pattern_in(board: &Board, pos: &str, color: Color, dir: Direction) -> Pattern {
        let p = str_to_pos(pos).unwrap();
        line_patterns_after(board, p, color)
            .into_iter()
            .find(|(d, _)| *d == dir)
            .unwrap()
            .1
    }

    #[test]
    fn detects_five() {
        // h4,h5,h6,h7 Black vertically; h8 completes an exact five.
        let b = board_with_black(&["h4", "h5", "h6", "h7"]);
        assert_eq!(
            pattern_in(&b, "h8", Color::Black, Direction::Vertical),
            Pattern::Five
        );
    }

    #[test]
    fn detects_overline() {
        // d8..h8 Black horizontally (5 stones); i8 makes a 6th -> overline.
        let b = board_with_black(&["d8", "e8", "f8", "g8", "h8"]);
        assert_eq!(
            pattern_in(&b, "i8", Color::Black, Direction::Horizontal),
            Pattern::Overline
        );
    }

    #[test]
    fn detects_open_four() {
        // d8,e8,f8 Black, both c8 and beyond g8 empty; g8 -> open four.
        let b = board_with_black(&["d8", "e8", "f8"]);
        assert_eq!(
            pattern_in(&b, "g8", Color::Black, Direction::Horizontal),
            Pattern::OpenFour
        );
    }

    #[test]
    fn detects_blocked_four() {
        // Same shape as detects_open_four, but c8 is White so only the
        // right side (g8) is open -> Four, not OpenFour.
        let mut moves: Vec<Pos> = Vec::new();
        for m in ["d8", "a1", "e8", "a2", "f8", "a3"] {
            moves.push(str_to_pos(m).unwrap());
        }
        moves.push(str_to_pos("a9").unwrap()); // Black dummy, keeps turn parity
        moves.push(str_to_pos("c8").unwrap()); // White at c8 blocks left flank
        let b = Board::from_moves(&moves).unwrap();
        assert_eq!(
            pattern_in(&b, "g8", Color::Black, Direction::Horizontal),
            Pattern::Four
        );
    }

    #[test]
    fn detects_open_three() {
        // d8,e8 Black, c8/f8/g8/h8 empty; f8 -> open three.
        let b = board_with_black(&["d8", "e8"]);
        assert_eq!(
            pattern_in(&b, "f8", Color::Black, Direction::Horizontal),
            Pattern::OpenThree
        );
    }

    #[test]
    fn detects_blocked_three() {
        // d8,e8 Black with c8 blocked by White -> three but not open.
        let mut moves: Vec<Pos> = Vec::new();
        for m in ["d8", "a1", "e8", "a2"] {
            moves.push(str_to_pos(m).unwrap());
        }
        moves.push(str_to_pos("a3").unwrap()); // Black dummy
        moves.push(str_to_pos("c8").unwrap()); // White blocks left flank
        let b = Board::from_moves(&moves).unwrap();
        assert_eq!(
            pattern_in(&b, "f8", Color::Black, Direction::Horizontal),
            Pattern::Three
        );
    }

    #[test]
    fn detects_open_two() {
        let b = board_with_black(&["d8"]);
        assert_eq!(
            pattern_in(&b, "e8", Color::Black, Direction::Horizontal),
            Pattern::OpenTwo
        );
    }

    #[test]
    fn detects_none_when_fully_blocked() {
        // A lone stone surrounded by opponent stones on both flanks.
        let mut moves: Vec<Pos> = Vec::new();
        moves.push(str_to_pos("d8").unwrap()); // Black
        moves.push(str_to_pos("c8").unwrap()); // White blocks left
        moves.push(str_to_pos("a1").unwrap()); // Black dummy
        moves.push(str_to_pos("e8").unwrap()); // White blocks right
        let b = Board::from_moves(&moves).unwrap();
        assert_eq!(
            pattern_in(&b, "d8", Color::Black, Direction::Horizontal),
            Pattern::None
        );
    }

    fn threats_in(board: &Board, pos: &str, color: Color) -> Vec<FiveThreat> {
        five_threats_after(board, str_to_pos(pos).unwrap(), color)
    }

    #[test]
    fn detects_jump_four_oo_dot_oo() {
        // c8,d8,f8 Black existing; placing g8 forms "OO.OO" (gap at e8).
        let b = board_with_black(&["c8", "d8", "f8"]);
        let threats = threats_in(&b, "g8", Color::Black);
        let h = threats
            .iter()
            .find(|t| t.direction == Direction::Horizontal)
            .expect("expected a horizontal jump-four threat");
        assert_eq!(
            h.completion_squares.as_slice(),
            &[str_to_pos("e8").unwrap()]
        );
    }

    #[test]
    fn detects_jump_four_ooo_dot_o() {
        // d8,e8,f8 Black existing; placing h8 forms "OOO.O" (gap at g8).
        let b = board_with_black(&["d8", "e8", "f8"]);
        let threats = threats_in(&b, "h8", Color::Black);
        let h = threats
            .iter()
            .find(|t| t.direction == Direction::Horizontal)
            .expect("expected a horizontal jump-four threat");
        assert_eq!(
            h.completion_squares.as_slice(),
            &[str_to_pos("g8").unwrap()]
        );
    }

    #[test]
    fn excludes_completion_square_that_would_be_an_overline() {
        // Same "OOO.O" shape as above (d8,e8,f8 Black, placing h8, gap at
        // g8), but g4,g5,g6,g7,g9 are also Black, so filling g8 would bridge
        // a *vertical* run of 6 (g4..g9) -- an overline, forbidden for
        // Black even though it also completes a horizontal five. The
        // horizontal threat must therefore be excluded entirely (its only
        // completion square is not actually playable).
        let mut moves: Vec<Pos> = Vec::new();
        let blacks = ["d8", "e8", "f8", "g4", "g5", "g6", "g7", "g9"];
        let dummies = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
        for (b, w) in blacks.iter().zip(dummies.iter()) {
            moves.push(str_to_pos(b).unwrap());
            moves.push(str_to_pos(w).unwrap());
        }
        let board = Board::from_moves(&moves).unwrap();
        let threats = threats_in(&board, "h8", Color::Black);
        assert!(
            threats
                .iter()
                .find(|t| t.direction == Direction::Horizontal)
                .is_none(),
            "g8 completion should be excluded: it would be an overline, not a legal five"
        );
    }

    #[test]
    fn white_gets_no_forbidden_move_filtering() {
        // Same shape as the overline-exclusion case, but for White: no
        // forbidden moves exist, so the horizontal jump-four threat (and
        // its overline-shaped completion) is reported as-is.
        let mut moves: Vec<Pos> = Vec::new();
        let whites = ["d8", "e8", "f8", "g4", "g5", "g6", "g7", "g9"];
        let dummies = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
        for (w, b) in whites.iter().zip(dummies.iter()) {
            moves.push(str_to_pos(b).unwrap());
            moves.push(str_to_pos(w).unwrap());
        }
        let board = Board::from_moves(&moves).unwrap();
        let threats = threats_in(&board, "h8", Color::White);
        assert!(threats
            .iter()
            .any(|t| t.direction == Direction::Horizontal));
    }
}
