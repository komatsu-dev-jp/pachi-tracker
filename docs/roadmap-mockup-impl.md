# パチトラッカー × P-EVIDENCE モックアップ完全再現 ロードマップ

**作成日**: 2026-05-17
**ステータス**: 設計書（コード変更を含まない）
**想定読者**: 次回以降の Claude Code セッション、本プロジェクトのユーザー本人
**関連ドキュメント**: `docs/HANDOVER.md`, `docs/decision-ui-design.md`, `CLAUDE.md`

---

## 0. はじめに

本書は、2枚のモックアップ画像（「Pachi Tracker × P-EVIDENCE 打つ前の良台判定」「Pachi Tracker × P-EVIDENCE 統合アプリ」）の見た目・機能・体験を、現行パチトラッカーで完全再現するための中長期ロードマップ。期間目安は2〜3ヶ月。コードは一切変更せず、本書のみを成果物とする。

### 0-1. 用語集

| 用語 | 意味 |
|---|---|
| P-EVIDENCE | 良台判定エンジン。現在は GAS（Google Apps Script）スプレッドシート上で数式管理されている。本書では JavaScript 移植先を `src/evidence.js`（新規・推測）とする |
| 試行充足率 | 観測データ量が信頼判定に「充足」している度合い（0〜100%）。現行コードの `confidence`（`src/components/decision/evDecision.js`）を発展させた概念 |
| 補正後EV/K | 上皿玉円換算を投資から差し引いた後の期待値/K。現行 `ev.effectiveEV1K` ないし `ev.ev1KCorrected` に対応（`src/logic.js` 行129-150） |
| 生EV/K | 補正前の期待値/K。現行 `ev.ev1K` |
| ホール | 店舗。現行 `Store` 型に対応（`src/App.jsx`）。フロア／島レイアウト情報は未保持 |
| 島 | ホール内の機種グループ。台番号レンジを持つ。データ構造は未実装 |
| 良台判定 | 打つ前段階で「打つ価値のある台」を抽出する機能。未実装 |
| ベイズ事前分布／事後分布 | 機種スペックから推定したボーダー周辺の確率分布／観測データで更新後の分布。未実装 |

### 0-2. 設計原則（CLAUDE.md より継承）

- `src/logic.js` の `deriveFromRows` / `calcCash` / `calcMochi` / `calcPreciseEV` / `useLS` は検証済み保護関数。**変更しない**。
- `rotRows` は回転数の Single Source of Truth。迂回フローを作らない。
- `baseline.json` の既存値は不変。新プロパティ追加のみ可。
- 片手操作優先、タップ領域 44px 以上、3秒で理解できる情報階層。
- UI ラベルは日本語のみ。
- Phase 1 は「見た目優先プロトタイプ」モード、Phase 2 以降は「安全な本実装」モード。

---

## 1. 現状と目標のギャップ分析

### 1-1. モックアップ要素の網羅的リスト

#### [実戦画面] （画像2枚目 ①、画像1枚目 ②）
- ヘッダー（機種名、台番号、「実戦中」バッジ、設定ボタン）
- 判断バッジ（▶続行 / ⚠️様子見 / ✕ヤメ）＋サブメッセージ
- 試行充足率プログレスバー（％数値付き）
- 上段3カード：補正後EV/K（黄）、生EV/K（青）、ボーダー差（緑）
- 中段3カード：予測回転率、1Kスタート、仕事量（期待値）
- クイック入力ボタン群（+1 / +5 / +10 / +25）
- 持ち玉・現金投資カード（行）
- 総回転数・大当り回数・実質投資カード（行）
- 「なぜこの判定？」セクション（✓／✗チェックリスト）
- 判定推移ライングラフ（小・横スクロール）
- 「詳細データを見る」ボタン
- フッタータブ（実戦 / 履歴 / 設定、または5タブ構成：実戦 / 良台判定 / ヒートマップ / 履歴 / 設定）

#### [良台判定画面]（画像1枚目 ①）
- 店舗ヘッダー（店舗名、日付、更新時刻、編集アイコン）
- 良台候補TOP5（カード形式、各カードに以下を含む）
  - 機種番号（例：#776）
  - 判定アイコン（★最有力 / ◯狙い / ▲様子見 / ✕回収）
  - 予測回転率、ボーダー差、信頼度（円グラフ）
  - データ蓄積回転数、島平均、前日実績
- 「全台一覧を見る」ボタン

#### [ヒートマップ画面]（画像1枚目 ③）
- 店舗ヘッダー＋フロア表示（例：店舗A 4F 島配置）
- タブ（全台 / 良台候補 / 実戦中のみ）
- 島レイアウト（数字グリッド、色分け：緑＝最有力／黄＝狙い／橙＝様子見／赤＝回収）
- 選択中の台情報パネル（機種番号、予測回転率、ボーダー差、信頼度）
- 「実戦開始」「詳細」ボタン
- 凡例（ヒートマップの見方）

