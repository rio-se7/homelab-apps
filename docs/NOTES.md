# homelab-apps — Design Notes

## Vision

homelab で動かすアプリのソースコードをまとめるモノレポ。
ビルドしたイメージは homelab-fleet 経由で k3s にデプロイされる。

## Deployment Flow

```
homelab-apps (source)
  → Docker build
  → push image
  → update image tag in homelab-fleet/charts/<app>/
  → ArgoCD sync
  → k3s
```

---

## Apps

### dashboard — HA カスタムダッシュボード

Home Assistant のデフォルト UI の代替。HA の WebSocket API でリアルタイム状態反映。

**Stack**: Next.js / SvelteKit + Tailwind + shadcn/ui + HA WebSocket API

**Planned Features:**
- [ ] デバイス一覧とオン/オフ制御
- [ ] 部屋ごとのグルーピング表示
- [ ] リアルタイム状態反映 (WebSocket)
- [ ] モバイルフレンドリーレイアウト
- [ ] ダークモード対応

**TODO:**
- [ ] フレームワーク選定 (Next.js vs SvelteKit)
- [ ] HA WebSocket API 接続プロトタイプ
- [ ] shadcn/ui でコンポーネント設計

---

### dam-tracker — DAM 採点履歴トラッカー

clubdam.com から採点履歴を自動取得し、可視化と AI フィードバックを提供。

**Stack**: Playwright (scraper) + Next.js / SvelteKit + recharts + Claude API

**Data Source:** https://www.clubdam.com/ (公式 API なし → Playwright でスクレイピング)

**取得予定データ:** 曲名, 日時, 総合得点, 音程正確率, リズム, 安定性

**Planned Features:**
- [ ] 採点履歴一覧
- [ ] 時系列グラフ (recharts)
- [ ] 曲ごとの得点推移
- [ ] AI フィードバック (Claude API)
- [ ] 苦手ポイント分析 (音程 / リズム / 安定性)

**TODO:**
- [ ] clubdam.com のログインフロー・HTML 構造を確認
- [ ] Playwright スクレーパーのプロトタイプ
- [ ] DB スキーマ設計 (songs, scores, metrics)

---

### dobutsu-analyzer — どうぶつしょうぎ解析Webアプリ

対局をプレイしながら各手の評価値（勝ち/負け/引き分け・残り手数）をリアルタイムで折れ線グラフ表示する解析アプリ。
田中先生の完全解析テーブル（約2億4680万局面）をバックエンドで参照し、任意局面の全合法手を評価する。

**Stack**: Rust (axum + memmap2) + React + TypeScript + Vite + Recharts

**Architecture:**
- バックエンド: 田中先生の解析テーブル (~560MB) を mmap して局面インデックスで引くAPIサーバー
- フロントエンド: ゲームエンジン（合法手生成・千日手判定）+ 盤面UI + 評価グラフ
- 独自探索: TypeScript ミニマックス + αβ枝刈り（将来 Rust→WASM 化も検討）

**Phases:**
- [x] Phase 1: バックエンド API（`GET /api/eval`, `GET /api/moves`, `GET /health`）
- [ ] Phase 2: フロントエンド — ゲームエンジン + 盤面UI
- [ ] Phase 3: 評価グラフ（Recharts、先手/後手評価値の折れ線）
- [ ] Phase 4: 独自探索モード + 完全解析との比較
- [ ] Phase 5: AI対局・棋譜再生・局面URL共有 等

**Phase 1 実装メモ (2026-05-18完了):**
- エンコーディング: 田中先生オリジナル (BABY=1, ELEPHANT=2, GIRAFFE=3, CHICKEN=4, LION=5, WHITE=-piece)
- allstates.dat: LE u64 ソート済み配列 / winLoss.dat: signed byte (1=WIN, -1=LOSE, 0=DRAW) / winLossCount.dat: unsigned byte (count, DTM≈count+1)
- バイナリサーチ: LE バイト列比較ではなく `u64::from_le_bytes()` で数値比較が必要
- 初期局面 (normalized): `0x0000_200d_51fb_300e` → LOSE/count=77 (後手必勝・78手) ✓

**次のアクション:**
- [ ] Phase 2: フロントエンド実装 (`dobutsu-analyzer/frontend/`)
  - React + TypeScript + Vite でプロジェクト作成
  - ゲームエンジン (合法手生成・千日手判定) — バックエンドの Rust ロジックを移植
  - 盤面UI (3×4グリッド、ドラッグ＆ドロップ or タップ)
  - API 連携 (`/api/moves` で合法手評価取得)

**既存リソース:**
- 田中先生の完全解析データ・プログラム: https://www.tanaka.ecc.u-tokyo.ac.jp/ktanaka/dobutsushogi/
- mame/dobutsu-shogi-master: https://github.com/mame/dobutsu-shogi-master
- clausecker/dobutsu: https://github.com/clausecker/dobutsu
