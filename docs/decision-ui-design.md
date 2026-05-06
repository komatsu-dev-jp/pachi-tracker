# 判断ファーストUI 設計書

> **このドキュメントの位置づけ**
> パチトラッカーに新UI「判断ファーストUI」を追加するための、実装前の設計図。
> このドキュメント自体はコードを変更しない。実装は別セッションで段階的に行う。
>
> 作成日: 2026-05-06 / 対象ブランチ: `claude/design-decision-ui-9bFzU`

---

## 1. 背景と目的

### 1.1 現状の課題

現在のメイン画面 `RotTab`（`src/components/Tabs.jsx` 376-3561行）は、回転数入力エリア・実測統計パネル・データ行テーブル・各種ウィザードを 1 画面に詰め込んだ「数値羅列型」のUIである。

ユーザーはパチンコ店内で、騒音・片手操作・時間プレッシャーの中でこの画面を見ながら「**今すぐ続けるか、ヤメるか**」を判断する必要がある。
だが、画面に出てくる EV/K・ボーダー差・仕事量・時給を頭の中で重ね合わせて結論を導くのは、忙しい人にとって認知負荷が高い。

例え話: 今のUIは「血液検査の数値が一覧で並ぶ健康診断結果」。新UIは「健康診断結果を見た医者が一言『運動を続けてください』『今日はもう休みましょう』と告げる診断書」。

### 1.2 設計目標（CLAUDE.md 12-17行 より）

- 操作ステップを 1 つでも減らす
- タップ領域 48px 以上
- 視認性 > 美しさ。ダークテーマ・高コントラスト・大きな数字
- 装飾的な要素は追加しない
- 忙しい人が **3 秒で理解できる** ことが基準

### 1.3 ゴール

画面最上部に「**続行 / 様子見 / ヤメ**」の大型バッジ＋信頼度を出し、回転数を入力するとリアルタイムで判断が切り替わるサブタブ「判断」を追加する。
既存の RotTab は廃止せず残し、ユーザーが新UIに慣れた段階で旧UIを置き換える計画とする。

---

## 2. ファイル構成

### 2.1 新規作成（`src/components/decision/` 配下）

| パス | 責務 | 種別 |
|---|---|---|
| `src/components/decision/evDecision.js` | 純粋関数。`ev` を受け取り `{ verdict, confidence, reasons }` を返す。判断ロジック＋信頼度計算を内包。 | 純粋（React 非依存） |
| `src/components/decision/DecisionTab.jsx` | コンテナ。`S` と `ev` を受け取り、子コンポーネントへ props 配布 | React コンポーネント |
| `src/components/decision/VerdictBadge.jsx` | 「続行/様子見/ヤメ」の大型バッジ＋色 | 表示専用 |
| `src/components/decision/ConfidenceBar.jsx` | 信頼度を 0〜100% で帯表示 | 表示専用 |
| `src/components/decision/KeyMetrics.jsx` | EV/K, ボーダー差, 1Kスタート, 仕事量を 4 個のミニカードで | 表示専用（`Atoms.jsx` の `MiniStat` 利用） |
| `src/components/decision/ReasonList.jsx` | 「ボーダー差 +2.3 → 続行寄り」など、判断理由の箇条書き | 表示専用 |

任意（Step 4 以降）:
- `src/components/decision/__tests__/evDecision.test.mjs` — 既存 `src/__tests__/protected-fns.mjs` と同じスタイルで `node` 直接実行可能なスナップショットテスト

例え話: `evDecision.js` は「胸部レントゲン読影アルゴリズム」（純粋・テスト容易）、`DecisionTab.jsx` は「読影結果を病室モニタに表示する画面ドライバ」。役割を分けることで、判断式を後で差し替えても画面側を触らずに済む。

### 2.2 既存ファイルへの最小変更

CLAUDE.md「既存のコンポーネント分割には理由がある」「リファクタは動作軽量化／バグ修正に直結する場合のみ」を遵守し、変更は**追加のみ**で**書き換えゼロ**とする。

