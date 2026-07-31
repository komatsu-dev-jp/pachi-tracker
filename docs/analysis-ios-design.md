# 分析ページ iOS デザイン仕様書

最終更新: 2026-07-26（ブランチ `claude/analytics-ios-redesign-2tmqil`）

この文書は **分析ページ（フッター「分析」タブ）配下のデザインを、後から Codex / Claude Code が
一貫して増改築できるようにする**ための仕様書です。「どう見せるか」だけでなく
「なぜそうなっているか」「触ってよい範囲はどこか」を残しています。

新しい画面・パーツを分析ページに足すときは、まずこの文書の
**「4. コンポーネント規約」を写経してから**書いてください。独自のカードや独自の配色を
足すと、テーマ切替（ダーク／ライト）で必ず破綻します。

-----

## 1. スコープ（どこがこの仕様の対象か）

対象は **`.analytics-terminal` クラスの内側に描画されるもの全部** です。

| ファイル | 役割 | この仕様の対象 |
|---|---|---|
| `src/components/analysis/AnalysisDashboard.jsx` | 分析ページ本体（月別/年別/通算/詳細分析、カレンダー、各サブ画面） | ✅ |
| `src/components/analysis/AnalyzerView.jsx` | 詳細分析の中身（期待値分析/店舗分析/機種分析） | ✅ |
| `src/components/analysis/AnalyticsCharts.jsx` | 上記が使うチャート部品 | ✅ |
| `src/components/Tabs.jsx` の `CalendarTab`（`focusMode` のみ） | 「記録を編集/追加」シート。分析ページ配下で描画される | ✅ |
| `src/index.css` の `.analytics-terminal` ブロック | デザイントークン定義 | ✅ |
| `src/components/Tabs.jsx` の CAL カレンダー（`.cal-terminal`） | 記録モード内の証券端末風カレンダー | ❌ **対象外**（ユーザー判断で据え置き） |
| ホーム / 台選び / 偵察 / 設定 | — | ❌ 対象外 |

-----

## 2. デザインの方針

iOS ネイティブアプリ（設定 App / カレンダー App / ヘルスケア App）の見た目に寄せています。

1. **インセットグルーブドリスト**が基本形。ページ背景の上に角丸カードを浮かべ、
   カードの中を区切り線で割る。カードに影はほぼ付けない。
2. **見出しはカードの外**に置く（`GroupLabel`）。カードの中にタイトルを入れない。
3. **文字は太くしすぎない**。SF Pro の見え方に寄せて `font-semibold`(600) / `font-bold`(700) まで。
   `font-black`(900) と `font-mono` は原則使わない（数字は `tabular-nums` で揃える）。
4. **色はシステムカラー**。独自の中間色を作らない。必ずトークン経由。
5. **タップ領域は 44px 以上**（CLAUDE.md の規定。丸ボタンは `h-11 w-11`）。

### 例外（意図的に iOS 風にしていない箇所）

- `ShareCard` / `ShareMiniCalendar`（SNS 共有モーダルの明色カード）は
  **「共有される 1 枚の画像」のモックアップ**なので、ポスター的な太字のまま。
  `createShareImageBlob` が生成する PNG と見た目を揃えるのが目的で、
  ここだけは iOS のリスト規約から外れます。カード外の操作ボタンは iOS 準拠。

-----

## 3. デザイントークン

`src/index.css` の 2 ブロックだけで定義しています。**JSX 側にハードコードの色を書かないこと。**

```
.analytics-terminal { ... }                    /* ダーク（基準デザイン） */
[data-theme="light"] .analytics-terminal { ... } /* ライト上書き */
```

