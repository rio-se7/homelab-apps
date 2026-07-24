//! 15x15 Renju board: per-color occupancy bitboards + move history.
//!
//! Design note (documented in README "実装メモ"): occupancy is stored as a
//! 256-bit bitboard per color (`[u64; 4]`, only the low 225 bits used) for
//! O(1) occupancy queries and a compact `Clone`. Line/pattern extraction
//! (see `pattern.rs`) walks coordinates directly rather than using bit-shift
//! tricks: a 15-wide row does not align to a power-of-two word boundary, so
//! shift-based line extraction (as used in e.g. 8x8 chess bitboards) needs
//! per-row masks to avoid wrap-around and is easy to get subtly wrong. Given
//! this is a from-scratch engine where correctness of forbidden-move
//! detection matters most, we trade a bit of raw speed for directly-checkable
//! coordinate walks.

use crate::types::{Color, Pos, BOARD_SIZE, NUM_CELLS};

/// 256-bit occupancy bitboard (225 bits used) for one color.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Bitboard([u64; 4]);

impl Bitboard {
    pub fn empty() -> Self {
        Bitboard([0; 4])
    }

    #[inline]
    pub fn get(&self, p: Pos) -> bool {
        (self.0[p / 64] >> (p % 64)) & 1 != 0
    }

    #[inline]
    pub fn set(&mut self, p: Pos) {
        self.0[p / 64] |= 1 << (p % 64);
    }

    #[inline]
    pub fn clear(&mut self, p: Pos) {
        self.0[p / 64] &= !(1u64 << (p % 64));
    }

    pub fn count(&self) -> u32 {
        self.0.iter().map(|w| w.count_ones()).sum()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BoardError {
    OutOfRange,
    Occupied,
}

impl std::fmt::Display for BoardError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BoardError::OutOfRange => write!(f, "position out of range"),
            BoardError::Occupied => write!(f, "cell already occupied"),
        }
    }
}
impl std::error::Error for BoardError {}

/// Board state: stone occupancy per color plus the ordered move history.
/// Moves alternate starting with Black (standard Renju: Black moves first,
/// no opening-rule / Swap2 handling in P0 — see plan doc).
#[derive(Debug, Clone, Default)]
pub struct Board {
    stones: [Bitboard; 2], // index 0 = Black, 1 = White
    history: Vec<Pos>,
}

impl Board {
    pub fn new() -> Self {
        Board {
            stones: [Bitboard::empty(); 2],
            history: Vec::new(),
        }
    }

    #[inline]
    fn idx(color: Color) -> usize {
        match color {
            Color::Black => 0,
            Color::White => 1,
        }
    }

    pub fn color_at(&self, p: Pos) -> Option<Color> {
        if self.stones[0].get(p) {
            Some(Color::Black)
        } else if self.stones[1].get(p) {
            Some(Color::White)
        } else {
            None
        }
    }

    /// Whose turn it is, derived from the number of moves played so far
    /// (Black plays on even-length history, i.e. moves 0, 2, 4, ...).
    pub fn side_to_move(&self) -> Color {
        if self.history.len() % 2 == 0 {
            Color::Black
        } else {
            Color::White
        }
    }

    pub fn history(&self) -> &[Pos] {
        &self.history
    }

    pub fn stone_count(&self) -> usize {
        self.history.len()
    }

    /// Play a stone for the side to move at `p`. Does NOT check Renju
    /// forbidden-move legality (see `renju::evaluate_move` for that) -- this
    /// only enforces "cell must be empty and on the board", so callers can
    /// reconstruct arbitrary (including illegal) positions for analysis.
    pub fn play(&mut self, p: Pos) -> Result<(), BoardError> {
        if p >= NUM_CELLS {
            return Err(BoardError::OutOfRange);
        }
        if self.color_at(p).is_some() {
            return Err(BoardError::Occupied);
        }
        let color = self.side_to_move();
        self.stones[Self::idx(color)].set(p);
        self.history.push(p);
        Ok(())
    }

    /// Undo the most recent move, returning its position if any.
    pub fn undo(&mut self) -> Option<Pos> {
        let p = self.history.pop()?;
        // The color that played `p` is the side to move *after* popping.
        let color = self.side_to_move();
        self.stones[Self::idx(color)].clear(p);
        Some(p)
    }

    pub fn from_moves(moves: &[Pos]) -> Result<Board, BoardError> {
        let mut b = Board::new();
        for &m in moves {
            b.play(m)?;
        }
        Ok(b)
    }

    pub fn empty_cells(&self) -> impl Iterator<Item = Pos> + '_ {
        (0..NUM_CELLS).filter(move |&p| self.color_at(p).is_none())
    }

    pub fn is_full(&self) -> bool {
        self.history.len() == NUM_CELLS
    }

    /// Set a stone directly, bypassing the side-to-move / occupancy checks
    /// used by `play`, and without touching move history. Intended for
    /// hypothetical/analysis code (pattern, renju, vcf, eval modules) that
    /// needs to evaluate "what if `color` had a stone at `p`" -- including
    /// speculative search where the color placed doesn't necessarily match
    /// `side_to_move()`. Callers must ensure `p` is in range and (normally)
    /// currently empty; this does not check either.
    pub fn force_set(&mut self, p: Pos, color: Color) {
        self.stones[Self::idx(color)].set(p);
    }

    /// Undo a `force_set` for the given color/position. Counterpart used to
    /// backtrack search without cloning the board at every node.
    pub fn force_clear(&mut self, p: Pos, color: Color) {
        self.stones[Self::idx(color)].clear(p);
    }
}

#[inline]
pub fn row_col(p: Pos) -> (usize, usize) {
    (p / BOARD_SIZE, p % BOARD_SIZE)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::str_to_pos;

    #[test]
    fn play_and_undo() {
        let mut b = Board::new();
        let p = str_to_pos("h8").unwrap();
        assert_eq!(b.side_to_move(), Color::Black);
        b.play(p).unwrap();
        assert_eq!(b.color_at(p), Some(Color::Black));
        assert_eq!(b.side_to_move(), Color::White);
        let undone = b.undo();
        assert_eq!(undone, Some(p));
        assert_eq!(b.color_at(p), None);
        assert_eq!(b.side_to_move(), Color::Black);
    }

    #[test]
    fn rejects_occupied_and_out_of_range() {
        let mut b = Board::new();
        let p = str_to_pos("a1").unwrap();
        b.play(p).unwrap();
        assert_eq!(b.play(p), Err(BoardError::Occupied));
        assert_eq!(b.play(NUM_CELLS), Err(BoardError::OutOfRange));
    }

    #[test]
    fn alternates_colors_from_moves_list() {
        let moves: Vec<Pos> = ["h8", "h9", "i8"]
            .iter()
            .map(|s| str_to_pos(s).unwrap())
            .collect();
        let b = Board::from_moves(&moves).unwrap();
        assert_eq!(b.color_at(moves[0]), Some(Color::Black));
        assert_eq!(b.color_at(moves[1]), Some(Color::White));
        assert_eq!(b.color_at(moves[2]), Some(Color::Black));
        assert_eq!(b.side_to_move(), Color::White);
    }
}
