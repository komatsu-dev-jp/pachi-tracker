# HANDOVER.md — Pachi Tracker 引き継ぎドキュメント

最終更新: 2026-05-14

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
  persistence.js                # IndexedDB(Dexie) バック memCache
  db.js                         # Dexie DB 定義
  snapshot.js                   # セッション復元保証
  components/
    Atoms.jsx                   # 共通UIパーツ
    Tabs.jsx                    # タブナビゲーション
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

#### Step 1: ✅ 実装済み・マージ済み（PR #148）

- `logic.js` の `calcPreciseEV` に以下を追加:
  - `correctedKCount` — 上皿玉補正後の K 数（`correctedInvestYen / 1000`）
  - `start1KCorrected` — 補正後の 1K スタート（`netRot / correctedKCount`）
- 既存プロパティ（`start1K`, `ev1K` 等）は**未変更**
- 対応コミット: `83ec37c`

#### Step 2a: ✅ 実装済み・マージ済み（PR #152）

- `logic.js` の `calcPreciseEV` に補正後 EV/K とボーダー差を追加
- 対応コミット: `c4d5d1e`

#### Step 2b: ✅ 実装済み・マージ済み（PR #153）

- `src/components/decision/evDecision.js` の判断ロジックを補正後の値に切り替え
- 対応コミット: `a555cff`

#### Step 3: ✅ 実装済み・マージ済み（PR #154）

- 判断タブで「補正後 EV/K」と「生 EV/K」を両方表示
- 対応コミット: `69c8635`

### 2-5. 大当たり後フロー再設計（進行中）

#### 概要

実機での使用感から、毎当たりの実測入力をやめ、  
**チェーン単位の実測 + サポ回転だけ個別記録する方針**へ移行中。

Codex 案を採用。

#### 設計方針

| タイミング | 入力内容 |
|-----------|---------|
| 1連目 | 上皿玉のみ実測入力（既存通り） |
| 各当たり | ラウンド数・液晶出玉・サポ回転のみ入力 |
| ラッシュ終了時 | 最終実測持ち玉を1回だけ入力（**新規**） |

機種別補正率（液晶→実測）でデータ精度を向上。

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
| 2 | ⏳ 未着手 | chain オブジェクトに `finalRealBalls: undefined` を追加 |
| 3 | ⏳ 未着手 | ラッシュ終了ウィザードに「最終実測持ち玉」入力 Step を追加 |
| 4 | ⏳ 未着手 | `calcPreciseEV` の `totalNetGain` 集計に分岐追加（実測 vs 液晶） |
| 5 | ⏳ 未着手 | `baseline.json` 再生成 |
| 6〜8 | ⏳ 未着手 | 詳細は調査レポート参照 |

#### 関連ドキュメント

- 調査レポート: ブランチ `claude/investigate-jackpot-flow-IXTu2` 内
- 影響ファイル一覧: 調査レポート末尾「参照ファイル・行番号サマリー」を参照

---

### 2-6. 履歴削除バグ修正（✅ 完了済み）

- **問題**: 大当たり履歴の「最新履歴を削除」ボタンが持ち玉・上皿玉を巻き戻していなかった
- **修正**: 長押し削除と同等の処理に統一
- **ブランチ**: `claude/fix-history-delete-balls-Xp0et`（PR #155 マージ済み）
- **コミット**: `ea3a122`

---

## 3. 計算ロジック（logic.js）

### 主要関数

| 関数 | 役割 | 状態 |
|------|------|------|
| `useLS` | 永続化 hook（IndexedDB バック） | 安定 |
| `deriveFromRows` | rotRows から rot / kCount / invest を集計 | 検証済み |
| `calcPreciseEV` | 高精度 EV / 仕事量 / ボーダー算出 | Step 1 追加済み |
| `calcCash` | 旧互換 現金計算（RotTab統計パネル用） | 安定 |
| `calcMochi` | 旧互換 持ち玉計算 | 安定 |

### calcPreciseEV の主要出力（Step 1 後）

```
start1K          — 生の 1K スタート（rotRows ベース）
correctedKCount  — 上皿補正後の K 数（Step 1 で追加）
start1KCorrected — 上皿補正後の 1K スタート（Step 1 で追加）
ev1K             — 期待値/K（現在は start1K ベース、Step 2 で切替予定）
bDiff            — ボーダー差
workAmount       — 仕事量
wage             — 時給
```

