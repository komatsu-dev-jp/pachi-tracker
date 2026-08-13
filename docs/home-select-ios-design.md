# ホーム画面・台選び iOS デザイン仕様書

最終更新: 2026-08-13（ブランチ `claude/pachi-ios-home-machine-select-rgwioj`）

出典モック: `docs/design-review/pachi-ios-redesign.html`（Brief: `docs/design-review/DESIGN_BRIEF.md`）

この文書は **ホーム画面（フッター「ホーム」）と台選び画面（フッター「台選び」）の見た目**を、
後から Codex / Claude Code が一貫して増改築できるようにするためのものです。
分析ページの `docs/analysis-ios-design.md`、記録モードの `docs/record-ios-design.md` と
同じ考え方・同じ運用にしています。**着手前に必ず読むこと。**

-----

## 1. スコープ

| 場所 | 役割 | 対象 |
|---|---|---|
| `src/components/home/HomeDashboard.jsx` / `.css` | ホーム画面すべて | ✅ |
| `src/components/strategy/StrategyMapDashboard.jsx` / `.css` | 台選び画面すべて | ✅ |
| `src/index.css` の `.strategy-map, .yutime-sheet` トークンブロック | 台選びのデザイントークン | ✅ |
| `src/components/yutime/YutimeCalculatorSheet.jsx` | `--sm-*` を共有するため配色だけ追従（構造は無変更） | 🔸 追従のみ |
| `ModeTabBar`（フッター5タブ・中央FAB） | 全モード共通のため据え置き | ❌ 対象外 |
| `src/components/select/SelectDashboard.jsx` | 現在フッターの「台選び」からは到達しない旧画面 | ❌ 対象外 |

> フッターの「台選び」タブが開くのは `SelectDashboard` ではなく **`StrategyMapDashboard`（戦略マップ画面）**です。
> `App.jsx:1877` の `currentMode === "select" || currentMode === "strategy"` 分岐を参照。
> `SelectDashboard.jsx` は現在どのタブからも開かれないため、今回の刷新対象から外しています。

-----

## 2. デザインの方針

記録モード・分析ページと同一です。

1. **インセットグルーブドリスト**が基本形。ページ背景（ほぼ黒／`#F2F2F7`）の上に
   角丸16pxのカードを浮かべ、カードの中を区切り線で割る。カードに影・グラデーション・
   発光（`box-shadow: 0 0 Npx <色>`）は付けない。
2. **見出しはカードの外**に置く（ホーム＝`.home-section-title-row`／台選び＝`.strategy-ios-group`）。
3. **結論を最上部**に置く。ホームは「今月の収支と期待値」、台選びは「判断に使う数字」が
   スクロールせずに読める位置に来る。
4. **色はシステムカラー**。独自の中間色を作らない。必ずトークン経由。
   JSX にハードコードの色を書かないこと。
5. **タップ領域は 44px 以上**（丸ボタン 44×44、主ボタン 50px、セグメンテッドは 40px＋外周パディング4px）。
6. **色だけで状態を伝えない**。状態名（実戦中／未解析／ボーダー+1以上…）と説明文を必ず併記する。

-----

## 3. デザイントークン

### 3-1. ホーム画面（`.home-dashboard`）

定義元は **`src/components/home/HomeDashboard.css` の冒頭 2 ブロックだけ**です。

```
.home-dashboard { ... }                    /* ダーク（基準デザイン） */
[data-theme="light"] .home-dashboard { ... } /* ライト上書き */
```

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--ho-page` | `#000000` | `#F2F2F7` | ページ背景（systemGroupedBackground） |
| `--ho-panel` | `#1C1C1E` | `#FFFFFF` | カード面 |
| `--ho-panel-2` | `#2C2C2E` | `#F2F2F7` | 丸ボタン・カード内の一段沈んだ面 |
| `--ho-panel-3` | `#3A3A3C` | `#E5E5EA` | ライトの丸ボタン地・溝 |
| `--ho-ink` | `#FFFFFF` | `#000000` | 主要テキスト |
| `--ho-mut` | `rgba(235,235,245,.62)` | `rgba(60,60,67,.62)` | 補助テキスト・グループ見出し |
| `--ho-faint` | `rgba(235,235,245,.36)` | `rgba(60,60,67,.36)` | シェブロン・無効値 |
| `--ho-line` | `rgba(84,84,88,.48)` | `rgba(60,60,67,.2)` | 区切り線・カード枠 |
| `--ho-blue` | `#0A84FF` | `#007AFF` | アクセント（systemBlue）。CTA・期待値 |
| `--ho-green` | `#30D158` | `#248A3D` | プラス収支・続行 |
| `--ho-red` | `#FF453A` | `#D70015` | マイナス収支・未読バッジ |
| `--ho-yellow` | `#FFD60A` | `#B25000` | 警戒・目標達成 |