### 主要トークン

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--at-page` | `#000000` | `#F2F2F7` | ページ背景（systemGroupedBackground） |
| `--at-panel` | `#1C1C1E` | `#FFFFFF` | カード面（secondarySystemGroupedBackground） |
| `--at-panel2` | `#2C2C2E` | `#F2F2F7` | カード内のさらに一段沈んだ面 |
| `--at-rowbg` | `rgba(118,118,128,.18)` | `rgba(118,118,128,.12)` | 塗りチップ・セグメンテッドの溝・丸ボタン背景 |
| `--at-hoverbg` | `rgba(118,118,128,.24)` | `rgba(118,118,128,.16)` | 押下時のハイライト |
| `--at-ln-soft` / `--at-ln` / `--at-ln-md` / `--at-ln-hi` | `rgba(84,84,88,.36〜.72)` | `rgba(60,60,67,.16〜.32)` | 区切り線（薄→濃） |
| `--at-strong` | `#FFFFFF` | `#000000` | 主要テキスト |
| `--at-mut` | `rgba(235,235,245,.6)` | `rgba(60,60,67,.6)` | 補助テキスト（secondaryLabel） |
| `--at-faint` | `.3` 相当 | `.32` 相当 | シェブロン・無効値 |
| `--at-cyan` | `#0A84FF` | `#007AFF` | アクセント（systemBlue）。**期待値の色でもある** |
| `--at-pos` | `#30D158` | `#248A3D` | プラス収支（systemGreen） |
| `--at-neg` | `#FF453A` | `#D70015` | マイナス収支（systemRed） |
| `--at-sun` / `--at-sat` | 赤系 / 青系 | 同 | 曜日見出し（日/土） |
| `--at-gold` / `--at-on-gold` | `#FFD60A` / `#3d2f00` | `#B25000` / `#ffffff` | 1位バッジの地色と**その上の文字色** |
| `--at-heat-p` / `--at-heat-p2` | 緑 16% / 30% | 緑 16% / 32% | カレンダーのプラス塗り（弱／強） |
| `--at-heat-m` / `--at-heat-m2` | 赤 16% / 30% | 赤 14% / 28% | カレンダーのマイナス塗り（弱／強） |
| `--at-card-grad` | フラット | フラット | カード背景。グラデーションではないが名前は互換で維持 |
| `--at-card-shadow2` | `none` | `0 1px 2px …` | カードの影 |

> **重要**: トークン名は金融端末風だった頃のまま（`--at-cyan` など）です。
> 値だけ iOS 系に差し替えているので、**名前から色を推測せずトークン表を見てください**。
> 名前を据え置いたのは、`AnalyzerView` / `AnalyticsCharts` / 編集シートが同じ名前を
> 参照していて、そこを触らずに全体を追従させるためです。

`--bg` / `--surface` / `--text` / `--green` などの汎用 `C` トークン（`src/constants.js`）も
`.analytics-terminal` 内で iOS 値に上書きしています。`AnalyzerView` は `C` 経由で色を取るため、
`C.surface` などを使えば自動で iOS 配色になります。

### 1位バッジの文字色について

ライトテーマの `--at-gold` は `#B25000`（濃いオレンジ）です。ダークの `#FFD60A` と違って
**濃色なので、黒文字を置くと読めません**。必ず `--at-on-gold` を使ってください。

-----

## 4. コンポーネント規約

`AnalysisDashboard.jsx` の冒頭に共通パーツがあります。新規画面はこれを使い回してください。

### 4-1. カード

```jsx
const card = "rounded-[16px] border border-[var(--at-ln-soft)] bg-[image:var(--at-card-grad)] shadow-[var(--at-card-shadow2)]";

<section className={`${card} p-4`}> … </section>
```

- 角丸は **16px** 固定（`ShareCard` などモーダルは 14〜20px）。
- カードの中を割るときは `border-t border-[var(--at-ln-soft)]`。`divide-*` でも可。
- **カードに独自の影やグラデーションを足さない。**
- カードの上に枠を出したいとき（1位の金枠など）は `outline` を使う。
  `shadow-*` は `card` の `shadow-[var(--at-card-shadow2)]` と衝突して勝敗が不定になります。
  ```jsx
  // 1位カード
  className={`${card} outline outline-[1.5px] -outline-offset-[1.5px] outline-[var(--at-gold)]`}
  ```

### 4-2. セクション見出し `GroupLabel`

カードの**外**に置く小さな見出し。右端に補助アクションを置けます。

```jsx
<GroupLabel action={<button …>すべて見る ›</button>}>店舗トップ3</GroupLabel>
<div className={`${card} overflow-hidden`}> …リスト行… </div>
```

