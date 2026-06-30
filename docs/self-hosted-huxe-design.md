# セルフホスト版 Huxe アーキテクチャ設計 [v3.1]

> **目的**: Huxe (2026/05/28 サービス終了) の体験をセルフホストで再現する
> **方針**: クラウド推論一本化。台本生成はクラウドの無料枠 LLM（主=Gemini 2.5 Flash / fallback=Cloudflare Workers AI、OpenAI 互換・ルーター経由）。**有料プランは使わず、RTX5070（自宅GPU）は常時運用に使わない**。
> **前提環境**: OCI Always Free k3s 稼働済み、Tailscale or NetBird メッシュ稼働済み。Windows desktop (RTX 5070 12GB) + WSL2 は任意リソース（当面は TTS の Applio 検証用途の候補のみ）。
> **v3 変更点（最新・最優先）**: 推論をクラウド一本化 — 自宅GPUのローカル LLM（Qwen3.5-9B）と OCI-CPU-LLM フォールバックを**廃止**。可用性は Gemini→Cloudflare Workers AI の二段で担保。TTS は **Applio（RVC）を採用予定**だが GPU 要件が未確定のため Phase 0 で検証してから確定（それまでの無GPUベースラインは edge-tts）。LLM/TTS のエンドポイント抽象化（env 差替）は維持し、**既定をクラウドルーター（一旦 Cloudflare AI Gateway、将来 LiteLLM）に向ける**。実装の種は既存の `briefcast`（backend は openai_compat 化済み）。
> **v3.1 変更点**: 話者ロスター（交代・タイプ別）、Brief/DeepCast の分離配信（別タイミング再生）、複数 DeepCast（予算次第）を追記。最小構成優先。
> **v2 変更点**: 実物 Huxe 音声サンプル（22分48秒）の文字起こし分析を反映。連続構成・エピソード横断記憶・2話者役割分離・キュレーションレイヤーを新規/強化。

---

## 1. Huxe の体験分解（再現対象）

実物の文字起こし分析から、Huxe の体験は機能の独立した足し算ではなく **1本のエピソード内の連続体験** であることが判明した。

### 1-1. 1エピソードの構造

```
[パーソナル・オープニング (名前 + 時間帯 + 前回からの繋がり)]
        ↓
[アジェンダ先出し]
        ↓
[Briefing パート 10分前後]
   ニュース (テーマで束ねる、各々に "So what" を添える)
   興味プロファイル直結セグメント (スポーツ等)
   メール/予定/天気
        ↓
[トランジション 30秒〜1分]
   区切り + 引き止め + 次のテーマ予告
   ★ 選定理由の言語化 ("ユーザーが好きな音楽ジャンルのルーツ掘り")
   短い音楽ブレイク
        ↓
[DeepCast パート 10-12分]
   2話者の対話形式での深掘り
   フック → 歴史/背景 → 戦略/分析 → 影響 → クロージング
        ↓
[クロージング]
```

### 1-2. 機能要素と本設計での扱い

| Huxe の要素 | 本設計での扱い |
|-------------|---------------|
| Daily Briefing | Phase 2-B として実装。連続構成の前半 |
| DeepCast | Phase 1 で単発を作る + Phase 2-C で連続構成の後半として組み込み |
| Personalized Feed | Phase 2.5 として実装。**DeepCast テーマ選定と選定理由の言語化が核心** |
| エピソード横断記憶 | Phase 2-D で新規実装。「前回からの繋がり」演出に必須 |
| 2話者の対話 | Anchor + Co-host の役割分離を全フェーズ共通で適用 |
| Interactive "Join"（音声割り込み） | Phase 4 に分離。連続構成で体験の大部分が再現できるため優先度は下がる |

---

## 2. 全体アーキテクチャ

5つのサブシステムに分解する。疎結合・段階導入可能。

