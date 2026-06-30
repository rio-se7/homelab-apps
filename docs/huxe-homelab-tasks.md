# セルフホスト版 Huxe — homelab 構築タスクリスト (Claude Code 用) [v3.1]

> **前提**: OCI k3s 稼働済み / Tailscale or NetBird メッシュ稼働済み。自宅 WSL2 + RTX 5070 は任意（Applio 検証時のみ候補）。
> **構成**: **クラウド推論一本化**。台本生成 LLM = 主 Gemini 2.5 Flash / fallback Cloudflare Workers AI（OpenAI 互換・ルーター経由）。TTS = Applio（要件検証後）/ それまで edge-tts。有料プラン不使用・GPU 常時運用なし。
> **使い方**: 各タスクを Claude Code に1つずつ渡す想定。`[ ]` を消化していく。
> **注意**: モデル名・APIフラグ・k8s API バージョン等は Claude Code 側で公式ドキュメントを確認させること（このリストは推測値を含む）。
> **v3変更点（最優先）**: 推論をクラウド一本化（ローカル Qwen3.5-9B / OCI-CPU-LLM フォールバックを廃止）。TTS は Applio 採用予定（GPU 要件は Phase 0 で検証、確定まで edge-tts）。失敗通知は ntfy 廃止 → 既存 Discord webhook へ。実装の種は既存 `briefcast`（summarizer は openai_compat 化済み）。
> **v3.1 変更点**: 話者ロスター（交代・タイプ別）、Brief/DeepCast の分離配信（別タイミング再生）、複数 DeepCast（予算次第）を追記。最小構成優先。
> **v2変更点**: 実物 Huxe 音声サンプル（22分48秒）の文字起こし分析を反映。「Briefing → DeepCast 連続構成」「エピソード横断記憶」「2話者の役割分離」「数値・固有名詞前処理」を新規/強化。

---

## 設計の前提（全フェーズ共通）

- **エピソードの体験は Briefing + Transition + DeepCast の連続体験**（Huxe実物の構造）。ただし**配信は Brief と DeepCast を別アイテムに分離**するのが既定（連結した1本は任意。下記「配信単位」参照）
  - 尺の目安: Briefing 8-12分 / DeepCast 10-12分（各々独立アイテム）
  - 「繋がり」は相互リンク・同日付・トランジション台本での予告で演出し、再生は別タイミング可
- **2話者の役割分離**: Anchor（情報提供主体）+ Co-host（相槌・質問・整理役）。プロンプトで明確に分離
- **生成レイヤーは推論バックエンドを抽象化**: LLM/TTS のエンドポイントを環境変数で差し替え可能にし、同一コードで異なるバックエンドに対応（既存 briefcast の openai_compat が先取り）
- **OCI k3s に常駐**: ingest / generator / feed / memory / scheduler
- **推論先**: クラウドルーター（一旦 Cloudflare AI Gateway、将来 LiteLLM）経由で 主=Gemini 2.5 Flash / fallback=Cloudflare Workers AI。**自宅 GPU 推論・OCI CPU 推論は使わない**
- **失敗通知**: 既存の **Discord webhook**（Uptime Kuma と共用）。ntfy は廃止
- **言語規約**: コード内コメント・README は英語、設計メモは日本語
- **話者**: 既定2（Anchor+Co-host）。Applio ロスターでメンバー交代/エピソードタイプ別アサイン可（Phase 3）
- **配信単位**: Daily Brief と DeepCast は別アイテムで配信＝別タイミング再生可（連結は任意）。既定は分離
- **DeepCast 本数**: 1日 N 本（既定 N=1、無料枠予算で上限）。複数化は Phase 2.5 以降
- **段階導入**: 最小構成（2固定話者・単発・分離配信）から段階導入

---

## 実装状況（2026-06-29 時点）

実装母体は既存の `homelab-apps/briefcast`（briefcast を huxe に育てる方針）。

