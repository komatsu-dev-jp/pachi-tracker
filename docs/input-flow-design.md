# 初当たり入力フロー設計（input-flow-design.md）

> **このドキュメントの位置づけ**
> パチトラッカーの初当たり/連チャン入力フロー改修に着手する前の、実装前設計図。
> このドキュメント自体はコードを変更しない。実装は別セッションで段階的に行う。
>
> 作成日: 2026-05-19 / 対象ブランチ: `claude/create-input-flow-design-vtV30`
> 同じ粒度感の参考: `docs/decision-ui-design.md`

---

## 1. 背景と目的

### 1.1 改修の動機

現在の初当たり入力ウィザード（`hitWizard`、Tabs.jsx 525-1415, 3380-3625行）は 8 ステップに分割された縦進行のフォームで、
各ステップが 1 項目ずつのフルスクリーン表示になっている。

これは「片手・短時間・騒音」という現場制約に対して、

- 1 項目ずつ全画面占有 → 全体像が見えず、入力漏れに気付きにくい
- 「単発」「ラッシュ継続」の判断が Step 5 まで進まないと選べない
- 連チャン追加ウィザード（`chainWizard`、Tabs.jsx 582-3966行）は別経路で Step 9 まで分岐し、初当たりとの一貫性が低い
- **開始上皿玉が任意扱い**で、ユーザーが空のまま進めると上皿補正（`logic.js:144-148`）が効かず EV/K が過大評価される

という課題を抱えている。

GPT 提案の新 UI（添付モック）は、

1. **必要な 5 項目を 1 画面に並列表示**してから次状態を選ぶ
2. **開始上皿玉数を「必須」として明示**（黄色バッジ）
3. **連チャン追加時は前回終了時の持玉から自動引き継ぎ**して入力ステップを削減
4. **出玉プリセット（450/750/1500/3000）**で頻出パターンを 1 タップ入力
5. **「今回の獲得（実測）」をリアルタイム計算表示**（実測出玉 − 開始上皿）

という改善で、操作ステップを大幅に削減する。

### 1.2 ゴール

- 初当たり 1 件あたりの入力タップ数を現行 8 ステップ → 5 項目並列＋次状態 1 タップに圧縮
- 開始上皿玉の入力漏れをゼロにする（必須化＋プリセット）
- 連チャン追加時は開始上皿玉を自動引き継ぎし、ユーザー入力項目を 4 項目に削減
- `logic.js` / `baseline.json` / `evDecision.js` は**不変**で実現する

### 1.3 設計目標（CLAUDE.md 準拠）

- 操作ステップを 1 つでも減らす
- タップ領域 44px 以上（理想 48px 以上）
- 視認性 > 美しさ。ダークテーマ・高コントラスト・大きな数字
- 装飾的な要素は追加しない
- 忙しい人が **3 秒で理解できる**

---

## 2. 現状の実装

### 2.1 既存の入力フロー概要

#### A. 初当たり入力（`hitWizard` 系）

トリガー: 実戦タブの「初当たり」ボタン → テンキー bottom sheet（`inputSheetMode = "jackpot"`）→
回転数を入力 → `handleStartChain`（Tabs.jsx:1257-1314）でバリデーション → `hitWizardOpen=true`

ウィザード Step 構造（Tabs.jsx:3406-3543）:

| Step | 入力項目 | 必須 | 備考 |
|---|---|---|---|
| 0 | 直近のプッシュ額（0/500/1000円） | 任意 | `pushAmount`、選択額が `rotRows` に追加される（投資補正） |
| 1 | 開始上皿玉（trayBalls） | **任意（事実上）** | 空のままでも次へ進める |
| 2 | ラウンド数選択（roundDist 由来） | 必須 | `rounds` |
| 3 | 液晶出玉（displayBalls） | 必須 | |
| 4 | 実玉数（actualBalls） | 任意 | 実測できるとき |
| 5 | 単発 / ラッシュ選択 | 必須 | `hitType` |
| 6 | 時短回数（jitanSpins） | 単発のみ | |
| 7 | 最終持ち玉（finalBallsAfterJitan） | 単発のみ | 推定値プリセット可 |

完了処理: `handleWizardComplete`（Tabs.jsx:1319-1415）が `S.setJpLog` で `chain.hits` に 1 件追加。
単発なら `chain.completed=true` でクローズ、ラッシュ（確変）なら `HistoryTab` へ遷移。

#### B. 連チャン追加入力（`chainWizard` 系）