```
┌────────────────────────────────────────────────────────────────┐
│ [1] データ収集レイヤー (Ingest)                                  │
│   - Gmail API (OAuth, readonly)                                 │
│   - Google Calendar API (readonly)                              │
│   - RSS / ニュース取得                                          │
│   - 天気 API (Open-Meteo)                                       │
│   - 興味プロファイル直結ソース (贔屓チーム公式, 競技団体 等)   │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ [2] キュレーションレイヤー (Curation) ★Personalized Feed の核心 │
│   - 興味プロファイル (手動シード + 履歴微調整)                  │
│   - 候補収集 (RSS拡張 + 検索探索)                               │
│   - embedding 類似度検索 → LLM 再ランキング                     │
│   - DeepCast テーマ選定 + 選定理由の言語化                      │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ [3] 生成レイヤー (Generation)                                    │
│   3-1. 台本生成: クラウド LLM (主=Gemini 2.5 Flash /            │
│        fallback=Cloudflare Workers AI、OpenAI互換・router経由)  │
│        Anchor + Co-host の対話台本                              │
│        構造: Opening → Briefing → Transition → DeepCast         │
│   3-2. テキスト前処理                                            │
│        数値読み仮名化 / 固有名詞辞書 / 略語正規化               │
│   3-3. 音声合成 (TTS)                                            │
│        日本語: Applio (RVC, Anchor/Co-host で別ボイス) ※要件検証 │
│        無GPUベースライン: edge-tts (CPU・無料)                  │
│        英語/高品質: クラウド TTS (任意)                         │
│   → Brief / DeepCast は別音声ファイル (連結は任意)             │
└────────────────────────┬───────────────────────────────────────┘
                         │
            ┌────────────┴─────────────┐
            ▼                          ▼
┌──────────────────────────┐  ┌────────────────────────────────┐
│ [4] 記憶レイヤー (Memory) │  │ [5] 配信レイヤー (Delivery)    │
│  - エピソード履歴        │  │  - Podcast RSS feed            │
│  - トピック・選定理由    │  │  - 最小 Web UI (more/less ボタン)│
│  - ユーザー反応          │  │  - オブジェクトストレージ       │
│  → 次回生成の入力に戻る  │  │                                │
└──────────────────────────┘  └────────────────────────────────┘

  ▲ スケジューラ (k8s CronJob): 毎朝 [1]→[2]→[3]→[4]+[5] を自動実行
```

### 2-1. なぜ Podcast RSS + 最小 Web UI のハイブリッドか
- RSS: 標準ポッドキャストアプリで購読・オフライン再生・再生位置記憶が無料で手に入る
- Web UI: more/less ボタンによるフィードバックを取るために最小限必要（RSS だけだと再生/skip イベントが取れない）
- DeepCast 単発生成もRSS に追加するだけで配信完了
- Brief と DeepCast を別アイテムにすることで別タイミング再生・複数 DeepCast に自然に対応できる

### 2-2. なぜ「キュレーション」と「記憶」を独立レイヤーにしたか
- v1 設計ではこの2つが「生成レイヤーの一部」として暗黙的だったが、Huxe 体験の核心はここ
- 独立させることで、台本生成のLLM/TTSを差し替えても体験品質は維持できる
- 履歴がキュレーションに戻るループ（記憶レイヤー → キュレーションレイヤー）が学習機構になる

---

## 3. クラウド推論構成（v3）

実装の根幹に関わる方針。**推論はクラウド一本化**し、OCI k3s 上のサービスから OpenAI 互換のルーター経由で呼ぶ。

| レイヤー | 既定（主） | fallback | 場所 |
|----------|-----------|----------|------|
| 台本生成 LLM | Gemini 2.5 Flash（無料枠） | Cloudflare Workers AI（GLM-4.7-flash 等） | クラウド（router 経由） |
| 埋め込み（キュレーション） | クラウド埋め込み API（Gemini / Workers AI BGE） | — | クラウド |
| TTS | Applio（RVC）※GPU 要件は Phase 0 で検証 | edge-tts（CPU・無GPU ベースライン） | 検証後に確定 |

**設計の鍵**: 生成レイヤーは LLM/TTS のエンドポイントを環境変数で差し替え可能（`LLM_ENDPOINT` / `TTS_ENDPOINT`）。既定をクラウドルーターに向けることで、**有料プラン無し・自宅GPU常時運用無し**で動く。自宅GPU（RTX5070）のローカル LLM と OCI-CPU-LLM フォールバックは廃止（可用性は Gemini→CF の二段で担保）。