**完了:**
- クラウド LLM 疎通（Gemini 主 / CF fallback、OCI から OpenAI 互換で確認）
- 連続構成の台本生成 PoC: `briefcast/poc/continuous_script.py`
- 台本生成（Brief / DeepCast を別 LLM コールで分割、2話者 anchor/cohost）: `briefcast/backend/script_generator.py`
- テキスト前処理（数値かな化 + アクロニム自動読み + 辞書）: `briefcast/backend/text_preprocess.py`
- RSS feed 雛形（Brief/DeepCast 別アイテム + iTunes タグ）: `briefcast/backend/feed.py`

**進行中 / 未:**
- Applio 要件検証（実機ベンチ、`docs/applio-benchmark.md`）← TTS 採否の判断待ち
- TTS クライアント配線（Applio / edge-tts）、台本→音声→Episode→feed の glue
- FastAPI 化 / k3s デプロイ / 静的音声配信 / ingest（Phase 2 以降）

---

## Phase 0: PoC（インフラ前、最小検証）

> 目的: 「台本生成→音声化」が成立するか、日本語の自然さ、**Applio の要件**を実測で確かめる。
> 場所: 手元（台本生成はクラウド、Applio 検証のみ必要なら WSL2/RTX5070）。k3s には載せない。
> **v3**: 推論はクラウド（Gemini/CF）。GPU/VRAM 実測の主対象は LLM ではなく **Applio (RVC)**。

- [ ] リポジトリ初期化（monorepo or マルチパッケージ構成を決める）。`README.md`, `.gitignore`, ライセンス方針を記載
- [x] **クラウド LLM 疎通**: Gemini（主）/ Cloudflare Workers AI（fallback）の OpenAI 互換エンドポイントで簡単な生成が通ることを確認（briefcast で確認済み・流用可）
- [ ] **Applio セットアップ + 要件検証**: Applio を起動し日本語サンプル音声を1本生成。**CPU/GPU 要件・VRAM・生成速度**を実測し `docs/applio-benchmark.md` に記録。RTX5070 必須か / CPU で許容できるか / 無GPU の edge-tts で十分かを判断
- [ ] **2話者分のボイス確保**: Anchor 用 / Co-host 用で**別ボイスモデル**。声質が明確に違うことを確認。RVC ボイスモデルの権利・配布条件も確認
- [x] **台本生成プロンプトの試作（連続構成版）**: 固定のダミーデータ（メール風 + 予定 + ニュース3本）から「Briefing → Transition → DeepCast」の連続台本を**クラウド LLM**で生成するプロンプトを作る
  - 各セクションの構造を JSON で固定（speaker / text / section タグ）
  - Huxe実物のトランジションを参考: 「今日のブリーフはここまで」→ 引き止め → DeepCast予告 → 選定理由の言語化
  - SYSTEM_PROMPT に「プレーンテキストのみ／本文外を創作しない（反ハルシネーション）」を含める（briefcast で実装済みの方針を流用）
- [ ] **数値・固有名詞の読み上げ精度確認**: 「4兆9500億ドル」「49%」「TSMC」「NASA」「GDP」等を含むサンプル台本で実際に音声生成し、誤読の有無を確認。誤読パターンを `docs/tts-pronunciation-issues.md` に記録
- [ ] 台本 JSON → TTS（Applio or edge-tts）で話者ごとに音声生成 → 音声ファイルに結合するスクリプト（Python）。PoC は1本で評価可、本番は Brief/DeepCast を別アイテム出力
  - トランジション部分に短い無音 or 効果音/音楽を挿入する余地を残す
- [ ] PoC 成果物（生成した mp3 1本、目安20分前後）を手元で再生して品質評価。所感を `docs/phase0-eval.md` に記録
  - 評価軸: 自然さ / 2話者の対話感 / 数値・固有名詞の正確さ / トランジションの自然さ / 全体の聞き疲れしなさ
