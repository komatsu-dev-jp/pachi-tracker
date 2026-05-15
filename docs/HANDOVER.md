# HANDOVER.md — Pachi Tracker 引き継ぎドキュメント

最終更新: 2026-05-15

---

## 1. プロジェクト概要

パチンコ店内で稼働中に使うセッション記録・期待値計算アプリ。
片手操作・騒音環境・時間的プレッシャーの中で使うことを前提とした設計。

- **技術スタック**: React (JSX), Vite, localStorage / IndexedDB (Dexie) 永続化
- **UIポリシー**: ダークテーマ、高コントラスト、最小タップ領域 44px 以上
- **言語**: UIラベルはすべて日本語

---

## 2. アーキテクチャ概要

### 2-1. ファイル構成（主要）

```
src/
  logic.js                      # 計算ロジック心臓部（純粋関数群）
  App.jsx                       # 状態一元管理（useState / useLS）
  machineDB.js                  # 機種マスタ（displayToReal フィールド含む）
  persistence.js                # IndexedDB(Dexie) バック memCache
  db.js                         # Dexie DB 定義
  snapshot.js                   # セッション復元保証
  components/
    Atoms.jsx                   # 共通UIパーツ
    Tabs.jsx                    # タブナビゲーション（メイン処理ほぼここ）
    decision/
      evDecision.js             # 判断ロジック（純粋関数）
      DecisionTab.jsx           # 判断ファーストUI コンテナ
      VerdictBadge.jsx          # 判断バッジ
      ConfidenceBar.jsx         # 信頼度バー
      KeyMetrics.jsx            # 主要指標カード
      ReasonList.jsx            # 判断根拠リスト
      __tests__/
        evDecision.test.mjs     # 判断ロジックテスト
  __tests__/
    protected-fns.mjs           # 保護関数境界値ハーネス
    baseline.json               # 完全一致テスト基準値
docs/
  HANDOVER.md                   # 本ファイル
  decision-ui-design.md         # 判断ファーストUI 設計書
```

### 2-2. 状態管理

`App.jsx` の `useState` / `useLS` で状態を一元管理。

- `useLS(key, init)` = IndexedDB バックの永続化 hook（API シグネチャ不変）
- `rotRows` が回転数の唯一の真実源（SSoT）
- 主要な状態:
  - `rotRows` / `startRot` — 回転入力データ
  - `jpLog` — 大当たり記録（v3チェーン構造）
  - `rentBalls` / `exRate` / `synthDenom` / `rotPerHour` / `border` — 設定
  - `spec1R` / `specAvgRounds` / `specSapo` — 機種スペック
  - `totalTrayBalls` — 上皿玉補正用

### 2-3. 計算精度問題①：ラベルとウィザード順序（✅ 解決済み）

- 連チャンウィザードの Step 順序を入れ替え・ラベルを変更（PR #147）
- 対応コミット: `595c606`

### 2-4. 計算精度問題②：上皿補正（✅ 全ステップ完了）

上皿玉（大当たり後に手元に残った玉）を投資玉数から差し引き、
「真の消費 K 数」を算出する 3 ステップの実装。

| ステップ | 状態 | 内容 | コミット |
|---------|------|------|---------|
| Step 1 | ✅ | `calcPreciseEV` に `correctedKCount` / `start1KCorrected` 追加 | `83ec37c`（PR #148） |
| Step 2a | ✅ | 補正後 EV/K・ボーダー差を `calcPreciseEV` に追加 | `c4d5d1e`（PR #152） |
| Step 2b | ✅ | `evDecision.js` の判断ロジックを補正後の値に切り替え | `a555cff`（PR #153） |
| Step 3 | ✅ | 判断タブで「補正後 EV/K」と「生 EV/K」を両方表示 | `69c8635`（PR #154） |

### 2-5. 大当たり後フロー再設計（サブステップ1〜3完了、4以降保留）

#### 概要

実機での使用感から、毎当たりの実測入力をやめ、
**チェーン単位の実測 + サポ回転だけ個別記録する方針**へ移行中。

#### 設計方針

| タイミング | 入力内容 |
|-----------|---------|
| 1連目 | 上皿玉のみ実測入力（既存通り） |
| 各当たり | ラウンド数・液晶出玉・サポ回転のみ入力 |
| ラッシュ終了時 | 最終実測持ち玉を1回だけ入力（サブステップ3で追加） |

