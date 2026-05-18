# パチトラッカー「狩猟型UX」進化ロードマップ

**作成日**: 2026-05-18
**ステータス**: 設計書（コード変更を含まない）
**想定読者**: 次セッション以降の Claude Code / Codex、本プロジェクトのユーザー本人
**関連ドキュメント**:
- `CLAUDE.md`（プロジェクト全体ルール）
- `docs/HANDOVER.md`（直近の実装状況・保留タスク）
- `docs/roadmap-mockup-impl.md`（先行ロードマップ。本書はその上位ガイドとして並存）
- `docs/decision-ui-design.md`（判断ファーストUI 設計書）

> **本書と `roadmap-mockup-impl.md` の関係**
> 先行する `roadmap-mockup-impl.md` は「2枚のモックアップ画像」の完全再現を 6 Phase で計画したもの。本書はそれを土台に、「4モード戦略UI」「狩猟サイクル」「ハンターランク」「半自動モード切り替え」を追加要件として取り込み、**Phase 構成を 0〜7 の 8 段階に再整理した中長期ロードマップ**である。先行書のサブステップは本書の各 Phase に吸収して扱う。矛盾が生じた場合は本書を優先する。

---

## 0. はじめに

### 0-1. 最終形

「P-Tracker × P-EVIDENCE 統合アプリ」。4つの認知状態に最適化された戦略UIを持ち、**探索 → 発見 → 実戦 → 検証 のサイクル**で勝率を最大化する「狩猟型UX」アプリ。

| モード | 利用シーン | 認知状態 | 主目的 |
|---|---|---|---|
| 偵察モード（scout） | 自宅・朝 | 未来予測・情報収集 | 店舗選定 |
| 台選びモード（select） | ホール内・最重要 | 空間探索・優位性発見 | 良台発見 |
| 記録モード（record） | 実戦中 | 作業・即記録 | 最小入力・即記録 |
| 分析モード（analysis） | 帰宅後 | 振り返り・改善 | 改善分析 |

### 0-2. 設計原則（CLAUDE.md より継承）

- `src/logic.js` の `deriveFromRows` / `calcCash` / `calcMochi` / `calcPreciseEV` / `useLS` は検証済み保護関数。**変更しない**。
- `"SHARED CALC HELPERS"` マーカー、`export function` 形式、`baseline.json` の既存値は不変。
- `rotRows` は回転数の Single Source of Truth。迂回フローを作らない。
- 片手操作優先、タップ領域 44px 以上、3秒で理解できる情報階層。
- UIラベルは日本語のみ。
- 「見た目優先プロトタイプ」と「安全な本実装」を Phase ごとに明示的に分離する。

### 0-3. 期間目標と現実的見積もり

- 公称期間目標：**1.5〜2ヶ月**
- 本書の Claude Code/Codex 併用前提での現実的見積もり：**最短2ヶ月／現実的3ヶ月／最長4ヶ月以上**
  - 推測：1.5〜2ヶ月は GAS 数式が既に提供済み・良台スコアリング定義が確定済みである前提でのみ達成可能。未確定要素が複数残るため、現実的には3ヶ月を基準に見積もる。

### 0-4. 用語集（差分のみ。基本用語は `roadmap-mockup-impl.md` §0-1 参照）

| 用語 | 意味 |
|---|---|
| 4モード戦略UI | 偵察／台選び／記録／分析 の4モードを切り替えて使うUI構成。各モードは認知状態に最適化される |
| 狩猟サイクル | 探索（偵察）→ 発見（台選び）→ 実戦（記録）→ 検証（分析）の循環 |
| ハンターランク | 入力・継続行動に応じて XP が貯まり Lv が上がる育成要素。実用情報ではなくモチベ維持装置 |
| 半自動モード切り替え | 位置情報・実戦開始ボタン押下などのシグナルから「モードを切り替えますか？」と提案するが強制はしない仕組み |
| トラッキングデータ | 既存パチトラッカーが localStorage / IndexedDB に保持している実測ベースの全状態（`rotRows`, `jpLog`, `archives` 等） |

---

## 1. 現状と目標のギャップ分析

### 1-1. 既存機能の棚卸し（実装済み）

直近 PR ベース（HANDOVER.md §2-3〜§2-6、§5 から再構成）。

#### 計算ロジック・データ層
- `deriveFromRows`（回転数集計、SSoT）
- `calcPreciseEV`（補正後EV/K、ボーダー差、仕事量、時給）
- `calcCash` / `calcMochi`（現金・持ち玉の計算パス分離）
- 上皿補正 Step 1〜3（PR #148〜#154）：`correctedKCount`, `start1KCorrected`, `ev1KCorrected`, `bDiffCorrected` を `calcPreciseEV` が出力
- 判断ロジック `evDecision.js`：補正後の値を判断基準に使用
- IndexedDB（Dexie）バック永続化 `useLS`
- スナップショット復元 `snapshot.js`
- 機種マスタ `machineDB.js`：大当たり確率、`spec1R`, `specAvgRounds`, `specSapo`, `rushEntryRate`, `rushContinueRate`, `avgPayoutPerHit`, `displayToReal` 等のフィールドが既出

#### 入力フロー
- 連チャンウィザード（Step順序・ラベル PR #147 で整備）
- プッシュ補正Step（PR #161）：初当たり前に「直近のプッシュ額（+0/+500/+1000円）」を選択
- 大当たり後フロー サブステップ1〜3（PR #156〜#159）：
  - サブステップ1: `machineDB.js` に `displayToReal` フィールド
  - サブステップ2: chain オブジェクトに `finalRealBalls`
  - サブステップ3: ラッシュ終了ウィザードに「最終実測持ち玉」入力 Step
- 初当たり回転数必須化（PR #162）：`handleStartChain` で空・0・逆行をバリデート

#### UI 層
- 判断ファーストUI（PR #144〜#146）：`VerdictBadge`, `ConfidenceBar`, `KeyMetrics`, `ReasonList`
- 上皿補正 Step 3（PR #154）：判断タブで「補正後EV/K」と「生EV/K」を両方表示
- 現金カード 0円バグ修正（PR #160）：`ev.rawInvest` を表示
- 履歴削除バグ修正（PR #155）：持ち玉・上皿玉の巻き戻し統一
- 実戦タブの統合（先行書 §Phase 1.B 完了済み）：`rot` と `decision` を統合し、テンキーを bottom sheet 化、クイック入力 +1/+5/+10/+25 は廃止
- ダークテーマ・44px タップ領域・スワイプナビゲーション・PWA Service Worker

#### テスト基盤
- `protected-fns.mjs`：`"SHARED CALC HELPERS"` マーカーから後ろを抽出
- `baseline.json`：完全一致テスト（既存値が1つでも変わると fail）
- `evDecision.test.mjs`

### 1-2. 保留中タスクの統合方針

`HANDOVER.md §6` にある保留タスクを本ロードマップでどう吸収するかを表で整理。

| 保留タスク | 影響範囲 | 本書での吸収先 Phase | 備考 |
|---|---|---|---|
| 上皿補正の過大増幅問題（持ち玉DATA行ゼロ瞬間に補正効果が最大化） | `logic.js` | **Phase 5（P-EVIDENCE移植）の冒頭** | 補正の係数調整は P-EVIDENCE 内で吸収する案を推奨。`logic.js` 直接変更時は `baseline.json` 再生成が必要。Phase 5 着手前にユーザー方針確認（案A：持ち玉モード時スキップ／案C：現金K分のみ補正） |
| 大当たり後フロー サブステップ4（`calcPreciseEV` の `totalNetGain` 集計に `finalRealBalls` 分岐追加） | `logic.js` | **Phase 0 と並列、または Phase 5 着手前に消化** | Phase 5 以降の P-EVIDENCE 計算は実測ベースの netGain を必要とするため、Phase 5 入り口までに完了させるのが望ましい |
| 大当たり後フロー サブステップ5（`baseline.json` 再生成） | テスト基盤 | **サブステップ4と同タイミング** | 旧 baseline を git 管理で残し、差分根拠を PR 説明に記載 |
| 大当たり後フロー サブステップ6〜8（詳細未確認） | 不明 | **Phase 5 着手前に再調査** | 調査レポートはブランチ `claude/investigate-jackpot-flow-IXTu2` 内 |