- [ ] **20分音声の生成時間実測**: Applio（および edge-tts）で20分音声を作るのに何分かかるか。毎朝の生成スロットに間に合うかを判断する材料に
- [ ] **判断**: 品質・（Applio の）GPU 要件・生成時間が許容範囲か。NG なら TTS を edge-tts ベースラインに倒す（有料 TTS は使わない方針）

---

## Phase 1: DeepCast（単発生成）

> 目的: 「トピックを渡す→ポッドキャスト1本生成→RSS配信」を自動化。データ収集レイヤーは不要なので最初に完成させる。
> **v2強化**: 2話者の役割を明確化、数値・固有名詞の前処理を入れる。

### 1-A. 生成サービス（推論抽象化を含む）
- [ ] `generator` サービスの雛形作成（Python/FastAPI 推奨。Rust移行は後で検討）
- [ ] **推論バックエンド抽象化**: `LLM_ENDPOINT` / `LLM_API_KEY` / `TTS_ENDPOINT` を環境変数化。バックエンドを差し替え可能なインターフェース（既存 briefcast の openai_compat を流用）
- [x] LLM クライアント実装（OpenAI 互換 API をルーター経由で叩く。既定=Gemini、fallback=CF）
- [ ] TTS クライアント実装（Applio の API を叩く。確定まで edge-tts）。2話者対応（speakerタグでボイス切替）
- [x] **台本生成プロンプトの本番化**: Anchor / Co-host の役割分離を明示
  - Anchor: 情報を出す主体。事実と数値を担当
  - Co-host: 相槌・確認・素朴な質問・整理。「うん」「なるほど」「え、待って」のような自然な反応マーカー
  - 一方的にならない緩急、4-8話者交代/分の目安
- [x] **テキスト前処理パイプライン**: TTSに渡す前に以下を行う
  - 数値の読み仮名化（「4兆9500億ドル」「49%」「2026年」等）
  - 固有名詞辞書（アクロニムは自動で字名読み。特殊読み・個人/ドメイン語は外部辞書 `BRIEFCAST_DICT_PATH` で投入。public repo には個人語をハードコードしない）
  - 略語の正規化（NBA、NPB、AI 等）
  - ⚠️ ここを雑に作ると音声の信頼性が一気に落ちる。Huxe実物でも誤読が出る箇所
- [ ] エンドポイント: `POST /deepcast {topic, length, style}` → 台本生成 → 前処理 → 音声生成 → 音声ファイルパス返却
- [ ] エラーハンドリング（推論先がダウン時のフォールバック判定の土台）

### 1-B. 配信レイヤー
- [x] `feed` サービス: 生成済み音声を RSS 2.0 (+ iTunes拡張タグ) で配信。新規エピソードを feed に追加するロジック
- [x] **DeepCast を独立した RSS アイテムとして出力**（Brief とは別音声ファイル・別アイテム）。同日付・相互リンクで関連付け
- [ ] 音声ファイルの静的配信（初期はローカル volume、後で MinIO/OCI Object Storage）
- [ ] 標準ポッドキャストアプリ（Pocket Casts 等）で購読できるか実機確認

### 1-C. k3s デプロイ
- [ ] `generator` / `feed` の Dockerfile（multi-stage build, ARM64 対応に注意）
- [ ] k3s マニフェスト作成（Deployment / Service）。`generator` からクラウドルーター（Gemini/CF）へ egress で到達
- [ ] LLM ルーターのエンドポイント/キーを **SealedSecret** で管理（Reloader アノテーション付与）
- [ ] Ingress or NodePort で feed を外部購読可能に（mesh内 or 公開、方針決定）
- [ ] エンドツーエンド確認: トピック投入 → 数分後に feed にエピソードが出る

---

## Phase 2: Daily Briefing + DeepCast 連続構成（定期実行）★Huxe再現の本体

