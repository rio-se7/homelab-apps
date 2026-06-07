use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum WdlResult {
    Win,
    Lose,
    Draw,
}

#[derive(Debug, Clone, Serialize)]
pub struct TbEntry {
    pub result: WdlResult,
    /// Distance to mate in half-moves (0 for draws)
    pub dtm: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct MoveEval {
    /// Move notation: "b2b3" (board move) or "G*b2" (drop)
    pub mv: String,
    pub result: WdlResult,
    pub dtm: u32,
}
