# HANDOVER.md — Pachi Tracker 引き継ぎドキュメント

最終更新: 2026-06-17（**島マップ管理画面を全面リニューアル（見た目優先プロトタイプ／島レイアウト管理画面へ再設計）**（ブランチ `claude/island-map-redesign-qn4h0o`）。設定→「島マップ管理」サブビュー（`Tabs.jsx` の `showHallMapView`）を、旧「島一覧」中心の編集UI（`HallMapEditor`）から、「この店舗の島構成を俯瞰する」**島レイアウト管理画面**へモックアップ準拠で再設計。戦略マップと同じ世界観（Bloomberg風・ネオンブルー・ダーク／固定パレット bg#050A14・card#0B1220・枠線rgba(255,255,255,.08)・角丸24）で自己完結。**構成**: ①ヘッダー（戻る／タイトル「島マップ管理」／右に「使い方」「新規作成」）②店舗サマリーカード（店舗画像プレースホルダー〔ネオン枠・実画像は将来連携予定〕・店舗名・住所・最終更新＋総島数/総台数/更新日時の3指標、複数店舗時のみ店舗切替ピッカー）③**ホール全体プレビュー（この画面の主役）**＝各島を横並び簡易表示（島名・台数・機種・判定色ドット・範囲、戦略マップと同一の緑/黄/赤/灰）で俯瞰確認④タブ3つ（**レイアウト図＝初期表示**／島一覧／変更履歴）⑤レイアウト図＝各島カード（島名・範囲・機種名・良台率・密度・台セルgrid〔台番号/推定回転率/確信度を色分け〕・強ゾーン・右上「編集」）⑥島一覧＝通常は島名/機種名/台数/範囲のみ、タップ展開で台セル＋編集⑦変更履歴＝セッション内の編集を更新日時/変更内容/変更者で記録（恒久保存は将来連携予定の空状態あり）⑧クイックアクション（レイアウト図／台番号一括編集／台数一括編集／データリセット〔赤〕）⑨説明文。**編集機能**: 既存 `hallMapSelectors`（add/remove/update/move）のみで不変更新し即保存（`onChangeIslands`→`pt_hallMaps`）。台番号追加/削除=終了番号±1、並び替え=↑↓、島名/機種名/開始終了の直接編集、新規作成/削除（確認付き）。**新規ファイル**: `src/components/select/IslandMapManager.jsx`（自己完結UI・戦略マップ準拠パレット）、`src/components/select/islandMapData.js`（**仮データ将来連携予定**の純関数＝実体の島範囲〔start/end〕から台番号のみ取り出し、推定回転率/確信度を台番号シードの決定論的擬似乱数で生成→良台率/密度/強ゾーン/判定区分を導出。戦略マップ `strategyMapData.js` と同一の classify ルール・配色。`src/logic.js` 非依存・表示専用）。**変更ファイル**: `src/components/Tabs.jsx`（`HallMapEditor` import を `IslandMapManager` import へ差し替え＋`showHallMapView` ブロックを新コンポーネント呼び出しへ置換。`normalizedStores`/`hallMapStore`/`hallMapIslands`/既存ハンドラをそのまま受け渡し）。**不変**: `src/logic.js`（baseline.json 完全一致を確認）・evDecision.js・計算式・保存データ構造（`pt_hallMaps` スキーマ不変）・戦略マップ画面（`strategy/` 配下）・**台選び画面の `HallMapEditor`**（`SelectDashboard` で従来どおり使用・無変更）・package.json。**操作ステップ**: 設定→「島マップ管理」で到達する導線は不変。画面内は俯瞰（プレビュー＋レイアウト図）を初期表示にし、編集は各島「編集」1タップで展開（旧UIの閲覧→編集トグルと同等のタップ数）。検証: lint 0エラー（既存 App.jsx:363 警告1件のみ・本変更外）/ build 成功 / protected-fns.mjs baseline 完全一致 / hallMapSelectors.test.mjs 11 passed・0 failed。**未対応**: 変更履歴の端末をまたぐ恒久保存・店舗画像の実データ・「戦略マップへ即反映」は `strategyMapData.js` が現状ハードコード仮データのため文言上の将来連携（pt_hallMaps を読む実データ化は別タスク）。スクリーンショットは当環境がネットワーク制限でChromium取得不可のため未取得〔playwrightは--no-saveで一時導入後にpackage.json/lockfile復元済み〕。）

最終更新: 2026-06-16（**戦略マップ画面を新規追加（見た目優先プロトタイプ）**（ブランチ `claude/strategy-map-screen-ce3d1q`）。ホールに入った瞬間に「どこへ向かうべきか」を5秒で判断する新画面 `戦略マップ` をモックアップ準拠で新規実装。**構成**: ①ヘッダー（戻る／タイトル／機種名・島全体42台／更新時刻・候補数）②タブ（全台／良台候補／実戦中のみ）③本日のTOP5（横スクロールカード：順位・台番号・推定回転率・期待値・確信度）④KPIサマリー（推定期待値／予測回転率／確信度／候補台数のBloomberg風4カード）⑤ホールマップ（1〜3島カード＋島評価グレード・良台率・期待値密度・強ゾーン、正方形台セルに台番号/推定回転率/確信度を色分け表示、★＝本命、ホール施設アイコンを左右レール配置）⑥選択台詳細（台タップで推奨判定・主要指標・島平均差・ボーダー・過去7日ミニ折れ線）⑦共通BottomNavigation。**新規ファイル**: `src/components/strategy/StrategyMapDashboard.jsx`（自己完結UI・既存UI/フォーム非流用・モック準拠の固定パレット bg#050A14/card#0B1220/枠線rgba(255,255,255,.08)/角丸24）、`src/components/strategy/strategyMapData.js`（**仮データ将来連携予定**の純関数。決定論的生成し画面内のヘッダー候補数・KPI・TOP5・島評価を同一台配列から導出して矛盾なし。将来 P-EVIDENCE / 差玉解析〔pt_deltaScans〕/ 島データ〔pt_hallMaps〕の実データへ差し替え予定）。**導線（配置方針）**: 台選びタブ＝「入力・準備」ハブとして維持し差玉解析・ホールマップ島編集・店舗選択は従来どおり台選びに残す。台選び最上部にCTA「戦略マップを開く」を1つ追加→`currentMode==="strategy"` を全画面表示、ヘッダー戻るで台選びへ。**変更ファイル**: `src/App.jsx`（import追加＋`strategy` モード分岐＋`onOpenStrategy` 受け渡しのみ）、`src/components/select/SelectDashboard.jsx`（`onOpenStrategy` prop＋導線カード追加のみ・既存表示は不削除）。**不変**: logic.js・evDecision.js・計算式・保存データ構造・既存値・package.json（screenshot用に一時導入したplaywrightは検証後にpackage.json/lockfileごと復元済み）。**操作ステップ**: 既存フローは不変（台選び→1タップで戦略マップを開く導線を新設）。検証: 新規ファイルlint 0エラー（既存の Tabs.jsx 既知エラー・App.jsx:361 既知警告のみ残存・いずれも本変更外）/ build成功 / iPhone幅393pxで実機相当スクショ確認済み。）

最終更新: 2026-06-14（**重要度S・未着手のSonnet推奨バグ2件を会社型役割分担フローで対応**（ブランチ `claude/priority-s-tasks-jjdgzn`。最高司令塔: Opus（Fable代行）／実装: Sonnetサブエージェント2体（うち1体はgit worktree隔離で並列実行）／検収・統合・記録: Opus）。**バグ1「実戦終了後に分析画面へ最新セッションが反映されない」**: `AnalysisDashboard.jsx` の表示対象月/年 `viewMonth`/`viewYear` が `useState(defaultMonth)` でマウント時に一度だけ最新月/年をコピーするだけで、新規アーカイブ追加で `defaultMonth`/`defaultYear` が変わっても追従しなかった（＝コンポーネントがマウントされたまま archives が変化する削除/編集/CSVインポート等のケースで、月別/年別タブの収支推移・日別詳細・サマリーが古い月/年のまま固定。再起動で新規マウントされ直ると正しく表示）。**修正**: render中のstate同期パターン（React公式の「前回値との比較によるstate同期」。`useRef` は当プロジェクトのlint `react-hooks/refs` でrender中アクセス禁止のため前回値も `useState` で保持）で、`defaultMonth`/`defaultYear` 変化時に「直前まで最新を表示していた場合のみ」最新へ追従（手動で過去へ移動済みなら追従せずユーザー操作を尊重）。`CalendarTab`（カレンダーサブタブ）の `archives→byDate→monthArchives→...` チェーンは元からリアクティブで正しく再計算されることを確認済み。対象: `src/components/analysis/AnalysisDashboard.jsx`（447行直後に21行追加・import不変）。**バグ2「大当たり登録フローで後戻りできない」**: 初当たりウィザード `hitWizard`・連チャン追加ウィザード `chainWizard`（ともに `Tabs.jsx` の `RotTab` 内・`ReactDOM.createPortal` のfixedオーバーレイ）で入力途中に前ステップへ戻れず誤入力を修正できなかった。**修正**: ヘッダー左上の「閉じる」ボタンを、先頭以外のステップでは「戻る」（`hitWizard`=`setFocus(STEPS[stepIdx-1].id)` / `chainWizard`=`setFocus(STEPS_B[stepIdx-1].id)`、画面C `chainWizardStep===8` からは画面B先頭へ。いずれも `hitWizardData`/`chainWizardData` を保持）、先頭ステップでは「キャンセル」（入力済み判定 `hasHitInput`/`hasChainInput` が真なら `window.confirm` 確認後に中断、未入力なら即閉じ）に分岐。両ボタン44x44px以上。スワイプバックはポータル＝ブラウザ履歴未使用のため該当なし。確定/結果選択（連チャン継続/単発終了/RUSH終了）の既存挙動・正常フローのタップ数は不変。対象: `src/components/Tabs.jsx`（RotTab内2箇所・+72/-18）。**不変**: logic.js・evDecision.js・baseline.json・P-EVIDENCEロジック・保存データ構造・計算式・package.json。検証: lint 0エラー（既存App.jsx:354警告1件のみ）/ build成功 / protected-fns.mjs は baseline.json と完全一致 / evDecision.test.mjs 5 passed・0 failed。）

最終更新: 2026-06-13（**差玉解析オーバーレイの下部CTA表示と店舗ピッカーの外側タップ閉じを修正**（ブランチ `claude/reel-format-overlap-fix-t4eiaq`。最高司令塔: Opus（Fable代行）／実装: Sonnetサブエージェント／検収・記録: Opus）。**バグ1**: 差玉解析の全画面オーバーレイ（`DeltaAnalyzer` / `DeltaMapView`）が `zIndex:60` で、グローバル下部ナビ `ModeTabBar`（`zIndex:100`）より低く、タブバーがオーバーレイ上に描画され下部固定CTA「解析する」が隠れて押せなかった。**修正**: 両オーバーレイのルート `zIndex` を `60→110` に引き上げ（タブバー100の上・App級モーダル200の下）。背景は不透明 `C.bg` で全画面を覆うためタブバーは完全に隠れCTAが押せる。内部トースト `zIndex:70` は据え置き（オーバーレイ内相対）。**バグ2**: `HallMapEditor` の `StorePicker` がボタン再タップでしか閉じず、外側タップで閉じなかった。**修正**: ルート `<div>` に `rootRef` を付与し、`open` 中だけ `document` の `pointerdown` を監視→ピッカー外タップで `setOpen(false)`（バックドロップ非採用・既存DOMを塞がない／クリーンアップ付き）。ボタンのトグル・項目選択時の `setOpen(false)` は維持。**不変**: logic.js・evDecision.js・P-EVIDENCEロジック・保存データ構造・計算式・package.json。操作タップ数の増加なし（既存操作の正常化のみ）。検証: lint 0エラー（既存App.jsx:354警告1件のみ）/ build成功。）

最終更新: 2026-06-13（**前段: ドロップダウンのカードクリップ重なり修正**（ブランチ `claude/reel-format-overlap-fix-t4eiaq`、PR #272 マージ済み）。共通 `Card`（Atoms.jsx）の `overflow:hidden` により内部の `position:absolute` ドロップダウンがカード境界でクリップされ下のカードと重なって見えた。台選びマップ編集ピッカー（`HallMapEditor`）と実践記録編集の店舗ドロップダウン（`Tabs.jsx`）の2箇所で該当 `Card` を `overflow:"visible"` にして解消。lint 0エラー/ build成功。）

最終更新: 2026-06-13（**マップ編集の対象店舗を切り替え可能に＋会社型役割分担スキルの追加**（ブランチ `claude/map-edit-store-change-zapodf`。最高司令塔: Fable／実装: Sonnetサブエージェント／検収・記録: Fable）。**バグ**: 台選び画面のマップ編集（`HallMapEditor`）は編集対象店舗 `activeStore` をグローバルな `selectedStoreId`（無ければ登録先頭店舗）から読み取り専用で導出するだけで、編集対象店舗を切り替えるUIが無く、複数店舗登録時に店舗を変更できなかった。**設計判断（司令塔）**: 新stateを追加せず、既存の単一真実源 `selectedStoreId` を再利用して切り替える（CLAUDE.md設計原則3準拠）。**実装**: `HallMapEditor.jsx` に `StorePicker`（登録店舗2件以上のときのみヘッダー右に表示・ドロップダウン・各店舗ボタン44px・選択中を青ハイライト・絶対配置で横スクロールなし・aria-label付与）を追加し、props `stores`・`onChangeStore` を拡張。`SelectDashboard.jsx` に `handleChangeStore`＝`S.setSelectedStoreId(nextStoreId)` を呼ぶだけのハンドラを追加し `HallMapEditor` へ渡す。店舗切替→`activeStore`再導出→`getStoreIslands(hallMaps,storeId)`で島が自動追従。0/1店舗時はUI追加なし・既存タップ数不変。複数店舗時は2タップで切替。**スキル追加**: `.claude/skills/team-roles/SKILL.md`＝「会社型役割分担フロー」（最高司令塔=原則Fable／Fable不可時はOpus代行が分析・モデル選定・委譲・検収・記録、実行担当=Sonnet/Opusサブエージェントが実装しlint/build/test通過後に差分を残して報告、コミット/pushは司令塔が検収後に実施）。Sonnet/Opusの選定基準表・進め方手順・報告テンプレートを記載。**不変**: logic.js・evDecision.js・P-EVIDENCEロジック・保存データ構造・計算式・package.json。検証: lint 0エラー（既存App.jsx:354警告1件のみ）/ build成功 / テスト全12ファイル228件pass・0fail。）

最終更新: 2026-06-13（**差玉解析の拡張2件＝台ごとの差玉推移＋AIワンタップ読み取り**（ブランチ `claude/notion-task-reassessment-toop6q`、コミット `55d884a`。実装: Opus（セッション上限で中断後、検収・最終修正: Fable））。**機能A・日またぎ差玉推移**: `deltaMapSelectors.js` に `buildNumTrend(scans, storeId, num)`（日付昇順・同一日付はcreatedAt新優先・rankは保存値→getRank導出フォールバック）。`DeltaMapView.jsx` の台詳細パネルに「推移」セクション（2日分以上で表示・直近最大7日・ミニバー＝プラス緑/マイナス赤/0は灰点・選択中日付を青枠強調・flexで横スクロールなし）。**機能B・AIワンタップ読み取り**: 新規 `aiReader.js`＝Anthropic Messages API をfetchで直接呼ぶ（モデル定数 `AI_MODEL="claude-opus-4-8"`・ヘッダー x-api-key / anthropic-version: 2023-06-01 / anthropic-dangerous-direct-browser-access: true・**temperature/top_p/top_k/thinking は送らない（4.8では400）**・max_tokens 8192・visionは base64 image＋textブロック・stop_reason"refusal"対応・HTTPエラーは日本語メッセージ化）。`prepareImageForAi` で長辺1568pxへCanvas縮小→JPEG0.85（トークン費用・5MB制限対策）。`DeltaAnalyzer.jsx` ImportStep に「AIでワンタップ読み取り」カード（48px）: 画像選択→API→返却TSVをステップ2のtextareaへセットし既存のparseプレビュー/統合フローを再利用。**APIキー未設定時は手動フロー（プロンプトコピー→貼り付け）が完全従来どおり**で、点線導線から設定フォーム展開。キーは `App.jsx` の `useLS("pt_aiApiKey","")`（新規キー・端末内のみ・password入力・マスク表示 先頭7文字＋••••・変更/削除44px）。「画像はAnthropic APIに送信されます（利用料金が発生）」の黄注意書きでグラフ解析の端末内完結と明確に区別。**Fableレビュー修正1件**: APIキー「削除」が確認なし即削除→window.confirm追加。**不変**: logic.js・evDecision.js・P-EVIDENCEロジック・既存保存構造（pt_aiApiKey追加のみ）・package.json（fetchのみ・新規ライブラリなし）。検証: lint 0エラー（既存警告1件のみ）/ build成功 / テスト55/55（既存36＋buildNumTrend6＋aiReader13相当の新規19）。**差玉解析はこれで提案した全機能（mock1〜5＋拡張2件）が実装完了**。）

最終更新: 2026-06-12（**差玉解析 Phase2＝保存スキャンのホールマップ重ね合わせ表示**（ブランチ `claude/notion-task-reassessment-toop6q`、コミット `3b2a3cf`。実装: Opus／検収・修正指示: Fable）。**新規**: `src/components/delta/deltaMapSelectors.js`（純粋関数: listScanDates=店舗別日付降順ユニーク（storeId厳密照合）、buildScanIndex=日付フィルタ＋同一台番号はcreatedAt新しい方優先のMap統合、buildIslandOverlay=島範囲走査でセル{num,short(下2桁),row|null}生成、coverageOf={hit,total}）、`DeltaMapView.jsx`（mock4準拠フルスクリーンUI: 日付切替チップ・島カード内に台マス目grid（minmax(44px,1fr)・横スクロールなし）・マスタップで詳細パネル（差玉/ランク/回転数/当り・閉じる44px）・getRankTone一致の7色凡例（S爆発〜F↓大負け）・「データあり hit/total台」カバレッジ・空状態2種の日本語案内）、`__tests__/deltaMapSelectors.test.mjs`（14ケース）。**変更**: `DeltaAnalyzer.jsx` は TopBar の export 化のみ、`SelectDashboard.jsx` の DeltaEntryCard に第2ボタン「保存した解析をマップで見る」（48px）＋showDeltaMap分岐。台選び→マップ表示は1タップ。**Fableレビュー修正1件**: coverageOf がUI未使用のデッドコードだったため説明文行の右端に「データあり N/M台」表示として組み込み。**不変**: logic.js・evDecision.js・既存P-EVIDENCEロジック・pt_deltaScans/pt_hallMaps（読み取りのみ）・package.json。検証: lint 0エラー（既存警告1件のみ）/ build成功 / テスト36/36（Phase1の22＋新規14）。差玉解析はこれで mock1〜5 の全画面が実装済み。残る拡張候補（未起票）: 日をまたいだ台ごとの差玉推移、APIキー設定者向けワンタップAI読み取り自動化。）

