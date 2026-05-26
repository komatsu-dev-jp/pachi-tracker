# HANDOVER.md — Pachi Tracker 引き継ぎドキュメント

最終更新: 2026-05-26（**下部ナビ中央「記録開始」FAB の水平中央寄せを明示化**（ブランチ `claude/record-button-layout-vIZUc`）。`ModeTabBar.jsx` の中央 FAB は `position: absolute` + `top: -22` のみ指定で `left`/`right` 未指定だったため、水平中央寄せは親 flex の `alignItems: center` による絶対配置要素の「静的位置」に依存していた。修正内容: FAB スタイルに `left: "50%"` + `transform: "translateX(-50%)"` を追加（`src/components/ModeTabBar.jsx:157-170`）。親側の flex（`flexDirection: column / alignItems: center / justifyContent: flex-end`）は不変。`logic.js` / `evDecision.js` / `baseline.json` / 保存データ構造すべて不変、操作ステップ影響なし。`npm run lint` errors=0（既存 warning 7 件のみ）、`npm run build` 成功（`built in 2.65s`）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致 — 同日朝のホーム画面月間期待値目標機能は以下に続く）<br>2026-05-26（**ホーム画面に月間期待値目標機能を追加**（ブランチ `claude/home-monthly-target-goal-72NhF`）。これまで `GoalAndMonthlyCard` 右側の「今月の期待値」カードは `monthlyEv={68950} / monthlyTarget={100000}` のハードコードで、実セッションの累計と切り離されていた。修正内容: (1) `App.jsx` に `const [monthlyEvTarget, setMonthlyEvTarget] = useLS("pt_monthlyEvTarget", 100000);` を追加して localStorage / IndexedDB へ永続化、`S.monthlyEvTarget` / `S.setMonthlyEvTarget` として props 渡し、(2) `HomeDashboard.jsx` で既存の `chartData`（`aggregateByDay(archives, "YYYY-MM")` の当月日別集計を当日まで累積した `{ day, ev, actual }[]`）の末尾要素 `chartData[chartData.length-1].ev` を `monthlyEvTotal` として導出（archive 0 件のときは 0）、(3) 右カードを機能版に置き換え：ヘッダーに鉛筆編集ボタン（44px 相当のタップ領域 = 28px ボタン + パディング）、当月累計EV（22px 大）、進捗バー（高さ 8px、`Math.min(100, ev/target*100)`）、達成時は **金色グラデ + 「✦達成済み」バッジ + 黄色枠 + 黄色シャドウ**、未達成時は **「あと N円」テキスト + 達成率%**、(4) `MonthlyTargetEditor` ボトムシート新規追加（条件マウント、`useState(() => initial)` で props.current を初期値化）。プリセット `5万 / 10万 / 20万 / 30万 / 50万`（タップ領域 44px 以上）+ 数値入力 + 保存 / キャンセル、(5) 左側「本日の稼働目標」カードはモック準拠のまま温存（将来連携予定）。既存の `monthlyTarget=100000` / `monthlyEv=68950` ハードコード値は削除。`logic.js` / `evDecision.js` / `baseline.json` / `rotRows` 不変、新規 localStorage キーは `pt_monthlyEvTarget` のみ。`npm run lint` errors=0（既存 warning 7 件のみ）、`npm run build` 成功（`built in 2.07s`）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` で確認）。操作ステップへの影響: 既存の閲覧フローに変化なし、目標編集は鉛筆タップ → プリセット選択 → 保存の 3 タップで完了 — 2026-05-24 の旧記述は以下に続く）<br>2026-05-24（**ホーム画面の月間EV推移グラフをダミー → 実データに切替**（ブランチ `claude/graph-dummy-to-real-data-9015O`）。`src/components/home/HomeDashboard.jsx` の `MonthlyEvChart` が **30 日分の固定上昇トレンド配列**（`[-2500, -1200, 2400, ... 68950]` の決め打ち）を `data` プロップに渡しており、ユーザーがどんな記録を入れても同じ右肩上がりの折れ線が出る状態だった。修正内容: (1) `analysisSelectors.aggregateByDay(archives, "YYYY-MM")` を流用して今月分の archive を日別集計、(2) 1 日〜今日まで各日に **期待値累積（`stats.workAmount` の累積）** と **実収支累積（`recoveryYen - investYen` の累積、`hasActual` の日のみ加算）** の 2 系列を構築し `{ day, ev, actual }` 配列で渡す、(3) `MonthlyEvChart` を `data / tab / hasData` で再実装し、`tab === "ev" / "actual" / "compare"` の 3 タブをすべて実データで描画（compare は実収支を緑の破線でセカンダリ重ね＋下部に凡例）、(4) Y軸スケールを `buildYScale()` で自動算出（step 候補: 1K/2K/5K/10K/25K/50K/100K/250K/500K、最大 5 段以内に収まる最小ステップを選ぶ + 0 線を必ず含む）、(5) X軸ラベルもデータ点数から最大 5 個を等間隔に派生、(6) **今月の archive が 1 件も無いときは `hasData=false` で「今月の記録がまだありません / セッションを記録するとグラフが表示されます」プレースホルダーを表示**（タブ切替は機能、SVG は描画しないので `data.length-1` ゼロ割を回避）、(7) actual タブはタイトル「今月の実収支推移」+ メイン色 `#22C55E` グリーン、compare タブはタイトル「期待値 vs 実収支」+ 期待値ブルー線 + 実収支グリーン破線。`logic.js` / 計算式 / `evDecision.js` / 保存データ構造 / `rotRows` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.33s`）、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致。操作ステップへの影響: なし（既存タブUI・配色トークンを維持、ホーム画面の構造は不変）。`HomeDashboard.jsx` の `chartData` の `TODO: 将来連携予定` コメントを削除済み — 2026-05-23 の旧記述は以下に続く）<br>2026-05-23（**「直近の行動ログ」に回転入力イベントが表示されないバグを追加修正**（ブランチ `claude/activity-log-button-nav-2O8g6`、コミット 2 件目）。`RecentEventList.jsx` 内の `isRotInputType` フィルター（`/決定$/` / `/消費$/` 末尾）が回転入力イベント（"1K決定" / "500円決定" / "持ち玉NN玉消費" / "貯玉NN玉消費"）を**全て除外**しており、ユーザーが回転数を入力しても「直近の行動ログ」に何も追加されない状態（`Tabs.jsx:1296-1301` で `pushLog` は実行され `sesLog` 自体には保存されている）。修正内容：`sesTypeToStyle` に `isRotInputType(type) → EVENT_STYLES.rotInput` のマッピングを追加（`rotInput` style は既存定義あり）、`sesLog` forEach 内の早期 return フィルターを削除し、回転入力イベント時は `e.rot`（thisRot = 今回入力分の増分）を **「+NN回転」「今回 +NN回」** の sub/chips で表示（通常イベントの累積回転とは別ラベル）、cash/mode に応じて「投資 NN円」「持ち玉 消費」「貯玉 消費」のチップも表示。これにより 20 回転刻み × 5 入力で 5 件のタイムライン行が出るようになる。`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致 — 同ブランチ 1 コミット目の「すべて見る ›」遷移先バグ修正は以下に続く）<br>2026-05-23（**「直近の行動ログ」の『すべて見る ›』ボタンの遷移先バグを修正**（ブランチ `claude/activity-log-button-nav-2O8g6`）。`src/components/decision/RecentEventList.jsx` の `すべて見る ›` リンクが `Tabs.jsx:2249` で `S.setSessionSubTab("history")` に紐付いており、押下すると **大当たり履歴タブ**（jpLog 一覧）へ誤遷移していた。sesLog の全件一覧を表示する専用画面が存在しないため、ユーザー確認のうえ**「その場で展開」方式**で修正：`RecentEventList` に `expanded` ローカル state を追加し、`allEvents.length > MAX_ITEMS(5)` のときのみボタンを表示、押下で `すべて見る（N件） ›` ⇄ `折りたたむ ›` のトグルで `slice(0, 5)` を解除する。`Tabs.jsx:2244-2250` から `onViewAll` プロップを削除（呼び出し側 1 箇所のみで使用）。`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致。操作ステップへの影響: タップ数増減なし（既存 1 タップでの遷移 → 同じく 1 タップでその場展開）、画面遷移が発生しないため店内片手操作の流れを切らない — 当日朝のホーム画面新設は以下に続く）<br>2026-05-23（**ホーム画面（新規モード `home`）を「EV運用OS」風ダークUIで新設、台選びは温存**（ブランチ `claude/pachi-home-ui-redesign-gMPJx`、再実装版）。初回実装時に下部ナビから台選びが消えたためユーザー要望で revert（PR #214 を main 上で `git revert -m 1`、`fac7b3f`）し、本コミットで**台選びを残したまま再実装**。`App.jsx` に新規モード `home` を追加（`pt_currentMode` 新規ユーザー初期値を `record` → `home` に変更、既存ユーザーは保存値維持）。下部ナビ `ModeTabBar` を「**ホーム / 偵察 / 台選び / 記録開始（中央 52px FAB） / 分析 / 設定**」の**6タブ構成**に拡張（旧 5 タブ + ホーム、中央 FAB は記録モードへの遷移）。FAB はネオンブルー発光、上に -22px オフセット。アイコンは 20→18px、ラベル fontSize 9 でコンパクト化（375px iPhone でも収まる）。ホーム画面は 8 セクション（ヘッダー / 目標+月間EV 2カラム / ハンターランク + 3ステータス / 本日のサマリー大カード+右2小 / 今月EV推移チャート（タブ切替: 期待値・実収支・比較）/ 最近の分析 3カード / 実績・バッジ 横スクロール（右端マスクフェード）/ 直近の記録 1件）。配色は `#08111A → #020713` 深いダークグラデ + `#0F1A2B / #0A1320` カード + `#1F2937` 枠 + `#00A6FF` ネオンブルー / `#7DD3FC` シアン / `#22C55E` 成功 / `#F59E0B` 警告 / `#EF4444` 危険 / `#8B5CF6` 紫。実データは `S.hunterRank` / `S.hunterCounters.streakDays` / `S.archives.length` / archives 集計を使用、本日 EV・月間 EV 推移・最近の分析 3カードはモック準拠ダミー（`TODO 将来連携予定` コメント付）。実収支カードは `actualFs` で |金額| に応じ自動縮小、tabular-nums + nowrap で桁溢れ対策。`logic.js` / `baseline.json` / `evDecision.js` / 保存データ構造すべて不変、保護関数テストは baseline と完全一致 — 当日朝の設定画面1カラム化は以下に続く）<br>2026-05-23（設定画面を**全1カラム縦リスト**に再設計（ブランチ `claude/settings-screen-redesign-YA6Bw`）。前回の「分析OS風ダークUI」を引き継ぎつつ、遊技設定 5チップ→1カラム5項目 / 表示・カスタマイズ + データ管理 2カラム→各々1カラム / セキュリティ 3項目横並び→1カラム4項目（**SNSシェア（匿名化）** と **生体認証でのロック** を新規追加、スクショ保護を置換）/ サポート 2項目横並び→1カラム2項目、へ全面1カラム化。ヘッダー右上を「環境サマリー」→「**環境プロファイル（マイホールA）**」に変更し、`TODO` コメントで将来のホール環境切替画面導線を予約。ラベルも「詳細設定（上級者向け）」「テーマ・カラー・アクセシビリティ」「グラフ・表示設定」「通知・サウンド・振動」へ拡充。アイコン IconShare / IconFingerprint を新規追加。`logic.js` / `baseline.json` / `evDecision.js` / 保存データ構造すべて不変、保護関数テストは baseline と完全一致 — 当日早朝の前回（CbML8）刷新は以下に続く）<br>2026-05-23（設定画面を「分析OS風ダークUI（モック準拠）」に全面刷新。ヘッダー（タイトル+環境サマリーカード）/ 遊技設定 5チップ / 表示・カスタマイズ + データ管理 2カラム / セキュリティ 3項目横並び / サポート 2項目横並び / アプリ情報（最新版バッジ+アップデート履歴） の 6 セクション構成。ハンターランク・実績バッジを設定画面から完全削除（import / JSX 両方除去）。フッター `ModeTabBar` を `minHeight 52→44 / icon 22→20 / fontSize 10→9` でコンパクト化、半透明濃紺＋薄い青グレー上線に統一。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過 — 同日の詳細データタブ刷新は以下に続く）<br>2026-05-23（詳細データタブを「折りたたみ型 分析OS UI」へ再刷新。常時表示は AI分析サマリー（チェックリスト型）+ 1Kスタート / 想定時給（LOW強調・小型化）+ 終了予定までの想定仕事量レンジバー の 4 セクションに集約。仕事量vs実収支 / σ分析（青→グレー→黄のみ）/ ボーダー差・信頼度の推移（現在点パルス）/ 詳細スタッツ（優先度別レイアウト）/ 計算根拠 の 5 セクションは折りたたみ化、通常時は 1 行サマリーのみ。スクロール中も「持ち玉遊技中 / ボーダー / 期待値プラス／マイナス / 信頼度 / 次の判断ライン」を表示する下部固定ステータスバーを追加。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過 — 2026-05-22 の旧記述は以下に続く）<br>2026-05-22（詳細データタブを「分析OS風ダークUI（モック準拠）」に全面刷新。AI分析サマリー + 1Kスタート/想定時給 2カラム + 終了予定までの想定仕事量レンジバー + 仕事量vs実収支 3カラム + 期待値との差 半円σゲージ + ボーダー差・信頼度の2線推移グラフ + 詳細スタッツ + 計算根拠 の 8 セクション構成。配色は `#050B18` 背景 + `rgba(11,22,40,...)` 半透明カード + 青/緑/黄/赤/紫のネオン系アクセント。実データがあれば既存 `ev` / `evEff` から取得、無い時はモック準拠のダミー値。交換率は `S.ballVal`（円/玉）を優先。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過）

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
  index.css                     # ピュアブラック高コントラスト配色（モック2準拠、2026-05-22 刷新）
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
| 1.6.1 | ✅ 完了 | ダークテーマをモック2準拠のピュアブラック高コントラストパレットへ再刷新（ネイビー寄り→中立ブラック寄り、ハードコード slate を CSS 変数化、`theme-color` 同期） | `25e6f92` / `8722aca`（ブランチ `claude/session-XffIS`） |
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