#### 3層管理

| 層 | 役割 |
|----|------|
| 液晶出玉 | 参考値・演出記録用 |
| 最終実測持ち玉 | 収支・実態評価用 |
| サポ回転数 | 効率確認用 |

#### サブステップ進行状況

| # | 状態 | 内容 |
|---|------|------|
| 1 | ✅ 完了 | `machineDB.js` に `displayToReal: null` を全19機種に追加<br>ブランチ: `claude/jackpot-flow-substep1-KYCUw`（PR #156 マージ済み） |
| 2 | ✅ 完了 | chain オブジェクトに `finalRealBalls: undefined` を追加<br>ブランチ: `claude/jackpot-flow-substep2-nd2XC`（PR #158 マージ済み） |
| 3 | ✅ 完了 | ラッシュ終了ウィザードに「最終実測持ち玉」入力 Step を追加<br>`chain.finalRealBalls` と `chain.finalRealBallsEdited` に保存<br>計算値を初期値として表示、ユーザー編集可能<br>ブランチ: `claude/jackpot-flow-substep3-LPtw0`（PR #159 マージ済み） |
| 4 | ⏸️ 保留 | `calcPreciseEV` の `totalNetGain` 集計に分岐追加（実測 vs 液晶）<br>優先タスクが完了してから再開 |
| 5 | ⏸️ 保留 | `baseline.json` 再生成（サブステップ4完了後に実施） |
| 6〜8 | ⏸️ 保留 | 詳細は調査レポート参照 |

#### 関連ドキュメント

- 調査レポート: ブランチ `claude/investigate-jackpot-flow-IXTu2` 内
- 影響ファイル一覧: 調査レポート末尾「参照ファイル・行番号サマリー」を参照

### 2-6. 完了した追加機能

#### プッシュ補正Step（✅ PR #161 マージ済み）

- 初当たりウィザードの最初に「直近のプッシュ額」選択 Step を追加
- 選択肢：[+0円] [+500円] [+1,000円]
- 選択額が `rotRows` に新 `data` 行として追加される（自動投資カウントのズレを補正）
- ブランチ: `claude/push-amount-correction-mJyAc`

#### 現金カード 0円表示バグ修正（✅ PR #160 マージ済み）

- **問題**: 現金カードが常に 0円 を表示していた（`S.investYen` は更新されない手動状態）
- **修正**: `Tabs.jsx:L1887` を `ev.rawInvest` に変更（`rotRows` から自動計算）
- ブランチ: `claude/fix-cash-card-zero-DxY3p`

#### 初当たり回転数の必須化（✅ PR #162 マージ済み）

- **問題**: 回転数入力欄が空でも「記録する」ボタンを押せ、`netRot` が更新されなかった
- **修正**: `handleStartChain`（Tabs.jsx:L1144〜）で入力バリデーションを追加
  - 空文字 → アラート「総回転数を入力してください。」
  - 0 以下・逆行値 → アラート
  - 有効値のとき `rotRows` に `data` 行 + `hit` 行の両方を追加
- ブランチ: `claude/jackpot-rot-required-LVyT0`

#### 履歴削除バグ修正（✅ PR #155 マージ済み）

- **問題**: 「最新履歴を削除」ボタンが持ち玉・上皿玉を巻き戻していなかった
- **修正**: 長押し削除と同等の処理に統一
- コミット: `ea3a122`

---

## 3. 計算ロジック（logic.js）

### 主要関数

| 関数 | 役割 | 状態 |
|------|------|------|
| `useLS` | 永続化 hook（IndexedDB バック） | 安定 |
| `deriveFromRows` | rotRows から rot / kCount / invest を集計 | 検証済み |
| `calcPreciseEV` | 高精度 EV / 仕事量 / ボーダー算出 | 上皿補正追加済み |
| `calcCash` | 旧互換 現金計算（RotTab統計パネル用） | 安定 |
| `calcMochi` | 旧互換 持ち玉計算 | 安定 |

### calcPreciseEV の主要出力（現在）