最終更新: 2026-06-12（**差玉解析（差玉ランクアナライザー）Phase1を台選びに統合**（ブランチ `claude/notion-task-reassessment-toop6q`、コミット `cff60a3`。実装: Opusサブエージェント／検収・修正指示: Fable）。**移植元**: github.com/komatsu-dev-jp/pachinko-rank-analyzer（出玉推移グラフのスクショをピクセル解析して差玉を読み取りS〜Gランク判定する単体アプリ）。**新規ファイル**: `src/components/delta/deltaEngine.js`（RANKS 21段階定義・getRank・runAnalysis を移植元から数式・閾値不変で移植。表示色のみアプリのCSS変数にマッピングする getRankTone を追加）、`deltaSelectors.js`（純粋関数: parseTaiDataText=AI文字起こしTSV7列パース（タブ優先・空白再試行・カンマ/全角数字許容・不正行はskipped理由付き）、buildOcrPrompt=読み取りプロンプト全文生成（日付・店舗名を自動埋め込み）、assignNumbers・mergeTaiData・islandToNumbers・buildSegmentsNumbers・makeScan）、`DeltaAnalyzer.jsx`（フルスクリーンUI: upload→numbers→results⇄import）、`__tests__/deltaSelectors.test.mjs`（22ケース）。**変更**: `App.jsx` に `useLS("pt_deltaScans", [])` 追加（Scan={id,storeId,storeName,date,machineName,rows[]}、rows[]={num,val,px,rank(ランク名文字列),island?,machineName?,normalSpins?,totalStarts?}。既存キー不変・rotRowsと無関係）、`SelectDashboard.jsx` に「差玉解析」エントリーカード（開く48px）と保存ハンドラ（同一id置換）。**機能**: ①画像アップロード（端末内解析・外部送信なし）②台番号割り当て＝ホールマップの島から選択（台数不一致時は少ない方に合わせる）or 手動区間（飛び番号対応）③ランク判定結果（平均差玉・勝敗・ランク分布バー＋チップ・差玉順/台番号順・保存）④台データ取り込み＝AI文字起こし連携（プロンプトコピー→外部ChatGPT/Claude→TSV貼り付け→認識プレビュー・スキップ警告→台番号キーで回転数/大当り回数を統合）。OCR/TextDetectorは movile Safari非対応のため移植せず（AI連携方式を採用）。**Fableレビュー修正5件**: rankをオブジェクト保存するとG級のmin:-InfinityがJSON化でnullになる劣化バグ→ランク名文字列で保存／島台数＜検出台数で確定CTAが無効のままの仕様矛盾→島選択時は台数許容し slots を切り詰め／解析0台時の無反応→赤系警告カード追加／結果リストのkey衝突→num+index化／「22段階」コメント→21段階に訂正。**不変**: logic.js・evDecision.js・既存P-EVIDENCEダミーマップ/判定ロジック・既存保存構造・package.json（新規ライブラリなし）。検証: lint 0エラー（既存警告1件のみ）/ build成功 / delta 22+既存テスト全パス。**Phase 2（未実装・保留）**: 保存スキャンのホールマップ重ね合わせ表示（モックmock4_map.png作成済み）。モックアップ5枚は /tmp/mockups/（セッション限り）。）

最終更新: 2026-06-12（**Notion未着手タスク4件を一括実装（ブランチ `claude/notion-task-reassessment-toop6q`）**。司令塔Fableが Notion「GTD_改善メモDB」の未着手6件を再評価し、実行可能な4件をサブエージェント（実装担当: Sonnet/Opus）＋Fable検収のフローで実装。**①機種検索・登録ページのカード形式刷新**（コミット `5362c0f`・Sonnet）: SettingsTab の機種検索ビューをカード化、「＋新規機種登録」ボタン（48px）新設、カスタム機種カードに編集/削除ボタン（44px・削除確認付き）常設。従来到達不能だった deleteMachine を一覧から利用可能化。編集は3タップ→1タップに短縮。Fable指摘: 削除確認の残留状態を詳細遷移時にリセット。**②ホーム画面タイトルロゴの起動演出**（`750e20c`・Sonnet）: CSSのみのフェードイン＋スケールアップ1.6秒、sessionStorage（pt_home_logo_intro_played）でセッション内1回のみ、prefers-reduced-motion対応、操作ブロックなし、localStorage構造不変。**③分析「分析+」タブ＝パチanalyzer**（`0dd8314`・Opus）: 新規 analyzerSelectors.js＋AnalyzerView.jsx＋テスト20ケース。機種別回転率/K推移（折れ線・stats.effectiveStart1K??start1KCorrected??start1Kの既存フォールバック準拠）、ボーダー差分布ヒストグラム（ビン幅1.0回/K・3件未満は「データ不足」）、店舗別/曜日別のEV・実収支集計（getEvAmount再利用）。AnalysisDashboardのPERIOD_TABSに「分析+」を追加（既存タブ不変）。Fable指摘: 切替タブ40px→44px。**④台選びホールマップ編集**（`6d2af8f`・Opus・Fable再評価で推奨モデルSonnet→Opusに変更）: 新規キー pt_hallMaps（{[storeId]: Island[]}、Island={id,name,start,end,machineName}）をApp.jsxのuseLSで一元管理。SelectDashboardに閲覧/編集モード切替のマップ編集セクションを追加（島の追加・削除確認付き・上下並替・範囲/機種名編集、全ボタン44px以上）。既存P-EVIDENCEダミーマップ・判定ロジック不変。Fable指摘: 範囲正規化後の非制御入力の表示ずれをkey付与で同期。**実行不可と判断した2件**: 他ユーザーランキング（バックエンド未決定・CLAUDE.mdの新規バックエンド禁止）、広告設定（Proプラン設計未完・新規SDK/アカウント必要）→ Notionに再評価コメントを記録し未着手のまま維持。全タスクで logic.js / evDecision.js / baseline.json / 既存保存構造は不変。検証: 各タスクで lint 0エラー（既存警告1件のみ）/ build成功 / 既存＋新規テスト全パス。Notion側は完了4件のステータス更新＋対応記録を追記済み。）

最終更新: 2026-06-11（**分析カレンダータブをTerminal/Bloomberg風（証券端末風）にUI刷新（表示・レイアウトのみ、ロジック不変）**（ブランチ `claude/analysis-ui-terminal-refresh-eiyhjm`、コミット fd950f0）。**変更ファイル**: `src/components/Tabs.jsx` のみ（213挿入/149削除）。`src/logic.js`・`evDecision.js`・`baseline.json`・`analysisSelectors.js`・集計useMemo（monthKpi/monthDays/trendPoints/machineWageRank/storeWageRank/dailyTotals）は**不変**。実装内容: ①デザイントークン `TW_VARS`（--bg-panel/--bg-panel2/--tw-border/--txt/--muted/--dim/--plus/--minus/--ev/--accent-amber）を CalendarTab カレンダービューのルートdivにCSSカスタムプロパティとして注入しスコープ限定（グローバルCSS不変。既存`--border`と衝突するため`--tw-border`に改名）。等幅フォント定数 `TMONO`、色分けヘルパー `twSc`、セクションラベル `SectionLabel`（アンバー左ボーダー+コードラベル PNL/CAL/TRD/RNK/LOG）を Tabs.jsx 冒頭に追加。②KPIカード: 1行6列→**2行×3列**。「稼働時間」枠を「差（収支−EV）」（描画時に `pl - ev` を算出、集計には未追加）に置換し、稼働時間はセクションラベル右端「{件数}件 / {時間}h」へ移動。EVは青固定、他はplus/minus色分け、値17px等幅。③ヒートマップ: 色を rgba(43,227,166,.35/.18)/#101722/rgba(255,94,102,.18/.35) に刷新（**閾値 `HEAT_BIG=20000` と判定分岐は不変**、±20,000以上は太字 `heatBold`）。今日=アンバー枠+アンバー文字、選択中=ev青枠、セルradius 4px。④選択日詳細パネル: 日付を「MM/DD (曜)」形式、左ボーダー2px ev、bg-panel2、行罫線1px dashed #161e2b。**投資/回収・稼働時間/時給は削除せず「投資 / 回収」「稼働 / 時給」の統合行で保持**。「詳細を見る →」→「セッション詳細 →」（ヘッダー右に移動、44px）。⑤MultiLineChart改修: 実収支#2BE3A6/EV#4DA3FF（1.5px実線）/差#566073（1px破線3 3）、全折れ点にr=2.5マーカー、Y軸左マージン56→34px、目盛り#141b27。recharts未追加・package.json不変。⑥WageRankCard: 順位アンバー等幅、時給twSc色分け、機種名に`/1\/\d/`（スペック値混入）検出時に列末尾へアンバー警告バー表示。⑦日別履歴: 等幅・色分け・行罫線#131a26・ヘッダーletterSpacing .08em。**レビュー時修正1件**: 履歴行で`border:"none"`が`borderBottom`の後に指定され行罫線が消える既存バグを指定順入替で修正。月ナビ・各トグルのタップ領域36/40px→44px拡大。タップ数増減なし、横スクロールなし、ラベル日本語のみ。検証: protected-fns.mjs baseline完全一致 / lint 0 errors（警告1件はApp.jsx既存のexhaustive-deps）/ build成功。実装はOpusエージェント、レビュー・修正・コミットはFableが担当。）

最終更新: 2026-06-10（**UX・設計レビュー実施（コード変更なし、調査・報告のみ）**（ブランチ `claude/pachi-tracker-ux-review-j3cg78`）。①整合性チェック ②実践中UI動線チェック ③未実装・TODO検出 ④実装プラン提案 の4観点で全コンポーネントをレビュー。**最重要発見: `Tabs.jsx` の 3 箇所（2880・4808・5635 行）が `ev.netGain` を参照しているが、`calcPreciseEV` の戻り値に `netGain` プロパティは存在しない（正しくは `totalNetGain`）→ ヒーローカードの評価ラベルが常に「互角」、HUD の期待差玉が常に 0 になる表示バグ**。その他: 「信頼度／試行充足率／データ精度」の用語混在（同一の confidence 値を指す）、データ精度の言語化閾値が VerdictBadge.jsx:74（70/40%）と Tabs.jsx:3461（60/30%）で不一致、`hold`（様子見）のヒント文言が continue と同一の「このまま打ち続けてOK」（VerdictBadge.jsx:25）、App.jsx VERDICT_LABELS で continue_strong / continue が共に「続行」のため判定変化通知が「続行→続行」になり得る、分析集計 `getEvAmount` が生の `stats.workAmount` を使い実戦中表示（effectiveWorkAmount＝補正後）と不一致、未完了チェーン（completed:false）残存のまま実戦終了・台移動が可能でそのチェーンの出玉が統計から漏れる、台選び `onStart` が実戦中でも machineNum/machineName を無条件上書き、ModeTabBar に実戦中のタブ離脱ガードなし（ウィザード入力途中状態が消える）。詳細は「6. 現在の未解決バグ・保留タスク ＞ 保留タスク5」参照。`src/logic.js` は不変。）