トリガー: 大当たりタブ（履歴）の「連チャン追加」ボタン → `chainWizardOpen=true`

ウィザード Step 構造（Tabs.jsx:3742-3912）:

| Step | 入力項目 | 必須 | 備考 |
|---|---|---|---|
| 0 | ラウンド数（rushDist 由来 + 倍率 mult） | 必須 | `rounds` / `mult` |
| 1 | 大当り直前の出玉（lastOutBalls） | 必須 | 前回終了時 `nextTimingBalls` 自動プリセット |
| 2 | 電サポ回転数（elecSapoRot） | 必須 | |
| 3 | 液晶出玉（displayBalls） | 必須 | |
| 4 | ラウンド終了時の出玉（nextTimingBalls） | 必須 | サポ増減を自動計算表示 |
| 5 | 継続 / 単発終了 / ラッシュ終了の 3 択 | 必須 | |
| 6 | 時短回数（単発終了時） | 単発のみ | |
| 7 | 時短終了後出玉（単発終了時） | 単発のみ | |
| 8 | 最終実測持ち玉（ラッシュ終了時） | ラッシュ終了時 | サブステップ3 で追加（PR #159） |

完了処理: `handleChainWizardComplete`（Tabs.jsx:664-728）が `chain.hits` に 1 件追加し、
チェーン完了時は `chain.summary` を計算、`finalRealBalls` を保存。

### 2.2 関連ファイル一覧

| パス | 役割 |
|---|---|
| `src/components/Tabs.jsx` | 入力フロー本体。`hitWizard*` と `chainWizard*` の state・ハンドラ・JSX が全て同居 |
| `src/components/Atoms.jsx` | 再利用プリミティブ（`Card`, `MiniStat`, `Btn`, `FlowStatusCard`, `FlowValueCard`, `FlowChoiceButton`） |
| `src/logic.js` | 計算心臓部。`calcPreciseEV` に `correctedKCount` / `start1KCorrected` / `ev1KCorrected` / `bDiffCorrected` あり |
| `src/components/decision/evDecision.js` | 判断ロジック。`effectiveEV1K / bDiffCorrected / start1KCorrected` を参照 |
| `src/machineDB.js` | 機種マスタ。`roundDist`（初当たり用）, `rushDist`（確変用）, `displayToReal` |
| `src/__tests__/baseline.json` | 完全一致テスト基準値 |
| `src/__tests__/protected-fns.mjs` | 保護関数ハーネス |

### 2.3 既存の状態管理パターン

`Tabs.jsx` 内に局所 state として保持（`S` 経由で App.jsx 永続値は使用しない）:

```js
// 初当たり
const [hitWizardOpen, setHitWizardOpen] = useState(false);
const [hitWizardStep, setHitWizardStep] = useState(0);
const [hitWizardData, setHitWizardData] = useState({
    pushAmount: 0,
    trayBalls: "", rounds: 0, displayBalls: "", actualBalls: "",
    hitType: "", jitanSpins: "", finalBallsAfterJitan: ""
});

// 連チャン
const [chainWizardOpen, setChainWizardOpen] = useState(false);
const [chainWizardStep, setChainWizardStep] = useState(0);
const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true);
const [chainWizardData, setChainWizardData] = useState({
    rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "",
    nextTimingBalls: "", elecSapoRot: "",
    hitType: "", jitanSpins: "", finalBallsAfterJitan: "", finalRealBalls: ""
});
const [chainWizardInitialFinalBalls, setChainWizardInitialFinalBalls] = useState(0);
```

完了時に `S.setJpLog`（永続）+ `S.setRotRows`（永続）+ `S.setTotalTrayBalls`（永続）+ `S.pushLog`（sesLog 永続）を呼ぶ。

---

## 3. 新フロー仕様

### 3.1 画面構成

新フローは 3 つの画面で構成する。Step を縦進行で切り替える既存方式から、
**1 画面 5 項目（または 4 項目）並列＋下部の状態選択ボタン** に変更する。

#### 画面 A: 初当たり入力画面（モック準拠）

役割: 初当たり 1 件目の記録 + 次状態（連チャン継続 / 単発終了）の選択。

レイアウト概要（上から下）:

1. **上部ステータスカード**: 現在持玉 / 期待差玉 / 電サポ効率 / RUSH継続期待度（既存 `ev` 値から派生）
2. **タイトル**: 「初当たり入力」+ サブ「各項目を入力して、次の状態を選択してください」
3. **入力 5 項目（縦並びカード形式）**:
   - 回転数（ゲーム数）
   - 開始上皿玉数（**必須バッジ付き**）
   - ラウンド数
   - 液晶出玉
   - 実測出玉