### 4-3. 丸型ツールバーボタン `RoundButton`

ナビゲーションバー左右の 44px 円形ボタン。`active` で塗りつぶし（選択状態）になります。

```jsx
<RoundButton onClick={onPrev} disabled={navDisabled} ariaLabel="前の期間へ">
  <ChevronLeft className="h-[22px] w-[22px]" />
</RoundButton>
```

### 4-4. ナビゲーションバー

すべてのサブ画面（店舗一覧・店舗詳細・機種詳細・編集シート）で同じ形にしています。

```jsx
<div className="mb-2 flex min-h-[52px] shrink-0 items-center gap-1.5">
  <RoundButton onClick={onBack} ariaLabel="戻る"><ChevronLeft className="h-[22px] w-[22px]" /></RoundButton>
  <h1 className="min-w-0 flex-1 truncate text-[20px] font-bold tracking-[-.02em]">{title}</h1>
  {/* 右端に補助情報やバッジ */}
</div>
```

分析ページ本体の `HeaderBar` だけは「左＝`‹ 年月⌄ ›`／右＝月次詳細・絞り込み」の 2 グループ構成です。
タイトルは `clamp(15px,5.4vw,22px)`。320px 幅でも「2026年10月」が省略されない下限にしてあります。

### 4-5. セグメンテッドコントロール

並び替え・タブ切替はすべてこの形。**溝（`--at-rowbg`）の上につまみ（`--at-panel`）が乗る**。

```jsx
<div className="grid grid-cols-3 gap-1 rounded-[10px] bg-[var(--at-rowbg)] p-1">
  {items.map((it) => (
    <button key={it.id} type="button" onClick={…} aria-pressed={active}
      className={`h-9 rounded-[8px] text-[14px] font-semibold transition ${active
        ? "bg-[var(--at-panel)] text-[var(--at-strong)] shadow-[0_1px_3px_rgba(0,0,0,.25)]"
        : "text-[var(--at-mut)]"}`}>
      {it.label}
    </button>
  ))}
</div>
```

`AnalyzerView.jsx` はインラインスタイル（`C` トークン）で書かれていますが、同じ見た目に揃えてあります。

### 4-6. リスト行

```jsx
<button type="button" onClick={…}
  className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--at-hoverbg)] ${index > 0 ? "border-t border-[var(--at-ln-soft)]" : ""}`}>
  <span className="…順位バッジ…">{index + 1}</span>
  <span className="min-w-0 flex-1">
    <span className="block truncate text-[15px] font-semibold text-[var(--at-strong)]">{title}</span>
    <span className="mt-0.5 block truncate text-[11px] font-medium text-[var(--at-mut)]">{subtitle}</span>
  </span>
  <span className="shrink-0 text-[15px] font-bold tabular-nums …">{amount}</span>
  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--at-faint)]" />