最終更新: 2026-06-08（**①台移動の収支按分（コストベース）②アーカイブカードから貯玉残高を編集＋店舗残高に同期**（ブランチ `claude/ehime-pachinko-shops-niiob`）。ユーザー要望「台移動アーカイブの収支按分」「貯玉残高もアーカイブカードから編集」を AskUserQuestion で各推奨案（①引き継ぎ玉を計上／②店舗残高にも同期）に確定し実装。**変更ファイル**: `src/App.jsx` / `src/components/Tabs.jsx`（`src/logic.js`・`analysisSelectors.js` 不変）。**【Task1: 台移動の収支按分】** 従来 `handleMoveTable` は settlement 無しでアーカイブ＝台移動台の収支が常に0、収支が最終台に寄っていた。コストベース按分を導入：**新state `carriedInYen`（useLS `pt_carriedInYen`, 0）= 現在の台へ持ち込んだ持ち玉の円換算（投資の内数）**。(a) `handleMoveTable`：玉単価 `ballYen=ballVal>0?ballVal:1000/exRate`、`carriedOutYen=round(currentMochiBalls×ballYen)`（この台の回収＝持ち出し玉価値）、`machineInvest=round(carriedInYen)+round(ev.rawInvest)`（持ち込みコスト＋この台の現金投資）で `archiveCurrentSession(true,{investYen:machineInvest,recoveryYen:carriedOutYen,carriedInYen})`。移動後 `setCarriedInYen(carriedOutYen)` で次台へコスト引き継ぎ。(b) `openEndSession`：精算シートの投資額初期値に `+round(carriedInYen)` を加算（最終台の収支が正しく出る）。(c) `confirmEndSession`：`archiveCurrentSession(false,{...,carriedInYen})`。(d) `archiveCurrentSession(isMove,settlement)`：archive に `carriedInYen`（settlement時のみ）と `storeId`（=selectedStoreId）を保存。(e) `resetAll`：`setCarriedInYen(0)`。(f) アーカイブ編集の投資額自動初期値（Tabs）：`round(stats.rawInvest)+round(carriedInYen)` に変更し引き継ぎ玉コストを内包（非移動アーカイブは carriedInYen=0で従来同値）。投資額欄の注記を「引き継ぎ玉 ¥X を含む」（carriedInYen>0時）／従来「実践記録から自動反映」に分岐表示。**按分の数学的根拠**：各台の収支＝(持ち出し価値+現金回収)−(持ち込み価値+現金投資)で自己完結。台iの持ち出し=台i+1の持ち込みなので合計では中間の引き継ぎ価値が相殺し、`Σ(回収−投資)=最終現金化−総現金投資`＝真の収支に一致。**検証コード実行で確認済み**（2台チェーン: 台A +10,000 / 台B +7,000 / 合計17,000 = 最終3.2万−総投資1.5万）。`analysisSelectors` の集計式（getActualPL=recoveryYen−investYen, summarize）は不変＝per-archiveの投資/回収値を入れるだけ。**day-carry-over（CarryOverSheet「持ち玉のまま続ける」）は carriedInYen を触らない＝従来挙動維持**（持越し持ち玉は引き続き資産扱い）。**【Task2: 貯玉残高のカード編集＋店舗同期】** アーカイブ詳細編集（DataTab）に **新state `editChodama`** と入力欄「貯玉残高（玉）」を追加。初期値＝そのアーカイブの店舗（`storeId` 一致 or `storeName` 一致で特定）の**現在の `store.chodama`**。`updateArchive` 保存時、入力値が現残高と異なれば `S.setStores` で店舗の `chodama` を更新し、`S.setChodamaLog` に `type:"adjust"` の調整履歴（balanceBefore/After・`memo:"アーカイブから残高調整"`）を追記。店舗が特定できる場合のみ欄を表示（注記「『店名』の現在残高に同期されます」）。＝**精算直後の数え違いをアーカイブカードから訂正でき、店舗残高・貯玉履歴に反映**。**保護**: `src/logic.js`/`calcPreciseEV`/`deriveFromRows`/`calcCash`/`calcMochi`/`useLS`/`evDecision.js`/`baseline.json`/`analysisSelectors.js`[不変]/`rotRows`/`jpLog`/`sesLog` すべて不変。**新規LSキー `pt_carriedInYen` のみ**（残高・履歴は既存 `pt_stores`/`pt_chodamaLog` 流用、archive に `carriedInYen`/`storeId` フィールド追加＝後方互換：旧archiveは未定義→0/名前一致で処理）。`package.json` 変更なし。**検証**: `npm run lint` errors=0（既存warning 8件のみ）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` baseline完全一致、`git diff --quiet src/logic.js`/`analysisSelectors.js` 非変更、analysisSelectorsテスト56パス、按分合計の数値検証パス。**操作ステップ**: 台移動・実戦終了のタップ数は不変（収支按分は内部自動）。貯玉残高編集はアーカイブ編集カード内の1欄追加（任意入力）。**未対応・要確認**: (1) 店舗特定は storeId 優先・無ければ storeName 一致のため、**同名店舗が複数あると誤同期の可能性**（稀）。(2) 貯玉残高編集は「店舗の現在残高」を直接書き換える方式＝過去アーカイブから編集しても反映先は最新残高（履歴的スナップショットではない）。(3) iPhone実機での一連フロー（台移動チェーン→終了→カード編集→店舗残高同期）は静的検証＋数値検証のみで実機未確認につき推奨。 — 同日の実戦終了精算シートは以下に続く）<br>最終更新: 2026-06-07（**実戦終了に「精算シート」を新設：投資額・回収額を自動算出して収支を記録**（ブランチ `claude/ehime-pachinko-shops-niiob`）。**背景**: 調査で `analysisSelectors.getActualPL = recoveryYen − investYen` だが、`investYen`/`recoveryYen` はライブ稼働で一度も正値が入らず（`setInvestYen`/`setRecoveryYen` は0/復元のみ）、アーカイブの収支は手動編集（アーカイブ編集の投資/回収欄＝`editInvest`/`editRecovery`）でしか記録されない＝**通常終了では収支が常に未記録**だと判明。ユーザー要望「実戦終了時に精算情報を自動入力できるように（実戦中に精算はほぼ無い）」を受け、終了時に収支を自動算出・確定する精算シートを実装。**変更ファイル**: `src/App.jsx` / `src/components/Tabs.jsx`（`src/logic.js` 不変）。**(a) 精算シート（新規 `EndSessionSheet`／App.jsx）**: 実戦終了ボタン押下で `S.handleEndSession()`(=`openEndSession`) がシートを開く（旧 `window.confirm` は廃止＝シート自体が確認）。自動初期値: **投資額=`Math.round(ev.rawInvest)`**（実践記録の現金投資累計＝アーカイブ編集の自動初期値と同源）、**回収額=`残り持ち玉(currentMochiBalls) × 玉単価`**（玉単価=`ballVal>0?ballVal:1000/exRate`）。UI: 精算方法トグル[現金で精算/貯玉として保存（店舗選択時のみ）]、投資額・回収額の編集入力（数字のみ）、収支プレビュー（回収−投資・色分け）、[実戦終了して保存]/[キャンセル]。RecoverySheet/CarryOverSheet と同型のボトムシート。**(b) 確定処理 `confirmEndSession({method,invest,recovery})`**: method="cash"→`recoveryYen=入力した回収額`; method="chodama"→`recoveryYen=持ち玉の現金換算額(cashYen=持ち玉×玉単価)` ＋ 持ち玉を `logMochiToChodama()`＋`resetAll(持ち玉)` で店舗の貯玉残高へ加算。**※貯玉化でも回収額を計上する点が要点**（後述の会計判断）。いずれも `archiveCurrentSession(false, {investYen,recoveryYen})` で**収支付きアーカイブ**を保存後 `resetAll()`。**(c) `archiveCurrentSession(isMove, settlement=null)` を拡張**: settlement 指定時のみ investYen/recoveryYen を上書き（未指定時は従来どおり state 値＝0）。台移動 `handleMoveTable` は settlement 無し＝従来挙動を維持（台移動アーカイブの収支は0のまま・per-machine収支按分は今後の課題）。**【会計判断：貯玉化の収支計上】ユーザー確認(AskUserQuestion)で「貯玉価値も収支に＋計上」を選択**。背景: 既存の `analysisSelectors` は現金主義で `getActualPL=recoveryYen−investYen`、`getChodamaPL=−chodamaYen`（貯玉**消費**はコスト）、`totalRealPL=現金収支+貯玉消費コスト`。貯玉化で recoveryYen=0 にすると「その日が−投資のマイナス表示」になり、貯玉として得た価値が収支に出ない。そこで貯玉化時も `recoveryYen=持ち玉×玉単価` を計上＝その日の収支は現金精算と同じ＋になる。**二重計上にならないことを検証済み**: 貯玉化(+価値計上)した玉を後日 play で消費すると `chodamaYen>0→getChodamaPL=−価値` で相殺され、生涯収支は現金主義と一致（例: 投資1.2万→貯玉化(+9,120)→翌日その貯玉で消費(−2.1万)＋現金回収3万=+8,880、計+1.8万＝実際の現金収支と一致）。貯玉を店頭で現金化する経路はログのwithdrawであり収支式に入らないため、こちらも+価値計上のままで整合。**意味づけ**: `recoveryYen` の意味を「現金回収額」から「回収相当額（現金 or 貯玉価値）」へ拡張した（`analysisSelectors.js`/`logic.js` は不変＝集計式は触らず、入力値の意味のみ拡張）。既存のアーカイブ編集（editInvest/editRecovery→investYen/recoveryYen）と同じフィールドなので終了後も再修正可能（後戻りの安全網）。ライブ収支表示(=持ち玉×玉単価−投資)は別レイヤで `recoveryYen` を使わないため二重計上なし。**※貯玉残高そのものの編集はアーカイブカードからは不可＝店舗詳細「残高を更新」/貯玉データ画面で管理（既存）。****保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `analysisSelectors.js`[不変] / `rotRows` / `jpLog` / `sesLog` すべて不変。新規LSキーなし（`endSheet` はメモリ state）。`package.json` 変更なし。**検証**: `npm run lint` errors=0（既存 warning 8 件のみ）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` が baseline と**完全一致**、`git diff --quiet -- src/logic.js` 非変更、関連テスト全パス（analysisSelectors 56 / badges 20）。**操作ステップ**: 実戦終了→精算シート（自動入力済み）→保存 の最短2タップ。シートにキャンセルあり＝誤タップで即終了しない安全設計。**未対応**: (1) 台移動時の per-machine 収支按分は未対応（ユーザー指示により台移動の取消含め後日）。(2) iPhone実機での精算シート操作は静的検証＋HTMLプレビューのみで実機未確認につき推奨。 — 同日の持ち玉↔貯玉連携強化は以下に続く）<br>最終更新: 2026-06-07（**持ち玉↔貯玉の連携を強化：①実戦終了時に持ち玉を貯玉化 ②台移動で持ち玉を引き継ぎ ③起動時に日付跨ぎ持ち玉を検知**（ブランチ `claude/ehime-pachinko-shops-niiob`）。**背景**: ユーザー質問「当日中の出玉は持ち玉、日付を跨いだら貯玉にできるか？台移動で持ち玉から使えるか？」を調査した結果、(A) 台移動 `handleMoveTable` が `resetAll()` で持ち玉も0にリセットしており新台へ引き継げない、(B) 実戦終了時に残った持ち玉が貯玉化されず0クリアされる、(C) 日付跨ぎ検知が無い、と判明。AskUserQuestionで3件すべて実装する方針を確認。**変更ファイル**: `src/App.jsx` / `src/components/Tabs.jsx`（`src/logic.js` は不変）。**玉モデルの前提（調査結果）**: 3モード `cash/mochi/chodama` を分離管理。大当たり出玉は `currentMochiBalls`（持ち玉）へ入り `playMode="mochi"` に切替（Tabs各所）。貯玉 `currentChodama` は稼働開始時に店舗(`store.chodama`)から読込み、回転で減るのみ（出玉は貯玉に戻らない＝当日分は持ち玉、はユーザー認識どおり）。残高の真実源は `store.chodama`。`recoveryYen`(live)は常に0の遺産フィールドで持ち玉を含まない＝貯玉化で二重計上は起きない。**(a) 共通化**: 旧 `handleMoveTable` 内のアーカイブ生成を `archiveCurrentSession(isMove)` に抽出（記録が空なら保存しない・`isMoveArchive` を引数化・既存フィールド構造は不変）。`isMoveArchive` は表示ラベル(Tabs:8050)とバッジ集計(badges.js・全件カウント)のみで集計式に非影響を確認済み。**(b) 台移動で持ち玉引き継ぎ**: `handleMoveTable` を再実装し、アーカイブ保存後に `currentMochiBalls`/`currentChodama`/`playMode`/店舗/レートを保持したまま記録だけクリア（jpLog/sesLog/startRot/investYen/recoveryYen/totalTrayBalls/machineNum/machineName をリセット）。引き継ぎ玉数を `initialMochiBalls`/`initialChodama` に設定し、新台のスタート行を `{type:"start", mode:carriedMode, mochiBalls:carriedMochi, chodamaBalls:carriedChodama}` で再シード、`sessionStarted=true` のまま新台へ。＝玉箱を持って移動する実機挙動を再現。`takeSnapshotImmediate("table:move")` も取得。**(c) 実戦終了で貯玉化**: 新ハンドラ `handleEndSession()` を追加（`archiveCurrentSession(false)` で通常終了アーカイブ＝従来は handleMoveTable 流用で isMoveArchive:true だったのを false に正常化）。選択店舗があり持ち玉が残っていれば `window.confirm` で「持ち玉N玉を『店名』の貯玉として保存しますか？（しなければ現金精算扱い）」を確認。Yesなら `logMochiToChodama()` で `pt_chodamaLog` に deposit 履歴を追記し、`resetAll(extraChodama)` に持ち玉数を渡す。**`resetAll(extraChodamaToStore=0)` を改修**：店舗書き戻しを `store.chodama = currentChodama + extraChodamaToStore` とし、`sessionStartDate` も "" にクリア。既存の `resetAll()` 無引数呼び出し（RecoverySheet破棄/AnalysisDashboard/SettingsTab/CalendarTab）は既定0で従来同等。Tabs のイベントメニュー「実戦終了」を `S.handleMoveTable()`→`S.handleEndSession()` に変更（「台移動」ボタンは `handleMoveTable` のまま＝役割を分離）。**(d) 起動時の持越し検知**: 新LSキー `pt_sessionStartDate`（稼働開始日。`handleStartSession`(Tabs) と SelectDashboard onStart(App) の2箇所で今日の日付をセット、`resetAll` でクリア）。マウント時 useEffect で `currentMochiBalls>0 && sessionStartDate && sessionStartDate!==today` なら `carryOverPrompt` をセットし、新規ボトムシート `CarryOverSheet`（RecoverySheet と同型）を表示。3択：①貯玉として保存する（`logMochiToChodama`＋`resetAll(balls)`／店舗あり時のみ）②持ち玉のまま続ける（`sessionStartDate` を今日に更新し再表示抑止）③精算済み＝持ち玉を消す（`resetAll()`）。**S 追加**: `handleEndSession` / `sessionStartDate,setSessionStartDate`。**新規LSキー**: `pt_sessionStartDate` のみ（残高や履歴は既存 `pt_stores`/`pt_chodamaLog` を流用）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造すべて不変。Firebase等の追加なし。`package.json` 変更なし。**検証**: `npm run lint` errors=0（既存 warning 8 件のみ・増減なし）、`npm run build` 成功（PWA precache 11 entries / 1125.02 KiB）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と**完全一致**、`git diff --quiet -- src/logic.js` で非変更確認、関連テスト全パス（badges 20 / hunterRank 33 / analysisSelectors 56）。**操作ステップへの影響**: 台移動は従来どおり1タップ（玉再入力が不要になりむしろ減）。実戦終了は終了確認の後、持ち玉が残る場合のみ貯玉化確認が1回追加。起動時プロンプトは該当時のみ。主要タップ領域44px以上、UIラベル日本語のみ。**未対応・要確認**: (1) 日付跨ぎ判定は「稼働開始日」基準のため、深夜0時を跨いで連続稼働する稀ケースでは翌開店時に持越し扱いになりうる（実務上ほぼ無し）。(2) 台移動で引き継いだ持ち玉のセッション間P/L按分は既存の会計モデル（recoveryYen=0・chodama別レイヤ）に従い未変更。(3) iPhone実機での一連フロー（台移動連続・終了時貯玉化・翌日起動プロンプト）は静的検証のみで実機未確認につき推奨。 — 同日の店舗管理Bloomberg再設計は以下に続く）<br>最終更新: 2026-06-07（**店舗管理画面をBloomberg風ダッシュボードへ再設計＋会員カードの「残高プリペイド」廃止**（ブランチ `claude/ehime-pachinko-shops-niiob`）。**目的**: (1) ユーザー指摘「プリペ残高は1日で消えるので必ず現金化する＝不要」を受け、会員カードの `prepaid`（残高プリペイド）を表示・入力・保存からすべて削除（AskUserQuestionで「削除のまま」を確認済み）。(2) 前回実装の店舗詳細が縦長フォームの羅列で高級感が無かったため、添付モックアップに沿ってカード型・KPI主体・余白広めの店舗詳細ダッシュボードへ全面再スタイル。**変更ファイル**: `src/components/Tabs.jsx` のみ（`src/logic.js` は不変・`src/data/ehimeStores.js` も不変）。**(a) プリペ廃止**: `emptyMemberCard` を `{created,number,deposit}` の3キーへ（`prepaid` 削除）。会員カード表示タイルを3列（貯玉残高/残高プリペ/入金残高）→2列（貯玉残高/入金残高）に、残高更新フォームの入力欄も3→2列に縮約。`cardEditPrepaid` state と `setCardEditPrepaid` 呼び出しを全削除、保存patchから `prepaid` を除去。未作成案内文・登録画面注記からも「プリペ残高」表記を削除。**既存データに `prepaid` が残っていても `normalizeMemberCard` のスプレッドで無害に保持されるだけで表示されない**（後方互換）。**(b) 店舗詳細 再設計（`if (selectedStore)` ブロック）**: Bloomberg風スタイル定数（`tile`=bg+border角丸12/`infoBox`/`cardSt`=border角丸18・padding18/`secTitle`=小型大文字ラベル）を導入し、`rgba(0,0,0,*)` のベタ背景をテーマ変数（`C.bg`/`C.border`/`C.surface`）の枠付きカードへ統一。構成: ①店舗サマリーカード（44pxアイコン/店名18px/住所/編集、KPI3列=**交換率(円)/貸玉/換金レート(◯玉=100円)**、貯玉上限プログレスバー、最終来店/メモの2列infoBox）②会員カード情報（作成済み●バッジ/カード番号/貯玉残高・入金残高2タイル/残高を更新・履歴を見る・カード削除）③貯玉・精算管理（KPI3列=**店内貯玉(円換算付)/店内再プレイ/本日精算予定**、貯玉に入れる/貯玉から使う、押下時のみカード内に玉数＋メモの入力フォームを展開）④交換率・貸玉情報（貸玉単価/交換率/玉単価の3KPI＋設定を反映/編集）⑤店舗削除（赤枠の独立「危険な操作」カードに分離、通常操作と混在させない）。ヘッダーは `← 一覧に戻る`（左）＋ `＋ 店舗を登録`（右・青・shadow）。**(c) 新規店舗フィールド（モックアップ再現用・いずれも任意/既定0・空）**: `lastVisit`(最終来店・表示用テキスト) / `replayBalls`(店内再プレイ玉数) / `todaySettle`(本日精算予定玉数) を `emptyStore`・`normalizedStores` 正規化・`saveStore` 保存・店舗フォーム入力欄に**追加のみ**で実装（旧形式store/既存storeは既定値で補完され破綻しない）。**換金レートは exRate から導出**（新フィールドではない）。**重要な整合性メモ**: 会員カードの「貯玉残高」と精算管理の「店内貯玉」は**いずれも単一の真実源 `store.chodama`** を表示するため常に同値（モックアップ文中の "店内貯玉12,500" と "貯玉残高5,280" の食い違いは採用せず、画像どおり同値の5,280で確認）。貯玉入出金は既存 `adjustStoreChodama`→`pt_chodamaLog` 追記の経路をそのまま使用（新フォームにメモ入力 `chodamaMoveMemo` state を追加）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキーなし（店舗フィールドは既存 `pt_stores` 内に追加）。Firebase等の外部サービス追加なし。`package.json` 変更なし。**検証**: `npm run lint` errors=0（既存 warning 8 件のみ・本変更で増減なし）、`npm run build` 成功（PWA precache 11 entries / 1121.89 KiB）、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と**完全一致**（`diff` 差分なし＝logic.js非変更の確証）、`git diff --quiet -- src/logic.js` で非変更確認。**操作ステップへの影響**: 入出金フォームは常時表示せず「貯玉に入れる/使う」押下時のみ展開（タップ数は従来同等）。主要タップ領域44px以上、横スクロールなし、UIラベル日本語のみ。**スクリーンショット差分（モックアップとの残差）**: (1) ヘッダー左ボタンは正しいナビゲーションのため `← 一覧に戻る`（モック表記の「設定に戻る」は一覧画面側に既存）、(2) モックの三点メニュー「⋯」は機能重複・死にUI回避のため未実装、(3) 店内再プレイ/本日精算予定/最終来店は現状フォーム手入力（自動連携は未実装＝将来の稼働ログ連携余地あり）、(4) 検索ボックスは単一店舗詳細では不要なため一覧画面側に保持。**未対応・要確認**: iPhone実機での表示確認はlint/build/baselineの静的検証＋HTMLプレビュー画像のみで実機未確認につき推奨。 — 2026-06-05 の旧記述は以下に続く）<br>最終更新: 2026-06-05（**①アーカイブ編集の投資額を実践記録（回転数データ）から初期表示 ②貯玉データ管理画面＋入出金履歴を新設**（ブランチ `claude/investment-ball-storage-data-mmzR1`）。**目的**: (1) アーカイブ詳細・編集画面（`Tabs.jsx` の「データ編集」カード）の投資額が、下に並ぶ「回転数データ」＝実践記録（rotRows）と連動せず手動値のみ表示していたのを、開いた時に実践記録から算出した投資額で初期表示するようにした。(2) 貯玉残高が店舗オブジェクトの `chodama` フィールドに埋もれ専用導線が無かったため、店舗別残高の一覧・編集と入出金履歴の記録ができる「貯玉データ」画面を設定内に新設。**変更ファイル**: `src/App.jsx` / `src/components/Tabs.jsx`（`src/logic.js` は不変）。**(a) タスク1（投資額の自動反映）**: アーカイブ編集フォーム初期化 useEffect（`Tabs.jsx` 8033行付近）で `setEditInvest` を変更。`makeArchive()` が保存する `stats.rawInvest`（= `deriveFromRows` の現金投資累計、DataTabの「総投資額」と同値、数値なので safeStats フィルタを通過し保存済み）を四捨五入して初期値に採用。算出値が無い古いアーカイブは従来の保存値 `investYen` をフォールバック。投資額入力欄の下に「実践記録から自動反映」の注記を算出値採用時のみ表示。保存処理 `updateArchive()` は不変＝手動編集での上書きは従来通り可能。**rawInvest を読むだけでロジック・データ構造は不変**。**(b) タスク2（貯玉データ画面）**: 新規LSキー `pt_chodamaLog`（App.jsx 191行付近に追加、S オブジェクトに `chodamaLog/setChodamaLog` を載せる）。ログ1件の構造 `{ id, date, storeId, storeName, type:"deposit"|"withdraw"|"adjust", balls, balanceBefore, balanceAfter, memo }`。**残高の真実源は既存 `stores[].chodama`**（稼働開始セットアップが読む既存フィールド）で、ログは手動入出金の append-only ジャーナル＝**稼働中の消費フロー（rotRows/currentChodama）とは独立**。SettingsTab に `showChodamaDataView` state（既存 `showChodamaView` の隣）と、遊技設定メニューに「貯玉データ」項目（IconDiamond/teal、既存「貯玉設定」とは別物として並置）を追加。新サブビューは既存 `showChodamaView` ブロック直後に新設し、構成は ①店舗別 貯玉残高（`s.stores` を Row 表示・タップでフォーム店舗選択・残高玉数を右寄せ）②入出金を記録（店舗 select／種別セグメント[預入(+)/引出(−)/調整(=)]／玉数 NI／日付 input[type=date]／メモ／「記録する」Btn）③入出金履歴（新しい順・種別バッジ・±玉数・記録後残高・メモ・✕削除）。記録時に `s.setStores(prev=>prev.map(...))` で該当店舗の chodama を更新（預入=加算/引出=max(0,減算)/調整=絶対値セット）し `s.setChodamaLog(prev=>[entry,...prev])` で追記。**履歴削除は履歴行のみ削除し残高は変えない**（残高は stores[].chodama が真実源・画面に注記）。再利用部品: `SubHeader`/`SectionLabel`/`Section`/`Row`/`NI`/`Btn`/`IconDiamond`/`showToast`/`ToastPortal`、既存 `setStores(prev=>…)` パターン。バックアップ対象キー配列（`Tabs.jsx` 9497行付近）に `"pt_chodamaLog"` を追加（`pt_stores` は残高を含むため既に対象）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。既存値・初期値・マスタデータの変更なし。新規LSキーは `pt_chodamaLog` のみ。**検証**: `npm run lint` errors=0（warning 8 件＝変更前と同数・本変更で増減なし）、`npm run build` 成功（`built in 2.20s`、JS 804.37 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と**完全一致**（`diff` 差分なし＝logic.js非変更の確証）。**操作ステップへの影響**: 投資額は閲覧時に自動初期表示されるためタップ数は増えない（手動上書きも従来同様）。貯玉データ画面は設定からの新規閲覧導線（1タップで遷移）で既存フローは不変。主要タップ領域は44px以上（種別ボタン/各入力/Btn）。UIラベルは日本語のみ。横スクロールUIなし。`package.json` 変更なし。不要な `console.log` / デバッグコードなし。**未対応・要確認**: (1) 投資額初期表示は古いアーカイブ（rawInvest未保存）では従来の保存値を表示。(2) 貯玉残高の円換算は本画面では玉数主体表示（円換算は分析画面の既存 RealBalanceCard 等で確認）。(3) iPhone実機での表示確認は静的検証のみで未実施につき実機確認を推奨。 — 2026-06-02 のライトテーマ対応は以下に続く）<br>最終更新: 2026-06-02（**ライトテーマ（白背景）対応バグ修正：全画面でハードコード色をテーマ変数へ連動**（ブランチ `claude/light-theme-colors-qh9D4`）。**バグ内容**: 設定でテーマカラーを白（ライト）に変更すると、一部画面で背景・文字・アイコン・ボーダー色が切り替わらず、白背景に白文字／黒背景に黒文字が重なって読めない状態になっていた。**原因**: アプリのテーマ機構自体は健全（`src/index.css` が `:root`/`[data-theme="light"]` と `[data-theme="dark"]` の CSS カスタムプロパティを定義、`App.jsx` の `useEffect([theme])` が `document.documentElement` に `data-theme` を設定、`src/constants.js` の `C` は全て `var(--xxx)` 参照）だが、**個別コンポーネントにダーク前提のハードコード色が散在**していたため、それらがテーマ切替に追随しなかった。**変更ファイル（UIのみ・4ファイル）**: `src/components/home/HomeDashboard.jsx` / `src/components/Tabs.jsx` / `src/components/analysis/AnalysisDashboard.jsx` / `src/components/select/SelectDashboard.jsx`。**(a) HomeDashboard.jsx**: ファイル先頭の固定パレット `P`（`card:"#0F1A2B"` 等のダーク前提16色）を全て CSS 変数参照へ書き換え（`card:"var(--surface)"` / `text:"var(--text)"` / `sub:"var(--sub-hi)"` / `blue:"var(--blue)"` 等）。加えてインラインのダークリテラル（`#0F1A2B`/`#0A1320`/`#0B1424`/`#10243A`/`#16243A`=サーフェス系→`var(--surface)`/`var(--surface-hi)`/`var(--surface-alt)`、`#00A6FF`→`var(--blue)`、ゴールド `#FBBF24`/`#F59E0B`→`var(--yellow)`/`var(--orange)`、保存ボタン文字 `#03101F`→`#fff`）を一括置換。これによりホームの全8セクション（ヘッダー/サマリー/アクション/進捗/おすすめ/ランク/バッジ/直近記録）がライト/ダーク両対応。機種アイコンのグラデ（`THUMB_COLORS`）とロゴチップ（青グラデ+白P）は意図的な装飾色のため不変。**(b) Tabs.jsx（記録・分析・設定の本体）**: ① DATA タブのガラスモーフィズム風カード（`dataCardStyle`/`subCardStyle` 等の `rgba(11,22,40,0.85)`/`rgba(7,17,31,*)` ダーク背景、`rgba(26,77,117,*)`/`rgba(18,58,90,*)` ネイビー枠）→ `var(--surface)`/`var(--surface-hi)`/`var(--border)`。② DATA タブ全体背景 `#050B18`→`var(--bg)`。③ 大当たり入力ウィザード等の全画面モーダル `background:"#000"`（9箇所）→`var(--bg)`（中の文字は `C.text` 等のテーマ変数のため、ライトで黒背景＋黒文字の不可読を解消）。④ 各種 SVG チャート（記録/分析内の `LineChart`/`MultiLineChart`/ゲージ）のグリッド線・軸テキスト・凡例が `rgba(255,255,255,0.0X)` の白系でライトでは消失していた→ グリッド線は `var(--border)`/`var(--border-hi)`、軸テキストは `var(--sub)`/`var(--sub-hi)` に。行区切り・縦罫線・空ゲージトラックの白半透明も同様にテーマ枠色へ。⑤ アクセント文字／アイコン色のハードコード hex（`#21D99B`→`var(--green)`、`#0A84FF`/`#38bdf8`→`var(--blue)`、`#C084FC`→`var(--purple)`、`#FFB020`→`var(--yellow)`、`#FF5A5F`→`var(--red)`、設定画面のグレー `#6f8aae`/`#7da4cf`/`#5e7ba0`/`#9CA3AF`→`var(--sub)`/`var(--sub-hi)`、設定メニュー行アイコン `#ef476f`/`#ff5f8a`/`#22d3ee`/`#ff9f43`→`var(--red)`/`var(--purple)`/`var(--teal)`/`var(--orange)`）を一括でテーマ変数化。**手法上の要点**: 置換先を CSS 変数の**文字列形** `"var(--xxx)"` に統一したため、JS スタイル値（`color: "var(--green)"`）でも JSX 属性（`stroke="var(--green)"` / `fill=` / `stopColor=` / アイコンの `color=` prop）でもそのまま有効（`C.green` 定数だと JSX 属性で `={}` が必要になり破綻するため）。色付きボタン背景の `#16a34a`/`#2f6fed`/`#ea580c`/`#4f46e5` ＋白文字、`#fff` 文字（全35箇所が色付きボタン/バッジ上で可読と確認済み）、トグルの白ノブ、機種アイコングラデ等は両テーマで可読なため不変（ダークテーマの見た目を不要に変えない方針）。**(c) AnalysisDashboard.jsx**: `TrendChart` のグリッド線・軸テキストの白半透明→`var(--border)`/`var(--border-hi)`/`var(--sub)`。機種ランキングのメダル色 `["#fbbf24","#cbd5e1","#d97706"]`（金/銀/銅）はライトで銀 `#cbd5e1` が不可読だったため、両テーマで読める中間トーン `["#ca8a04","#94a3b8","#b45309"]` に調整。**(d) SelectDashboard.jsx**: 台選びヒーローは既に `var(--surface-alt)`＋`color-mix(var(--blue))` でテーマ対応済み。狙い台★の `#fcd34d`→`var(--yellow)` のみ調整。**(e) カレンダーのヒートマップ（Tabs `CalendarTab`）は意図的に固定ヒートパレット**（濃緑/薄緑/グレー/薄赤/濃赤＋それに対比する固定文字色）で、セル背景と文字色が**セット**で設計されておりライト/ダーク双方で可読なため不変（「ついで改修禁止」遵守）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / 期待値・収支計算ロジック / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変（**変更は色値のスタイル置換のみ**、ロジック・データフロー・state は一切触れていない）。新規LSキー・新規 state なし。`package.json` 変更なし。`App.jsx`/`constants.js`/`index.css` も不変（既存テーマ機構をそのまま活用）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 2.33s`、JS 761.94 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と**完全一致**（`diff` 差分なし）。**操作ステップへの影響**: なし（色のみの変更でレイアウト・タップ数・入力フローは不変）。UIラベルは日本語のみ。**未対応・要確認事項**: (1) ライト/ダーク切替の最終的な見た目確認は lint/build/baseline の静的検証のみで、**iPhone 実機（iPhone 16 Pro 相当幅）でのライト/ダーク全画面表示確認は未実施**につき実機確認を推奨。(2) ヒートマップの固定パレットは仕様として不変としたが、ライトの淡色ページ上では濃色セルがやや浮くため、将来テーマ連動が望ましければ別途提案可能。(3) ダークテーマでは一部アクセント色が従来のブランド色（例: ミント `#21D99B`）から標準セマンティック色（`var(--green)`=`#22c55e`）へ微妙に変化するが、テーマ一貫性のための意図的変更。 — 2026-06-02 のホーム画面刷新は以下に続く）<br>最終更新: 2026-06-02（**ホーム画面を添付モックアップに基づき全面刷新（8セクション構成）**（ブランチ `claude/home-screen-redesign-NwF5u`）。**目的**: 添付モックアップ画像に基づきホーム画面を全面刷新。**変更ファイル**: `src/components/home/HomeDashboard.jsx` のみ（1ファイル全面書き換え）。**従来との差**: 旧 HomeDashboard は「EV運用OS風」レイアウト（目標2枚カード＋月間EV推移チャート＋最近の分析カード等）で、かつ `本日のサマリー`(8420/-12500/18.4) と `ハンターランク`(streak||7 / sessions||48 / 総収支||52300) に**ハードコードのダミー値**が残っていた（CLAUDE.md「ダミーデータを本番画面に残さない」違反）。今回モックアップの8セクション構成へ刷新し、全数値を実 state 由来へ置換。**新レイアウト（縦スクロール・上から順）**: ① ヘッダー（P-Trackerロゴ＋通知ベル[未読ドットは `S.notificationLog` の `read` 判定]＋時間帯あいさつ[`new Date().getHours()` で5区分]）、② 本日のサマリーカード（本日の期待値[今日 archives の `getEvAmount` 合計＋稼働中なら `S.ev.workAmount` を加味]・実収支[今日 archives の `getActualPL` 合計＋稼働中なら `recoveryYen-investYen`]・前日比[今日EV−昨日EV]・本日の信頼度バー[稼働中セッションのみ `evDecision(S.ev).confidence`×100、非稼働時は「—」＋注記]・スパークライン[当月日別累積EVの小型SVG]・「詳細を見る」→分析）、③ 次のアクション（記録開始→`setTab("rot")` / 台選び→`setTab("select")` / 分析を見る→`setTab("calendar")` の3ボタン、各 minHeight88px）、④ 今月の進捗カード（当月累積EV・目標額[`S.monthlyEvTarget`]・達成率%・あと◯◯円・進捗バー・鉛筆ボタンで `MonthlyTargetEditor` ボトムシート起動[既存 `pt_monthlyEvTarget` を更新]）、⑤ 今日のおすすめカード（`machineRanking(archives,{limit:1})` の実績上位機種＝機種名・期待値累計・実績回数・「台選びへ」。記録ゼロ時は空状態。**P-EVIDENCE島データは現状ホーム未連携**のため当面はユーザー実績ベース。連携時はこのカードのデータソース差し替えで対応）、⑥ ハンターランクカード（`S.hunterRank` の level/currentXp/nextRequired/totalXp、EXPバー、連続日数[`S.hunterCounters.streakDays`]・総セッション数[`archives.length`]の2 stats。モックに合わせ旧3カラム目の「総収支」は除外）、⑦ 実績・バッジ（モックの5枚＝`first_jp`/`streak_7`/`lv25`/`rot_10k`/`sessions_10` を `S.hunterRank.unlockedBadges` の実解放状態でグレーアウト表示、`repeat(5,1fr)`グリッド、「すべて見る」）、⑧ 直近の記録（最新 archive 3件＝機種アイコン[機種名ハッシュで色決定]・機種名・時刻[今日=時刻/昨日=「前日」/以前=M/D]・稼働時間[`stats.netRot`/`settings.rotPerHour`]・G数[`stats.netRot`]・金額[実収支があれば収支、なければ期待値]・「すべて見る」）。**データソースはすべて既存 selector / state を流用**（`aggregateByDay` / `getEvAmount` / `getActualPL` / `machineRanking` / `evDecision` を import、新規計算式・新規ロジックなし）。**削除/変更した旧UI（報告事項）**: モックアップに無い旧要素を撤去＝(a) 目標2枚カード（`GoalAndMonthlyCard`／本日の稼働目標＋今月の期待値目標）→ ④の単一進捗カードへ統合、(b) 月間EV推移フルチャート（`MonthlyEvChart`＋タブ3種）→ ②内の小型スパークラインへ縮約、(c)「最近の分析」カード行（`AnalysisCardsRow`、従来から空配列で非表示）を削除。これらが必要なら復活提案可能。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js`[読み取りのみ] / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / `analysisSelectors.js`[読み取りのみ] / 既存保存データ構造・既存LSキーすべて完全不変。**新規LSキー・新規 state 永続化なし**（コンポーネント内 state は `targetEditorOpen` のみ／目標保存は既存 `S.setMonthlyEvTarget`=`pt_monthlyEvTarget` を使用）。**App.jsx は不変**（S オブジェクトに既にある値だけ参照）。**lint対応**: React Compiler の `preserve-manual-memoization` エラー回避のため、`S.xxx` を useMemo 内で直接参照せず `archivesRaw`/`sessionStarted`/`liveEv`/`investYen`/`recoveryYen` のローカルへ展開してから依存配列に指定。未使用になった `labelStyle` を削除。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 2.06s`、PWA precache 11 entries / 1067.32 KiB）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と**完全一致**（`diff` 差分なし）、関連テスト全パス（hunterRank 33 / badges 20 / analysisSelectors 56 / selectSelectors 6 / evDecision 5）。**操作ステップへの影響**: ホームは閲覧専用＋ナビ起点で従来同様タップ数増なし。各アクションは1タップで該当モードへ遷移。主要タップ領域は44px以上（アクションボタン88px・台選びボタン44px・編集ボタン32px）。UIラベルは日本語のみ。横スクロールUIなし（全グリッド/縦積み）。`package.json` 変更なし。不要な `console.log`/デバッグコードなし。**未対応・要確認**: (1) ②の信頼度は「稼働中セッションの判定信頼度」を表示する仕様（複数セッション横断の本日平均ではない／非稼働時は「—」）。(2) ⑤おすすめは実績ベース（P-EVIDENCE連携は未実装）。(3) iPhone実機での全セクション表示確認はlint/build/テストの静的検証のみで未実施につき実機確認推奨。 — 2026-06-02 の分析画面カレンダー刷新は以下に続く）<br>最終更新: 2026-06-02（**分析画面カレンダータブをブルームバーグ風・高密度ダッシュボードへ全面刷新**（ブランチ `claude/analytics-calendar-redesign-UVNIL`）。**目的**: 添付の「iPhone操作設計書」に基づき、従来のミニマルなカレンダー（月計＋日別収支セル＋月間収支カード）を、数値優先・高密度な6要素構成へ刷新。**対象**: `src/components/Tabs.jsx` の `CalendarTab`（分析画面 `AnalysisDashboard` の「カレンダー」タブに埋め込み表示されるコンポーネント）。**変更ファイル**: `src/components/Tabs.jsx` のみ（**1ファイル**、+396 / -134 行）。**新レイアウト（縦スクロール・上から順）**: (0) 月ナビゲーター（‹ YYYY年M月 ›、既存 prevMonth/nextMonth 流用）、(1) **KPIストリップ**＝月間収支 / EV / ROI / 稼働時間 / 時給 / 勝率 を `repeat(6,1fr)` グリッドで1行高密度表示（横スクロールなし。大きな桁は `compactYen` で「+4.8万 / +2.1k」等に圧縮、ラベル9px・数値15px太字 tabular-nums）、(2) **日別ヒートマップ**＝GitHub形式 `repeat(7,1fr)` グリッド、5色分け（大きくプラス＝濃緑/プラス＝緑42%/±0＝グレー28%/マイナス＝赤42%/大きくマイナス＝濃赤、閾値 `HEAT_BIG=20000`円）、当日は青2px枠・選択日は subHi 2px枠、セルは `aspectRatio:1/1` minHeight40px でタップ領域確保、凡例5色を併記、(3) **選択日詳細パネル**＝選択日がある時のみ表示、収支（大）/ EV（期待値）/ 差（収支-EV）/ 投資 / 回収 / 稼働時間 / 時給 を行リスト表示、「詳細を見る ›」でその日の先頭 archive 詳細（既存 `setSelectedArchiveId`）へ遷移、(4) **収支推移チャート**＝新規 `MultiLineChart`（モジュールレベル関数）で実収支（緑実線）/ EV（青実線）/ 差（グレー破線）の3系列を**月内累計**で描画、Y軸ラベル・ゼロ線・凡例付き（2日分以上で描画、未満はプレースホルダ）、(5) **時給ランキング**＝新規 `WageRankCard`（モジュールレベル）で機種別・店舗別を2カラム並列表示、各月内集計の時給降順 TOP5、6件以上で「すべて見る ›」展開、(6) **日別履歴テーブル**＝日付 / 収支 / EV / 差 の4カラム、新しい日付順 TOP4、行タップで選択日切替、5件以上で「すべて見る ›」展開。さらに最下部に既存の「この日のセッション」一覧（現在セッション保存ボタン＋スワイプ削除＋ `SummaryCard` 編集導線）を温存（ヘッダーのみ「この日のセッション」へ改称）。**データ取得は既存実装を流用しロジック非変更**: KPI・日別集計・チャート・ランキングはすべて presentation layer の `useMemo`（`monthArchives` を既存メモ化済み `byDate` から導出 → `monthKpi` / `monthDays` / `trendPoints` / `machineWageRank` / `storeWageRank` を派生）で計算。参照する archive フィールドは既存の `investYen` / `recoveryYen` / `stats.workAmount` / `stats.netRot` / `settings.rotPerHour` / `machineName` / `settings.synthDenom` / `storeName` のみ。時給＝収支÷（netRot/rotPerHour 時間）、ROI＝回収÷投資、EV＝workAmount 合計、いずれも `analysisSelectors.summarize` と同一の集計規則に準拠（新規計算式・新規ロジックは一切追加せず）。**削除した既存UI（報告事項）**: (a) 旧「収支 / 月別」タイトル行（機能を持たない死んだ segmented control。実際のタブ切替は親 `DashboardHeader` が担うため重複削除）、(b) 旧カレンダーセル内の日別収支テキスト＋ドット表示（ヒートマップの色分けへ置換）、(c) 旧「月間収支カード＋投資/回収2カラム」（KPIストリップへ統合。月間 投資/回収 の単独表示は KPI の ROI と詳細指標で代替。完全な投資/回収合計は分析画面の月別/通算タブの『詳細指標』で従来通り確認可能）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / `analysisSelectors.js` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキー・新規 state 永続化なし（追加 state は `showAllMachines` / `showAllStores` / `showAllHistory` の表示トグルのみ）。**lint対応**: 不要になった `monthTotal` useMemo を削除（未使用エラー回避）、`trendPoints` の累計を `map` 内変数再代入から `for...of` ループへ変更（React Compiler `react-hooks/immutability` エラー回避）、`monthArchives` を `archives` 直接参照ではなく `byDate` 由来に変更（warning 件数を増やさないため）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 2.02s`、JS 781.37 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と**完全一致**（`diff` 差分なし）。**操作ステップへの影響**: 閲覧フローは縦スクロールのみで増加なし。日付選択（ヒートマップ／履歴行タップ）→ 選択日詳細表示 は1タップ、その日の編集は「詳細を見る ›」1タップで従来の詳細ビューへ（従来と同等）。主要タップ領域はヒートマップ40px・各ボタン36〜44pxを確保。UIラベルは日本語のみ。`package.json` 変更なし。不要な `console.log` / デバッグコードなし。 — 2026-06-01 の旧記述は以下に続く）<br>2026-06-01（**機種スペック設定ページの数値入力でテンキーが消えるバグを修正**（ブランチ `claude/device-spec-input-focus-fnEax`）。**バグ内容**: 機種スペック設定ページ（および貯玉設定・基本設定など）の数値入力欄 `NI` コンポーネントで、テンキーから数字を一文字入力すると次の文字が入力できなくなる（テンキーが閉じる）問題。**原因**: `NI` が `type="number"` の controlled input（`value={v}`）として実装されており、`onChange` のたびに `set(Number(value))` → 親の `useLS` state 更新 → App.jsx 再レンダリング → React が input の `value` 属性を再書き込み という流れが発生。iOS Safari は `type="number"` input の value が（focused 中でも）プログラム的に変化したと検知してキーボードを閉じる。この問題は `specSapo` のような負数・小数を入力する欄でも "3." → `Number("3.")` = 3 と正規化されて小数点が消えるという追加の不具合も引き起こしていた。**修正（`src/components/Atoms.jsx` の `NI` コンポーネントのみ・設計変更）**: (1) `type="number"` → `type="text"` + `inputMode="decimal"` に変更（モバイルで数字キーボードを維持しつつ iOS のキーボード消失バグを回避）。(2) controlled input（`value={v}` + `onChange` で親 state 更新）→ **アンコントロールド input**（`defaultValue` + `ref`）に切り替え。ユーザーが入力中は親 state を更新せず、`blur` または `Enter` 押下時のみ `commit()` して親の `set` を呼ぶ。これにより入力中の再レンダリングが発生せずキーボードが維持される。(3) 外部値変更（機種プリセット適用など）は `useEffect([v])` 内で `inputRef.current.value = String(v)` と DOM を直接更新することで同期（`setState` を useEffect 内で呼ばないため lint rule `react-hooks/set-state-in-effect` に抵触しない）。(4) `commit()` 内で `isNaN(n) ? "" : n` チェックを追加し、不正文字列（ペーストなど）に対して空値 fallback を設定。**動作変化**: 変更前は1文字ごとに親 state が更新されてボーダー（自動計算）がリアルタイム更新されていたが、変更後はフォーカスを外したタイミングで更新される。店内操作性（3桁以上の連続入力・バックスペース・小数点入力）は大幅改善。**全 NI 使用箇所に一括適用**: 機種スペック設定（spec1R / specAvgRounds / specSapo / synthDenom / rotPerHour / border）・遊タイム分析（ceilingRot / yutimePayout）・基本設定（rentBalls / exRate）・貯玉設定（chodamaReplayLimit）・アーカイブ編集（editInvest / editRecovery）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキーなし。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 1.78s`、JS 771.83 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。**操作ステップへの影響**: タップ数不変。3桁以上の連続入力・バックスペース・小数点入力が可能になった。`package.json` 変更なし。不要な `console.log` / デバッグコードなし。 — 同日の machineDB specSapo 補正は以下に続く）
最終更新: 2026-06-01（**machineDB全機種のspecSapoを公式ボーダーから逆算して補正**（ブランチ `claude/ev-calculation-discrepancy-k36rP`）。**背景**: P tools vs パチトラッカーのEVズレ調査により、machineDB の `specSapo: 0` が電サポ中の球増減を考慮していないことが判明。公式ボーダーから逆算する式（`specSapo = synthProb×250/border["4.00"] - spec1R×specAvgTotalRounds`）を用いてborder値があり計算ズレが50玉以上の機種を一括補正。**更新5件**: e新世紀エヴァンゲリオン～はじまりの記憶～ (0→-800、電サポ中削り)・海物語IN沖縄5甘デジ (0→+280、時短中玉増)・大海物語5甘デジ (0→+225、時短中玉増)・PAフィーバーからくりサーカス2YF (0→+497、時短中玉増)・P大海物語5スペシャル (0→+62、電サポ微増)。**効果**: 全機種の計算ボーダーが公式値と完全一致。**変更ファイル**: `src/machineDB.js` のみ（specSapoフィールド値変更のみ・構造変更なし）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ）、`npm run build` 成功（built in 2.01s）。 — 同日の期待値ズレ調査は以下に続く）
最終更新: 2026-06-01（**期待値ズレ原因調査：P tools vs パチトラッカーの計算差分を特定**（ブランチ `claude/ev-calculation-discrepancy-k36rP`）。**調査対象**: e新世紀エヴァンゲリオン～はじまりの記憶～での比較（1Kスタート 69.0回/K共通）にて、P tools 期待値+48円（通常回転138回分）vsパチトラッカー 期待値/K +182円 のズレ。**調査結果**: ズレは3つの要因の複合。(1) **表示単位の相違**: P tools「138回転=2K分の総期待値 +48円」vsパチトラッカー「1Kあたりの期待値 +182円/K」。単位が異なり直接比較不可。P tools換算では +24円/K。(2) **synthDenom（合成確率分母）の相違**: P tools ≈319.6（通常確率ベースまたは別バリアント） vs パチトラッカー 349.9（machineDB公式スペック `synthProb`）。(3) **avgNetGain（平均純増出玉）の相違**: P tools ≈4744玉（独自DB） vs パチトラッカー 5992玉（spec1R=140 × specAvgRounds=42.8）。machineDB の `avgPayoutPerHit: 5987` とほぼ一致し、パチトラッカー側が公式スペックに準拠。**計算結果比較**: 両ツールとも1円設定（exRate=1000, exchP=1）での計算。P tools 粗利/K = (69/319.6)×4744×1 = 1024円 → 純EV = 1024−1000 = **+24円/K**。パチトラッカー 粗利/K = (69/349.9)×5992×1 = 1182円 → 純EV = 1182−1000 = **+182円/K**。スクリーンショットの仕事量363円・時給658円（rotPerHour=250）も全て一致を確認済み。**ブレークイーブン近傍での非線形増幅**: 粗利差は15.4%（1024 vs 1182円/K）だが、コスト1000円を引いた後の純EVでは7.5倍の差になる。この現象はEV近傍の計算特性であり、入力パラメータの僅かな差が純EVに非線形に増幅される。**修正の必要性**: なし。 の計算式は正しく（変更禁止規定を遵守）、パチトラッカーはmachineDB公式スペックに基づき論理的に一貫している。ズレの本質は「どちらかが間違い」ではなく「前提とする機種スペック値（synthDenom・avgNetGain）が異なること」に起因する。P toolsがLT（ラッキートリガー）機能考慮モデルや1円スペック固有の出玉計算を採用している可能性も排除できない。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。ファイル変更なし（調査のみ）。 — 2026-06-01 の機種別ハマり回転数分析カード追加は以下に続く）
最終更新: 2026-06-01（**機種別ハマり回転数分析カードを分析画面に追加**（ブランチ `claude/machine-dry-spins-display-gAtGv`）。**背景・目的**: 機種ごとの「大当たりなしの状態で回した回転数（ハマり回転数）」の累計を分析画面で確認できるようにし、リセット判断・台選びの材料として活用できるようにした。**変更ファイル**: `src/components/analysis/analysisSelectors.js` / `src/components/analysis/AnalysisDashboard.jsx` / `src/components/analysis/__tests__/analysisSelectors.test.mjs`。**(a) analysisSelectors.js（追加のみ）**: 新規純粋関数 `getMachineHamariList(archives, opts)` を追加。内部ヘルパーとして `_getPostLastJPRot(archive)`（rotRows の start/data パターンから最後の大当たり終了後の回転数を算出、currentHamari と同一式）・`_computeSinceLastJP(sortedArchives)`（セッション横断で最後の大当たりからの通算ハマりを算出）を定義。`getMachineHamariList` は `filterArchives` と同じ絞り込みオプションを受け取り、機種ごとに `{ key, machineName, sessions, recentCount, totalHamariRot, recentHamariRot, sinceLastJPRot, totalJPCount, hasData }` を返す（sinceLastJPRot 降順ソート）。`totalHamariRot` = 全セッションの `chain.hitThisRot` 合算、`recentHamariRot` = 直近5セッション限定、`sinceLastJPRot` = 最後に大当たりが記録されたセッションのジャックポット後回転数＋その後のセッション全回転数の累計。大当たり未記録の機種は `hasData=false`。**(b) AnalysisDashboard.jsx**: `getMachineHamariList` を import 追加。`machineHamariData` useMemo を追加（extraFilters 依存、上位5機種をスライス）。新規 `MachineHamariCard` コンポーネントを追加: 機種別 TOP5 カード直下に表示、4列グリッド（機種名・通算・直近5回・現在継続）、`sinceLastJPRot` が 500 超で赤・200 超でオレンジ色表示でハマりの深刻度を視覚化、`hasData=false` の機種は「データ不足」と表示、フッターに集計ロジックの注釈を表示。**(c) テスト**: `analysisSelectors.test.mjs` に7件追加（48→56件）: 空配列・大当たりなし（hasData=false）・hitThisRot 合算・複数セッション合算・直近5回スライス・sinceLastJP クロスセッション・大当たり一度もなし・複数機種ソート順をカバー。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキーなし。**検証**: `node src/components/analysis/__tests__/analysisSelectors.test.mjs` 56/56 パス、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）、`npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 2.04s`、JS 771.53 kB、PWA precache 11 entries）。**操作ステップへの影響**: なし（分析画面の閲覧フローは不変、機種別 TOP5 下にハマり分析カードが追加されるのみ）。`package.json` 変更なし。不要な `console.log` / デバッグコードなし。 — 同日の機種スペック・回転補正統合は以下に続く）
最終更新: 2026-06-01（**機種スペック設定ページに回転・補正ページを統合し重複を排除**（ブランチ `claude/device-spec-rotation-merge-6UV4n`）。**背景・目的**: 設定画面の「遊技設定」セクションに「機種スペック」と「回転・補正」の 2 ページが存在し、データ管理の「機種検索・登録」で機種を選択して `applyMachine()` を実行すると `synthDenom`（合成確率分母）が「回転・補正」ページに、`spec1R / specAvgRounds / specSapo` が「機種スペック設定」ページに分散して反映されるという問題があった。また「ボーダー（自動計算）」表示が両ページに重複して存在し、`synthDenom` / `rotPerHour` は「基本設定」ページのその他セクションにも存在する三重重複だった。**採用した統合方針（方针A）**: 「機種スペック設定」に「回転・補正」の全項目を吸収し、「回転・補正」ページを廃止。`synthDenom` は機種 DB から `applyMachine()` で設定される機種パラメータであり、`spec1R / specAvgRounds / specSapo` と同じページで確認・調整できる方が自然。**変更内容（`src/components/Tabs.jsx` のみ）**: (1) `showMachineSpecView` サブビューに「合成確率・回転」セクション（合成確率分母 / 1h消化回転数 / ボーダー手動値）と「ボーダー（自動計算）」セクションを追加。旧「遊タイム狙い目分析」セクション内に埋め込まれていた border 表示は独立セクションに移動し重複を解消。(2) `showRotationView` サブビューブロックを完全削除。(3) 設定メインの「回転・補正」メニュー項目を削除（遊技設定が 5 項目→4 項目に）。(4) `showGameSettingsView`（基本設定）の「その他」セクション（合成確率分母・1h消化回転数）を削除（機種スペック設定に一本化）。(5) `showRotationView` state 宣言を削除（未使用となるため）。**統合後の「機種スペック設定」ページ構成**: 「期待値算出用スペック」（spec1R / specAvgRounds / specSapo）→「合成確率・回転」（synthDenom / rotPerHour / border 手動値）→「ボーダー（自動計算）」（読み取り専用表示）→「遊タイム狙い目分析（任意）」（ceilingRot / yutimePayout）の 4 セクション。**データ安全性**: `applyMachine()` が設定する全フィールド（`synthDenom` / `spec1R` / `specAvgRounds` / `specSapo` / `machineName`）は 1 ページで確認・調整できるようになった。既存データ構造・LS キー・state 構造はすべて不変（UI の表示先を整理しただけで、書き込み先の state は同一）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキーなし。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 3.15s`、JS 767.44 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。**操作ステップへの影響**: 機種検索で機種選択後に「機種スペック設定」1 ページだけ確認すれば全設定が揃うようになった（従来は「機種スペック」と「回転・補正」の 2 ページを確認する必要があった）。タップ数: 機種スペック設定への遷移は 1 タップで同じ。`package.json` 変更なし。不要な `console.log` / デバッグコードなし。 — 2026-05-31 の旧記述は以下に続く）<br>2026-05-31（**履歴削除（直前の回転記録削除）で消費した貯玉が残高に戻らないバグを修正**（ブランチ `claude/stored-ball-history-delete-bug-y7TRg`）。**背景・症状**: 貯玉（`pt_currentChodama`）でプレイ中に回転数を誤入力し、「直前の記録を削除」ボタン（`RotTab` 内 `handleDeleteLastData`、`src/components/Tabs.jsx`）で直近の `data` 行を取り消すと、行は消えるが消費済みの貯玉が残高に戻らなかった。**原因**: 回転決定時（`decide`、Tabs.jsx 1323-1327）は貯玉モードで `S.setCurrentChodama((prev) => Math.max(0, prev - ballsConsumed))` と**減算**し、消費量を当該 `data` 行に `ballsConsumed`（数値）+ `mode:"chodama"` として保存しているのに、削除側 `handleDeleteLastData` は `setRows` で行を消すだけで**対になる加算（差し戻し）が無かった**。持ち玉/上皿は jpLog チェーン削除側（`handleDeleteConfirm` 等）で戻していたが、回転 `data` 行の貯玉消費を戻す経路だけが欠落していた。**修正（Tabs.jsx `handleDeleteLastData` のみ・追加のみ）**: 削除対象行を `const target = rows[lastDataIdx]` で取得し、`target.mode === "chodama" && (target.ballsConsumed||0) > 0` のとき `S.setCurrentChodama((p) => Math.max(0, p + ballsToRestore))` で**消費した貯玉を加算復元**（履歴削除と残高加算をセットで実行）。`Math.max(0, ...)` でマイナス防止（加算なので実質常に非負だが既存コードのガード様式に合わせた）。**動作確認（3シナリオ・ロジック追跡）**: (1) 貯玉プレイ中の削除 → `mode="chodama"` の `ballsConsumed` を残高へ正常復元、(2) 現金プレイ中の削除 → `data` 行は `mode="cash"`/`ballsConsumed=0` のため分岐スキップ＝貯玉に影響なし、(3) 持ち玉プレイ中の削除 → `mode="mochi"` で貯玉分岐に入らず貯玉不変。**スコープ判断**: 対象は貯玉消費を戻す `data` 行削除（＝ユーザー報告の「誤入力→直近履歴削除」経路）に限定。jpLog（大当たり）チェーン削除（`handleDeleteConfirm`/インライン「最新履歴を削除」/`handleSwipeEnd`）は **貯玉を消費しない**（消費は回転入力時のみ）ため対象外。**未対応・提案（CLAUDE.md「ついで改修禁止」遵守で実装せず報告のみ）**: 同 `handleDeleteLastData` は **持ち玉（mochi）モードの `data` 行削除時に `currentMochiBalls` も戻していない**同型のバグが残存（今回タスクは貯玉スコープのため未着手）。必要なら `mode==="mochi"` 分岐で `setCurrentMochiBalls((p)=>max(0,p+ballsConsumed))` を対称追加する案を提示。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造すべて完全不変。新規 state / LS キー追加なし（既存 `setCurrentChodama` を削除経路で呼ぶのみ）。データ構造変更なし（既存 `data` 行の `mode`/`ballsConsumed` を参照するだけ）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.46s`、PWA precache 11 entries / 790.97 KiB）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（既存値不変）。**操作ステップへの影響**: なし（削除ボタンのタップ数・導線は不変、削除時に貯玉が自動で戻るようになっただけ）。`package.json` 変更なし。不要な `console.log`/デバッグコードなし。 — 2026-05-29 の旧記述は以下に続く）<br>2026-05-31（**分析画面の収支に貯玉消費分を加算し「実質総収支」を表示**（ブランチ `claude/analysis-stored-ball-pl-PxGBm`）。**背景・目的**: 分析シート（`AnalysisDashboard`）の収支は `analysisSelectors.getActualPL = recoveryYen − investYen`（現金投資・回収のみ）で算出しており、貯玉を消費したセッションでも貯玉分の価値（コスト）が収支に反映されていなかった。ユーザー要望で、貯玉消費分を別項目で表示し、現金収支と合算した「実質総収支」を出すよう拡張。**データ構造の確認**: archive 確定時（`App.jsx:632` / `Tabs.jsx:7627`）に `chodamaYen = round(ev.chodamaKCount × 1000 × exRate / rentBalls)` が「消費貯玉数 × 交換レート」で円換算済み。既存の大当たり履歴表示（`Tabs.jsx:7922`）でも「合計投資 = investYen + chodamaYen」として**コスト扱い**で加算済みであり、貯玉消費は資産の目減り＝コストという既存セマンティクスを踏襲。**(a) analysisSelectors.js（追加のみ）**: 新規純関数 `getChodamaPL(a)` を追加（`chodamaYen > 0` なら `−chodamaYen`＝コストでマイナス、貯玉未消費は `0`）。`summarize` に集計を**追加のみ**で拡張: `totalChodamaPL`（貯玉消費分の合算・マイナス）、`hasChodama`（期間内に貯玉消費があったか）、`totalRealPL = totalPL + totalChodamaPL`（実質総収支）を返り値に追加。**既存の `totalPL`（現金収支）/ `getActualPL` の意味・値は1つも変更していない**（後方互換）。**(b) AnalysisDashboard.jsx**: 新規 `RealBalanceCard` コンポーネントを追加し、4サマリーカード直下に `summary.hasChodama` が真のときのみ表示。「現金収支（回収−投資）/ 貯玉消費分（消費玉×交換率で換算）/ 実質総収支（合算）」の3行と、計算式の注釈「現金収支 + 貯玉収支 = 実質総収支」「貯玉消費分は『消費玉数 × 交換率』で円換算したコストです」を併記。**貯玉未使用のセッション・期間では `hasChodama=false` で非表示となり、従来の収支表示と完全に同一**（要件5を満たす）。**(c) テスト**: `analysisSelectors.test.mjs` に貯玉収支テスト6件を追加（42→48件）。`getChodamaPL` の符号、貯玉未使用時 `totalRealPL=totalPL`、貯玉消費の合算、現金記録ゼロ・貯玉のみセッション、混在ケースをカバー。**保護**: `src/logic.js` は**1行も変更していない**（`chodamaYen` は既存の archive フィールドを読むのみ）。`calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造・既存LSキーすべて完全不変。新規LSキーなし。不要な console.log / debug コードなし。**検証**: `node src/components/analysis/__tests__/analysisSelectors.test.mjs` 48/48 パス、`node src/__tests__/protected-fns.mjs` が `baseline.json` と**完全一致**（`diff` 差分なし）、`npm run lint` errors=0（既存 warning 7 件のみ・本変更で増減なし）、`npm run build` 成功（`built in 2.07s`、JS 769.09 kB、PWA precache 11 entries）。**操作ステップへの影響**: なし（分析画面の閲覧フローは不変、貯玉消費があるときに収支カードの下に内訳カードが1枚増えるのみ）。**追加・変更したデータ構造**: なし（archive の既存 `chodamaYen` を読むのみ、`summarize` の返り値に派生プロパティ3つを追加）。**package.json 変更**: なし。**未対応・要確認事項**: (1) 貯玉収支は archive の `chodamaYen`（消費玉×交換率）を用いるため、セッション中に貯玉を消費しつつ再度貯玉化（`chodamaNetBalls` がプラス）したケースでも「消費分のコスト」として計上する（要件「消費貯玉数 × 交換レート」準拠）。(2) `chodamaYen` は archive 確定時の `exRate` を使用するため、後から交換率を変えても過去 archive の貯玉収支は再計算されない（既存仕様）。 — 2026-05-29 のP機大当たり入力フォーム再設計は以下に続く）<br>2026-05-29（**P機 大当たり入力フォームを「差分ベース簡易入力」へ再設計（液晶出玉・実測出玉の毎回入力を廃止）**（ブランチ `claude/nice-dirac-DDxMY`）。**背景・目的**: 実機で打ちながらの入力で、毎当たりに「ラウンド数・液晶出玉・lastOut玉・nextTiming玉・サポ回転」を入れるのは項目が多すぎ、初心者には不可能だというユーザー要望。出玉は「開始前の玉数」と「最終玉数（ラッシュ終了時）」の**差分**で算出する方式に統一し、大当たり中の入力を激減させた。**設計判断（重要）**: 調査の結果、差分ベース実測（`finalRealBalls − trayBalls`）は `logic.js` に既に実装済み（サブステップ4）で、平均は `avgNetGainPerJP = totalNetGain / jpCount`（jpCount=**チェーン数**）だった。ユーザーが数えたいのは「大当たり1回ごと（連チャン中の各当たりも1回）」のため分母が合わない。そこで CLAUDE.md「logic.js変更禁止」規定に対し、**変更理由・現状問題・影響範囲・最小差分案をユーザーに提示し承認を得たうえで**、`calcPreciseEV` に**追加のみ**（既存の返り値・計算式は1つも変更せず）で4フィールドを足した。**(a) logic.js（追加のみ）**: 完了チェーンのループで `totalHits += chain.hits?.length || 0`（hits未定義チェーンは0で安全）、実測純増が確定したチェーンの `realMeasuredRounds += summary.totalRounds` を集計。派生として `avgNetGainPerHit = totalHits>0 ? totalNetGain/totalHits : 0`（**平均出玉/大当たり**）、`avgRoundsPerHit = totalHits>0 ? totalRounds/totalHits : 0`、`estimatedSapoChange = realMeasuredChainCount>0 ? totalNetGainReal − realMeasuredRounds×(spec1R||140) : 0`（**サポ増減＝連チャン終了後の残差**＝実測純増−大当たり出玉分）を計算し、返り値に `avgNetGainPerHit / avgRoundsPerHit / totalHits / estimatedSapoChange` を追加。既存の `avgNetGainPerJP / totalNetGain / totalSapoChange` 等は温存（後方互換）。**(b) protected-fns.mjs / baseline.json**: hits配列を持つ新ケース `evSimpleFlowMultiHit`（1チェーンに hit 3回 10R/10R/5R、開始0玉・最終3000玉 → totalHits=3 / avgNetGainPerHit=1000 / avgRoundsPerHit≒8.33 / estimatedSapoChange=−500）を追加し baseline 再生成。`diff` で**既存22ケースの既存プロパティ値は完全不変・新プロパティと新ケースのみ追加**を確認（サブステップ4/5と同手法）。**(c) Tabs.jsx 入力フロー（RotTab）**: 初当たりウィザード `STEPS` を「プッシュ補正→**当たった回転数**→**開始前の玉数**→ラウンド数→結果」の5ステップへ（旧7ステップから**液晶出玉・実測出玉を削除**）。連チャンウィザード `STEPS_B` を「**サポ回転数**→ラウンド数→結果」の3ステップへ（旧5から**液晶出玉・実測出玉を削除**）。`requiredOk` から `dispN`（液晶出玉）要件を除外、バリデーションのmissingメッセージも更新（「回転数」→「当たった回転数」「サポ回転数」、「開始上皿玉」→「開始前の玉数」、液晶出玉チェック削除）。完了ハンドラは元々 `Number(displayBalls)||0` 等で未入力を0扱いするため**サポ増減=0で破綻せず**、純増は `finalRealBalls − trayBalls` 経路で算出。**(d) 単発の差分統一**: `handleWizardComplete` の単発分岐で `if (finalBalls>0) chain.finalRealBalls = finalBalls` を追加（追加のみ）。これで単発も最終玉−開始玉の差分で純増を出し、連チャンと整合。**(e) ラベル是正・表示更新**: ラッシュ終了画面（画面C）を「RUSH終了 — **最後に残った玉数**」+ ヘルプ「玉箱・カウンターの数字を入力してください。開始前の玉数との差が今回の出玉になります。」に。プリセット行を「開始前の玉数 N玉 / 今回の出玉 ±N玉」に、チェーン集計の「液晶出玉合計」→「開始前の玉数」、per-hitの「サポ増減」→**残差サポ増減**（finalRealBalls入力後のみ表示）に。出玉データカード（DataTab）に「平均出玉/大当たり」「大当たり回数」「平均R数/大当たり」「サポ増減(実測残差)」を追加。RUSH中の実測サマリーバナーの「平均1R出玉」→「平均出玉/当」、アクティブチェーン詳細の「液晶出玉合計」→「開始前の玉数」・per-hit「液晶出玉」→「ラウンド」。大当たり履歴（HistoryTab archive表示）のper-hit列を**旧データは液晶、簡易フローはサポ回転**を出すアダプティブ表示に。**ラベル整理の核心**: 旧UIは「実測出玉」が3箇所で別意味（画面A=死にデータ／画面B=サポ増減導出用タイミング玉／画面C=収支真実源）だったのを、入力項目削除で解消。**スコープ外**: `HistoryTab`（6257行〜）の**別系統の番号ステップ式チェーン編集ウィザード**（Step 0〜8、液晶出玉Step含む）は事後修正用の詳細エディタとして**温存**（実戦中の主入力フローではないため「ついで改修禁止」遵守）。**保護**: `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `rotRows` / `jpLog` / `sesLog` 不変。`calcPreciseEV` は**追加のみ**で既存出力不変（baseline既存値 diff なし）。新規LSキーなし。データ構造は `chain.finalRealBalls` を単発にも設定するのみ（既存フィールドの追加利用、新規フィールドなし）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.11s`、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と一致（既存値不変・新ケース/新プロパティのみ追加）。**操作ステップへの影響**: **大幅減**。初当たり 7→5 ステップ、連チャン 5→3 ステップ（各当たり「サポ回転＋ラウンド」の2入力のみ）。玉数入力はセッションで「開始前」「最終」の2回。**未対応・要確認事項（実機確認推奨）**: (1) 液晶出玉を入力しなくなったため `avg1R`（平均1R出玉）は常に「—」になる（仕様。出玉は差分で見る）。(2) 連チャン中は finalRealBalls 確定前のため「平均出玉/当」「サポ増減残差」はラッシュ終了後に確定（RUSH中は前チェーンまでの値）。(3) ラッシュ終了画面の finalRealBalls プリセットは「開始前の玉数」止まり（液晶が無く払い出し推定不可）、ユーザーが実測を必ず入力する前提。(4) 単発で最終持ち玉を未入力（プリセット=開始玉のまま）だと純増0扱いになるため、単発でも最終玉数の入力が必要。(5) `estimatedSapoChange` は `spec1R` を用いた残差推定のため、機種スペック未設定時は既定140玉/Rでの近似。**店内での実打ち確認をユーザーにお願いしたい**（ウィザード遷移・キーパッド・結果選択の動作は静的検証＝lint/buildのみ）。 — 2026-05-28 の分析モード絞り込み拡充は以下に続く）<br>2026-05-28（**分析モードの絞り込み条件を拡充**（ブランチ `claude/data-analysis-filters-c7hVs`）。**背景**: 既存の分析画面（`AnalysisDashboard`）は期間サブタブ（月別 / 年別 / 通算 / カレンダー）のみで絞り込み、`analysisSelectors.filterArchives(archives, { month, year })` という 2 引数体系だった。月／年以上の細かい分析（同一店舗だけ、同一機種だけ、特定の曜日だけ、任意の日付範囲）ができないため、ユーザー要望で 4 つの追加フィルタ（**店舗名・機種名・期間・曜日**）を AND 結合で実装。**変更ファイル**: `src/components/analysis/analysisSelectors.js` / `src/components/analysis/AnalysisDashboard.jsx` / `src/App.jsx` / `src/components/analysis/__tests__/analysisSelectors.test.mjs`。**(a) analysisSelectors.js**: `filterArchives` のシグネチャを `(archives, { month, year, storeName, machineName, dateStart, dateEnd, weekdays })` に拡張（既存 `{ month }` / `{ year }` 呼び出しは引数構造そのままで動作する後方互換）。新フィルタは AND 結合：`storeName` / `machineName` は完全一致（空文字で全件）、`dateStart` / `dateEnd` は `"YYYY-MM-DD"` 両端含む（片方のみ指定可）、`weekdays` は `0=日..6=土` の配列（空配列で全曜日）。`toWeekday(date)` ヘルパーを追加（`new Date(y, m-1, d).getDay()`）。`aggregateByDay/Month/Year` / `summarize` / `machineRanking` / `buildDailyChartPoints` / `buildMonthlyChartPoints` / `buildYearlyChartPoints` を全て `extraFilters` 引数受け取りに改修し、内部の `filterArchives` 呼び出しに展開して伝搬。`summarize` と `machineRanking` は単一 opts オブジェクト方式（`limit` だけ分離抽出）。新規関数 `listAvailableStores(archives)` / `listAvailableMachines(archives)`（空文字除外・五十音ソート） / `isFilterActive(filters)`（パネル活性判定用）を追加。**(b) AnalysisDashboard.jsx**: 期間ナビ直前に折りたたみ式の `FilterPanel` を追加。デフォルト閉、`activeFilterCount` バッジ（青、丸）を見出し横に表示。展開時は (1) 店舗名 select（`availableStores` から動的生成、未登録時はキャプション表示）、(2) 機種名 select（同上）、(3) 期間カスタム 2 つの `<input type="date">`（〜区切り、ラベル「月／年タブの選択範囲内でさらに絞り込みます」）、(4) 曜日チップ 7 個（日〜土、44×44px タップ領域、`日`赤・`土`青のアクセント、選択時は青枠+背景）、(5) 「絞り込みをリセット」ボタン（フィルタ有効時のみ赤枠で活性、無効時はグレーアウト）。`extraFilters` を `useMemo` 化して全集計 hook（summary / chartPoints / machineTop）の依存配列に追加。empty state を 2 種類に出し分け：archive 0 件 → 「アーカイブがまだありません」、絞り込みで該当ゼロ → 「指定された条件に一致する記録がありません。絞り込みを変更するかリセットしてください」。カレンダータブはフィルタ非適用（既存 `CalendarTab` 仕様を温存）。**(c) App.jsx**: `useLS("pt_analysisFilters", { storeName: "", machineName: "", dateStart: "", dateEnd: "", weekdays: [] })` を追加し、`<AnalysisDashboard filters={...} onChangeFilters={...} />` で props 渡し（既存の `pt_analysisTab` と同列の永続化）。`AnalysisDashboard` 側にローカル state フォールバックも残してあるので、props 未指定でも単体で動作する（旧テスト互換性のため）。**(d) テスト**: `analysisSelectors.test.mjs` に拡張フィルタテスト 17 件追加（25→42 件）。AND 結合・両端日付・曜日・listAvailableStores/Machines・isFilterActive をカバー。境界値：空配列 / 文字列数値 / 範囲片側のみ / `weekdays=[]` で全件 / 既存 `month` との AND 結合。**logic.js は1行も変更していない**。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造すべて完全不変。`filterArchives` の既存 `{ month }` / `{ year }` 呼び出しは引数オブジェクト構造そのままで動作（残りの新フィルタは undefined → no-op）。**新規 LS キー**: `pt_analysisFilters`（オブジェクト）1 個のみ。**操作ステップへの影響**: なし（既存の閲覧フローは無変更、絞り込みは「絞り込み ▼」を 1 タップ展開してから設定する追加機能。月／年タブだけで使うユーザーはパネル開かない限り従来通り）。**検証**: `node src/components/analysis/__tests__/analysisSelectors.test.mjs` 42/42 パス、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）、`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.40s`、JS 767.36 kB / CSS 31.31 kB、PWA precache 11 entries）。**未対応・要確認事項**: (1) カレンダータブにはフィルタを適用していない（既存 `CalendarTab` は独自の月別カレンダー UI で `archives` を直接参照しており、フィルタ伝搬すると別 UI への影響範囲が読みにくいため温存）、(2) 機種名フィルタは `archives` の `machineName` 完全一致のため、同じ機種を「1/319.6」と正式名で別々に保存しているケースは別機種として扱われる（既存仕様）、(3) 曜日は archive 保存日（`a.date`）から導出するため、深夜 0 時跨ぎの実戦は記録時の `new Date().toISOString().slice(0,10)` 仕様に依存。 — 同日の複数交換率対応は以下に続く）<br>2026-05-28（**複数交換率（4円/1円/0.5円パチンコ）対応をUIプリセット追加で実装**（ブランチ `claude/multiple-exchange-rates-QftPi`）。**背景**: 既存実装は `src/logic.js` の `calcPreciseEV` / `calcCash` / `calcMochi` がすでに `rentBalls` / `exRate` / `synthDenom` をパラメータ受け取り済みで計算式自体は交換率非依存だったが、UIに4円系の数値入力フィールドしか無かったため、1円パチンコや非等価交換のユーザーは `rentBalls` / `exRate` / `ballVal` を毎回手入力する必要があった。さらに `Tabs.jsx:2091` の `_getChodamaInvestYen` 関数内に `const ballValue = 4; // 等価4円` の **ハードコード** が残っていた（現状未使用関数だが将来事故防止のため修正対象）。**ハードコード探索結果**: `grep -n "ballValue = 4\|exRate = 250\|rentBalls = 250\|等価4円"` で検出された箇所は (1) `Tabs.jsx:2091` の `_getChodamaInvestYen` 内、(2) `logic.js:31` `deriveFromRows(_, _, rentBalls=250)` のデフォルト引数（4円フォールバック・保護対象）、(3) `logic.js:167` `const exchP = 1000 / (exRate || 250)` のフォールバック（4円フォールバック・保護対象）、(4) `Tabs.jsx:8514-8518` CSVインポートのデフォルト値（後方互換用・正しい挙動）の4箇所。logic.js 内のフォールバックはCLAUDE.md「logic.js変更禁止」遵守のため**触らず**、Tabs.jsx の (1) のみ `Number(S.ballVal) > 0 ? Number(S.ballVal) : 4` に変更（フォールバック4は残し、設定があればそれを使う）。**変更内容**: (a) `Tabs.jsx` 機種設定編集モーダル（4473行付近）に「**貸玉レート**」プリセット行（`[4円] [1円] [0.5円]` の3チップ）と「**交換率プリセット**」行を追加。貸玉レートチップは `editRentBalls`（玉/K）に 250/1000/2000 を、同時に `editExRate` に等価既定（同値）をセット。交換率プリセットは `editRentBalls` の現在値で動的に切替（4円系=等価/3.57円/3.3円/2.5円、1円系=等価/0.9円/0.8円、0.5円系=等価/0.45円）、数値入力フィールドは下に従来どおり残しカスタム入力も可能。チップ高は `minHeight: 36`（タップ領域確保）、`flexWrap: "wrap"`、`fontSize: 12`。(b) 同モーダル保存ハンドラ（4521行付近）に `S.setBallVal(1000 / ex)` を追加し、`exRate` から `ballVal`（円/玉）を**自動導出**してSへ同期保存（YutimeEvCard と詳細データタブの「交換率」表示が複数交換率で正しい値になる）。(c) 店舗（ホール）登録フォームの「貸玉（玉/100円）」プリセットを `[等価, 28玉, 30玉, 33玉]`（4円系のみ）から `[4円等価, 28玉, 30玉, 33玉, 1円, 0.5円]` に拡張。貸玉レートチップ押下時は `rentBalls` と `exRate` を同時に更新（等価既定）。「交換（玉/100円）」プリセットは現在の `rentBalls`（玉/100円・面値）に応じて動的切替: rb≥180→`[等価200]`（0.5円）、rb≥80→`[等価100, 0.9円111]`（1円）、それ未満→`[等価25, 28玉28, 30玉30, 33玉33]`（4円系）。(d) `applyStore`（店舗反映、8851行付近）と機種設定モーダル内の店舗ドロップダウン選択（1814行付近）に `S.setBallVal(1000 / store.exRate)` を追加。**logic.js は1行も変更していない**。**後方互換性**: (1) 既存 `pt_ballVal=4` / `pt_exRate=250` / `pt_rentBalls=250` の保存データはそのまま読み込まれ、4円パチンコ等価交換のユーザーは何も変わらない。(2) 既存archiveの `settings.ballVal` も従来通り保存・読み込み（App.jsx:606 で既に保存対象）。(3) CSVインポートのデフォルト（4円系=250/250/4）は不変。(4) 既存 `store` オブジェクトの `rentBalls` / `exRate` フィールド構造は不変、`applyStore` 内で `ballVal` を**派生**するだけなのでstore永続データへの破壊的変更なし。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造 / 既存LSキー全て完全不変。新規LSキーなし（既存 `pt_ballVal` のみ追加で書き込まれるようになる）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.44s`、JS 760.25 kB / CSS 31.31 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と**完全一致**（`diff` 差分なし）、配下全テスト（`hunterRank.test.mjs` 33/33 / `badges.test.mjs` 20/20 / `scoutSelectors.test.mjs` 16/16 / `selectSelectors.test.mjs` 6/6 / `evDecision.test.mjs` 5/5 / `analysisSelectors.test.mjs` 25/25）全パス。**操作ステップへの影響**: なし（既存の数値入力フィールドはそのまま残置、チップは**1タップでrentBalls + exRate + ballVal を一括設定するショートカット**として上に追加されたのみ。1円パチンコ設定時のタップ数: 旧=3項目それぞれ手入力≧3タップ → 新=「1円」チップ 1タップで完結）。**未対応・要確認事項**: (1) ballValは exRate から `1000/exRate` で派生（等価=1000/250=4、3.3円交換=1000/303=3.3 等）。仮にユーザーが exRate と ballVal を独立に手動設定したい場合は機種設定画面に ballVal 数値入力を追加する余地あり（今回は派生で統一）。(2) 機種マスタ `machineDB.js` の各機種にはレート種別フィールドが無いため、店舗から1円パチンコ機種を選んでも自動で1円モードに切り替わらない（店舗側 `applyStore` 経由で別途設定が必要）。将来 `machineDB` に `gameType: "4円"/"1円"/"0.5円"` フィールドを追加し、機種選択時に自動切替する拡張余地あり。(3) 0.5円パチンコは実店舗ではほぼ存在しないが、UIプリセットには含めた（既存実装の許容範囲内）— 2026-05-28 朝の機種マスター追加17件は以下に続く）<br>2026-05-28（**機種マスター（`src/machineDB.js`）に追加機種スペック18件のうち17件を末尾追加**（ブランチ `claude/pachinko-machine-master-append-DyBcQ`）。ユーザー指示のCSV形式データ18件を機種マスタへ末尾追加。**マスタ特定**: `機種マスタCSV / m_master / machine_master / machines.csv / src/data 配下 / public 配下` を全探索した結果、現在実際に使用されているマスタは `src/machineDB.js`（JSの配列、CSVファイルは存在せず）。`src/data` ディレクトリ自体が存在せず、`public/` も icon ファイルのみ。`searchMachines` / 機種検索 / ボーダー逆引きで参照される単一のマスタ。**既存precedent**: 2026-05-27 海シリーズ17機種追加時、既存と重複した「P大海物語5スペシャル」は追加せずスキップという前例があり、それに従って判断。**追加した17機種**: e範馬刃牙 199ver. / P閃乱カグラ189大入りver. / e ULTRAMAN 4500超ライト / e盾の勇者の成り上がりアルティメット199ver. / PF彼女、お借りします LT-Light ver. / PFうたわれるもの LT-Light ver. / PA清流物語4ウキウキ79ver. / eようこそ実力至上主義の教室へ / e吉宗極乗3000ver. / Pリングにかけろ1 129ver. / eゴジラ対エヴァンゲリオン2 超デカゴールド / Pゴジラ対エヴァンゲリオン2 超デカシルバー / eソードアート・オンライン99Ver. / e真・北斗無双 第5章 夢幻闘双 / eフィーバーBASTARD!! -暗黒の破壊神- / e牙狼11〜冴島大河〜魔戒BURST Ver. / e魔法少女まどか☆マギカ3 時間遡行（計17件）。**重複報告**: 入力18件目「eリコリス・リコイル」は既存DB（line 440〜459、prob=1/259.7、border1K=16.7、rushEntryRate=50、rushContinueRate=75）に同名で存在。スペック値は入力（prob=1/319.9、border1K=19.0、rushAvgPayout=3000、rushContinueRate=70）と異なるが、CLAUDE.md「既存値の意味変更禁止」「既存値を勝手に変更しない」遵守のため**追加せずスキップ**、既存値は1文字も変更していない。**スキーマ**: 既存「CSV形式準拠フォーマット」エントリ群（line 313〜816）と完全同一のJS スキーマで追加: `name / maker="" / type / prob / synthProb / border1K / prize / unitCost / avgPayoutPerHit / stdDev / initialProb / muraCoef / spatialSens / regimeSens / hesoAvgPayout / rushAvgPayout / rushEntryRate / rushContinueRate / displayToReal=null`。**typeの導出**: 既存パターンに従い、`e` 接頭辞→スマパチ、`P/PA/PF` 接頭辞は probから判定（≦99.9→甘デジ、129.8→甘デジ、189〜199→ライトミドル）。**RUSH突入率/継続率**: 既存JS スキーマ（line 478 `rushEntryRate: 100`, line 542 `rushContinueRate: 68.5` 等）は % 記号なしの純数値のため、ユーザー入力 "50.00%" → `50.00`、"75.0%" → `75.0` のように小数部の桁数はそのまま保ち % 記号のみ除去（CSVの完全保存はJS数値リテラルとして表現不可、既存スキーマ準拠）。**整合性**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造すべて完全不変。`searchMachines` シグネチャ・既存全43機種のスキーマ・並び順すべて不変（**追加は配列末尾のみ、既存行は1文字も変更していない**）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.56s`、JS 758.57 kB / CSS 31.31 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。`git diff --stat` = `src/machineDB.js | 358 +++` （insertions のみ、deletions=0）。**ファイル行数**: 追加前 830 行 → 追加後 1188 行（差分 358 行）。**操作ステップへの影響**: なし（機種検索UI・選択フロー・1タップ反映ロジックすべて従来通り、新規機種が `searchMachines` の結果として末尾に追加されるのみ）。**未対応・要確認事項**: (1) 「eリコリス・リコイル」は既存と新規でスペックが異なるため、上書き／別名追加が必要かはユーザー判断待ち、(2) maker フィールドはユーザー入力CSVに列が存在せず空文字列 `""` で記録（既存CSV形式準拠エントリと同じ扱い）、(3) ユーザータスクで言及された「CSV形式厳守 / %表記維持」は、実際のマスタがJSファイルのため厳密適用不可（既存スキーマに合わせるのが既存値保護の最善策と判断） — 2026-05-27 の遊タイム期待値計算追加は以下に続く）<br>2026-05-27（**遊タイム期待値計算機能を追加**（ブランチ `claude/yutime-expected-value-QeQFM`）。機種設定に「天井回転数」「遊タイム突入後の期待出玉」の 2 項目を追加し、記録モードの判定カード直下に「遊タイム狙い目分析」カードを新設。**App.jsx**: `ceilingRot` / `yutimePayout` を `useLS("pt_ceilingRot", 0)` / `useLS("pt_yutimePayout", 0)` で永続化（既存ユーザーの初期値は 0 = 未設定）、`S` オブジェクトに `ceilingRot` / `setCeilingRot` / `yutimePayout` / `setYutimePayout` を追加して props 伝搬。**Tabs.jsx 機種スペック設定サブビュー**（`showMachineSpecView` ブロック）: 既存「期待値算出用スペック」セクション直下に新規 `SectionLabel="遊タイム狙い目分析（任意）"` セクションを追加し、`天井回転数（0 で未設定）` / `遊タイム期待出玉（玉）` の 2 行をサブ説明付き `settings-row` で配置（既存 `NI` 部品を流用、入力幅 80px、`minHeight` は既存行と同じ 44px 以上）。**Tabs.jsx 記録モード rot タブ**: `VerdictBadge` と `KeyMetrics` の間に新規 `<YutimeEvCard>` を挿入。コンポーネントは `effectiveEv` 関数直下に新規定義し、props: `ceilingRot / yutimePayout / currentHamari / start1K / fallbackStart1K / ballVal`。**早期 return**: `Number(ceilingRot) <= 0` のとき `return null` で完全非表示（天井未設定/非搭載機種では UI に出ない）。**計算式**: `remainingRot = max(0, ceiling - hamari)` / `rate = measuredStart1K > 0 ? measuredStart1K : S.border`（理論ボーダー fallback）/ `arrivalCost = round(remainingRot / rate × 1000)`[円] / `payoutValue = round(payout × ballVal)`[円] / `ev = payoutValue - arrivalCost`[円]。**判定ラベル**: `remainingRot === 0` → 「天井到達済み」（青）/ `payout <= 0` → 「期待出玉未設定」（灰）/ `ev > 0` → 「狙い目」（緑）/ `ev < 0` → 「割に合わない」（赤）/ `ev === 0` → 「ボーダー上」（黄）。**UI**: ダーク半透明カード（既存 `dataCardStyle` 同系統の `linear-gradient(180deg, rgba(11,22,40,0.85), rgba(16,27,45,0.75))` + `border: rgba(26,77,117,0.45)` + `backdrop-filter: blur(8px)`）。3 カラム数値行（残り回転 / 到達コスト / 期待値）+ 右上にバッジ風判定ピル + 補足キャプション（天井回転数・期待出玉・1K スタート、`usingFallback` のとき「（理論ボーダー使用）」を併記）。**バックアップキー**: `backupAllData` の `keys` 配列に `pt_ceilingRot` / `pt_yutimePayout` を追加（`pt_specSapo` の直後）。**保護**: `src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / `jpLog` / `sesLog` / 既存保存データ構造すべて完全不変。計算は presentation layer の `YutimeEvCard` 内で完結（既存の `ev` / `evEff.start1K` / `S.border` / `S.ballVal` / `currentHamari` を参照するのみで、新規ロジックは何も追加していない）。**操作ステップへの影響**: なし（記録タブ既存閲覧フローは同じ、設定への遷移も既存 1 タップ）。**検証**: `npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.00s`、JS 755.19 kB / CSS 31.31 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。**未対応・要確認事項**: (1) `machineDB.js` の各機種への天井回転数・遊タイム期待出玉の事前登録は今回未対応（既存 `notes` に「遊タイム搭載/非搭載/要確認」とテキスト記述のみ。ユーザー手動入力前提）。将来、`machineDB` に `ceilingRot` / `yutimePayout` フィールドを追加し、機種選択時に自動セットする拡張余地あり、(2) 期待出玉 0 の場合は計算自体をスキップ（「期待出玉未設定」表示）。連チャン期待出玉を yutimePayout に入れるか、初当たり期待出玉に絞るかはユーザー判断に委ねる、(3) `fallbackStart1K = S.border` は理論ボーダーをそのまま使用しているため、未測定区間では「到達コスト ≒ 等価ベースの理論コスト」になる。実測 `start1K` が確定したら自動的にそちらを使用 — 同日朝の海シリーズ17機種追加は以下に続く）<br>2026-05-27（**機種マスター（`src/machineDB.js`）に最新の海シリーズ17機種を追加**（ブランチ `claude/umi-series-master-data-5Jf60`）。`src/components/Tabs.jsx` の `searchMachines` / 機種検索 / ボーダー逆引き / `S.setSynthDenom` などで参照される既存 `machineDB` 配列の末尾に「海シリーズ（最新追加）」セクションを新設し、ユーザー指示の P機・e機・PA甘デジ計18機種のうち、既存DBと重複する「P大海物語5スペシャル」（line 271）を除く17機種を追加。**追加機種**：PAスーパー海物語IN沖縄6 Withえなこ / PA海物語 極JAPAN Withナギナミ / Pスーパー海物語IN沖縄6 / PA海物語3R3 / P海物語 極JAPAN / PA大海物語5ブラックLT99ver. / e大海物語5スペシャル / PAスーパー海物語IN地中海2 / P大海物語5ブラック / e新海物語349 / PA大海物語5 Withアグネス・ラム / P大海物語5 / PAスーパー海物語IN沖縄5 夜桜超旋風99ver. / PA新海物語 / Pスーパー海物語IN沖縄5 夜桜超旋風 / PAスーパー海物語IN沖縄5 with アイマリン / Pスーパー海物語IN沖縄5 桜199ver.（計17件）。各エントリは既存スキーマに合わせ `name / maker="三洋" / type（甘デジ・ライトミドル・ミドル・スマパチを大当り確率から判別） / prob / synthProb / spec1R（実出玉÷ラウンド数の代表値、主要ラウンド基準） / specSapo=0 / roundDist（"4R/6R/10R" 形式、`Tabs.jsx:625` の `/(\\d+)R/g` 正規表現に適合） / rushDist（人間可読の継続率テキスト） / prize（ヘソ賞球） / rushEntryRate / rushContinueRate / displayToReal=null / notes（賞球数・電チュー賞球・カウント・払出・実出玉・時短・遊タイム・補足RUSH継続率等の元データを保存）` を設定。**ボーダー(4円)が確定している2機種のみ `border: { "4.00": ... }` を追加**（Pスーパー海物語IN沖縄6=17.9 / P大海物語5=16.7）。**「要確認」項目は推定せず**、対象フィールドを未設定のまま保持し `notes` に明記（CLAUDE.md「ついで修正禁止」「既存値を変更しない」「勝手な推定禁止」遵守）。**重複報告**：「P大海物語5スペシャル」は既存DB（line 271、specAvgTotalRounds=31.8 / rushEntryRate=54 / rushContinueRate=71 等）に存在するため**追加せずスキップ**、既存値は一切変更していない。`src/logic.js` / `calcPreciseEV` / `deriveFromRows` / `calcCash` / `calcMochi` / `useLS` / `evDecision.js` / `baseline.json` / `rotRows` / 保存データ構造すべて不変。`searchMachines` シグネチャ・既存26機種のスキーマ・並び順すべて不変（追加は末尾のみ）。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.96s`、JS 751.06 kB / CSS 31.31 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。`git diff --stat` = `src/machineDB.js | 270 +++` のみ。操作ステップへの影響: なし（既存の機種検索UI・選択フロー・1タップ反映ロジックすべて従来通り、新規機種が `searchMachines` の結果として追加される）。未対応・要確認事項: 17機種それぞれの `specAvgTotalRounds`（連チャン込み平均総R数/初当たり）は user data に列が無いため未設定（既存計算ロジックの formulaBorder にフォールバック）、ボーダー(4円)は2機種以外 `notes` に「要確認」を記録、`hesoAvgPayout` / `rushAvgPayout` も user data 不在のため未設定（既存計算ロジック任せ）— 同日朝のアプリロゴ差し替えは以下に続く）<br>2026-05-27（**アプリロゴを新デザイン（PachiTracker メタリックP + 青ダイヤ）に差し替え**（ブランチ `claude/app-logo-setup-YKrzJ`）。ユーザー提供の 1254×1254 JPEG ロゴ画像（ダーク背景の角丸スクエア + メタリックな「P」+ 青いダイヤモンドアクセント + 下部に「PachiTracker」テキスト）を採用。元画像は四隅に角丸由来の白い余白があったため、Pillow で外周から flood-fill して白い領域のみ透過に変換（70669px を透過化、内部のメタリックハイライトは閾値 235 で保護）。変換後の RGBA 画像を Lanczos リサンプリングで 3 サイズに書き出し: `public/icon-192.png`（192×192、39KB）/ `public/icon-512.png`（512×512、231KB）/ `public/favicon-32.png`（32×32、新規追加、2KB）。旧 `public/icon.svg`（オービットリング + シンプル「P」の別意匠）は新デザインと整合しないため削除。`index.html` の `<link rel="icon">` を SVG 参照から `favicon-32.png`（32×32）と `icon-192.png`（192×192）の 2 行 PNG 参照に変更、`apple-touch-icon` は `icon-192.png` を継続使用（sizes 属性を明示）。`vite.config.js` の PWA `manifest.icons` から `icon.svg` エントリ削除、代わりに `favicon-32.png`（32×32）を先頭に追加（既存 192/512 は不変）、`includeAssets` も `['favicon-32.png', 'icon-192.png', 'icon-512.png']` に更新。ビルド結果の `dist/manifest.webmanifest` に `favicon-32.png` / `icon-192.png` / `icon-512.png` の 3 アイコンが正しく出力されることを確認。`logic.js` / `evDecision.js` / `baseline.json` / `rotRows` / 保存データ構造すべて不変、`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.11s`、JS 741.28 kB / CSS 31.31 kB、PWA precache 11 entries）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致。操作ステップへの影響: なし（アイコン画像差し替えのみで UI ロジック / 入力フロー無変更）— 同日朝の FAB viewport 中央寄せは以下に続く）<br>2026-05-27（**下部ナビの「記録開始」FAB を viewport 中央 X 座標 (50%) に確実に固定**（ブランチ `claude/bottom-nav-layout-alignment-j4lv5`、コミット 2 件目）。前コミットで導入した `gridTemplateColumns: repeat(6, 1fr)` 構造は、FAB を 4 番目セルの「セル中央」に絶対配置していたため、FAB 中心 X = nav 幅の 58.33%（= viewport の 58.33%）となり、画面真の中央(50%) から右に約 8.33% ズレていた。修正内容: (1) nav を `display: flex` に戻し、`左セクション(flex:1 で 3 タブ ホーム/偵察/台選び) + 中央 FAB 空きスペース(width: 72px, flexShrink: 0) + 右セクション(flex:1 で 2 タブ 分析/設定)` の 3 ブロック構造へ再構成。中央空きスペースは flex フローに含めるが FAB 自体は含めず、ラベル「記録開始」のみここに通常フローで配置（左右タブと同じ縦位置に揃う）、(2) FAB は flex フロー外の絶対配置に戻し、`position: absolute; top: -24; left: 50%; transform: translateX(-50%); width: 52; height: 52` を維持。nav 自身が `position: fixed; left: 50%; transform: translateX(-50%); width: 100%; maxWidth: 480` で viewport 中央に寄っているため、FAB の `left: 50%` は **viewport 中央 X (= window.innerWidth / 2) と完全一致** する、(3) 旧 6 タブ単一 `TABS` 配列を `LEFT_TABS` / `RIGHT_TABS` の 2 配列に分割、`renderTab` ヘルパーを復活。`logic.js` / `evDecision.js` / `baseline.json` / `rotRows` / 保存データ構造すべて不変、`onChange(currentMode)` シグネチャも不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.09s`、JS 741.28 kB）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致。**FAB 中心 X 座標の数学的検証**（CSS box model の解析計算）: viewport 320/375/390/414/480/600/768/1024/1660px の全ケースで `fabCenter - viewportCenter = 0px`（許容±2px 内）を確認済み。操作ステップへの影響: なし（タップ可能領域・サイズ・導線はすべて従来通り）— 同日朝の 6 等分グリッド化は以下に続く）<br>2026-05-26（**下部ナビゲーションのレイアウトを 6 等分グリッド化し、項目間隔・縦位置・FAB の持ち上がりをモック準拠に再調整**（ブランチ `claude/bottom-nav-layout-alignment-j4lv5`）。旧構造は左セクション flex:1（3 タブ: ホーム/偵察/台選び）+ 右セクション flex:1（2 タブ: 分析/設定）の **3:2 非対称** で、各タブ幅が左 16.67% / 右 25% と不揃いになり、「台選び ↔ FAB」「FAB ↔ 分析」の間隔が視覚的にバラついていた。さらに FAB は `top: -22` で持ち上がりが浅く、ラベル「記録開始」が `position: absolute` + `bottom: calc(env(safe-area-inset-bottom) + 6px)` で他タブのラベルと縦位置が揃わず浮いて見えていた。修正内容: (1) nav 全体を `display: grid; gridTemplateColumns: repeat(6, 1fr)` に変更し、`TABS` 配列を `[ホーム, 偵察, 台選び, 記録開始(FAB), 分析, 設定]` の 6 セル等幅に再構成。これで左右の項目数差に関係なく全タブ中心が 6 等分位置（8.33/25/41.67/58.33/75/91.67%）に揃い、「台選び ↔ 記録開始」「記録開始 ↔ 分析」の間隔がともに 16.67% で完全対称になる。(2) 中央セルは `position: relative` の `<div>` ラッパーで FAB + ラベルを内包し、FAB を `position: absolute; top: -24; left: 50%; transform: translateX(-50%)` で 4 番目セル中央に絶対配置（持ち上がりを 22→24px に増加）。(3) FAB ラベル「記録開始」は中央セル内の通常フローに置き、`marginTop: 24` で FAB を避けつつ左右タブのラベルと同じ縦位置（高さ）に揃えた（旧 `position: absolute` ラベルを廃止）。(4) nav の `paddingTop: 6` / `paddingBottom: calc(env(safe-area-inset-bottom) + 4px)` を明示し、左右タブも `justifyContent: flex-end` で下揃え、`padding: "0 0 4px"` でラベル下マージンを統一。(5) `LEFT_MODES` / `RIGHT_MODES` 配列、`renderTab` 関数、左右セクションを包む `<div>` ラッパーすべて撤去（責務がシンプルになり 1 ループでレンダリング）。`logic.js` / `evDecision.js` / `baseline.json` / `rotRows` / 保存データ構造すべて不変、`onChange(currentMode)` シグネチャも不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 1.99s`、CSS 31.31 kB / JS 741.20 kB）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` 差分なし）。操作ステップへの影響: なし（タップ可能領域・サイズ・導線はすべて従来通り、見た目の左右対称化のみ） — 同日の FAB 水平中央寄せ明示化は以下に続く）<br>2026-05-26（**下部ナビ中央「記録開始」FAB の水平中央寄せを明示化**（ブランチ `claude/record-button-layout-vIZUc`）。`ModeTabBar.jsx` の中央 FAB は `position: absolute` + `top: -22` のみ指定で `left`/`right` 未指定だったため、水平中央寄せは親 flex の `alignItems: center` による絶対配置要素の「静的位置」に依存していた。修正内容: FAB スタイルに `left: "50%"` + `transform: "translateX(-50%)"` を追加（`src/components/ModeTabBar.jsx:157-170`）。親側の flex（`flexDirection: column / alignItems: center / justifyContent: flex-end`）は不変。`logic.js` / `evDecision.js` / `baseline.json` / 保存データ構造すべて不変、操作ステップ影響なし。`npm run lint` errors=0（既存 warning 7 件のみ）、`npm run build` 成功（`built in 2.65s`）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致 — 同日朝のホーム画面月間期待値目標機能は以下に続く）<br>2026-05-26（**ホーム画面に月間期待値目標機能を追加**（ブランチ `claude/home-monthly-target-goal-72NhF`）。これまで `GoalAndMonthlyCard` 右側の「今月の期待値」カードは `monthlyEv={68950} / monthlyTarget={100000}` のハードコードで、実セッションの累計と切り離されていた。修正内容: (1) `App.jsx` に `const [monthlyEvTarget, setMonthlyEvTarget] = useLS("pt_monthlyEvTarget", 100000);` を追加して localStorage / IndexedDB へ永続化、`S.monthlyEvTarget` / `S.setMonthlyEvTarget` として props 渡し、(2) `HomeDashboard.jsx` で既存の `chartData`（`aggregateByDay(archives, "YYYY-MM")` の当月日別集計を当日まで累積した `{ day, ev, actual }[]`）の末尾要素 `chartData[chartData.length-1].ev` を `monthlyEvTotal` として導出（archive 0 件のときは 0）、(3) 右カードを機能版に置き換え：ヘッダーに鉛筆編集ボタン（44px 相当のタップ領域 = 28px ボタン + パディング）、当月累計EV（22px 大）、進捗バー（高さ 8px、`Math.min(100, ev/target*100)`）、達成時は **金色グラデ + 「✦達成済み」バッジ + 黄色枠 + 黄色シャドウ**、未達成時は **「あと N円」テキスト + 達成率%**、(4) `MonthlyTargetEditor` ボトムシート新規追加（条件マウント、`useState(() => initial)` で props.current を初期値化）。プリセット `5万 / 10万 / 20万 / 30万 / 50万`（タップ領域 44px 以上）+ 数値入力 + 保存 / キャンセル、(5) 左側「本日の稼働目標」カードはモック準拠のまま温存（将来連携予定）。既存の `monthlyTarget=100000` / `monthlyEv=68950` ハードコード値は削除。`logic.js` / `evDecision.js` / `baseline.json` / `rotRows` 不変、新規 localStorage キーは `pt_monthlyEvTarget` のみ。`npm run lint` errors=0（既存 warning 7 件のみ）、`npm run build` 成功（`built in 2.07s`）、`node src/__tests__/protected-fns.mjs` が `baseline.json` と完全一致（`diff` で確認）。操作ステップへの影響: 既存の閲覧フローに変化なし、目標編集は鉛筆タップ → プリセット選択 → 保存の 3 タップで完了 — 2026-05-24 の旧記述は以下に続く）<br>2026-05-24（**ホーム画面の月間EV推移グラフをダミー → 実データに切替**（ブランチ `claude/graph-dummy-to-real-data-9015O`）。`src/components/home/HomeDashboard.jsx` の `MonthlyEvChart` が **30 日分の固定上昇トレンド配列**（`[-2500, -1200, 2400, ... 68950]` の決め打ち）を `data` プロップに渡しており、ユーザーがどんな記録を入れても同じ右肩上がりの折れ線が出る状態だった。修正内容: (1) `analysisSelectors.aggregateByDay(archives, "YYYY-MM")` を流用して今月分の archive を日別集計、(2) 1 日〜今日まで各日に **期待値累積（`stats.workAmount` の累積）** と **実収支累積（`recoveryYen - investYen` の累積、`hasActual` の日のみ加算）** の 2 系列を構築し `{ day, ev, actual }` 配列で渡す、(3) `MonthlyEvChart` を `data / tab / hasData` で再実装し、`tab === "ev" / "actual" / "compare"` の 3 タブをすべて実データで描画（compare は実収支を緑の破線でセカンダリ重ね＋下部に凡例）、(4) Y軸スケールを `buildYScale()` で自動算出（step 候補: 1K/2K/5K/10K/25K/50K/100K/250K/500K、最大 5 段以内に収まる最小ステップを選ぶ + 0 線を必ず含む）、(5) X軸ラベルもデータ点数から最大 5 個を等間隔に派生、(6) **今月の archive が 1 件も無いときは `hasData=false` で「今月の記録がまだありません / セッションを記録するとグラフが表示されます」プレースホルダーを表示**（タブ切替は機能、SVG は描画しないので `data.length-1` ゼロ割を回避）、(7) actual タブはタイトル「今月の実収支推移」+ メイン色 `#22C55E` グリーン、compare タブはタイトル「期待値 vs 実収支」+ 期待値ブルー線 + 実収支グリーン破線。`logic.js` / 計算式 / `evDecision.js` / 保存データ構造 / `rotRows` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功（`built in 2.33s`）、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致。操作ステップへの影響: なし（既存タブUI・配色トークンを維持、ホーム画面の構造は不変）。`HomeDashboard.jsx` の `chartData` の `TODO: 将来連携予定` コメントを削除済み — 2026-05-23 の旧記述は以下に続く）<br>2026-05-23（**「直近の行動ログ」に回転入力イベントが表示されないバグを追加修正**（ブランチ `claude/activity-log-button-nav-2O8g6`、コミット 2 件目）。`RecentEventList.jsx` 内の `isRotInputType` フィルター（`/決定$/` / `/消費$/` 末尾）が回転入力イベント（"1K決定" / "500円決定" / "持ち玉NN玉消費" / "貯玉NN玉消費"）を**全て除外**しており、ユーザーが回転数を入力しても「直近の行動ログ」に何も追加されない状態（`Tabs.jsx:1296-1301` で `pushLog` は実行され `sesLog` 自体には保存されている）。修正内容：`sesTypeToStyle` に `isRotInputType(type) → EVENT_STYLES.rotInput` のマッピングを追加（`rotInput` style は既存定義あり）、`sesLog` forEach 内の早期 return フィルターを削除し、回転入力イベント時は `e.rot`（thisRot = 今回入力分の増分）を **「+NN回転」「今回 +NN回」** の sub/chips で表示（通常イベントの累積回転とは別ラベル）、cash/mode に応じて「投資 NN円」「持ち玉 消費」「貯玉 消費」のチップも表示。これにより 20 回転刻み × 5 入力で 5 件のタイムライン行が出るようになる。`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致 — 同ブランチ 1 コミット目の「すべて見る ›」遷移先バグ修正は以下に続く）<br>2026-05-23（**「直近の行動ログ」の『すべて見る ›』ボタンの遷移先バグを修正**（ブランチ `claude/activity-log-button-nav-2O8g6`）。`src/components/decision/RecentEventList.jsx` の `すべて見る ›` リンクが `Tabs.jsx:2249` で `S.setSessionSubTab("history")` に紐付いており、押下すると **大当たり履歴タブ**（jpLog 一覧）へ誤遷移していた。sesLog の全件一覧を表示する専用画面が存在しないため、ユーザー確認のうえ**「その場で展開」方式**で修正：`RecentEventList` に `expanded` ローカル state を追加し、`allEvents.length > MAX_ITEMS(5)` のときのみボタンを表示、押下で `すべて見る（N件） ›` ⇄ `折りたたむ ›` のトグルで `slice(0, 5)` を解除する。`Tabs.jsx:2244-2250` から `onViewAll` プロップを削除（呼び出し側 1 箇所のみで使用）。`logic.js` / 計算式 / 保存データ構造 / `rotRows` / `evDecision.js` / `baseline.json` すべて不変。`npm run lint` errors=0（既存 warning 7 件のみ、本変更で増減なし）、`npm run build` 成功、`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致。操作ステップへの影響: タップ数増減なし（既存 1 タップでの遷移 → 同じく 1 タップでその場展開）、画面遷移が発生しないため店内片手操作の流れを切らない — 当日朝のホーム画面新設は以下に続く）<br>2026-05-23（**ホーム画面（新規モード `home`）を「EV運用OS」風ダークUIで新設、台選びは温存**（ブランチ `claude/pachi-home-ui-redesign-gMPJx`、再実装版）。初回実装時に下部ナビから台選びが消えたためユーザー要望で revert（PR #214 を main 上で `git revert -m 1`、`fac7b3f`）し、本コミットで**台選びを残したまま再実装**。`App.jsx` に新規モード `home` を追加（`pt_currentMode` 新規ユーザー初期値を `record` → `home` に変更、既存ユーザーは保存値維持）。下部ナビ `ModeTabBar` を「**ホーム / 偵察 / 台選び / 記録開始（中央 52px FAB） / 分析 / 設定**」の**6タブ構成**に拡張（旧 5 タブ + ホーム、中央 FAB は記録モードへの遷移）。FAB はネオンブルー発光、上に -22px オフセット。アイコンは 20→18px、ラベル fontSize 9 でコンパクト化（375px iPhone でも収まる）。ホーム画面は 8 セクション（ヘッダー / 目標+月間EV 2カラム / ハンターランク + 3ステータス / 本日のサマリー大カード+右2小 / 今月EV推移チャート（タブ切替: 期待値・実収支・比較）/ 最近の分析 3カード / 実績・バッジ 横スクロール（右端マスクフェード）/ 直近の記録 1件）。配色は `#08111A → #020713` 深いダークグラデ + `#0F1A2B / #0A1320` カード + `#1F2937` 枠 + `#00A6FF` ネオンブルー / `#7DD3FC` シアン / `#22C55E` 成功 / `#F59E0B` 警告 / `#EF4444` 危険 / `#8B5CF6` 紫。実データは `S.hunterRank` / `S.hunterCounters.streakDays` / `S.archives.length` / archives 集計を使用、本日 EV・月間 EV 推移・最近の分析 3カードはモック準拠ダミー（`TODO 将来連携予定` コメント付）。実収支カードは `actualFs` で |金額| に応じ自動縮小、tabular-nums + nowrap で桁溢れ対策。`logic.js` / `baseline.json` / `evDecision.js` / 保存データ構造すべて不変、保護関数テストは baseline と完全一致 — 当日朝の設定画面1カラム化は以下に続く）<br>2026-05-23（設定画面を**全1カラム縦リスト**に再設計（ブランチ `claude/settings-screen-redesign-YA6Bw`）。前回の「分析OS風ダークUI」を引き継ぎつつ、遊技設定 5チップ→1カラム5項目 / 表示・カスタマイズ + データ管理 2カラム→各々1カラム / セキュリティ 3項目横並び→1カラム4項目（**SNSシェア（匿名化）** と **生体認証でのロック** を新規追加、スクショ保護を置換）/ サポート 2項目横並び→1カラム2項目、へ全面1カラム化。ヘッダー右上を「環境サマリー」→「**環境プロファイル（マイホールA）**」に変更し、`TODO` コメントで将来のホール環境切替画面導線を予約。ラベルも「詳細設定（上級者向け）」「テーマ・カラー・アクセシビリティ」「グラフ・表示設定」「通知・サウンド・振動」へ拡充。アイコン IconShare / IconFingerprint を新規追加。`logic.js` / `baseline.json` / `evDecision.js` / 保存データ構造すべて不変、保護関数テストは baseline と完全一致 — 当日早朝の前回（CbML8）刷新は以下に続く）<br>2026-05-23（設定画面を「分析OS風ダークUI（モック準拠）」に全面刷新。ヘッダー（タイトル+環境サマリーカード）/ 遊技設定 5チップ / 表示・カスタマイズ + データ管理 2カラム / セキュリティ 3項目横並び / サポート 2項目横並び / アプリ情報（最新版バッジ+アップデート履歴） の 6 セクション構成。ハンターランク・実績バッジを設定画面から完全削除（import / JSX 両方除去）。フッター `ModeTabBar` を `minHeight 52→44 / icon 22→20 / fontSize 10→9` でコンパクト化、半透明濃紺＋薄い青グレー上線に統一。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過 — 同日の詳細データタブ刷新は以下に続く）<br>2026-05-23（詳細データタブを「折りたたみ型 分析OS UI」へ再刷新。常時表示は AI分析サマリー（チェックリスト型）+ 1Kスタート / 想定時給（LOW強調・小型化）+ 終了予定までの想定仕事量レンジバー の 4 セクションに集約。仕事量vs実収支 / σ分析（青→グレー→黄のみ）/ ボーダー差・信頼度の推移（現在点パルス）/ 詳細スタッツ（優先度別レイアウト）/ 計算根拠 の 5 セクションは折りたたみ化、通常時は 1 行サマリーのみ。スクロール中も「持ち玉遊技中 / ボーダー / 期待値プラス／マイナス / 信頼度 / 次の判断ライン」を表示する下部固定ステータスバーを追加。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過 — 2026-05-22 の旧記述は以下に続く）<br>2026-05-22（詳細データタブを「分析OS風ダークUI（モック準拠）」に全面刷新。AI分析サマリー + 1Kスタート/想定時給 2カラム + 終了予定までの想定仕事量レンジバー + 仕事量vs実収支 3カラム + 期待値との差 半円σゲージ + ボーダー差・信頼度の2線推移グラフ + 詳細スタッツ + 計算根拠 の 8 セクション構成。配色は `#050B18` 背景 + `rgba(11,22,40,...)` 半透明カード + 青/緑/黄/赤/紫のネオン系アクセント。実データがあれば既存 `ev` / `evEff` から取得、無い時はモック準拠のダミー値。交換率は `S.ballVal`（円/玉）を優先。`logic.js` / `baseline.json` / `evDecision.js` 不変、保護関数テスト通過）

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
    strategy/                   # 戦略マップ画面（2026-06-16、見た目優先プロトタイプ）
      StrategyMapDashboard.jsx  # 自己完結UI（既存UI/フォーム非流用・モック準拠）
      strategyMapData.js        # 仮データ将来連携予定の純関数（決定論的生成・logic.js非依存）
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
### 保留タスク5：UX・設計レビュー指摘事項（2026-06-10、未着手）