> 目的: Gmail/Calendar/天気/RSS を収集し、毎朝「Briefing → Transition → DeepCast」の1本を自動生成・配信。
> **v2大幅改訂**: 当初は Daily Briefing と DeepCast を別物として設計していたが、Huxe実物は連続構成。
> ここで初めて「Huxe らしさ」が完成する。

### 2-A. データ収集レイヤー
- [ ] `ingest` サービス雛形（Python/FastAPI）
- [ ] **Google OAuth 設定**: Gmail API + Calendar API。OAuth 2.0 フロー実装。refresh token の保管を k8s Secret に
  - ⚠️ 要確認: アプリ公開ステータス（テスト/本番）による token 失効挙動
  - ⚠️ **セキュリティ方針を最初に決める（重要）**: OCI上に Gmail全文アクセス権を常駐させる。token の暗号化保管・スコープ最小化（readonlyスコープ）・万一漏洩時の影響範囲を Phase 2 着手時点で設計
- [ ] Gmail: 直近の重要メール抽出ロジック（フィルタ条件を設定可能に）
- [ ] Calendar: 当日の予定取得
- [ ] 天気: Open-Meteo API（APIキー不要）から自宅地域の予報取得
- [ ] RSS: トピック別 feed 登録 → 新着記事取得（`feedparser`）
- [ ] 収集結果を正規化 JSON で出力するエンドポイント: `GET /briefing-data`

### 2-B. Briefing パート生成
- [ ] `generator` に briefing モード追加
- [ ] **台本構造**（Huxe実物に基づく）:
  1. **パーソナル・オープニング**: 名前呼びかけ + 時間帯への言及 + 前回からの繋がり（後述2-Dで取得）
  2. **アジェンダ先出し**: 「この後触れる予定なのは…」と今日のトピック概要を予告
  3. **ニュース本体**: テーマで束ねる（経済/国際/テック/スポーツ/政治）。時系列ではない
  4. **各ニュースに "So what"**: 「日本企業にとって、開発現場にもじわっと効いてきそう」のような含意・解釈を必ず添える
  5. **具体的な数値・固有名詞を含める**: 抽象論で逃げない（「4兆9500億ドル」「49%」等）
  6. **興味プロファイル直結セグメント**: スポーツ枠は Rio の興味（ドラゴンズ/JPBA/ダーツ等）を直接拾う
- [ ] 台本プロンプトに上記構造を強制（出力 JSON のセクションタグで確認可能に）
- [ ] ⚠️ **ハルシネーション対策**: ニュース要約を音声で流すと、事実と違う内容を自然な声で断言する事故が起きる（テキストと違い音声は検証が効かず流れていく）。プロンプトに「元記事の事実から逸脱しない・推測で補完しない」制約。台本/メタデータに出典URLを保持
- [ ] **Briefing 単独尺**: 8-12分目安。情報量が多い日はトピックを絞る or DeepCast側に回す

### 2-C. トランジション + DeepCast パート生成
- [ ] **トランジション台本**: Briefing 終了から DeepCast への橋渡し
  - 「今日のブリーフはここまで」のような区切り
  - 引き止め: 「そのままぜひこの後も残っててほしい」「水入れてきて、ヘッドホンつけ直して待ってて」のような演出
  - DeepCast予告 + **選定理由の言語化**: 「亮介が好きな J-POP/J ロックラインのルーツ掘りにちょうどいい」のように、興味プロファイルとの紐付けを明示
  - ⚠️ ここがHuxe体験の核心。選定理由が無いと「ただの次のトピック」になり刺さらない
- [ ] **音楽ブレイクの挿入余地**: トランジション後に5-10秒の短い音楽orジングルを入れる仕組み（音源は別途用意 or 無音でも可）
- [ ] **DeepCast パート**: Phase 1 の DeepCast 生成を流用。テーマは Phase 2.5 で選定したものを受け取る
- [ ] **Briefing と DeepCast を「別音声ファイル・別 RSS アイテム」として出力**（別タイミング再生可。連結した1本は任意の付加機能）。相互リンク/同日付で関連付け