> **重要**：保留タスクは「狩猟型UX」進化の前提条件。新UIに乗せ替えてからロジック調整を行うとリスクが高い（baseline.json再生成・実機検証の両方が必要になる）。**サブステップ4・5は Phase 0〜2 の合間に独立PRで先行消化することを推奨**する。

### 1-3. モックアップ要素の完全リスト（モード別）

添付モックアップ画像（4モード戦略UI 1枚＋実戦/分析画面の細部1枚）と GPT 設計画像から要素を網羅。

#### [偵察モード]（自宅・朝、Bloomberg風）

- ヘッダー：「店舗ランキング」「更新時刻 7:30」「編集アイコン」
- タブ：「本日予測」「店舗実績」「イベント」
- 店舗ランキングカード（1〜5位、TOP3は強調）
  - 順位アイコン（1=金、2=銀、3=銅）
  - 店舗名（例：「P大海物語5 MTE2」「マルハン○○店」）
  - 期待値（円）
  - 勝率（%）
  - 判定ラベル（「強」など）
- 本日の注目ポイント（箇条書き）
  - 例：「並び3箇所目で高稼働の可能性」「大海5の投入傾向が強い」「特定日（7のつく日）」
- フッタータブ：偵察 / 台選び / 記録 / 分析 / 設定（5タブ構成）

#### [台選びモード]（ホール内・最重要、SFレーダー風）

- ヘッダー：機種名（例：「P大海物語5」）、「A未占ル」、「島全体」
- ヒートマップグリッド（数値＝台番号、例：772〜822）
  - 色分け：緑（高信頼）／黄／橙／赤（低信頼）／灰（データ不足）
  - 色の濃さ＝信頼度
- 「全台 / 良台候補 / 実戦中のみ」タブ
- 凡例：「淡い ←→ 濃い／データ不足」
- 良台候補TOP5（信頼度順）
  - 台番号、機種名、EV/K（円）、ボーダー差、信頼度（%）
- フッタータブ

#### [記録モード]（実戦中、業務端末風）

- ヘッダー：台番号・機種名・通知ベル・歯車
- 大きな判定バッジ（「継行推奨」「このまま打ち続けてOK」）
- 信頼度プログレス（円グラフ風、例：62%）
- ボーダー差・補正後EV/K（中段2カード）
- 回転数入力：-10 / +1 / +10 / +100 / +500（5ボタン、現在値中央大表示）
- 「大当たり入力」「持ち玉入力」（下段2ボタン）
- 直近イベント表示（時刻 + イベント）
  - 12:30 大当たり 確変 3R
  - 12:15 信頼度40%到達
  - 12:10 ボーダー差 +2.1 → +3.3
- フッタータブ

> **モック準拠と既存実装の差**：先行書 §Phase 1.B で **+1/+5/+10/+25 クイック入力は廃止**された（ユーザー指示）。本書の記録モードでは、モック表記の -10/+1/+10/+100/+500 ボタンを採用するか、それとも既存の「入力」ボタン → keypad bottom sheet を維持するかを **要確認**。Phase 1 着手前に方針確定が必要。

#### [分析モード]（帰宅後、ダッシュボード型）

- ヘッダー：「収支分析」「×（閉じる）」
- タブ：「日別 / 月別 / 年別」
- 月選択（例：「2024年5月」、左右矢印）
- 主要指標カード
  - 収支（+68,200円）
  - 回収率（121.3%）
  - 稼働日数（12日）
  - 勝率（66.7%）
- 収支推移ライングラフ（日次、y軸 -40000〜80000）
- 機種別成績TOP5（順位、機種名、収支、回収率）
- フッタータブ

#### [共通要素]

- モード切り替えフッタータブ（偵察/台選び/記録/分析/設定）
- 共通デザイン言語
  - フォント統一（読みやすさ重視）
  - アイコンスタイル統一
  - 色の意味は全モード共通
    - 緑＝良い（優位）
    - 黄＝様子見（中立）
    - 橙＝微妙（注意）
    - 赤＝悪い（危険）
    - 灰＝データ不足
  - 角丸・線の太さ統一
- ハンターランク（育成感）
  - Lv.23、次のランクまで 1,250 EXP
  - 「精度の成長を可視化」「判定変化で達成感」「鳥コンプリート」「信頼度の成長を実感」
- イベント通知（最小限）
- 半自動モード切り替え動線
  - 手動タブ（いつでも切替可）→ 半自動提案（提案のみ・強制しない）→ 実戦開始ボタンで自動切替
  - 「ホールに到着しました、台選びモードに切り替えますか？」モーダル
- 狩猟サイクル：探索 → 発見 → 実戦 → 検証 の循環図（説明用）
- 最重要機能ランキング（GPT設計）：
  1. P-EVIDENCEエンジン（ベイズ推論）— 土台となる中核ロジック
  2. ヒートマップ（空間可視化）— 唯一無二の体験価値
  3. 信頼度表示（試行充足率）— 錯覚防止の必須機能
  4. 判定バッジ（続行/様子見/ヤメ）— 行動の判断を支援
  5. 良台候補TOP5 — 比較の効率化
  6. あと何回転で信頼度40%表示 — 未来志向に実装
  7. 機種別分析 — 詳細分析機能
  8. 収支推移グラフ — 結果の可視化

### 1-4. ギャップ一覧（カテゴリ別）

#### UIコンポーネント（新規）

| コンポーネント | モード | 既存流用 | 新規実装規模 |
|---|---|---|---|
| `ModeTabBar`（フッター5タブ） | 共通 | 既存 sessionSubTabs から派生 | 中 |
| `ScoutDashboard`（偵察モード画面） | 偵察 | なし | 大 |
| `StoreRankingCard` | 偵察 | なし | 中 |
| `TodayHighlightList` | 偵察 | なし | 小 |
| `HallHeatmap`（島レイアウト） | 台選び | なし | **特大** |
| `MachineTile` / `IslandTile` | 台選び | なし | 中 |
| `GoodMachineList`（TOP5） | 台選び | なし（先行書では Phase 4） | 中 |
| `RecordModeView`（記録モード統合画面） | 記録 | 既存実戦タブの再構成 | 中 |
| `JudgmentBadgeLarge`（大型判定バッジ） | 記録 | `VerdictBadge` 拡張 | 小 |
| `ConfidenceCircularProgress`（円グラフ信頼度） | 記録 | `ConfidenceBar` 並列 | 中 |
| `RecentEventList`（直近イベント） | 記録 | なし | 小 |
| `AnalysisDashboard` | 分析 | なし（先行書では Phase 2） | 大 |
| `RevenueTrendChart` | 分析 | `LineChart` 流用 | 中 |
| `MachinePerformanceTop5` | 分析 | なし | 中 |
| `HunterRankBadge` | 共通 | なし | 中 |
| `EventNotificationToast` | 共通 | なし | 中 |
| `ModeSwitchSuggestionModal`（半自動提案） | 共通 | なし | 中 |
| `DummyDataBanner` | 共通 | なし | 小 |

#### データ構造（新規）

- ホール（店舗）拡張：`Store.floors`（先行書 §3-1）
- フロア／島／台番号レイアウト（先行書 §3-1）
- 機種別過去実績 `pt_machineHistory`（先行書 §3-2）
- 判定推移 `pt_decisionTimeline`（先行書 §3-3）
- P-EVIDENCE 設定値（先行書 §3-4）
- 店舗ランキング `pt_storeRanking`（**新規・本書追加**）
- ハンターランク `pt_hunterRank`（**新規・本書追加**）
- 通知ログ `pt_notificationLog`（**新規・本書追加**）
- 現在モード `pt_currentMode`（**新規・本書追加**）
- ダミーデータ切替 `pt_dataSource`（先行書 §4）

#### 計算ロジック（新規）