ブランチ `claude/pachi-tracker-ux-review-j3cg78` での全体レビューで検出。コード変更は未実施（報告のみ）。

**A. バグ（優先度高）**

1. **`ev.netGain` 参照バグ**: `Tabs.jsx:2880`（ヒーローカード）、`Tabs.jsx:4808` / `Tabs.jsx:5635`（入力ウィザード上部HUD）が `ev.netGain` を参照するが、`calcPreciseEV` に同名プロパティは存在しない（候補: `ev.totalNetGain`）。`Number.isFinite(undefined)` が false のため常に 0 → 評価ラベル（圧倒/優勢/互角/不利、Tabs.jsx:2889-2895）が常に「互角」、HUD の期待差玉が常に 0。修正は `logic.js` 不要・Tabs.jsx の 3 箇所のみ。

**B. 整合性（命名・閾値・定義）**

2. 用語混在: 同一の `evDecision` confidence 値を「信頼度」（VerdictBadge.jsx:101、evDecision.js:60、Tabs.jsx:3519 ほか）「試行充足率」（ConfidenceBar.jsx:21、VerdictBadge.jsx:83 aria-label）「データ精度」（VerdictBadge.jsx:122、Tabs.jsx:3461）と呼び分けている。「信頼区間」は未使用。SelectDashboard の「信頼度」（machine.confidence、0-100 スケール）は別定義の同名ラベル。
3. データ精度の言語化閾値不一致: VerdictBadge.jsx:74 は 70%/40%（高い/やや低い/低い）、Tabs.jsx:3461 は 60%/30%（高い/中/低い）。さらに Tabs.jsx:3464 の想定時給信頼度は「HIGH/MID/LOW」と英語ラベル（CLAUDE.md「UIラベルは日本語のみ」と不整合）。
4. `hold`（様子見）のヒントが continue と同一の「このまま打ち続けてOK」（VerdictBadge.jsx:25）。様子見の意味と矛盾。
5. App.jsx:52-57 `VERDICT_LABELS` で continue_strong / continue が共に「続行」→ 判定変化通知が「続行」→「続行」になり得る。
6. 判定体系が4系統並立（統一定数なし）: evDecision.js:50-53（続行/様子見/ヤメ、EV円ベース）、Tabs.jsx:2889-2895（圧倒/優勢/互角/不利、差玉ベース）、selectSelectors.js:26-31（本命/候補/様子見/低優先、confidence 76/60/42）、scoutSelectors.js:106-117（強/中/弱、totalPL/回収率）。「様子見」が decision と select で別ロジックの同名ラベル。
7. EV集計の生/補正混在: analysisSelectors.js:23-26・scoutSelectors.js:24-27 の `getEvAmount` は生の `stats.workAmount`。実戦中の RotTab 表示は `effectiveWorkAmount`（上皿補正後、Tabs.jsx:392-401 `effectiveEv`）→ 実戦中に見た仕事量と分析画面の集計値が一致しない。
8. KeyMetrics.jsx:59 の「補正後EV/K」は `effectiveEV1K`（補正不能時は生値へフォールバック）のため、フォールバック時に生値が「補正後」として表示される。
9. 収支定義は整合確認済み: EndSessionSheet プレビュー（回収−現金投資−貯玉消費）と analysisSelectors の `totalRealPL = totalPL + totalChodamaPL` は一致。ただし AnalysisDashboard サマリーカードの「収支」欄は貯玉抜きの `totalPL` 表示（実質収支は RealBalanceCard に分離）。