#### [履歴・分析画面]（画像2枚目 ②）
- タブ（収支推移 / 店舗分析 / 機種分析）
- 実収支ライングラフ
- 仕事量ライングラフ
- 指標サマリー（平均回転率、平均ボーダー差、勝率、収支、仕事量、平均試行充足率）
- 最新実戦履歴リスト（日付、機種、台番号、収支、試行充足率、判定）

#### [設定・機種情報画面]（画像2枚目 ③）
- タブ（機種マスタ / 店舗設定 / アプリ設定）
- 機種スペック表示（大当たり確率、RUSH突入率、RUSH継続率、平均大当たり出玉、右打ち単価、平均ヒット数、サポ増減、削り係数）
- P-EVIDENCEエンジン設定（事前回転率＝Prior、事前分布の重み、削り係数、信頼度基準）
- データ管理（データエクスポート、データインポート）

#### [P-EVIDENCEの役割説明セクション]（画像1枚目下部 / 画像2枚目下部）
- データ収集 → ベイズ推定 → 良台判定 → ヒートマップ の流れ図
- エンジン内部構造図（True Border 計算 / Bayesian 推論 / 信頼度 / 仕事量 / 判定ロジック）
- 「入力するとリアルタイムで判定が変化」のデモストリップ

### 1-2. 既存機能との対応表

| モックアップ要素 | 既存実装 | 状態 |
|---|---|---|
| 判断バッジ | `src/components/decision/VerdictBadge.jsx` | 既存・**見た目のみ刷新**で対応可能 |
| 信頼度バー → 試行充足率 | `src/components/decision/ConfidenceBar.jsx` | 既存・**ラベル変更＋ベイズ拡張**で対応 |
| 補正後EV/K・生EV/K カード | `src/components/decision/KeyMetrics.jsx` | 既存・dual表示済み、**レイアウトのみ変更** |
| ボーダー差・予測回転率・1Kスタート・仕事量 | `calcPreciseEV` の戻り値（`src/logic.js`） | 既存・全フィールド既出力 |
| 「なぜこの判定？」 | `src/components/decision/ReasonList.jsx` | 既存・**表示形式のみ調整** |
| クイック入力 +1/+5/+10/+25 | `RotTab` 内テンキー（`src/components/Tabs.jsx`） | 既存・**ボタン形状をモックに寄せる** |
| 持ち玉・現金投資・総回転数・大当り回数・実質投資 | `calcPreciseEV` の `netRot` / `totalKCount` / `correctedInvestYen` 等 | 既存 |
| 期待値推移グラフ | `Tabs.jsx` 内 自作 `LineChart`（recharts未使用） | 既存・**判定推移／収支推移用に流用** |
| 機種マスタ表示 | `src/machineDB.js` + `customMachines`（App.jsx） | 既存・スペック項目は既に揃う |
| 機種別 RUSH突入率 / 継続率 / 平均ヒット数 | `machineDB.js` の `rushEntryRate` / `rushContinueRate` / `avgPayoutPerHit` 等 | 既存 |
| 店舗管理（店舗名・住所） | `App.jsx` の `stores` state | 既存・**フロア情報なし** |
| データエクスポート / インポート | 店舗・機種の CSV ロジック（`Tabs.jsx`） | 既存・**全データ対応に拡張要** |
| 上皿補正表示 | `Tabs.jsx` 行457-458 | 既存・**実質投資カードに昇格** |

### 1-3. ギャップ一覧

#### 新規データ構造が必要
- ホール内フロアレイアウト（`Floor` / `Island`）
- 機種別過去実績（`pt_machineHistory`）
- 判定推移ログ（`pt_decisionTimeline`）
- P-EVIDENCE 設定値（`pt_priorRotation` 等）
- ダミーデータ切替フラグ（`pt_dataSource`）

#### 新規コンポーネントが必要
- `GoodMachineList`（良台候補TOP5）
- `HallHeatmap`（フロア＋島配置）
- `IslandTile` / `MachineTile`（タップ可能な台パネル）
- `RevenueChart` / `WorkAmountChart`（履歴グラフ）
- `MachineSummaryCard`（機種マスタ表示）
- `EvidenceEngineSettings`（P-EVIDENCE設定画面）
- `TrialSufficiencyBar`（試行充足率プログレスバー、既存 ConfidenceBar 拡張可）
- `DummyDataBanner`（ダミー表示インジケータ）

