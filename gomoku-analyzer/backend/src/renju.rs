//! Renju (standard Japanese gomoku competition rules) forbidden-move
//! judgement.
//!
//! Black is restricted (three-three, four-four, overline are all
//! forbidden); White has no forbidden moves and wins with five *or more*
//! in a row. Black wins only with an exact five (overline takes priority
//! over a coincidental five for Black -- see `evaluate_move`).

use crate::board::Board;
use crate::pattern::{line_patterns_after, Direction, Pattern};
use crate::types::{Color, Pos};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenjuResult {
    /// Legal move, neither a win nor a forbidden move.
    Legal,
    /// The move wins the game (Black: exact five; White: five or more).
    Win,
    /// Black-only forbidden move: two or more simultaneous open threes.
    ForbiddenThreeThree,
    /// Black-only forbidden move: two or more simultaneous fours.
    ForbiddenFourFour,
    /// Black-only forbidden move: six or more in a row.
    ForbiddenOverline,
}

/// Evaluate the Renju legality/outcome of placing `color`'s stone at `pos`.
/// `board` must be the state *before* the move (the move itself is not
/// applied to `board`; see `pattern::line_patterns_after` for how the
/// hypothetical placement is evaluated without mutation).
pub fn evaluate_move(board: &Board, pos: Pos, color: Color) -> RenjuResult {
    let patterns = line_patterns_after(board, pos, color);

    let has_overline = patterns.iter().any(|(_, p)| *p == Pattern::Overline);
    if has_overline {
        // Overline outranks a coincidental five in the same or another
        // direction: for Black it's always forbidden even if the move also
        // completes a five elsewhere; for White, overline is still a win
        // (White wins with five-or-more, no forbidden moves).
        return if color == Color::Black {
            RenjuResult::ForbiddenOverline
        } else {
            RenjuResult::Win
        };
    }

    let has_five = patterns.iter().any(|(_, p)| *p == Pattern::Five);
    if has_five {
        return RenjuResult::Win;
    }

    if color == Color::White {
        // White has no forbidden moves beyond what's already handled above.
        return RenjuResult::Legal;
    }

    // From here on, only Black-specific forbidden-move checks remain.
    let four_count = patterns
        .iter()
        .filter(|(_, p)| matches!(p, Pattern::Four | Pattern::OpenFour))
        .count();
    if four_count >= 2 {
        return RenjuResult::ForbiddenFourFour;
    }

    if is_double_three(&patterns) {
        return RenjuResult::ForbiddenThreeThree;
    }

    RenjuResult::Legal
}

/// Three-three (double open three) check.
///
/// TODO(Batch B/C): the standard Renju rule is recursive -- an open three
/// only counts toward three-three if it can become an open four *without
/// that extension itself being forbidden* (e.g. a three that can only
/// extend into an overline-forming four does not count). This P0 version is
/// the simplified variant explicitly allowed by the plan: it just counts
/// raw `OpenThree` occurrences across the 4 directions. Kept as its own
/// function (taking the already-computed patterns) so a recursive version
/// -- which would need to call `evaluate_move` again for each candidate
/// extension point -- can replace the body without changing the call site
/// in `evaluate_move`.
fn is_double_three(patterns: &[(Direction, Pattern)]) -> bool {
    patterns
        .iter()
        .filter(|(_, p)| *p == Pattern::OpenThree)
        .count()
        >= 2
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Board;
    use crate::types::str_to_pos;

    /// Interleave `stones` (all placed as `color`) with dummy moves of the
    /// opposite color at far-away cells, to build a board where every
    /// listed position ends up the desired color despite Board::play's
    /// strict turn alternation.
    fn board_with(color: Color, stones: &[&str]) -> Board {
        let dummies = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10"];
        assert!(stones.len() <= dummies.len(), "add more dummy cells");
        let mut moves = Vec::new();
        match color {
            Color::Black => {
                // Black moves first, so stones naturally land on Black's
                // turns when interleaved with a dummy White after each.
                for (m, dummy) in stones.iter().zip(dummies.iter()) {
                    moves.push(str_to_pos(m).unwrap());
                    moves.push(str_to_pos(dummy).unwrap());
                }
            }
            Color::White => {
                // Need a Black dummy first so White gets the second slot.
                for (m, dummy) in stones.iter().zip(dummies.iter()) {
                    moves.push(str_to_pos(dummy).unwrap());
                    moves.push(str_to_pos(m).unwrap());
                }
            }
        }
        Board::from_moves(&moves).unwrap()
    }

    #[test]
    fn overline_is_forbidden_for_black() {
        // d8..h8 Black (5 in a row); i8 would make 6 -> overline.
        let b = board_with(Color::Black, &["d8", "e8", "f8", "g8", "h8"]);
        let pos = str_to_pos("i8").unwrap();
        assert_eq!(
            evaluate_move(&b, pos, Color::Black),
            RenjuResult::ForbiddenOverline
        );
    }

    #[test]
    fn exact_five_wins_for_black() {
        // h4..h7 Black vertically; h8 completes an exact five.
        let b = board_with(Color::Black, &["h4", "h5", "h6", "h7"]);
        let pos = str_to_pos("h8").unwrap();
        assert_eq!(evaluate_move(&b, pos, Color::Black), RenjuResult::Win);
    }

    #[test]
    fn double_open_three_is_forbidden() {
        // Textbook double-three: g8/i8 flank h8 horizontally, h7/h9 flank
        // h8 vertically. Placing Black at h8 opens both lines at once.
        let b = board_with(Color::Black, &["g8", "i8", "h7", "h9"]);
        let pos = str_to_pos("h8").unwrap();
        assert_eq!(
            evaluate_move(&b, pos, Color::Black),
            RenjuResult::ForbiddenThreeThree
        );
    }

    #[test]
    fn double_four_is_forbidden() {
        // e8,f8,g8 Black horizontally and h5,h6,h7 Black vertically; h8
        // completes a four in both directions at once.
        let b = board_with(Color::Black, &["e8", "f8", "g8", "h5", "h6", "h7"]);
        let pos = str_to_pos("h8").unwrap();
        assert_eq!(
            evaluate_move(&b, pos, Color::Black),
            RenjuResult::ForbiddenFourFour
        );
    }

    #[test]
    fn white_has_no_forbidden_moves() {
        // Same double-open-three shape as the Black test, but for White:
        // must be Legal, not ForbiddenThreeThree.
        let b = board_with(Color::White, &["g8", "i8", "h7", "h9"]);
        let pos = str_to_pos("h8").unwrap();
        assert_eq!(evaluate_move(&b, pos, Color::White), RenjuResult::Legal);
    }

    #[test]
    fn white_wins_with_five_or_more() {
        // White overline (6 in a row) still counts as a win, unlike Black.
        let b = board_with(Color::White, &["d8", "e8", "f8", "g8", "h8"]);
        let pos = str_to_pos("i8").unwrap();
        assert_eq!(evaluate_move(&b, pos, Color::White), RenjuResult::Win);
    }
}
