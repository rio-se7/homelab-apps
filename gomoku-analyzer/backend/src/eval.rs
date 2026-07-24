//! Heuristic position evaluation and bounded best-move search, used when no
//! VCF forced win is available (see `vcf::find_vcf`, checked first by
//! `best_move`).

use crate::board::{row_col, Board};
use crate::pattern::{line_patterns_after, Direction, Pattern};
use crate::renju::{evaluate_move, RenjuResult};
use crate::types::{str_to_pos, Color, Pos, BOARD_SIZE};
use crate::vcf::{find_vcf, nearby_empty_cells};

/// Depth used for `best_move`'s internal VCF pre-check (not the caller's
/// alpha-beta `depth` parameter). Kept generous since VCF search prunes
/// aggressively via `nearby_empty_cells` and non-forcing moves.
const VCF_PRECHECK_DEPTH: u32 = 10;

/// A "practically infinite" score for a completed five -- i32::MAX would
/// overflow when combined with negamax negation, so this is used instead.
/// The exact magnitude only matters relative to the other pattern scores.
const FIVE_SCORE: i32 = 1_000_000;

fn pattern_score(p: Pattern) -> i32 {
    match p {
        Pattern::Five | Pattern::Overline => FIVE_SCORE,
        Pattern::OpenFour => 100_000,
        Pattern::Four => 10_000,
        Pattern::OpenThree => 1_000,
        Pattern::Three => 100,
        Pattern::OpenTwo => 10,
        Pattern::Two => 1,
        Pattern::None => 0,
    }
}

fn is_forbidden(r: RenjuResult) -> bool {
    matches!(
        r,
        RenjuResult::ForbiddenOverline
            | RenjuResult::ForbiddenThreeThree
            | RenjuResult::ForbiddenFourFour
    )
}

fn direction_vector(d: Direction) -> (isize, isize) {
    match d {
        Direction::Horizontal => (1, 0),
        Direction::Vertical => (0, 1),
        Direction::Diagonal => (1, 1),
        Direction::AntiDiagonal => (1, -1),
    }
}

/// Sum of pattern scores for every stone `color` has on the board, credited
/// once per contiguous run (at the run's "first" stone in each direction)
/// so a five isn't counted 5 times over. Known simplification carried over
/// from `pattern.rs`: jump/broken shapes aren't scored here either, since
/// `line_patterns_after` only sees contiguous runs (see pattern.rs doc).
fn score_for(board: &Board, color: Color) -> i32 {
    let mut total = 0i32;
    for p in 0..(BOARD_SIZE * BOARD_SIZE) {
        if board.color_at(p) != Some(color) {
            continue;
        }
        let (row, col) = row_col(p);
        for (dir, pat) in line_patterns_after(board, p, color) {
            let (dcol, drow) = direction_vector(dir);
            let prev_r = row as isize - drow;
            let prev_c = col as isize - dcol;
            let is_run_start = if prev_r < 0
                || prev_c < 0
                || prev_r as usize >= BOARD_SIZE
                || prev_c as usize >= BOARD_SIZE
            {
                true
            } else {
                let prev_p = (prev_r as usize) * BOARD_SIZE + (prev_c as usize);
                board.color_at(prev_p) != Some(color)
            };
            if is_run_start {
                total += pattern_score(pat);
            }
        }
    }
    total
}

/// Static evaluation from `color`'s perspective: positive favors `color`.
pub fn evaluate(board: &Board, color: Color) -> i32 {
    score_for(board, color) - score_for(board, color.opponent())
}

/// Cheap per-cell move-ordering heuristic: the strongest pattern either
/// color would get by playing there (biggest threat, offensive or
/// defensive, goes first).
fn quick_threat_score(board: &Board, p: Pos) -> i32 {
    let mine = line_patterns_after(board, p, Color::Black)
        .into_iter()
        .map(|(_, pat)| pattern_score(pat))
        .max()
        .unwrap_or(0);
    let theirs = line_patterns_after(board, p, Color::White)
        .into_iter()
        .map(|(_, pat)| pattern_score(pat))
        .max()
        .unwrap_or(0);
    mine.max(theirs)
}

