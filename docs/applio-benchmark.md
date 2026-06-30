# Applio (RVC) 要件検証ベンチ — Phase 0

> **目的**: Applio を TTS に採用するか、採用時の実行場所（RTX5070 で TTS 時のみ / CPU / 不採用で edge-tts 据え置き）を**実測**で判断する。
> **前提（v3.1）**: 推論 LLM はクラウド一本化済み。TTS だけが GPU 要件の論点。GPU を使うとしても **TTS 生成時のみ・間欠**。
> **ベースライン**: edge-tts（`ja-JP-*Neural`、CPU・無料）。Applio はこれを上回って初めて採用価値がある。
> **使い方**: 各項目を実機で埋める。最後の「判断ゲート」で GO / 条件付き / NO-GO を決める。

---

## 0. 計測環境（記入）

| 項目 | 値 |
|------|----|
| マシン | （例: Windows + RTX 5070 12GB / WSL2 Arch） |
| Applio バージョン | |
| 推論デバイス | CPU / CUDA |
| RVC ボイスモデル | Anchor 用 / Co-host 用（出所・ライセンス） |
| ベース TTS（RVC 入力元） | edge-tts / その他（Applio の TTS+RVC パイプライン構成をメモ） |

---

## 実行サンプル（CLI / 非対話）

> 現行版 Applio（IAHispano/Applio）の `core.py tts` は「text → edge-tts（ベース音声）→ RVC 変換」を1コマンドで行う。声の個性は RVC モデル（`--pth_path`）由来、プロソディは edge-tts（`--tts_voice`）由来。
> ⚠️ GPU/CPU 切替フラグは無い → `CUDA_VISIBLE_DEVICES` で制御（空=CPU、既定=GPU）。引数名は版で違うので `python core.py tts --help` で必ず確認。

```bash
APPLIO=~/Applio
ANCHOR_PTH=$APPLIO/logs/Anchor/Anchor.pth   # 自分の RVC モデルに合わせる
ANCHOR_IDX=$APPLIO/logs/Anchor/Anchor.index
VOICE=ja-JP-NanamiNeural                     # ベース TTS（edge-tts ロケール）
RATE=0                                        # 読み上げ速度 -100..100（速くするなら +10 等。本番で使う値に）
TEXT="おはようございます。今日はRust 1.90のリリースと、TSMCの投資ニュースをお届けします。再ビルド時間は49パーセント短縮、大規模プロジェクトの開発効率に直結する重要な改善です。"
OUT=/tmp/bench; mkdir -p $OUT
cd $APPLIO && source .venv/bin/activate       # 環境の有効化は導入方法に合わせる

# GPU（別シェルで `nvidia-smi -l 1` で VRAM 監視）
/usr/bin/time -v python core.py tts --tts_text "$TEXT" --tts_voice $VOICE \
  --pth_path "$ANCHOR_PTH" --index_path "$ANCHOR_IDX" \
  --output_tts_path $OUT/base.wav --output_rvc_path $OUT/anchor_gpu.wav \
  --tts_rate $RATE --f0_method rmvpe --export_format WAV

# CPU（GPU 無効化）
CUDA_VISIBLE_DEVICES="" /usr/bin/time -v python core.py tts --tts_text "$TEXT" --tts_voice $VOICE \
  --pth_path "$ANCHOR_PTH" --index_path "$ANCHOR_IDX" \
  --output_tts_path $OUT/base.wav --output_rvc_path $OUT/anchor_cpu.wav \
  --tts_rate $RATE --f0_method rmvpe --export_format WAV

# edge-tts ベースライン（RVC 無し・CPU）。edge-tts の速度は +N%/-N% 形式なので $RATE に合わせる
/usr/bin/time -v edge-tts --voice $VOICE --rate "+0%" --text "$TEXT" --write-media $OUT/edge.mp3

# 音声長と RTF（RTF = 実時間 ÷ 音声長、小さいほど速い）
for f in $OUT/anchor_gpu.wav $OUT/anchor_cpu.wav $OUT/edge.mp3; do
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  echo "$f : ${dur}s"
done

# Co-host 用 RVC モデル（別 .pth）でも同様に流し、声の差別化を確認
```