#### A. `src/App.jsx` — 1 行追加

5 行目（既存 `import { RotTab, SettingsTab, CalendarTab } from "./components/Tabs";`）の**直下**に追加:

```js
import { DecisionTab } from "./components/decision/DecisionTab";
```

これだけ。`tab === "rot"` の RotTab レンダリング（行 474）も S オブジェクト構築（行 309-352）も一切変更しない。
理由: DecisionTab はトップタブではなく RotTab 内部のサブタブとして登場するので、App.jsx の `<main>` 分岐に追加する必要がない。

#### B. `src/components/Tabs.jsx` — 計 5〜10 行の追加（書き換えなし）

| 場所 | 変更内容 | 行数 |
|---|---|---|
| 1249 行 | `sessionSubTabs` 配列に `"decision"` を 1 要素追加 | 1 行修正 |
| 1250 行 | `sessionSubTabLabels` 辞書に `decision: "判断"` を追加 | 1 行修正 |
| 1643-1655 行付近 | タブアイコン定義に `decision` 用 SVG を 1 個追加 | 5 行追加 |
| 1685 行付近（既存の `S.sessionSubTab === "data"` 分岐と並列） | `{S.sessionSubTab === "decision" && <DecisionTab S={S} ev={ev} />}` を追加 | 3 行追加 |

RotTab の本体ロジック（入力エリア、ウィザード、データ行テーブル、機種設定タブ等）は**1 行も触らない**。

例え話: 既存のショッピングモールに新しいテナントを 1 つ追加するだけ。建物の構造（柱や配管）には触らない。

---

## 3. コンポーネント設計

### 3.1 親子ツリー

```
RotTab (Tabs.jsx 既存・不変)
└─ S.sessionSubTab === "decision" のとき
   └─ DecisionTab (新規)
      ├─ VerdictBadge       … 続行/様子見/ヤメ の大型バッジ
      ├─ ConfidenceBar      … 信頼度 0〜100%
      ├─ KeyMetrics         … EV/K, ボーダー差, 1Kスタート, 仕事量
      └─ ReasonList         … 判断理由の箇条書き（最大 4 項目）
```

### 3.2 props 設計

#### `DecisionTab`

```jsx
<DecisionTab S={S} ev={ev} />
```

内部処理:
```jsx
const decision = evDecision(ev);
// decision = { verdict, confidence, confidenceParts, reasons, evAdjusted }
```

`S` は将来「判断 → 大当たり記録に飛ぶ」ボタンなど連携が要る場合に備えて受け取るが、Step 1〜3 では未使用でも可。

#### `VerdictBadge`

```jsx
<VerdictBadge verdict="continue_strong" />
```

- `verdict`: `"continue_strong" | "continue" | "hold" | "stop"` の 4 種
- 内部マッピング:
  - `continue_strong` → 緑＋「続行」＋サブラベル「全ツッパ」
  - `continue` → 緑＋「続行」＋サブラベル「打ち続ける」
  - `hold` → 黄＋「様子見」
  - `stop` → 赤＋「ヤメ」
- 大型サイズ: 高さ 80〜96px、フォント 24px 以上、アイコン 32px 以上
- CLAUDE.md「タップ領域 48px 以上」を充足

#### `ConfidenceBar`

```jsx
<ConfidenceBar value={0.62} subValues={{ rot: 0.8, jp: 0.4 }} />
```

- `value`: 0〜1 の総合信頼度
- 50% 未満は薄い色、50〜70% 標準、70% 以上強調
- `subValues` は内訳（折りたたみ詳細用、Step 3 では非表示でも可）

#### `KeyMetrics`

```jsx
<KeyMetrics ev={ev} />
```