### 計算式（P tools 互換）

```
EV/K = (1Kスタート / synthDenom) × 機種純増出玉円 - 1000
単価  = EV/K ÷ 1Kスタート
仕事量 = 単価 × 総通常回転数
```

---

## 4. 判断ファーストUI（decision/）

PR #144〜#146 で実装完了。

### コンポーネント構成

- `evDecision.js` — 純粋関数。`calcPreciseEV` の戻り値を受け取り verdict を返す
  - verdict: `continue_strong` | `continue` | `hold` | `stop`
- `DecisionTab.jsx` — タブコンテナ。`calcPreciseEV` を呼び出して `evDecision` に渡す
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

### 完了済み

- ✅ 計算精度問題①（ラベルとウィザード順序）解決（PR #147）
- ✅ 判断ファーストUI 実装（PR #144〜#146）
- ✅ 上皿補正 Step 1（`correctedKCount` / `start1KCorrected` 追加）（PR #148）
- ✅ protected-fns.mjs を Node.js 単体実行可能に修正（PR #149）
- ✅ baseline.json 再生成（PR #150）
- ✅ 上皿補正 Step 2a（補正後 EV/K 追加）（PR #152）
- ✅ 上皿補正 Step 2b（evDecision 判断切り替え）（PR #153）
- ✅ 上皿補正 Step 3（UI で両方表示）（PR #154）
- ✅ 履歴削除バグ修正（PR #155）
- ✅ 大当たり後フロー サブステップ1（machineDB displayToReal 追加）（PR #156）

---

### 次のタスク: 大当たり後フロー サブステップ2

#### 内容

chain オブジェクトに `finalRealBalls: undefined` を追加する。

#### 場所

- `src/components/Tabs.jsx` の `handleStartChain`（L1135 付近）
- 必要なら他の chain 初期化箇所も確認

#### 制約

- 既存の chain プロパティは一切変更しない
- 計算ロジックには触らない（サブステップ4で対応）
- UI 表示には出さない（サブステップ3で対応）

#### 完了条件

- `chain.finalRealBalls === undefined` が初期値
- 既存のテスト全件 pass
- `baseline.json` と完全一致

---

## 6. テスト基盤と保護対象（厳守）

### protected-fns.mjs（保護関数ハーネス）

- **場所**: `src/__tests__/protected-fns.mjs`
- **方針**: 方針B（純粋関数の動的抽出）を採用（Codex 担当、PR #149）
- **仕組み**: `logic.js` のソースを読み込み、`"SHARED CALC HELPERS"` マーカーから後ろを抽出して `Function()` で実行
- **重要**: `"SHARED CALC HELPERS"` コメントを削除・変更するとテストが壊れる

#### 実行方法

```bash
node src/__tests__/protected-fns.mjs
```

出力は JSON。この出力が `baseline.json` と完全一致すれば OK。

### baseline.json（完全一致テスト）

- **場所**: `src/__tests__/baseline.json`
- **仕組み**: `protected-fns.mjs` の出力を記録したスナップショット
- **ルール**:
  - 既存値が **1 つでも変わると即 fail**
  - 新プロパティ追加は影響しない（追加のみは OK）
- **最終更新**: PR #150（Step 1 の `correctedKCount` / `start1KCorrected` 追加に伴い再生成）

### evDecision.test.mjs（判断ロジックテスト）

- **場所**: `src/components/decision/__tests__/evDecision.test.mjs`

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

## 7. ブランチ運用

### 直近 25 コミット（2026-05-14 時点）

```
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
dc24860 test: baseline.json を再生成 (段階2)
b7b8b4e Merge pull request #149 from komatsu-dev-jp/codex/fix-protected-tests-a7Kp9
9363a2a test: protected-fns.mjs を Node.js 単体実行可能に修正
167c6ad Merge pull request #148 from komatsu-dev-jp/claude/implement-correction-step1-q8WBU
83ec37c feat: calcPreciseEV に correctedKCount / start1KCorrected を追加（Step 1）
7f0c126 Merge pull request #147 from komatsu-dev-jp/claude/reorder-wizard-steps-lnB0u
595c606 feat: 連チャンウィザードの Step 順序を入れ替え・ラベルを変更
a406cdb Merge pull request #146 from komatsu-dev-jp/claude/implement-verdict-badge-yUHga
c9783a8 feat: 判断ファーストUI Step 3 — ConfidenceBar / KeyMetrics / ReasonList を実装し DecisionTab に組み込む
f33c77d Merge pull request #145 from komatsu-dev-jp/claude/implement-verdict-badge-yUHga
59ca690 feat: 判断ファーストUI Step 2/3 — VerdictBadge と DecisionTab を実装
180dba4 Merge pull request #144 from komatsu-dev-jp/claude/design-decision-ui-9bFzU
```

