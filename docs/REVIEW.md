# homelab-apps レビュー (2026-06-09)

対象: `main` 上のアプリ（現状 `dobutsu-analyzer`: Rust/axum backend + React/Vite frontend）+ CI。
観点: セキュリティ / ライセンス / 機能 / パフォーマンス。
※ `feat/briefcast`, `feat/rsscast`, `feat/mahjong-trainer` は WIP ブランチのため未レビュー（main 昇格時に同じ観点で再確認）。

> 重大度: **High** / **Med** / **Low** / **Good** / **Info**。

## サマリ（優先度順）

| # | 重大度 | 観点 | 概要 |
|---|--------|------|------|
| 1 | Med | SEC | **public リポジトリ + self-hosted dind runner** — `pull_request` トリガを絶対に self-hosted で動かさない |
| 2 | Med | SEC | backend が `CorsLayer::permissive()` + 認証なし（エッジ依存）|
| 3 | Low | SEC | GH Actions が可変 major tag 固定（SHA pin 推奨）|
| 4 | Low | 機能 | `/health` が常に 200 → table 未ロードでも readiness 通過 |
| 5 | Low | パフォ | backend Dockerfile に依存キャッシュ層なし / nginx に gzip・cache 無し |
| 6 | Good | ライセンス | MIT 明記 + table データ BSD-2 を README で明記 |

---

## セキュリティ

- **[Med] 公開リポジトリ × self-hosted dind runner の境界** — `.github/workflows/dobutsu-analyzer.yml:4-5,21,37`
  homelab-apps は **public**。ビルドは self-hosted runner (`runs-on: homelab-apps`, containerMode dind=privileged) で実行される。現状は `on: push: branches:[main]` のみなので fork からの PR ではトリガされず**安全**。ただしこれは綱渡りの安全であり、明確なガードとして:
  - **絶対にやらないこと**: この public リポジトリで `pull_request`（fork 由来）を self-hosted runner 上で実行する。fork の攻撃コードが dind 権限であなたの k3s ノード上で動く。
  - 推奨: その旨を CONTRIBUTING/README に明記。PR の CI が要る場合は GitHub-hosted runner か、public 専用の隔離 runner set を使う。ARC は ephemeral（毎回使い捨て）な点は良い。

- **[Med] backend の CORS が permissive + 認証なし** — `backend/src/main.rs:53`
  `CorsLayer::permissive()` は任意 origin を許可。backend 自体に認証はなく、Cloudflare Access（エッジ）+ nginx 同一オリジン proxy のみで守られている。backend が直接露出した瞬間に全開放。
  - 対応: CORS を `dobutsu.senarion.net` 限定にする（nginx 経由の同一オリジンなら CORS 自体ほぼ不要）。多層防御として backend を ClusterIP 内部限定に保つ運用も明記。

- **[Low] GH Actions の pin が可変 major tag** — `actions/checkout@v4`, `actions/github-script@v7`
  クラスタ/レジストリ権限を持つ runner で動くので、供給鎖対策として commit SHA pin を推奨。

- **[Good] 入力処理** — `backend/src/api.rs:33-37`
  `parse_board` は hex→u64 を `from_str_radix` で境界内パース、失敗は 400、lookup 失敗は 404。インジェクション面なし。
- **[Good] CI 権限** — `permissions: contents:read / packages:write` の最小権限、`GITHUB_TOKEN` で ghcr login。

## ライセンス

- **[Good] MIT LICENSE 同梱**（`LICENSE`, 2026 rio-se7）。table データの **BSD 2-Clause（田中晶夫, 東京大学）** も `dobutsu-analyzer/README.md:86-88` で明記。
  - 注意: データは**実行時 DL**で repo/image には同梱せず（`.gitignore` 済み）→ BSD-2 の再配布条項は現状トリガされない。**もし将来 image にデータを焼き込む/再配布する**場合は、BSD-2 の著作権表示・ライセンス全文を成果物に同梱すること。
- **[Low] アセットの素性** — `frontend/src/assets/hero.png` 等が第三者/生成物なら、public リポジトリなのでライセンス/権利を確認。
- **[Info]** frontend 依存（React/Vite ほか）は MIT/BSD 中心で問題なし。

## 機能

- **[Low] readiness が table ロードを反映しない** — `backend/src/main.rs:39-45,50`, fleet 側 `readinessProbe: /health`
  table 未ロードでも `health()` は常に 200 を返す。一方 `/api/*` は 503。結果として k8s readiness は通り、ingress が「API 全部 503」の Pod にトラフィックを流す。
  - 対応: table ロード状態を見る `/ready`(未ロード時 503) を追加し、fleet の readinessProbe をそちらに向ける。rollout がデータ投入完了でゲートされる。
- **[Info] moves のロジック** — 相手視点評価の反転 + 「勝ち(dtm小)>引分>負け(dtm大)」ソートは正しく見える。

## パフォーマンス

- **[Good] memmap2 による table 読み込み**（`Cargo.toml:14`, `backend/src/table.rs`）— 1.9GB を遅延ロード、低 RSS・高速ランダム lookup。小ノード前提として適切。
- **[Low] backend Dockerfile に依存キャッシュ層なし** — `backend/Dockerfile:4-6`
  `COPY src` の後に `cargo build` のため、ソース変更のたびに依存を再ビルド。self-hosted runner の CI 時間が伸びる。`cargo-chef`（依存を先に焼く）でレイヤキャッシュ化を推奨。
- **[Low] backend コンテナが root 実行** — `backend/Dockerfile` に `USER` 指定なし。runtime securityContext（非 root）や `USER nonroot` を付与。
- **[Low] nginx に gzip / cache-control なし** — `frontend/nginx.conf`
  SPA 配信で `/assets` の immutable cache や gzip/brotli が無く転送量が大きい。`gzip on;` と `location /assets { add_header Cache-Control "public,max-age=31536000,immutable"; }` を追加。

## 補足

- frontend は backend を nginx の `/api/` proxy（`proxy_pass http://backend:8080`, `nginx.conf:8-13`）経由で呼ぶ。fleet 側 Service は `backend`(8080) / `frontend`(80)（同一 namespace `dobutsu-analyzer`）で **名前は整合済み**。問題なし。