#### 新規計算ロジックが必要
- `src/evidence.js`（新規・推測）：GAS 数式の JavaScript 移植
  - 事前分布生成（機種スペック → Prior）
  - 事後分布更新（ベイズ更新）
  - 試行充足率計算（観測量に基づく）
  - 真ボーダー計算（削り係数考慮）
  - 良台スコアリング
- `archives` 集計セレクタ（収支推移・仕事量推移用）
- 機種別過去実績集計（archives → machineHistory 派生）

---

## 2. Phase 分割と工程設計

| Phase | 内容 | 期間（最短／現実的／最長） | モード |
|---|---|---|---|
| 1 | 視覚プロトタイプ | 3日／1週間／2週間 | 見た目優先プロトタイプ |
| 2 | 履歴・分析画面の充実 | 1週間／2週間／3週間 | 安全な本実装 |
| 3 | P-EVIDENCE エンジン移植 | 2週間／4週間／6週間 | 安全な本実装 |
| 4 | 良台判定機能 | 3週間／6週間／2ヶ月 | 安全な本実装 |
| 5 | ヒートマップ機能 | 2週間／4週間／6週間 | 安全な本実装 |
| 6 | 統合と仕上げ | 1週間／2週間／4週間 | 安全な本実装 |
| **合計** | | **約2ヶ月／3ヶ月／4ヶ月以上** | |

### Phase 1: 視覚プロトタイプ（モード：見た目優先）

**目的**: モックアップの世界観を既存UIに翻訳し、モチベーションを上げる。`logic.js` は触らない。

サブステップ：
1. 判断バッジの視覚刷新（VerdictBadge）
2. KeyMetrics の3カード×2段レイアウト
3. 試行充足率プログレスバーの追加
4. クイック入力ボタンの見た目をモックに合わせる
5. 「なぜこの判定？」のチェックリストUI調整
6. ダークテーマ色トークンの統一（モック準拠の緑／黄／青／赤）
7. ヘッダー（機種名＋台番号＋「実戦中」バッジ）の整形

完了条件：各サブステップで `npm run lint` / `npm run build` がエラー0。`logic.js`・`evDecision.js`・`baseline.json` 不変。
影響範囲：`src/components/decision/`、`src/components/Tabs.jsx`、`src/index.css`、`src/components/Atoms.jsx` の className 中心。
難易度：◯（既存コンポーネント拡張のみ）。
注意：CSS 変更でも片手操作性（44px以上）を下げないこと。

### Phase 2: 履歴・分析画面の充実（モード：安全な本実装）

**目的**: モックアップ画像2枚目 ② の履歴・分析画面を実現。

サブステップ：
1. `archives` から日次収支配列を導出するセレクタを追加（純関数）
2. 日次仕事量配列セレクタを追加
3. 既存 `LineChart` を流用した収支推移グラフコンポーネント
4. 仕事量推移グラフコンポーネント
5. 指標サマリーカード（平均回転率／平均ボーダー差／勝率／収支／仕事量／平均試行充足率）
6. 最新実戦履歴リスト（日付・機種・台番号・収支・試行充足率・判定）
7. タブ切替（収支推移 / 店舗分析 / 機種分析）
8. 店舗分析・機種分析タブ（最初はダミーで充足、Phase 4で本実装に置換）

完了条件：`archives` の既存形式は変更しない（後方互換）。`baseline.json` 不変。
影響範囲：`src/components/Tabs.jsx` 内 `CalendarTab` 周辺、新規 `src/components/analytics/` 配下の追加。
難易度：△（グラフは既存流用だが、集計ロジックの単体テストが必要）。
推測：`archives` の集計タイミング（セッション終了時のみか日付跨ぎ時もか）を要確認。

### Phase 3: P-EVIDENCE エンジン移植（モード：安全な本実装）

**目的**: GAS の数式群を `src/evidence.js`（新規・推測） に移植。判定推移グラフを実装。

**前提**: GAS スプレッドシートの数式群を **ユーザーから共有してもらうことが必須**（要提供）。共有されるまでは暫定インターフェースのみ設計し、実数式部分はダミー実装で進める。

サブステップ：
1. GAS数式の共有を受ける（**要確認**：未提供）
2. `src/evidence.js` を新規作成。`logic.js` は不変。入力＝`calcPreciseEV` の戻り値、出力＝`{ trueBorder, posteriorMean, trialSufficiency, evAdjusted, reasons }` の純関数
3. 事前分布生成（機種マスタの理論ボーダー＋事前分布の重みから）
4. 事後分布更新（観測 netRot・jpCount からベイズ更新）
5. 試行充足率の段階表示ロジック
6. 削り係数の取り扱い（機種ごとに保持、デフォルト 0.90）
7. `src/__tests__/evidence.test.mjs` 新規（既存 `protected-fns.mjs` の方式を参考）
8. `ev` オブジェクトに `evidence` フィールドを追加（オプショナル、既存値は不変）
9. `KeyMetrics` / `ConfidenceBar` / `ReasonList` を `evidence` 優先で表示、フォールバック既存値
10. 判定推移グラフ（`pt_decisionTimeline` から `LineChart` で描画）