4. **次の状態を選択**:
   - 連チャン継続（緑、大型ボタン）
   - 単発終了（赤、大型ボタン）
   - 「今回の獲得（実測）」= 実測出玉 − 開始上皿、リアルタイム表示
5. **よく使う出玉プリセット**: 450 / 750 / 1500 / 3000 玉（フォーカス中の数値カードに反映）
6. **テンキー**: 1〜9 / 消去 / 0 / バックスペース
7. **今回のまとめ**（右下）: 開始上皿玉 / 液晶出玉 / 実測出玉 / 獲得（実測） / RUSH継続回数

#### 画面 B: 連チャン追加画面

役割: 既存チェーンに新しい当たりを 1 件追加。

画面 A から **開始上皿玉数を除いた** 形（4 項目）。開始上皿玉は前回終了時の持玉から自動セットされ、
追加画面では入力欄が表示されない（または「前回引き継ぎ: ◯◯玉」と読み取り専用バッジで表示）。

入力 4 項目:

- 回転数（このチェーン開始時からの増分回転 = サポ回転）
- ラウンド数
- 液晶出玉
- 実測出玉（任意）

次の状態:

- 連チャン継続（緑）
- ラッシュ終了へ（橙）→ 画面 C へ

#### 画面 C: ラッシュ終了 / 集計画面

役割: チェーン完了時の最終実測持ち玉入力と、チェーン全体の集計表示。

入力 1 項目:

- 最終実測持ち玉（`finalRealBalls`、サブステップ3 で導入済）
  - 計算値（trayBalls + ΣdisplayBalls + ΣsapoChange）を自動プリセット
  - ユーザー編集可、編集フラグ `finalRealBallsEdited` を保存

集計表示:

- 総R数 / 液晶出玉合計 / 総サポ回転 / サポ増減 / 純増（実測）

### 3.2 入力項目定義

| 項目名 | 必須/任意 | 初当たり画面 | 連チャン追加画面 | ラッシュ終了画面 | データ型 | デフォルト値 |
|---|---|---|---|---|---|---|
| 回転数（ゲーム数 / cumRot 差分） | 必須 | ✅ | ✅（サポ回転として記録） | — | number | "" |
| 開始上皿玉数（trayBalls） | 必須 | ✅ | 自動引き継ぎ（非表示） | — | number | 前回 finalRealBalls |
| ラウンド数（rounds） | 必須 | ✅ | ✅ | — | number | 3 |
| 液晶出玉（displayBalls） | 必須 | ✅ | ✅ | — | number | "" |
| 実測出玉（actualBalls / nextTimingBalls） | 任意 | ✅ | ✅ | — | number | "" |
| 次の状態（hitType） | 必須 | 連チャン継続 / 単発終了 | 継続 / ラッシュ終了 | — | string | "" |
| プッシュ額（pushAmount） | 任意 | 別Step or 折りたたみ | — | — | number | 0 |
| 最終実測持ち玉（finalRealBalls） | ラッシュ終了時必須 | — | — | ✅ | number | 自動計算値 |
| 時短回数（jitanSpins） | 単発時のみ | 単発選択時に表示 | 単発終了時に表示 | — | number | "" |

> **注**: 現行 `chainWizard` の `lastOutBalls` / `nextTimingBalls` / `elecSapoRot` の 3 項目分割は、
> モック新 UI では「回転数」「実測出玉」に集約する。サポ増減（`sapoChange`）は内部計算（`actualBalls − trayBalls − displayBalls`）で導出する。
> ただし `chain.hits[].lastOutBalls / nextTimingBalls / elecSapoRot` のフィールド自体は保存データ構造に保持して logic.js 互換を維持する（9. 未決事項 参照）。

### 3.3 状態遷移図

```
┌────────────────────────────────────┐
│  記録モード（実戦タブ）             │
│  ┌─────────────────────────────┐    │
│  │ 回転数入力ボタン群           │    │
│  │  [入力] [初当たり]           │    │
│  └─────────────────────────────┘    │
└────────────────────────────────────┘
              │
              ▼ 「初当たり」押下
┌────────────────────────────────────┐
│ 画面 A: 初当たり入力                │
│  - 5 項目並列入力                   │
│  - [連チャン継続] / [単発終了]      │
└────────────────────────────────────┘
        │                  │
        │ 連チャン継続      │ 単発終了
        ▼                  ▼
┌──────────────────┐   ┌──────────────────┐
│ 画面 B: 連チャン  │   │ 画面 C: ラッシュ │
│       追加        │   │     終了/集計    │
│ - 4 項目          │   │ - 最終実測入力   │
│ - [継続]/[終了へ] │   │ - 集計表示       │
└──────────────────┘   └──────────────────┘
        │      │              │
   継続  │      │ ラッシュ終了 │ 結果を保存
        ▼      └──────────────▶
   画面 B 再表示                ▼
                          記録モードに戻る
                          （持ち玉モード切替）
```