- P-EVIDENCE エンジン `src/evidence.js`（先行書 §5）
- 良台スコアリング関数（`evidence.js` 内）
- 店舗ランキング集計関数（実データ＋イベント情報の合成）
- ハンターランク XP 計算関数
- 「あと何回転で信頼度40%」の予測関数（**新規・本書追加**）

#### 外部連携（新規）

- GAS（P-EVIDENCE 数式）→ JavaScript 移植：**ユーザーからの数式共有が必須**（未提供）
- 位置情報 API（半自動モード切り替えの「ホール到着検出」、推測）
- イベント情報の外部ソース（**不明**。手動入力 or 何らかの API）

---

## 2. 全体アーキテクチャ設計

### 2-1. モード切り替えの仕組み

#### 管理場所
- `App.jsx` で `[currentMode, setCurrentMode] = useLS("pt_currentMode", "record")` を新規追加
- モード値：`"scout" | "select" | "record" | "analysis"`（設定タブは独立サブ画面として `"settings"` を追加してもよい、要検討）

#### コンポーネント構成（推奨）

```
App.jsx
└─ <ModeRouter currentMode={currentMode}>
   ├─ <ScoutDashboard />     ← currentMode === "scout"
   ├─ <SelectModeView />     ← currentMode === "select"
   ├─ <RecordModeView />     ← currentMode === "record"  ← 既存「実戦タブ」相当
   └─ <AnalysisDashboard />  ← currentMode === "analysis"
   <ModeTabBar onChange={setCurrentMode} />
```

> 既存 `Tabs.jsx` 内の `sessionSubTabs`（`rot/data/history/settings`）は **記録モード内の下位タブとして残す**。フッターのモードタブとは階層を分離する。

#### 半自動切り替えの実装方針

| シグナル | 実装方針 | 優先度 |
|---|---|---|
| 「実戦開始」ボタン押下 | 確実なシグナル。即 record モードへ提案モーダル表示 | 高（Phase 7） |
| 朝の起動（時刻ベース、推測：6:00-10:00） | 起動時に scout モード提案 | 中 |
| 夜の起動（推測：20:00以降） | analysis モード提案 | 中 |
| 位置情報（ホール到着） | Geolocation API。**バッテリ消費とプライバシー懸念**でデフォルト無効、設定で明示的に有効化 | 低（要検討、推測） |

**強制しない原則**：常にモーダルで提案し、ユーザーが拒否したら 24h はその提案を再表示しない（推測）。

### 2-2. データ構造の追加

新規キーは全て `pt_` プレフィックスで `useLS` に乗せる。既存キーは一切変更しない。

#### `pt_currentMode`
```ts
type Mode = "scout" | "select" | "record" | "analysis";
// init: "record"
```
- 保存場所：localStorage（`useLS`）
- 既存データとの関係：なし（新規）
- マイグレーション：未設定時はデフォルト `"record"` で既存ユーザー体験を維持

#### `pt_storeRanking`
```ts
interface StoreRankingEntry {
  date: string; // YYYY-MM-DD
  storeId: number;
  rank: number;
  expectedValue: number;  // 期待値（円）
  winRate: number;        // 0.0〜1.0
  verdict: "strong" | "neutral" | "weak";
  highlights: string[];   // 注目ポイント文字列配列
  source: "real" | "dummy" | "manual";
}
```
- 保存場所：`pt_storeRanking`
- 既存データとの関係：`stores` の id を参照（外部キー）
- マイグレーション：初回はダミーで埋める（Phase 3）
- **不明**：実データ生成ロジック（実績ベース／イベント情報／予測の重み付け）はユーザー要確認

#### `pt_machineHistory`（先行書 §3-2 を踏襲）
- そのまま

#### `pt_decisionTimeline`（先行書 §3-3 を踏襲）
- そのまま。記録モードの「直近イベント表示」のソースにもなる

#### `pt_hunterRank`
```ts
interface HunterRank {
  level: number;
  currentXp: number;
  totalXp: number;
  unlockedBadges: string[];
  lastActionAt: number; // timestamp
}
```
- 保存場所：`pt_hunterRank`
- XP 加算イベント（推測）：
  - 回転数1000回入力ごとに +10 XP
  - 大当たり1回 +20 XP
  - セッション完了 +50 XP
  - 7日連続稼働 +100 XP
- レベル式（推測）：`requiredXp(level) = 100 * level^1.5`
- 既存データとの関係：`archives` から派生集計可能（過去分は遡及加算）

#### `pt_notificationLog`
```ts
interface Notification {
  id: string;
  timestamp: number;
  kind: "verdict_change" | "confidence_milestone" | "hunter_levelup" | "mode_suggest";
  body: string;
  read: boolean;
}
```
- 保存場所：`pt_notificationLog`
- サイズ管理：最新200件保持、超過分は先頭から間引き

#### `Store.floors`（先行書 §3-1 を踏襲）
- そのまま

#### `pt_dataSource`（先行書 §4-2 を踏襲）
- そのまま

#### 既存データ構造との関係マトリクス

| 既存キー | 本書での扱い |
|---|---|
| `pt_rotRows` | **不変** |
| `pt_jpLog` | **不変**（`finalRealBalls` は HANDOVER で追加済み） |
| `pt_archives` | **不変**。読み取り側で派生集計を行う |
| `pt_stores` | **オプショナル追加のみ**（`floors?: Floor[]`） |
| `pt_machines` / `customMachines` | **不変** |
| `pt_sessionSubTab` | **不変**（記録モード内サブタブとして継続） |
| `pt_totalTrayBalls` ほか上皿補正系 | **不変** |
| `pt_currentMochiBalls`, `pt_currentChodama` | **不変** |

#### マイグレーション戦略

- 起動時に `useLS(key, init)` のデフォルト初期値で空のまま新キーを取得
- `stores[].floors` のような既存型への追加はオプショナル化＋取得時 `?? []` で補完
- 既存ユーザーが新版を起動しても、`currentMode` は `"record"`、`storeRanking` は空配列、`hunterRank` は Lv.1 から開始する
- データ破壊的変更は禁止。マイグレーション関数を専用ファイル化（推測：`src/migrations.js`）して各バージョンごとに冪等な追記関数を持たせる

### 2-3. P-EVIDENCE エンジンの移植戦略（先行書 §5 を踏襲・補強）

- 配置：`src/evidence.js`（新規・推測）。`logic.js` には**統合しない**（保護関数群への影響を避ける）
- 入力：`calcPreciseEV` の戻り値 ＋ 設定 ＋ 機種マスタ
- 出力：`{ trueBorder, posteriorMean, trialSufficiency, evAdjusted, scoreForRanking, reasons, predictedRotToConfidence40 }`
- 新規追加（本書）：`predictedRotToConfidence40`（あと何回転で信頼度40%に到達するかの予測）
- テスト：`src/__tests__/evidence.test.mjs`（`protected-fns.mjs` を参考に新規）
- 既存への組み込み：`ev` オブジェクトに `evidence` フィールドをオプショナルで追加。`KeyMetrics` / `ConfidenceBar` / `ReasonList` は `evidence` 優先表示、フォールバック既存値（後方互換）

**前提**：**GAS 数式の共有は未受領**。Phase 5 着手前に必須。共有まではダミー実装＋インターフェース固定で進める。

### 2-4. ダミーデータ戦略（先行書 §4 を踏襲）

- `src/dummyData.js`（新規・推測）に `getDummy*()` 関数群を集約
- `pt_dataSource: "dummy" | "real" | "auto"`（デフォルト `"auto"`）
- `useDataSource` カスタムフック（推測）に import を集約 → 削除時の影響を1ファイルに限定
- `<DummyDataBanner />` を該当画面上部に表示

**ダミーデータの保存場所**：
- 静的ダミー（決定論的）は `dummyData.js` 内のリテラルで保持
- 動的ダミー（日付ベースの揺らぎ）は関数の戻り値として生成

**本物との切り替え機構**：
- 各セレクタ側で `if (dataSource === "auto" && real.length === 0) return dummy()` の分岐
- 「これはダミー表示です」固定バナーで利用者に明示

