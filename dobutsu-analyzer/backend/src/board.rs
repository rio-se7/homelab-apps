/// どうぶつしょうぎ盤面表現（田中先生オリジナルエンコーディング）
///
/// u64 フォーマット:
///   Cell(x,y) → bits (x*4+y)*4 .. +3  (4 bits/cell)
///   x: 0=C列, 1=B列, 2=A列  (表記上 A=右, C=左)
///   y: 0=1段(後手陣), 1=2段, 2=3段, 3=4段(先手陣)
///
///   駒値: 0=空
///     先手(BLACK): BABY=1, ELEPHANT=2, GIRAFFE=3, CHICKEN=4, LION=5
///     後手(WHITE): -1 to -5 → packed as &0xF: 15,14,13,12,11
///
///   持ち駒 (2bits ずつ, bits 48+j*2):
///     j=0: BLACK BABY, j=1: BLACK ELEPHANT, j=2: BLACK GIRAFFE
///     j=3: WHITE BABY, j=4: WHITE ELEPHANT, j=5: WHITE GIRAFFE
///
///   allstates.dat は常に先手(BLACK)視点の正規化済み u64

pub const EMPTY: i8 = 0;
pub const BABY: i8 = 1;     // ひよこ
pub const ELEPHANT: i8 = 2; // ぞう
pub const GIRAFFE: i8 = 3;  // きりん
pub const CHICKEN: i8 = 4;  // にわとり(成りひよこ)
pub const LION: i8 = 5;     // ライオン

/// 8方向ベクトル (dx, dy) — dy<0: 1段方向(後手側), dy>0: 4段方向(先手側)
const DIRS: [(i8, i8); 8] = [
    (1, -1), (0, -1), (-1, -1),
    (1,  0),          (-1,  0),
    (1,  1), (0,  1), (-1,  1),
];

/// 各駒が動ける方向のビットマスク (ビット番号 = DIRS のインデックス)
/// インデックス = piece_type - 1  (BABY=0, ELEPHANT=1, GIRAFFE=2, CHICKEN=3, LION=4)
const CAN_MOVE: [u8; 5] = [0x02, 0xa5, 0x5a, 0x5f, 0xff];

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Board(pub u64);

/// nibble値 (0-15) → 駒値 (-5 to 5)
#[inline]
fn nibble_to_piece(n: u8) -> i8 {
    if n >= 8 { n as i8 - 16 } else { n as i8 }
}

/// 駒値 → nibble値 (4ビット, two's complement)
#[inline]
fn piece_to_nibble(p: i8) -> u64 {
    (p as u8 & 0xF) as u64
}

/// セルインデックス (0-11) → (列 0-2, 段 0-3)
#[inline]
fn cell_shift(x: i8, y: i8) -> u32 {
    ((x * 4 + y) * 4) as u32
}

impl Board {
    /// 初期局面 (先手が4段目, 後手が1段目)
    pub fn init() -> Board {
        let mut b = 0u64;
        // 後手駒 (y=0, WHITE)
        b |= piece_to_nibble(-ELEPHANT) << cell_shift(0, 0); // C1
        b |= piece_to_nibble(-LION)     << cell_shift(1, 0); // B1
        b |= piece_to_nibble(-GIRAFFE)  << cell_shift(2, 0); // A1
        b |= piece_to_nibble(-BABY)     << cell_shift(1, 1); // B2
        // 先手駒 (y=2,3, BLACK)
        b |= piece_to_nibble(BABY)      << cell_shift(1, 2); // B3
        b |= piece_to_nibble(GIRAFFE)   << cell_shift(0, 3); // C4
        b |= piece_to_nibble(LION)      << cell_shift(1, 3); // B4
        b |= piece_to_nibble(ELEPHANT)  << cell_shift(2, 3); // A4
        Board(b)
    }

    /// セルの駒を取得 (-5 to 5, 0=空)
    #[inline]
    pub fn get(self, x: i8, y: i8) -> i8 {
        nibble_to_piece(((self.0 >> cell_shift(x, y)) & 0xF) as u8)
    }

