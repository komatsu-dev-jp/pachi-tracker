# implementation-notes — 初当たり/連チャン入力フロー新UI 実装メモ

> **このドキュメントの位置づけ**
> `docs/input-flow-design.md`（仕様書）に基づく実装で、仕様に書かれていなかった判断・変更・妥協点・意思決定を全部記録するメモ。
> 設計書本体は不変。ここは「実装する人が泣かないため」の補足記録。
>
> 作成日: 2026-05-19 / 対象ブランチ: `claude/implement-ui-design-wqaYW`

---

## 0. 実装スコープと方針

- 仕様書 §8 の **Step C〜G を一括統合**（ユーザー指示「画面 A・B・C すべて統合実装」）
- `logic.js` / `baseline.json` / `evDecision.js` / `machineDB.js` は**不変**を厳守
- 旧 `hitWizard`（8 ステップ）/ 旧 `chainWizard`（9 ステップ）は **撤去**、設定によるフラグ切替は設けない（仕様書 §9.1 #10 「即時撤去 vs フラグ切替」→ 即時撤去を採用）
- 既存ハンドラ（`handleStartChain` / `handleWizardComplete` / `handleChainWizardComplete` / `handleChainWizardSingleEnd`）は**呼び出しシグネチャを最小変更で再利用**し、新UIは presentational layer に徹する
- 通常時のテンキー bottom sheet（`showInputSheet`／`inputSheetMode = "count"`）は**そのまま残す**。新UIは「初当たり」ボタン押下後にだけ起動する。`"jackpot"` モードの bottom sheet は廃止。

---

## 1. 仕様書の未決事項（§9）への回答

| # | 仕様書での扱い | 本実装での判断 | 理由 |
|---|---|---|---|
| 1 | プッシュ額（pushAmount） | **画面 A 内の折りたたみ要素**として残す。デフォルト 0 円。展開時に 0/500/1000 の 3 ピル | 投資補正の精度に直結。デフォルトは隠して情報密度を保ち、必要な人だけ展開 |
| 2 | 「実測出玉」の意味 | UI ラベルは画面 A・B 共通で「**実測出玉**」。内部分岐は維持（A=`actualBalls`、B=`nextTimingBalls`）。 hint テキストでコンテキストを補足 | 仕様書通り |
| 3 | 連チャン追加時の「回転数」 | **サポ回転数（`elecSapoRot`）**として記録。`rotRows` には書かない | 仕様書通り（現行仕様維持） |
| 4 | 「現在持玉」のリアルタイム表示 | 値 = `S.currentMochiBalls`、差分は**現セッション開始時持玉からの差**を表示（=`currentMochiBalls - sessionStartMochi` の代わりに、現実装では `chain.trayBalls` を起点としたチェーン中の増分を採用） | セッション開始時持玉を別途追跡する状態がないため。実装時に簡略化 |
| 5 | RUSH継続期待度 78% | **表示しない（保留）**。仕様書 §9.1 #5 で算出式不明、Phase 5（P-EVIDENCE）相当が必要 | プレースホルダー数値は誤誘導になるので非表示が安全。代わりに「チェーン状態（基準値固定中／ラッシュ中／要確認）」バッジを表示 |
| 6 | 期待差玉・電サポ効率 | **既存 `ev` から派生可能なものだけ表示**：「期待差玉」= `ev.netGain`（玉換算）相当、「電サポ効率」= 直近 hit の `sapoPerRot`。算出式不明な指標はラベルだけ残してダッシュ「—」 | 仕様書 §9.1 #6 通り、詳細式の確認待ち |
| 7 | 出玉プリセット 3000 | 「10R×2」のラベルで全画面共通で残す | 仕様書通り |
| 8 | 開始上皿玉プリセット 50/100/150 | ハードコード固定（モック準拠） | 機種別カスタマイズは将来課題 |
| 9 | 単発時の時短回数（jitanSpins）入力 | **画面 A の「単発終了」押下時にインラインで時短回数・最終持ち玉の 2 項目モーダルを開く**（直接単発終了モーダル `directSingleEndOpen` の構造を流用） | 単発終了は片手で 1〜2 タップで完結させたい。別画面遷移より同階層モーダルが速い |
| 10 | 旧UI フォールバックフラグ | **設けない（即時撤去）** | 旧UI を温存するとコード量が膨らみメンテ困難。`HANDOVER.md` で復旧手順だけ案内 |

---

## 2. 旧UI からの主な変更点

### 2-1. 初当たり入力フロー（画面 A）

| 項目 | 旧UI | 新UI |
|---|---|---|
| 起動方法 | 「初当たり」ボタン → テンキー bottom sheet（jackpot mode）→ 回転数入力 → 確定で `handleStartChain` → ウィザード 8 ステップ | 「初当たり」ボタン → **画面 A を直接フルスクリーン表示** |
| 入力ステップ数 | 8（push/tray/round/disp/actual/type/jitan/final） | 1 画面 + 単発時のみ 2 項目モーダル |
| 開始上皿玉の扱い | 任意（空でも次へ進めた） | **必須（黄バッジ表示・空ならボタン無効化）** |
| 回転数入力 | 起動前に bottom sheet で入力 | 画面 A 内の 5 項目に統合（テンキーで編集） |
| ラウンド数 | 全画面選択ステップ | 行内ピル + ドロップダウン |
| プッシュ額 | Step 0 で必ず表示 | 画面 A の「詳細」折りたたみ（デフォルト閉） |