**C. 実践中UI動線**

10. ModeTabBar.jsx に実戦中のタブ離脱ガードなし。タブ移動で RotTab がアンマウントされ、連チャンウィザード等のローカル入力途中状態が消える（永続化済みデータは無事）。FAB ラベルは実戦中も「記録開始」のまま。
11. 未完了チェーン（completed:false）が残ったまま「実戦終了」（Tabs.jsx:2702）・「台移動」が可能でガードなし。`calcPreciseEV` は completed===true のみ集計する一方、上皿補正（logic.js:163 の trayBalls 合算）は未完了チェーン分も含むため、未完了のまま終了するとそのチェーンの出玉が統計・収支から漏れる。
12. SelectDashboard `onStart`（App.jsx:940-959）: `sessionStarted` 中でも `setMachineNum` / `setMachineName` を無条件実行 → 実戦中に台選びから「実戦開始」を押すと現在セッションの機種情報が黙って書き換わる（台移動フローのバイパス。アーカイブ・按分なし）。
13. `handleStartChain`（Tabs.jsx:1497-）は `sessionStarted` をチェックしない（未開始でも大当たり入力が通る）。
14. 日付跨ぎ持ち玉の `carryOverPrompt`（App.jsx:558-567）は起動時1回のみ判定。アプリを開いたまま日付が変わるケースは検知しない（軽微）。
15. 回転数入力は累積回転テンキー方式（Tabs.jsx:2162 `pressDigit`〜numpad-modal）。「+1/+5/+10/+25」加算ボタンは存在しない。データフローは numpad → setRows → rotRows → calcPreciseEV → evDecision で一本化されており迂回経路なし。pushSnapshot も主要 12 箇所で呼ばれている（健全）。