完了条件：`baseline.json` 既存値が変わらない（`protected-fns.mjs` パス）。`evidence.test.mjs` で境界値（観測ゼロ・大量データ・ボーダー差0）パス。
影響範囲：新規ファイル中心。既存ファイルは表示側のみ拡張。
難易度：×（数学的妥当性のレビューと境界値検証が必須）。
リスク：GAS 数式の表現が JavaScript で再現困難な場合は近似実装＋誤差レポートで対応。

### Phase 4: 良台判定機能（モード：安全な本実装）

**目的**: 画像1枚目 ① の良台候補TOP5 を実現。

サブステップ：
1. `pt_machineHistory` データ構造を新規追加。`archives` から派生集計するセレクタを作成
2. 機種別×店舗別の日次集計（avg start1K, avg bDiff, totalNetGain）
3. 「島平均」「前日実績」フィールドの集計
4. 良台スコアリング関数（`evidence.js` 内、推測：trueBorder 余裕＋trialSufficiency＋データ蓄積量の合成）
5. TOP5 抽出ロジック
6. `GoodMachineList` コンポーネント（カード形式、判定アイコン、信頼度円グラフ）
7. 信頼度円グラフコンポーネント（SVG）
8. 「全台一覧を見る」画面
9. ダミーデータでまず表示（`dummyData.js` の `getDummyMachineHistory()`）
10. 実データ切替動作確認

完了条件：実データ／ダミーデータの切替が `pt_dataSource` で動作。Phase 3 の `evidence.js` を活用。
影響範囲：新規画面追加。フッタータブの拡張（5タブ化はPhase 6）。
難易度：×（仕様の詰めが必要。良台スコアリングの定義はユーザー要確認）。
推測：「島平均」は同じ島内の他台との比較値、「前日実績」は同じ機種番号の前日収支。要確認。

### Phase 5: ヒートマップ機能（モード：安全な本実装）

**目的**: 画像1枚目 ③ のホールマップを実現。

サブステップ：
1. `Store` 型に `floors: Floor[]` を追加（後方互換、`floors` 不在時はデフォルト空配列）
2. `Floor` / `Island` 型の定義
3. 島レイアウト編集UI（設定画面内、ドラッグ＆ドロップではなく数値入力ベースで簡易実装）
4. ヒートマップ描画（SVG ベース、台番号グリッド）
5. 色分けロジック（最有力＝緑、狙い＝黄、様子見＝橙、回収＝赤）
6. タブ切替（全台 / 良台候補 / 実戦中のみ）
7. 台タップで詳細パネル表示（機種番号、予測回転率、ボーダー差、信頼度、「実戦開始」「詳細」ボタン）
8. 凡例（ヒートマップの見方）の固定表示
9. ダミーレイアウトでの動作確認

完了条件：店舗フロア未設定時は「フロア未登録」表示で破綻しない。
影響範囲：新規画面・新規データ構造。既存 `stores` は後方互換。
難易度：×（SVG レイアウト計算が複雑）。
推測：島の物理配置（隣接関係）情報の必要性は要確認。当面は線形配置で代替可能。

### Phase 6: 統合と仕上げ（モード：安全な本実装）

サブステップ：
1. フッタータブを5タブ化（実戦／良台判定／ヒートマップ／履歴／設定）
2. タブ間遷移（良台判定 → ヒートマップで該当台選択 → 実戦開始 → 履歴に蓄積）
3. ダミー／実データ切替UI（設定画面）
4. 全画面の細部調整（余白・色・タイポグラフィ）
5. 「これはダミー表示です」バナーの動作確認
6. パフォーマンス検証（特にヒートマップ大量タイル描画）
7. ドキュメント整備（HANDOVER.md 更新、本書のクローズ）

完了条件：第9章の完成判定基準すべて達成。
難易度：△（個別 Phase で完成していれば統合は軽い）。

---

## 3. データ構造の追加設計

### 3-1. ホール拡張（既存 `Store` への追加）

```ts
interface Store {
  id: number; name: string; address: string; rentBalls: number;
  exRate: number; memo: string; chodama: number;
  floors?: Floor[]; // 新規・後方互換（未設定時は空配列扱い）
}
interface Floor { id: string; name: string; islands: Island[]; }
interface Island {
  id: string;
  label: string;            // 例："海島1"
  machineNumberStart: number;
  machineNumberEnd: number;
  machineId?: number;       // 機種マスタへの参照（任意）
  layoutHint?: { row: number; col: number };
}
```