</button>
```

**行の中で情報を詰め込みすぎない。** 右の金額が 6 桁を超えると副題が省略されるので、
副題に入れる項目は 3 つまで、単位（円）は省く、が目安です。

### 4-7. 主ボタン（塗りつぶし）

```jsx
<button className="h-[50px] w-full rounded-[14px] bg-[var(--at-cyan)] text-[16px] font-semibold text-white transition active:scale-[.99]">
```

### 4-8. アクションシート

`ViewMenuSheet` が参考実装です。iOS のアクションシートに合わせて
**リストのカードと「キャンセル」ボタンを別カードに分離**し、間を 8px 空けます。
行の高さは 56px、選択行の右端に `Check` アイコン。

-----

## 5. 数値の表示ルール

- 金額・回数・率はすべて `tabular-nums`（桁が揺れない）。`font-mono` は使わない。
- 符号付きは `signed()`、符号なしは `fmt()`（どちらも `AnalysisDashboard.jsx` 冒頭）。
- 色は `moneyClass(value)`（0 以上＝`--at-pos` / 負＝`--at-neg`）。期待値だけは `--at-cyan`。
- ヒーローの大きな数字は `text-[clamp(28px,9vw,42px)] font-bold tracking-[-.03em]`。
- **万表記にしない。** 過去に `-1.7万` へ短縮した経緯がありますが、
  ユーザー要望で実額表示に戻した経緯があります（HANDOVER 2026-07-11 参照）。
  桁があふれる場合は**フォントサイズを落として実額のまま収める**。

-----

## 6. 収支カレンダーの仕様

分析ページの主役です。`CalendarPanel` / `CalendarCell`。

### セルの構成

```
┌──────────┐
│   (26)   │ ← 日付＝22px の丸バッジ（中央上）
│          │
│ +33,300  │ ← 金額＝下段いっぱい、実額のまま
└──────────┘
```

- セルは `aspect-[1/1.12]`（幅約 49px → 高さ約 54px）。タップ領域 44px を満たす。
- **枠線なし。** 稼働日だけ損益色で塗り、未稼働日は無地。空白セルは描画しない
  （`<div className="aspect-[1/1.12]" />` のみ）。
- グリッドは `grid-cols-7 gap-[3px]`、カードは `-mx-2 px-2` で少し外側に広げてセル幅を稼ぐ。

### 日付バッジの状態（優先順）

1. 選択日 → `bg-[var(--at-cyan)] text-white`（塗りつぶし）＋セルに `shadow-[inset_0_0_0_1.5px_var(--at-cyan)]`
2. 今日 → `bg-[var(--at-rowbg)] text-[var(--at-cyan)]`（薄い丸）
3. それ以外 → 日曜 `--at-sun` / 土曜 `--at-sat` / 平日 `--at-strong`

### ヒート塗り（2 段階）

`HEAT_STRONG_YEN = 30000`（表示専用の定数）を境に濃淡を変えます。
淡い 1 段階だけだと「大負けした日」が判別できないため。

| 条件 | 塗り |
|---|---|
| `amount >= +30,000` | `--at-heat-p2` |
| `amount > 0` | `--at-heat-p` |
| 記録あり `amount === 0` | `--at-cellbg` ＋ 下段に `±0` |
| `amount > -30,000` | `--at-heat-m` |
| `amount <= -30,000` | `--at-heat-m2` |

### 金額のフォントサイズ

`cellAmountSize(text)` が**文字数**で段階を返します（5 桁以下 12/13px 〜 10 桁以上 7/8px）。
`min-[360px]:` で 360px 未満の端末だけ 1 段小さくします。
**セル幅を変えたらこの表も見直すこと。** 320px 幅で `-1,250,000`（10 文字）が
収まることを実測で確認しています。

### 週別収支

カレンダーの下に「n週」ごとの実収支合計を横並びで出します。
**8 列目を足すと金額が読めなくなる**ため、表の右ではなく下に置いています。

### 「今日」ボタン

今月かつ今日を選択している状態以外では、見出し右に「今日」ボタンが出ます。
何ヶ月さかのぼっても 1 タップで今月＋本日へ戻れます（`goToday`）。

-----

## 7. 画面遷移（サブ画面スタック）

このアプリは react-router を入れていません。`AnalysisDashboard` は **state の組み合わせで
スタックを表現**し、早期 return で切り替えます。増やすときも同じ形にしてください。

```
分析ページ本体
 ├ recordsDay !== null            → 記録編集シート（CalendarTab focusMode）
 ├ storeListOpen && !storeDetail  → StoreListScreen（店舗一覧）
 ├ storeDetailName !== null       → StoreDetailScreen（店舗詳細）
 └ machineDetailName !== null     → MachineDetailScreen（機種詳細）