---

## 3. Phase 分割と工程設計

### 3-0. Phase 一覧と推定工数

| Phase | 内容 | 期間（最短／現実的／最長） | モード | 主担当 |
|---|---|---|---|---|
| 0 | 基盤整備（モード切替・既存UIの「記録モード化」） | 1日／2日／4日 | 安全な本実装 | Claude Code |
| 1 | 記録モードの完成（モック準拠の視覚刷新） | 3日／1週間／2週間 | 見た目優先 | Codex 中心、Claude Code レビュー |
| 2 | 分析モード（既存データで可視化） | 1週間／2週間／3週間 | 安全な本実装 | Claude Code |
| 3 | 偵察モード（ダミーで先行実装） | 1週間／2週間／3週間 | 見た目優先 → 安全 | Codex（見た目）+ Claude Code（データ層） |
| 4 | 台選びモード（ヒートマップ＋良台TOP5） | 2週間／3週間／5週間 | 安全な本実装 | Claude Code 主、Codex 補助 |
| 5 | P-EVIDENCE移植（GAS → JS） | 2週間／3週間／6週間 | 安全な本実装 | Claude Code |
| 6 | 育成要素・通知（ハンターランク） | 1週間／2週間／3週間 | 安全な本実装 | Codex |
| 7 | 仕上げ（モード連携・半自動切替・全体調整） | 1週間／2週間／4週間 | 安全な本実装 | Claude Code |
| **合計** | | **約2ヶ月／3ヶ月／4.5ヶ月** | | |

### Phase 0: 基盤整備（1〜2日）

**目的**：モード切替の基盤を作る。既存UIを「記録モード」配下に整理。**データ・計算は一切変更しない**。

サブステップ：
1. モード状態管理の追加（`useLS("pt_currentMode", "record")`）
2. `ModeTabBar` の新規追加（フッター5タブ：偵察/台選び/記録/分析/設定）
3. 既存UIを「記録モード」配下に移動（`<RecordModeView>` でラップ）
4. 偵察／台選び／分析モードはプレースホルダー画面（「Coming soon」または空画面）で表示
5. モード切替時のスワイプ動作との整合性確認（既存スワイプは「記録モード内サブタブ」に限定）
6. `npm run lint && npm run build` エラー0確認

完了条件：
- フッターでモード切替するとプレースホルダーが表示される
- 既存の実戦タブの全機能が「記録モード」内で完全に動作する
- `logic.js`・`baseline.json`・`evDecision.js` 不変

影響範囲：`src/App.jsx`、`src/components/Tabs.jsx`、`src/index.css`。新規ファイル `src/components/ModeTabBar.jsx`、`src/components/RecordModeView.jsx`（推測）。

担当：**Claude Code**（基盤整備のため）

難易度：◯（既存UIをラップするだけ）

想定リスク：スワイプジェスチャと干渉する可能性。Phase 0 完了直後に実機で確認。

### Phase 1: 記録モードの完成（数日〜2週間）

**目的**：モックアップの「黒+ネオン」「業務端末感」を既存実戦タブに反映。

サブステップ（先行書 §Phase 1 を踏襲＋追加）：
1. ダークテーマ色トークンの統一（モック準拠の緑／黄／青／赤／灰）
2. 判断バッジの視覚刷新（大型化・グラデーション・サブメッセージ）
3. 信頼度の円グラフ表示（`ConfidenceCircularProgress` 新規）
4. KeyMetrics の2カード構成（ボーダー差・補正後EV/K）への絞り込み
5. 大型回転数入力（-10/+1/+10/+100/+500）の検討（**要ユーザー方針確定**：既存「入力」ボタン → keypad 維持か、モック準拠ボタン採用か）
6. 「大当たり入力」「持ち玉入力」の2大ボタン化
7. 直近イベント表示（`RecentEventList`）— ソースは `pt_decisionTimeline`（Phase 2 で本実装）と `jpLog` 末尾
8. ヘッダー（台番号・通知ベル・歯車）の整形
9. 「業務端末感」のフォント・余白統一

完了条件：
- モックアップ「記録モード」と視覚的に一致
- `logic.js`・`baseline.json` 不変
- `npm run lint && npm run build` エラー0
- 既存操作ステップ数が増えない

影響範囲：`src/components/decision/*`、`src/components/Tabs.jsx`、`src/index.css`

担当：**Codex 主体**（見た目優先プロトタイプ）、Claude Code がレビュー

難易度：△（CSS と JSX のみだが、片手操作性の維持確認が必要）

想定リスク：色トークン変更が他モード（プレースホルダー含む）に意図せず波及する。CSS 変数化を徹底。

### Phase 2: 分析モード（1〜3週間）

**目的**：既存 `archives` を使った可視化。`AnalysisDashboard` を実装。

サブステップ（先行書 §Phase 2 を踏襲＋追加）：
1. `archives` から日次収支配列を導出するセレクタを追加（純関数）
2. 月別／年別の集計セレクタ
3. 既存 `LineChart` を流用した収支推移グラフ
4. 指標サマリーカード（収支／回収率／稼働日数／勝率／仕事量／平均試行充足率）
5. 機種別成績TOP5（順位・機種名・収支・回収率）
6. タブ切替（日別／月別／年別）
7. 月選択UI（左右矢印で月送り）
8. 最新実戦履歴リスト

完了条件：
- 既存 `archives` 形式不変
- ダミーデータでも動作（空のときは「データが足りません」表示）

影響範囲：`src/components/analysis/`（新規・推測）、`src/components/Tabs.jsx` の `CalendarTab` 周辺

担当：**Claude Code 主**（集計ロジック）、Codex 補助（カードUI）

難易度：△（既存グラフ流用だが、集計関数の境界値テストが必要）

想定リスク：`archives` の生成タイミング（セッション終了時のみか日付跨ぎ時もか）が**要確認**。Phase 2 着手前にコード再確認。

### Phase 3: 偵察モード（1〜3週間）

**目的**：店舗ランキング画面。最初はダミーデータで完成イメージを作る。

サブステップ：
1. `ScoutDashboard` レイアウト構築（Bloomberg風）
2. `StoreRankingCard` 実装
3. `TodayHighlightList` 実装
4. タブ切替（本日予測／店舗実績／イベント）
5. ダミーデータ（5店舗、注目ポイント3〜5件）を `dummyData.js` に追加
6. 「店舗実績」タブは既存 `archives` から店舗別集計で実装可能
7. 「本日予測」タブはダミー固定（実データ移行は Phase 5 完了後）
8. 「イベント」タブは仕様未定で空表示（**不明**：イベント情報のソース）
9. 「更新時刻」表示と更新ボタン

完了条件：
- モックアップ「偵察モード」と視覚的に一致
- ダミーバナーで利用者に「これはダミー」と明示

影響範囲：`src/components/scout/`（新規・推測）

担当：**Codex 主**（UI）、Claude Code（データ層・集計セレクタ）

難易度：△（ダミー前提なら見た目作業中心）

想定リスク：実データへの移行時に「店舗実績」のデータ構造変更が必要になる可能性。最初から本物のスキーマで設計する。

### Phase 4: 台選びモード（2〜5週間・最重要）

**目的**：ヒートマップ＋良台TOP5。先行書 §Phase 4・§Phase 5 を統合。

サブステップ：
1. `Store.floors` のデータ構造定義（先行書 §3-1）
2. 島レイアウト編集UI（設定タブ内、数値入力ベースで簡易実装）
3. `HallHeatmap` SVG ベース描画
4. 色分けロジック（最有力＝緑、狙い＝黄、様子見＝橙、回収＝赤、データ不足＝灰）
5. 色の濃さ＝信頼度（透明度で表現）
6. タブ切替（全台／良台候補／実戦中のみ）
7. タップで詳細パネル表示（機種番号・予測回転率・ボーダー差・信頼度）
8. 「実戦開始」ボタン → 記録モードへ自動遷移（Phase 7 と連携）
9. `GoodMachineList`（TOP5、信頼度順）
10. 良台スコアリング関数（`evidence.js` 内、Phase 5 と連携）
11. 凡例（ヒートマップの見方）固定表示
12. ダミーレイアウトでの動作確認