#### 配色再刷新（2026-05-22、ブランチ `claude/session-XffIS`）

PR #177 のネイビー寄りパレットを「モックアップ2 の入力フロー画面に近いピュアブラック寄り・高コントラスト」へ更新。
ライトテーマは未変更。ダークテーマのみ刷新。

主な変数変更（`src/index.css`、`[data-theme="dark"]`）:

| 変数 | 旧（ネイビー寄り） | 新（ピュアブラック寄り） |
|---|---|---|
| `--bg` | `#0c1428` | `#05070d` |
| `--surface` | `#1a2238` | `#0e1117` |
| `--surface-hi` | `#222c47` | `#181d27` |
| `--surface-alt` | `#121a30` | `#090b12` |
| `--border` | `rgba(148,178,255,0.08)`（青味） | `rgba(255,255,255,0.06)`（中立） |
| `--border-hi` | `rgba(148,178,255,0.16)` | `rgba(255,255,255,0.14)` |
| `--blue` | `#60a5fa` | `#38bdf8`（明瞭なシアン寄り） |
| `--green` | `#34d399` | `#22c55e`（ビビッドネオン） |
| `--text` | `#e8eef9` | `#f3f6fb` |
| `--header-bg` / `--nav-bg` | `rgba(12,20,40,0.9x)` | `rgba(5,7,13,0.9x)` |

`src/constants.js` の `C.*` 抽象は不変。CSS 変数の値だけで全コンポーネントに伝播する。

ハードコード除去（CSS 変数化）:

- `src/index.css` の `.jp-*`（大当たり後フロープロトタイプ）クラス群
  - `rgba(15, 23, 42, ...)`（slate-900）/ `rgba(2, 6, 23, ...)`（slate-950）/ `#0f172a` / `#020617` → `var(--surface)` / `var(--bg)` / `color-mix` ベースに置換
  - `rgba(148, 163, 184, ...)` ボーダー → `var(--border)`
- `src/components/Tabs.jsx`
  - チェーン履歴カードの背景・ボーダー（行 2741 付近）を `color-mix(in srgb, ${C.green/blue} N%, var(--surface))` に
  - アクティブチェーン下部 CTA バー（行 2693 付近）を `color-mix(in srgb, var(--bg) 86%, transparent)` に
  - 実測サマリーカード勾配（行 2715 付近）を `var(--surface) → var(--surface-alt)` に
  - 「入力を確定する」ボタンの勾配下端を `#1a3a8e` / `#0f6e3a` → `var(--bg)` に
  - モーダル下部アクションバーの `rgba(20,20,25,1)` を `var(--bg)` に統一
- `src/components/select/SelectDashboard.jsx`
  - ホール図面風マップ背景 `#071224` ほか青系ハードコードを `var(--surface-alt)` と `color-mix(var(--blue) ...)` ベースに

メタタグ同期:

- `index.html` の `<meta name="theme-color">`: `#0c1428` → `#05070d`
- `vite.config.js` の PWA `theme_color`: `#0a0a12` → `#05070d`

検証:

- `npm run lint`: 0 エラー（既存 8 警告のみ、無関連）
- `npm run build`: 成功（dist の CSS に `#05070d` / `#0e1117` / `#181d27` を確認、旧 `#0c1428` / `#1a2238` は消滅）
- `node src/__tests__/protected-fns.mjs`: 通過（`logic.js` 不変）
- 操作ステップ数の変化: なし（CSS 変数・色トークンのみの変更）

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

#### 下部ナビ中央「記録開始」FAB の水平中央寄せ修正（✅ 本ブランチ `claude/record-button-layout-vIZUc`、2026-05-26）

- **背景**: `ModeTabBar.jsx` 中央の「記録開始」FAB（青い円形 +）は `position: absolute` + `top: -22` のみ指定で `left`/`right` 未指定だった。水平中央寄せは親 flex の `alignItems: center` による絶対配置要素の「静的位置」算出に依存しており、ブラウザ実装次第で左右にズレる可能性があった
- **修正内容**: `src/components/ModeTabBar.jsx:157-170` の FAB ボタンに `left: "50%"` + `transform: "translateX(-50%)"` を追加。親側の `display: flex / flexDirection: column / alignItems: center / justifyContent: flex-end` は不変。これにより親の flex レイアウトの中で FAB を確実に水平中央寄せできる
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `evDecision.js` / `baseline.json` 不変
  - `rotRows` / `jpLog` / `sesLog` / 保存データ構造すべて不変
  - `ModeTabBar` の onChange / currentMode シグネチャ不変、左右タブ・ラベルの配置・サイズも不変
- **操作ステップへの影響**: なし（FAB の見た目上の中央配置を明示化しただけで、タップ可能領域・サイズ・導線はすべて従来通り）
- **検証**:
  - `npm run lint`: errors=0（既存 warning 7 件のみ、本変更で増減なし）
  - `npm run build`: 成功（`built in 2.65s`、CSS 31.31 kB / JS 741.06 kB）
  - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`diff` 差分なし）

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

#### 大当たり入力画面（画面 A）のモック準拠刷新 + テンキー条件表示 + 入力確定ボタン（✅ 本ブランチ `claude/numeric-keypad-ui-yceuE`）

- **背景**: ユーザー提供モックアップに従い、初当たり入力画面（hitWizard / 画面 A）の見た目と入力フローを刷新。
  特に「テンキーは入力項目タップ時のみ出す」「Enter で次のフィールドへ即遷移」「出玉プリセットは不要」が要件。
- **画面 A 視覚刷新**:
  - 上部ステータスを 2×2 グリッド → 横並び 5 カードに変更
    - 現在持玉 / 期待差玉 / 電サポ効率 / RUSH継続期待度 / 1Rあたりの出球
    - RUSH継続期待度は算出式未確定のため「—」を表示（`docs/implementation-notes.md` 方針継続）
  - タイトル行を「現在入力中: デフォルト （次の大当たりを入力してください）」+「入力ガイド」ボタンに変更
  - 「初当たり / 連チャン追加」のタブ UI を追加。連チャン追加タブは `chainLen > 0` のときのみ有効化し、押下で `setHitWizardOpen(false) → openChainWizard()` を呼ぶ（画面 B へ遷移）
  - 5 行の入力 Row を円形アイコン（rotate / coin / R / monitor / target）付きにリデザイン
  - 液晶出玉 / 実測出玉のプリセットを 3 → 4 段階に拡張（450/750/1500/3000 と 380/750/1500/3000）
- **テンキーの条件表示**:
  - `hitInputFocus` の初期値を `"rotCount"` → `""`（未フォーカス）へ変更（`Tabs.jsx:535` の `useState`、および 3 箇所の初期化箇所 `1425` / `1469` / `2214`）
  - `keypadField = focus === "rounds" ? null : focus` の式は不変。`focus === ""` のときも falsy になり、`{keypadField && ...}` でテンキーブロックが描画されない
  - フォーカス時のみ「テンキー（左）+ 入力まとめ（右）」のレイアウト、未フォーカス時は「入力まとめ」のみ全幅で表示
- **入力確定（Enter = 次フィールド遷移）**:
  - `FIELD_ORDER = ["rotCount", "trayBalls", "rounds", "displayBalls", "actualBalls"]` を定義
  - 下部固定の青いグラデーション「入力確定 →」ボタンを追加。`onEnterPress` が現在 focus の index を取得して次のフィールドへ `setFocus` する
  - 最終フィールド（actualBalls）で押下した場合は `setFocus("")` でテンキーを閉じる
  - フォーカスがない状態で押下したときは先頭フィールドへ移動して入力開始
- **今回の入力まとめ（未確定）パネル**:
  - 5 項目 + 1Rあたりの出球 + RUSH継続回数（5連等の大きな黄色数字）を常時表示
  - 未入力項目は「—」、確定後に値が入る（入力中の状態を視覚化）
- **削除した要素**:
  - 「よく使う出玉プリセット」セクション全体（画面 A のみ。画面 B 側にはまだ残っているが、本作業の対象外）
  - 旧「今回のまとめ」のスクロール内表示（下部の「今回の入力まとめ」に統合）
- **保護**:
  - `logic.js` / 計算式 / 保存データ構造はすべて未変更
  - 連チャン継続 / 単発終了 / 単発終了モーダル / プッシュ額補正の既存ロジックはそのまま
  - `handleStartChain` / `handleWizardComplete` / `onSingleEndConfirm` のシグネチャ不変
- **検証**: `npm run lint` errors=0（警告 8 件は既存・無関連）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と完全一致
- **コミット**: `73f388c`（本ブランチ）

#### 大当たりタブの既定表示を入力画面へ変更 + テンキー配置修正（✅ 本ブランチ `claude/align-ui-design-CmJ0b`）

- **背景**: モックアップ（5枚目）準拠で、大当たりタブを開いた瞬間から入力画面が出ているのが理想。
  また、新UI（画面 A / 画面 B / 画面 C）のテンキーで「消去」ボタンが 1 行 1 列目に流れ込み、
  1〜9 が 1 マスずつずれて表示される不具合が発生していた。
- **テンキー配置修正**:
  - 原因: `gridRow:"1 / span 1"` のみ指定で `gridColumn` 未指定だったため、CSS Grid の配置順序上、
    1〜9 より先に「row 1 col 1」へ消去ボタンが配置され、1〜9 が後ろにずれていた
  - 修正: 4 列 → 3 列に変更、`gridColumn` を明示して `消去 / 0 / ⌫` を 4 行目に固定配置
  - 「0クリア」は削除（モック準拠で簡素化）
  - 画面 C の「計算値」ボタンはテンキー上部に「計算値に戻す」として独立配置
  - 結果は 3 列 4 行の標準的なテンキー（1-9 + 消去・0・⌫）
- **既定表示の自動オープン**:
  - `Tabs.jsx:1455-1474` に `useEffect` を追加
  - `prevSubTabRef` で sessionSubTab の前回値を追跡し、`"history"` への遷移を検出
  - 遷移時に `isChainActive` を判定:
    - チェーン未開始 → 画面 A（初当たり入力）を `setHitWizardOpen(true)`
    - チェーン進行中 → `openChainWizard()` で画面 B（連チャン追加入力）を開く
  - 既に他のモーダル（`hitWizardOpen / chainWizardOpen / directSingleEndOpen / editChainOpen`）が
    開いている場合は何もしない
  - ユーザーが「戻る」で閉じた後は、他タブを経由するまで自動再オープンしない
- **不変**: `logic.js` / 計算式 / `evDecision.js` / 保存データ構造はすべて未変更
- **lint / build**: エラー 0（既存 warning のみ）

#### 初当たり入力画面の操作性改善（自動スクロール + プリセット整理 + プッシュ補正額の上段化）（✅ 本ブランチ `claude/fix-numpad-scrolling-UGmC1`）

- **背景**: 画面 A モック準拠刷新後、店内の片手操作で 3 件の摩擦が判明。
  1. テンキーで値を入れ「入力確定」を押しても画面が次の入力行へ追従せず、毎回手動スクロールが必要
  2. 数値プリセット（`回転数 -10/+10`、`開始上皿玉数 50/100/150`、`液晶出玉 450/750/1500/3000`、`実測出玉 380/750/1500/3000`）は機種・状況依存で外れることが多く、視覚ノイズになっていた
  3. プッシュ補正額が画面最下部の折りたたみセクションにあり、回転率（G/千円）の精度に直結するのに押し忘れが発生していた
- **自動スクロール**:
  - `Row` コンポーネントのルート `<div>` に `data-row-id={id}` 属性を追加（`Tabs.jsx:3589`）
  - `RotTab` 関数の `hitInputFocus` 宣言直後（`Tabs.jsx:539-546`）に `useEffect` を追加し、`hitInputFocus` と `hitWizardOpen` を依存配列に取って `document.querySelector(\`[data-row-id="${hitInputFocus}"]\`).scrollIntoView({ behavior: "smooth", block: "center" })` を実行
  - 「入力確定」ボタン押下 → `onEnterPress` で `setHitInputFocus` → effect が発火 → 対応行が画面中央へスムーズに移動
  - IIFE 内で hook を呼ぶことはできないため、IIFE 外（`RotTab` 直下）に置くことで React の hook ルールを遵守