| プロパティ名 | 意味 | 用途 |
|---|---|---|
| `start1K` | 生の 1K スタート（rotRows ベース） | UI 表示用（サブ） |
| `start1KCorrected` | 補正後の 1K スタート | UI 表示用（メイン） |
| `ev1K` | 生の EV/K | UI 表示用（サブ） |
| `ev1KCorrected` | 補正後の EV/K | 判断ロジック・UI 表示用（メイン） |
| `bDiff` | 生のボーダー差 | UI 表示用（サブ） |
| `bDiffCorrected` | 補正後のボーダー差 | 判断ロジック・UI 表示用（メイン） |
| `correctedKCount` | 上皿補正後の K 数 | 計算の中間値 |
| `rawInvest` | 実際の投資額（rotRows から計算） | 現金カード表示（PR #160 で修正済み） |
| `workAmount` | 仕事量 | 統計表示 |
| `wage` | 時給換算 | 統計表示 |

### 計算式（P tools 互換）

```
EV/K = (1Kスタート / synthDenom) × 機種純増出玉円 - 1000
単価  = EV/K ÷ 1Kスタート
仕事量 = 単価 × 総通常回転数
```

---

## 4. 判断ファーストUI（decision/）

PR #144〜#146 で実装完了。上皿補正 Step 2b（PR #153）で補正後の値を使用するよう更新済み。

### コンポーネント構成

- `evDecision.js` — 純粋関数。`calcPreciseEV` の戻り値を受け取り verdict を返す
  - verdict: `continue_strong` | `continue` | `hold` | `stop`
  - **判断には `ev1KCorrected` / `bDiffCorrected`（補正後の値）を使用**
- `DecisionTab.jsx` — タブコンテナ
- `VerdictBadge.jsx` — 判断バッジ（大きく表示）
- `ConfidenceBar.jsx` — 信頼度バー（回転数 / JP 数ベース）
- `KeyMetrics.jsx` — EV/K・ボーダー差・1Kスタート等の主要指標
- `ReasonList.jsx` — 判断根拠のリスト表示

### evDecision の判断ロジック

```js
if (evAdj > 300 && conf.total > 0.5 && bDiff > 2.0) → "continue_strong"
if (evAdj > 100 && conf.total > 0.4 && bDiff > 0.5)  → "continue"
if (evAdj >= -50 && evAdj <= 100 && conf.total > 0.3) → "hold"
if (evAdj < -50 || bDiff < -1.0)                      → "stop"
```

---

## 5. 直近のタスク

### 完了済み（直近）

- ✅ 計算精度問題①（ラベルとウィザード順序）解決（PR #147）
- ✅ 判断ファーストUI 実装（PR #144〜#146）
- ✅ 上皿補正 Step 1〜3（PR #148〜#154）
- ✅ protected-fns.mjs 修復（PR #149）
- ✅ baseline.json 再生成（PR #150）
- ✅ 履歴削除バグ修正（PR #155）
- ✅ 大当たり後フロー サブステップ1（PR #156）
- ✅ 大当たり後フロー サブステップ2（PR #158）
- ✅ 大当たり後フロー サブステップ3（PR #159）
- ✅ 現金カード 0円表示バグ修正（PR #160）
- ✅ プッシュ補正Step 追加（PR #161）
- ✅ 初当たり回転数必須化（PR #162）

---

## 6. 現在の未解決バグ・保留タスク

### 保留タスク1：上皿補正の過大増幅問題（調査済み、保留）

**問題**: 大当たり直後（持ち玉 DATA 行ゼロの瞬間）に補正効果が最大化される。

例: 上皿100玉で EV/K が +197 → +497 に約2.5倍増幅する。

**調査済み事実**:
- `logic.js:128-147` の上皿補正計算自体は数学的に正しい
- 持ち玉 DATA 行が増えると自然に薄まる（一時的な問題）
- 根本解決には `logic.js` の変更が必要 → `baseline.json` 再生成が必要

**修正候補（未確定）**:
- 案A: 持ち玉モード中は補正をスキップ
- 案C（推奨）: 補正を現金K分のみに限定（業務的に最も正確）

**対応方針**: 他タスクが落ち着いたら改めて判断。

### 保留タスク2：大当たり後フロー サブステップ4以降

**サブステップ4**: `calcPreciseEV` の `totalNetGain` 集計に分岐追加
- `chain.finalRealBalls !== undefined` → 実測ベース計算
- フォールバック → 旧データは液晶ベース（後方互換）

**サブステップ5〜8**: 調査レポート参照（ブランチ: `claude/investigate-jackpot-flow-IXTu2`）