完了条件：
- モックアップ「台選びモード」と視覚的に一致
- 店舗フロア未設定時は「フロア未登録」表示で破綻しない
- ダミーデータで全機能が動作

影響範囲：`src/components/select/`（新規・推測）、`Store` 型拡張、`evidence.js` の一部（スコアリング）

担当：**Claude Code 主**（SVG レイアウト・スコアリング）、Codex 補助（タイル装飾）

難易度：×（SVG レイアウト計算が複雑、スコアリングロジックは仕様確定が必要）

想定リスク：
- 良台スコアリングの定義（True Border 余裕 ＋ 試行充足率 ＋ データ蓄積量の合成式）が**未確定**。Phase 4 着手前に**要確認**
- 「島平均」「前日実績」の集計定義が**未確定**。要確認
- 島の物理隣接情報の必要性が**不明**。当面は線形配置で代替可能

### Phase 5: P-EVIDENCE移植（2〜6週間）

**目的**：GAS の数式群を `src/evidence.js`（新規）に移植。実データへの切り替え。

**前提**：GAS スプレッドシートの数式群を **ユーザーから共有してもらうことが必須**（未提供）。

サブステップ（先行書 §Phase 3 を踏襲＋追加）：
1. **GAS 数式の共有を受ける**（未着手の必須前提）
2. 大当たり後フロー サブステップ4・5 を先行消化（保留タスク）
3. `src/evidence.js` を新規作成。`logic.js` は不変。純関数で構成
4. 事前分布生成（機種マスタの理論ボーダー＋事前分布の重みから）
5. 事後分布更新（観測 netRot・jpCount からベイズ更新）
6. 試行充足率の段階表示ロジック
7. 削り係数の取り扱い（機種ごとに保持、デフォルト 0.90）
8. 真ボーダー計算
9. `predictedRotToConfidence40`（あと何回転で信頼度40%）の計算
10. 上皿補正過大増幅問題の解消（補正係数を `evidence.js` で吸収する案、要ユーザー方針確認）
11. `src/__tests__/evidence.test.mjs` 新規（境界値）
12. `ev` オブジェクトに `evidence` フィールドを追加（オプショナル、既存値不変）
13. `KeyMetrics` / `ConfidenceBar` / `ReasonList` を `evidence` 優先表示、フォールバック既存
14. ダミーデータから実データへの切り替え

完了条件：
- `baseline.json` 既存値が変わらない（`protected-fns.mjs` パス）
- `evidence.test.mjs` で境界値（観測ゼロ・大量データ・ボーダー差0）パス
- GAS との数値比較で相対誤差 1% 以内（GAS から数値出力サンプル提供前提・推測）

影響範囲：新規ファイル `src/evidence.js`・`src/__tests__/evidence.test.mjs`、既存表示コンポーネントの拡張

担当：**Claude Code**（数学的妥当性のレビューと境界値検証が必須）

難易度：×（最難関）

想定リスク：
- GAS 数式が未提供のまま着手すると後戻り工数が膨大
- 浮動小数の精度依存で再現できない式があり得る
- 機種ごとの分岐式がある場合、マッピング表が必要

### Phase 6: 育成要素・通知（1〜3週間）

**目的**：ハンターランク、XP、イベント通知の実装。モチベ維持の中核。

サブステップ：
1. `pt_hunterRank` データ構造の定義
2. XP 加算イベントの定義（推測：回転1000ごと、大当たり、セッション完了、連続日数）
3. レベル計算式の確定（要ユーザー方針確認、本書推測：`100 * level^1.5`）
4. `HunterRankBadge` コンポーネント（モードヘッダーや設定タブに配置）
5. レベルアップ時の演出（控えめなトースト、要ユーザー方針確認）
6. アーカイブから過去 XP を遡及加算（マイグレーション）
7. `pt_notificationLog` 実装
8. 通知種別：判定変化、信頼度マイルストーン到達、ハンターレベルアップ、モード切替提案
9. 通知ベル UI（記録モードヘッダー）
10. 通知設定（オン/オフ切替）

完了条件：
- ハンターランクが既存セッションから遡及計算される
- 通知は最小限（過剰な演出を避ける）
- 既存データに影響しない

影響範囲：新規 `src/components/hunter/`（推測）、`src/notifications.js`（推測）

担当：**Codex 主体**（演出・通知UI）、Claude Code（XP計算・マイグレーション）

難易度：△（XPとレベルの式設計に注意）

想定リスク：演出が過剰になり「業務端末感」を損なう可能性。Phase 6 着手前にデザイン方針確認。

### Phase 7: 仕上げ（1〜4週間）

**目的**：モード間連携、半自動切り替え、全体調整。

サブステップ：
1. モード遷移時のスクロール位置・状態の保持
2. 半自動切り替え：「実戦開始」ボタンから record モードへ
3. 半自動切り替え：起動時刻ベースの提案（朝→scout、夜→analysis）
4. 半自動切り替え：位置情報（オプショナル、デフォルト無効、要ユーザー方針確認）
5. ダミー／実データ切替UI（設定モード内）
6. 全画面の細部調整（余白・色・タイポグラフィの統一）
7. パフォーマンス検証（特にヒートマップ大量タイル描画）
8. PWA・オフライン動作確認
9. HANDOVER.md 更新
10. 完成判定基準（第7章）の確認

完了条件：
- 全モード間で違和感のない遷移
- 半自動提案がユーザーに「強制感」を与えない
- 完成判定基準すべて達成

影響範囲：全体

担当：**Claude Code**（統合と検証）

難易度：△（個別 Phase が完成していれば軽い）

想定リスク：半自動切り替えのトリガーが過剰だとユーザーが嫌う。デフォルトは控えめに。

---

## 4. Claude Code / Codex の併用戦略

### 4-1. 役割分担

| 作業種別 | 主担当 | 理由 |
|---|---|---|
| `logic.js` 変更・新規計算ロジック | **Claude Code** | 保護関数の検証・`baseline.json` の整合性確認が必要 |
| `evidence.js` 移植 | **Claude Code** | 数学的妥当性のレビューが必要 |
| データ構造設計・マイグレーション | **Claude Code** | 既存データとの互換性確認 |
| 集計セレクタ・派生データ計算 | **Claude Code** | 境界値テストが必要 |
| UIコンポーネントの新規作成（見た目主） | **Codex** | プロトタイピング速度を活かす |
| CSS・色トークン・装飾調整 | **Codex** | スタイル試作の反復に向く |
| アニメーション・演出 | **Codex** | 視覚的調整が中心 |
| テスト追加（`evidence.test.mjs` 等） | **Claude Code** | テスト設計と既存ハーネスとの整合性 |
| HANDOVER.md / ロードマップ更新 | **Claude Code** | 全体把握が必要 |
| バグ修正（実機検出） | 状況による | 計算系→Claude Code、UI→Codex |

### 4-2. 重複・衝突を防ぐ仕組み

- 着手前に**必ず HANDOVER.md とロードマップを再読**
- 同じ Phase 内のサブステップは**1ブランチに1サブステップ**を原則
- 並列着手が必要な場合は**ファイル単位で住み分け**（例：Codex は `src/components/scout/`、Claude Code は `src/evidence.js`）
- ブランチ命名で担当を明示（次節）

### 4-3. ブランチ運用

```
claude/roadmap-phase<N>-<サブステップ名>-<rand4>   # Claude Code 担当
codex/roadmap-phase<N>-<サブステップ名>-<rand4>    # Codex 担当
```

- 例：`claude/roadmap-phase0-mode-state-A3xz`、`codex/roadmap-phase1-verdict-badge-q9F2`
- マージのタイミング：サブステップ単位で PR 作成・レビュー・マージ（Phase まとめずに細かく）
- コンフリクト対策：共通ファイル（`Tabs.jsx`, `index.css`, `App.jsx`）に同時に手を入れない週次スケジュール