```

判定順が **そのままスタックの深さ** です。
`storeListOpen && storeDetailName === null` としているのは、
店舗詳細から戻ったときに一覧へ復帰させるため。

**サブ画面のローカル state は親に持たせる**のが原則です。
例: 店舗一覧の並び替えは `storeListSort` を親に置いています。
子で `useState` すると、店舗詳細へ行って戻った瞬間にリセットされます。

-----

## 8. 触ってはいけない範囲

CLAUDE.md の規定を分析ページ向けに具体化したものです。

### 絶対に変更しない

- `src/logic.js`（変更が必要に見えても実装せず報告のみ）
- `src/components/decision/evDecision.js` の判断条件
- 集計セレクタの**計算式**:
  `analysisSelectors.js` / `analyticsViewSelectors.js` / `analyzerSelectors.js`
- 保存データ構造（`archives` の各フィールド、`rotRows`、`jpLog`）
- `src/__tests__/baseline.json`

### 表示専用なら足してよい

`buildStoreRanking` / `buildRealDays` / `buildTrend` などは
`AnalysisDashboard.jsx` 内の**表示専用の純関数**です。
既存の合算式を変えない範囲でオプション（並び替え・件数など）を足すのは可。

例: `buildStoreRanking(archives, { sortBy, limit })` は今回追加したもので、
`getEvAmount` / `getActualPL` の呼び方は一切変えていません。

### 既存 UI の削除

不要に見えても**削除せず、報告する**。
（例: 店舗トップ3 の「すべて見る」は長く遷移先なしの飾りでしたが、
削除せず残していたものを今回きちんと実装しました。）

-----

## 9. 変更したら必ず通す検証

```bash
npm run lint          # エラー 0・警告 0
npm run build         # 成功すること

# logic.js を触っていないことの証明（2 つとも必須）
git diff --quiet src/logic.js && echo OK
node src/__tests__/protected-fns.mjs   # 出力が baseline.json と完全一致
```

さらに、レイアウトを触ったときは **実描画で確認**してください。
この環境では Playwright + Chromium が使えます（`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`）。

確認すべき組み合わせ（今回の刷新で実測済み）:

| 軸 | 値 |
|---|---|
| 幅 | 393px（iPhone 16 Pro 相当）／320px（最小） |
| テーマ | ダーク／ライト（`localStorage.pt_theme`） |
| 画面 | 月別 / 年別 / 通算 / 詳細分析 / 月次詳細 / 表示切替シート / 絞り込み / 記録追加シート / 店舗一覧 / 店舗詳細 / 機種詳細 / 共有カード |
| データ | 記録ゼロ（空状態）／通常／7 桁金額（`-1,250,000` など） |

判定基準は **横はみ出し 0 件・コンソールエラー 0 件**。
横はみ出しは全要素の `getBoundingClientRect()` を走査して検出できます。

```js
document.querySelectorAll('*').forEach(el => {
  const r = el.getBoundingClientRect();
  if (r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) { /* NG */ }
});
```

-----

## 10. よくある落とし穴

1. **SVG の presentation attribute は `var()` を解決しない。**
   Recharts の `<CartesianGrid stroke="…">` などにトークンを渡すと無色になります。
   軸・グリッド・線の色は**リテラル値**で書き、ライトテーマ差分は
   `src/index.css` の `[data-theme="light"] .analytics-terminal .recharts-*` で上書きします。
   一方 `<Tooltip contentStyle={{…}}>` は style オブジェクトなのでトークン参照が効きます。

2. **`shadow-*` の二重指定は勝敗が不定。**
   `card` は既に `shadow-*` を持っています。枠を足したいときは `outline` を使うこと（4-1 参照）。

3. **`Bar` に既定の `fill` がないと凡例のスウォッチが黒くなる。**
   `<Cell>` で色を上書きしていても、凡例は `Bar` の `fill` を見ます。

4. **`new Date(y, m-1, 31)` は翌月へ繰り上がる。**
   選択日は必ず月の日数で丸めてから使ってください
   （`activeDay = Math.min(Math.max(1, selectedDay), daysInMonth)`）。

5. **横スワイプ月送りのために `touch-pan-y` と `overflow-x: clip` が必要。**
   スクロール領域の `<main>` に `touch-pan-y`、その親に `overflow-x-clip`。
   外すと iOS Safari で画面が横にブレたり、左にパンしたまま固定されます
   （HANDOVER 2026-07-10 / 既存コメント参照）。

-----

## 11. 関連ドキュメント

- `CLAUDE.md` — 開発ルール全体（UI 原則・logic.js 保護・報告フォーマット）
- `docs/HANDOVER.md` — 時系列の変更履歴。**なぜその値になったかは大抵ここに書いてある**
- `docs/decision-ui-design.md` — 判断ファーストUI（記録モード側）の設計書