---

## 7. テスト基盤と保護対象（厳守）

### protected-fns.mjs（保護関数ハーネス）

- **場所**: `src/__tests__/protected-fns.mjs`
- **仕組み**: `logic.js` のソースを読み込み、`"SHARED CALC HELPERS"` マーカーから後ろを抽出して `Function()` で実行
- **重要**: `"SHARED CALC HELPERS"` コメントを削除・変更するとテストが壊れる

```bash
node src/__tests__/protected-fns.mjs
```

出力が `baseline.json` と完全一致すれば OK。

### baseline.json（完全一致テスト）

- **場所**: `src/__tests__/baseline.json`
- **ルール**:
  - 既存値が **1 つでも変わると即 fail**
  - 新プロパティ追加のみは OK
- **最終更新**: PR #150（Step 1 の `correctedKCount` / `start1KCorrected` 追加に伴い再生成）

### evDecision.test.mjs（判断ロジックテスト）

```bash
node src/components/decision/__tests__/evDecision.test.mjs
```

### CI 状況

- **CI では実行されていない（手動実行のみ）**
- 変更前後に手動で実行して確認すること

### Codex / Claude Code 作業時の禁止事項

`logic.js` は保護対象。以下を絶対に守ること：

- `"SHARED CALC HELPERS"` コメントマーカーを削除・変更しない
- 純粋関数はマーカー以降に配置（マーカー前は React 依存コード）
- export 形式は `export function 名前()` を維持
- アロー関数（`export const foo = () => {}`）は `protected-fns.mjs` で抽出されないため不可

`baseline.json` は完全一致テスト：

- 既存値が **1 つでも変わると即 fail**
- 新プロパティ追加のみは OK
- 計算ロジック変更時は必ず再生成 + diff 確認

---

## 8. ブランチ運用

### 直近 25 コミット（2026-05-15 時点、origin/main）

```
4c1dc4d Merge pull request #162 from komatsu-dev-jp/claude/jackpot-rot-required-LVyT0
ea4a58f fix(rot): 初当たり時の回転数入力を必須化、netRot に正しく反映
10ae5c9 Merge pull request #161 from komatsu-dev-jp/claude/push-amount-correction-mJyAc
56f2852 feat(ui): 初当たりウィザードに直近のプッシュ額補正Stepを追加
b0718df Merge pull request #160 from komatsu-dev-jp/claude/fix-cash-card-zero-DxY3p
e3fb771 fix(ui): 現金カードに rotRows から計算した正しい投資額を表示
9df0fa2 Merge pull request #159 from komatsu-dev-jp/claude/jackpot-flow-substep3-LPtw0
f888737 feat(ui): ラッシュ終了時に最終実測持ち玉入力Stepを追加 (サブステップ3)
2b3ce2a Merge pull request #158 from komatsu-dev-jp/claude/jackpot-flow-substep2-nd2XC
e38e16f feat(chain): chain オブジェクトに finalRealBalls フィールドを追加 (サブステップ2)
b944e50 Merge pull request #157 from komatsu-dev-jp/claude/update-handover-jackpot-flow-KWvVk
a4e2356 docs: HANDOVER.md を更新（大当たり後フロー再設計・上皿補正完了・Codex引き継ぎ）
374e722 Merge pull request #156 from komatsu-dev-jp/claude/jackpot-flow-substep1-KYCUw
0f32101 feat(machineDB): displayToReal フィールドを全機種に追加 (サブステップ1)
8d95c63 Merge pull request #155 from komatsu-dev-jp/claude/fix-history-delete-balls-Xp0et
ea3a122 fix(history): 最新履歴削除で持ち玉と上皿玉を巻き戻す
dd13f5f Merge pull request #154 from komatsu-dev-jp/claude/upper-tray-step3-TJW9O
69c8635 feat(ui): 判断タブで補正後と生の値を両方表示 (Step 3)
696f35f Merge pull request #153 from komatsu-dev-jp/claude/upper-tray-step2b-AarQL
a555cff feat(decision): 判断ロジックを補正後の値に切り替え (Step 2b)
c111bb6 Merge pull request #152 from komatsu-dev-jp/claude/upper-tray-step2a-h1kOF
c4d5d1e feat(logic): 補正後の EV/K とボーダー差を追加 (Step 2a)
3950690 Merge pull request #151 from komatsu-dev-jp/claude/update-handover-docs-qJ2T8
ae324b7 docs: HANDOVER.md を新規作成（上皿補正Step1完了・テスト基盤・直近コミット反映）
97c53a4 Merge pull request #150 from komatsu-dev-jp/claude/regenerate-baseline-b8IDS
```