    /// セルに駒をセット (既存の値がない前提)
    #[inline]
    fn put(self, x: i8, y: i8, p: i8) -> Board {
        Board(self.0 | (piece_to_nibble(p) << cell_shift(x, y)))
    }

    /// セルをクリア
    #[inline]
    fn clear(self, x: i8, y: i8) -> Board {
        Board(self.0 & !(0xF_u64 << cell_shift(x, y)))
    }

    /// セルの値を上書き
    #[inline]
    fn set(self, x: i8, y: i8, p: i8) -> Board {
        self.clear(x, y).put(x, y, p)
    }

    /// 持ち駒の枚数を取得
    /// is_black=true: BLACK の持ち駒, piece_type: BABY/ELEPHANT/GIRAFFE (1-3)
    pub fn hand(self, is_black: bool, piece_type: i8) -> u8 {
        let j = if is_black { piece_type - 1 } else { piece_type + 2 } as u32;
        ((self.0 >> (48 + j * 2)) & 3) as u8
    }

    fn inc_hand(self, is_black: bool, mut piece_type: i8) -> Board {
        if piece_type == CHICKEN { piece_type = BABY; } // にわとりは取るとひよこに
        let j = if is_black { piece_type - 1 } else { piece_type + 2 } as u32;
        Board(self.0 + (1_u64 << (48 + j * 2)))
    }

    fn dec_hand(self, is_black: bool, piece_type: i8) -> Board {
        let j = if is_black { piece_type - 1 } else { piece_type + 2 } as u32;
        Board(self.0 - (1_u64 << (48 + j * 2)))
    }

    /// 左右反転 (A列 ↔ C列, 持ち駒はそのまま)
    pub fn flip(self) -> Board {
        let col_c = (self.0      ) & 0x0000_0000_0000_FFFF; // x=0 bits 0-15
        let col_b = (self.0      ) & 0x0000_0000_FFFF_0000; // x=1 bits 16-31
        let col_a = (self.0      ) & 0x0000_FFFF_0000_0000; // x=2 bits 32-47
        let hand  = (self.0      ) & 0xFFFF_0000_0000_0000; // bits 48-63
        Board((col_a >> 32) | col_b | (col_c << 32) | hand)
    }

    /// 180度回転 + 先後入れ替え (後手視点→先手視点への変換)
    /// board[(x,y)] = -old_board[(2-x, 3-y)]
    /// 持ち駒: BLACK ↔ WHITE を交換
    pub fn rotate_change_turn(self) -> Board {
        let mut b = 0u64;
        for x in 0..3_i8 {
            for y in 0..4_i8 {
                let p = self.get(2 - x, 3 - y);
                if p != 0 {
                    b |= piece_to_nibble(-p) << cell_shift(x, y);
                }
            }
        }
        // 持ち駒の先後入れ替え: j=0,1,2 (BLACK) ↔ j=3,4,5 (WHITE)
        let black_hand = (self.0 >> 48) & 0x3F;  // bits 48-53 (6 bits = 3×2bit)
        let white_hand = (self.0 >> 54) & 0x3F;  // bits 54-59
        b |= (white_hand << 48) | (black_hand << 54);
        Board(b)
    }

    /// 正規化: min(self, self.flip()) — allstates.dat のキーと一致させる
    pub fn normalize(self) -> Board {
        let flipped = self.flip();
        if self.0 <= flipped.0 { self } else { flipped }
    }

