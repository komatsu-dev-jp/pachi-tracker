# HANDOVER.md — パチトラッカー 引き継ぎ資料

> Claude Code / Codex 共通参照ドキュメント。
> 作業前に必ず「3. 設計原則」を読むこと。
> 大きな方針変更があれば本ドキュメントを更新する。
>
> 最終更新: 2026-05-08

---

## 1. プロジェクト概要

**パチトラッカー** は、パチンコ店内でリアルタイムに使う稼働記録・期待値計算 PWA アプリ。
回転数・投資額・大当たりデータを記録し、EV/K（期待値/K）・仕事量・ボーダー差をリアルタイムで計算する。

ユーザーは片手操作・騒音環境・時間プレッシャーの中で使う。
**「忙しい人が 3 秒で理解できるか」が全 UI 判断の基準。**

### 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | React 19.2 |
| ビルドツール | Vite 7.3 |
| 永続化 | Dexie (IndexedDB) — `src/db.js`, `src/persistence.js` |
| スナップショット | `src/snapshot.js`（セッション復元保証） |
| PWA | vite-plugin-pwa + Workbox |
| スタイル | CSS カスタムプロパティ（ダークテーマベース） |
| 状態管理 | `useState` + カスタムフック `useLS`（`src/logic.js`）|

### 重要ファイル一覧

| ファイル | 行数 | 役割 |
|----------|------|------|
| `src/logic.js` | 272 | **保護対象**。期待値計算の心臓部。`deriveFromRows`, `calcPreciseEV`, `calcCash`, `calcMochi`, `useLS` を export |
| `src/App.jsx` | 555 | 状態管理の司令塔。`useState` で全状態を一元管理 |
| `src/components/Tabs.jsx` | 7683 | 巨大 UI ファイル。`RotTab`, `SettingsTab`, `CalendarTab` を含む |
| `src/components/Atoms.jsx` | - | 再利用可能 UI プリミティブ（`NI`, `Card`, `Btn` 等） |
| `src/components/decision/` | 230 合計 | 判断ファーストUI（後述）|
| `src/__tests__/protected-fns.mjs` | - | **保護対象テスト**。`node` 直接実行（ESM）|
| `src/__tests__/baseline.json` | - | 保護関数の期待出力。完全一致テスト |
| `src/db.js` | - | Dexie スキーマ定義 |
| `src/persistence.js` | - | IndexedDB バックの memCache 層 |
| `src/snapshot.js` | - | セッション復元保証ロジック |
| `src/machineDB.js` | - | 機種データベース |
| `src/constants.js` | - | 色・フォント・ユーティリティ |

#### `src/components/decision/` の内訳

| ファイル | 行数 | 役割 |
|----------|------|------|
| `evDecision.js` | 69 | 判断ロジック。純粋関数。React/DOM 依存ゼロ |
| `VerdictBadge.jsx` | 36 | 判断結果バッジ（continue_strong / continue / hold / stop）|
| `ConfidenceBar.jsx` | 34 | 信頼度バー |
| `KeyMetrics.jsx` | 13 | EV/K・ボーダー差等の数値表示 |
| `ReasonList.jsx` | 60 | 判断根拠リスト |
| `DecisionTab.jsx` | 18 | 各コンポーネントの組み合わせタブ |
| `__tests__/evDecision.test.mjs` | - | `node` 直接実行テスト |

---

## 2. 現在進行中の取り組み

### 2-1. 判断ファーストUI（完了・マージ済み）

- PR #144〜#146 で実装・マージ済み
- 新タブ「判断」を追加（`DecisionTab`）
- `evDecision.js` が `calcPreciseEV` の戻り値を受け取り verdict を返す純粋関数
- verdict は `continue_strong` / `continue` / `hold` / `stop` の 4 値
- 各 UI コンポーネント（`VerdictBadge`, `ConfidenceBar`, `KeyMetrics`, `ReasonList`）を実装

### 2-2. ウィザード順序入れ替え（完了・マージ済み）

- PR #147 でマージ済み
- 連チャンウィザードの Step 順序を実機で使いやすい順に変更
- 計算ロジックへの影響なし
- **未修正の既知問題**: Step 2 の `marginBottom` 不一致。次回ついでに修正予定

### 2-3. 計算精度問題②：上皿補正（未着手／進行中）

全 3 段階のうち **現状は Step 1 も未実装**。

> **要確認**: ユーザーは「Step 1 実装済み」と認識している可能性があるが、
> 2026-05-08 時点の `src/logic.js` を確認した結果、
> `correctedKCount` / `start1KCorrected` プロパティは存在しない。
> 作業開始前に `git log --oneline -5` と `grep -n "correctedKCount" src/logic.js` で
> 実装済みかどうか必ず確認すること。