### ブランチ命名規則

```
claude/<説明>-<ランダム4文字>
codex/<説明>-<ランダム4文字>
```

---

## 8. 注意点・Tips

### logic.js の変更ルール

- `deriveFromRows`, `calcCash`, `calcMochi`, `calcPreciseEV` は**検証済み保護関数**
- 変更する場合は、変更前後の計算結果を境界値（0, 極端に大きい値, 負数）で比較して提示すること
- **`"SHARED CALC HELPERS"` コメントは絶対に削除・変更しないこと**
  - `protected-fns.mjs` がこのマーカーを目印に純粋関数を抽出している
  - このコメントを変更するとテストが壊れる（エラー: `logic.js の純粋計算関数ブロックが見つかりません`）
- **logic.js に新しい純粋関数を追加する場合は、`SHARED CALC HELPERS` マーカーより後ろに配置すること**
  - テストで抽出される範囲はこのマーカー以降のみ
- **logic.js の export 形式は `export function 名前()` を維持すること**
  - アロー関数（`export const foo = () => {}`）は `protected-fns.mjs` で抽出されない
  - `protected-fns.mjs` は `export function ` を `function ` に置換して `Function()` で実行する仕組み

### rotRows の扱い

- `rotRows` が回転数の唯一の真実源（SSoT）
- `rotRows` を迂回するデータフローを作らない

### 現金・持ち玉の計算パス分離

- `calcCash`（現金）と `calcMochi`（持ち玉）の計算パスは明確に分離されている
- `calcPreciseEV` は `blendedInvest` で統合しているが、内部では `cashKCount` / `mochiKCount` / `chodamaKCount` を分離して追跡

### IndexedDB 永続化

- `useLS` の API シグネチャ (`[val, set] = useLS(key, init)`) は不変
- 内部で IndexedDB(Dexie) バックの memCache に書き込む
- localStorage ではなく IndexedDB を使っているが、呼び出し側はこれを意識しない

### ビルド検証（必須）

```bash
npm run lint
npm run build
```

ファイルを変更したら必ず両方がエラーゼロで通ることを確認してからコミット。

---

## 9. Codex への引き継ぎ事項

### 必読ドキュメント

1. `CLAUDE.md` — プロジェクト全体ルール（ルート直下）
2. `docs/HANDOVER.md` — 本ドキュメント
3. 大当たり後フロー調査レポート — ブランチ `claude/investigate-jackpot-flow-IXTu2` 内

### 作業前の確認コマンド

```bash
git fetch origin
git log --oneline -10
grep -n "displayToReal" src/machineDB.js        # サブステップ1の存在確認（全機種に追加済みのはず）
grep -n "finalRealBalls" src/components/Tabs.jsx  # サブステップ2の進捗確認（未着手なら何も出ない）
```

### 直近の状態サマリー

- main ブランチ最新コミット: `374e722`（PR #156 マージ、サブステップ1完了）
- 上皿補正: Step 1〜3 すべて完了・マージ済み
- 履歴削除バグ: 修正済み・マージ済み（PR #155 / `ea3a122`）
- 大当たり後フロー: サブステップ1完了、**サブステップ2が次のタスク**

### 次にやること（サブステップ2）

`src/components/Tabs.jsx` の `handleStartChain`（L1135 付近）で、  
chain 初期化オブジェクトに `finalRealBalls: undefined` を1行追加するだけ。

```js
// 既存の chain プロパティは変更しない。これだけ追加：
finalRealBalls: undefined,
```

完了条件:
1. `node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と完全一致
2. `npm run lint && npm run build` がエラーゼロ
3. UI に変化なし（表示には出さない）
