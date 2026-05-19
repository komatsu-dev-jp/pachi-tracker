# HANDOVER.md — Pachi Tracker 引き継ぎドキュメント

最終更新: 2026-05-19（初当たり入力フロー改修の設計ドキュメント `docs/input-flow-design.md` を新規作成。コード変更なし）

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
  App.jsx                       # 状態一元管理（useState / useLS）+ モードルーター
  machineDB.js                  # 機種マスタ（displayToReal フィールド含む）
  persistence.js                # IndexedDB(Dexie) バック memCache
  db.js                         # Dexie DB 定義
  snapshot.js                   # セッション復元保証
  dummyData.js                  # 偵察/台選びモード等のダミーデータ生成
  constants.js                  # 配色 C / フォント / ヘルパー
  index.css                     # ダークネイビー配色（モック2準拠）
  notifications.js              # 通知ログヘルパー（Phase 6、純関数）
  components/
    Atoms.jsx                   # 共通UIパーツ
    Tabs.jsx                    # 記録モード内の主要UI（実戦タブ統合済み・通知ベル含む）
    ModeTabBar.jsx              # フッター5タブ（偵察/台選び/記録/分析/設定）
    ModePlaceholder.jsx         # 旧プレースホルダー（未実装モード用、現在 select では未使用）
    NotificationPanel.jsx       # 通知ボトムシート（Phase 6）
    decision/
      evDecision.js             # 判断ロジック（純粋関数）
      DecisionTab.jsx           # 判断UI コンテナ（実戦タブ内に統合）
      VerdictBadge.jsx          # 判定バッジ（大型化・円形信頼度リング）
      ConfidenceBar.jsx         # 信頼度バー
      KeyMetrics.jsx            # 主要指標カード
      ReasonList.jsx            # 判断根拠リスト
      RecentEventList.jsx       # 直近イベント表示（Phase 1.7）
      __tests__/
        evDecision.test.mjs     # 判断ロジックテスト
    scout/                      # 偵察モード（Phase 3）
      ScoutDashboard.jsx
      StoreRankingCard.jsx
      TodayHighlightList.jsx
      scoutSelectors.js
    analysis/                   # 分析モード（Phase 2）
      AnalysisDashboard.jsx
      analysisSelectors.js
    select/                     # 台選びモード（Phase 4、ホール図面風ヒートマップ）
      SelectDashboard.jsx
      selectSelectors.js
      __tests__/
        selectSelectors.test.mjs
    hunter/                     # ハンターランク（Phase 6 本実装版 + バッジ解放）
      hunterRank.js             # 純関数（XP加算・レベル導出・マイグレーション・連続日数）
      HunterRankBadge.jsx       # 設定モードトップに表示するバッジ
      LevelUpToast.jsx          # レベルアップ時の控えめなトースト（Phase 6）
      badges.js                 # バッジ定義 + 純関数（computeBadgeMetrics / evaluateBadgeUnlocks / unlockBadges）
      BadgeList.jsx             # 設定モード内のバッジ一覧UI（獲得/未獲得）
      __tests__/
        hunterRank.test.mjs
        badges.test.mjs         # バッジ解放テスト 20 件
  __tests__/
    protected-fns.mjs           # 保護関数境界値ハーネス
    baseline.json               # 完全一致テスト基準値
docs/
  HANDOVER.md                   # 本ファイル
  decision-ui-design.md         # 判断ファーストUI 設計書
  roadmap-mockup-impl.md        # モックアップ完全再現ロードマップ（先行書）
  roadmap-hunter-ux.md          # 狩猟型UX進化ロードマップ（Phase 0〜7、上位ガイド）
