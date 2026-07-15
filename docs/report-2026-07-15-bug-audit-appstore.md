# バグ調査・App Store 対応レポート（2026-07-15）

作成: Claude Code（ブランチ `claude/app-bugs-app-store-q6fjeb`、コミット `1aaec53`）
宛先: Codex ほか開発担当者への引き継ぎ用

依頼内容:「アプリ全体でまだバグはあるか？ 今後 Apple Store で販売を前提として調査改善」

-----

## 1. 修正済みバグ（本ブランチでコミット済み）

### 1-1. 「今日」の日付判定が UTC 基準だった（最重要・全域）

- **症状**: `new Date().toISOString().slice(0,10)` は UTC の日付を返すため、
  日本時間の **深夜 0:00〜朝 9:00 の間、アプリ全体で「今日」が前日扱い** になっていた。
- **実害の例**: 閉店後の深夜に精算すると、実戦アーカイブが前日の日付でカレンダーに記録される。
  貯玉の日次リセット・連続稼働日数（ストリーク）・持越し持ち玉の検知も朝 9 時が日付境界になっていた。
- **影響箇所（計16箇所）**: 実戦アーカイブの記録日 / セッション開始日（持越し検知）/
  貯玉日次リセット / 連続稼働日数 / 貯玉入出金履歴の日付 / 差玉スキャンの既定日・90日保持期限 /
  バックアップ・CSV のファイル名
- **修正**: `src/constants.js` に `localDateStr()`（端末ローカルの YYYY-MM-DD）を追加し、
  `App.jsx`(6箇所)・`Tabs.jsx`(8箇所)・`HomeDashboard.jsx`・`DeltaAnalyzer.jsx`・
  `deltaSelectors.js`(makeScan / pruneScans、node テスト対応のためモジュール内ヘルパー `toLocalDay`) を置換。

### 1-2. ホーム画面「直近の記録」の回転率が別物の数値だった

- **症状**: `HomeDashboard.jsx` が回転率として `netRot / 1000`（総回転数÷1000）を表示。
  例: 総回転 3,000 回転 → 「3.0 /k」と表示される誤り。
- **修正**: `stats.effectiveStart1K`（上皿補正後、無ければ `start1K`）を表示。
  値が無い場合はダミー値「19.2 /k」ではなく「-- /k」を表示。

### 1-3. CSV ダウンロードが iOS Safari で失敗しうる

- **症状**: `downloadCSV` が `URL.revokeObjectURL` を即時実行しており、
  iOS Safari で保存が中断される恐れがあった（`backupAllData` 側は 1 秒遅延で実装済みと不整合）。
- **修正**: アンカーを body に追加してからクリック、revoke を 1 秒遅延に統一。

### 検証結果

- `npm run lint`: エラー 0
- `npm run build`: 成功
- `node src/__tests__/protected-fns.mjs` の出力が `baseline.json` と **完全一致**
- 全ユニットテスト **194 件 PASS**（コンポーネント 103 + evidence/settings 70 + ball-consumption 21）
- `src/logic.js`・`evDecision.js`・計算式・保存データ構造は **無変更**。操作ステップ数の変化なし。
  package.json 変更なし。console.log 等の残置なし。

-----

## 2. 報告のみ（未修正。対応にはユーザー判断が必要）

### 2-1. logic.js の持ち玉コスト式の疑義 【変更禁止対象のため報告のみ】

- `src/logic.js:168` の `mochiCostPerK = 1000 × exRate / rentBalls` は、
  等価交換（exRate = rentBalls = 250）では正しく 1000円/K になるが、
  非等価店（例: exRate=280、3.57円交換）では 1,120円/K となる。
- 玉の交換価値ベース（250玉 × 3.57円 ≒ 893円/K）とは**逆方向**にスケールしており、
  数学的には `1000 × rentBalls / exRate` が正しい可能性が高い。
- `App.jsx` の貯玉円換算（`chodamaYen`、2箇所）も logic.js と同じ規約に**意図的に揃えてある**ため、
  修正する場合は logic.js と App.jsx を境界値検証付きで同時に直すこと。
- **注意（Codex 向け）**: `src/logic.js` は CLAUDE.md により変更禁止。ユーザーの明示承認なしに触らないこと。

### 2-2. ホーム画面のダミーデータと実在ブランド 【App Store 審査リスク・最優先で対応推奨】

`src/components/home/HomeDashboard.jsx` に以下が残っている:

| 項目 | 内容 | リスク |
|---|---|---|
| `DEMO` 定数 | 収支 +48,500円、店舗「マルハン空港通店」等の架空値 | ガイドライン 2.3.1（不正確な機能表示） |
| `MaruhanMark` | **MARUHAN ロゴ風マーク**＋実在店舗名の表示 | ガイドライン 5.2.1（知的財産・商標）で**リジェクト対象になり得る** |
| `NextActionCard` | 「夕方帯の記録が不足しています」固定文言 | ダミー表示 |
| `JudgmentCard` | 良い判断 8 件 / 見直し候補 2 件（ハードコード） | ダミー表示 |
| `ActiveStoreCard` | 店舗分析度 78%・稼働記録 12 回・最終記録 7月8日 等（全てハードコード） | ダミー表示 |

- CLAUDE.md の「既存 UI を勝手に削除しない」規定に従い削除せず提案に留めた。
- **推奨対応**: 実データ連携（archives / stores からの導出）へ差し替えるか、
  データが無い場合はセクション自体を非表示にする。マルハンのロゴ・店名は必ず除去する。

### 2-3. App Store 販売に向けた構造的な準備事項

1. **ネイティブラッパー化**: 現状は PWA。App Store 配布には Capacitor 等が必要。
   その際 `vite.config.js` の `base: '/pachi-tracker/'` はネイティブでは `./` に変更が必要。
2. **レーティング**: パチンコ（賭博類縁）アプリは 17+（頻繁/極端なギャンブル）指定が必須。
3. **プライバシー**: AI 読み取り機能はユーザーの Anthropic API キーを端末保存し、
   画像を直接 API 送信する（キーのバックアップ除外は実装済みで良好）。
   プライバシーポリシーの整備と App Privacy 申告（審査時の説明）が必要。
4. **アクセシビリティ**: `index.html` の viewport `user-scalable=no` は監査で指摘されることがある。
5. **触覚フィードバック**: Vibration API は iOS 非対応。ラッパー化時に Capacitor Haptics へ差し替えを検討。

-----

## 3. Codex への作業依頼の目安（CLAUDE.md の役割分担に基づく）

- Codex が着手してよいもの: **2-2 のホーム画面ダミーデータの見た目差し替え**
  （実データ連携の配線は Claude Code 側で安全確認のうえ統合する。
  `logic.js`・`evDecision.js`・保存データ構造・`rotRows` フローには触らない）
- Codex が触ってはいけないもの: `src/logic.js` / `src/components/decision/evDecision.js` /
  計算式 / 既存の保存データ構造 / 2-1 の式（ユーザー判断待ち）

-----

## 4. 変更ファイル一覧（コミット `1aaec53`）

- `src/constants.js` — `localDateStr()` 追加
- `src/App.jsx` — 日付取得 6 箇所を置換
- `src/components/Tabs.jsx` — 日付取得 8 箇所を置換、`downloadCSV` の revoke 遅延化
- `src/components/home/HomeDashboard.jsx` — 回転率表示修正、日付比較をローカル化
- `src/components/delta/DeltaAnalyzer.jsx` — `todayStr()` をローカル日付化
- `src/components/delta/deltaSelectors.js` — `makeScan` 既定日・`pruneScans` 期限をローカル日付化