### 2-D. エピソード横断記憶（新規・重要）
> Huxe実物の「さっき夕方にも一緒にニュース見たばかり」「あの AIファーストのクリックアップの話、頭の片隅に残りながら仕事してたんじゃないか」のような **過去言及** を再現するための仕組み。当初設計に完全欠落していた。

- [ ] `memory` サービス雛形: エピソードごとに以下を保存
  - エピソード日時、トピック一覧、選定理由、DeepCast テーマ、要約
  - ユーザー反応（聞き切った/スキップ/more 押下、Phase 2.5-D の入力）
- [ ] ストレージ: 軽量DB（SQLite or PostgreSQL）。後で Phase 2.5 のベクトルDBと統合検討
- [ ] **直近Nエピソードのサマリーを次回生成時のコンテキストとして渡す**: 「前回触れたトピックの続報」「先日Rioが関心を示した話題の関連ニュース」を入れられるように
- [ ] オープニング台本に過去言及を1-2回入れる（毎回ではない、自然な範囲で）

### 2-E. スケジューリング（k3s）
- [ ] k8s CronJob 作成: 毎朝指定時刻に `ingest → 2.5キュレーション → generator(briefing+transition+deepcast) → feed` を実行
- [ ] タイムゾーン設定（JST）。CronJob の timezone 指定方法を確認
- [ ] 失敗時の通知（**既存の Discord webhook** を流用。ntfy は廃止）
- [ ] **生成失敗時のフォールバック挙動**: 朝に生成が落ちていた場合、feed に何を出すか決める（前日分を残す / 「本日は生成に失敗しました」の短い音声）。無言で空になると気づけない
- [ ] エンドツーエンド確認: 翌朝、feed に当日エピソード（連続構成）が自動で出る

---

## Phase 2.5: Personalized Feed（興味キュレーション）★Huxe らしさの核心

> 目的: 「興味のある話題から、見落としてた/知らなかったものをホスト側が拾って差し込む」体験を再現。
> **v2変更**: ピックアップ枠の差し込みではなく、**DeepCast のテーマ選定** が本体。Briefing の興味プロファイル直結セグメント（スポーツ枠等）の選定もここで担う。
> 方針: 興味プロファイル=手動シード＋履歴微調整 / キュレーション=embedding で広く拾う→LLM で目利き再ランキングのハイブリッド。
> 進め方: 最初から作り込まず、シンプル構成で回して育てる。チューニング前提。

### 2.5-A. 興味プロファイル管理
- [ ] **手動シード**: 興味トピックを構造化（例: J-Rock, VTuber/VSinger, Chunichi Dragons/NPB, JPBA/ボーリング, ダーツ, k8s, ローカルLLM, Rust 等）。タグ＋自由記述＋重み付け
- [ ] プロファイルの保存先（k8s ConfigMap or 軽量DB）。編集しやすい形式（YAML/JSON）
- [ ] **履歴微調整の土台**: 各エピソード/トピックへの操作（最後まで聞いた/スキップ/more 押下）を Phase 2-D の memory サービスと統合
- [ ] 履歴 → プロファイルへの反映ロジック（聞いた話題の重みを上げる/スキップは下げる）。最初は単純な加減算で十分
- [ ] ⚠️ **コールドスタート対策**: 最初の数日は履歴ゼロで手動シードだけが頼り。ここで刺さらないと使うのをやめ、履歴も溜まらない悪循環。初期シードを厚め・具体的に作り込む（「どういう切り口が好きか」まで記述。例: 「J-Rockはルーツ・系譜・カルチャー史の文脈で深掘りが好き」）