```

### 2-2. 状態管理

`App.jsx` の `useState` / `useLS` で状態を一元管理。

- `useLS(key, init)` = IndexedDB バックの永続化 hook（API シグネチャ不変）
- `rotRows` が回転数の唯一の真実源（SSoT）
- 主要な状態:
  - `rotRows` / `startRot` — 回転入力データ
  - `jpLog` — 大当たり記録（v3チェーン構造、`finalRealBalls` / `pushAmount` 追加済み）
  - `rentBalls` / `exRate` / `synthDenom` / `rotPerHour` / `border` — 設定
  - `spec1R` / `specAvgRounds` / `specSapo` — 機種スペック
  - `totalTrayBalls` — 上皿玉補正用
  - `currentMode` — フッター5タブの現在モード（`useLS("pt_currentMode", "record")`）
    - 取りうる値: `"scout" | "select" | "record" | "analysis" | "settings"`
    - `App.jsx:465-476` で `currentMode` ごとに対応コンポーネントを切替
    - 既存の `sessionSubTabs` は記録モード内の下位タブとして継続使用
  - `hunterRank` — ハンターランク（Phase 6 本実装版）。`useLS("pt_hunterRank", initialRank())`
    - 構造: `{ level, currentXp, totalXp, unlockedBadges, lastActionAt }`
    - 表示時は `deriveRankFromTotalXp(totalXp)` で `nextRequired` を再導出
    - XP 加算は `grantXp(amount, reason)` ヘルパー経由（`addXpWithLevelUp` でレベルアップ検出）
    - トリガー: セッション完了 +50 / 大当たり +20 / 通常回転 1000 ごと +10 / 7日連続 +100
    - `pt_hunterRankMigrated` フラグで初回のみ `archives.length × 50` を遡及加算
  - `hunterCounters` — XPトリガー検出カウンタ。`useLS("pt_hunterCounters", { ... })`
    - `countedHits` — XP 計上済みの大当たり累計（`jpLog` の hits 総数と比較し増分にXP加算）
    - `countedRotKilo` — XP 計上済みの 1000 回転マイルストーン数（`ev.netRot` から導出）
    - `lastDate` — 最終加算日（YYYY-MM-DD）
    - `streakDays` — 連続日数
    - 初回マイグレーション時に既存 hits/netRot を「既計上」として記録し、二重加算を防止
    - `resetAll` で countedHits/countedRotKilo を 0 にリセット（次セッションは新規に数え直す）
  - `notificationLog` — 通知ログ（Phase 6）。`useLS("pt_notificationLog", [])`
    - 先頭が最新、最大 50 件（`NOTIFICATION_LOG_MAX`）
    - 種別: `NOTIF_LEVEL_UP` / `NOTIF_XP_GAINED` / `NOTIF_STREAK` / `NOTIF_VERDICT_CHANGE` / `NOTIF_BADGE_UNLOCKED`
  - `hunterRank.unlockedBadges` — 獲得済みバッジ ID 配列（Phase 6 バッジ解放）
    - 12 種: `first_jp` / `sessions_10` / `sessions_50` / `lv5` / `lv10` / `lv25` / `xp_10k` / `streak_3` / `streak_7` / `streak_30` / `rot_10k` / `jp_100`
    - 解放判定は `App.jsx` の useEffect で `rank.level / totalXp / streakDays / archives.length / totalHits / ev.netRot` を監視
    - 解放時に `unlockBadges(rank, ids)` で `BADGES` 定義順に並び替えて追加 + `NOTIF_BADGE_UNLOCKED` 通知発火
    - 未知 ID は末尾保持（将来互換）
  - 判定変化通知 — `App.jsx` 内 `prevVerdictRef` + `lastVerdictNotifyRef` で観測
    - verdict 変化時に `NOTIF_VERDICT_CHANGE` を発火（`{prev}→{new}` の日本語ラベル付き）
    - 同 verdict への 5 分以内の往復はノイズ抑制（`VERDICT_NOTIFY_COOLDOWN_MS`）
    - `sessionStarted=false` でリセット、初回観測（prev=null）は基準値登録のみ

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
| 4 | ✅ 完了（PR #188 マージ済み） | `calcPreciseEV` の `totalNetGain` 集計に分岐追加。<br>`chain.finalRealBalls !== undefined` のとき実測ベース netGain（`finalRealBalls − trayBalls`）を採用、未設定なら液晶ベース（`summary.netGain`）にフォールバック。<br>新規プロパティ `totalNetGainDisplay` / `totalNetGainReal` / `realMeasuredChainCount` を `calcPreciseEV` の返り値に追加。<br>ブランチ: `claude/hunting-system-continuation-A6x6u`（マージコミット `f2df54a`） |
| 5 | ✅ 完了（PR #188 マージ済み） | `baseline.json` 再生成。既存値は不変、新ケース `evFinalRealBallsMixed` と新プロパティのみ追加。<br>`node src/__tests__/protected-fns.mjs` で出力決定的を確認。<br>ブランチ: `claude/hunting-system-continuation-A6x6u`（マージコミット `f2df54a`） |
| 6〜8 | ⏸️ 保留 | 詳細は調査レポート参照 |

#### 関連ドキュメント

- 調査レポート: ブランチ `claude/investigate-jackpot-flow-IXTu2` 内
- 影響ファイル一覧: 調査レポート末尾「参照ファイル・行番号サマリー」を参照

### 2-6. 狩猟型UX進化（Phase 0〜4 進行中）

`docs/roadmap-hunter-ux.md` の 8 段階ロードマップを基準に進行中。
モード切替は `App.jsx:465` の `currentMode` 分岐で管理。

| Phase | 状態 | 内容 | コミット / PR |
|---|------|------|---|
| 0 | ✅ 完了 | 5タブのモード切替フッター導入。`pt_currentMode` 状態追加、`ModeTabBar` 新規 | `bae1cfe` / PR #179 |
| 1 | ✅ 完了 | モックアップ準拠の判断UI視覚刷新（全7サブステップ） | `72cfefb` / PR #172 |
| 1.B | ✅ 完了 | 判断タブと回転入力タブを実戦タブに統合（クイック入力 +1/+5/+10/+25 廃止、テンキーをbottom sheet化） | `979f9f2` / PR #173 |
| 1.5 | ✅ 完了 | 判定バッジの大型化＋円形試行充足率リング | `42f6b85` / PR #176 |
| 1.6 | ✅ 完了 | モックアップ2準拠のダークネイビー配色刷新 | `1cae238` / PR #177 |
| 1.7 + 1.8 | ✅ 完了 | 記録モードに直近イベント表示（`RecentEventList`）と通知ベル/歯車ショートカット追加 | `702a932` / PR #180 |
| 2 | ✅ 完了 | 分析モードを収支分析ダッシュボード（`AnalysisDashboard` + `analysisSelectors`）に刷新 | `5de0c86` / PR #181 |
| 3 | ✅ 完了 | 偵察モードを店舗ランキング画面（`ScoutDashboard` + ダミーデータ）に刷新 | `b5dc141` / PR #182 |
| 4 | ✅ 完了（ダミー） | 台選びモード（ホール図面風ヒートマップ＋良台TOP5）。`SelectDashboard` + `selectSelectors` + ダミー島データ | PR #184・#185・#186 |
| 5 | ⏸️ 未着手 | P-EVIDENCE 移植（GAS → JS）。**GAS 数式の共有が必須** | ー |
| 6 (1.5 先行投入) | ✅ 完了 | ハンターランク簡易版（`pt_hunterRank` + `HunterRankBadge`）。XP加算は「セッション完了 +50」のみ | PR #189（マージ済み） |
| 6（本実装） | ✅ 完了 | 複数XPトリガー（大当たり +20・回転1000ごと +10・7日連続 +100）、レベルアップトースト、`pt_notificationLog` + `NotificationPanel`、通知ベル本実装（未読件数バッジ） | PR #190（マージ済み） |
| 6（バッジ解放） | ✅ 完了 | 12種バッジ定義（Lv/累計EXP/連続日数/累計回転/累計大当たり/セッション数）、`unlockedBadges` 配列の活用、設定モード内バッジ一覧UI、`NOTIF_BADGE_UNLOCKED` 通知 | ブランチ: `claude/hunting-system-continue-U0yhI` |
| 6（判定変化通知） | ✅ 完了 | `evDecision` の verdict 変化を `prevVerdictRef` で観測、5分以内の同 verdict 往復は抑制、`NOTIF_VERDICT_CHANGE` 通知 | ブランチ: `claude/hunting-system-continue-U0yhI` |
| 7 | ⏸️ 未着手 | モード連携・半自動切替・全体調整 | ー |

#### Phase 関連の新規ファイル

- `src/components/ModeTabBar.jsx` — フッター5タブ
- `src/components/ModePlaceholder.jsx` — 未実装モード（select）プレースホルダー
- `src/components/decision/RecentEventList.jsx` — 直近イベント（`jpLog` + `sesLog` をマージ）
- `src/components/scout/` — 偵察モード一式（`ScoutDashboard`, `StoreRankingCard`, `TodayHighlightList`, `scoutSelectors.js`）
- `src/components/analysis/` — 分析モード一式（`AnalysisDashboard`, `analysisSelectors.js`）
- `src/components/select/` — 台選びモード一式（`SelectDashboard`, `selectSelectors.js`, `selectSelectors.test.mjs`）
  - `SelectDashboard.jsx` はホール図面風マップを表示（3島・両面台列・通路/壁線・本命台の星・選択台発光）
  - `onStart` で選択台番号/機種名を反映し、未稼働状態ならセッション開始行とスタートログを作成して記録モードへ遷移
- `src/dummyData.js` — `getDummyStoreRanking`, `getDummyHighlights`, `getDummyIslandMachines`, `todayKey`, `timeLabel`

#### 配色変更（PR #177）

`src/index.css` の CSS 変数を「ブルー寄りダークネイビー」に統一。
ダーク／ライト両テーマで `--bg`, `--surface`, `--accent` 等を再定義。
`src/constants.js` の `C.*` は `var(--*)` への参照なので、新色は CSS 側を編集すれば全コンポーネントに伝播する。

#### モード切替ロジック（App.jsx:465-476 抜粋）

```jsx
{currentMode === "scout"    && <ScoutDashboard S={S} />}
{currentMode === "select"   && <SelectDashboard S={S} onStart={...} />}
{currentMode === "record"   && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
{currentMode === "analysis" && <AnalysisDashboard S={S} ... />}
{currentMode === "settings" && <SettingsTab s={S} onReset={resetAll} />}
<ModeTabBar currentMode={currentMode} onChange={setCurrentMode} />
```

`logic.js` / `baseline.json` / `evDecision.js` はこの Phase 全期間で**不変**。
全変更は UI 層・新規セレクタ・ダミーデータ層のみ。

### 2-7. 完了した追加機能

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

#### Codex プロトタイプ統合 + 上皿補正の判断UI反映（✅ PR #165 マージ済み）

- Codex 製プロトタイプを取り込み、判断UIで補正後値を確実に使うよう統一
- `CLAUDE.md` に「UI開発フェーズの分離ルール」を追記（コミット `117c136`）

#### PWA 更新フロー修正（✅ PR #166・#167・#168 マージ済み）

- **問題**: vite-plugin-pwa の `registerType: autoUpdate` ではUIが更新されない
- **修正**: `registerType: prompt` に変更し、更新バナーをボトムシート形式に統一
- 関連コミット: `6480867`, `30b408a`, `7a5c922`

#### 新規稼働画面の刷新（✅ PR #168 マージ済み）

- 機種未選択時の画面を空状態 + ピル形ボタンに刷新
- 機種選択をボトムシートに切替（片手操作性向上）
- コミット: `ae19b48`

#### 連チャン入力ウィザード表示修正（✅ PR #170 マージ済み）

- `FlowStatusCard` が flex コンテナ内で縮んで隠れる問題を修正
- コミット: `a6f9e42`

#### 判定バッジ「ヤメ」表示修正（✅ PR #175 マージ済み）

- 太字日本語フォントメトリクスで上下クリップされる問題を修正
- コミット: `a7861b2`

#### 判定バッジのコンパクト化（✅ PR #174 マージ済み）

- 入力シートとバッジの重なり修正、サイズ調整
- コミット: `8801373`

#### 初当たりボタンが押せないバグ修正（✅ 本ブランチ）

- **問題**: Phase 1.B（PR #173）でテンキーを bottom sheet 化した際、
  - 「入力」ボタン → bottom sheet を開いてテンキー表示
  - 「初当たり」ボタン → `handleStartChain` を直接呼ぶだけ
  という構造になり、初当たり押下時に `input` 文字列が空のため
  「総回転数を入力してください。」アラートが出て、テンキーに到達できない不具合が発生
- **修正方針（現行の bottom sheet 構造に整合）**:
  - `inputSheetMode` state（`"count"` / `"jackpot"`）を新設
  - 「入力」ボタン → mode=`"count"` で bottom sheet を開く（従来通り `decide` を実行）
  - 「初当たり」ボタン → mode=`"jackpot"` で同じ bottom sheet を開く
  - bottom sheet 内の「決定」ボタンは mode により挙動を切替
    - `"count"`: 従来通り `decide`、ラベル「決定」
    - `"jackpot"`: `handleStartChain` を実行、ラベル「初当たりを記録」
  - 見出しも mode により「回転数を入力」/「初当たり回転数を入力」へ切替（jackpot 時は橙色）
  - `handleStartChain` のバリデーション失敗は `alert()` ではなく
    `setInputError()` でシート内インライン表示に変更（jarring な alert を回避）
  - 成功時は `setShowInputSheet(false)` でシートを閉じてからウィザード起動
- **変更ファイル**: `src/components/Tabs.jsx`
- **不変**: `logic.js` / 計算式 / `evDecision.js` / 保存データ構造はすべて未変更
- **操作ステップ**: 1ステップ増（「初当たり」タップ → テンキー入力 → 決定）。
  Phase 1.B 以前の挙動とほぼ同等（テンキーが画面下部に出る）。`lint` `build` 共にエラー 0。

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

### 完了済み（〜2026-05-15）

- ✅ 計算精度問題①（ラベルとウィザード順序）解決（PR #147）
- ✅ 判断ファーストUI 実装（PR #144〜#146）
- ✅ 上皿補正 Step 1〜3（PR #148〜#154）
- ✅ protected-fns.mjs 修復（PR #149）
- ✅ baseline.json 再生成（PR #150）
- ✅ 履歴削除バグ修正（PR #155）
- ✅ 大当たり後フロー サブステップ1〜3（PR #156・#158・#159）
- ✅ 現金カード 0円表示バグ修正（PR #160）
- ✅ プッシュ補正Step 追加（PR #161）
- ✅ 初当たり回転数必須化（PR #162）

### 完了済み（2026-05-15〜2026-05-19、本期間）

- ✅ Codex プロトタイプ統合 + 上皿補正の判断UI反映（PR #165）
- ✅ PWA 更新バナー修正一式（PR #166・#167・#168）
- ✅ 新規稼働画面の空状態+ピル形ボタン刷新、機種選択のボトムシート化（PR #168）
- ✅ 連チャン入力ウィザード `FlowStatusCard` 表示修正（PR #170）
- ✅ モックアップ完全再現ロードマップ追加（PR #171）
- ✅ モックアップ準拠の判断UI視覚刷新（Phase 1 全7サブステップ、PR #172）
- ✅ 判断タブと回転入力タブを実戦タブに統合（Phase 1.B、PR #173）
- ✅ 判定バッジのコンパクト化と入力シートの重なり修正（PR #174）
- ✅ 判定バッジ「ヤメ」表示問題修正（PR #175）
- ✅ 判定バッジ大型化＋円形試行充足率リング（PR #176）
- ✅ ブルー寄りダークネイビー配色刷新（PR #177）
- ✅ 狩猟型UX進化ロードマップ追加（PR #178）
- ✅ 狩猟型UX Phase 0 - 5タブのモード切替フッター（PR #179）
- ✅ 狩猟型UX Phase 1.7+1.8 - 直近イベント表示と通知ベル/歯車（PR #180）
- ✅ 狩猟型UX Phase 2 - 分析モード（収支分析ダッシュボード）（PR #181）
- ✅ 狩猟型UX Phase 3 - 偵察モード（店舗ランキング画面、ダミーデータ）（PR #182）
- ✅ 狩猟型UX Phase 4 - 台選びモード（ホール図面風ヒートマップ + 良台TOP5、ダミー）（PR #184・#185・#186）
- ✅ 大当たり後フロー サブステップ4・5（`calcPreciseEV` 実測ベース netGain 分岐 + baseline.json 再生成）（PR #188）
- ✅ Phase 6 簡易先行投入版（ハンターランク `pt_hunterRank` + `HunterRankBadge`、PR #189）
- ✅ Phase 6 本実装：複数XPトリガー（大当たり/回転1000/連続日数）・`addXpWithLevelUp`・`applyDailyStreak`・レベルアップトースト・`pt_notificationLog` + `NotificationPanel`・通知ベル本実装（PR #190）
- ✅ Phase 6 バッジ解放：12種バッジ定義・`evaluateBadgeUnlocks` / `unlockBadges` / `computeBadgeMetrics` 純関数・`BadgeList` UI・`NOTIF_BADGE_UNLOCKED` 通知（本ブランチ `claude/hunting-system-continue-U0yhI`）
- ✅ Phase 6 判定変化通知：`evDecision` の verdict 推移を `prevVerdictRef` で観測、5分以内の同 verdict 往復抑制、`NOTIF_VERDICT_CHANGE` 通知（本ブランチ `claude/hunting-system-continue-U0yhI`）
- ✅ 大当たりタブの「稼働ログ」サブタブを UI のみ削除（`sesLog` データ自体は `RecentEventList` が継続利用するため保持）。`Tabs.jsx` のアクティブセッション側と `HistoryTab` 側の両方からサブタブバー＋ses表示ブロックを除去し、`historySub` / `sub` の useState、`HistoryTab` の `delSesLast` / `sesLog` propsも未参照になったため削除（本ブランチ `claude/fix-jackpot-page-layout-mkd6t`）
- ✅ ヘッダーのサマリーカードを実績軸「総回転 / 現在ハマり / 時給 / 初当」に刷新。下の `KeyMetrics` と重複していた「回転率 / EV/K / 仕事量」を置換。`現在ハマり` は `rotRows` 末尾の `cumRot` − 最後の `type === "start"` 行の `cumRot`（rotRows 由来の派生のみで `logic.js` 不変）。`時給` は既存 `evEff.wage` を流用（本ブランチ `claude/fix-jackpot-page-layout-mkd6t`）
- ✅ 初当たり入力フロー改修の設計ドキュメント `docs/input-flow-design.md` を新規作成（本ブランチ `claude/create-input-flow-design-vtV30`）。コード変更なし。新フロー（1画面5項目・開始上皿玉必須化・連チャン時の自動引き継ぎ・出玉プリセット）の画面構成・データモデル・実装ステップ案を整理。`logic.js`/`baseline.json`/`evDecision.js` 不変方針

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

**対応方針**: ロードマップ Phase 5（P-EVIDENCE 移植）の冒頭で吸収する案を推奨。
他タスクが落ち着いたら改めて判断。

### 保留タスク2：大当たり後フロー サブステップ6以降

**サブステップ4**: ✅ 完了（PR #188 マージ済み）。`calcPreciseEV` の `totalNetGain` 集計に `finalRealBalls` 分岐を追加

**サブステップ5**: ✅ 完了（PR #188 マージ済み）。`baseline.json` 再生成。新ケース `evFinalRealBallsMixed` 追加で実測ベース分岐を検証

**サブステップ6〜8**: 調査レポート参照（ブランチ: `claude/investigate-jackpot-flow-IXTu2`）。**次の作業着手時に再調査が必要**

**重要**: ロードマップ Phase 5（P-EVIDENCE 移植）は実測ベースの netGain を必要とする。サブステップ4・5 完了により、`avgNetGainPerJP` と `measuredBorder` は `finalRealBalls` 設定時に実測ベースで計算される。

### 保留タスク3：狩猟型UX Phase 4 以降

`docs/roadmap-hunter-ux.md` 参照。次に着手すべきは以下のいずれか：

- **Phase 4**: 台選びモード（ホール図面風ヒートマップ + 良台TOP5）
  - ダミー島データによる UI は実装済み（PR #184）
  - 台選びから「この台で実戦開始」を押した時に、未稼働状態でも記録モードの実戦中画面へ入る修正済み（PR #185）
  - 参照画像に合わせ、単純なタイル表からホール図面風マップへ刷新済み（PR #186）
  - 2026-05-19 にユーザー確認済み。「いい感じ」とフィードバックあり
  - 良台スコアリングの定義式・「島平均」「前日実績」の集計定義は**未確定**（実データ化前に要ユーザー確認）
- **Phase 5**: P-EVIDENCE 移植
  - GAS スプレッドシートの数式群を **ユーザーから共有してもらうことが必須**
  - 共有まではインターフェース固定でダミー実装のまま進行可
- **Phase 6 バッジ解放**: ✅ 完了（本ブランチ）
  - 12 種バッジ + 解放判定 + 設定画面一覧 + 通知
  - 追加バッジ案（将来の拡張）: 「機種マスター（同一機種で N セッション）」「店舗エキスパート（同一店舗で N セッション）」「高仕事量達成（1セッション workAmount 上位）」など
- **Phase 6 判定変化通知**: ✅ 完了（本ブランチ）
  - verdict 推移検出 + 5 分往復抑制 + 通知発火
  - 残課題候補: 「判定変化のトーストを実装するか」「ヤメ通知に振動・音を付けるか」などの演出強化（要ユーザー方針確認）
- **Phase 7**: モード連携・半自動切替・全体調整

### 保留タスク4：偵察モードのダミー → 実データ切替

`src/components/scout/ScoutDashboard.jsx` は現在 `dummyData.js` の `getDummyStoreRanking` を使用。
実データ化には:

- `pt_storeRanking` キーの追加（`useLS`）
- 「店舗実績」タブは既存 `archives` から店舗別集計で実装可能
- 「本日予測」タブは Phase 5（P-EVIDENCE）完了後に実データ化
- 「イベント」タブのデータソースは**未定**

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

### 直近の主要コミット（〜2026-05-19、origin/main）

```
2968730 Merge pull request #182  狩猟型UX Phase 3 - 偵察モード（店舗ランキング）
b5dc141 feat(scout): 狩猟型UX Phase 3 - 偵察モードを店舗ランキング画面に刷新
ee3fb5b Merge pull request #181  狩猟型UX Phase 2 - 分析モード
5de0c86 feat(analysis): 狩猟型UX Phase 2 - 分析モードを収支分析ダッシュボードに刷新
21a9262 Merge pull request #180  Phase 1.7 + 1.8 - 直近イベント・通知ベル・歯車
702a932 feat(ui): 記録モードに直近イベント表示と通知ベル/歯車ショートカットを追加
556c6ad Merge pull request #179  狩猟型UX Phase 0 - 5タブ
bae1cfe feat(ui): 狩猟型UX Phase 0 - 5タブのモード切替フッターを導入
04631de Merge pull request #178  狩猟型UX ロードマップ
4f80a8f docs: 狩猟型UX進化ロードマップ（Phase 0〜7）を新規作成
960dcbe Merge pull request #177  ダークネイビー配色刷新
1cae238 style(ui): モックアップ2準拠のブルー寄りダークネイビー配色に刷新
3461e4c Merge pull request #176  判定バッジ大型化＋円形リング
42f6b85 feat(ui): 判定バッジを大型化＋円形試行充足率リングに刷新（モックアップ準拠）
8e3f4e5 Merge pull request #175  「ヤメ」表示修正
a7861b2 fix(ui): 判定バッジ「ヤメ」が太字日本語フォントメトリクスで上下クリップされる問題を修正
b7380dc Merge pull request #174  判定バッジコンパクト化
8801373 fix(ui): 判定バッジのコンパクト化と入力シートの重なり修正
0db9fc3 Merge pull request #173  実戦タブ統合 Phase 1.B
979f9f2 feat(ui): 判断タブと回転入力タブを実戦タブに統合（Phase 1.B）
d276b06 Merge pull request #172  Phase 1 視覚刷新
72cfefb feat(ui): モックアップ準拠の判断UI視覚刷新（Phase 1 全7サブステップ）
17a13ee Merge pull request #171  モックアップロードマップ
d04c092 docs: モックアップ完全再現の中長期ロードマップ設計書を追加
633c0f0 Merge pull request #170  FlowStatusCard 表示修正
a6f9e42 fix(ui): 連チャン入力ウィザードのFlowStatusCardがflex内で縮んで隠れる問題を修正
4b32c0a Merge pull request #169  新規稼働画面刷新
ae19b48 feat(ui): 新規稼働画面を空状態+ピル形ボタンに刷新、機種選択をボトムシート化
d4d3cfe Merge pull request #168  更新バナーボトムシート化
7a5c922 feat(pwa): 更新バナーをボトムシート形式に変更
7ad3709 Merge pull request #167  更新バナー表示修正
30b408a fix(pwa): 更新バナーが表示されない問題を修正
a8a55fb Merge pull request #166  PWA registerType=prompt
6480867 fix(pwa): registerType を prompt に変更してUIが更新されない問題を修正
494f870 Merge pull request #165  Codex プロトタイプ統合
23e7171 fix: apply upper tray correction to decision metrics
117c136 docs: UI開発フェーズの分離ルールを追記
779a65d Merge pull request #163  HANDOVER 更新
c80e5cb docs: HANDOVER.md を更新（サブステップ1〜3完了・バグ修正反映・保留タスク整理）
4c1dc4d Merge pull request #162  初当たり回転数必須化（前回更新時点）
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

### 必読ドキュメント（優先度順）

1. `CLAUDE.md` — プロジェクト全体ルール（ルート直下）。
   特に「**UI開発フェーズの分離**」セクション（見た目優先プロトタイプ / 安全な本実装の役割分担）
2. `docs/HANDOVER.md` — 本ドキュメント
3. `docs/roadmap-hunter-ux.md` — 狩猟型UX進化ロードマップ（Phase 0〜7、上位ガイド）
4. `docs/roadmap-mockup-impl.md` — モックアップ完全再現ロードマップ（先行書）
5. `docs/decision-ui-design.md` — 判断ファーストUI 設計書
6. `docs/input-flow-design.md` — 初当たり/連チャン入力フロー改修の設計書（2026-05-19 新規）
7. 大当たり後フロー調査レポート — ブランチ `claude/investigate-jackpot-flow-IXTu2` 内

> ロードマップが2つあるが、矛盾時は `roadmap-hunter-ux.md` を優先。
> 先行書のサブステップは新ロードマップの各 Phase に吸収して扱う。

### 作業開始前の確認コマンド

```bash
git fetch origin
git log --oneline -15

# === 既存機能の確認 ===
# 大当たり後フロー サブステップ2-3: finalRealBalls / finalRealBallsEdited
grep -n "finalRealBalls" src/components/Tabs.jsx

# 初当たり回転数必須化: バリデーション
grep -n "inputTrimmed" src/components/Tabs.jsx

# 現金カードバグ: rawInvest 表示
grep -n "ev.rawInvest" src/components/Tabs.jsx
# → L460 付近で stat("総投資額", hasRot ? f(ev.rawInvest) : "—", ...) があれば OK

# === 狩猟型UX Phase 0-3 の確認 ===
# Phase 0: モード切替の状態
grep -n "pt_currentMode" src/App.jsx
# → L37 付近に const [currentMode, setCurrentMode] = useLS("pt_currentMode", "record")

# Phase 0: モードルーター
grep -n "currentMode ===" src/App.jsx
# → L465-476 で scout / select / record / analysis / settings の5分岐

# Phase 2: 分析ダッシュボード
ls src/components/analysis/   # AnalysisDashboard.jsx, analysisSelectors.js

# Phase 3: 偵察ダッシュボード
ls src/components/scout/      # ScoutDashboard, StoreRankingCard, TodayHighlightList, scoutSelectors.js
ls src/dummyData.js           # 偵察/台選びモード用のダミーデータ

# Phase 4: 台選びダッシュボード
ls src/components/select/     # SelectDashboard.jsx, selectSelectors.js

# Phase 1.7: 直近イベントリスト
ls src/components/decision/RecentEventList.jsx

# === Phase 6 本実装の確認 ===
# 通知ログヘルパー
ls src/notifications.js

# 通知パネル
ls src/components/NotificationPanel.jsx

# レベルアップトースト
ls src/components/hunter/LevelUpToast.jsx

# XPトリガー（App.jsx に 3 つの useEffect）
grep -n "XPトリガー" src/App.jsx
# → 「大当たり」「通常回転1000ごと」「連続稼働日数」の 3 箇所が見つかる

# 通知ベル本実装（未読件数バッジ）
grep -n "openNotificationPanel" src/components/Tabs.jsx

# === Phase 6 バッジ解放 + 判定変化通知の確認 ===
# バッジ定義 + 純関数
ls src/components/hunter/badges.js

# バッジ一覧 UI
ls src/components/hunter/BadgeList.jsx

# バッジ解放 useEffect（App.jsx）
grep -n "バッジ解放" src/App.jsx

# 判定変化通知 useEffect（App.jsx）
grep -n "判定変化通知\|prevVerdictRef\|lastVerdictNotifyRef" src/App.jsx

# 設定画面のバッジ一覧マウント
grep -n "BadgeList" src/components/Tabs.jsx
```

### 直近の状態サマリー（2026-05-19 時点、Phase 6 バッジ解放 + 判定変化通知 完了後）

- **main ブランチ最新コミット**: `16a3272`（PR #190、Phase 6 ハンターランク本実装のマージ）
- **作業ブランチ（push 済 / PR 未作成）**: `claude/hunting-system-continue-U0yhI`
- **本ブランチで追加**:
  - `src/components/hunter/badges.js`: 12 種バッジ定義（first_jp / sessions_10 / sessions_50 / lv5 / lv10 / lv25 / xp_10k / streak_3 / streak_7 / streak_30 / rot_10k / jp_100）と純関数 `computeBadgeMetrics` / `evaluateBadgeUnlocks` / `unlockBadges` / `getBadgeById`
  - `src/components/hunter/BadgeList.jsx`: 設定モード内のバッジ一覧 UI（2列グリッド、獲得済みは彩色＋アイコン強調、未獲得はグレースケール + 条件文）
  - `src/components/hunter/__tests__/badges.test.mjs`: 20 件 PASS（条件評価・遡及加算・順序安定化・未知 ID 互換性）
  - `src/notifications.js`: `NOTIF_BADGE_UNLOCKED` 種別を追加
  - `src/components/NotificationPanel.jsx`: バッジ獲得通知のアイコン色（紫）を追加
  - `src/components/Tabs.jsx`: 設定モードトップにバッジ一覧セクションを追加（`HunterRankBadge` の直下）
  - `App.jsx`:
    - バッジ解放 useEffect（`hunterRank.level / totalXp / streakDays / archives.length / totalHits / ev.netRot` を監視 → `evaluateBadgeUnlocks` → `unlockBadges` 適用 + `NOTIF_BADGE_UNLOCKED` 通知）
    - 判定変化通知 useEffect（`prevVerdictRef` + `lastVerdictNotifyRef` で `decision.verdict` 推移を観測。`VERDICT_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000`。`sessionStarted=false` でリセット）
    - 通知本文用ヘルパー `verdictLabel` / `verdictBodyText` を module レベルに追加
    - `useRef` import 追加、`evDecision` import 追加、`NOTIF_BADGE_UNLOCKED` / `NOTIF_VERDICT_CHANGE` import 追加
- **狩猟型UX**: Phase 0・1・1.B・1.5・1.6・1.7・1.8・2・3・4・6（簡易先行投入）・6本実装・6バッジ解放・6判定変化通知 完了。**次は Phase 4 の実データ化/スコアリング定義確定、Phase 5（P-EVIDENCE 移植）、または Phase 7（モード連携）**
- **配色**: モック2準拠のブルー寄りダークネイビーに刷新済み（PR #177）
- **判定バッジ**: 大型化＋円形試行充足率リング、各種表示バグ修正済み（PR #174・#175・#176）
- **実戦タブ**: 判断 + 回転入力を統合（Phase 1.B、PR #173）。クイック入力 +1/+5/+10/+25 は廃止、テンキーは bottom sheet 化
- **PWA**: `registerType: prompt` + ボトムシート形式の更新バナー（PR #166・#167・#168）
- **上皿補正**: Step 1〜3 完了。Step 2b で判断ロジックも補正後の値を使用
- **大当たり後フロー**: サブステップ1〜5 完了（PR #188）。サブステップ6以降は保留
- **ハンターランク**: Phase 6 本実装 + バッジ解放 + 判定変化通知すべて完了。XPトリガー4種類、レベルアップトースト、12種バッジ、verdict 変化通知、通知ログ・通知パネル稼働中
- **既存バグ修正**: 現金カード 0円（PR #160）、履歴削除（PR #155）、`FlowStatusCard` 表示（PR #170）

### 次にやることの候補（優先順）

着手前に**必ずユーザーに方針確認**すること。以下は推奨順。

#### ✅ 完了済み：Phase 6 バッジ解放（本ブランチで実装）

12 種バッジ + `evaluateBadgeUnlocks` 純関数 + `BadgeList` UI + `NOTIF_BADGE_UNLOCKED` 通知まで完成。
次の拡張案（要ユーザー方針確認）:
- 機種マスター / 店舗エキスパート（同一機種・店舗で N セッション完走）
- ハイスコアバッジ（1セッション workAmount 上位）
- バッジ解放トースト（現在は通知ログのみ）

#### ✅ 完了済み：Phase 6 判定変化通知（本ブランチで実装）

`prevVerdictRef` + `lastVerdictNotifyRef` で verdict 推移を観測、5 分以内の同 verdict 往復を抑制、`NOTIF_VERDICT_CHANGE` 通知を発火。
残課題候補:
- ヤメ通知の演出強化（振動・音 — 要ユーザー方針確認、業務端末感とのトレードオフ）
- 判定変化のトースト表示（現在は通知ログのみ）

#### 候補A：狩猟型UX Phase 4 の実データ化・スコアリング定義

理由：UI はホール図面風マップとしてダミーデータで実装済み。ただし良台スコアリング定義と島データ構造は未確定。

着手前確認：
- 良台スコアリングの定義式（True Border 余裕 + 試行充足率 + データ蓄積量の合成式）
- 「島平均」「前日実績」の集計定義
- 島の物理隣接情報の必要性（当面は線形配置で代替可）

#### 候補B：狩猟型UX Phase 5（P-EVIDENCE 移植）

**前提**: GAS スプレッドシートの数式群を**ユーザーから共有してもらうことが必須**（未受領）。

未受領のままならインターフェース固定でダミー実装まで進める：
- `src/evidence.js` を新規作成（`logic.js` には統合しない）
- 入出力：`{ trueBorder, posteriorMean, trialSufficiency, evAdjusted, scoreForRanking, reasons, predictedRotToConfidence40 }`
- `src/__tests__/evidence.test.mjs` 新規

#### 候補C：偵察モードのダミー → 実データ切替

「店舗実績」タブのみ既存 `archives` から店舗別集計で本実装可能。
「本日予測」「イベント」タブは Phase 5 完了後に保留。

### Codex と Claude Code の役割分担（再掲）

| 作業種別 | 主担当 |
|---|---|
| `logic.js` 変更・新規計算ロジック | **Claude Code** |
| `evidence.js` 移植・集計セレクタ | **Claude Code** |
| データ構造設計・マイグレーション | **Claude Code** |
| テスト追加（境界値・スナップショット） | **Claude Code** |
| UIコンポーネントの新規作成（見た目主） | **Codex** |
| CSS・色トークン・装飾調整 | **Codex** |
| アニメーション・演出 | **Codex** |
| HANDOVER.md / ロードマップ更新 | **Claude Code** |

ブランチ命名：
```
claude/<説明>-<rand4>   # Claude Code 担当
codex/<説明>-<rand4>    # Codex 担当
```