```
        ┌──────── OCI k3s (ARM A1, 常時稼働) ────────┐
        │ ingest / curation / generator / memory /    │
        │ feed / scheduler(CronJob)                   │
        │     │ OpenAI 互換リクエスト                  │
        └─────┼───────────────────────────────────────┘
              │
        ┌─────┴───────── LLM ルーター ──────────────┐
        │ 一旦 Cloudflare AI Gateway（将来 LiteLLM）   │
        │   主: Gemini 2.5 Flash（無料枠）             │
        │   fallback: Cloudflare Workers AI            │
        └──────────────────────────────────────────────┘

  TTS: Applio（要件検証後）/ それまで edge-tts。
  ※ RTX5070 を使うのは Applio を GPU 実行する場合のみ（Phase 0 で判断）。
```

---

## 4. 技術スタック選定

### 4-1. データ収集レイヤー

| 要素 | 推奨 | 備考 |
|------|------|------|
| 言語/FW | Python (FastAPI) | Google API クライアントの成熟度から初期は Python。Rust移行は後で検討 |
| Gmail/Calendar | Google API Client + OAuth 2.0 | refresh token を k8s Secret に。**readonly スコープに絞る** |
| RSS | `feedparser` | トピック別 feed URL を登録 |
| 天気 | Open-Meteo API | APIキー不要、無料 |
| スケジューラ | k8s CronJob | timezone=JST |

> ⚠️ **セキュリティ最重要**: OCI クラウド上に Gmail 全文アクセス権を常駐させることになる。token の暗号化保管・スコープ最小化・万一漏洩時の影響範囲を Phase 2 着手時点で設計する（運用整備フェーズを待たない）。
>
> ⚠️ **要確認**: Gmail API の OAuth は「テスト」公開ステータスだと refresh token が定期失効する可能性。実装前に Google Cloud Console のアプリ公開ステータス挙動を確認。

### 4-2. キュレーションレイヤー

| 要素 | 推奨 | 備考 |
|------|------|------|
| 興味プロファイル | YAML/JSON (k8s ConfigMap or 軽量DB) | 手動編集しやすく |
| 埋め込みモデル | クラウド埋め込み API（Gemini text-embedding / Workers AI BGE 等） | GPU不要。実装時に最新を選定 |
| ベクトルDB | pgvector / Qdrant / Chroma から選定 | 比較は実装時。k3s 上に常駐 |
| 再ランキング LLM | クラウド LLM（生成と同じ router 経由） | プロンプトに「定番を避け意外性を優先」 |
| 出力 | DeepCastテーマ + 選定理由 (自然言語) | 選定理由が後工程のトランジション台本で使われる |

> ⚠️ **正解が確立していない領域**。embedding + LLM 再ランキングは筋が良いが、刺さるかは実際に回してチューニングが必要。シンプルに始めて育てる前提。

### 4-3. 生成レイヤー — 台本生成 (LLM)

- **モデル**: クラウド無料枠。主=Gemini 2.5 Flash、fallback=Cloudflare Workers AI（`@cf/zai-org/glm-4.7-flash` 等。実データ A/B で選定済み）。**有料プラン不使用・GPU 不使用**。
- **呼び出し**: OpenAI 互換 API をルーター（一旦 Cloudflare AI Gateway、将来 LiteLLM）経由で。`generator` は `LLM_ENDPOINT` を env で差し替えるだけ。既存 `briefcast/backend/summarizer.py` が openai_compat 化済みで、この抽象化を先取りしている。
- **役割**: 収集データ + キュレーション結果 + 直近Nエピソードの記憶 → 連続構成の対話台本（JSON）に変換
- **2話者の役割分離**（プロンプトで明示）:
  - **Anchor**: 情報提供主体。事実・数値を担当
  - **Co-host**: 相槌・確認・素朴な質問・整理役。「うん」「なるほど」「え、待って」のような自然な反応マーカー
- **構造制約**: Opening → Briefing → Transition → DeepCast を1台本で生成。各セクションタグで JSON 出力
- **品質ガード**: SYSTEM_PROMPT で「プレーンテキストのみ／本文外を創作しない（反ハルシネーション）」を強制し、`temperature` を低め（0.4 目安）に。ニュースを音声で断言する事故を防ぐ（briefcast で実装済みの方針を流用）。