### 2.5-B. 候補収集（広めに集める）
- [ ] **情報ソース拡張**: Phase 2 の RSS に加え、トピック検索・関連記事探索で「まだ知らない候補」を広く集める
  - 候補ソース例: 各トピックの検索API/RSS、はてブ等のキュレーション、関連ニュース
  - ⚠️ **利用規約・レート制限の確認**: RSS は通常OKだが、検索APIや記事本文取得はソースごとに条件が違う。各ソースの ToS を確認
- [ ] 収集した候補記事を正規化（タイトル/要約/URL/取得日時/ソース）して一時保存
- [ ] 重複排除（同一ニュースの別ソース重複をまとめる）

### 2.5-C. キュレーション（embedding + LLM ハイブリッド）★肝
- [ ] **埋め込み生成**: 興味プロファイルと候補記事を embedding 化。クラウド埋め込み API（Gemini / Workers AI BGE 等、GPU不要）を使用
- [ ] **ベクトル類似度検索**: ベクトルDB（pgvector / Qdrant / Chroma 等を比較選定）で「興味に意味的に近い候補」を広めに取得
- [ ] **LLM 再ランキング**: 類似度上位の候補を LLM に渡し、「関連するが目新しい/見落としがちな」ものを選ぶ。"近すぎる=既知" を弾く目利き層
  - プロンプトに「既に知っていそうな定番は避け、関連はするが意外性のあるものを優先」「Rio が好きな切り口（ルーツ・系譜・カルチャー史等）を意識」等の指示
  - ⚠️ 正解が確立していない領域。実際に回してプロンプト/重みをチューニングする前提
- [ ] **DeepCastテーマ選定**: 再ランキング結果から本日のDeepCastテーマを1つ選定。**選定理由の自然言語化** を出力に含める（Phase 2-C のトランジション台本で使う）
  - 例: テーマ=「X JAPAN とビジュアル系の起源」 / 理由=「亮介が好きな J-Rock のルーツ掘り、最近の VTuber ライブ演出にも繋がる」
- [ ] **Briefingスポーツ枠選定**: 興味直結ソース（中日ドラゴンズ公式、JPBA 等）を毎日確実に拾うパス。embedding ではなく明示的なソース指定でOK
- [ ] **DeepCast テーマを上位 N 件選定**（既定 N=1、無料枠予算で上限）。N>1 は各々独立アイテムとして配信。複数化は Phase 2.5 成熟後

### 2.5-D. フィードバック導線（最小UI）
- [ ] **配信方式の補強**: podcast RSS のみだと再生/skip イベントが取れない。最小の Web UI（React/TS/Vite, 既存スタック）を用意し、各エピソードに「もっとこういう話を(more like this)」「興味なし(less)」ボタン
- [ ] 「more」押下 → そのトピック軸を翌日以降のDeepCast候補に強く反映
- [ ] フィードバックが Phase 2-D memory と Phase 2.5-A プロファイルに反映され、翌日のキュレーションが変わることを確認

### 2.5-E. 評価
- [ ] 1〜2週間運用し「刺さる提案が出るか」を主観評価。`docs/curation-eval.md` に所感記録
- [ ] 刺さらない場合の調整軸（ソース追加 / embedding モデル変更 / LLM プロンプト調整 / 重み調整 / シード書き直し）

> **メモ**: 埋め込み・再ランキングともクラウド（無料枠）で回す。無料枠の日次上限に収まるよう候補数を調整する。

---

## Phase 3: 音声品質強化（Applio 導入）

> 目的: 既定の edge-tts から **Applio (RVC)** に上げ、Anchor/Co-host の声の個性と品質を高める。Phase 0 の要件検証で GO の場合に実施。
> **v3注**: 推論はクラウド一本化したので CPU フォールバック（OCI ローカル LLM）は廃止。可用性は Gemini→CF の二段で担保済み。GPU を使うのは Applio の TTS 生成時のみ・間欠。