### 3.4 開始上皿玉の引き継ぎロジック

| シーン | trayBalls の決定方法 |
|---|---|
| 初当たり入力時 | ユーザー入力（必須）。プリセット 50 / 100 / 150 玉 |
| 連チャン追加時 | **前回終了時の持玉から自動セット**（読み取り専用） |
| ラッシュ終了後の次セッション初当たり | 持ち玉モードからのスタート時は別経路。本フローでは扱わない |

#### 連チャン追加時の自動引き継ぎ計算式

現行 `getPrevEndBalls()`（Tabs.jsx:609-617）が同等のロジックを実装済み:

```js
// 前回終了時の持ち玉 = 開始上皿玉 + Σ(displayBalls + sapoChange)
const prevEndBalls =
    (lastChain.trayBalls || 0)
  + lastChain.hits.reduce(
      (s, h) => s + (Number(h.displayBalls) || 0) + (Number(h.sapoChange) || 0),
      0
    );
```

新 UI では:

- このロジックは **そのまま流用**
- 画面 B では `trayBalls` 入力欄を表示せず、内部的に「前回からの引き継ぎ値」として扱う
- 表示には「前回引き継ぎ: ◯◯玉」のラベルを画面上部に小さく出す（ユーザーに引き継ぎを認識させる）

> **重要**: chain オブジェクトの `trayBalls` フィールドは、**1 チェーンの初当たり時のみ設定** される（既存仕様）。
> 連チャン追加で新しい trayBalls を上書きしない点に注意（既存 `handleChainWizardComplete` も上書きしていない）。

---

## 4. データモデル

### 4.1 1 チェーンの内部データ構造（既存）

```json
{
  "chainId": 1716000000000,
  "trayBalls": 100,
  "hitRot": 245,
  "hitThisRot": 245,
  "hits": [
    {
      "hitNumber": 1,
      "rounds": 3,
      "displayBalls": 450,
      "actualBalls": 380,
      "lastOutBalls": 0,
      "nextTimingBalls": 0,
      "elecSapoRot": 0,
      "sapoChange": 0,
      "sapoPerRot": 0,
      "time": "12:34:56"
    },
    {
      "hitNumber": 2,
      "rounds": 10,
      "displayBalls": 1500,
      "lastOutBalls": 380,
      "nextTimingBalls": 1850,
      "elecSapoRot": 25,
      "sapoChange": -30,
      "sapoPerRot": -1.2,
      "time": "12:38:00"
    }
  ],
  "completed": false,
  "finalBalls": null,
  "finalRealBalls": undefined,
  "finalRealBallsEdited": undefined,
  "summary": null,
  "time": "12:34:56"
}
```

完了時に `chain.completed = true` + `chain.summary` が確定:

```json
"summary": {
  "totalRounds": 13,
  "totalDisplayBalls": 1950,
  "totalSapoRot": 25,
  "totalSapoChange": -30,
  "avg1R": 150,
  "sapoDelta": -30,
  "sapoPerRot": -1.2,
  "netGain": 1920
}
```

### 4.2 新 UI と既存フィールドのマッピング

| 新 UI 入力欄 | 保存先フィールド | 備考 |
|---|---|---|
| 回転数（ゲーム数） | `chain.hitRot` / `chain.hitThisRot`（初当たり時）or `hit.elecSapoRot`（連チャン時） | 初当たりは `rotRows` の `hit` 行 cumRot にも反映 |
| 開始上皿玉数 | `chain.trayBalls` | 初当たり時のみ設定 |
| ラウンド数 | `hit.rounds` | |
| 液晶出玉 | `hit.displayBalls` | |
| 実測出玉 | `hit.actualBalls`（初当たり）or `hit.nextTimingBalls`（連チャン） | 連チャン時はサポ増減導出に使用 |
| 連チャン継続 | `chain.hits` 追加 + `chain.completed = false` のまま | |
| 単発終了 | `chain.completed = true` + `chain.hitType = "単発"` + `chain.summary` 計算 | |
| ラッシュ終了 → 画面 C へ | `chain.hitType = "確変"` 経由で画面 C 遷移 | |
| 最終実測持ち玉（画面 C） | `chain.finalRealBalls` / `chain.finalRealBallsEdited` | 既存（PR #159） |

