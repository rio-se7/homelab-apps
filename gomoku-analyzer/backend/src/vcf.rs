//! VCF (Victory by Continuous Fours) threat-space solver.
//!
//! An AND-OR search over the attacker's forcing moves: the attacker (OR
//! node) tries every move that either wins immediately or creates a
//! `pattern::FiveThreat` (a "four"); the defender (AND node) is restricted
//! to forced responses -- blocking one of the threat's completion squares,
//! or making an immediate five of their own -- since VCF specifically means
//! "does the attacker have a forced win using *only* four-threats, ignoring
//! any move that isn't forcing". If the defender has no response that
//! survives, the attacker's move is proven winning.
//!
//! This does NOT use iterative deepening (explicitly not required by the
//! plan) -- it is a single fixed-depth search bounded by `max_depth`
//! attacker moves, and returns the first winning line found in candidate
//! order, not necessarily the shortest one.

use crate::board::{row_col, Board};
use crate::pattern::{five_threats_after, FiveThreat};
use crate::renju::{evaluate_move, RenjuResult};
use crate::types::{Color, Pos, BOARD_SIZE, NUM_CELLS};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VcfResult {
    /// Attacker's own moves, in order. Does NOT include the defender's
    /// forced responses.
    pub winning_moves: Vec<Pos>,
    /// Number of attacker moves in `winning_moves` (== `winning_moves.len()`).
    pub depth: u32,
}

/// Search for a forced win for `color` within `max_depth` of its own moves.
/// `board` is the position *before* `color`'s first attacking move (this is
/// a pure hypothetical evaluation -- like `renju::evaluate_move`, it does
/// not check `board.side_to_move() == color`).
pub fn find_vcf(board: &Board, color: Color, max_depth: u32) -> Option<VcfResult> {
    let mut working = board.clone();
    vcf_recurse(&mut working, color, max_depth).map(|moves| VcfResult {
        depth: moves.len() as u32,
        winning_moves: moves,
    })
}

fn is_forbidden(r: RenjuResult) -> bool {
    matches!(
        r,
        RenjuResult::ForbiddenOverline
            | RenjuResult::ForbiddenThreeThree
            | RenjuResult::ForbiddenFourFour
    )
}

/// OR node: attacker tries each candidate move, succeeding if any one of
/// them either wins immediately or forces a win the defender cannot avoid.
fn vcf_recurse(board: &mut Board, attacker: Color, remaining_depth: u32) -> Option<Vec<Pos>> {
    if remaining_depth == 0 {
        return None;
    }
    let defender = attacker.opponent();
    for p in nearby_empty_cells(board) {
        let outcome = evaluate_move(board, p, attacker);
        if is_forbidden(outcome) {
            continue;
        }
        if outcome == RenjuResult::Win {
            return Some(vec![p]);
        }
        let threats = five_threats_after(board, p, attacker);
        if threats.is_empty() {
            continue; // not a forcing move -- VCF only plays four-threats
        }
        board.force_set(p, attacker);
        let outcome = defender_can_survive(board, attacker, defender, &threats, remaining_depth);
        board.force_clear(p, attacker);
        if let DefenderOutcome::CannotSurvive(mut rest) = outcome {
            let mut seq = vec![p];
            seq.append(&mut rest);
            return Some(seq);
        }
    }
    None
}

enum DefenderOutcome {
    /// Defender has at least one move that stops the attacker from forcing
    /// a win within the remaining depth.
    Survives,
    /// Every defensive candidate still loses; carries one concrete
    /// continuation (attacker's remaining moves) as a witness.
    CannotSurvive(Vec<Pos>),
}

/// AND node: defender must try every plausible response (block a
/// completion square, or make their own immediate five); the attacker's
/// move only succeeds if the defender has no response that survives.
fn defender_can_survive(
    board: &mut Board,
    attacker: Color,
    defender: Color,
    threats: &[FiveThreat],
    remaining_depth: u32,
) -> DefenderOutcome {
    let candidates = defensive_candidates(board, defender, threats);
    if candidates.is_empty() {
        // Nothing blocks every threat and no counter-five: already lost.
        return DefenderOutcome::CannotSurvive(Vec::new());
    }
    let mut witness: Option<Vec<Pos>> = None;
    for q in candidates {
        board.force_set(q, defender);
        let result = vcf_recurse(board, attacker, remaining_depth - 1);
        board.force_clear(q, defender);
        match result {
            None => return DefenderOutcome::Survives,
            Some(rest) => {
                if witness.is_none() {
                    witness = Some(rest);
                }
            }
        }
    }
    DefenderOutcome::CannotSurvive(witness.unwrap_or_default())
}