- **プリセット整理**:
  - 数値プリセットは `ラウンド数` のみ残す（機種マスタ `roundDist` 由来の `rotPresetButtons` は機種ごとに動的生成されるため実用性が高い）
  - `回転数` の `-10/+10`、`開始上皿玉数` の `50/100/150`、`液晶出玉` の `450/750/1500/3000`、`実測出玉` の `380/750/1500/3000` は `presets` プロップごと削除
  - `Row` 側のレンダリングは `presets && (...)` でガード済みのため、プロップ未指定なら何も描画されない（コンポーネント本体は無変更）
- **プッシュ補正額の上段化**:
  - 旧「詳細（プッシュ額補正）」折りたたみセクション（旧 `Tabs.jsx:3882-3903` 相当）を完全撤去
  - 入力行の先頭に「1. プッシュ補正額（任意・投資補正）」を新設し、`なし` / `+500` / `+1000` の 3 択プリセットで操作
  - 既存 1〜5 を 2〜6 に繰り下げ:
    - 1. プッシュ補正額（新規）
    - 2. 回転数
    - 3. 開始上皿玉数
    - 4. ラウンド数（プリセット維持）
    - 5. 液晶出玉
    - 6. 実測出玉
  - `FIELD_ORDER` を `["pushAmount", "rotCount", "trayBalls", "rounds", "displayBalls", "actualBalls"]` に更新
  - `keypadField` の除外条件を `focus === "rounds"` → `(focus === "rounds" || focus === "pushAmount")` に拡張（プッシュ補正額はカテゴリ選択のためテンキー不要）
  - `hitInputShowPush` state（旧折りたたみの開閉フラグ）と関連する 6 箇所の `setHitInputShowPush(true)` 呼び出し（`535` / `1425` / `1469` / `2214` / `3481` / 折りたたみボタン）をすべて削除
- **保護**:
  - `logic.js` / 計算式 / `rotRows` データフロー / 保存データ構造（`hitWizardData` のキー名・型）はすべて未変更
  - `pushAmount` の使用箇所（`handleStartChain` / `handleWizardComplete` / 投資補正への反映）はそのまま
  - `evDecision.js` 触らず、`baseline.json` 不変
- **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.88s`）
- **コミット**: `6fe8f1a`（本ブランチ）

#### プッシュ補正額プリセットの 2 択化（✅ 本ブランチ `claude/update-push-amounts-cdWdV`）

- **背景**: 実運用ではプッシュ補正に使う金額が `+500` / `+1000` の 2 択でほぼ完結しており、`+2000` / `+3000` ボタンは押下機会が少ない一方で 6 ボタンレイアウトの視覚ノイズを生んでいた
- **変更**:
  - `Tabs.jsx:3597-3605` の `pushPresets` 配列から `+2000` / `+3000` の 2 要素を削除
  - 残るプリセットは `なし` / `+500` / `+1000` / `クリア` の 4 ボタン（5 ボタングリッドから 4 ボタンに減）
  - `pushAmount` フィールド自体（保存データ構造・`updField` インターフェース・投資補正連携）は不変。`pushAmount: 2000` / `3000` を含む既存セッションログも引き続き正常に集計される（プリセットボタンが消えるだけで、値そのものを禁止していない）
- **保護**:
  - `logic.js` / 計算式 / `rotRows` データフロー / 保存データ構造（`hitWizardData` の `pushAmount` キー・型）はすべて未変更
  - `evDecision.js` 触らず、`baseline.json` 不変
- **操作ステップへの影響**: なし（プリセットボタンの数が減るのみ。`+500` / `+1000` の 1 タップ操作は変わらず）
- **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.83s`）

#### 大当たりタブのヒーローカード3点・入力まとめUI追加（見た目優先プロトタイプ）（✅ 本ブランチ `claude/update-screen-mockup-KcFmx`）

- **背景**: 大当たりタブを開いた時に「現在の状況（持玉・評価・1Rあたりの出球）」が一目で掴めるよう、画面上部に視覚的サマリを追加したい。提示されたモック（2枚目）に合わせて画面構造を再構成
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - ヒーローカードの値・評価ラベル・星評価・スパークラインは既存集計値（`ev` / `S.currentMochiBalls` / `lastChain.summary`）から導出した「仮表示」。スパークラインは装飾用ダミーパス（`将来連携予定` コメント付）
- **変更ファイル**: `src/components/Tabs.jsx`（`RotTab` 内の `S.sessionSubTab === "history"` ブロック、行 2489 付近）
- **追加要素**:
  - **3ヒーローカード**（タブ上部・常時表示）
    - 現在持玉（緑）: `S.currentMochiBalls` + 最終完了チェーンの `summary.netGain` 差分バッジ
    - 現在評価（動的色）: `ev.netGain` を `> 1500 圧倒 / > 300 優勢 / > -300 互角 / それ以下 不利` にマッピングし絵文字付きで表示。「（理論ベース）」キャプション付
    - 1Rあたりの出球（オレンジ）: `ev.avg1R` + 星評価バッジ（`>=150 ★5 神級 / >=140 ★4 優秀 / >=130 ★3 良好 / >=120 ★2 普通 / それ以下 ★1 厳しい`）
    - 各カードに装飾用 SVG スパークラインを配置
  - **「詳細を表示」トグル**: `<details>` 折り畳み。現状はプレースホルダーテキスト
  - **「+ データを追加」インラインボタン**: アクティブチェーン直下にダッシュ枠で配置。既存の `openChainWizard` を呼び出す（新規ハンドラ追加なし）
  - **「今回の入力まとめ（未確定）」セクション**: 最新チェーンから `回転数 / 開始上皿玉数 / ラウンド数 / 液晶出玉 / 実測出玉 / 1Rあたりの出球` を集約表示（`<details open>` 既定展開）
  - **「最新履歴を削除」ボタン**: ゴミ箱 SVG アイコン併記、`Btn` から `<button>` に置き換え（既存削除ハンドラのロジックはそのまま）
- **撤去**: 空状態の「回転数タブの『初当たり』ボタンから…」Card（ヒーローカードが常時表示されるため不要に）
- **ラベル整理**:
  - チェーン履歴カード内 `出玉(液晶)` → `液晶出玉`
  - 数値の右に `玉` / `回` / `玉/回転` 単位を小文字で併記し可読性を改善
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `rotRows` / `jpLog` / `S.currentMochiBalls` / `hitWizardData` 等の保存データ構造不変
  - `evDecision.js` / `baseline.json` 不変
  - 既存の `openChainWizard` / 削除ハンドラ / `FlowStatusCard`（連チャン中バナー）はそのまま残置
- **操作ステップへの影響**: なし（既存導線（当たりを追加ボタン・編集モーダル・削除ボタン）はすべて維持。新規ボタンは既存ハンドラを呼ぶ視覚的バリエーション）
- **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.44s`）
- **将来連携予定（メモ）**:
  - スパークラインの実データ化（チェーン履歴推移）
  - 評価ラベルのしきい値を `evDecision` と整合（現状は仮しきい値）
  - 星評価しきい値の機種別ベース（純増出玉円・1R期待値）への接続
  - 「+ データを追加」ボタンと既存固定ボトムバー（当たりを追加/単発終了/ラッシュ終了へ）の最終的な統廃合

#### 大当たりタブ ヒーロー3カードのモック2準拠 再調整（見た目優先プロトタイプ）（✅ 本ブランチ `claude/mockup-redesign-graphs-JsNqn`）

- **背景**: 前回プロトタイプ（PR #202 系統）のヒーロー3カードについて、ユーザーから「グラフと絵文字が提示モック（2枚目）と違う」「スタイリッシュにしてほしい」と指摘あり。モック2を完全再現する方向で再調整
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - スパークラインは依然として装飾用ダミー（シード固定の LCG ランダムウォーク）。`将来連携予定` コメントを継続
- **変更ファイル**: `src/components/Tabs.jsx`（`makeSpark` / `sparkPath` / `Spark` の差し替えと 3 カードのスタイル微調整、行 2519〜2640 付近）
- **主な変更**:
  - **スパークライン形状**: `Math.sin` ベースの滑らかな波 → 線形合同法（LCG）による疑似ランダムウォーク（32 点・上昇トレンド +0.35/step・乱数振幅 14）。実データの株価チャート風のギザギザ波形に刷新
  - **スパークライン寸法**: 高さ 28px → 40px、`viewBox` 上下に 1px ずつ余白を確保（線が枠にベタ付きしない）、ストローク 1.6 → 1.3 で上品な細線
  - **カードレイアウト**: 3 カードに `minHeight: 158` を付与し高さを統一、`<svg>` 側を `marginTop: "auto"` で固定して情報部とチャートを明確に分離
  - **「現在評価」絵文字・ラベル拡大**: 絵文字 22px → 26px、ラベル 20px → 22px、`+N玉` 12px → 13px。モック2 の存在感を再現
  - **「現在持玉」サブ表示**: ピル背景（`background: color-mix(...) 18%`）→ プレーンな緑色テキストに整理。`+1,250` + 単位 `玉`（小さく）でモック2の表記スタイルに合わせる
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `rotRows` / `jpLog` / `S.currentMochiBalls` / `hitWizardData` 等の保存データ構造不変
  - `evDecision.js` / `baseline.json` 不変
  - データソース（`ev` / `S.currentMochiBalls` / `lastChain.summary` の使い方）不変。表示ロジックの寸法・形状のみ調整
- **操作ステップへの影響**: なし（情報の見せ方のみ変更。タップ可能要素は増減なし）
- **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.67s`）
- **将来連携予定（メモ）**:
  - スパークラインの実データ化（チェーン履歴推移の `summary.netGain` 系列）
  - 「詳細を表示」展開時に大きめの折れ線チャート（同じデザイン言語）を表示
  - データ未蓄積時（空状態）はチャートを `opacity: 0.3` 等で控えめに表示する案を検討

#### 詳細データタブのモック準拠 全面刷新（見た目優先プロトタイプ）（✅ 本ブランチ `claude/detail-data-dark-ui-HrRss`、2026-05-22）

- **背景**: ユーザー提供モック画像（iPhone想定の「分析OS風ダークUI、ほぼ黒に近い濃紺背景・半透明カード・ネオン系アクセント」）に従い、詳細データタブ（`currentMode === "record"` / `sessionSubTab === "data"`）を全面刷新
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - 終了予定時刻（21:00）、想定仕事量レンジ、推移グラフのデータ点はモック準拠のダミー（シード式 LCG ランダムウォーク）。「将来連携予定」として時系列実データへの差し替えが必要
  - σ プロキシは `(実収支 − 期待値) / max(3500, sqrt(netRot) × 280)` の概算式（分散の真値ではなく見た目の符号と桁感を合わせるための proxy）