#### Step 1（実装予定）
- `logic.js` の `calcPreciseEV` 戻り値に `correctedKCount` / `start1KCorrected` を追加
- **既存プロパティは一切変更しない**（新プロパティの追加のみ）
- 完了条件:
  1. `node src/__tests__/protected-fns.mjs` → `baseline.json` と完全一致
  2. `node src/components/decision/__tests__/evDecision.test.mjs` → 全 pass
  3. `npm run lint && npm run build` → エラーゼロ

#### Step 2（未着手）
- `evDecision.js` が `start1KCorrected` を使うように切り替え

#### Step 3（未着手）
- UI（`KeyMetrics` 等）で「補正後 EV/K」と「生 EV/K」を両方表示

---

## 3. 設計原則・絶対に守るルール

### UI原則

- タップ領域は最低 44px・理想 48px 以上
- 視認性 > 美しさ。ダークテーマ・高コントラスト・大きな数字
- 装飾的な要素を追加しない
- 情報密度を上げる工夫は歓迎、飾りは禁止
- **UIラベルは日本語のみ**（英語を使わない）

### logic.js の保護規定（最重要）

`src/logic.js` の計算誤りはユーザーの金銭的損失に直結する。

- `deriveFromRows`, `calcCash`, `calcMochi`, `calcPreciseEV`, `useLS` は検証済み保護関数
- これらを変更する場合は、変更前後の計算結果を境界値（0・極端に大きい値・負数）で比較してから実装する
- `rotRows` が回転数の唯一の真実源（Single Source of Truth）。迂回するデータフローを作らない
- 現金（`calcCash`）と持ち玉（`calcMochi`）の計算パスは分離されている。混ぜない

### コードベース安定性

- リファクタリングは「動作の軽量化」または「バグ修正」に直結する場合のみ
- 「きれいにしたい」だけの理由でファイル構成を変えない
- `Tabs.jsx` は 7683 行ある。新規 UI は必ず別ファイルに切り出す

### テスト規定

- `src/__tests__/protected-fns.mjs` は `node` 直接実行（ESM）
- `src/__tests__/baseline.json` は完全一致テスト。**既存値が 1 つでも変われば即 fail**
- 新プロパティを追加しても baseline.json には影響しない（追加プロパティは無視される）
- ただし既存プロパティの値・型・キー名が変わると fail する

### ビルド検証（必須）

ファイル作成・修正後、コミット前に必ず実行する:

```bash
npm run lint
npm run build
```

両方がエラーゼロで通ること。

---

## 4. 進め方の方針

### ユーザー（Yuto）の好み

- 慎重・段階的に進める
- 大きな変更は事前に複数案を提示してから実装
- 計算ロジックは特に慎重に
- 専門用語には例え話を添えて説明する
- **「ついでに〜」は厳禁**（明示指示のみ実行する）

### プロンプトの書き方（重要）

依頼するときは以下を明示する:

1. **スコープ**: 「Step 1 のみ」「このファイルのみ」など
2. **守るべきルール**: 既存値を変えない、等
3. **完了条件**: テストコマンドと期待結果を具体的に
4. **報告フォーマット**: 差分の要約・目的・テスト結果
5. **念押し**: 「次のステップには進まない」

---

## 5. 直近のタスク（次に依頼可能）

### 次のタスク：上皿補正 Step 1 の実装とテスト確認

#### 前提確認（作業前に必ず実行）

```bash
grep -n "correctedKCount\|start1KCorrected" src/logic.js
```

- 出力なし → Step 1 未実装。以下の実装を行う
- 出力あり → 実装済み。テスト確認のみ行う

#### Step 1 実装内容

`src/logic.js` の `calcPreciseEV` の `return` ブロックに 2 プロパティを追加:

- `correctedKCount`: 上皿玉補正後の総K数
- `start1KCorrected`: 補正後 1Kスタート（= `netRot / correctedKCount`）

**既存プロパティは一切変更しない。**

#### テスト確認コマンド（Step 1 完了後）

```bash
node src/__tests__/protected-fns.mjs
node src/components/decision/__tests__/evDecision.test.mjs
npm run lint
npm run build
```

#### 確認ポイント

- `baseline.json` と完全一致（既存値が 1 つも変わっていない）
- 新プロパティ `correctedKCount` / `start1KCorrected` が `ev` に追加されている
- 全テスト pass・lint/build エラーなし