### 4.3 `correctedKCount` / `start1KCorrected` との接続点

`calcPreciseEV`（`logic.js:144-164`）の上皿補正は以下のロジックで動く（**変更しない**）:

```js
const jpTrayBalls = (jpLog || []).reduce((sum, chain) => sum + (Number(chain?.trayBalls) || 0), 0);
const trayCorrection = jpTrayBalls > 0 ? jpTrayBalls : (Number(totalTrayBalls) || 0);
const trayBallsYen = trayCorrection * (1000 / (rentBalls || 250));
// ...
const correctedInvestYen = Math.max(blendedInvest - trayBallsYen, 0);
const correctedKCount = correctedInvestYen / 1000;
const start1KCorrected = correctedKCount > 0 ? netRot / correctedKCount : 0;
```

→ **`chain.trayBalls` が正しく入力されることが、補正後 EV/K の精度を担保する。**
新 UI で開始上皿玉を **必須化** することで、補正の有効性が向上する。

`logic.js` 側の変更は一切不要。

---

## 5. P-EVIDENCE / evDecision.js との接続

### 5.1 evDecision.js の引数マッピング（変更なし）

`evDecision`（`src/components/decision/evDecision.js:28-34`）は `ev` オブジェクト全体を受け取り、

```js
const evAdj = safeEv.effectiveEV1K ?? safeEv.ev1KCorrected ?? safeEv.ev1K ?? 0;
const bDiff = safeEv.effectiveBDiff ?? safeEv.bDiffCorrected ?? safeEv.bDiff ?? 0;
```

を判断軸として使用する。
**新 UI が `chain.trayBalls` を確実に保存することで、`correctedKCount` の分母が正確になり、
`ev1KCorrected` / `bDiffCorrected` が現実値に近づく**。これにより判断精度が間接的に向上する。

### 5.2 リアルタイム判定更新のトリガー

入力フロー中の各タップ操作は以下のフローで判定を更新する:

```
ユーザー入力 → setRotRows / setJpLog（既存）
            → App.jsx 再レンダリング
            → calcPreciseEV 再実行
            → ev 更新
            → DecisionTab (VerdictBadge) 即時切替
```

`useEffect` 不要・購読不要。既存の React 再描画フローに乗る（`docs/decision-ui-design.md` §6.2 と同じ）。

ただし新 UI では「画面 A の上部ステータスカード」も `ev` から派生表示するため、
**ウィザード起動中に背景の `ev` 計算が正しく追従する**ことを実装時に確認する。

### 5.3 Step 2（start1KCorrected 連携）との関係

上皿補正 Step 2b（PR #153）で `evDecision` は補正後の値を使用するよう更新済み。
新フローの主目的「開始上皿玉の必須化」は、Step 2 の前提条件である **`chain.trayBalls` の精度** を担保する役割を果たす。

数値的影響:

- 開始上皿玉が空（=0）→ trayCorrection が 0 になり、補正が無効化 → `ev1KCorrected ≈ ev1K`
- 開始上皿玉が正確（例 100 玉）→ trayBallsYen が現金換算され、`correctedKCount < cashKCount` → `start1KCorrected > start1K` → `ev1KCorrected > ev1K`

新 UI 移行後は後者がデフォルトになる。

---

## 6. UIコンポーネント設計

### 6.1 既存コンポーネントの再利用箇所

| 既存 | 利用先 |
|---|---|
| `FlowStatusCard`（Atoms.jsx） | 画面 A・B 上部のステータスカード |
| `FlowValueCard`（Atoms.jsx） | 5 項目の数値カード（各行） |
| `FlowChoiceButton`（Atoms.jsx） | 「連チャン継続 / 単発終了 / ラッシュ終了へ」の選択ボタン |
| `Btn`（Atoms.jsx） | テンキー個別ボタン |
| `chainPrototypeVerdict`（Tabs.jsx:333） | 画面 B 上部のチェーン判定バッジ |
| `getMachineRounds` / `getMachineRushRounds`（Tabs.jsx:535-565） | ラウンドプリセット候補生成 |
| `getPrevEndBalls`（Tabs.jsx:609-617） | 連チャン追加時の trayBalls 引き継ぎ |