- 4 個の `MiniStat`（既存 `Atoms.jsx` 111-127 行）を横並び
- 表示項目: EV/K, ボーダー差, 1Kスタート, 仕事量
- 既存 RotTab 1611-1626 行と同じデータソースを参照
- 色分けは既存ヘルパー（`sc(ev.bDiff)` 等）を流用

#### `ReasonList`

```jsx
<ReasonList reasons={[
  { ok: true,  text: "ボーダー差 +2.3（基準 +2.0 超え）" },
  { ok: true,  text: "EV/K +420円（基準 +300超え）" },
  { ok: false, text: "信頼度 38%（基準 50% 未満）" },
]} />
```

- 緑チェック / 赤バツの行リスト
- なぜその判断になったかの「説明責任」を果たす
- 最大 4 項目、それ以上は折りたたみ

### 3.3 モックアップ要素 vs コンポーネント対応表

| モックアップの要素 | 担当コンポーネント |
|---|---|
| 画面最上部の「続行 / 様子見 / ヤメ」バッジ | `VerdictBadge` |
| バッジ右の信頼度数値（％） | `VerdictBadge` 内 or `ConfidenceBar` |
| 信頼度の帯グラフ | `ConfidenceBar` |
| 数値カード（EV/K, ボーダー差等） | `KeyMetrics` |
| 「なぜこの判断？」の理由説明 | `ReasonList` |
| 全体レイアウト | `DecisionTab` |

---

## 4. 判断ロジック設計

### 4.1 配置: なぜ `logic.js` ではなく `evDecision.js` か

**結論: 別ファイル `src/components/decision/evDecision.js` に隔離する。**

CLAUDE.md 該当箇所（22-32行）の解釈:

- 「`logic.js` は心臓部、計算誤りは金銭損失に直結」
- 「変更前後の計算結果を境界値で比較して提示すること」
- 「`deriveFromRows / calcCash / calcMochi / calcPreciseEV` は既に検証済み」

判断関数は **logic.js の純粋計算結果（ev）を「翻訳」する後段処理** であり、計算式そのものではない。
logic.js の保護関数を含む `src/__tests__/protected-fns.mjs` のスナップショット対象に追加すべきかどうか判断が必要になり、保護対象が膨張する。
**判断しきい値は今後ユーザーフィードバックで微調整される頻度が高い**ため、`logic.js`（変更禁忌）に置くと改修フローが重くなる。

例え話: `logic.js` は「金庫の中の現金そのもの」、`evDecision.js` は「現金残高を見て『今日は外食しない方がいい』と助言するアプリ」。混ぜるべきではない。

### 4.2 関数シグネチャ

```js
// src/components/decision/evDecision.js

/**
 * EV と統計から判断を返す。
 * 純粋関数。React/DOM/localStorage 依存ゼロ。
 *
 * @param {object} ev - calcPreciseEV の戻り値
 * @param {object} opts - { riskAdjusted: boolean } 将来切替用、初期は false
 * @returns {{
 *   verdict: "continue_strong" | "continue" | "hold" | "stop",
 *   confidence: number,                // 0..1 総合信頼度
 *   confidenceParts: { rot: number, jp: number },
 *   reasons: Array<{ ok: boolean, text: string }>,
 *   evAdjusted: number,                // リスク調整後 EV/K（初期は ev1K と同値）
 * }}
 */
export function evDecision(ev, opts = {}) { ... }
```

### 4.3 判断アルゴリズム（モックアップ準拠）

```js
const conf = calcConfidence(ev);          // { rot, jp, total }
const evAdj = ev.ev1K;                    // 初期実装: そのまま使用（案C 採用）
const bDiff = ev.bDiff;

let verdict;
if (evAdj > 300 && conf.total > 0.5 && bDiff > 2.0) verdict = "continue_strong";
else if (evAdj > 100 && conf.total > 0.4 && bDiff > 0.5) verdict = "continue";
else if (evAdj >= -50 && evAdj <= 100 && conf.total > 0.3) verdict = "hold";
else if (evAdj < -50 || bDiff < -1.0) verdict = "stop";
else verdict = "hold";  // 中間帯のフォールバック
```