保存場所：既存 `pt_stores` キーに含めて保存（後方互換）。
マイグレーション：起動時に `stores[].floors ??= []` を補完。

### 3-2. 機種別過去実績

```ts
interface MachineHistoryEntry {
  machineId: number | string;
  storeId: number;
  days: Array<{
    date: string; // YYYY-MM-DD
    sessions: number;
    avgStart1K: number;
    avgBDiff: number;
    totalNetGain: number;
    trialSufficiency: number;
  }>;
}
```

保存場所：`pt_machineHistory`（新規キー）。
派生方法：`archives` を集計して生成（純関数）。集計タイミングはアプリ起動時＋アーカイブ追加時。
既存データとの関係：`archives` が真実源。`pt_machineHistory` はキャッシュ。

### 3-3. 判定推移

```ts
interface DecisionTimelineEntry {
  sessionId: string; timestamp: number;
  verdict: "continue_strong" | "continue" | "hold" | "stop";
  evAdj: number; bDiff: number; confidence: number;
}
```

保存場所：`pt_decisionTimeline`（新規キー）。
追加タイミング：`rotRows` 更新時に最新スナップショットを末尾追加（過去エントリ不変）。
サイズ管理：1セッション最大1000件、超過分は先頭から間引き。
既存データとの関係：派生ログ。失っても再生成不可だが、計算には影響なし。

### 3-4. P-EVIDENCE エンジン用設定

| キー | 型 | デフォルト | 意味 |
|---|---|---|---|
| `pt_priorRotation` | number | 20.0 | 事前回転率（Prior） |
| `pt_priorWeight` | number | 15000 | 事前分布の重み（仮想観測回数） |
| `pt_kiriCoeff` | number | 0.90 | 削り係数（機種ごと上書き可、デフォルト値） |
| `pt_confidenceThreshold` | number | 0.40 | 信頼度基準（40%未満は様子見扱い） |

`prior` と `posterior` は state ではなく計算時の derived value として扱う（`evidence.js` 内）。

### 3-5. ヒートマップ用

3-1 の `Island` を流用。台ごとの状態は `evidence.js` の出力で派生：

```ts
interface MachineTileState {
  machineNumber: number;
  islandId: string;
  verdict: "best" | "target" | "watch" | "recover";
  confidence: number;
}
```

これは派生データのため保存しない（再計算）。

---

## 4. ダミーデータ戦略

### 4-1. 配置

`src/dummyData.js` を新規作成（推測）。以下を export：

```js
export function getDummyMachineHistory() { /* ... */ }
export function getDummyFloors() { /* ... */ }
export function getDummyDecisionTimeline() { /* ... */ }
export function getDummyArchives() { /* ... */ }
```

各関数は決定論的（同じ入力で同じ出力）。

### 4-2. 切り替え機構

`pt_dataSource: "dummy" | "real" | "auto"` を設定に追加（デフォルト `"auto"`）。

- `"auto"`：該当データが空ならダミー、あれば実データ
- `"dummy"`：常にダミー
- `"real"`：常に実データ（空でも空のまま）

UI には固定バナー：「これはダミー表示です（設定で切り替え可能）」を画面上部に表示。

### 4-3. 実データへの移行

- 構造は最初から本物と同じ（フィールド名・型）
- `dummyData.js` を import する箇所は1箇所に集約（`useDataSource` カスタムフック・推測）し、後で削除を容易にする
- 削除時の影響範囲：1ファイル＋1フック削除のみで完結する設計

---

## 5. P-EVIDENCE 移植戦略

### 5-1. 移植対象（GAS 数式が**要提供**）

- 事前分布生成（機種スペック → Prior）
- 観測データからの事後分布更新（ベイズ更新）
- 試行充足率の段階計算
- 真ボーダー計算（削り係数考慮）
- 良台スコアリング
- 判定ロジック（True Border 差・試行充足率・データ量の合成）

### 5-2. JavaScript 化の方針

- 配置：`src/evidence.js`（新規・推測）
- `logic.js` には統合しない（保護関数群への影響を避ける）
- 純関数で構成。状態を持たない
- 入出力：
  - 入力：`calcPreciseEV` の戻り値（`ev` オブジェクト）＋ 設定（`pt_priorRotation` 等）＋ 機種マスタ
  - 出力：`{ trueBorder, posteriorMean, trialSufficiency, evAdjusted, scoreForRanking, reasons }`

### 5-3. テスト戦略