### 4-4. 生成レイヤー — テキスト前処理（v2新規）

TTS に渡す前の正規化パイプライン。**ここを雑にすると音声の信頼性が一気に落ちる**。

| 処理 | 内容 | 例 |
|------|------|----|
| 数値読み仮名化 | 桁数の多い数値・年号・%を正しく読ませる | 「4兆9500億ドル」「2026年」「49%」 |
| 固有名詞辞書 | 業界用語・略語・個人興味領域の語を登録 | TSMC, NHK, NASA 等（個人語は外部辞書で投入） |
| 略語正規化 | 必要に応じて読みを与える | NBA, AI, NHK |

辞書は運用しながら継続メンテ。誤読が見つかったら追加するフローを Phase 3.5 に含める。

### 4-5. 生成レイヤー — 音声合成 (TTS)

**Applio (RVC) を採用予定。ただし GPU 要件が未確定のため Phase 0 で検証してから確定する。** それまでの無GPUベースラインは edge-tts。

| 用途 | エンジン | 根拠・備考 |
|------|----------|-----------|
| 日本語 Anchor / Co-host | **Applio (RVC)** ※検証前提 | 声質を Anchor/Co-host で**別ボイスモデル**に。RVC は GPU 推奨のため要件・生成時間・品質を Phase 0 で実測 |
| 無GPUベースライン | **edge-tts** (CPU・無料、`ja-JP-*Neural`) | Applio 確定までの既定。briefcast の現 `tts.py` が対応済み |
| 英語 / 最高品質 | クラウド TTS (Gemini / ElevenLabs / OpenAI) | 任意。**有料は使わない方針**なので原則 edge-tts/Applio で賄う |

> ⚠️ **GPU 方針との緊張**: LLM はクラウド化して GPU を回避したが、Applio (RVC) は GPU 推奨。Phase 0 で「Applio を RTX5070 で TTS 時のみ使う / CPU で許容できる / 無GPU の edge-tts で十分」を判断する。**LLM の常時 GPU 負荷は無くなったので、GPU を使うとしても TTS 生成時のみ・間欠**。
>
> ⚠️ **生成時間**: 20分音声を Applio（または edge-tts）で作る所要時間を Phase 0 で実測。毎朝のスロットに収まらないと運用が破綻する。
>
> ⚠️ **ライセンス/モデル**: Applio の利用条件と、使用する RVC ボイスモデルの権利・配布条件を確認（自分用の声か、配布可能なモデルか）。

### 4-6. 記憶レイヤー (Memory) ★v2新規

エピソード横断記憶。Huxe 実物の「さっき夕方にも一緒にニュース見たばかり」「あの AIファーストのクリックアップの話、頭の片隅に残りながら…」のような **過去言及** を再現する。

| 要素 | 推奨 |
|------|------|
| ストレージ | SQLite or PostgreSQL（軽量から始める） |
| 保存内容 | エピソード日時 / トピック / 選定理由 / DeepCast テーマ / 要約 / ユーザー反応 |
| 使い方 | 直近N件のサマリーを次回台本生成のコンテキストに渡す |
| 反応の取得 | 配信レイヤーの最小 Web UI（more/less ボタン）から |

### 4-7. 配信レイヤー

| 要素 | 推奨 |
|------|------|
| Podcast RSS 生成 | 自作スクリプト（RSS 2.0 + iTunes 拡張タグ）or 既存OSS |
| 配信単位 | Daily Brief と DeepCast は別 RSS アイテムとして配信（別タイミング再生可、連結は任意） |
| 音声ホスティング | ローカル静的配信 → 将来 MinIO / OCI Object Storage |
| 外部アクセス | mesh (Tailscale/NetBird) 経由を基本、必要なら公開 |
| 最小 Web UI | React + TypeScript + Vite (既存スタック) |
| UI の役割 | エピソード再生 + more/less ボタン（フィードバック収集） |

### 4-8. 話者構成（ロスター）と配信単位 ★v3.1

**最小構成は2話者・単発・分離配信。ロスター/タイプ別アサインは Phase 3、複数DeepCastは Phase 2.5 以降。**

#### A. 話者ロスター（Phase 3）