**名前から色を推測しないこと。** 旧名の `--home-blue` / `--home-cyan` / `--home-green` /
`--home-yellow` / `--home-red` は既存クラスとの互換のために残していますが、**値はすべて上の
iOS トークンへのエイリアス**です（`--home-cyan` の実体は systemBlue で、シアンではありません）。

`.home-dashboard` は汎用トークン（`--bg` / `--surface` / `--surface-hi` / `--surface-alt` /
`--border` / `--border-hi` / `--text` / `--sub` / `--sub-hi` / `--blue` / `--green` / `--red` /
`--yellow` / `--card-shadow`）も iOS 値へ上書きしています。Recharts のグラフや配下の
既存部品は `var(--home-*)` / 汎用トークン経由で色を取るため、**それらを触らずに配色だけ追従**します。

### 3-2. 台選び画面（`.strategy-map`）

定義元は **`src/index.css` の `.strategy-map, .yutime-sheet` ブロック 2 つだけ**です。
`StrategyMapDashboard.jsx` のパレット定数 `P` がこれを参照します。

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--sm-bg` | `#000000` | `#F2F2F7` | ページ背景 |
| `--sm-card` | `#1C1C1E` | `#FFFFFF` | カード面 |
| `--sm-card-hi` | `#2C2C2E` | `#F2F2F7` | 丸ボタン・セグメンテッドの溝・沈んだ面 |
| `--sm-panel-3` | `#3A3A3C` | `#E5E5EA` | ライトの丸ボタン地・溝 |
| `--sm-text` | `#FFFFFF` | `#000000` | 主要テキスト |
| `--sm-sub` | `rgba(235,235,245,.6)` | `rgba(60,60,67,.6)` | 補助テキスト・グループ見出し |
| `--sm-sub-hi` | `rgba(235,235,245,.78)` | `rgba(60,60,67,.78)` | やや強い補助テキスト |
| `--sm-faint` | `rgba(235,235,245,.36)` | `rgba(60,60,67,.36)` | シェブロン |
| `--sm-line` / `--sm-line-hi` | `rgba(84,84,88,.48/.72)` | `rgba(60,60,67,.2/.34)` | 区切り線・カード枠 |
| `--sm-cyan` / `--sm-cyan-hi` | `#0A84FF` | `#007AFF` | アクセント（systemBlue） |
| `--sm-on-cyan` | `#FFFFFF` | `#FFFFFF` | アクセント塗りの上の文字色 |
| `--sm-green` / `--sm-yellow` / `--sm-red` | `#30D158` / `#FFD60A` / `#FF453A` | `#248A3D` / `#B25000` / `#D70015` | 判定色 |
| `--sm-gray` | `rgba(235,235,245,.36)` | `rgba(60,60,67,.36)` | データ不足 |
| `--sm-purple` | `#BF5AF2` | `#8944AB` | 対面台のマーキング |
| `--sm-map-bg` | `#1C1C1E` | `#FFFFFF` | ホールマップの地 |

**`--sm-cyan` はシアンではなく systemBlue です。** 名前は互換維持のためだけに残しています。

`--sm-*` は `.yutime-sheet`（遊タイム計算シート）とも共有しています。
このシートは記録モードからも開きますが、記録モード（`.rec-ios`）も同じ iOS システムカラーなので
配色は一致します。

-----

## 4. コンポーネント規約

### 4-1. カード

```css
border: 1px solid var(--ho-line);   /* 台選びは var(--sm-line) */
border-radius: 16px;
background: var(--ho-panel);        /* 台選びは var(--sm-card) */
box-shadow: none;                   /* ライトのみ 0 1px 2px の薄い影 */
```

角丸は **16px 固定**。カードに独自の影・グラデーション・発光を足さない。

### 4-2. 主要部品の対応表

| モックの要素 | ホーム | 台選び |
|---|---|---|
| `.app-bar` | `.home-appbar` / `.home-appbar__title` | `.strategy-ios-appbar` / `.strategy-ios-appbar__title` |
| `.round-button`（44×44） | `.home-bell` | `.strategy-ios-round` |
| `.page-intro` | `.home-intro` | `.strategy-ios-intro` |
| `.live-pill` | `.home-live-pill` | `.strategy-ios-pill` |
| `.segmented` | （なし） | `.strategy-ios-segmented` |
| `.group-label` | `.home-section-title-row`（`SectionTitle`） | `.strategy-ios-group`（`Section`） |
| `.metric-grid` / `.metric` | `.home-delta-stats` ほか既存のグリッド | `.strategy-ios-metrics` / `.strategy-ios-metric` |
| `.machine-card` | `.home-recent-row` + `.home-machine-mark` | `.strategy-store-trigger` |
| `.primary-action`（50px・角丸14px） | `.home-primary-action` / `.home-delta-analyze` | `.strategy-ios-primary-action` / `.strategy-ios-secondary-action` |

### 4-3. アプリバー