- `src/__tests__/evidence.test.mjs` を新規作成（`protected-fns.mjs` を参考）
- 境界値テスト（観測ゼロ／大量データ／ボーダー差0／極端な事前分布）
- GAS との数値比較テスト（GAS から数値出力サンプルをもらえれば、相対誤差 1% 以内をパス条件にする・推測）
- `baseline.json` には触れない

### 5-4. データの受け渡し

```js
// 現行
const ev = calcPreciseEV({ rotRows, jpLog, ... });
// 拡張後（推測）
const ev = calcPreciseEV({ rotRows, jpLog, ... });
const evWithEvidence = { ...ev, evidence: runEvidence(ev, settings, machine) };
```

`KeyMetrics` / `ConfidenceBar` / `ReasonList` は `ev.evidence` があればそれを優先表示、なければ既存値にフォールバック（既存ユーザーの体験を壊さない）。

### 5-5. リスク

- GAS 数式が未共有 → Phase 3 着手前に**必須**で共有を受ける（要確認）
- 数式が浮動小数の精度に依存する場合、`Number` 精度の制約で再現できない可能性
- 機種ごとに数式が分岐する場合、マッピング表が必要

---

## 6. 既存機能の取り扱い

### 6-1. HANDOVER.md の保留タスクとの統合

| 保留タスク | 本書での扱い |
|---|---|
| 上皿補正の過大増幅問題（持ち玉ゼロ時の補正効果が最大化） | Phase 3 で P-EVIDENCE 補正と並行検討。補正係数を `evidence.js` 側で吸収する案を推測。Phase 3 着手前にユーザー方針確認 |
| 大当たり後フロー サブステップ4以降（calcPreciseEV の totalNetGain 集計に実測vs液晶分岐） | Phase 3 と独立。Phase 3 完了前に解消するのが望ましい（並行進行可） |
| サブステップ5（baseline.json 再生成） | Phase 3 着手時に必要なら実施。`baseline.json` 再生成は本書の他 Phase に影響しない |

### 6-2. 既存上皿補正（Step 1〜3）

- ロジックは完了済み（PR #148〜#154）。**そのまま維持**
- Phase 1 で UI 表示形式のみモックアップに統一（「実質投資」カードに昇格）
- 計算式・データ構造は不変

### 6-3. 既存ウィザード類

| ウィザード | 扱い |
|---|---|
| プッシュ補正Step（上皿玉入力） | 維持。モックには無いが計算精度に不可欠 |
| 連チャンウィザード（ラウンド情報入力） | 維持。設定で簡略モード／詳細モードを切替可能にする案（推測、必須でない） |
| 大当たり後の最終実測持ち玉入力 | 維持。`finalRealBalls` フィールドは集計に必要 |
| セッション開始モーダル | 維持。UI のみモック寄せ |

---

## 7. リスク評価

### 7-1. 既存ユーザーデータの互換性
- `pt_` 既存キーは一切変更しない。新規キーは追加のみ
- マイグレーションは「初回起動時にデフォルト値で埋める」方針
- `stores[].floors` のように既存型へ追加する場合はオプショナル化＋デフォルト補完

### 7-2. 開発期間中の不安定状態
- Phase ごとにブランチ分離（`claude/roadmap-phase-N` 形式・推測）
- 各 Phase 完了時点で `main` に統合できる粒度を維持
- Phase 1 は「見た目だけ」、Phase 2 以降は機能追加のみで、退行は起きにくい設計

### 7-3. モチベーション維持
- Phase 1 を最優先で短期に終わらせる（最短3日）
- 1〜2日サイクルで PR を作る運用を推奨
- Phase 4・5 は長丁場なのでサブステップ単位で完成感を出す

### 7-4. 過去修正の無駄化リスク
- 判断ファーストUI（PR #144-146）・上皿補正Step1-3（PR #148-154）・大当たり後フロー Step1-3（PR #156-159）は全て保持
- 第1章の対応表で「既存実装の利用元」を明示し、これらが Phase 1 以降の基盤として機能することを担保

### 7-5. P-EVIDENCE 移植リスク
- GAS 数式未提供時はダミー実装で進める
- `evidence.js` は差し替え可能なインターフェースで設計
- 数式提供後の差し替えは1ファイル変更のみで完結する想定

### 7-6. テスト基盤への影響
- `protected-fns.mjs` の `"SHARED CALC HELPERS"` マーカーを削除しない
- `baseline.json` の既存値は不変、新プロパティ追加のみ
- 新規 `evidence.test.mjs` は独立に運用

---

## 8. 推奨される最初の3つの作業（Phase 1 冒頭）

### サブステップ1：判断バッジの視覚刷新