### 4-4. 共有情報

両ツールが参照すべきドキュメント（優先度順）：
1. `CLAUDE.md`（最重要・全体ルール）
2. `docs/HANDOVER.md`（直近の実装状況）
3. `docs/roadmap-hunter-ux.md`（本書・全体方針）
4. `docs/roadmap-mockup-impl.md`（先行書・詳細サブステップ）
5. `docs/decision-ui-design.md`（判断UI 設計書）

HANDOVER.md の更新タイミング：
- 各 PR マージ後に直近セクションを更新
- Phase 完了時に「直近の状態サマリー」を更新
- 担当：マージを実施したエージェント／ユーザー

進捗共有の方法：
- 各 Phase の完了時に PR 説明で**サブステップチェックリスト**を提示
- ハンターランクが Phase 6 で実装されたら、自分（開発体制）の進捗を仮想ハンターランクで可視化する（メタ・推測）

---

## 5. リスク評価と対策

### 5-1. 既存ユーザーデータの互換性

| リスク | 対策 |
|---|---|
| `finalRealBalls`・`pushAmount` 等の進行中追加データが新UIで参照されない | Phase 0 で「既存データの参照箇所」を `git grep` で網羅し、新UIで継承漏れがないことを確認 |
| `archives` の集計結果が分析モードで表示崩れ | Phase 2 着手前に `archives` のスキーマを再確認、空配列・1件・大量件で境界値検証 |
| 新キー追加時の初回読み出しでクラッシュ | `useLS(key, initialValue)` で必ず安全な初期値を渡す。`?? []`、`?? {}` で防御 |
| 既存ユーザーの localStorage が破損 | データエクスポート機能（既存）を Phase 0 で改めて動作確認、安全装置として記録 |

### 5-2. 開発期間中の不安定状態

- **記録モード（既存実戦タブ）は Phase 0 で完全に分離**。以降の Phase で他モードを触っても記録モードに影響しない設計
- **Phase 1 の視覚刷新は CSS 中心**。万一見た目が崩れても1〜2コミットで戻せる粒度
- **各 Phase 完了時点で `main` にマージできる粒度を維持**。仮にロードマップが途中で止まっても、その時点で実用に耐える
- 不安定が予想される変更（Phase 4・5）は実機検証を週次で実施

### 5-3. モチベーション維持の工夫

- **Phase 0 は最短1日**で「フッターにモードタブが現れる」可視変化を出す
- Phase 1 は最短3日で「黒+ネオン」の世界観に到達
- **ハンターランクは Phase 6 だが、簡易版を Phase 1 と並行で先行投入**することを推奨（Phase 1.5 として後述）
- 1〜2日サイクルで PR を作る運用
- Phase 4・5 は長丁場なのでサブステップごとに完成感を出す（ヒートマップが動く瞬間、ベイズ更新が反映される瞬間）

#### Phase 1.5（推奨追加）：ハンターランク先行投入

- 期間：2日
- 内容：ハンターランクのデータ構造とバッジ表示のみ実装。XP加算は「セッション完了」のみ
- 担当：Codex
- 効果：開発初期から育成感が体験でき、モチベが維持される
- リスク：仕様変更時に再計算が必要 → XP式が単純なら問題ない

### 5-4. Claude Code の利用量

- 1日あたりのトークン消費量予測（推測）：
  - Phase 0: 軽量（1〜2セッション）
  - Phase 1: 中（Codex 主体なので Claude Code 利用は限定）
  - Phase 2〜3: 中〜重（セレクタ実装・データ構造設計）
  - Phase 4: 重（SVGとスコアリング）
  - Phase 5: **最重**（数式移植・テスト・検証）
  - Phase 6: 軽〜中
  - Phase 7: 中

- **Codex への切り替えタイミング**：Claude Code の利用上限が近づいたら、見た目調整・装飾・テキスト調整を優先して Codex に振る
- 緊急時：Phase 5 の数式移植中に Claude Code が制限に達した場合、その日は中断して翌日再開（Codex に数式移植を依頼するのは推奨しない・推測）

### 5-5. 過去の修正が無駄になるリスク

- データ層と表示層を明確に分離することで対策
- 上皿補正（Step 1〜3）、プッシュ補正、初当たり回転数必須化、現金カード修正、大当たり後フロー Step1-3 は**すべて維持**
- 表示の見た目だけが変わっても、計算結果のソース（`ev.ev1KCorrected` 等）は不変
- Phase ごとの完了条件に「`logic.js` 不変・`baseline.json` 不変」を必須項目として明記

### 5-6. P-EVIDENCE 数式未提供のリスク

- Phase 5 着手前にユーザーから数式の共有を受ける（必須）
- 未受領のままなら Phase 5 着手を遅らせ、Phase 6（ハンターランク）を先行させる選択肢
- インターフェース（`evidence.js` の入出力）だけ Phase 4 完了時点で確定させておけば、Phase 5 着手時の手戻りは最小化できる

### 5-7. テスト基盤への影響

- `protected-fns.mjs` の `"SHARED CALC HELPERS"` マーカーを削除しない
- `baseline.json` の既存値は不変、新プロパティ追加のみ可
- 新規 `evidence.test.mjs` は独立に運用
- `logic.js` を変更する場合（保留タスクのサブステップ4等）は `baseline.json` 再生成と diff レビューを必ず実施

---

## 6. Phase 0 の具体的なサブステップ

Phase 0 は本ロードマップの土台となる「モード切替の基盤」を作る最重要 Phase。以下、最初の3サブステップを Claude Code に直接渡せるレベルまで詳細化する。

### サブステップ1：モード状態管理の追加

**対象ファイル**：`src/App.jsx`

**変更内容**：
- 新規 state を追加：`const [currentMode, setCurrentMode] = useLS("pt_currentMode", "record");`
- 型定義はコメントで明示（JSX なので TS 型注釈は不可）：
  ```js
  // currentMode: "scout" | "select" | "record" | "analysis" | "settings"
  ```
- `currentMode` を子コンポーネントに props で渡す（後続サブステップで使用）
- **既存の state・useEffect には一切手を入れない**

**変更しないもの**：
- `rotRows`, `jpLog`, `sesLog`, `playMode` などの既存 state
- `logic.js`, `evDecision.js`, `baseline.json`
- 既存の useLS キー（`pt_` 系すべて）

**完了条件**：
- アプリ起動後、`localStorage.getItem("pt_currentMode")` で `"record"` が取れる（既存ユーザーは初回起動時のみ）
- 値を `"scout"` 等に書き換えて再起動すると、その値が永続化されている
- `npm run lint && npm run build` エラー0
- `git diff --stat` で `src/App.jsx` のみ変更されていることを確認

**実装プロンプト例**：
> `src/App.jsx` に新規 state `currentMode` を `useLS("pt_currentMode", "record")` で追加してください。型は `"scout" | "select" | "record" | "analysis" | "settings"` のいずれかを取る文字列で、デフォルトは `"record"`。`currentMode` と `setCurrentMode` を子コンポーネントに props で渡す準備をしてください（実際の参照はサブステップ2以降）。既存の state・useEffect・useLS は一切変更しないこと。`logic.js`・`baseline.json` 不変。完了後 `npm run lint && npm run build` を実行しエラー0、`git diff --stat` で `src/App.jsx` のみ変更されていることを確認してください。

### サブステップ2：モード切り替えタブの実装

**対象ファイル**：
- 新規：`src/components/ModeTabBar.jsx`
- 修正：`src/App.jsx`、`src/index.css`

**変更内容**：
- `ModeTabBar` コンポーネントを新規作成
  - props: `{ currentMode, onChange }`
  - 5タブ：偵察 / 台選び / 記録 / 分析 / 設定
  - 各タブは48px以上のタップ領域（片手操作優先）
  - アイコン＋日本語ラベル（モックアップ準拠：ホーム/レーダー/記録/グラフ/歯車、推測）
  - 選択中のタブはアクセントカラーで強調