**D. 未実装・未使用**

16. TODO: Tabs.jsx:11287（ホール環境プロファイル切替画面）、Tabs.jsx:11430（スクショのホール名/台番号マスキング連動）。将来連携予定コメント: Tabs.jsx:3204・3228・8752・11199、evDecision.js:3（riskAdjusted 用 opts 予約）。
17. P-EVIDENCE 連携待ち: ScoutDashboard「本日予測」タブ＝EmptyState、SelectDashboard は machines 空配列ハードコード（SelectDashboard.jsx:532）＋EmptyState。いずれも「未連携」の注記あり（ダミーデータの本番残留はなし。dummyData.js は現存しない）。
18. 未使用: `ModePlaceholder.jsx`（参照0件、削除はユーザー承認後）、`calcPreciseEV` の `measuredBorder` / `totalNetGainDisplay` / `totalNetGainReal` / `chodamaRatio`（テスト以外で参照なし）、`NOTIF_XP_GAINED`（notifications.js:18、発火箇所なし）。
19. DataTab の概算プロキシが本番残存: σ推定 `sigmaStdEst`（Tabs.jsx:3443、「見た目優先・概算」コメント）、想定仕事量レンジ `workMid = expectedWork/1500*45000`・`×0.62`/`×1.37`（Tabs.jsx:3456-3458）、`endTimeLabel = "未設定"` ハードコード（Tabs.jsx:3459）。

