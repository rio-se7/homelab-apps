# どうぶつしょうぎ解析アプリ

対局をプレイしながら各手の完全解析評価をリアルタイム表示する Web アプリ。

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Rust / cargo | 1.70+ | バックエンドのビルド |
| Node.js | LTS | フロントエンド |
| mise | - | Rust・Node のバージョン管理 |

## データのダウンロードと配置

バックエンドは田中先生の完全解析テーブルを使用する。

```bash
cd backend/
mkdir -p data
curl -L https://www.tanaka.ecc.u-tokyo.ac.jp/ktanaka/dobutsushogi/dobutsu-dat.tar.gz \
  | tar xz -C data/
```

展開後、以下のファイルが揃っていれば OK:

```
backend/data/dobutsu/
├── allstates.dat       (1.9 GB — 局面インデックス)
├── winLoss.dat         (235 MB — 勝敗)
└── winLossCount.dat    (235 MB — 残り手数)
```

`data/` は `.gitignore` に含まれているためコミットされない。

## 起動方法

### 一括起動（推奨）

```bash
./dev.sh
```

バックエンド・フロントエンドを同時に起動する。`Ctrl+C` または Vite の `q` で両方とも停止する。
フロントエンドは端末に直接アタッチされるため、Vite のインタラクティブショートカット
（`o`=ブラウザを開く / `r`=再起動 / `u`=URL表示 / `c`=クリア / `q`=終了）がそのまま使える。
バックエンドのログには `[backend]` プレフィックスが付く。

引数なしでもそのまま起動できるほか、Vite への引数をそのまま渡せる:

```bash
./dev.sh --port 5174 --host
```

`DOBUTSU_DATA_DIR` / `DOBUTSU_BACKEND_PORT` 環境変数でバックエンドのデータディレクトリ・ポートを変更できる。

### バックエンド（個別起動）

```bash
cd backend/
cargo run --release -- --data-dir data/dobutsu --port 8080
```

起動後 `http://localhost:8080/health` が `200 OK` を返せば正常。

### フロントエンド（個別起動）

```bash
cd frontend/
npm install
npm run dev
```

`http://localhost:5173` をブラウザで開く。
バックエンドへの API リクエストは Vite の proxy 経由で `localhost:8080` に転送される。

## API エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `GET /health` | 死活確認 |
| `GET /api/eval?pos=<hex>` | 局面の勝敗・手数を返す |
| `GET /api/moves?pos=<hex>` | 全合法手と評価を返す（最善手順） |

`pos` は田中先生エンコーディングで正規化した局面の u64 (hex 16桁)。

## ライセンス

解析テーブルデータ: BSD 2-Clause (田中晶夫, 東京大学)