問題なければ Step 1 を PR/マージ。
問題があれば「既存値を変えない」という制約に反していないか確認する。

---

## 6. ツール併用ルール

- Claude Code と Codex を併用する
- **同じファイルを同時に触らない**（コンフリクト回避）
- 大きな方針変更があれば、本ドキュメントを更新してからコミットする
- 各ツールは作業前に本ドキュメントの「3. 設計原則」を必ず読む

---

## 7. ブランチ運用

### 直近 20 コミット（2026-05-08 時点）

```
7f0c126 Merge pull request #147 from komatsu-dev-jp/claude/reorder-wizard-steps-lnB0u
595c606 feat: 連チャンウィザードの Step 順序を入れ替え・ラベルを変更
a406cdb Merge pull request #146 from komatsu-dev-jp/claude/implement-verdict-badge-yUHga
c9783a8 feat: 判断ファーストUI Step 3 — ConfidenceBar / KeyMetrics / ReasonList を実装し DecisionTab に組み込む
f33c77d Merge pull request #145 from komatsu-dev-jp/claude/implement-verdict-badge-yUHga
59ca690 feat: 判断ファーストUI Step 2/3 — VerdictBadge と DecisionTab を実装
180dba4 Merge pull request #144 from komatsu-dev-jp/claude/design-decision-ui-9bFzU
81d741a feat: 判断ファーストUI Step1 — evDecision.js 純粋関数を実装
dd8c985 docs: 判断ファーストUIの設計書を追加
8483c2d Merge pull request #143 from komatsuyuto1008-create/claude/fix-rotation-input-clear-lIN19
befd45b feat: 回転入力ページに「直前の記録を削除」ボタンを追加
887fdf0 Merge pull request #142 from komatsuyuto1008-create/claude/indexeddb-persistence-recovery-VXvlu
8c8cc20 feat(snapshot): セッション復元保証を実装（C-3）
88b4d9e feat(persistence): useLS を IndexedDB(Dexie) バックに刷新（C-1）
faa9495 Merge pull request #141 from komatsuyuto1008-create/claude/autosave-bugfix-design-F4tjs
f6af606 feat: Undo/Redo を上段カード右上に追加（C-2、長押し0.4秒）
77ad71a feat(ui): カード単位で「データなし」サブテキストを追加（C-4）
f6b7ec4 Merge pull request #140 from komatsuyuto1008-create/claude/audit-critical-bugs-state-DXGXq
a078b1f fix: 致命バグ#1-#5 の止血と updater 副作用除去（Phase A）
66040f5 Merge pull request #139 from komatsuyuto1008-create/claude/pachinko-ui-refactor-RoFnC
```

### ブランチ命名規則

`claude/<説明的なケバブケース>-<ランダム5文字>` 形式が慣例（例: `claude/reorder-wizard-steps-lnB0u`）。

---

## 8. 注意点・Tips

実装中に得られた知見:

- **`chainWizardStep` の参照箇所は分散している**。変更前に `grep -rn "chainWizardStep" src/` で全参照を確認する
- **`baseline.json` は完全一致テスト**。新プロパティ追加なら影響しないが、既存値が変わると即 fail する
- **`Tabs.jsx` は 7683 行**。新規 UI は必ず `src/components/` 以下の別ファイルに切り出す
- **`src/__tests__/protected-fns.mjs` は `node` 直接実行（ESM）**。ビルドツール不要
- **`useLS` は IndexedDB バック**（旧 localStorage ではない）。`src/persistence.js` の `getSync` / `set` 経由
- **`calcPreciseEV` の EV 計算優先順位**: 機種スペックあり → 理論ボーダーから計算、なし → 手動ボーダーから計算、どちらもなし → ev1K=0
- **`jpLog` の v3 チェーン構造**: `{ chainId, hits[], completed, summary }` 形式。`completed: true` のエントリのみ集計する

### 主要状態変数（App.jsx）

| 変数 | 型 | 説明 |
|------|----|------|
| `rotRows` | array | 回転数記録（type: "start" \| "data" \| "hit"）|
| `jpLog` | array | 大当たりチェーン記録（v3構造）|
| `playMode` | string | 現在の遊技モード（"cash" \| "mochi" \| "chodama"）|
| `currentMochiBalls` | number | 現在の持ち玉数 |
| `totalTrayBalls` | number | 初当たり時の上皿玉数の累計 |
| `spec1R` / `specAvgRounds` / `specSapo` | number | 機種スペック（P tools互換）|
| `synthDenom` | number | 合成確率分母（例: 319.6）|