fn candidate_moves(board: &Board) -> Vec<Pos> {
    let mut candidates = nearby_empty_cells(board);
    candidates.sort_by_cached_key(|&p| std::cmp::Reverse(quick_threat_score(board, p)));
    candidates
}

/// Bounded negamax with alpha-beta pruning. `depth` counts half-moves
/// remaining (one ply per call). Leaf/empty-candidate nodes fall back to
/// the static `evaluate`.
fn negamax(board: &mut Board, color: Color, depth: u32, mut alpha: i32, beta: i32) -> i32 {
    if depth == 0 {
        return evaluate(board, color);
    }
    let candidates = candidate_moves(board);
    if candidates.is_empty() {
        return evaluate(board, color);
    }
    let mut best = i32::MIN + 1;
    for p in candidates {
        if color == Color::Black && is_forbidden(evaluate_move(board, p, Color::Black)) {
            continue;
        }
        let outcome = evaluate_move(board, p, color);
        board.force_set(p, color);
        let score = if outcome == RenjuResult::Win {
            FIVE_SCORE - (10 - depth as i32).max(0)
        } else {
            -negamax(board, color.opponent(), depth - 1, -beta, -alpha)
        };
        board.force_clear(p, color);
        if score > best {
            best = score;
        }
        if best > alpha {
            alpha = best;
        }
        if alpha >= beta {
            break; // beta cutoff
        }
    }
    if best == i32::MIN + 1 {
        // Every candidate was forbidden (Black only) -- fall back to static
        // eval rather than reporting a bogus "worst possible" score.
        return evaluate(board, color);
    }
    best
}

/// Find the best move for `color`: a VCF forced win if one exists (checked
/// first, see module doc), otherwise a bounded alpha-beta search over
/// `depth` half-moves. Candidates are restricted to empty cells within 2 of
/// an existing stone; the empty board is a special case fixed to `h8`
/// (standard Renju opening point).
pub fn best_move(board: &Board, color: Color, depth: u32) -> Option<(Pos, i32)> {
    if let Some(vcf) = find_vcf(board, color, VCF_PRECHECK_DEPTH) {
        if let Some(&first) = vcf.winning_moves.first() {
            return Some((first, FIVE_SCORE));
        }
    }

    let candidates = candidate_moves(board);
    if candidates.is_empty() {
        return Some((str_to_pos("h8").expect("h8 is always in range"), 0));
    }

    let mut best: Option<(Pos, i32)> = None;
    let mut alpha = i32::MIN + 1;
    let beta = i32::MAX - 1;
    let mut working = board.clone();
    for p in candidates {
        if color == Color::Black && is_forbidden(evaluate_move(&working, p, Color::Black)) {
            continue;
        }
        let outcome = evaluate_move(&working, p, color);
        working.force_set(p, color);
        let score = if outcome == RenjuResult::Win {
            FIVE_SCORE
        } else {
            -negamax(&mut working, color.opponent(), depth.saturating_sub(1), -beta, -alpha)
        };
        working.force_clear(p, color);
        if best.map(|(_, s)| score > s).unwrap_or(true) {
            best = Some((p, score));
        }
        if score > alpha {
            alpha = score;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::str_to_pos;

    fn board_with_black(stones: &[&str]) -> Board {
        let dummies = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"];
        assert!(stones.len() <= dummies.len());
        let mut moves = Vec::new();
        for (m, dummy) in stones.iter().zip(dummies.iter()) {
            moves.push(str_to_pos(m).unwrap());
            moves.push(str_to_pos(dummy).unwrap());
        }
        Board::from_moves(&moves).unwrap()
    }

    #[test]
    fn first_move_is_fixed_center() {
        let b = Board::new();
        let (mv, _score) = best_move(&b, Color::Black, 4).unwrap();
        assert_eq!(mv, str_to_pos("h8").unwrap());
    }

    #[test]
    fn best_move_finds_forced_win_via_vcf() {
        // d8,e8,f8,g8 Black already lined up; best_move must pick the VCF
        // completion, not just a heuristically-decent move.
        let b = board_with_black(&["d8", "e8", "f8", "g8"]);
        let (mv, _score) = best_move(&b, Color::Black, 4).expect("expected a move");
        assert_eq!(evaluate_move(&b, mv, Color::Black), RenjuResult::Win);
    }
}