### 6.2 新規コンポーネント案（実装は別タスク）

> 命名は仮。実装時に再検討する。

| コンポーネント名 | 責務 |
|---|---|
| `HitInputScreen` | 画面 A の親コンテナ。5 項目の state を保持し、`handleStartChain` + `handleWizardComplete` を統合 |
| `ChainAddScreen` | 画面 B の親コンテナ。trayBalls を読み取り専用化、4 項目入力 |
| `RushEndScreen` | 画面 C の親コンテナ。最終実測持ち玉入力＋集計 |
| `InputFieldRow` | 1 項目を 1 行で表示（ラベル / 値 / 単位 / プリセット 3 個） |
| `RequiredBadge` | 黄色「必須」バッジ |
| `OutputPresetBar` | 共通の「よく使う出玉プリセット」バー（450/750/1500/3000） |
| `LiveSummaryCard` | 画面右下の「今回のまとめ」カード（リアルタイム集計） |
| `ContinuityChoice` | 「連チャン継続 / 単発終了 / ラッシュ終了へ」の 3 ボタン群 |

実装時、まずは Tabs.jsx 内に大きな JSX ブロックとして実装し、安定後に上記コンポーネントへ抽出する段取りでも可。

### 6.3 プリセットボタンの管理方法

#### A. ラウンド数プリセット

- 機種マスタの `roundDist` / `rushDist` から動的生成（既存 `getMachineRounds` / `getMachineRushRounds` 再利用）
- モックでは「3R / 5R / 10R」を表示しているが、機種により可変
- 表示数の上限は 3 個（横並び）、4 個以上ある場合はドロップダウン化

#### B. 開始上皿玉プリセット（50 / 100 / 150）

- ハードコード（最頻値）
- 将来的にユーザー設定で増減可能にする案（未決）

#### C. 出玉プリセット（450 / 750 / 1500 / 3000）

- ハードコード（モック準拠）
- 「3R平均」「5R平均」「10R平均」「10R×2」などの説明ラベル付き
- フォーカス中の数値フィールド（液晶出玉 or 実測出玉）に反映
- 将来的に機種スペック `spec1R × rounds` から動的生成する案（未決）

---

## 7. 影響範囲

### 7.1 変更が必要な既存ファイル

| ファイル | 変更内容 | 影響度 |
|---|---|---|
| `src/components/Tabs.jsx` | hitWizard / chainWizard の UI を新フローに刷新。state・ハンドラは大幅見直し | 大 |
| `src/components/Atoms.jsx` | 新規コンポーネント追加の可能性（既存は不変） | 小 |

### 7.2 保護対象ファイル（**変更禁止**）

| ファイル | 変更有無 | 根拠 |
|---|---|---|
| `src/logic.js` | **変更しない** | 計算心臓部。`trayBalls` の流入経路が UI 層変更のみで完結 |
| `src/__tests__/baseline.json` | **変更しない** | 既存値不変。新プロパティ追加もなし |
| `src/__tests__/protected-fns.mjs` | **変更しない** | logic.js 不変ゆえ |
| `src/components/decision/evDecision.js` | **変更しない** | 入力構造（ev）不変 |
| `src/machineDB.js` | **変更しない** | スキーマ（`roundDist`, `rushDist`, `displayToReal`）流用 |

### 7.3 既存テストへの影響

- `protected-fns.mjs` → 影響なし（logic.js 不変）
- `evDecision.test.mjs` → 影響なし
- `hunterRank.test.mjs` / `badges.test.mjs` / `selectSelectors.test.mjs` → 影響なし
- 手動 UI テスト → 全面的に必要（記録 → 履歴 → 削除 → セッションリセットの一連動作）

---

## 8. 実装ステップ案

各ステップ完了時に `npm run lint && npm run build` がエラーゼロで通ること。

### Step A: 設計ドキュメント作成

- 本ドキュメントを作成（**本タスクで完了**）
- 不明点を §9 に記載

### Step B: 開始上皿玉の必須化（最小変更で先行投入）

**目的**: 既存ウィザード UI を維持したまま、Step 1（開始上皿玉）を必須化してバリデーションを追加。

**変更点**:

- `hitWizardStep === 1` の「次へ」ボタン押下時に `trayBalls === ""` または `Number(trayBalls) <= 0` で警告
- ガイダンス文言を「ここで実測の基準を取ります（**必須**）」に変更
- プリセット 50 / 100 / 150 ボタンを追加

**変更ファイル**: `src/components/Tabs.jsx` のみ。