- フッター固定配置（`position: fixed; bottom: 0;`）
- `App.jsx` で `<ModeTabBar currentMode={currentMode} onChange={setCurrentMode} />` を最下部にレンダリング
- 既存の `Tabs.jsx` 内のフッターと**併存させない**（後続サブステップ3で既存フッターは記録モード内専用に変更）

**変更しないもの**：
- `Tabs.jsx` の内部実装（サブステップ3で扱う）
- `logic.js`, `baseline.json`
- 既存のスワイプジェスチャ実装（既存ロジックは保持。動作整合はサブステップ3後に確認）

**完了条件**：
- 画面下部に5タブが表示される
- 各タブをタップすると `currentMode` が変わり、画面上に「現在のモード：record」のような表示が更新される（デバッグ用、サブステップ3で本実装に置き換え）
- タップ領域が44px以上（推奨48px以上）
- `npm run lint && npm run build` エラー0
- `logic.js`・`baseline.json` 不変

**実装プロンプト例**：
> `src/components/ModeTabBar.jsx` を新規作成してください。props は `{ currentMode, onChange }`。5タブ（偵察/台選び/記録/分析/設定）を `position: fixed; bottom: 0;` で配置し、各タブのタップ領域は48px以上、選択中はアクセントカラーで強調。`src/App.jsx` の最下部にこのコンポーネントを `<ModeTabBar currentMode={currentMode} onChange={setCurrentMode} />` でレンダリングし、デバッグ用に画面上部に「現在のモード：{currentMode}」を一時表示してください（サブステップ3で除去）。CSS は `src/index.css` に `.mode-tab-bar` 系クラスで追加。既存の `Tabs.jsx` フッターはそのまま残し、サブステップ3で扱う。`logic.js`・`baseline.json` 不変。完了後 `npm run lint && npm run build` を実行しエラー0を確認、片手操作性（44px以上）を満たすことを確認してください。

### サブステップ3：既存UIを「記録モード」配下に移動

**対象ファイル**：
- 新規：`src/components/RecordModeView.jsx`
- 修正：`src/App.jsx`、（必要に応じて）`src/components/Tabs.jsx`

**変更内容**：
- `RecordModeView` を新規作成し、**現在の `<Tabs>` 全体をそのままラップする**
  - props: `{ currentMode, ...既存の全 props }`
  - 内部で既存 Tabs をそのままレンダリング
- `App.jsx` でモード分岐：
  ```jsx
  {currentMode === "record"   && <RecordModeView ...既存props />}
  {currentMode === "scout"    && <ScoutDashboard placeholder />}
  {currentMode === "select"   && <SelectModeView placeholder />}
  {currentMode === "analysis" && <AnalysisDashboard placeholder />}
  {currentMode === "settings" && <SettingsView placeholder />}
  ```
- プレースホルダー画面は単に「Coming soon」テキストでよい（Phase 1 以降で本実装）
- サブステップ2 で追加したデバッグ用「現在のモード」表示を削除

**変更しないもの**：
- `Tabs.jsx` の内部実装（既存のサブタブ・スワイプ動作・実戦UIは全て維持）
- `logic.js`, `baseline.json`, `evDecision.js`
- 既存ユーザーの localStorage キー

**完了条件**：
- `currentMode === "record"` の状態で既存の実戦タブの全機能が**完全に動作する**
- 他モードに切り替えるとプレースホルダーが表示される
- 記録モードに戻ると、サブタブ位置・回転数・大当たり履歴などの状態が完全に保持されている
- `npm run lint && npm run build` エラー0
- `node src/__tests__/protected-fns.mjs` がパス（`logic.js` 不変）
- `node src/components/decision/__tests__/evDecision.test.mjs` がパス
- 実機（PWA）で1セッション動かし、既存通り動作することを確認

**実装プロンプト例**：
> `src/components/RecordModeView.jsx` を新規作成し、既存の `<Tabs>` コンポーネント全体をそのままラップしてください（既存 props を全て passthrough）。`src/App.jsx` で `currentMode` に応じて `<RecordModeView>` または各モードのプレースホルダー（`<ScoutDashboard placeholder />` 等、中身は「Coming soon」テキストのみで構わない）をレンダリングするよう変更してください。プレースホルダーは `src/components/placeholders/` 配下にまとめて新規作成。サブステップ2で追加したデバッグ用「現在のモード」表示は削除。`Tabs.jsx`・`logic.js`・`baseline.json`・`evDecision.js` は変更しないこと。完了後、`npm run lint && npm run build`、`node src/__tests__/protected-fns.mjs`、`node src/components/decision/__tests__/evDecision.test.mjs` の3つを実行し全てパスすることを確認、`git diff --stat` で `Tabs.jsx`・`logic.js` 系に意図しない変更がないことを確認してください。

### Phase 0 完了後の確認チェックリスト

- [ ] フッター5タブが表示される
- [ ] タブをタップするとモードが切り替わる
- [ ] 記録モードでは既存の実戦タブが完全に動作する
- [ ] 他モードはプレースホルダーが表示される
- [ ] モード値が `pt_currentMode` で永続化される
- [ ] `npm run lint && npm run build` エラー0
- [ ] `protected-fns.mjs` パス
- [ ] `evDecision.test.mjs` パス
- [ ] 実機で1セッション動作確認済み

---

## 7. 完成イメージのドキュメント化

### 7-1. 主要画面（4モード＋設定の完成時）

完成時、5タブ構成で以下の画面が利用可能：

#### 偵察モード（朝・自宅）
- **画面トーン**：Bloomberg風、情報密度高め
- **構成**：店舗ランキングTOP5（カード形式、順位アイコン・期待値・勝率・判定ラベル）、本日の注目ポイント、タブ（本日予測/店舗実績/イベント）、更新時刻表示
- **データ源**：実装初期はダミー、Phase 5 完了後に実データ
- **想定操作時間**：10〜30秒

#### 台選びモード（ホール内・最重要）
- **画面トーン**：SFレーダー風、ダーク基調＋緑/黄/橙/赤のヒートカラー
- **構成**：機種名ヘッダー、台番号ヒートマップ（島レイアウト）、タブ（全台/良台候補/実戦中のみ）、良台候補TOP5、凡例、選択中の台パネル、「実戦開始」ボタン
- **データ源**：実装初期はダミーレイアウト、店舗フロア登録後は実データ
- **想定操作時間**：1〜3分

#### 記録モード（実戦中）
- **画面トーン**：業務端末風、シンプル、コントラスト高
- **構成**：大型判定バッジ（「継行推奨」等）、円グラフ信頼度、ボーダー差・補正後EV/Kの2カード、回転数入力ボタン（または既存「入力」ボタン）、「大当たり入力」「持ち玉入力」、直近イベントリスト
- **データ源**：実データのみ
- **想定操作時間**：随時、即記録

#### 分析モード（帰宅後）
- **画面トーン**：ダッシュボード型、グラフ中心
- **構成**：タブ（日別/月別/年別）、月選択、収支・回収率・稼働日数・勝率の4カード、収支推移ライングラフ、機種別成績TOP5
- **データ源**：既存 `archives` から集計
- **想定操作時間**：3〜10分

#### 設定モード
- **画面トーン**：システム設定風
- **構成**：機種マスタ、店舗設定（フロア/島レイアウト含む）、アプリ設定、P-EVIDENCEエンジン設定、データ管理（エクスポート/インポート）、ダミー/実データ切替、ハンターランク表示

### 7-2. 体験フロー（完成時の典型的な1日）