### 4.4 「リスク調整後EV」の定義（案C 採用・初期実装）

ユーザー確認済み: **`evAdj = ev.ev1K`（リスク調整なし、案C）**

理由:
- シンプルで誤判断が読みやすい
- 信頼度は別軸で `ConfidenceBar` に表示するため、判断式に混ぜなくても情報は伝わる
- 案A（乗算割引）は conf=0.3 のとき +1000 円/K の優良台が +300 に潰れて見逃すリスクがある
- 案B（加算ペナルティ -200×(1-conf)）は定数 200 の根拠が経験則のみ

将来のため `opts.riskAdjusted` 引数だけ予約し、後日 P-evidence ベイズ推論への差し替え時に `evAdj` 算出ロジックを切り替えられるようにしておく。

### 4.5 中間帯フォールバック

判断式の if-else が全て外れた場合（例: `evAdj=200, conf=0.2, bDiff=0.3` のような信頼度低の中間帯）は、**`"hold"` にフォールバック**する。

理由: ユーザーは「ヤメ」だと損失感、「続行」だと過剰リスクを感じる。「様子見」が最もリスク中立。

---

## 5. 信頼度計算設計

### 5.1 配置: なぜ `calcPreciseEV` を変更しないか

**結論: `evDecision.js` 内の private 関数 `calcConfidence(ev)` として実装。`calcPreciseEV` は変更しない。**

理由:
- `calcPreciseEV`（`src/logic.js` 76-237行）は `src/__tests__/protected-fns.mjs` のスナップショット対象。返り値オブジェクトに 1 フィールド足すだけでもスナップショット差分が発生し、「保護関数の変更扱い」になる。CLAUDE.md は「変更前後を境界値比較して提示」を要求している。これを毎回満たすのは過剰なコスト。
- 信頼度は判断 UI 専用の派生値。EV/K や仕事量と違い、`CalendarTab` 等の他画面では参照されない。心臓部に格納する必要がない。

例え話: 心電図の生波形を変えてはいけないが、それを見て「不整脈リスク 60%」と算出するのは別装置の仕事。

### 5.2 信頼度式（モックアップ準拠の仮実装）

```js
function calcConfidence(ev) {
  const rotConf = Math.min((ev.netRot || 0) / 1500, 1.0);
  const jpConf  = Math.min((ev.jpCount || 0) / 5, 1.0);
  return {
    rot: rotConf,
    jp: jpConf,
    total: rotConf * 0.7 + jpConf * 0.3,
  };
}
```

**要相談（後回し可）**: 重み 0.7/0.3 と分母 1500/5 はモックアップ仮値そのまま採用。実機データ蓄積後に調整想定。
将来 P-evidence ベイズ推論に差し替える際は、この関数の中身だけを置き換えれば呼び出し側に影響しない。

---

## 6. データフロー

### 6.1 全体図

```
rotRows (App.jsx state, useLS "pt_rotRows")
  │
  ├─ App.jsx 行 140-146:  calcPreciseEV({ rotRows, jpLog, ...settings })
  │                         ↓
  │                       ev: { ev1K, bDiff, start1K, jpCount, netRot, workAmount, ... }
  │
  └─ ev は S オブジェクト（行 309-352）に格納されて子へ流れる
       │
       ├─ <RotTab S={S} ev={ev} />  ← App.jsx 行 474（既存・不変）
       │     │
       │     └─ S.sessionSubTab === "decision" のとき:
       │          <DecisionTab S={S} ev={ev} />  ← Tabs.jsx 1685行付近に追加
       │              │
       │              ├─ const decision = evDecision(ev)
       │              ├─ <VerdictBadge verdict={decision.verdict} />
       │              ├─ <ConfidenceBar value={decision.confidence} />
       │              ├─ <KeyMetrics ev={ev} />
       │              └─ <ReasonList reasons={decision.reasons} />
```