- [ ] **Applio の配置方式決定**: Phase 0 の実測に基づき、(a) RTX5070 上の Applio に mesh 経由で TTS リクエスト / (b) CPU で許容 / (c) 無GPU の edge-tts 据え置き、のいずれか
- [ ] **TTS_ENDPOINT を Applio に差し替え**（抽象化済みなので env 変更が中心）。2話者の別ボイスモデルを設定
- [ ] 数値・固有名詞の前処理は維持（Applio でも誤読は起きうる）
- [ ] 失敗時は edge-tts に自動フォールバックする経路を用意（声は落ちるが配信は止めない）
- [ ] edge-tts と Applio の品質・所要時間を比較記録 `docs/tts-comparison.md`
- [ ] **ボイスロスター定義**（`speakers`: id / applio_model / 表示名 / デフォルトロール）を ConfigMap 化。最小構成はロスター2件（Anchor 用・Co-host 用）
- [ ] episode_type（daily_brief / deepcast）ごとの role→speaker_id アサインを設定化。メンバー交代・タイプ別メンバーを可能に
- [ ] 台本の role（Anchor/Co-host）を TTS 段でアサイン解決して Applio モデルに割り当て（台本生成と TTS を疎結合に保つ）

---

## Phase 3.5: 運用整備（任意だが推奨）

- [ ] 監視: 既存計画の Prometheus/Grafana/Loki に generator/ingest/feed/memory のメトリクス・ログを流す
- [ ] 音声ストレージを MinIO or OCI Object Storage へ移行（k3s ローカル volume から）
- [ ] Secret 管理の見直し（OAuth token, mesh endpoint, クラウドTTS APIキー）
- [ ] feed の認証（mesh内限定 or Basic認証）でプライバシー確保
- [ ] バックアップ方針（生成済み音声・memory DB・プロファイル）
- [ ] **固有名詞辞書の継続メンテ**: 誤読が見つかったら辞書に追加する運用フロー

---

## Phase 4（任意）: Join 機能 — リアルタイム音声対話

> 目的: 再生中に音声で割り込んで質問。Phase 0-3 安定後に着手。
> **v2注**: Huxe実物の「ちょっとこれ聞いて欲しい」体験は Phase 2-C の連続構成で再現済みのため、Phase 4 の優先度は下がる。実装するなら「DeepCast中に深掘り質問」が最も価値のあるユースケース。

- [ ] STT: whisper.cpp を自宅GPUに配置（低遅延設定）
- [ ] ストリーミング TTS: Applio / 低遅延TTS を検討（Join は数少ない GPU/リアルタイム前提の例外）
- [ ] 低遅延ループ設計: STT → LLM → ストリーミングTTS の往復遅延を計測
- [ ] 通信: WebSocket or WebRTC。クライアント（Web UI or モバイル）の方針決定
- [ ] Web UI（React/TS/Vite, 既存スタック）: 再生 + マイク割り込みボタン
- [ ] リアルタイム低遅延のため GPU 環境を要する（Join は数少ない GPU 前提の例外。クラウド推論一本化の方針外）

---

## Claude Code に渡すときのコツ

- 1タスク = 1セッション目安。`[ ]` を1つコピペして「これをやって」と渡す
- **必ず明示する**: 「モデル名/APIフラグ/k8s APIバージョンは公式ドキュメントを確認してから実装。不確かなら推測せず確認を促すこと」
- 推論抽象化（Phase 1-A）は最重要。ここを丁寧にやると TTS の Applio 差し替え（Phase 3）や LLM 切替が楽
- ARM64 ビルド: OCI A1 は aarch64。Dockerfile の multi-arch / buildx を最初から意識
- **v2追加**: 台本プロンプト（Phase 1-A / 2-B / 2-C）は Huxe 実物の構造をリファレンスに渡すと品質が出やすい。`docs/huxe-reference-transcript.md` として実例の文字起こしを保管しておくと Claude Code が参照できる

---

*このリストは方針・タスク分解レベル。各タスクの具体的なコマンド・設定値は Claude Code が実装時に公式ドキュメントと実機検証で確定させる前提。*
