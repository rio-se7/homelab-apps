//! Core types: board size, coordinates, and stone color.
//!
//! Coordinate system (documented in README.md "座標" section):
//! - 15x15 board, columns `a`..`o` (15 letters, no skipping unlike Go/SGF's
//!   convention of skipping `i`), rows `1`..`15`.
//! - Center cell (standard Renju opening point) is `h8`.
//! - Internal `Pos` is a flat index `row * BOARD_SIZE + col`, both 0-indexed,
//!   so `h8` (col='h'=7, row=8 -> 7) is `Pos` 7*15+7 = 112.

use serde::{Deserialize, Serialize};

pub const BOARD_SIZE: usize = 15;
pub const NUM_CELLS: usize = BOARD_SIZE * BOARD_SIZE;

/// Flat board index in `0..NUM_CELLS`, row-major (`row * BOARD_SIZE + col`).
pub type Pos = usize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Black,
    White,
}

impl Color {
    pub fn opponent(self) -> Color {
        match self {
            Color::Black => Color::White,
            Color::White => Color::Black,
        }
    }
}

/// Convert a `Pos` to its human-readable coordinate string, e.g. `112 -> "h8"`.
pub fn pos_to_str(p: Pos) -> String {
    let col = (p % BOARD_SIZE) as u8;
    let row = (p / BOARD_SIZE) + 1;
    format!("{}{}", (b'a' + col) as char, row)
}

/// Parse a coordinate string like `"h8"` into a `Pos`. Column letters are
/// `a`..`o` (case-insensitive), rows are `1`..`15`. Returns `None` on any
/// malformed or out-of-range input.
pub fn str_to_pos(s: &str) -> Option<Pos> {
    let s = s.trim();
    let mut chars = s.chars();
    let c = chars.next()?;
    if !c.is_ascii_alphabetic() {
        return None;
    }
    let col = (c.to_ascii_lowercase() as u8).checked_sub(b'a')? as usize;
    if col >= BOARD_SIZE {
        return None;
    }
    let rest: String = chars.collect();
    if rest.is_empty() {
        return None;
    }
    let row: usize = rest.parse().ok()?;
    if row < 1 || row > BOARD_SIZE {
        return None;
    }
    Some((row - 1) * BOARD_SIZE + col)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_is_h8() {
        assert_eq!(str_to_pos("h8"), Some(7 * BOARD_SIZE + 7));
        assert_eq!(pos_to_str(7 * BOARD_SIZE + 7), "h8");
    }

    #[test]
    fn roundtrip_all_cells() {
        for p in 0..NUM_CELLS {
            let s = pos_to_str(p);
            assert_eq!(str_to_pos(&s), Some(p), "roundtrip failed for {p} -> {s}");
        }
    }

    #[test]
    fn rejects_out_of_range() {
        assert_eq!(str_to_pos("p1"), None); // column 'p' is out of a-o range
        assert_eq!(str_to_pos("a16"), None); // row 16 out of range
        assert_eq!(str_to_pos("a0"), None);
        assert_eq!(str_to_pos(""), None);
        assert_eq!(str_to_pos("8h"), None);
    }
}