### ブランチ命名規則

```
claude/<説明>-<ランダム4文字>
codex/<説明>-<ランダム4文字>
```

---

## 9. 注意点・Tips

### logic.js の変更ルール

- `deriveFromRows`, `calcCash`, `calcMochi`, `calcPreciseEV` は**検証済み保護関数**
- 変更する場合は、変更前後の計算結果を境界値（0, 極端に大きい値, 負数）で比較して提示すること
- **`"SHARED CALC HELPERS"` コメントは絶対に削除・変更しないこと**
  - `protected-fns.mjs` がこのマーカーを目印に純粋関数を抽出している
- **logic.js に新しい純粋関数を追加する場合は、`SHARED CALC HELPERS` マーカーより後ろに配置すること**
- **logic.js の export 形式は `export function 名前()` を維持すること**
  - アロー関数（`export const foo = () => {}`）は `protected-fns.mjs` で抽出されない

### rotRows の扱い

- `rotRows` が回転数の唯一の真実源（SSoT）
- `rotRows` を迂回するデータフローを作らない

### 現金・持ち玉の計算パス分離

- `calcCash`（現金）と `calcMochi`（持ち玉）の計算パスは明確に分離されている
- `calcPreciseEV` は `blendedInvest` で統合しているが、内部では `cashKCount` / `mochiKCount` / `chodamaKCount` を分離して追跡

### IndexedDB 永続化

- `useLS` の API シグネチャ (`[val, set] = useLS(key, init)`) は不変
- 内部で IndexedDB(Dexie) バックの memCache に書き込む

### ビルド検証（必須）

```bash
npm run lint
npm run build
```

ファイルを変更したら必ず両方がエラーゼロで通ることを確認してからコミット。

---

## 10. Codex への引き継ぎ事項

### 必読ドキュメント

1. `CLAUDE.md` — プロジェクト全体ルール（ルート直下）
2. `docs/HANDOVER.md` — 本ドキュメント
3. 大当たり後フロー調査レポート — ブランチ `claude/investigate-jackpot-flow-IXTu2` 内

### 作業開始前の確認コマンド

```bash
git fetch origin
git log --oneline -10

# サブステップ2: chain に finalRealBalls が追加されているか
grep -n "finalRealBalls" src/components/Tabs.jsx
# → L1189 付近に finalRealBalls: undefined があれば サブステップ2 完了済み

# サブステップ3: ラッシュ終了ウィザードに入力Stepがあるか
grep -n "finalRealBallsEdited" src/components/Tabs.jsx
# → あればサブステップ3 完了済み

# 初当たり回転数必須化: バリデーションが入っているか
grep -n "inputTrimmed" src/components/Tabs.jsx
# → L1144 付近にあれば完了済み

# 現金カードバグ: rawInvest を使っているか
grep -n "ev.rawInvest" src/components/Tabs.jsx
# → L1887 付近にあれば完了済み（S.investYen のままなら未修正）
```

### 直近の状態サマリー

- main ブランチ最新コミット: `4c1dc4d`（PR #162、初当たり回転数必須化）
- 上皿補正: Step 1〜3 すべて完了・マージ済み
- 大当たり後フロー: サブステップ1〜3 完了、**サブステップ4以降は保留**
- 現金カードバグ: 修正済み（PR #160）
- 初当たり回転数必須化: 完了（PR #162）
- プッシュ補正Step: 完了（PR #161）

### 次にやること

**保留タスク2（サブステップ4）が最優先**:
`calcPreciseEV` の `totalNetGain` 集計に `finalRealBalls` の分岐を追加する。
`chain.finalRealBalls !== undefined` のとき実測ベース計算、フォールバックは液晶ベース。

実装後は必ず:
1. `node src/__tests__/protected-fns.mjs` を実行してスナップショットと比較
2. `logic.js` を変更した場合は `baseline.json` の再生成が必要（サブステップ5）
3. `npm run lint && npm run build` がエラーゼロ