> 計測: `/usr/bin/time -v` の "Elapsed (wall clock) time" が実時間、VRAM は `nvidia-smi`。20分音声は (実時間 ÷ 音声長) × 1200秒 で外挿し、下表に記入。
> 前処理の効果確認: 同じ文を `backend/text_preprocess.preprocess()` に通した版でも生成し、数値・固有名詞の読みを比較。

---

## 1. セットアップ可否

- [ ] Applio をインストール・起動できた（手順・ハマりどころを記録）
- [ ] 日本語のサンプル音声を1本生成できた
- [ ] Anchor 用 / Co-host 用で**別ボイスモデル**を読み込み、声質が明確に違うことを確認
- [ ] RVC ボイスモデルの**権利・配布条件**を確認（自分用の声か、配布可能か）。Applio 自体の利用条件も確認

メモ:

---

## 2. 動作デバイスと速度（肝）

同一の短いサンプル台本（例: 30秒ぶん）で計測。**RTF = 生成時間 ÷ 音声長**（小さいほど速い）。

| 構成 | 動作 | VRAM | 生成時間 / 音声長 | RTF | 20分音声の推定生成時間 |
|------|------|------|------------------|-----|----------------------|
| Applio + GPU (RTX5070) | ○/× | __ GB | __ s / __ s | __ | __ 分 |
| Applio + CPU | ○/× | — | __ s / __ s | __ | __ 分 |
| edge-tts（ベースライン） | ○ | — | __ s / __ s | __ | __ 分 |

判定の目安:
- **20分音声の生成が毎朝のスロットに収まるか**（目安: 数分〜十数分以内。CronJob のタイムボックスを決めておく）。
- CPU で RTF が大きすぎる（例 > 1.0、実時間より遅い）なら CPU 単独は非現実的 → GPU 必須か edge-tts。

---

## 3. 品質評価（edge-tts と並べて主観評価）

同じ台本（数値・固有名詞を含むもの）で Applio と edge-tts を生成し、聴き比べる。

| 評価軸 | Applio | edge-tts | メモ |
|--------|--------|----------|------|
| 自然さ（イントネーション） | __/5 | __/5 | |
| 声の個性 / 2話者の差別化 | __/5 | __/5 | |
| 数値・固有名詞の読み（前処理なし） | __/5 | __/5 | 例: 「4兆9500億ドル」「TSMC」「ドラゴンズ」 |
| 数値・固有名詞の読み（辞書・前処理あり） | __/5 | __/5 | |
| ノイズ・不自然な途切れ | __/5 | __/5 | |
| 聞き疲れしなさ（長尺） | __/5 | __/5 | |

誤読パターンは `docs/tts-pronunciation-issues.md` に記録。

---

## 4. 判断ゲート

以下のいずれかを選び、理由を書く。

- [ ] **GO（Applio 採用）**: 品質が edge-tts より明確に上 かつ 20分生成がスロットに収まる かつ GPU 要件が許容（TTS 時のみ・間欠の RTX5070 使用で OK）
- [ ] **条件付き GO**: GPU 必須だが「TTS 生成時のみ RTX5070 を使う（mesh 経由で OCI から TTS リクエスト）」で運用可。失敗時は edge-tts に自動フォールバック
- [ ] **NO-GO（当面 edge-tts 据え置き）**: 品質差が小さい / 生成時間が破綻 / GPU 運用が見合わない。Applio は将来再評価

決定:

理由:

---

## 5. 決定後の反映先

- **チューニング運用（重要）**: 良い設定値は **UI で探索 → その値を CLI フラグに焼き込む**（`index_rate` / `protect` / `f0_method` / `tts_rate` / `clean_strength` 等）。UI は探索用、CLI は再現可能な自動化用。**確定値は generator の TTS 設定（env / ConfigMap）にメモ**して CronJob から再現
- 採用方針 → `huxe-homelab-tasks.md` Phase 3（Applio 導入）/ `self-hosted-huxe-design.md` 4-5・4-8 に反映
- 実行場所（RTX5070 で TTS のみ等）→ Phase 3「Applio の配置方式決定」タスク
- フォールバック（Applio→edge-tts）→ generator の TTS クライアントに実装
- 確定したパラメータ一式（pth/index パス、pitch、index_rate、protect、f0_method、tts_rate 等）を記録:

| パラメータ | Anchor | Co-host |
|-----------|--------|---------|
| pth / index | | |
| pitch | | |
| index_rate | | |
| protect | | |
| f0_method | | |
| tts_rate | | |
| clean_audio / strength | | |
