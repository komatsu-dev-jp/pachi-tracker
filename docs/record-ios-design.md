# 記録モード iOS デザイン仕様書

最終更新: 2026-08-12（ブランチ `claude/pachi-ios-redesign-e9g11f`）

出典モック: `docs/design-review/pachi-ios-redesign.html`（Brief: `docs/design-review/DESIGN_BRIEF.md`）

この文書は **記録モード（フッター「記録開始」→ 稼働中画面）の見た目**を、
後から Codex / Claude Code が一貫して増改築できるようにするためのものです。
分析ページの `docs/analysis-ios-design.md` と同じ考え方・同じ運用にしています。

-----

## 1. スコープ

対象は **`.rec-ios` クラスの内側に描画されるもの全部**です。

| 場所 | 役割 | 対象 |
|---|---|---|
| `src/components/tabs/RotTab.jsx` の稼働中画面（`className="rec-ios"` のルート） | ヘッダー・サブタブ・記録タブ本体・下部CTA | ✅ |
| `src/components/decision/LiveDecisionNavigator.jsx` / `.css` | 判断カード（モックの `.verdict-card`） | ✅ |
| `src/components/decision/DecisionSummaryCard.jsx` | 判断に使う数字 / 判断の理由 | ✅ |
| `src/index.css` の `.rec-ios` ブロック | デザイントークン + 部品スタイル | ✅ |
| RotTab の稼働開始前（新規稼働）画面 | `.rec-ios` の外なので従来配色のまま | ❌ 対象外 |
| `ModeTabBar`（フッター5タブ・中央FAB） | 全モード共通のため据え置き | ❌ 対象外 |

-----

## 2. デザインの方針

1. **インセットグルーブドリスト**が基本形。ページ背景（ほぼ黒／`#F2F2F7`）の上に
   角丸16pxのカードを浮かべ、カードの中を区切り線で割る。カードに影はほぼ付けない。
2. **見出しはカードの外**に置く（`.rec-ios-group`）。カードの中にタイトルを入れない。
3. **結論を最上部**に置く。判断カード → 判断に使う数字 → 判断の理由 の順は崩さない。
4. **色はシステムカラー**。独自の中間色を作らない。必ずトークン経由。
5. **タップ領域は 44px 以上**（丸ボタンは 44×44、セグメンテッドは 40px＋外周パディング4px）。
6. **色だけで状態を伝えない**。判定は「状態名（続行／撤退…）＋説明文＋アイコン形状」を併記する。

-----

## 3. デザイントークン

`src/index.css` の 2 ブロックだけで定義しています。**JSX 側にハードコードの色を書かないこと。**

```
.rec-ios { ... }                    /* ダーク（基準デザイン） */
[data-theme="light"] .rec-ios { ... } /* ライト上書き */
```

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--ri-page` | `#000000` | `#F2F2F7` | ページ背景（systemGroupedBackground） |
| `--ri-panel` | `#1C1C1E` | `#FFFFFF` | カード面 |
| `--ri-panel-2` | `#2C2C2E` | `#F2F2F7` | 丸ボタン・セグメンテッドの溝・一段沈んだ面 |
| `--ri-panel-3` | `#3A3A3C` | `#E5E5EA` | リングの未達部分・ライトの丸ボタン地 |
| `--ri-ink` | `#FFFFFF` | `#000000` | 主要テキスト |
| `--ri-mut` | `rgba(235,235,245,.62)` | `rgba(60,60,67,.62)` | 補助テキスト（secondaryLabel） |
| `--ri-faint` | `rgba(235,235,245,.36)` | `rgba(60,60,67,.36)` | シェブロン・無効値 |
| `--ri-line` | `rgba(84,84,88,.48)` | `rgba(60,60,67,.2)` | 区切り線・カード枠 |
| `--ri-blue` | `#0A84FF` | `#007AFF` | アクセント（systemBlue）。CTA・実測回転率 |
| `--ri-green` | `#30D158` | `#248A3D` | 続行・プラス |
| `--ri-red` | `#FF453A` | `#D70015` | 撤退・マイナス |
| `--ri-yellow` | `#FFD60A` | `#B25000` | 警戒・遊タイムCTA |