- **対象ファイル**：`src/components/decision/VerdictBadge.jsx`
- **変更内容**：
  - 背景：単色 → グラデーション（緑系：`linear-gradient(135deg, #15a36a 0%, #0ea25b 100%)`、黄系、赤系も同様・推測）
  - アイコン大型化：`▶`（続行）／`⚠️`（様子見）／`✕`（ヤメ）を 32px 以上
  - サブメッセージ追加：`"このまま打ち続けてOK"` `"このまま打ちつつ判定"` `"期待値マイナス・ヤメ推奨"` 等を verdict ごとに表示
  - レイアウト：左にアイコン＋ラベル、右上に試行充足率（小、Phase 1.3 で導入）
- **変更しないもの**：
  - `evDecision.js` の判定ロジック
  - props インターフェース（`verdict`, `confidence`）
  - 判定値の文字列（`continue_strong` / `continue` / `hold` / `stop`）
- **完了条件**：
  - モックアップ画像2枚目 ① の上部「続行」バッジに視覚的に近づく
  - `npm run lint` / `npm run build` 双方エラー0
  - `logic.js`・`baseline.json` 無変更
- **実装プロンプト例**：
  > `src/components/decision/VerdictBadge.jsx` をモックアップ画像2枚目 ① の判断バッジに寄せる視覚刷新を行ってください。背景グラデーション・アイコン大型化（32px以上）・サブメッセージ（verdict ごとに固定文言）を追加。`evDecision.js` の判定ロジックと props インターフェースは変更しないでください。完了後 `npm run lint && npm run build` を実行しエラー0を確認、`logic.js`・`baseline.json` が無変更であることを `git diff --stat` で確認してください。

### サブステップ2：KeyMetrics の3カード×2段レイアウト

- **対象ファイル**：`src/components/decision/KeyMetrics.jsx`
- **変更内容**：
  - 上段3カード（強調）：補正後EV/K（黄）、生EV/K（青）、ボーダー差（緑）
  - 下段3カード：予測回転率、1Kスタート、仕事量（期待値）
  - カード内タイポグラフィ：数値を大きく（24px〜32px）、単位を小さく
  - カード背景：ダークグレー＋アクセントボーダー左 4px
- **変更しないもの**：
  - 表示値の出典（`ev.effectiveEV1K` / `ev.ev1K` / `ev.bDiff` / `ev.start1K` / `ev.workAmount`）
  - props インターフェース
- **完了条件**：
  - モックアップ画像2枚目 ① の3カード×2段配置に近づく
  - 既存の補正後／生 dual 表示の情報が失われない
  - `npm run lint` / `npm run build` エラー0
- **実装プロンプト例**：
  > `src/components/decision/KeyMetrics.jsx` をモックアップ画像2枚目 ① のレイアウトに寄せてください。上段3カード（補正後EV/K・生EV/K・ボーダー差）、下段3カード（予測回転率・1Kスタート・仕事量）の構成にし、数値タイポグラフィを24-32pxに拡大、アクセントボーダー左4pxを追加。値の取得元（`ev.effectiveEV1K` 等）は変更しないでください。

### サブステップ3：試行充足率プログレスバー

- **対象ファイル**：`src/components/decision/ConfidenceBar.jsx` を拡張（または `TrialSufficiencyBar.jsx` を新規作成）
- **変更内容**：
  - ラベルを「信頼度」→「試行充足率」に変更
  - プログレスバー表示（％数値付き、例：「試行充足率 62%」）
  - 配置：判断バッジの直下
  - 既存の `rot` / `jp` 分割表示は折り畳み（小さく表示、タップで展開・推測）
- **変更しないもの**：
  - `calcConfidence` の計算式（`evDecision.js` 行5-13）
  - Phase 3 で本格的にベイズベースの試行充足率に置換するため、Phase 1 ではラベルのみ
- **完了条件**：
  - 「試行充足率 XX%」が判断バッジの下に表示される
  - モックアップの試行充足率プログレスバーに視覚的に近づく
  - `npm run lint` / `npm run build` エラー0
- **実装プロンプト例**：
  > `src/components/decision/ConfidenceBar.jsx` のラベルを「信頼度」から「試行充足率」に変更し、メイン表示をプログレスバー（％数値付き）に刷新してください。配置は判断バッジ直下。`calcConfidence` の計算式は変更せず、ラベルと見た目のみ変えてください。Phase 3 で本実装するため、Phase 1 ではプレースホルダーの位置付けです。

---

## 9. 完成イメージのドキュメント化

### 9-1. 主要画面（5タブ構成、完成時）