**完了条件**: 既存フロー UI のまま、空入力で次へ進めなくなる。`logic.js` 不変。

> 本ステップは新 UI を待たずに先行投入可能。ユーザー方針により Step C と分離するか判断。

### Step C: 新 UI プロトタイプ（Codex 担当推奨、見た目優先）

**目的**: モック準拠の 1 画面 5 項目 UI を作成。計算ロジック接続なしの見た目だけ。

**作成**:

- 画面 A の HTML/JSX 骨組み（プレースホルダー値）
- ステータスカード / 5 項目カード / プリセット / テンキー / まとめカード
- スタイル整合（既存ダークネイビー配色準拠）

**変更ファイル**: `src/components/Tabs.jsx`（または別ファイルで分離試作）

**完了条件**: 見た目がモックに近い。データ書き込みは行わない。

### Step D: 新 UI への state 接続（本実装、Claude Code 担当）

**目的**: 画面 A から既存の `setRotRows` / `setJpLog` / `setTotalTrayBalls` 等への接続を実装し、
旧 `hitWizard` を新 UI に置き換える。

**作業内容**:

- `handleStartChain` / `handleWizardComplete` のロジックを新 state 構造（5 項目同時保持）に合わせて再実装
- 単発 / ラッシュ分岐を「次の状態を選択」ボタンから直接駆動
- バリデーション統合（必須項目: 開始上皿玉 / ラウンド数 / 液晶出玉）
- 既存「直近のプッシュ額」は別 Step として残すか、画面 A の折りたたみ要素に統合（未決）

**完了条件**: 初当たり → 単発終了 / ラッシュ継続 → 持ち玉モード復帰 が一気通貫で動く。`baseline.json` 再生成不要。

### Step E: 連チャン追加画面（画面 B）の刷新

**目的**: `chainWizard` を画面 B（4 項目並列＋次状態）に置き換える。

**作業内容**:

- 開始上皿玉の自動引き継ぎ表示（読み取り専用）
- `lastOutBalls` / `nextTimingBalls` / `elecSapoRot` の 3 項目分割を「回転数 + 実測出玉」に集約し、内部で `sapoChange` を導出
- 「継続 / ラッシュ終了へ」の 2 択ボタン

**完了条件**: 連チャン追加が新 UI で完結。`chain.hits[]` の保存形式は既存と同一。

### Step F: ラッシュ終了画面（画面 C）の整理

**目的**: 既存サブステップ3（最終実測持ち玉入力）を画面 C として明示化。

**作業内容**:

- 既存 `chainWizardStep === 8` の UI を画面 C として独立
- チェーン全体集計の見やすい表示（既存 `chain.summary` から派生）

**完了条件**: ラッシュ終了時の最終実測入力が独立画面として認識できる。

### Step G: 旧ウィザードの撤去とリグレッションテスト

**目的**: 旧 `hitWizard` / `chainWizard` の JSX ブロックを削除。

**作業内容**:

- 旧 Step 0〜8 の JSX 削除
- 関連 state（`hitWizardStep`, `chainWizardStep`, `chainWizardFirstKey` 等）の整理
- 手動 UI テスト一式
- `protected-fns.mjs` / `evDecision.test.mjs` 実行で計算回帰チェック

**完了条件**: 旧 UI 痕跡ゼロ。新 UI のみで全フロー成立。

---

## 9. 未決事項・要確認事項

### 9.1 仕様の曖昧点

| # | 項目 | 検討メモ |
|---|---|---|
| 1 | プッシュ額入力（pushAmount）の扱い | 新 UI 画面 A に統合するか、別 Step に残すか。投資補正の精度に直結 |
| 2 | 「実測出玉」の意味の統一 | 初当たり時は `actualBalls`（任意）、連チャン時は `nextTimingBalls`（必須）。新 UI で同じラベルにすると混乱するため、内部分岐は維持しつつラベル一本化するか要確認 |
| 3 | 連チャン追加時の「回転数」の解釈 | サポ回転（`elecSapoRot`）として記録するか、累積 cumRot として `rotRows` に書くか。現行は前者。新 UI でも前者を維持予定 |
| 4 | 「現在持玉」のリアルタイム計算式 | モックの上部カード「現在持玉 13,450玉 +1,250玉」の +差分は何を指すか。直近 hit 差分 or セッション開始からの差分 |
| 5 | 「RUSH継続期待度 78%」の算出式 | モック表記の根拠不明。既存 ev に該当値なし。Phase 5（P-EVIDENCE）相当の指標か、別途定義が必要 |
| 6 | 「期待差玉 +2,150玉」「電サポ効率 +0.42/回」の出典 | 既存 ev から派生可能。詳細式の確認が必要 |
| 7 | 出玉プリセット 3000 玉の用途 | 「10R×2」のラベル。連チャンの倍率乗算時用か |
| 8 | 開始上皿玉プリセット 50/100/150 を機種別に変える必要 | 機種マスタに `trayPreset` フィールド追加するか、固定値で十分か |
| 9 | 単発時の時短回数（jitanSpins）入力タイミング | 画面 A で「単発終了」を押した直後にモーダル表示するか、別 Step として残すか |
| 10 | 旧 hitWizard / chainWizard の即時撤去 vs フラグ切替 | 既存ユーザーの体験継続のため、設定で旧 UI に戻せる遷移期間を設けるか |