/// Defender's forced-response candidates: every distinct square that would
/// complete one of the current threats, plus any square where the defender
/// has an immediate five of their own (a counter-attack that wins outright
/// regardless of the attacker's threat).
fn defensive_candidates(board: &Board, defender: Color, threats: &[FiveThreat]) -> Vec<Pos> {
    let mut candidates: Vec<Pos> = Vec::new();
    for t in threats {
        for &sq in &t.completion_squares {
            if !candidates.contains(&sq) {
                candidates.push(sq);
            }
        }
    }
    for q in nearby_empty_cells(board) {
        if !candidates.contains(&q) && evaluate_move(board, q, defender) == RenjuResult::Win {
            candidates.push(q);
        }
    }
    candidates
}

/// Empty cells within 2 steps (Chebyshev distance) of any existing stone.
/// A forcing four/five always involves at least 3 same-color stones
/// clustered within a 5-cell span, so this never prunes away a real
/// attacking or defensive move -- it only skips cells that couldn't
/// possibly participate in one. `pub(crate)` so `eval.rs` can reuse the same
/// restriction for its move generation instead of duplicating it.
pub(crate) fn nearby_empty_cells(board: &Board) -> Vec<Pos> {
    use std::collections::BTreeSet;
    let mut result = BTreeSet::new();
    for p in 0..NUM_CELLS {
        if board.color_at(p).is_none() {
            continue;
        }
        let (row, col) = row_col(p);
        for dr in -2isize..=2 {
            for dc in -2isize..=2 {
                let r = row as isize + dr;
                let c = col as isize + dc;
                if r < 0 || c < 0 || r as usize >= BOARD_SIZE || c as usize >= BOARD_SIZE {
                    continue;
                }
                let np = (r as usize) * BOARD_SIZE + (c as usize);
                if board.color_at(np).is_none() {
                    result.insert(np);
                }
            }
        }
    }
    result.into_iter().collect()
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
        let dummies = [
            "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10",
        ];
        assert!(stones.len() <= dummies.len(), "add more dummy cells");
        let mut moves = Vec::new();
        match color {
            Color::Black => {
                for (m, dummy) in stones.iter().zip(dummies.iter()) {
                    moves.push(str_to_pos(m).unwrap());
                    moves.push(str_to_pos(dummy).unwrap());
                }
            }
            Color::White => {
                for (m, dummy) in stones.iter().zip(dummies.iter()) {
                    moves.push(str_to_pos(dummy).unwrap());
                    moves.push(str_to_pos(m).unwrap());
                }
            }
        }
        Board::from_moves(&moves).unwrap()
    }

    #[test]
    fn finds_immediate_five_completion_depth_1() {
        // d8,e8,f8,g8 Black; completing h8 (or c8) wins outright.
        let b = board_with(Color::Black, &["d8", "e8", "f8", "g8"]);
        let result = find_vcf(&b, Color::Black, 8).expect("expected a VCF");
        assert_eq!(result.depth, 1);
        assert_eq!(result.winning_moves.len(), 1);
        let mv = result.winning_moves[0];
        assert_eq!(evaluate_move(&b, mv, Color::Black), RenjuResult::Win);
    }

    #[test]
    fn finds_double_four_forced_win() {
        // White (no forbidden moves) has e8,f8,g8 and h5,h6,h7: playing h8
        // would create two simultaneous open fours at once (horizontal +
        // vertical), which Black cannot fully block with one move. This is
        // winning in principle after White's very next move.
        //
        // NOTE (deviation from the Batch B spec message, flagged in the
        // report): the spec's example expected "depth 1" for this shape.
        // Two things make that not hold exactly as stated:
        // 1. Actually completing the five still needs a genuine 2nd
        //    attacker move (consistent with how
        //    `finds_immediate_five_completion_depth_1` counts moves), so
        //    depth 1 is impossible here even in the best case -- depth 2 is
        //    the true minimum, not depth 1.
        // 2. `find_vcf` is a fixed-order search with no iterative deepening
        //    (by design, see module doc): it returns the *first* winning
        //    line found in ascending-`Pos` candidate order, not the
        //    shortest one. This board happens to have other, unrelated
        //    forcing moves with a smaller `Pos` than h8 (e.g. a jump-four
        //    through h3 using the same h5/h6/h7 stones), so the search
        //    finds a longer-than-minimal but still perfectly valid forced
        //    win starting from one of those instead of from h8. Hardcoding
        //    an exact depth or first move here would be testing search
        //    order, not correctness -- so this test only asserts that a
        //    forced win was found and that it is internally consistent and
        //    legal, not that it's the minimal one.
        let b = board_with(Color::White, &["e8", "f8", "g8", "h5", "h6", "h7"]);
        let result = find_vcf(&b, Color::White, 8).expect("expected a VCF");
        assert_eq!(result.depth, result.winning_moves.len() as u32);
        assert!(
            result.depth >= 2,
            "no single White move here completes a five outright"
        );
        let first = result.winning_moves[0];
        assert!(!is_forbidden(evaluate_move(&b, first, Color::White)));
    }

    #[test]
    fn no_vcf_from_a_single_stone() {
        let b = board_with(Color::Black, &["h8"]);
        assert!(find_vcf(&b, Color::Black, 8).is_none());
    }
}