1. **朝7:30**：起床、自宅で偵察モードを開く → 店舗ランキングTOP5を確認 → 「マルハン○○店」に行くと決める
2. **朝9:30**：店舗到着、半自動切替モーダル「ホールに到着しました、台選びモードに切り替えますか？」→ 「切り替え」を選択
3. **9:35**：台選びモードでヒートマップを確認 → 緑タイル中の信頼度80%の台（番号776）をタップ → 詳細パネル「予測回転率22.1/K、ボーダー差+3.3」→ 「実戦開始」をタップ
4. **9:36**：自動的に記録モードに切り替わり、台情報（776番台、機種名）がヘッダーにセット済み → セッション開始
5. **実戦中（9:36〜13:00）**：玉を打ちながら回転数入力。判定が「継行推奨」を維持 → 直近イベントに「12:30 大当たり 確変3R」「12:15 信頼度40%到達」「12:10 ボーダー差+2.1→+3.3」が時系列で蓄積
6. **13:00**：判定が「様子見」に変わる → 円グラフ信頼度低下、ボーダー差悪化 → 通知ベル「判定が変化しました」→ セッション終了を判断
7. **20:00**：帰宅後、半自動切替で分析モード → 本日収支+12,400円、勝率データ更新 → 月別成績で今月+68,200円を確認
8. **21:00**：ハンターランクが Lv.23→Lv.24 にアップ、次のランクまで1,250 EXP

### 7-3. 完成判定基準

- [ ] 5モード（偵察/台選び/記録/分析/設定）が全て実装され、モックアップ画像と一致する情報が表示される
- [ ] モード切り替えタブが画面下部に常設されている
- [ ] 半自動モード切替提案が動作する（強制ではなく提案）
- [ ] ダミーデータと実データの切替が `pt_dataSource` 設定で動作する
- [ ] P-EVIDENCE 数式が `src/evidence.js` で動作し、`evidence.test.mjs` が全件パス
- [ ] ハンターランクが過去アーカイブから遡及計算され、適切なLvが表示される
- [ ] 通知（判定変化・信頼度マイルストーン・レベルアップ・モード切替提案）が動作する
- [ ] `logic.js` および `baseline.json` の既存値が無変更（`protected-fns.mjs` パス）
- [ ] `npm run lint` / `npm run build` 双方エラー0
- [ ] 既存の保留タスク（上皿補正過大増幅、大当たり後フロー サブステップ4〜8）が解消済みまたは現状維持で許容のいずれか明確化
- [ ] 既存ユーザーの localStorage データが互換性を保つ（マイグレーション動作確認）
- [ ] 片手操作性が維持されている（タップ領域 44px 以上）
- [ ] PWA 動作確認（オフライン起動、Service Worker キャッシュ）
- [ ] HANDOVER.md が更新され、本ロードマップのクローズ状態が記録される

---

## 付録 A. 既存実装の主要再利用ポイント（先行書 §付録A から拡張）

| モックアップ要素 | 既存実装の利用元 | 本書での Phase |
|---|---|---|
| 判断バッジ | `src/components/decision/VerdictBadge.jsx` | Phase 1 で視覚刷新 |
| 信頼度 → 試行充足率 | `src/components/decision/ConfidenceBar.jsx`（拡張） | Phase 1 でラベル変更、Phase 5 で本実装 |
| 補正後EV/K・生EV/K カード | `src/components/decision/KeyMetrics.jsx`（dual表示済） | Phase 1 でレイアウト変更 |
| なぜこの判定？ | `src/components/decision/ReasonList.jsx` | Phase 1 で表示形式調整 |
| グラフ全般 | `src/components/Tabs.jsx` 内 `LineChart` | Phase 2・5 で流用 |
| 機種マスタ | `src/machineDB.js`（19機種、`displayToReal` 含む） | Phase 5 で `evidence.js` の入力 |
| 店舗管理 | `src/App.jsx` の `stores` state | Phase 4 で `floors` 追加 |
| 持ち玉・現金投資・総回転数・大当り回数・実質投資 | `calcPreciseEV` の戻り値 | Phase 1〜2 で表示活用 |
| 上皿補正・補正後値 | `src/logic.js` 行 129-150（変更禁止） | Phase 1 で表示形式調整、Phase 5 で過大増幅問題解消 |
| 仕事量・時給 | `calcPreciseEV` の `workAmount`, `wage` | Phase 1〜2 で表示 |
| 判断ロジック | `src/components/decision/evDecision.js` | Phase 5 で `evidence` 連携 |
| プッシュ補正Step | `src/components/Tabs.jsx`（PR #161） | Phase 0 以降も維持 |
| 大当たり後フロー Step1-3 | `machineDB.js`、`Tabs.jsx`（PR #156-159） | Phase 5 着手前にサブステップ4-5 消化 |
| 初当たり回転数必須化 | `Tabs.jsx`（PR #162） | Phase 0 以降も維持 |
| 現金カード rawInvest 表示 | `Tabs.jsx`（PR #160） | Phase 0 以降も維持 |
| アーカイブ | `pt_archives`（既存） | Phase 2 で集計、Phase 3 で店舗別、Phase 6 で XP 遡及計算 |
| IndexedDB 永続化 | `useLS` / `persistence.js` / `db.js` | 不変 |
| PWA Service Worker | `vite-plugin-pwa`（PR #57） | Phase 7 で動作確認 |

## 付録 B. 不明点・要確認項目（チェックリスト）

| # | 項目 | 確認タイミング | 重要度 |
|---|---|---|---|
| 1 | P-EVIDENCE GAS 数式の共有 | Phase 5 着手前（**必須**） | ★★★ |
| 2 | 良台スコアリングの定義式 | Phase 4 着手前 | ★★★ |
| 3 | 「島平均」「前日実績」の集計定義 | Phase 4 着手前 | ★★ |
| 4 | 島の物理隣接情報の必要性 | Phase 4 着手前（当面は線形配置で代替可） | ★ |
| 5 | 上皿補正過大増幅問題の方針（持ち玉モード時スキップ／現金K分のみ補正） | Phase 5 着手前 | ★★ |
| 6 | 記録モードの回転数入力ボタンの方針（既存「入力」keypad維持／モック準拠 -10/+1/+10/+100/+500） | Phase 1 着手前 | ★★ |
| 7 | `archives` の集計タイミング | Phase 2 着手前 | ★★ |
| 8 | GAS 数値出力サンプル（テスト比較用） | Phase 5 テスト整備時 | ★★ |
| 9 | ハンターランクのレベル計算式の確定（本書推測式の妥当性） | Phase 6 着手前 | ★ |
| 10 | 半自動切替の位置情報利用方針（プライバシー・バッテリ） | Phase 7 着手前 | ★ |
| 11 | イベント情報のソース（偵察モードのイベントタブ） | Phase 3 着手前 | ★ |
| 12 | 通知の演出強度（業務端末感を保つ範囲） | Phase 6 着手前 | ★ |
| 13 | 大当たり後フロー サブステップ6〜8 の詳細 | Phase 5 着手前に調査レポート再読 | ★★ |

## 付録 C. 本書と先行書（roadmap-mockup-impl.md）の対応

| 先行書 Phase | 本書 Phase | 差分 |
|---|---|---|
| Phase 1（視覚プロトタイプ）+ Phase 1.B（rot/decision統合・完了済み） | Phase 0（基盤整備）+ Phase 1（記録モード） | 本書では Phase 0 でモード基盤を先に構築し、Phase 1 で記録モードを仕上げる |
| Phase 2（履歴・分析） | Phase 2（分析モード） | ほぼ同等 |
| Phase 3（P-EVIDENCE） | Phase 5（P-EVIDENCE） | 本書では偵察・台選びの先行投入を優先するため後ろ倒し |
| Phase 4（良台判定） | Phase 4（台選びモード）に統合 | TOP5＋ヒートマップを同一モード内で扱う |
| Phase 5（ヒートマップ） | Phase 4（台選びモード）に統合 | 同上 |
| Phase 6（統合・仕上げ） | Phase 7（仕上げ） | Phase 3（偵察）と Phase 6（育成・通知）を間に追加 |
| ー | Phase 3（偵察モード）— 本書追加 | 朝の店舗選定UIを独立 Phase 化 |
| ー | Phase 6（育成・通知）— 本書追加 | ハンターランク・通知の独立 Phase 化 |

---

**本書はコード変更を含まない。次セッションで Phase 0 サブステップ1 から実装を開始する場合、第6章の実装プロンプト例をそのまま渡せばよい。** Phase 0 完了後は本書第3章の Phase 1 以降の方針と、先行書 `docs/roadmap-mockup-impl.md` の詳細サブステップを併用して進める。