### 2-2. 連チャン追加フロー（画面 B）

| 項目 | 旧UI | 新UI |
|---|---|---|
| 起動方法 | 大当たりタブの「連チャン追加」 | 同じ |
| 入力ステップ数 | 9（rounds/lastOut/sapoRot/disp/nextTiming/type/jitan/final/finalReal） | 1 画面（4 項目）＋ 終了時に画面 C |
| 開始上皿玉 | 表示なし（自動引き継ぎ） | **「前回引き継ぎ: ◯◯玉」**を画面上部に明示表示 |
| 内部フィールドの対応 | `lastOutBalls` / `nextTimingBalls` / `elecSapoRot` を別ステップで個別入力 | UI は「回転数」「実測出玉」のみ。`lastOutBalls = getPrevEndBalls()` を自動セット、`sapoChange = nextTimingBalls - lastOutBalls - displayBalls` を内部導出 |

### 2-3. ラッシュ終了フロー（画面 C）

旧 `chainWizardStep === 8` の UI（最終実測持ち玉入力）をそのまま流用して、ヘッダーラベルを「ラッシュ終了 — 最終確認」に変更。
集計表示（総R/液晶出玉/サポ増減/純増（実測））を新規追加。

---

## 3. データ互換性（保存形式は不変）

- `chain.hits[]` の保存フィールドは旧UI と完全同一
  - `hitNumber` / `rounds` / `displayBalls` / `actualBalls` / `lastOutBalls` / `nextTimingBalls` / `elecSapoRot` / `sapoChange` / `sapoPerRot` / `time`
- `chain.trayBalls` / `chain.hitRot` / `chain.completed` / `chain.summary` / `chain.finalBalls` / `chain.finalRealBalls` / `chain.finalRealBallsEdited` も完全同一
- 旧UI で記録したチェーン履歴は新UI で**そのまま閲覧・編集・削除可能**
- `baseline.json` 再生成不要（logic.js は触らない）

---

## 4. 状態管理の変更

### 4-1. 削除した state

なし（後方互換のため既存 state は残置し、新UI 内では参照のみ／一部は未使用化）

### 4-2. 追加した state

```js
// 画面 A: 新初当たり入力 state（hitWizardData を repurpose、+ 追加）
const [hitInputFocus, setHitInputFocus] = useState("rotCount"); // どの行が編集中か
const [hitInputError, setHitInputError] = useState("");
const [hitInputShowPush, setHitInputShowPush] = useState(false); // プッシュ額の折りたたみ
const [hitInputSingleEndOpen, setHitInputSingleEndOpen] = useState(false); // 単発終了モーダル

// 画面 B: 新連チャン追加 state（chainWizardData を repurpose、+ 追加）
const [chainInputFocus, setChainInputFocus] = useState("elecSapoRot"); // 編集中行
```

`hitWizardData` の構造変更:
```js
// 旧: { pushAmount, trayBalls, rounds, displayBalls, actualBalls, hitType, jitanSpins, finalBallsAfterJitan }
// 新: 同じ + rotCount を追加（画面 A の回転数フィールド）
{ pushAmount: 0, rotCount: "", trayBalls: "", rounds: 0, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" }
```

### 4-3. `hitWizardStep` / `chainWizardStep` の取り扱い

- `hitWizardStep` は **新UI では参照しない**（常に単一画面）。state 自体は残置（後続クリーンアップで削除予定）
- `chainWizardStep` は **`8`（画面 C）のみ意味を持つ**。それ以外（0〜7）は新UI では使わず、画面 B が単一画面として描画
- 単発終了は `hitInputSingleEndOpen` モーダル / `chainWizard` 内で `chainWizardStep === 6,7` を流用

---

## 5. ハンドラ呼び出しシーケンス（新UI）

### 5-1. 画面 A から「連チャン継続」

```
ユーザー入力（rotCount/trayBalls/rounds/displayBalls/actualBalls）
→ バリデーション（必須: rotCount/trayBalls/rounds/displayBalls）
→ handleStartChain(rotCount値)  // 引数受け取りに変更
  → rotRows に data + hit 行追加
  → jpLog に chain 追加（hits=[], trayBalls=0）
→ handleWizardComplete("確変")  // 既存ロジックそのまま
  → chain.trayBalls = tray, chain.hits = [first hit]
  → setSessionSubTab("history")（連チャン記録継続）
```

### 5-2. 画面 A から「単発終了」