### 6.2 リアルタイム更新の仕組み

入力（テンキーで回転数追加）→ `setRotRows` → App.jsx 再レンダリング → `calcPreciseEV` 再計算 → 新しい `ev` が `DecisionTab` に流れる → `evDecision` 再評価 → `VerdictBadge` の色・文言が即座に変化。

**追加の `useEffect` も購読も不要。React の通常の再描画フローでそのまま動く。** `ev` は App.jsx で毎レンダリング時に `calcPreciseEV` を呼ぶ素朴な実装（メモ化なし）になっており、入力ごとに自動で再計算される。

### 6.3 タブナビへの統合

`Tabs.jsx` 1249-1250 行を:

```js
// 変更前
const sessionSubTabs = ["data", "rot", "history", "settings"];
const sessionSubTabLabels = { data: "データ", rot: "回転入力", history: "大当たり", settings: "機種設定" };

// 変更後
const sessionSubTabs = ["data", "rot", "decision", "history", "settings"];
const sessionSubTabLabels = { data: "データ", rot: "回転入力", decision: "判断", history: "大当たり", settings: "機種設定" };
```

レンダリング分岐（既存 1685 行付近に並列で）:

```jsx
{S.sessionSubTab === "decision" && (
  <DecisionTab S={S} ev={ev} />
)}
```

### 6.4 スワイプUIへの影響

Tabs.jsx 1296-1298 行の `currentIndex / isAtStart / isAtEnd` 判定は **配列長** で動的計算されるため、配列に 1 要素足しても**コード変更不要**。閾値 `50px`（1313 行）は固定値で、配列長に依存しない。

ただし、5 タブ化により中央寄りに配置される `decision` タブが操作の最頻入口になる可能性がある。
**初期表示位置（`useState("rot")` がデフォルト）を `"decision"` に変えるかは Step 4 以降の課題**。当面は `"rot"` のまま。

---

## 7. 段階的実装プラン（次セッション以降）

各ステップで `npm run lint && npm run build` がエラーゼロで通ることを必須条件とする（CLAUDE.md「実行ルール → ビルド検証（必須）」）。

### Step 1: 判断ロジックの単体実装＆検証（UI なし）

**作成**:
- `src/components/decision/evDecision.js`（純粋関数）
- 任意: `src/components/decision/__tests__/evDecision.test.mjs`（`node` 直接実行可能）

**検証**:
- 境界値ケース 5 個程度を `console.log(JSON.stringify(...))` で出力（既存 `src/__tests__/protected-fns.mjs` と同じスタイル）
  - `ev = {}` 全ゼロ → `verdict: "stop"` 期待
  - `{ev1K:400, conf=0.8, bDiff:2.5}` → `continue_strong`
  - `{ev1K:200, conf=0.5, bDiff:1.0}` → `continue`
  - `{ev1K:50,  conf=0.4, bDiff:0.3}` → `hold`
  - `{ev1K:-100, conf=0.6, bDiff:-1.5}` → `stop`
- App.jsx / Tabs.jsx は**この時点では一切変更しない**

**完了条件**: `npm run lint` がファイル単独で通ること。

### Step 2: DecisionTab を空コンテナとして登録

**作成**:
- `src/components/decision/DecisionTab.jsx`（中身は仮: ev の生値を 1 つ表示するだけ）

**変更**:
- `src/App.jsx` 行 5 直下に `import { DecisionTab } ...` 追加
- `src/components/Tabs.jsx` 1249-1250 行: 配列とラベル辞書に `"decision"` を追加
- `src/components/Tabs.jsx` 1643-1655 行: タブアイコン定義に `decision` キー追加
- `src/components/Tabs.jsx` 1685 行付近: レンダリング分岐 1 ブロック追加

**完了条件**:
- `npm run lint && npm run build` 通過
- アプリを開きセッション開始 → タブバーに「判断」が増えている
- タブをタップ → ev の生値（例: `EV/K: 123`）が表示される
- 既存の data/rot/history/settings タブが従来どおり動く
- スワイプで判断タブにも遷移できる