- **実戦タブ**：モックアップ画像2枚目 ① と一致。判断バッジ・試行充足率バー・3カード×2段・クイック入力・「なぜこの判定？」・判定推移グラフ
- **良台判定タブ**：モックアップ画像1枚目 ① と一致。店舗ヘッダー＋良台候補TOP5＋「全台一覧を見る」
- **ヒートマップタブ**：モックアップ画像1枚目 ③ と一致。フロア＋島配置＋色分け＋選択中パネル＋凡例
- **履歴タブ**：モックアップ画像2枚目 ② と一致。収支推移グラフ・仕事量グラフ・サマリーカード・履歴リスト
- **設定タブ**：モックアップ画像2枚目 ③ と一致。機種マスタ／店舗設定／アプリ設定＋P-EVIDENCEエンジン設定＋データ管理

### 9-2. 体験フロー

1. ユーザー、店舗到着前に「良台判定タブ」で TOP5 を確認
2. 店内で「ヒートマップタブ」を開き、TOP5 の物理配置を把握
3. 狙い台のタイルをタップ → 「実戦開始」ボタンで実戦タブに遷移
4. 玉を打ちながらクイック入力（+1/+5/+10/+25）。入力ごとに判定がリアルタイム更新
5. 「なぜこの判定？」で根拠を確認、必要に応じてヤメ
6. セッション終了 → 「履歴タブ」で振り返り、収支推移・仕事量推移を確認
7. 蓄積データが翌日以降の良台判定精度を継続的に向上

### 9-3. 完成判定基準

- [ ] 5タブが全て実装され、モックアップ画像と一致する情報が表示される
- [ ] ダミーデータと実データの切替が `pt_dataSource` 設定で動作する
- [ ] P-EVIDENCE 数式が `src/evidence.js` で動作し、`evidence.test.mjs` が全件パス
- [ ] `logic.js` および `baseline.json` の既存値が無変更（`protected-fns.mjs` パス）
- [ ] `npm run lint` / `npm run build` 双方エラー0
- [ ] 既存の保留タスク（上皿補正過大増幅、大当たり後フロー サブステップ4〜8）が「解消済み」または「現状維持で許容」のいずれか明確
- [ ] 既存ユーザーの localStorage データが互換性を保つ（マイグレーション動作確認）
- [ ] 片手操作性が維持されている（タップ領域 44px 以上）
- [ ] HANDOVER.md が更新され、本書のクローズ状態が記録される

---

## 付録 A. 既存実装の主要再利用ポイント（クイック参照）

| モックアップ要素 | 既存実装の利用元 |
|---|---|
| 判断バッジ | `src/components/decision/VerdictBadge.jsx` |
| 信頼度 → 試行充足率 | `src/components/decision/ConfidenceBar.jsx`（拡張） |
| 補正後EV/K・生EV/K カード | `src/components/decision/KeyMetrics.jsx`（dual表示済） |
| なぜこの判定？ | `src/components/decision/ReasonList.jsx` |
| グラフ全般 | `src/components/Tabs.jsx` 内 `LineChart` |
| 機種マスタ | `src/machineDB.js`（大当たり確率／spec1R／specAvgRounds／specSapo／rushEntryRate／rushContinueRate 等が既出） |
| 店舗管理 | `src/App.jsx` の `stores` state + `Tabs.jsx` 内 UI |
| クイック入力 | `RotTab` 既存テンキー |
| 持ち玉・現金投資・総回転数・大当り回数・実質投資 | `calcPreciseEV` の戻り値 |
| 上皿補正・補正後値 | `src/logic.js` 行 129-150（変更禁止） |
| 仕事量・時給 | `calcPreciseEV` の `workAmount`, `wage` |
| 判断ロジック | `src/components/decision/evDecision.js` |

## 付録 B. 不明点・要確認項目

| 項目 | 確認先 |
|---|---|
| P-EVIDENCE GAS 数式の共有 | ユーザー（Phase 3 着手前に必須） |
| 良台スコアリングの定義（True Border 余裕、試行充足率、データ蓄積量の合成式） | ユーザー（Phase 4 着手前） |
| 「島平均」「前日実績」の集計定義（島内他台比較／同番台の前日収支） | ユーザー（Phase 4 着手前） |
| 島の物理隣接情報の必要性 | ユーザー（Phase 5 着手前。当面は線形配置で代替可） |
| 上皿補正過大増幅問題の方針（持ち玉モード時スキップ／現金K分のみ補正） | ユーザー（Phase 3 入口） |
| `archives` 集計タイミング | コード再確認（Phase 2 着手前） |
| GAS 数値出力サンプル（テスト比較用） | ユーザー（Phase 3 テスト整備時） |

---

**本書はコード変更を含まない。次セッションで Phase 1 サブステップ1 から実装を開始する場合、第8章の実装プロンプト例をそのまま渡せばよい。**