- **変更ファイル**: `src/components/Tabs.jsx`（旧データタブ全体 L3169〜L3396 を新規実装で置換、モジュール先頭に `dataCardStyle()` / `cardHeaderStyle()` / `cardNumDot()` / `cardTitleStyle()` / `subCardStyle()` / `subCardLabel()` ヘルパー関数を追加）
- **主な変更点（モックの各セクションにマッピング）**:
  | # | モック要素 | 実装 |
  |---|---|---|
  | 1 | AI分析サマリー（AIアイコン + 説明文 + 4 サブカード） | AI 装飾 SVG（青グラデーション）+ "ボーダーを +N回 上回って" 動的本文 + データ精度／信頼度／次の判断ライン／信頼度MIDまでの 4 サブカード（信頼度MIDまでは `1500 − netRot`） |
  | 2 | 1Kスタート / 想定時給（2カラム） | 左：`evEff.start1K` + 理論ボーダー（`ev.theoreticalBorder`）+ ボーダー差ピル。右：`evEff.wage` + 信頼度バッジ（HIGH/MID/**LOW**）+ プレ幅（`±max(2500, |wage|×1.5)`）+「（参考値）」明記 |
  | 3 | 終了予定までの想定仕事量 + レンジバー | `expectedWork` 中央値 + ±範囲 + 緑→青グラデーションバー + 中央値マーカー + 終了予定 21:00（ダミー） |
  | 4 | 仕事量 vs 実収支（3カラム + スパークライン） | 期待値（`evEff.workAmount`、緑）/ 実収支（`currentMochi × ballVal − rawInvest`、青）/ 差分（黄 + 上振れ中バッジ）。各カードに装飾 LCG スパークライン |
  | 5 | 期待値との差 半円σゲージ | -3σ〜+3σ の半円弧（紫→青→灰→黄→赤グラデーション）+ 針 + 中央値表示 + 「大きく上振れ中／上振れ中／想定通り／下振れ中／大きく下振れ中」ステータスピル |
  | 6 | ボーダー差・信頼度の推移グラフ | 緑実線（ボーダー差）+ 紫点線（信頼度）の 2 線。左軸 ±20、右軸 0-100%、時刻軸 12:00〜現在。右側に現在値カード |
  | 7 | 詳細スタッツ（7 行リスト） | 単価（`evEff.evPerRot`）/ 持ち玉比率（`ev.mochiRatio`）/ 平均出玉（`ev.avg1R`）/ 大当たり確率（`netRot/jpCount`）/ 通常回転数 / 大当たり回数 / 初当たり確率。各行に小アイコン + > |
  | 8 | 計算根拠（6 行リスト + 「すべての計算根拠を見る」） | 初当たり確率 / 表記出玉 / 持ち玉（`S.currentMochiBalls`）/ 総投資（`ev.rawInvest`）/ 交換率（`S.ballVal` 優先、`1000/S.exRate` フォールバック）/ 再プレイ上限「無制限」。リンク押下で既存 `setShowGraphModal(true)` を呼ぶ |
- **配色（モック仕様準拠）**:
  - 背景: `#050B18`（コンテナ全体）
  - カード: `linear-gradient(180deg, rgba(11,22,40,0.85), rgba(16,27,45,0.75))` + `backdrop-filter: blur(8px)`
  - 枠線: `rgba(26,77,117,0.45)`、サブカードは `rgba(18,58,90,0.55)`
  - アクセント: `#0A84FF`（青）/ `#009DFF` / `#21D99B`（緑）/ `#FFB020`（黄）/ `#FF5A5F`（赤）/ `#C084FC`（紫）
  - 番号バッジ: 18×18 円形、`rgba(10,132,255,0.16)` 背景 + 青枠 + 青文字
- **実データ／ダミーフォールバック方針**:
  - `hasData = ev.netRot > 0` で判定
  - 実セッションがあれば：`evEff.start1K` / `evEff.bDiff` / `evEff.wage` / `evEff.workAmount` / `decision.confidence` / `ev.netRot` / `ev.jpCount` / `ev.rawInvest` / `ev.avg1R` / `S.currentMochiBalls` / `S.ballVal` を使用
  - データがない場合：モック画像と同じダミー値（20.6 / +3.9 / +2,847 / +752 / +13,560 / +12,808 / +1.8σ / 4,190 / 2,500 / 1 / 104 / 1,420）
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `evDecision.js` / `baseline.json` 不変（判定閾値も不変）
  - `rotRows` / `jpLog` / `S.currentMochiBalls` / `hitWizardData` 等の保存データ構造は完全に同一
  - 既存ハンドラ（`evDecision` / `effectiveEv` / `setShowGraphModal` / `UndoControls` / `S.setTab` 等）の**シグネチャ不変**。新規 UI は presentation layer に徹してこれらを呼ぶだけ
- **操作ステップへの影響**:
  - 詳細データタブ閲覧: 0 ステップ（タブを開くだけ）— 既存と同じ
  - 「すべての計算根拠を見る」リンク: 既存 `setShowGraphModal(true)` を呼ぶ（旧 UI の「グラフで確認」ボタンと同等）
  - 旧 UI の「データ履歴」「メモを追加」ボタンは廃止（カレンダータブ／未実装のメモ機能への導線。代わりに本タブ内で全情報が完結）
- **検証**:
  - `npm run lint`: errors=0（既存 warning 8 件のみ、本変更で増減なし）
  - `npm run build`: 成功（`built in 2.58s`、CSS 30.79 kB / JS 691.42 kB）
  - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`logic.js` 不変）
  - Playwright + Chromium で iPhone 14 viewport（390x844）スクリーンショット検証実施：8 セクションすべてがモック準拠で描画
- **コミット**: `3761101`
- **将来連携予定（メモ）**:
  - 推移グラフ（セクション 6）の時系列データを `rotRows` のタイムスタンプ系列から実データ化
  - 終了予定時刻（21:00）を `rotPerHour` と残り資金から算出
  - σ プロキシを「過去セッションの workAmount 分布」から推定した標準偏差で正規化
  - 「次の判断ライン」「信頼度MIDまで」を `evDecision` の閾値定数（信頼度 0.4/0.5）と連動
  - 「すべての計算根拠を見る」リンクを専用詳細モーダルへ差し替え（現状は既存グラフモーダルを流用）

#### 記録モード画面のモック2準拠 全面刷新（見た目優先プロトタイプ）（✅ 本ブランチ `claude/recording-mode-dark-ui-mkrJi`、2026-05-22）

- **背景**: ユーザー提供モック画像（iPhone想定の「ダーク × ネオンブルー × 戦略OS風UI」）に従い、記録モード（`currentMode === "record"`、`sessionSubTab === "rot"`）画面を全面刷新。データ蓄積中の `hold` 状態は警告ではなく分析中の印象にするため、色を黄→青/シアンへ変更
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - 指標カード上段のスパークラインは装飾用ダミー（シード式 LCG ランダムウォーク）。「将来連携予定: 実測トレンドと連動」コメント付
  - イベントメニューの「継続判断 / メモ / 一時保存」は最小実装（`window.prompt` または `window.alert` + `S.pushLog`）。専用UIは別タスク
- **変更ファイル**:
  - `src/components/Tabs.jsx`（`RotTab` 全体を再構成）
  - `src/components/decision/VerdictBadge.jsx`（心電図アイコン + 円形ゲージ + データ精度/安定まであと）
  - `src/components/decision/KeyMetrics.jsx`（3+4 レイアウト + 装飾スパークライン）
  - `src/components/decision/ReasonList.jsx`（2列グリッドの ✓/⚠ カード）
  - `src/components/decision/RecentEventList.jsx`（タイムライン形式 + 回転入力ノイズ除外）
  - `src/index.css`（新規 CSS クラス群と `.verdict-badge--hold` の青/シアン化）
- **主な変更点（モックの各要素にマッピング）**:
  | モック要素 | 実装 |
  |---|---|
  | サブタブ「記録 / 詳細データ / 大当たり履歴 / 機種設定」 | `sessionSubTabLabels` を更新（実戦→記録、大当たり→大当たり履歴） |
  | 判定ステータスカード（心電図アイコン + 大型ラベル + 円形信頼度ゲージ + データ精度/安定まであと） | `VerdictBadge` 再設計、`.rec-verdict-card` + `.rec-verdict-ring` クラス。`hold` は青/シアン色 |
  | 指標カード上段（補正後EV/K黄・生EV/K青・ボーダー差緑） | `KeyMetrics` 上段3カード、`.metric-card-v2--accent` + スパークライン |
  | 指標カード下段（予測回転率・総投資・持ち玉・実質投資） | `KeyMetrics` 下段4サブカード（スパークラインなし） |
  | 直近の行動ログ（タイムライン + 右側チップ） | `RecentEventList` 刷新。`isRotInputType` で「1K決定」「持ち玉NN玉消費」等の回転入力イベントを除外、節目イベントのみ表示 |
  | 判定の根拠（要約） + 詳細を見るリンク | `ReasonList` 2列グリッドの `✓`（緑）/`⚠`（黄）カード、`onDetails` で詳細データタブへ遷移 |
  | 詳細データ折りたたみ | `.collapse-card` クラス、初期 `showDetailCollapse=false` |
  | 下部固定 CTA「回転数を入力する」 | `.record-cta-bar` + `.record-cta-input`。+10/+50などのクイック入力は廃止、回転入力はこの1導線のみ |
  | 右下 FAB「+イベント」 | `.record-fab` 円形ボタン、`onClick` で `setShowEventMenu(true)` |
  | イベントメニュー（6項目） | 新規 `.event-menu__*` クラス。初当たり/台移動/継続判断/メモ/一時保存/実戦終了の6項目 |
  | テンキーモーダル | `.numpad-modal__*` クラス。持ち玉/現在回転数/前回入力チップ + 大型数値ディスプレイ + 1-9/0/00/⌫ + 入力履歴チップ |
- **イベントメニュー各項目のハンドラ**:
  - 「初当たりを記録」: `setHitWizardOpen(true)`（既存画面 A）
  - 「台移動を記録」: `setShowMoveModal(true)`（既存モーダル）
  - 「継続判断を記録」: `window.prompt` で入力 → `S.pushLog({ type: \`継続判断: ${...}\` })`
  - 「メモを追加」: `window.prompt` で入力 → `S.pushLog({ type: \`メモ: ${...}\` })`
  - 「記録を一時保存」: `S.pushSnapshot()` + `S.pushLog({ type: "一時保存" })` + 完了 `alert`
  - 「実戦終了」: `window.confirm` で確認後 `S.handleMoveTable()`（既存アーカイブ処理を流用、`isMoveArchive: true` のまま）
- **追加 state（`RotTab` 内）**:
  - `showEventMenu` — FAB から開くボトムシート
  - `showDetailCollapse` — 詳細データ折りたたみの開閉
  - `inputHistory` — テンキー入力履歴（最大4件、表示専用）
- **撤去した要素**:
  - 「入力 / 初当たり」2ボタン構成（旧 `input-trigger-btn` + `初当たり` orange ボタン）
  - 旧「現金 / 持ち玉」neon-card 2連グリッド
  - 旧「総回転 / 大当り回数 / 実質投資」3連 stat バー
  - 旧「履歴アコーディオン」（折りたたみテーブル）。`showHistory` state と `rotCol` / `rowBg` ヘルパー、`displayBorder` プロップも同時に削除（lint クリーン化）
  - 旧「直前の記録を削除」ボタン（記録タブ直下から「詳細データ」折りたたみ内へ移設）
- **`.verdict-badge--hold` の色変更**: `index.css` で `--yellow` ベースの色合いを `--blue` ベース（`#38bdf8` 系のシアン）に変更。`VerdictBadge.jsx` の `VERDICT_CONFIG.hold.color` を `C.yellow` → `C.blue`、`iconKind` を `"⚠"`（絵文字）→ EKG SVG（`d="M3 12h3l2-6 4 12 3-8 2 4 1-2h3"`）に変更
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `evDecision.js` / `baseline.json` 不変（判定閾値も不変）
  - `rotRows` / `jpLog` / `sesLog` / `S.currentMochiBalls` / `hitWizardData` 等の保存データ構造は完全に同一
  - 既存ハンドラ（`decide` / `handleStartChain` / `handleMoveTable` / `S.pushLog` / `S.pushSnapshot` / `openChainWizard` 等）の**シグネチャ不変**。新規UIは presentation layer に徹してこれらを呼ぶだけ
- **操作ステップへの影響**:
  - 通常回転入力: CTA タップ → テンキー → 「この回転数を追加」（旧 入力ボタン → テンキー → 決定 と同等、ステップ数同じ）
  - 初当たり記録: FAB → イベントメニュー → 「初当たりを記録」→ 画面 A（旧「初当たり」ボタン直接押下より +1ステップ。ただし FAB は単一の入口として明確化）
  - 台移動: FAB → イベントメニュー → 「台移動を記録」→ 確認モーダル（新規導線、従来は機種設定タブ等から）
- **検証**:
  - `npm run lint`: errors=0（既存 warning 8 件のみ、本変更で増減なし）
  - `npm run build`: 成功（`built in 1.97s`、CSS 30.74 kB）
  - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`logic.js` 不変）
  - `node src/components/decision/__tests__/evDecision.test.mjs`: 5 passed / 0 failed
  - Playwright + Chromium で iPhone 14 viewport（390x844）スクリーンショット検証実施：判定カード（様子見 = 青/シアン）、3+4 指標、タイムライン、テンキーモーダル、イベントメニューがすべてモック準拠で描画
- **コミット**: `b7dd01e`
- **将来連携予定（メモ）**:
  - 指標カードのスパークラインを実測トレンド（`rotRows` の 1Kスタート系列等）と連動
  - 「継続判断 / メモ」を `window.prompt` から専用の小モーダル（テキスト入力 + プリセット）に置換
  - 「一時保存」を `localStorage` の明示的なスロット保存と組み合わせ（現状は IDB の自動永続化に依存）
  - 「実戦終了」を `isMoveArchive: false` の通常終了として App.jsx 側に専用ハンドラ追加（現状は `handleMoveTable` を流用し `isMoveArchive: true` で記録される）
  - イベントメニューの「長押しでよく使うイベントを設定」機能（モック準拠だが現状はラベルのみ）
  - 入力履歴チップの永続化（現状は `RotTab` の state、ページリロードで消失）

#### 設定画面を全1カラム縦リストへ再設計＋環境プロファイル化＋SNSシェア（匿名化）/生体認証ロック追加（見た目優先プロトタイプ）（✅ 本ブランチ `claude/settings-screen-redesign-YA6Bw`、2026-05-23）

- **背景**: ユーザー提供モック画像（iPhone縦画面の「すべて1カラム縦リストで統一」「環境サマリー→環境プロファイル化」「上級者向け設定の折りたたみ」「SNSシェア匿名化機能」「サポートも1カラム」が骨子）に従い、前回（CbML8）刷新版の設定画面に残っていた **横並び要素を全廃**して 1 カラムに統一。あわせて新規 2 項目（SNSシェア / 生体認証）を追加
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - 環境プロファイル名「マイホールA」は固定文字列（将来連携予定: ホール別プロファイルストアと接続）
  - 環境プロファイルカードのタップ先は現状「遊技設定サブビュー」へフォールバック。`TODO` コメントで「ホール環境プロファイル切替画面（マイホールA / B / 遠征用 など）」への遷移を予約
  - 「SNSシェア（匿名化）」は `snsAnonymize` ローカル state でON/OFFのみ。トグル時に `showToast` で確認表示する仮実装（将来連携予定: スクショ取得時のホール名/台番号マスキング処理）
  - 「自動ロック」「生体認証でのロック」「グラフ・表示設定」「通知・サウンド・振動」「アップデート履歴」「お問い合わせ」「利用規約・プライバシー」は `showToast(..., "warn")` で「準備中」を表示する仮実装
- **変更ファイル**:
  - `src/components/Tabs.jsx`（`SettingsTab` メイン return ブロックを全面再構成、新規アイコン `IconShare` / `IconFingerprint` を追加、`snsAnonymize` ローカル state を新設）
- **主な変更点（モックの各セクションにマッピング）**:
  | # | モック要素 | 実装 |
  |---|---|---|
  | 1 | ヘッダー右上「環境サマリー」→「**環境プロファイル**」 | 小ラベル `環境プロファイル` + メイン `マイホールA`（fontSize 13.5/weight 800/ellipsis）+ サブ `25玉交換 / 等価`。`minWidth 178 / maxWidth 220` で iPhone 幅でも左の「設定」と衝突しない幅。onClick に `TODO` で将来のホール環境切替画面導線 |
  | 2 | 遊技設定（**1カラム5項目**、旧 5チップgrid を撤去） | `ListRow` × 5：レート・交換率(#38bdf8) / 機種スペック(#ef476f) / 回転・補正(#ff9f43, sub「ボーダー補正 / 閉店補正」) / 貯玉設定(#21d99b, sub「収支に含める / 再プレイ上限あり」) / 詳細設定（上級者向け）(#c084fc, sub「削り補正 / 持玉比率 など」) |
  | 3 | 表示・カスタマイズ（**1カラム3項目**、旧 2カラム左半分を独立化） | テーマ・カラー・アクセシビリティ(#c084fc) / グラフ・表示設定(#38bdf8) / 通知・サウンド・振動(#ff5f8a) |
  | 4 | データ管理（**1カラム4項目**、旧 2カラム右半分を独立化） | 店舗検索・登録(#21d99b) / 機種検索・登録(#22d3ee) / バックアップ・復元(#38bdf8) / CSV出力(#ff9f43) |
  | 5 | セキュリティ（**1カラム4項目**、旧 3項目横並びを廃止） | アプリロック(#38bdf8, IconLock, Toggle) / 自動ロック(#c084fc, IconFaceId, chevron) / **SNSシェア（匿名化）**(#21d99b, IconShare 新設, Toggle, **新規**) / **生体認証でのロック**(#22d3ee, IconFingerprint 新設, chevron, **新規**)。スクショ保護は撤去 |
  | 6 | サポート（**1カラム2項目**、旧 2カラム横並びを廃止） | お問い合わせ(#38bdf8, IconChat) / 利用規約・プライバシー(#c084fc, IconDoc, sub「利用規約 / プライバシーポリシー」) |
  | 7 | アプリ情報 | 構造は前回（CbML8）と同等。左：アプリアイコン(56px、ネオングロー)、中央：パチトラッカー + Version 1.0.0 (2025.7.1) + サブコピー(2行クランプ)、右：最新版バッジ。下に「アップデート履歴」カード |
- **新規アイコン（細線 SVG）**:
  - `IconShare` — 3つの円を斜め線で繋いだ共有アイコン（SNSシェア用）
  - `IconFingerprint` — 同心円弧で構成された指紋アイコン（生体認証用）
- **削除した要素**:
  - 遊技設定の横並び5チップ grid（`grid-template-columns: repeat(5, 1fr)` + `subTileStyle` ヘルパー）
  - 表示・カスタマイズ + データ管理の 2カラム grid（`grid-template-columns: 1fr 1fr`）
  - セキュリティの 3項目横並び grid（`grid-template-columns: 1fr 1fr 1fr`）
  - サポートの 2項目横並び grid
  - 「スクショ保護」項目（IconShield を使った静的 chevron 行）
- **新規ヘルパー**:
  - `SectionLabelV2`：カード外左上に置く小ラベル（fontSize 12.5/weight 700/color #7da4cf）
  - `SectionCard`：`glassCardStyle` + `marginBottom: 18` のラッパー
  - `ListRow`：1カラム共通の行コンポーネント（minHeight 60px / アイコン 40px / fontSize 14.5px / サブ ellipsis 1行）
- **配色（前回 CbML8 と同一系統を継承）**:
  - メイン背景: `linear-gradient(180deg, #030714 0%, #06101e 100%)`
  - 半透明カード（`glassCardStyle`）: `linear-gradient(180deg, color-mix(in srgb, #0b1a2e 80%, transparent), color-mix(in srgb, #08111e 70%, transparent))` + `backdrop-filter: blur(8px)`
  - カード枠線: `color-mix(in srgb, #5b8fcf 16%, transparent)`
  - 行ボーダー: `1px solid color-mix(in srgb, #5b8fcf 10%, transparent)`（最終行は `none`）
  - ネオン系アイコン枠（`NeonIconBox`）: グラデーション背景 + 外側グロー + 内側ハイライト（前回と同一）
  - 文字: メイン `var(--text)`、サブ `#6f8aae`、強調 `#7da4cf`
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `evDecision.js` / `baseline.json` 不変（判定閾値も不変）
  - `rotRows` / `jpLog` / `sesLog` / `S.currentMochiBalls` / `hitWizardData` / `pt_stores` / `pt_customMachines` / `pt_hunterRank` 等の保存データ構造は完全に同一
  - 既存サブビュー（`showAppearanceView` / `showGameSettingsView` / `showMachineSpecView` / `showChodamaView` / `showBackupView` / `showStoreSearch` / `showMachineSearch` / `showRotationView` / `showAdvancedView`）はすべて未変更。新規 `ListRow` から既存ハンドラを呼ぶだけ
  - PIN設定UI（`pinSetStep` / `pinDraft` / `pinConfirm` / `pinSetError`）は新セキュリティセクション直下に移設、ロジックは完全同一
  - 前回（CbML8）で完了済みの「ハンターランク・バッジを設定画面から除去」「フッター ModeTabBar コンパクト化」も維持（再変更なし）
- **操作ステップへの影響**:
  - 設定画面トップ閲覧: 0 ステップ（タブを開くだけ）— 既存と同じ
  - 各サブビューへの遷移: 1 タップ（前回と同じ。遊技設定は旧「5チップ横並びの中から1チップ選択」と同じ 1 タップ）
  - 環境プロファイルカードのタップ: 1 タップで遊技設定サブビュー（将来はホール環境切替画面）
  - SNSシェア（匿名化）の切替: 1 タップで Toggle（新規導線）
  - タップ領域: `ListRow` の `minHeight: 60px` / アイコン枠 40px — CLAUDE.md「タップ領域は最低44px以上」を遵守
- **画面崩れ対策**:
  - メインラベル `fontSize: 14.5 / weight: 600`、サブテキスト `fontSize: 11.5` を全 `ListRow` で統一（iPhone 幅で文字が潰れないサイズ）
  - サブテキストは `overflow: hidden / textOverflow: ellipsis / whiteSpace: nowrap` で1行省略（縦文字化を防止）
  - 環境プロファイルカードは `minWidth: 178 / maxWidth: 220`、プロファイル名は ellipsis で1行省略
  - アプリ情報のサブコピーは `-webkit-line-clamp: 2` で最大2行に制限
  - セクション間 `marginBottom: 18` で余白を広めに確保（圧迫感を軽減）
- **検証**:
  - `npm run lint`: errors=0（既存 warning 7 件のみ、本変更で増減なし）
  - `npm run build`: 成功（`built in 1.86s`、CSS 31.31 kB / JS 705.12 kB）
  - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`diff` 差分なし）
  - スクリーンショット検証: 環境にブラウザが同梱されていないため未実施。CSS / JSX を仕様書と照合して構造確認のみ実施
- **コミット**: `66955ab`
- **将来連携予定（メモ）**:
  - 環境プロファイルカードのタップ先を「ホール環境プロファイル切替画面（マイホールA / B / 遠征用 など）」に接続
  - 「SNSシェア（匿名化）」をスクショ取得時のホール名/台番号マスキング処理と連動（現状はトグル状態のみ）
  - 「生体認証でのロック」を Web Authentication API もしくは PWA の `navigator.credentials` と接続（現状は toast）
  - 「自動ロック」を `S.lastActivityAt` のような状態と連動した自動 lock タイマーへ接続
  - 「グラフ・表示設定」「通知・サウンド・振動」サブビューの実装
  - 「アップデート履歴」を PWA の `vite-plugin-pwa` 更新検知 + リリースノート表示に連動
  - 「お問い合わせ」「利用規約・プライバシー」の専用ページ追加
  - 「最新版」バッジの動的判定

#### 設定画面のモック準拠 全面刷新 + ハンターランク/バッジ除去 + フッターコンパクト化（見た目優先プロトタイプ）（✅ 本ブランチ `claude/settings-screen-redesign-CbML8`、2026-05-23）

- **背景**: ユーザー提供モック画像（iPhone想定の「高級感のある分析OS風ダークUI、背景は黒に近い濃紺グラデーション・半透明濃紺カード・ネオン系グラデーションアイコン・iOS Settings + ゲーミング分析OS の中間」）に従い、設定画面（`currentMode === "settings"`）を全面刷新。あわせて「ハンターランク・実績バッジを設定画面から完全に削除」「フッター/下部ナビを薄く・コンパクトに」を実施
- **見た目優先プロトタイプの位置付け**:
  - CLAUDE.md「UI開発フェーズの分離 → 1. 見た目優先プロトタイプ」に従い、`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` のいずれにも触れていない
  - 「グラフ・表示設定」「通知・サウンド・振動」「自動ロック」「スクショ保護」「アップデート履歴」「お問い合わせ」「利用規約・プライバシー」「アプリを評価」は `showToast(..., "warn")` で「準備中」を表示する仮実装。将来連携予定
  - 「最新版」バッジは静的表示（PWA の更新検知と連動していない。将来連携予定）
  - 「環境サマリー」カードの値は実データ（`s.exRate` / `getExRateKey()` / `calcBorder`）を使用
- **変更ファイル**:
  - `src/components/Tabs.jsx`（`SettingsTab` のメイン表示部分（L10002〜L10200 相当）を全面再構成、サブビュー `showRotationView` / `showAdvancedView` を新規追加、ネオン系アイコン 9 種を追加：`IconExchange` / `IconTrending` / `IconCoin` / `IconCalculator` / `IconChartBars` / `IconBell` / `IconCsv` / `IconFaceId`、`HunterRankBadge` / `BadgeList` の import + JSX 使用を完全削除）
  - `src/components/ModeTabBar.jsx`（コンパクト化）
  - `src/App.jsx`（`<main>` の `paddingBottom` を `calc(52px + safe-area)` → `calc(44px + safe-area)` へ追従）
- **主な変更点（モックの各セクションにマッピング）**:
  | # | モック要素 | 実装 |
  |---|---|---|
  | 1 | ヘッダー（タイトル「設定」+ サブ「アプリの各種設定を管理します」+ 右上に環境サマリーカード） | タイトル `fontSize 30 / weight 800 / letterSpacing -0.6`、サブ `fontSize 11.5 / color #6f8aae`。環境サマリーは半透明濃紺カード（歯車アイコン + ラベル + メイン「25玉交換 / 等価」 + サブ「ボーダー 16.7/K」 + chevron）。タップで `setShowGameSettingsView(true)` |
  | 2 | 遊技設定（横長カード内に 5 チップ） | `glassCardStyle` の横長カード + `grid-template-columns: repeat(5, 1fr)`。5チップ：レート・交換率(#38bdf8)/機種スペック(#ef476f)/回転・補正(#ff9f43)/貯玉設定(#21d99b)/詳細設定(#c084fc)。各チップは `subTileStyle(color)` で `linear-gradient` 背景 + `NeonIconBox` + 2行ラベル |
  | 3 | 表示・カスタマイズ（左半分カード） | テーマ・カラー(#c084fc, `IconPaint`) / グラフ・表示(#38bdf8, `IconChartBars`) / 通知・サウンド(#ff5f8a, `IconBell`) の 3 行リスト。`ListRow` コンポーネントで `NeonIconBox 36px` + 2行ラベル + chevron |
  | 4 | データ管理（右半分カード） | 店舗検索・登録(#21d99b, `IconStore`) / 機種検索・登録(#22d3ee, `IconMagnifier`) / バックアップ・復元(#38bdf8, `IconCloud`) / CSV出力(#ff9f43, `IconCsv`) の 4 行リスト |
  | 5 | セキュリティ（3項目横並び） | `grid-template-columns: 1fr 1fr 1fr`。アプリロック(#38bdf8, `IconLock`, Toggle) / 自動ロック(#c084fc, `IconFaceId`, chevron) / スクショ保護(#21d99b, `IconShield`, chevron)。PIN設定UIは展開時のみ表示（既存ロジック流用） |
  | 6 | サポート（2項目横並び） | `grid-template-columns: 1fr 1fr`。お問い合わせ(#38bdf8, `IconChat`) / 利用規約・プライバシー(#c084fc, `IconDoc`) |
  | 7 | アプリ情報（下部カード） | 左：アプリアイコン（56px、`linear-gradient #1e3a8a → #1e1b4b` + ネオングロー）、中央：「パチトラッカー」+ Version 1.0.0 (2025.7.1) + サブコピー、右：「最新版」バッジ（緑系ピル形）。下に「アップデート履歴」カード |
  | 8 | 下部ナビ（コンパクト化） | `ModeTabBar.jsx`: `minHeight 52→44 / icon 22→20（記録のみ24→22）/ fontSize 10→9 / padding "8px 0 6px"→"5px 0 4px" / gap 3→2`、上線を `color-mix(in srgb, #5b8fcf 14%, transparent)` の薄い青グレーに、背景を `color-mix(in srgb, var(--nav-bg) 85%, transparent)` の半透明濃紺に統一、`backdrop-filter` を `blur(20px)→blur(24px)` で強化 |
- **新規サブビュー**:
  - `showRotationView`（回転・補正）: 合成確率分母 / 1h消化回転数 / ボーダー手動値 の 3 入力 + DB/理論ボーダーの自動計算表示
  - `showAdvancedView`（詳細設定）: 旧「危険な操作」セクション（データリセット）を移設
- **配色（モック仕様準拠）**:
  - メイン背景: `linear-gradient(180deg, #030714 0%, #06101e 100%)`（黒に近い濃紺グラデーション）
  - 半透明カード（`glassCardStyle`）: `linear-gradient(180deg, color-mix(in srgb, #0b1a2e 80%, transparent), color-mix(in srgb, #08111e 70%, transparent))` + `backdrop-filter: blur(8px)`
  - カード枠線: `color-mix(in srgb, #5b8fcf 16%, transparent)`（薄い青グレー）
  - ネオン系アイコン枠（`NeonIconBox`）: `linear-gradient(135deg, color-mix(in srgb, ${color} 32%, transparent), color-mix(in srgb, ${color} 8%, transparent))` + `box-shadow: 0 0 20px color-mix(in srgb, ${color} 22%, transparent), inset 0 1px 0 color-mix(in srgb, ${color} 30%, transparent)`（外側グロー + 内側ハイライト）
  - 文字: メイン `var(--text)`、サブ `#6f8aae`、強調 `#7da4cf`
- **削除した要素**:
  - `HunterRankBadge` の JSX 使用（旧 L10024-10026）
  - `BadgeList` の JSX 使用（旧 L10029-10031）
  - 上記 2 つの `import` 文（`./hunter/HunterRankBadge` / `./hunter/BadgeList`）
  - `<SectionLabel>` ベースのフラットリストレイアウト（旧 L10033-10193 の「外観 / ゲーム設定 / セキュリティ / データ / 危険な操作 / アプリ情報」フラット構造）。データリセットは `showAdvancedView` へ移設、アプリ情報は新カードへ統合
  - 旧アプリ情報セクションの 4 行（お問い合わせ / アプリを評価 / 利用規約 / プライバシーポリシー）→ 新サポートセクションの 2 行（お問い合わせ / 利用規約・プライバシー）に集約
- **保護**:
  - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
  - `evDecision.js` / `baseline.json` 不変（判定閾値も不変）
  - `rotRows` / `jpLog` / `sesLog` / `S.currentMochiBalls` / `hitWizardData` / `pt_stores` / `pt_customMachines` / `pt_hunterRank`（state自体は残置、設定画面で表示しないだけ）等の保存データ構造は完全に同一
  - 既存サブビュー（`showAppearanceView` / `showGameSettingsView` / `showMachineSpecView` / `showChodamaView` / `showBackupView` / `showStoreSearch` / `showMachineSearch` / store/machine の `selected` / `editing` / `form` フロー）はすべて未変更。新規エントリポイントから既存ハンドラを呼ぶだけ
  - PIN設定UI（`pinSetStep` / `pinDraft` / `pinConfirm` / `pinSetError`）は新セキュリティセクション直下に移設、ロジックは完全同一
  - ハンターランク本体（`pt_hunterRank` / `pt_hunterCounters` / `pt_notificationLog`）は App.jsx 側で引き続き計算・保存される。判定変化通知・XP加算・バッジ解放ロジックも不変。**設定画面での視覚的露出のみ無効化**
- **操作ステップへの影響**:
  - 設定画面トップ閲覧: 0 ステップ（タブを開くだけ）— 既存と同じ
  - 各サブビューへの遷移: モック準拠で 1 タップ（旧フラットリストと同じ）
  - 環境サマリーカード: 新規導線として 1 タップで `showGameSettingsView` を開く（操作ステップ短縮）
  - 「データをリセット」: 旧トップから 1 タップ → 「詳細設定」サブビュー経由で 2 タップに変更（誤タップ防止の意図的な追加ガード）
  - フッター高さ縮小: タップ領域は `minHeight 44px` を確保（CLAUDE.md「タップ領域は最低44px以上」を遵守）
- **検証**:
  - `npm run lint`: errors=0（既存 warning 7 件のみ、本変更で増減なし。1件の `'IconComp' is defined but never used` は `NeonIconBox` の `{IconComp ? <IconComp /> : null}` 形式で解消）
  - `npm run build`: 成功（`built in 2.42s`、CSS 31.31 kB / JS 708.82 kB）
  - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`logic.js` 不変）
  - スクリーンショット検証: 環境のネットワーク制限により Playwright Chromium ダウンロードが不可（`Host not in allowlist`）。CSS / JSX を仕様書と照合して構造確認のみ実施
- **コミット**: `a1c03e3`
- **将来連携予定（メモ）**:
  - 「グラフ・表示設定」「通知・サウンド・振動」サブビューの実装（現状は toast 仮表示）
  - 「自動ロック」「スクショ保護」の実装（現状は toast 仮表示）
  - 「アップデート履歴」を PWA の `vite-plugin-pwa` の更新検知 + リリースノート表示に連動（現状は toast 仮表示）
  - 「最新版」バッジの動的判定（現状は静的）
  - 「お問い合わせ」「利用規約・プライバシー」の専用ページ追加
  - CSV出力導線は現状「バックアップ・復元」サブビューへ繋いでいる（同サブビュー内で JSON 全データ出力可能）が、将来的にセッション CSV 専用エクスポートを追加する場合は分離検討
  - ハンターランク・バッジを「ホームタブ」または「分析モード」に再配置する案（設定画面からは完全分離済み）

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
- ✅ 初当たり入力フロー改修の設計ドキュメント `docs/input-flow-design.md` を新規作成（PR #194 マージ済み）。コード変更なし。新フロー（1画面5項目・開始上皿玉必須化・連チャン時の自動引き継ぎ・出玉プリセット）の画面構成・データモデル・実装ステップ案を整理。`logic.js`/`baseline.json`/`evDecision.js` 不変方針
- ✅ 上記設計ドキュメントの **Step C〜G を一括統合実装**（本ブランチ `claude/implement-ui-design-wqaYW`、2026-05-20）。`logic.js` / `baseline.json` 不変を厳守
  - **画面 A**: 旧 hitWizard（8 ステップ）を 1 画面 5 項目（回転数 / 開始上皿玉 / ラウンド数 / 液晶出玉 / 実測出玉）+ 連チャン継続 / 単発終了 + プッシュ額折りたたみ + 出玉プリセット + リアルタイム獲得計算に刷新。開始上皿玉を**必須化**
  - **画面 B**: 旧 chainWizard（9 ステップ）の 0〜7 を 1 画面 4 項目（回転数 / ラウンド数 / 液晶出玉 / 実測出玉）+ 継続 / 単発終了 / RUSH終了 へ刷新。開始上皿玉は前回終了時持玉から自動引き継ぎ（「前回引き継ぎ: ◯◯玉」バッジ表示）。`lastOutBalls` / `nextTimingBalls` / `elecSapoRot` / `sapoChange` の内部分離は保持（保存データ互換）
  - **画面 C**: 旧 `chainWizardStep === 8` の最終実測持ち玉入力をヘッダー「ラッシュ終了 — 最終確認」+ チェーン集計表示として独立化
  - 「初当たり」ボタンの起動経路を変更：旧（テンキー bottom sheet jackpot mode → 確定で wizard 起動）→ 新（直接画面 A 起動、回転数は 5 項目の 1 つとして同画面で入力）。bottom sheet の `inputSheetMode = "jackpot"` 経路を撤去（変数自体も削除）
  - `handleStartChain(rotCountArg)` に引数を追加：画面 A から `(rotCount値)` を直接渡せるよう拡張。旧経路の引数なし呼び出しは下位互換として残置（実コードパスは消失済）
  - 既存ハンドラ（`handleWizardComplete` / `handleChainWizardComplete` / `handleChainWizardSingleEnd`）は**シグネチャ不変**。新UI は presentational layer に徹してこれらを呼び出すだけ
  - `chain.hits[]` / `chain.trayBalls` / `chain.finalRealBalls` 等の保存データ構造は完全に同一。旧UIで作成したチェーンは新UIで閲覧・編集・削除可能
  - 仕様書未決事項（§9）はすべて `docs/implementation-notes.md` に判断記録：プッシュ額は画面 A 内の折りたたみ・「RUSH継続期待度」は算出式未確定のため非表示・電サポ効率は直近 hit の sapoPerRot で暫定表示など
  - **検証**: `npm run lint` warnings=7 errors=0（ベースライン同等）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と完全一致、`evDecision.test.mjs` / `badges.test.mjs` も全 PASS
- ✅ 画面 A をユーザー提供モックアップ準拠の見た目に再刷新（本ブランチ `claude/numeric-keypad-ui-yceuE`、2026-05-20）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` 不変を厳守
  - 上部 5 カードステータス（現在持玉 / 期待差玉 / 電サポ効率 / RUSH継続期待度 / 1Rあたりの出球）
  - 「現在入力中: デフォルト」+「入力ガイド」のタイトル行 +「初当たり / 連チャン追加」タブ
  - 5 行 Row を円形アイコン付き（rotate/coin/R/monitor/target）にリデザイン
  - **テンキーを入力項目タップ時のみ表示**（初期 `hitInputFocus = ""`、focus 設定時にテンキー出現）
  - **「入力確定」ボタン**で次のフィールドへフォーカス遷移（`FIELD_ORDER` + `onEnterPress`）
  - 「今回の入力まとめ（未確定）」パネルをテンキー横／単独で常時表示。RUSH継続回数を大きな黄色数字で
  - 「よく使う出玉プリセット」セクションを画面 A から削除（ユーザー要望）
  - 液晶出玉 / 実測出玉のプリセットを 4 段階（450/750/1500/3000、380/750/1500/3000）に拡張
  - **検証**: `npm run lint` errors=0、`npm run build` 成功、`protected-fns.mjs` の出力が `baseline.json` と完全一致
  - **コミット**: `73f388c`
- ✅ 大当たりタブ ヒーロー3カードのモック2準拠 再調整（本ブランチ `claude/mockup-redesign-graphs-JsNqn`、2026-05-22）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` 不変を厳守
  - スパークラインを滑らかな正弦波 → 実データ風のジッターライン（シード式 LCG ランダムウォーク・32点・ストローク 1.6 → 1.3）に刷新
  - カード高さを揃えるため `minHeight: 158px` を 3 カードに付与、`marginTop: "auto"` でチャートを常にカード下端に固定
  - スパークラインの高さ 28px → 40px、`viewBox` 上下に余白追加で枠ベタ付きを回避
  - 「現在評価」カードの絵文字 22px → 26px、ラベル 20px → 22px、`+N玉` 12px → 13px に拡大しモック2の存在感を再現
  - 「現在持玉」の `+1,250玉` サブ表示をピル背景 → プレーンテキスト風（玉単位を小さくサフィックス表記）に整理
  - **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功
  - **コミット**: `27b4064`
- ✅ 詳細データタブのモック準拠 全面刷新（本ブランチ `claude/detail-data-dark-ui-HrRss`、2026-05-22）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` / `evDecision.js` 不変を厳守
  - 詳細データタブ全体を「分析OS風ダークUI」に再構成：AI分析サマリー → 1Kスタート/想定時給 → 終了予定までの想定仕事量レンジバー → 仕事量vs実収支 3カラム → 期待値との差 半円σゲージ → ボーダー差・信頼度の2線推移グラフ → 詳細スタッツ → 計算根拠 の 8 セクション
  - 背景 `#050B18` + 半透明グラデーションカード + ブラー、アクセント `#0A84FF`/`#21D99B`/`#FFB020`/`#FF5A5F`/`#C084FC`
  - 実データがあれば既存 `ev` / `evEff` / `decision` から、無ければモック準拠ダミー値
  - 交換率は `S.ballVal`（円/玉）優先表示、`1000/S.exRate` フォールバック
  - σ プロキシ：`(実収支 − 期待値) / max(3500, sqrt(netRot) × 280)` の概算（見た目用）
  - モジュール先頭に `dataCardStyle()` / `cardHeaderStyle()` / `cardNumDot()` / `cardTitleStyle()` / `subCardStyle()` / `subCardLabel()` ヘルパー追加
  - 旧 UI の「データ履歴」「メモを追加」ボタンは廃止（情報が本タブ内で完結するため）
  - **検証**: `npm run lint` errors=0、`npm run build` 成功、`protected-fns.mjs` 出力が `baseline.json` と完全一致
  - **コミット**: `3761101`
- ✅ 記録モード画面のモック2準拠 全面刷新（ブランチ `claude/recording-mode-dark-ui-mkrJi`、2026-05-22）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` / `evDecision.js` 不変を厳守
  - `RotTab` の rot サブタブを全面再構成：判定ステータスカード（心電図 + 円形ゲージ + データ精度/安定まであと）→ 3+4 指標カード（補正後EV/K黄・生EV/K青・ボーダー差緑 + 装飾スパークライン / 予測回転率・総投資・持ち玉・実質投資）→ タイムライン形式の直近の行動ログ → 2列グリッドの判定の根拠（要約）→ 詳細データ折りたたみ
  - サブタブラベル変更: 「実戦」→「記録」、「大当たり」→「大当たり履歴」
  - `.verdict-badge--hold` / `VerdictBadge` の `hold` 色を **黄 → 青/シアン**に変更（モック要件「警告ではなく分析中・未確定の印象に」）
  - 旧「入力 / 初当たり」2ボタン構成を廃止し、**下部固定 CTA「回転数を入力する」+ 右下 FAB「+イベント」**の単一導線に集約
  - 新規 **イベントメニュー**（FABから開くボトムシート、6項目）: 初当たり/台移動/継続判断/メモ/一時保存/実戦終了。既存ハンドラ（`setHitWizardOpen` / `setShowMoveModal` / `S.pushLog` / `S.pushSnapshot` / `S.handleMoveTable`）を呼ぶだけ
  - **テンキーモーダル刷新**: 上部に持ち玉 / 現在回転数 / 前回入力チップ + 大型数値ディスプレイ + 3×3 数字キー + 0/00/⌫ + 「この回転数を追加」+ 入力履歴チップ表示
  - `RecentEventList` で「1K決定」「持ち玉NN玉消費」等の回転入力ノイズを除外（`isRotInputType` 正規表現）
  - 撤去: 履歴アコーディオン、`showHistory` state、`rotCol` / `rowBg` ヘルパー、`displayBorder` プロップ、neon-card 現金/持ち玉 2連、stat バー
  - **検証**: `npm run lint` errors=0（既存 warning 8 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.97s`）、`protected-fns.mjs` の出力が `baseline.json` と完全一致、`evDecision.test.mjs` 5/5 PASS、Playwright + Chromium で iPhone 14 viewport（390x844）スクリーンショット検証実施
  - **コミット**: `b7dd01e`
- ✅ 詳細データタブを「折りたたみ型 分析OS UI」へ刷新（ブランチ `claude/claude-code-detail-ui-redesign-J0Hzo`、2026-05-23）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` / `evDecision.js` 不変を厳守
  - **背景**: ユーザー提供モック（黒背景・カード型・折りたたみ展開のスタイリッシュな分析OS）に従い、詳細データタブ（`sessionSubTab === "data"`）を「常時表示4セクション + 折りたたみ5セクション + 下部固定ステータスバー」構造へ再構成。「読ませるレポート」ではなく「ホールで3秒で判断する分析OS」を目標
  - **常時表示エリア**（タブを開いた瞬間に見える）:
    | # | 内容 | 主な実装 |
    |---|---|---|
    | 1 | AI分析サマリー（チェックリスト型） | 旧プロセ文（「現在のベースは〜」）を撤去し、`aiChecklist` 4 行のチェックリストに置換（`✓`緑 / `✗`赤 / `⚠`黄 / `◎`青のSVGアイコン）。各行は `bDiff / confidence / netRot` から動的生成。右上に折りたたみボタン（`aiSummaryOpen` で開閉、既定: 展開）。サブカードは 4 個 → 2×2 グリッドに再配置（データ精度・信頼度・次の判断ライン・信頼度MIDまで） |
    | 2 | 1Kスタート（左カード） | 大数字 + 理論ボーダー + 「ボーダーを +N回 上回って／下回って」ピル。`bDiff` の符号で色を緑/赤に切替（チェックアイコンつき） |
    | 3 | 想定時給（右カード、参考値強調） | LOW 信頼度時は数値サイズを 32→22px に縮小し opacity 0.85 で控えめに。`LOW`バッジを右上にカラフルに表示（LOW=黄、MID=青、HIGH=緑）、`ブレ幅 ±N円/h` を独立行に明記 |
    | 4 | 終了予定までの想定仕事量 | 中央値 + 推定レンジバー（緑→シアン→青グラデ、中央値白マーカー、両端ドット）+ 右上に終了予定時刻 |
  - **折りたたみエリア**（通常時は 1 行サマリーのみ、タップで展開）:
    - 状態管理: `dataExpanded: { work, sigma, trend, stats, calc }` を `RotTab` 直下の `useState` に新設。`toggleDataSec(k)` で開閉切替。既定はすべて折りたたみ
    - 共通ヘッダ: `CollapseRow` 内部コンポーネント（番号バッジ + タイトル + 1 行サマリー + 回転シェブロン）。タップ領域 48px 以上
    - 展開アニメーション: CSS `.data-collapse-body` + `@keyframes data-expand`（iOS 風 ease-out 0.28s）
    | セクション | 折りたたみ時サマリー | 展開時 |
    |---|---|---|
    | 仕事量 vs 実収支 | `期待値 +N円 / 実収支 +N円 / 差分 +N円（上振れ／下振れ／想定通り）` | 3 カラム + ダミースパークライン |
    | 期待値との差（σ分析） | `+1.8σ（上振れ中）` | 半円ゲージ。**虹色グラデを撤去し、青 → グレー → 黄 のみ**（`sigmaGradV2`）。ピル色も `sigmaPillBg/Border/Color` で 3 色（青/グレー/黄）に統一 |
    | ボーダー差・信頼度の推移 | `ボーダー差 +N / 信頼度 N%` | 2 線グラフ（緑実線・紫点線）+ 右側現在値カード。**最終点にパルス発光**（`.data-pulse-ring` + `@keyframes data-pulse` 1.8s ループ）、白枠ドットで現在地を強調 |
    | 詳細スタッツ | `単価 +N円/回 / 持ち玉比率 N%` | **優先度別レイアウト**：高（単価・持ち玉比率・平均出玉）は色付き 3 カード（大きめ）、低（大当たり確率・通常回転・大当たり回数・初当たり確率）はグレー小行リスト |
    | 計算根拠 | `初当たり 1/N / 交換率 N円/玉` | 6 行リスト（初当たり確率・表記出玉・持ち玉・総投資・交換率・再プレイ上限）+ 「すべての計算根拠を見る」ピル型ボタン（既存 `setShowGraphModal(true)` を呼ぶ） |
  - **最下部固定ステータスバー**（スクロール中も常時表示）:
    - 位置: `position: fixed; bottom: calc(56px + env(safe-area-inset-bottom))`、`maxWidth: 480px` でセンタリング、ModeTabBar の上に重ねる
    - 背景: 上から透明 → 濃紺グラデで馴染ませる + バー本体は半透明グラデ + blur 12px + ボーダー
    - 左: 円形ステータスアイコン（緑/赤）+ 「持ち玉遊技中／稼働中」+「ボーダー +N回 | 期待値プラス／マイナス／ニュートラル」
    - 右: 信頼度 % + 縦区切り線 + 次の判断ライン（300回転 or 継続中）
    - スクロール領域の `paddingBottom` を `calc(96px + safe-area)` → `calc(120px + safe-area)` に拡大して被りを回避
  - **撤去**: 旧 AI サマリーのプロセ文 3 行、旧 σ ゲージの紫→赤虹色グラデ、旧詳細スタッツの均一テーブル風レイアウト
  - **新規 CSS**（`src/index.css`）:
    - `@keyframes data-pulse` — 現在点パルス（1.8s ループ、scale 1→2.4 + opacity 0.85→0）
    - `@keyframes data-expand` — iOS 風スプリング展開（0.28s ease-out）
    - `.data-pulse-ring` / `.data-collapse-body` / `.data-card-hover` クラス
  - **新規 state**（`Tabs.jsx` 内 `RotTab`）:
    - `dataExpanded: { work, sigma, trend, stats, calc }` — 折りたたみ5セクションの開閉
    - `toggleDataSec(k)` — トグルヘルパー
    - `aiSummaryOpen` — AI 分析サマリーの折りたたみ
  - **保護**:
    - `logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` 不変
    - `evDecision.js` / `baseline.json` 不変（判定閾値も不変）
    - `rotRows` / `jpLog` / `S.currentMochiBalls` / `hitWizardData` 等の保存データ構造は完全に同一
    - 既存ハンドラ（`evDecision` / `effectiveEv` / `setShowGraphModal` / `UndoControls` / `S.setTab` 等）の**シグネチャ不変**。新 UI は presentation layer に徹してこれらを呼ぶだけ
    - 想定仕事量レンジ・推移グラフのダミー時系列・σ プロキシ概算は前回実装と同じロジックを維持
  - **操作ステップへの影響**:
    - 詳細データタブ閲覧: 0 ステップ（タブを開くだけ）— 既存と同じ
    - 折りたたみセクションの詳細表示: タブ内タップ +1 ステップ。だが「店内3秒判断」優先で常時表示が4セクションに絞られ、初期画面の情報密度は下がる
    - 「すべての計算根拠を見る」リンク: 既存 `setShowGraphModal(true)` を呼ぶ
  - **検証**:
    - `npm run lint`: errors=0（既存 warning 8 件のみ、本変更で増減なし）
    - `npm run build`: 成功（`built in 1.87s`、CSS 31.31 kB / JS 698.74 kB）
    - `node src/__tests__/protected-fns.mjs`: 出力が `baseline.json` と完全一致（`diff` 結果なし）
    - `node src/components/decision/__tests__/evDecision.test.mjs`: 5/5 PASS
    - 注: 本セッションのリモート実行環境にはブラウザ（Chromium/Playwright）が同梱されておらず、Playwright スクリーンショット検証は未実施。`npm run dev` でローカル確認を要する
  - **将来連携予定（メモ）**:
    - チェックリスト項目の判定条件を `evDecision` の閾値定数（`continue_strong`/`continue`/`hold`/`stop`）と連動
    - 「次の判断ライン」を `evDecision` の信頼度しきい値（0.4/0.5）と動的連動
    - 推移グラフの時系列を `rotRows` の実タイムスタンプ系列から実データ化（パルス位置も実データに同期）
    - σ プロキシを過去セッションの workAmount 分布から推定した標準偏差で正規化
- ✅ 設定画面を分析OS風ダークUI（モック準拠）に全面刷新（ブランチ `claude/settings-screen-redesign-CbML8`、2026-05-23、PR #212 マージ済み）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` / `evDecision.js` 不変を厳守
  - ヘッダー（タイトル+環境サマリーカード）/ 遊技設定 5チップ / 表示・カスタマイズ + データ管理 2カラム / セキュリティ 3項目横並び / サポート 2項目横並び / アプリ情報（最新版バッジ+アップデート履歴） の 6 セクション構成
  - ハンターランク・実績バッジを設定画面から完全削除（import / JSX 両方除去）
  - フッター `ModeTabBar` を `minHeight 52→44 / icon 22→20 / fontSize 10→9` でコンパクト化
  - 詳細は L731 のセクション参照
- ✅ 設定画面を全1カラム縦リストへ再設計＋環境プロファイル化＋SNSシェア（匿名化）/生体認証ロック追加（ブランチ `claude/settings-screen-redesign-YA6Bw`、2026-05-23）。**見た目優先プロトタイプ**として実装、`logic.js` / `baseline.json` / `evDecision.js` 不変を厳守
  - 前回（CbML8）刷新版に残っていた横並び要素を全廃。遊技設定 5チップ→1カラム5項目、表示・カスタマイズ + データ管理 2カラム→各々1カラム、セキュリティ 3項目横並び→1カラム4項目、サポート 2項目横並び→1カラム2項目
  - ヘッダー右上：「環境サマリー」→「**環境プロファイル（マイホールA）**」へ。`TODO` コメントで将来のホール環境切替画面導線を予約（現状は遊技設定サブビューへフォールバック）
  - セキュリティに **SNSシェア（匿名化）**（Toggle、`snsAnonymize` ローカル state）と **生体認証でのロック**（chevron）を新規追加。旧「スクショ保護」を撤去
  - 新規アイコン `IconShare` / `IconFingerprint` を追加
  - ラベル拡充：詳細設定→「詳細設定（上級者向け）」、テーマ・カラー→「テーマ・カラー・アクセシビリティ」、グラフ・表示→「グラフ・表示設定」、通知・サウンド→「通知・サウンド・振動」
  - 共通ヘルパー新設：`SectionLabelV2`（カード外左上ラベル）/ `SectionCard`（`glassCardStyle` + marginBottom 18）/ `ListRow`（1カラム共通行、minHeight 60px / アイコン 40px / fontSize 14.5px / サブ ellipsis 1行）
  - **検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.86s`、CSS 31.31 kB / JS 705.12 kB）、`protected-fns.mjs` の出力が `baseline.json` と完全一致
  - **コミット**: `66955ab`（push 済）

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
7. `docs/implementation-notes.md` — 上記設計書の実装メモ（2026-05-20 新規）。仕様書未決事項への判断・妥協点・保存形式互換性
8. 大当たり後フロー調査レポート — ブランチ `claude/investigate-jackpot-flow-IXTu2` 内

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

# === 詳細データタブのモック刷新（2026-05-22）の確認 ===
# 専用スタイルヘルパー
grep -n "dataCardStyle\|cardHeaderStyle\|cardNumDot\|subCardStyle" src/components/Tabs.jsx
# → L368-422 付近に 6 関数の定義、L3169 以降の data タブ実装で使用

# 詳細データタブの実装位置
grep -n 'sessionSubTab === "data"' src/components/Tabs.jsx
# → L3169 で IIFE 開始、ここから 8 セクションが続く
```

### 直近の状態サマリー（2026-05-22 時点、詳細データタブのモック準拠 全面刷新 完了後）

- **作業ブランチ**: `claude/detail-data-dark-ui-HrRss`（push 済 / PR 未作成）
- **本ブランチで変更**:
  - `src/components/Tabs.jsx`:
    - 旧データタブ（`S.sessionSubTab === "data"` ブロック、L3169〜L3396）を新規実装で完全置換
    - モジュール先頭（`effectiveEv` 直下）に詳細データタブ専用スタイルヘルパー 6 関数を追加：`dataCardStyle()` / `cardHeaderStyle()` / `cardNumDot()` / `cardTitleStyle()` / `subCardStyle()` / `subCardLabel()`
    - 新規 8 セクション構造（AI分析サマリー / 1Kスタート・想定時給 / 想定仕事量レンジ / 仕事量vs実収支 / 期待値との差σゲージ / ボーダー差・信頼度推移 / 詳細スタッツ / 計算根拠）
    - インライン SVG アイコン群（IcAi / IcGauge / IcShield / IcCross / IcArrowFwd / IcClock / IcInfo / IcChevron / IcCircleDot / IcMochi / IcBalls / IcLight / IcRot / IcFlame / IcPercent / IcDice / IcCoin / IcInv / IcSwap）を IIFE 内で定義
    - 半円 σ ゲージ（SVG arc + linearGradient + 針 + 目盛り）、推移グラフ（SVG 2 線 + 軸 + ドット）、LCG ランダムウォークによる装飾スパークラインをすべて inline SVG で実装
    - 旧 UI の「グラフで確認」「データ履歴」「メモを追加」3 ボタンは廃止。代わりに計算根拠カード末尾の「すべての計算根拠を見る」リンクから既存 `setShowGraphModal(true)` を呼ぶ
    - `UndoControls` はカード末尾に中央配置で残置（ロングプレス削除用）
- **追加した state / props**: なし（既存の `ev` / `S` / `setShowGraphModal` / `effectiveEv` / `evDecision` のみ使用）
- **撤去した state / 関数**: なし（旧 UI の `IcSmile` / `IcFrown` / `IcMeh` 等のローカル変数は新 UI に再定義済み）
- **lint / build**: いずれもエラー 0（既存警告 8 件のみ、本変更で増減なし）
- **保護関数テスト**: `node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と完全一致（`logic.js` 不変）
- **コミット**: `3761101`
- **以下は前回時点のサマリー（参考）**

### 直近の状態サマリー（2026-05-22 時点、記録モード画面のモック2準拠 全面刷新 完了後）

- **作業ブランチ**: `claude/recording-mode-dark-ui-mkrJi`（push 済 / PR 未作成）
- **本ブランチで変更**:
  - `src/components/Tabs.jsx`:
    - `RotTab` の rot サブタブを全面再構成（判定カード → 3+4指標 → タイムライン → 判定の根拠 → 詳細データ折りたたみ → 下部CTA + FAB）
    - サブタブラベル: `sessionSubTabLabels` を `{ data: "詳細データ", rot: "記録", history: "大当たり履歴", settings: "機種設定" }` に更新
    - 新規 state: `showEventMenu` / `showDetailCollapse` / `inputHistory`
    - 新規モーダル: イベントメニュー（FABから開く6項目）+ テンキーモーダル刷新（上部チップ + 大型表示 + 入力履歴）
    - 旧UI撤去: 「入力/初当たり」2ボタン構成、現金/持ち玉 neon-card 2連、総回転/大当り/実質投資 stat バー、履歴アコーディオン、`showHistory` / `rotCol` / `rowBg` ヘルパー、`displayBorder` プロップ
    - `decide()` 内で `setInputHistory((h) => [thisRot, ...h].slice(0, 4))` を追加（テンキー入力履歴）
  - `src/components/decision/VerdictBadge.jsx`:
    - 心電図 SVG アイコン（`hold` 時）+ 円形信頼度ゲージ + データ精度（高い/やや低い/低い）+ 安定まであと（1500回転 - `netRot`）
    - `VERDICT_CONFIG.hold.color` を `C.yellow` → `C.blue` に変更（モック要件）
    - props に `netRot` を追加（安定まであと算出用）
  - `src/components/decision/KeyMetrics.jsx`:
    - 旧 3+3 → 新 3+4 レイアウト
    - 上段: 補正後EV/K（黄）/ 生EV/K（青）/ ボーダー差（緑/赤）+ 装飾スパークライン（LCGランダムウォーク）
    - 下段: 予測回転率 / 総投資 / 持ち玉 / 実質投資（スパークラインなし）
    - props に `currentBalls` / `ballsLabel` / `playMode` を追加
  - `src/components/decision/ReasonList.jsx`:
    - 2列グリッドの `✓`（緑）/ `⚠`（黄）カードに刷新
    - props に `onDetails` を追加（詳細データタブへ遷移）
  - `src/components/decision/RecentEventList.jsx`:
    - タイムライン形式に刷新（時刻 + 円形アイコン + ラベル/サブ + 右側チップ）
    - `isRotInputType` 関数で「1K決定」「持ち玉NN玉消費」等の回転入力イベントを除外
    - `props` に `onViewAll` を追加（大当たり履歴タブへ遷移）
  - `src/index.css`:
    - 新規 CSS: `.rec-verdict-card*` / `.metric-card-v2*` / `.timeline-*` / `.reasons-*` / `.collapse-card*` / `.record-cta-bar` / `.record-cta-input` / `.record-fab` / `.event-menu__*` / `.numpad-modal__*`
    - `.verdict-badge--hold` の色を黄→青/シアンに変更（`color-mix(in srgb, var(--blue) 36%, var(--surface))` ベース）
    - 全カード系クラスに `flex-shrink: 0` を付与（flex column 親で潰れる問題を回避）
- **lint / build**: いずれもエラー 0（既存警告 8 件のみ、本変更で増減なし）
- **保護関数テスト**: `node src/__tests__/protected-fns.mjs` 通過（`logic.js` 不変、`baseline.json` と完全一致）
- **evDecision テスト**: `node src/components/decision/__tests__/evDecision.test.mjs` 5/5 PASS
- **コミット**: `b7dd01e`
- **以下は前回時点のサマリー（参考）**

### 直近の状態サマリー（2026-05-22 時点、ダークテーマをピュアブラック高コントラストパレットへ刷新 完了後）

- **作業ブランチ**: `claude/session-XffIS`（push 済 / PR 未作成）
- **本ブランチで変更**:
  - `src/index.css`:
    - `[data-theme="dark"]` の CSS 変数群を中立ブラック寄りパレットに刷新（`--bg #0c1428 → #05070d`、`--surface #1a2238 → #0e1117`、`--surface-hi → #181d27`、`--border` を青味から中立白系へ、`--blue → #38bdf8`、`--green → #22c55e` ほか）
    - `.jp-proto-screen` / `.jp-proto-header` / `.jp-flow-status` / `.jp-flow-metric` / `.jp-value-card` / `.jp-choice-button` / `.jp-keypad` / `.jp-flow-orb` のハードコード slate-900/950 と `rgba(148, 163, 184, ...)` を `var(--surface)` / `var(--bg)` / `color-mix(...)` ベースに置換
  - `src/components/Tabs.jsx`:
    - チェーン履歴カード・アクティブチェーン下部 CTA バー・実測サマリー勾配・「入力を確定する」ボタンの勾配下端を `var(--surface)` / `var(--surface-alt)` / `var(--bg)` ベースに統一（旧 `rgba(15,23,42,...)`・`rgba(2,6,23,...)`・`#1a3a8e`・`#0f6e3a` を除去）
    - モーダル下部アクションバーの `rgba(20,20,25,1)` を `var(--bg)` に統一（3 箇所）
  - `src/components/select/SelectDashboard.jsx`:
    - ホール図面風マップの背景 `#071224` ほか青系ハードコード（`rgba(148,178,255,...)`・`rgba(15,23,42,...)`・`rgba(30,41,59,...)`）を `var(--surface-alt)` ＋ `color-mix(var(--blue) ...)` ベースに置換
  - `index.html`: `<meta name="theme-color">` を `#0c1428 → #05070d`
  - `vite.config.js`: PWA `theme_color` を `#0a0a12 → #05070d`
- **lint / build**: いずれもエラー 0（既存警告 8 件のみ、無関連）
- **保護関数テスト**: `node src/__tests__/protected-fns.mjs` 通過（`logic.js` 不変）
- **コミット**: `25e6f92`（CSS 変数刷新本体）+ `8722aca`（モーダル下部背景の `var(--bg)` 統一）
- **以下は前回時点のサマリー（参考）**

### 直近の状態サマリー（2026-05-22 時点、大当たりタブ ヒーロー3カードのモック2準拠 再調整 完了後）

- **作業ブランチ**: `claude/mockup-redesign-graphs-JsNqn`（push 済 / PR 未作成）
- **本ブランチで変更**:
  - `src/components/Tabs.jsx`（ヒーロー3カード部・行 2519〜2640 付近）:
    - `makeSpark`: `Math.sin` ベースの滑らかな波 → 線形合同法（LCG）による 32 点ランダムウォーク
    - `sparkPath`: 高さ 28 → 40、上下 1px の余白付き
    - `Spark` コンポーネント: ストローク 1.6 → 1.3、`marginTop: "auto"` でカード下端に固定、グラデーション fill のアルファを 0.35 → 0.30 に微調整
    - 3 カードに `minHeight: 158`、`padding` の下値を 8 → 6 に
    - 「現在評価」: 絵文字 22 → 26、ラベル 20 → 22、`+N玉` 12 → 13 / `lineHeight: 1` で詰め
    - 「現在持玉」: `+N玉` をピル → プレーンテキスト風（`background` 削除・font-size 10 → 12）
- **lint / build**: いずれもエラー 0（既存警告 8 件のみ）
- **保護関数テスト**: 未実行（UI 寸法のみの変更で `logic.js` / `baseline.json` 不変、影響なし）
- **コミット**: `27b4064`
- **以下は前回時点のサマリー（参考）**

### 直近の状態サマリー（2026-05-20 時点、画面 A モック準拠刷新 + テンキー条件表示 完了後）

- **作業ブランチ**: `claude/numeric-keypad-ui-yceuE`（push 済 / PR 未作成）
- **本ブランチで変更**:
  - `src/components/Tabs.jsx`:
    - `hitInputFocus` の初期値を `"rotCount"` → `""` に変更（テンキーを「タップ時のみ表示」へ）
    - 画面 A のヘッダーを「メニュー / RUSH中 N連（or 初当たり入力）/ 履歴」3 ボタン構成に変更
    - 上部ステータスを 2×2 グリッド → 横並び 5 カードに変更（現在持玉 / 期待差玉 / 電サポ効率 / RUSH継続期待度 / 1Rあたりの出球）
    - 「現在入力中: デフォルト」+「入力ガイド」のタイトル行を追加
    - 「初当たり / 連チャン追加」タブを追加（連チャン追加タブは `chainLen > 0` のときのみ画面 B に遷移）
    - 5 行 Row コンポーネントを円形アイコン付きにリデザイン（`RowIcon` 内部コンポーネントを追加）
    - 液晶出玉 / 実測出玉のプリセットを 3 → 4 段階に拡張
    - 「よく使う出玉プリセット」セクションを画面 A から削除
    - 下部固定エリアを「テンキー（条件表示）+ 入力まとめ + 入力確定ボタン」に再構成
    - `FIELD_ORDER` + `onEnterPress` を追加（入力確定ボタンで次のフィールドへフォーカス遷移）
    - 不要になった `netGain` / `headerBadge` / `lastHitSapoPerRot` を削除（lint error 解消）
- **lint / build**: いずれもエラー 0（警告は既存・無関連の 8 件）
- **保護関数テスト**: `node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と完全一致
- **以下は前回時点のサマリー（参考）**

### 直近の状態サマリー（2026-05-20 時点、大当たりタブ既定表示変更 + テンキー配置修正 完了後）

- **作業ブランチ**: `claude/align-ui-design-CmJ0b`（push 済）
- **本ブランチで変更**:
  - `src/components/Tabs.jsx`:
    - 大当たりタブ進入時の自動オープン用 `useEffect` を追加（`prevSubTabRef` で遷移検知）
    - 画面 A / 画面 B / 画面 C のテンキーレイアウトを 4 列 → 3 列の 4 行構造に統一
    - 「0クリア」ボタン削除、「消去」ボタンを 4 行目 1 列に固定、画面 C は「計算値に戻す」をテンキー上部に分離
- **lint / build**: いずれもエラー 0
- **以下は前回時点のサマリー（参考）**

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