### Step 3: 視覚要素の実装

**作成**:
- `src/components/decision/VerdictBadge.jsx`
- `src/components/decision/ConfidenceBar.jsx`
- `src/components/decision/KeyMetrics.jsx`
- `src/components/decision/ReasonList.jsx`

**変更**:
- `DecisionTab.jsx` 内で `evDecision(ev)` を呼び、4 子コンポーネントに props を流す

**完了条件**:
- 回転数入力するとバッジが切り替わる
- バッジ高さ ≥ 80px、文字サイズ ≥ 24px（CLAUDE.md「片手・3秒で理解」遵守）
- ダーク/ライトテーマ両方で視認性 OK
- 色覚多様性モード（`color-blind` クラス、`src/index.css`）で潰れない

### Step 4（任意）: デフォルトサブタブ切替実験

`App.jsx` 109 行 `useState("rot")` を `useState("decision")` に切り替えて A/B 確認。
**既存ユーザーの体験を壊さないよう、まずはデフォルトは rot のままにし、設定画面のフラグで切り替えられるようにするのが望ましい**（要相談）。

### Step 5（将来）: 旧 RotTab 廃止検討

ユーザーが「判断タブで十分」と判断したら、Tabs.jsx の rot タブを削除 or 非表示化。これは別 PR で。

---

## 8. リスクと注意点

### 8.1 既存機能への影響表

| 影響先 | リスク | 対応 |
|---|---|---|
| `RotTab` の他サブタブ（data/rot/history/settings） | スワイプ index 計算の自動追従に依存 | 手動スワイプテスト必須 |
| `App.jsx` の S オブジェクト | DecisionTab は `ev` / `S` を read のみ。書き込み無し | 影響なし |
| `calcPreciseEV` (`logic.js`) | 一切変更しない | 影響なし |
| `__tests__/protected-fns.mjs` | logic.js 不変ゆえスナップショット差分なし | テスト不要 |
| localStorage `pt_*` キー | 追加なし | 既存セッション壊さず安全 |
| Undo/Redo（`useUndoStack`） | DecisionTab は state を持たない | 影響なし |
| cold snapshot（`takeSnapshot`） | 既存 state のみ対象 | 影響なし |

### 8.2 残された要相談事項

| # | 項目 | 当面の方針 |
|---|---|---|
| 1 | 信頼度の重み（0.7/0.3）と分母（1500/5）はモックアップ仮値のまま採用するか | 仮値で実装、後日 P-evidence ベイズ推論に差し替え時に再検討 |
| 2 | デフォルトサブタブを将来 `"decision"` に切り替えるか | 当面 `"rot"` のまま、設定フラグで切替可能にするのが望ましい |
| 3 | 判断境界が「中間帯」（評価対象外領域）になった場合のフォールバック | `"hold"` に倒す（リスク中立） |
| 4 | 旧 RotTab を将来削除するタイミング | ユーザーフィードバック後の別 PR で判断 |

### 8.3 実装中に判断が必要になりそうな点

- **タブアイコンのデザイン**: モックアップに具体図がない。既存タブアイコン（Tabs.jsx 1643-1655 行付近）のスタイルに合わせて、信号機・チェック印・電球などから選ぶ → 実装時にユーザーに 2〜3 案提示
- **「全ツッパ」と「打ち続ける」のバッジ表示分け**: モックアップ凡例に区別あり。`continue_strong` と `continue` を 1 つの緑バッジで表示するか、サブラベルで分けるかは Step 3 でユーザー確認
- **ReasonList の表示形式**: モックアップに具体例なし。最大 4 項目・チェック/バツ・基準値併記の形式を初期案とし、実装時に微調整

---

## 9. CLAUDE.md 遵守チェックリスト

