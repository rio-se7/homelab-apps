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

### mahjong-trainer — 麻雀点数計算トレーナー

リーチ麻雀の点数計算を学ぶ純フロントエンドアプリ。計算ツールとクイズモードを実装。

**Stack**: React + TypeScript + Vite (バックエンド不要)

**機能:**
- 計算ツール: 手牌入力 → 役/符/点数の自動解析・解説表示
- クイズモード: 20問以上の問題で正答率を記録
- 点数表: 符×飜の早見表

**Engine (src/engine/):**
- `tiles.ts` — 牌定義・Unicode 絵文字表示・手牌文字列パース
- `decompose.ts` — 面子分解アルゴリズム (七対子・国士も対応)
- `fu.ts` — 符計算 (副底・刻子符・雀頭・待ち・門前加符)
- `yaku.ts` — 役判定 (平和・一盃口・役牌・一気通貫・清一色・役満等)
- `score.ts` — 符×飜→点数テーブル・満貫/跳満/倍満上限
- `calculator.ts` — 手牌→最高点数の組み合わせを選択
- `quiz.ts` — 20問のクイズ問題セット

**Status:** Phase 1 完了 (2026-05-23)

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
- [x] Phase 2: フロントエンド — ゲームエンジン + 盤面UI
- [x] Phase 3: 評価グラフ（Recharts、評価推移折れ線チャート）
- [ ] Phase 4: 独自探索モード + 完全解析との比較
- [ ] Phase 5: AI対局・棋譜再生・局面URL共有 等

**Phase 1 実装メモ (2026-05-18完了):**
- エンコーディング: 田中先生オリジナル (BABY=1, ELEPHANT=2, GIRAFFE=3, CHICKEN=4, LION=5, WHITE=-piece)
- allstates.dat: LE u64 ソート済み配列 / winLoss.dat: signed byte (1=WIN, -1=LOSE, 0=DRAW) / winLossCount.dat: unsigned byte (count, DTM≈count+1)
- バイナリサーチ: LE バイト列比較ではなく `u64::from_le_bytes()` で数値比較が必要
- 初期局面 (normalized): `0x0000_200d_51fb_300e` → LOSE/count=77 (後手必勝・78手) ✓

**Phase 2-3 実装メモ (2026-05-19完了):**
- 人間 vs 人間の対局モード（先手・後手どちらもクリックで指せる）
- 評価グラフ: 手を指すたびに `+N`(先手有利) / `-N`(後手有利) で推移を可視化
- 合法手一覧: `/api/moves` から取得、最善手順にソートして表示
- 後手合法手生成バグ修正: rotate座標→元の盤面座標に変換が必要

**追加実装済み機能 (2026-05-19〜20):**
- 任意局面セットアップ: 駒パレットから選んで盤面に自由配置、持ち駒設定、手番設定
- 1手戻る (Undo)
- 盤面反転トグル（後手視点表示）
- 評価グラフ（Recharts、手ごとに先手/後手有利が折れ線で推移）
- 先手・後手の合法手を横並び表示
- 盤面デザイン: どうぶつしょうぎ オマージュ（ナチュラルグリーン系・動物絵文字）
- 駒表示: 絵文字 (🦁🦒🐘🐤🐓)
- 棋譜・合法手表記: `▲B2ひ` / `△B3ひ打` / `▲B1に成` 形式
- コントローラーバー: 後手視点トグル・誰の番・1手戻る・局面設定・リセットを1行に集約
- 盤面サイズ: ResizeObserver でウィンドウに合わせて動的スケール (1:2 比率)
- 持ち駒エリア固定高さ（レイアウトシフト防止）

**バグ修正済み:**
- 後手合法手の座標変換: `legalMovesForBlack(rotateState(s))` → `(2-x, 3-y)` で元座標に戻す
- 持ち駒打ち選択: `selectedDrop` の駒種チェックが抜けていた
- トライ即取り返し: `checkWinner` で相手合法手チェックを追加
- 鶏を取ると雛に戻す: `Math.min(abs, GIRAFFE)` が誤りで GIRAFFE になっていた → `=== CHICKEN ? BABY` に修正
- 打ち駒の表記順: `▲ひ打B3` → `▲B3ひ打` に修正

**既知の注意点:**
- `verbatimModuleSyntax: true` (tsconfig) のため型インポートは `import { type Foo }` 形式が必須。ESLint `consistent-type-imports` ルールで検出可能
- 後手の API 合法手座標: 回転後の空間なので `apiMoveToKifu` で `(2-sx, 3-sy)` 変換が必要

**次のアクション:**
- [ ] Phase 4: 独自探索エンジン (TypeScript ミニマックス + αβ)
- [ ] Phase 5: 局面 URL シェア、棋譜読み込み再生
- [ ] k8s マニフェスト作成 (homelab-fleet へ追加)

**既存リソース:**
- 田中先生の完全解析データ・プログラム: https://www.tanaka.ecc.u-tokyo.ac.jp/ktanaka/dobutsushogi/
- mame/dobutsu-shogi-master: https://github.com/mame/dobutsu-shogi-master
- clausecker/dobutsu: https://github.com/clausecker/dobutsu