**E. 前提の相違（依頼文と実装のギャップ）**

- 本リポジトリは TypeScript ではなく JSX（src/App.tsx・型定義は存在しない）。ベイズ推定ロジックは存在しない（EV計算は logic.js の頻度ベース）。判定ラベルは「鉄板/狙い/様子見/遊ける」ではなく「続行/様子見/ヤメ」。


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

### 直近の状態サマリー（2026-06-16 時点、戦略マップ中心の構成整理 完了後）

- **作業ブランチ**: `claude/pachi-tracker-strategy-map-28n7y4`（push 済 / PR 未作成）
- **目的**: 「戦略マップ設計固定プロンプト」に沿って、戦略マップ画面を中心としたアプリ構成へ整理する。**戦略マップ画面（`StrategyMapDashboard.jsx`）は保護対象として完全無改変**。
- **ユーザー確認済みの方針**:
  - 台選びタブ＝戦略マップ画面に置き換え（仕様準拠）
  - 既存ホーム/SelectDashboard の機能は仕様に沿って再配置（推奨）
- **本ブランチで変更したファイル**:
  - `src/App.jsx`:
    - 台選び（`currentMode === "select"`）の描画を `SelectDashboard` → `StrategyMapDashboard` に変更（戦略マップは無改変、`onBack` は `home` へ）。旧 `strategy` 値で永続化された状態も同じ画面へフォールバック。
    - 差玉解析を独立タブにせず、新モード `delta`（`DeltaAnalyzer`）/ `deltaMap`（`DeltaMapView`）として追加。ホームの「解析する」から起動。
    - 旧 `SelectDashboard` 内にあった「編集対象店舗の解決・島データ（`getStoreIslands`）・スキャン保存（`pt_deltaScans`）」ロジックを App.jsx 側へ移設（`deltaActiveStore` / `deltaIslands` / `handleSaveDeltaScan`）。
    - `SelectDashboard` の import を削除（**ファイル自体は温存・未使用**）。旧 select の `onStart`（台選びからの実戦開始）インライン処理は撤去（machines は元々空でセッション開始導線は中央FAB／記録モードへ集約）。
  - `src/components/home/HomeDashboard.jsx`:
    - 仕様のホーム要素を追加（既存セクションは削除せず温存）。本日のサマリーの直下に挿入：
      - **今日の狙い**（戦略サマリー4指標：推定期待値／予測回転率／候補台数／確信度 ＋ 本日のTOP3 ＋「戦略マップを開く」ボタン）。データは `buildStrategyMap`（仮データ・将来 P-EVIDENCE/差玉解析連携予定）。TOP3・ボタンのタップで台選び（戦略マップ）へ。
      - **差玉解析ステータス**（最終解析／解析済み台数／状態 ＋「解析する」＋「保存した解析をマップで見る」）。`pt_deltaScans` から導出。
    - 横スクロールは使わず TOP3 は 3 列グリッド（片手・iPhone 16 Pro 幅優先）。
  - `src/components/Tabs.jsx`（`SettingsTab`）:
    - データ管理に **島マップ管理** 項目を追加。旧 `SelectDashboard` 内のホールマップ編集（`HallMapEditor`）を設定のサブビューへ移設（常時編集可能・初回セットアップ扱いにしない）。島データは `pt_hallMaps`（`s.hallMaps`/`s.setHallMaps`）に一元保存。
    - `IconGrid`（島マップ用アイコン）を追加。
    - **既存の pre-existing lint error 1件を解消**：機種検索結果の未使用変数 `isConfirmingDelete`（assigned but never used）を削除。※ HEAD 時点から存在した dead code で lint ゲートを塞いでいたため、最小限の除去のみ実施（挙動不変）。
- **データフロー**: 差玉画像追加 → 差玉解析（`delta`）→ `pt_deltaScans` 保存 →（将来）期待値計算 → 戦略マップ更新。現状の戦略マップ表示値は `strategyMapData.js` の仮データ（将来連携予定）。
- **操作ステップへの影響**: 台選びタブを開く＝戦略マップが即表示（CTA経由の1タップが不要に）。差玉解析・島マップ編集は導線が台選び→ホーム/設定へ移動（タップ数は同等）。
- **logic.js / 計算式**: **未変更**（`src/logic.js`・`evDecision.js` ともに diff なし）。`node src/__tests__/protected-fns.mjs` 出力が `baseline.json` と完全一致。`evDecision.test.mjs` 5/5 PASS。
- **package.json**: 変更なし。
- **lint / build**: `npm run lint` = 0 error（既存 warning 1件のみ：App.jsx の useEffect deps、無関連）。`npm run build` = 成功。
- **保留・備考**: `SelectDashboard.jsx` / `selectSelectors.js` 等は未使用化したがファイルは温存（将来の P-EVIDENCE 実データ化で再利用余地あり）。戦略マップの表示値は仮データのままで、実データ連携は Phase 5（P-EVIDENCE 移植）後。

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