| フィールド | 内容 |
|-----------|------|
| id | 話者識別子（例: `anchor_default`） |
| applio_model | 使用する Applio/RVC モデルパス |
| 表示名 | UI・ログ用の名前 |
| デフォルトロール | `Anchor` or `Co-host` |

- 最小構成: ロスター2件（Anchor 用・Co-host 用）、固定アサイン
- 設定（ConfigMap）でロスターを増やし、episode_type 別にアサインを変更できる構造だけ用意（over-engineer しない）
- 台本生成は `role`（Anchor/Co-host）で書き、TTS 段で episode_type のアサインを使って実 Applio モデルに解決（疎結合）

**episode_type 別アサイン例**（ConfigMap）:

| episode_type | role | speaker_id |
|-------------|------|-----------|
| daily_brief | Anchor | anchor_default |
| daily_brief | Co-host | cohost_default |
| deepcast | Anchor | anchor_default |
| deepcast | Co-host | cohost_default |

#### B. 配信単位（Phase 1/2 から既定）

- Daily Brief と DeepCast は**別音声ファイル・別 RSS アイテム**として配信
- ユーザーは Brief を朝、DeepCast を後でと**別タイミングで再生**できる
- 同日付・相互リンクで関連付けつつ独立アイテム
- 連結（続けて1本）は任意の付加機能。既定は分離

#### C. 複数 DeepCast（Phase 2.5 以降）

- 1日 N 本の DeepCast（既定 N=1）
- N は設定 + 無料枠予算（neuron/req・レート・生成時間）で上限を決める
- N>1 はキュレーション成熟後（Phase 2.5 以降）。各 DeepCast は独立アイテム
- 最小構成は N=1

---

## 5. 段階導入プラン（フェーズ番号は task list v3 に準拠）

推論はクラウド一本化のため「モード」列は廃止。Phase 3 は CPU フォールバックではなく **TTS 音声品質の強化（Applio 導入）** に付け替え。

| Phase | 内容 |
|-------|------|
| **0** | PoC: クラウド LLM で連続構成1本を生成（台本品質は briefcast で検証済み）+ **Applio の要件検証**（CPU/GPU・生成時間・品質）+ 読み上げ精度確認 |
| **1** | DeepCast（単発生成）+ RSS 配信 + k3s デプロイ（generator は router 経由でクラウド LLM） |
| **2** | Briefing + Transition + DeepCast 連続構成、エピソード横断記憶、毎朝 CronJob |
| **2.5** | Personalized Feed（キュレーション + 選定理由言語化 + フィードバック導線）。複数DeepCast（上位N件、既定N=1） |
| **3** | 音声品質強化: Applio 導入（Phase 0 検証で GO の場合）。Anchor/Co-host の別ボイス、前処理連携。**話者ロスター定義/タイプ別アサイン設定** |
| **3.5** | 運用整備（監視、Secret、バックアップ、辞書メンテ、失敗通知=Discord） |
| **4** | Join 機能（リアルタイム音声割り込み）。優先度低 |

タスクの具体的な分解は `huxe-homelab-tasks.md` を参照。

---

## 6. コンテナ構成案（イメージ）

```yaml
# docker-compose.yml — 概念図、動作確認済みではない
# 本番は k3s manifest として展開。推論はクラウドルーター(Gemini/CF)へ egress
services:
  ingest:        # OAuth tokens を Secret で受ける
    image: huxe-ingest:local

  curation:      # Personalized Feed の核心
    image: huxe-curation:local
    depends_on: [vectordb]

  vectordb:      # pgvector / Qdrant など
    image: vectordb:local

  memory:        # エピソード横断記憶
    image: huxe-memory:local

  generator:     # 推論バックエンドを env で差し替え可能
    image: huxe-generator:local
    environment:
      LLM_ENDPOINT: ${LLM_ENDPOINT}   # クラウドルーター (Cloudflare AI Gateway → Gemini/CF)
      LLM_API_KEY:  ${LLM_API_KEY}    # SealedSecret 由来
      TTS_ENDPOINT: ${TTS_ENDPOINT}   # edge-tts（既定）or Applio（検証後）
    depends_on: [ingest, curation, memory]

  feed:          # RSS + 静的音声配信
    image: huxe-feed:local

  webui:         # 最小UI、more/less ボタン
    image: huxe-webui:local
    depends_on: [feed, memory]
```