### 汎用トークンの上書き

`.rec-ios` は `--bg` / `--surface` / `--text` / `--green` などの汎用 `C` トークン
（`src/constants.js`）も iOS 値に上書きしています。`KeyMetrics` / `RecentEventList` /
`YutimeEvCard` などの既存部品は `C` 経由で色を取るため、**それらのファイルを触らずに
配色だけ追従**します。記録モードに新しい部品を足すときも `C` か `--ri-*` を使えば
テーマ切替で破綻しません。

-----

## 4. コンポーネント規約

### 4-1. カード

```css
border: 1px solid var(--ri-line);
border-radius: 16px;
background: var(--ri-panel);
```

角丸は **16px** 固定（判断カードだけ 20px）。カードに独自の影やグラデーションを足さない。

### 4-2. グループ見出し（`.rec-ios-group`）

```jsx
<div className="rec-ios-group"><span>判断に使う数字</span><span>上皿補正ずみ</span></div>
```

左＝見出し（`--ri-mut`）、右＝補足（`--ri-blue`）。カードの外に置く。

### 4-3. 主要部品

| クラス | 対応するモック要素 | 備考 |
|---|---|---|
| `.rec-ios-appbar` / `.rec-ios-appbar__title` | `.app-bar` | 日付（小）＋「今日の実戦」（22px） |
| `.rec-ios-round` / `.rec-ios-round__badge` | `.round-button` | 44×44。通知ベルの未読バッジ付き |
| `.rec-ios-intro` / `.rec-ios-pill` | `.page-intro` | 店舗名＋台番号、右に投資ペース |
| `.rec-ios-machine` | `.machine-card` | タップで実戦サマリーを開閉 |
| `.rec-ios-live` | `.live-pill` | 「実戦中」 |
| `.rec-ios-segmented` | `.segmented` | 記録／詳細データ／大当たり履歴／機種設定 |
| `.live-decision`（別CSS） | `.verdict-card` | 左4pxの状態帯＋円形インジケーター |
| `.rec-ios-metrics` / `.rec-ios-metric` | `.metric-grid` | 2列4セル |
| `.rec-ios-reasons` / `.rec-ios-reason` | `.reason-card` | 1行56px以上 |
| `.rec-ios .record-cta-bar` / `.record-cta-input` | `.primary-action` | 下部固定CTA |

-----

## 5. 触ってはいけないもの（モック側 Brief と同じ）

見た目の作業でこれらに触れてはいけません。値の意味が変わり、金銭的損失に直結します。

- `src/logic.js`
- `src/components/decision/evDecision.js` / `liveRotationDecision.js` の判断条件
- 期待値・金額・判定の計算式
- `rotRows`（回転数の唯一の真実源）
- `src/__tests__/baseline.json`

`DecisionSummaryCard` は **表示専用**です。値は `ev`（`calcPreciseEV` の戻り値）と
`evDecision(ev)` の結果を読むだけで、参照順（`effective*` → `*Corrected` → 生値）は
`KeyMetrics` と揃えてあります。ここに新しい計算を書き足さないでください。

-----

## 6. 既知の重複と今後の検討

- 実測回転率が「判断カードの実測」と「判断に使う数字」の2か所に出ます。
  モックが定めた情報階層（結論の要約 ＋ グループ化された数字）をそのまま実装した結果で、
  既存表示を削らない方針のため残しています。統合する場合はユーザー確認のうえで行うこと。
- サブタブのアイコンは、モックのセグメンテッドがテキストのみのため外しています。
  戻す場合はラベルを2行にせず、44px以上のタップ領域を保つこと。
- モックの `.reason-row` 右端にはシェブロン（`›`）がありますが、実装では**意図的に外しています**。
  遷移先の詳細画面が存在せず、タップできない行にシェブロンを置くと「押せる」と誤読されるためです。
  詳細画面を作る場合はシェブロンを戻し、行全体を44px以上のボタンにすること。
- 判断カードの円形インジケーターは、モックの「信頼度」を「目標達成」に改称しています。
  Brief のレビュー観点2「『信頼度』の意味が、当たる確率と誤解されないか」への対応です。
  大当たり確率と混同されるため、`信頼度` の語には戻さないこと。