### 9.2 HANDOVER.md との整合性

- 大当たり後フロー サブステップ4・5（`finalRealBalls` 集計分岐）は PR #188 で完了済み → 本フロー設計と整合
- サブステップ6〜8 は保留中。本フロー実装時にサブステップ6 の方針再確認が必要
- 上皿補正の過大増幅問題（保留タスク1）は本フローで `trayBalls` 入力精度が上がると緩和方向だが、根本解決は別タスク（Phase 5 P-EVIDENCE 移植冒頭）

### 9.3 後続タスクで判断する項目

- 新 UI のデフォルト適用 / 旧 UI フォールバックフラグの設置（設定画面）
- 画面 A・B の上部ステータスカードの正確な数値定義
- 出玉プリセットの動的化（機種別）
- アクセシビリティ（色覚多様性対応、スクリーンリーダー）

---

## 10. 参考資料

### 10.1 関連既存ドキュメント

- `docs/HANDOVER.md` — プロジェクト全体状態（特に §2-5 大当たり後フロー再設計、§6 保留タスク2）
- `docs/decision-ui-design.md` — 判断ファーストUI 設計書（同粒度のテンプレート）
- `docs/roadmap-hunter-ux.md` — 狩猟型UX進化ロードマップ（Phase 5 P-EVIDENCE 連携）
- `docs/roadmap-mockup-impl.md` — モックアップ完全再現ロードマップ
- `CLAUDE.md` — プロジェクト規約（特に「UI開発フェーズの分離」「設計原則」）

### 10.2 元になった GPT 提案 UI の要約

添付モック（画面 A 相当）の主要素:

- 画面上部: RUSH中バッジ + 連数バッジ + 戻る/履歴ボタン
- ステータスカード（横 4 列）:
  - 現在持玉 13,450玉（+1,250玉、緑）
  - 期待差玉 +2,150玉（黄）、回転率 23.4G/千円
  - 電サポ効率 +0.42/回（緑）、前回比 +0.05/回
  - RUSH継続期待度 78%（黄）、転落確率 1/114.5
- 中央: 「初当たり入力」タイトル + サブテキスト + 「入力ガイド」ボタン
- 5 項目入力（縦 5 行、各行に大きな数値表示 + プリセット 3 個）
- 次の状態選択（連チャン継続 / 単発終了）+ 獲得（実測）+280玉
- 出玉プリセット（450/750/1500/3000）
- テンキー（9 マス）+ 消去 + 0 + バックスペース
- 右下「今回のまとめ」: 開始上皿玉 / 液晶出玉 / 実測出玉 / 獲得（実測）/ RUSH継続回数
- 下部メッセージ: 「入力はいつでも編集できます」「データは自動保存されます」

### 10.3 重要ファイル参照（実装時の参照先）

- `src/components/Tabs.jsx` 525-533行（hitWizardData state）
- `src/components/Tabs.jsx` 582-589行（chainWizardData state）
- `src/components/Tabs.jsx` 609-617行（getPrevEndBalls：trayBalls 引き継ぎ）
- `src/components/Tabs.jsx` 1257-1314行（handleStartChain：初当たり開始）
- `src/components/Tabs.jsx` 1319-1415行（handleWizardComplete：初当たり完了）
- `src/components/Tabs.jsx` 664-728行（handleChainWizardComplete：連チャン追加完了）
- `src/components/Tabs.jsx` 3380-3625行（hitWizard JSX）
- `src/components/Tabs.jsx` 3725-3966行（chainWizard JSX）
- `src/logic.js` 76-265行（calcPreciseEV：trayBalls の補正経路）
- `src/components/decision/evDecision.js` 28-34行（判断ロジックの参照値）