> ⚠️ ARM64 ビルド、ネットワーク（egress でクラウド LLM へ到達）、Secret 配線は実装時に検証。CPU/GPU フォールバックのコンテナ（llm-cpu / tts-cpu）は v3 で廃止。

---

## 7. v1 から割り切りを変えた点

| v1 で書いた割り切り | v2 での扱い |
|---------------------|------------|
| 「データを保存しない設計が強み」 | 訂正: 過去言及の演出に履歴保存が必要。Phase 2-D で memory レイヤーを設けた。代わりにアクセス制御（mesh限定 / Basic認証）とスコープ最小化（OAuth readonly）でプライバシーを担保 |
| 「ポッドキャスト RSS で完結、Web UI は後付け」 | 訂正: フィードバック収集のため最小 Web UI が Phase 2.5 で必須に |
| 「Daily Briefing と DeepCast は別エピソード」 | 訂正: 1本のエピソードに連続構成。Phase 2 で結合 |
| 「Personalized Feed は Daily Briefing の派生」 | 訂正: DeepCast テーマ選定とその理由言語化が本体。独立レイヤーに |
| 「Interactive Join は Phase 4 で後回し」 | 維持。さらに優先度が下がった（連続構成で体験の大部分が再現できるため） |

### v3 での方針転換（推論クラウド化）
| v2 の前提 | v3 での扱い |
|-----------|------------|
| 推論は自宅GPU（RTX5070）が主、OCI-CPU が fallback | 廃止。**クラウド一本化**（主=Gemini / fallback=Cloudflare Workers AI）。有料プラン不使用・GPU 常時運用なし |
| LLM = ローカル Qwen3.5-9B（llama.cpp） | クラウド LLM を OpenAI 互換ルーター（Cloudflare AI Gateway→将来 LiteLLM）経由で |
| TTS = Style-Bert-VITS2 / VOICEVOX | **Applio (RVC)** を採用予定（GPU 要件は Phase 0 で検証）。確定まで edge-tts |
| 失敗通知 = ntfy | **ntfy 廃止**。既存の **Discord webhook**（Uptime Kuma と共用）に置換 |

### v3.1 での追加（話者・配信単位）
| v2/v3 の前提 | v3.1 での扱い |
|-----------|------------|
| 「1エピソード=1音声ファイルに結合」（v2 で別エピソード→連続構成に訂正） | **再分離**: 配信は Brief / DeepCast を別アイテムに（別タイミング再生可）。連結した1本は任意。連続性は相互リンク・トランジション予告で担保 |
| 話者は固定2 | 既定2のまま。Applio **ロスター**でメンバー交代・エピソードタイプ別アサイン可（Phase 3） |
| DeepCast は1日1本 | 1日 **N 本**（既定 N=1、無料枠予算で上限）。複数化は Phase 2.5 以降 |

---

## 8. 次のアクション

1. **Phase 0 PoC**:
   - 台本生成: クラウド LLM（Gemini 主 / CF fallback）で連続構成1本を生成。台本品質は briefcast の A/B で検証済み（Gemini / Gemma-4 / GLM-4.7-flash）
   - **Applio 要件検証**: CPU/GPU 要件・20分音声の生成時間・日本語品質を実測し、edge-tts ベースラインと比較
   - 検証点: 自然さ / 2話者の対話感 / 数値・固有名詞の正確さ / トランジションの自然さ / 生成時間
2. **要確認事項のクリア**:
   - Gmail/Calendar API の OAuth 公開ステータスと token 失効挙動
   - Applio の利用条件と RVC ボイスモデルの権利・2話者分の声の確保
   - LLM ルーター（Cloudflare AI Gateway）の構築（既定=Gemini、fallback=CF）
3. Phase 1 (DeepCast) から実装着手。タスクリスト v3 の `[ ]` を1つずつ Claude Code に渡す

---

*この設計書は方針レベル。具体的なコマンド・設定値は各フェーズの実装時に、公式ドキュメントと実機検証に基づいて確定させる前提。タスク分解は `huxe-homelab-tasks.md` を参照。*