```jsx
<div className="home-appbar">
  <div className="home-appbar__title">
    <AppMark />           {/* 11px の muted なブランド行 */}
    <strong>8月13日（木）</strong>   {/* 22px・letter-spacing -0.035em */}
  </div>
  <button className="home-bell">…</button>   {/* 44×44 の丸 */}
</div>
```

台選びは iOS のプッシュ遷移相当なので、**先頭に丸型の戻るボタン**を置きます
（`‹` + タイトル + 右にヘルプ）。

### 4-4. ページ見出し（`.page-intro`）

左＝主対象（ホーム＝店舗名／台選び＝機種名、18px semibold・1行省略）、
その下に補足（12px muted）、右＝状態バッジ（28px の丸ピル）。

### 4-5. グループ見出し

カードの**外**に置きます。左＝見出し（11px・`--ho-mut` / `--sm-sub`・`letter-spacing: .06em`）、
右＝補足または操作（`--ho-blue` / `--sm-cyan`）。

台選びの `Section` は `accent` が渡されたときだけ、状態色を 7px のドットで見出しの前に付けます
（色だけに頼らないため、ドットの有無に関わらず見出し文言で状態が読めること）。

### 4-6. セグメンテッドコントロール

溝＝`--sm-card-hi`（ライトは `--sm-panel-3`）、つまみ＝`--sm-card`。
モックと同じく **つまみのほうが暗い**のがダークでの正しい見え方です。
ボタンは `min-height: 40px` ＋ 外周 `padding: 4px` で 48px を確保します。

-----

## 5. 触ってはいけないもの（モック側 Brief と同じ）

見た目の作業でこれらに触れてはいけません。値の意味が変わり、金銭的損失に直結します。

- `src/logic.js`
- `src/components/decision/evDecision.js` の判断条件
- 期待値・金額・判定の計算式（`homePlanningModel.js` / `homeDashboardModel.js` /
  `analysisSelectors.js` / `strategyMapData.js` の集計式を含む）
- `rotRows`（回転数の唯一の真実源）
- `src/__tests__/baseline.json`
- 保存データ構造（`pt_archives` / `pt_hallMaps` / `pt_deltaScans` / `pt_monthlyPlayPlans` ほか）

今回の刷新では **JSX の構造とクラス名・CSS だけ**を変更し、値を読む式には一切触れていません。

-----

## 6. 変更したら必ず通す検証

```bash
npm run lint          # エラー0・警告0
npm run build         # 成功

# logic.js を触っていないことの証明（2つとも必須）
git diff --quiet src/logic.js && echo OK
node src/__tests__/protected-fns.mjs   # 出力が baseline.json と完全一致すること

npm test              # 全ユニットテスト
```

さらに Playwright 実描画で、**393px / 320px × ダーク / ライト**の 4 通りについて
- 横はみ出し 0 件（`document.documentElement.scrollWidth` が viewport 幅と一致）
- コンソールエラー 0 件

を確認します。台選びのホールマップ（`.strategy-pair-scroll` / `.strategy-islands-scroll`）は
**意図的な横スクロール領域**なので、はみ出し検出から除外して数えます。

-----

## 7. 落とし穴

1. **`HomeDashboard.css` の末尾にある「iOS grouped-list surface」ブロックは、
   ファイル冒頭のトークン定義より後ろにあるため同じ詳細度なら勝ちます。**
   ここに色の定義を書かないこと。寸法・余白・面の指定だけにして、色は必ずトークン参照にする。
2. **`.home-card h2` と `.home-section-title h2` を1つのセレクタでまとめない。**
   前者はカード内の見出し（15.5px）、後者はカード外のグループ見出し（11px）で役割が違います。
3. **ライトテーマでは `--*-page` と `--*-panel-2` が同色（`#F2F2F7`）**になるため、
   丸ボタン・セグメンテッドの溝は `--ho-panel-3` / `--sm-panel-3` に切り替える必要があります。
   `[data-theme="light"]` 側の上書きを消さないこと。
4. **発光（`box-shadow: 0 0 Npx <色>` / `text-shadow`）を足さない。** iOS は影で情報を伝えません。
   選択状態は `box-shadow: 0 0 0 2px <アクセント>`（実質 outline）で表現します。
5. **台選びの `Section` は全セクション共通**です。ここを変えると画面全体の見出しが一斉に変わります。

-----

## 8. 意図的に据え置いた箇所

- 台選びの**カード内タイトル**（「島活動シグナル履歴」「翌日予測の答え合わせ」など）は
  カードの中に残しています。`Section` 配下の入れ子カードまで見出しを外へ出すと、
  見出しだけが 4 段積み重なって情報の親子関係が読めなくなるためです。
- ホームの**月間目標から自動逆算パネル**の破線枠は「未設定」を示す既存の表現なので残しています。
- モックの `.verdict-card`（判断カード）と `.reason-card`（判断の理由）は、
  実戦中にしか意味を持たないため記録モード側にあります（`docs/record-ios-design.md`）。
  ホーム・台選びには対応する結論カードとして「今月の収支と期待値」「判断に使う数字」を置いています。
