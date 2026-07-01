# dobutsu-record

どうぶつしょうぎの対局結果トラッカー。メンバー同士の実戦の戦績を記録し、総当たり表・Eloレーティング・先後別勝率を自動集計する Web アプリ。

ローカル動作・SQLite ファイル保存の単独利用を想定（将来 k3s で共有も可能な構成）。

## 機能

- **記録**: 2人を選び勝者をワンタップで登録（引き分け対応）。「先手・後手を記録する」は任意 — オフにすると先後不明の対局として保存され、先後別勝率の集計からは除外される
- **戦績表**: 総当たり matrix（勝-敗、勝ち越し緑 / 負け越し赤で色分け）
- **レーティング**: 履歴順に Elo（初期1500, K=24）を再計算し推移を折れ線グラフ表示。ランキング／先手勝率／後手勝率／連勝・連敗
- **履歴**: 対局ログの一覧・メンバー絞り込み・削除
- **メンバー**: 追加・改名・引退（active フラグ）・削除（対局がある場合は引退のみ）

## スタック

- Backend: Rust / axum / rusqlite (bundled SQLite)
- Frontend: React 19 + TypeScript + Vite + recharts

## 起動

```bash
# 個別起動
cd backend && cargo run --release -- --db data/record.db --port 8090
cd frontend && npm install && npm run dev   # → http://localhost:5173

# まとめて起動
./dev.sh
```

DB ファイルは `--db` で指定（デフォルト `data/record.db`、初回に自動作成）。

## API

| Method | Path | 説明 |
|--------|------|------|
| GET    | `/api/members` | メンバー一覧 |
| POST   | `/api/members` | 追加 `{name}` |
| PATCH  | `/api/members/{id}` | 更新 `{name?, active?}` |
| DELETE | `/api/members/{id}` | 削除。対局があると 409。`?force=true` で本人の対局も一緒に削除 |
| GET    | `/api/matches` | 対局一覧（新しい順） |
| POST   | `/api/matches` | 登録 `{black_id, white_id, result, sides_known?, played_at?, note?}` |
| PATCH  | `/api/matches/{id}` | 部分更新 `{black_id?, white_id?, result?, sides_known?, note?}`（先後の入替・記録有無の編集に使用） |
| DELETE | `/api/matches/{id}` | 削除 |

`result` は `black_win` / `white_win` / `draw`。`sides_known`（省略時 `true`）が `false` のときは `black_id`/`white_id` は単なる参加者2名で先後の意味を持たず、先後別勝率の集計対象外。集計（matrix・Elo）はフロント側で全対局から計算する。

## メモ

- どうぶつしょうぎは完全解析では後手必勝（76手）。実戦の先後別勝率を見られるのが題材的な面白さ。
- 棋譜を残せば将来 `dobutsu-analyzer` の解析ページへリンクする拡張余地あり。
