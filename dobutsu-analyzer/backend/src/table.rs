use std::path::Path;

use anyhow::{bail, Result};
use memmap2::Mmap;

use crate::board::Board;
use crate::types::{TbEntry, WdlResult};

pub struct TableBase {
    allstates: Mmap,
    win_loss: Mmap,
    win_loss_count: Mmap,
}

impl TableBase {
    /// データディレクトリから3ファイルを mmap で開く
    pub fn open(dir: &Path) -> Result<Self> {
        let open_mmap = |name: &str| -> Result<Mmap> {
            let path = dir.join(name);
            let file = std::fs::File::open(&path)
                .map_err(|e| anyhow::anyhow!("cannot open {}: {}", path.display(), e))?;
            Ok(unsafe { Mmap::map(&file)? })
        };

        Ok(Self {
            allstates: open_mmap("allstates.dat")?,
            win_loss: open_mmap("winLoss.dat")?,
            win_loss_count: open_mmap("winLossCount.dat")?,
        })
    }

    /// 局面のインデックスをバイナリサーチで取得
    fn find_index(&self, board: Board) -> Option<usize> {
        let data = &self.allstates;
        // allstates.dat は u64 little-endian のソート済み配列
        // バイト列比較ではなく数値として比較する必要がある
        let n = data.len() / 8;
        let key = board.0;
        let mut lo = 0usize;
        let mut hi = n;
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let entry = u64::from_le_bytes(data[mid * 8..(mid + 1) * 8].try_into().unwrap());
            match entry.cmp(&key) {
                std::cmp::Ordering::Equal => return Some(mid),
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => hi = mid,
            }
        }
        None
    }

    pub fn lookup(&self, board: Board) -> Result<TbEntry> {
        let idx = match self.find_index(board) {
            Some(i) => i,
            None => bail!("position not found in table"),
        };

        // winLoss.dat: signed char — 1=WIN, -1(=0xFF)=LOSE, 0=DRAW
        // winLossCount.dat: unsigned char — retrograde BFS iteration count
        let wl = self.win_loss[idx] as i8;
        let dtm = self.win_loss_count[idx] as u32;

        let result = match wl {
            1 => WdlResult::Win,
            -1 => WdlResult::Lose,
            _ => WdlResult::Draw,
        };

        Ok(TbEntry { result, dtm })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Board;

    #[test]
    #[ignore]
    fn lookup_initial_position() {
        let tb = TableBase::open(Path::new("data/dobutsu")).unwrap();
        let board = Board::init().normalize();
        println!("init board u64 (normalized): {:#018x}", board.0);

        match tb.find_index(board) {
            Some(idx) => {
                let wl = tb.win_loss[idx];
                let cnt = tb.win_loss_count[idx];
                println!("found at index {idx}: winLoss={wl}, winLossCount={cnt}");
            }
            None => {
                println!("NOT FOUND — encoding mismatch or endianness issue");
                // first 3 entries for reference
                for i in 0..3 {
                    let v = u64::from_le_bytes(tb.allstates[i*8..(i+1)*8].try_into().unwrap());
                    println!("  allstates[{i}] LE={v:#018x}");
                    let v = u64::from_be_bytes(tb.allstates[i*8..(i+1)*8].try_into().unwrap());
                    println!("  allstates[{i}] BE={v:#018x}");
                }
            }
        }
    }
}