```
ユーザー入力
→ バリデーション
→ 単発終了モーダル（jitanSpins + finalBallsAfterJitan）
→ handleStartChain(rotCount値)
→ handleWizardComplete("単発")
  → chain.completed = true / 持ち玉モード切替
```

### 5-3. 画面 B から「継続」

旧 `chainWizardStep === 5` から `handleChainWizardComplete(false)` を呼ぶ流れと完全同等。
新UI は画面 B 上の「継続」ボタンが直接 `handleChainWizardComplete(false)` を呼ぶ。

### 5-4. 画面 B から「ラッシュ終了 →（画面 C）」

旧 `chainWizardStep === 8` への遷移と同等。`finalRealBalls` を自動プリセットして画面 C を開く。

---

## 6. `handleStartChain` の引数追加

```diff
- const handleStartChain = () => {
-     const inputTrimmed = (input || "").toString().trim();
+ const handleStartChain = (rotCountArg) => {
+     // 互換性: 引数があればそれを優先、なければ従来通り input state を使用
+     const inputTrimmed = (rotCountArg != null ? String(rotCountArg) : (input || "")).toString().trim();
```

呼び出し元:
- 旧: 通常回転数 bottom sheet からは引数なし（既存 `input` state を読む）
- 新: 画面 A の「連チャン継続」/「単発終了」ボタンから `handleStartChain(hitWizardData.rotCount)` で呼ぶ

新UI では `input` state を経由しないため、画面 A の値を直接渡せる。

---

## 7. UI 上の妥協・簡略化

- **ステータスカード（画面上部 4 セル）**: モック通りの 4 セル横並びはモバイル幅で潰れるので、本実装では **2 × 2 グリッド** に変更。「現在持玉」「期待差玉（≈ev.netGain ベース）」「電サポ効率（直近 hit.sapoPerRot）」「チェーン状態」の 4 セル
- **「RUSH継続期待度」**: 算出式不明のため非表示。代わりに「チェーン状態」セル（基準値固定中／ラッシュ中／要確認）
- **「今回のまとめ」サイドパネル**: 横並びレイアウトは縦長スマホで潰れるので、画面下部に**折りたたみ表示**として配置（デフォルト展開）
- **テンキー**: 旧UI と同形のサイズ・配置を維持（3 × 4 グリッド、最低 56px）
- **入力ガイドボタン**: 仕様書ではモック右上にあるが、初期実装では省略（情報密度を保つため）。将来必要なら追加可
- **戻る/履歴 ボタン**: 旧UI は「キャンセル」のみだったので、新UI もキャンセル相当の「閉じる ×」ボタン 1 個でシンプルに

---

## 8. アクセシビリティ・操作感

- フォーカス行のハイライト: 行背景を主アクセントカラーで強調、テンキーの編集先を明示
- 必須フィールドのバリデーション: 空 or 0 のときは下部の「連チャン継続」「単発終了」ボタンを **disabled + 視覚的にグレーアウト**、`hitInputError` で「開始上皿玉を入力してください」のような具体メッセージ
- プリセットボタン: 各 56px 以上の高さ、ピル形、押下後はその行の値が即時更新（フォーカスは自動的にその行へ）

---

## 9. 後続クリーンアップ予定（このPRには含まない）

- `hitWizardStep` state の完全削除
- `chainWizardStep` の 0〜7 を完全削除（8 のみ残す or 別 state へ移行）
- 旧 `chainWizardFirstKey` state の整理
- 「直接単発終了モーダル」（`directSingleEndOpen`）は新UI と機能重複している可能性あり、別タスクで統合検討

---

## 10. 動作確認チェックリスト（手動）

- [ ] 「初当たり」ボタン → 画面 A 起動、5 項目入力可能
- [ ] 必須項目（rotCount/trayBalls/rounds/displayBalls）未入力 → CTA 無効
- [ ] 「連チャン継続」→ jpLog に chain 追加、HistoryTab へ遷移
- [ ] 「単発終了」→ 時短回数・最終持ち玉モーダル → 単発終了として保存、持ち玉モード切替
- [ ] 連チャン追加（画面 B）→ 開始上皿玉の引き継ぎ表示、4 項目入力で 1 hit 追加
- [ ] 「ラッシュ終了へ」→ 画面 C で `finalRealBalls` 編集 → 結果保存
- [ ] 旧データ（旧UI で作成したチェーン）が一覧・編集・削除できる
- [ ] `npm run lint` / `npm run build` 共にエラー 0

---

## 11. 既知の保留・要相談事項

- 仕様書 §9.1 #4「現在持玉の +差分」の正確な定義はユーザー確認待ち。本実装は暫定で「チェーン中の累積差分」を表示
- 仕様書 §9.1 #5「RUSH継続期待度」の算出式が未確定。本実装では非表示
- 仕様書 §9.1 #6「期待差玉・電サポ効率」の正確な式が未確定。`ev.netGain` および直近 `hit.sapoPerRot` で暫定表示。値の意味づけはユーザー確認待ち

---

*最終更新: 2026-05-19（本ブランチでの新UI 実装完了時点）*