- [x] `logic.js` を変更しない（判断ロジック・信頼度ともに別ファイル）
- [x] `deriveFromRows / calcCash / calcMochi / calcPreciseEV` 不変 → スナップショットテスト変更不要
- [x] 既存コンポーネント分割を尊重（Tabs.jsx の RotTab 内部ロジックは触らない、サブタブ登録のみ）
- [x] localStorage 永続化を壊さない（追加キーなし）
- [x] 片手・3 秒判断（VerdictBadge は 80px 以上の大型・高コントラスト・日本語ラベル）
- [x] 装飾的要素を追加しない（既存 `Card / MiniStat / Btn` を再利用）
- [x] リファクタは「動作軽量化／バグ修正」の名目を持たない＝行わない（純粋追加のみ）
- [x] 日本語ラベルのみ（「続行 / 様子見 / ヤメ」「全ツッパ」「判断」）

---

## 付録A: 判断アルゴリズム擬似コード

モックアップ画像「判断ロジック（自動判定）」セクションをそのままコード化:

```
入力: ev (calcPreciseEV の戻り値)
出力: verdict ∈ { "continue_strong", "continue", "hold", "stop" }

conf_rot   = min(ev.netRot / 1500, 1.0)
conf_jp    = min(ev.jpCount / 5, 1.0)
conf_total = conf_rot * 0.7 + conf_jp * 0.3

evAdj = ev.ev1K            // 初期実装（案C・リスク調整なし）
bDiff = ev.bDiff

if evAdj > +300 AND conf_total > 0.5 AND bDiff > +2.0:
    verdict = "continue_strong"   # 全ツッパ
elif evAdj > +100 AND conf_total > 0.4 AND bDiff > +0.5:
    verdict = "continue"          # 打ち続ける
elif -50 <= evAdj <= +100 AND conf_total > 0.3:
    verdict = "hold"              # 保留・様子見
elif evAdj < -50 OR bDiff < -1.0:
    verdict = "stop"              # 即ヤメ・撤退
else:
    verdict = "hold"              # 中間帯フォールバック
```

---

## 付録B: Plan B（採用見送り案）

Tabs.jsx を完全凍結し、判断UIを**トップタブ**として追加する案も検討した。

```
App.jsx の tab state: "calendar" | "rot" | "decision" | "settings"  (4択)
ボトムナビ: 記録 / 新規稼働 / 判断 / 設定
```

**採用しない理由**:
- ボトムナビが 3 → 4 タブに増え、片手親指の届く範囲を超える
- セッション未開始（`!sessionStarted`）でも判断タブが見えるのは不自然（ev が全部ゼロになる）
- ユーザーの方針 2（「セッション内サブタブとして追加」）に合わない

---

## 付録C: 重要ファイル参照（実装時の参照先）

- `/home/user/pachi-tracker/src/logic.js` 76-237行（`calcPreciseEV`、心臓部・変更禁忌）
- `/home/user/pachi-tracker/src/App.jsx` 140-146行（ev 生成箇所）
- `/home/user/pachi-tracker/src/App.jsx` 309-352行（S オブジェクト、props 配布元）
- `/home/user/pachi-tracker/src/components/Tabs.jsx` 1249-1250行（sessionSubTabs 配列）
- `/home/user/pachi-tracker/src/components/Tabs.jsx` 1296-1298行（スワイプ境界判定）
- `/home/user/pachi-tracker/src/components/Tabs.jsx` 1611-1626行（既存 KeyMetrics 相当の表示）
- `/home/user/pachi-tracker/src/components/Atoms.jsx`（再利用プリミティブ: Card / MiniStat / Btn）
- `/home/user/pachi-tracker/src/__tests__/protected-fns.mjs`（保護対象テスト・今回は影響しないことを確認）
- `/home/user/pachi-tracker/src/index.css`（テーマ CSS 変数: --green / --yellow / --red 等）
- `/home/user/pachi-tracker/CLAUDE.md`（守るべきルール一覧）