    /// 全合法手を生成 (先手=BLACK の手番前提)
    /// 戻り値: (着手後ボード[正規化済み], 着手表記)
    pub fn legal_moves(self) -> Vec<(Board, String)> {
        let mut moves = Vec::new();

        // 盤上の先手駒を動かす
        for x in 0..3_i8 {
            for y in 0..4_i8 {
                let p = self.get(x, y);
                if p <= 0 { continue; } // 空か後手駒はスキップ
                let ptype = p as usize - 1;
                let b = self.clear(x, y);
                for (dir_idx, &(dx, dy)) in DIRS.iter().enumerate() {
                    if CAN_MOVE[ptype] & (1 << dir_idx) == 0 { continue; }
                    let (nx, ny) = (x + dx, y + dy);
                    if nx < 0 || nx >= 3 || ny < 0 || ny >= 4 { continue; }
                    let target = self.get(nx, ny);
                    if target > 0 { continue; } // 自駒がある
                    // 取り
                    let mut nb = b.clear(nx, ny);
                    if target < 0 {
                        nb = nb.inc_hand(true, -target);
                    }
                    // 成り: ひよこが y=0 (後手陣) に入る
                    let promote = p == BABY && ny == 0;
                    nb = nb.put(nx, ny, if promote { CHICKEN } else { p });
                    let mv = format!("{}{}{}{}", col_char(x), row_char(y), col_char(nx), row_char(ny));
                    moves.push((nb.rotate_change_turn().normalize(), mv));
                }
            }
        }

        // 持ち駒を打つ
        for &pt in &[BABY, ELEPHANT, GIRAFFE] {
            if self.hand(true, pt) == 0 { continue; }
            for y in 0..4_i8 {
                for x in 0..3_i8 {
                    if self.get(x, y) != 0 { continue; }
                    let nb = self.put(x, y, pt).dec_hand(true, pt);
                    let mv = format!("{}*{}{}", piece_char(pt), col_char(x), row_char(y));
                    moves.push((nb.rotate_change_turn().normalize(), mv));
                }
            }
        }

        moves
    }
}

fn col_char(x: i8) -> char { "CBA"[x as usize..].chars().next().unwrap() }
fn row_char(y: i8) -> char { char::from(b'1' + y as u8) }
fn piece_char(p: i8) -> char {
    match p {
        BABY => 'P', ELEPHANT => 'E', GIRAFFE => 'G', CHICKEN => 'C', LION => 'L', _ => '?',
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn init_board_pieces() {
        let b = Board::init();
        assert_eq!(b.get(1, 0), -LION);     // B1: 後手ライオン
        assert_eq!(b.get(1, 3), LION);      // B4: 先手ライオン
        assert_eq!(b.get(1, 2), BABY);      // B3: 先手ひよこ
        assert_eq!(b.get(1, 1), -BABY);     // B2: 後手ひよこ
        assert_eq!(b.get(2, 0), -GIRAFFE);  // A1: 後手きりん
        assert_eq!(b.get(0, 0), -ELEPHANT); // C1: 後手ぞう
        assert_eq!(b.get(2, 3), ELEPHANT);  // A4: 先手ぞう (田中先生エンコーディング)
        assert_eq!(b.get(0, 3), GIRAFFE);   // C4: 先手きりん
    }

    #[test]
    fn init_no_hand_pieces() {
        let b = Board::init();
        for &pt in &[BABY, ELEPHANT, GIRAFFE] {
            assert_eq!(b.hand(true, pt), 0);
            assert_eq!(b.hand(false, pt), 0);
        }
    }

    #[test]
    fn init_moves_not_empty() {
        let b = Board::init();
        assert!(!b.legal_moves().is_empty());
    }

    #[test]
    fn normalize_idempotent() {
        let b = Board::init().normalize();
        assert_eq!(b, b.normalize());
    }

    #[test]
    fn rotate_twice_is_identity() {
        let b = Board::init();
        assert_eq!(b, b.rotate_change_turn().rotate_change_turn());
    }

    #[test]
    fn init_normalized_value() {
        // 正規化後の初期局面 u64 を確認
        let b = Board::init().normalize();
        println!("init normalized: {:#018x}", b.0);
        // 期待値: 0x0000_200d_51fb_300e (田中先生のソースから計算)
        assert_eq!(b.0, 0x0000_200d_51fb_300e);
    }
}
