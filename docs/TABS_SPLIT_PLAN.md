# Tabs.jsx 分割設計プラン（調査・設計のみ）

本書は `src/components/Tabs.jsx`（約 11,600 行 / 約 798KB）の肥大化に対する分割設計の調査結果と移行プランをまとめたものである。
**本書は調査・設計のみ。本書に基づく src/ の変更は別タスクで行う。**

調査日: 2026-06-11 / 対象コミット: `d5028c3`

---

## 1. 現状分析

### 1.1 ビルド実態（軽量化が必要な根拠）

`dist/` のビルド出力は **単一の JS チャンク 1 本**に全コードが固まっている。

| ファイル | サイズ |
|---|---|
| `dist/assets/index-CYUnF_iv.js` | **852 KB**（gzip 前） |
| `dist/assets/index-DbYEklYn.css` | 44.7 KB |
| `dist/assets/workbox-window.prod.es5-*.js` | 5.7 KB |

- `index.html` は `index-*.js` を 1 本だけ `<script type="module">` で読み込む。コード分割（動的 import / manualChunks）は**現状ゼロ**。
- `vite.config.js` に `build.rollupOptions.output.manualChunks` などのチャンク設定は**存在しない**（plugins は react と VitePWA のみ）。
- `Tabs.jsx` 1 ファイルがソース全体（`src/` 合計約 13,200 行）のうち 11,615 行を占め、この 852KB バンドルの主因になっている。
- 初回起動時、ユーザーが最初に見るのは **home モード**（`HomeDashboard`）だが、`record`（RotTab 約 5,600 行）・`settings`（SettingsTab 約 2,900 行）まで含む巨大バンドルを全て読み込み終えるまで JS の評価が走る。パチンコ店内回線では初回表示遅延に直結する。

### 1.2 エクスポート済みコンポーネント一覧（行範囲・概算行数）

| コンポーネント | 行範囲 | 概算行数 | 外部からの利用 |
|---|---|---|---|
| `DataTab` | 577–693 | 約 116 | **未使用（どこからも import されていない）** |
| `RotTab` | 694–6,325 | **約 5,631** | App.jsx（record モード） |
| `HistoryTab` | 6,326–7,615 | 約 1,289 | **未使用**（コメント上 RotTab へ「移植」済みと記載: L2890） |
| `CalendarTab` | 7,616–8,715 | 約 1,099 | AnalysisDashboard.jsx（calendar サブタブ） |
| `SettingsTab` | 8,716–11,615 | 約 2,899 | App.jsx（settings モード） |

> **重要な想定外の事実**: 5 つのエクスポートのうち、実際に App / 他コンポーネントから参照されているのは **RotTab・CalendarTab・SettingsTab の 3 つだけ**。`DataTab` と `HistoryTab` は export されているがリポジトリ内のどこからも import されていない（grep で確認済み。内部 JSX 利用 `<DataTab>` `<HistoryTab>` も 0 件）。

### 1.3 モジュールレベルのヘルパー / 定数（24–575 行）

| 種別 | 名前 | 定義行 | 主な利用タブ |
|---|---|---|---|
| 定数 | `STABLE_TARGET_ROT` (1500) | 17 | RotTab |
| 定数 | `NEXT_CHECKPOINT_ROT` (300) | 19 | RotTab |
| チャート | `LineChart` | 24 | DataTab(658) / RotTab(4789) |
| チャート | `MultiLineChart` | 93 | DataTab(91付近) / CalendarTab(8593) |
| カード | `WageRankCard` | 148 | DataTab / CalendarTab(8599) |
| アイコン | `InfoIcon` | 180 | RotTab(4325,4331) ほか |
| アイコン | `PencilIcon` | 189 | RotTab(4402) |
| アイコン | `LightbulbIcon` | 196 | RotTab(4414) |
| アイコン | `CoinIcon` | 203 | RotTab(4344) |
| アイコン | `SwapIcon` | 211 | RotTab(4351) |
| アイコン | `StoreIcon` | 218 | RotTab(4365) |
| アイコン | `HashIcon` | 225 | RotTab(4371) |
| UI | `MachinePlaceholder` | 234 | RotTab(4302) |
| UI | `SectionHeader` | 251 | RotTab(4300,4340,4361) |
| UI | `SettingPill` | 261 | RotTab(4342–4369) |
| ヘルパー | `hasRotDataRows` | 295 | DataTab(626) |
| UI | `EmptySub` | 298 | DataTab(638–679) |
| UI | `UndoControls` | 307 | DataTab(636) / RotTab(4214) |
| カード | `FlowValueCard` | 373 | **未使用（dead code）** |
| ボタン | `FlowChoiceButton` | 386 | **未使用（dead code）** |
| ロジック | `effectiveEv` | 399 | DataTab(628) / RotTab(721,3428) |
| カード | `YutimeEvCard` | 416 | RotTab(2435,4694) |
| style util | `dataCardStyle` 他 6 関数 | 509–575 | 主に RotTab(3625–4169) |

> **追加の想定外の事実**: `FlowValueCard` / `FlowChoiceButton` は定義されているが利用箇所 0 件の dead code。

### 1.4 タブの props / 呼び出し方（App.jsx 側）

App.jsx でのインポートとレンダリングは以下のとおり（L5, L995–1006）。**全タブが条件レンダー**（`currentMode === ...` の短絡評価）で、同時には 1 つしかマウントされない。これは lazy 化に非常に好都合。

```jsx
import { RotTab, SettingsTab } from "./components/Tabs";
...
{currentMode === "record"   && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
{currentMode === "settings" && <SettingsTab s={S} onReset={resetAll} />}
```

`CalendarTab` は AnalysisDashboard.jsx（L4, L505）から条件付きで埋め込まれる:

```jsx
import { CalendarTab } from "../Tabs";
...
<CalendarTab S={S} onReset={onReset} />   // analysis モードの calendar サブタブのみ
```

各タブの props:

| タブ | props | 備考 |
|---|---|---|
| `RotTab` | `{ rows, setRows, S, ev }` | App は `border` も渡すが**シグネチャに無く未使用**（border は `S.border` 経由で参照） |
| `SettingsTab` | `{ s, onReset }` | props 名が `s`（他タブは `S`） |
| `CalendarTab` | `{ S, onReset }` | — |
| `DataTab`（未使用） | `{ ev, jpLog, S }` | — |
| `HistoryTab`（未使用） | `{ jpLog, delJPLast, S, ev }` | — |

すべてのタブが `S`（App の全 state/setter を束ねた巨大オブジェクト）を受け取る一元管理。`rotRows` / `setRotRows` も `S.rotRows` 経由で渡る。**rotRows の真実源は App.jsx の `useLS("pt_rotRows")`** であり、各タブは S を通じて参照するだけ。分割してもこのデータフローは一切変わらない（後述）。

### 1.5 共有される重量級 import（分割時の配慮対象）

`Tabs.jsx` 冒頭の import のうち、タブをまたいで使われるもの:

- `ReactDOM`（portal 用）: 全タブで使用（4808/5399/5500/6253/7082/7474/8789）。
- `decision/*`（`evDecision` `VerdictBadge` `KeyMetrics` `ReasonList` `RecentEventList` `confidenceAccuracyLabel`）: 主に **RotTab**（2400 行台・3400 行台）。
- `machineDB` / `searchMachines` / `deriveSpecForMachine`: RotTab + HistoryTab + SettingsTab。
- `MachineSpecWorkspace`: SettingsTab（8918/10171/10337）。
- `C, f, sc, sp, tsNow, font, mono`（constants）/ `Atoms`（NI, Card, MiniStat, Btn, …）/ `persistence`: 全タブ共通基盤。

これらは既に独立モジュール化されているため、分割後も各タブファイルが必要分を個別 import すればよい（Tabs.jsx 経由の再 export には依存していない）。

---

## 2. 分割設計

### 2.1 設計方針（CLAUDE.md 準拠）

- 目的は「**初回ロード JS の削減 = 動作の軽量化**」。CLAUDE.md が禁じる「きれいにしたいだけのリファクタ」ではない、という線引きを明確にする。
- `src/logic.js` は変更しない。`rotRows` の真実源（App.jsx の useLS）を迂回する新データフローは作らない。
- 既存のコンポーネント分割の意図（`decision/` `machines/` 等のディレクトリ責務）に合わせ、Tabs.jsx を「画面（タブ）単位」で割る。過剰な共通化はしない。

### 2.2 分割単位（5 ファイル + 共有 1）

`src/components/tabs/`（新規ディレクトリ）配下にタブ単位で切り出す。

| 新ファイル | 内容 | 概算行数 |
|---|---|---|
| `tabs/RotTab.jsx` | RotTab 本体 + RotTab 専用ヘルパー（YutimeEvCard, SettingPill, SectionHeader, MachinePlaceholder, 各アイコン, dataCardStyle 群, 定数） | 約 5,800 |
| `tabs/SettingsTab.jsx` | SettingsTab 本体 | 約 2,900 |
| `tabs/CalendarTab.jsx` | CalendarTab 本体 | 約 1,100 |
| `tabs/_shared.jsx` | 2 タブ以上で共有するヘルパーのみ（`LineChart` `MultiLineChart` `WageRankCard` `UndoControls` `effectiveEv` 等） | 約 250 |
| （`tabs/DataTab.jsx`） | **未使用のため切り出し不要。削除提案として別途報告**（本タスクでは削除しない） | — |
| （`tabs/HistoryTab.jsx`） | **未使用。同上** | — |

> ヘルパーの帰属判断:
> - **RotTab 専用**（利用が RotTab のみ）: SettingPill, SectionHeader, InfoIcon, YutimeEvCard, MachinePlaceholder, Coin/Swap/Store/HashIcon, LightbulbIcon, PencilIcon, dataCardStyle 群, STABLE_TARGET_ROT, NEXT_CHECKPOINT_ROT → RotTab.jsx 内に同居（共有モジュールへ無理に出さない）。
> - **2 タブ以上で共有**: LineChart（DataTab/RotTab）, MultiLineChart・WageRankCard（DataTab/CalendarTab）, UndoControls・effectiveEv（DataTab/RotTab） → `_shared.jsx`。ただし DataTab を削除すると LineChart は RotTab 専用になるなど帰属が変わるので、**DataTab/HistoryTab の扱いを先に確定させてから _shared の内容を決める**。

### 2.3 後方互換のための薄い再エクスポート（推奨）

既存の import 文（`import { RotTab, SettingsTab } from "./components/Tabs"` / `import { CalendarTab } from "../Tabs"`）を壊さないため、移行期間は `Tabs.jsx` を**バレル（re-export）**に縮退させる:

```js
// src/components/Tabs.jsx（移行後の最終形）
export { default as RotTab } from "./tabs/RotTab";
export { default as SettingsTab } from "./tabs/SettingsTab";
export { default as CalendarTab } from "./tabs/CalendarTab";
```

これにより App.jsx / AnalysisDashboard.jsx の import を**触らずに**段階移行できる（差分最小化）。lazy 化（後述）を入れる段で App 側を `React.lazy` 呼び出しへ書き換える。

### 2.4 ファイル構成案（最終形）

```
src/components/
  Tabs.jsx              ← 薄いバレル（or lazy 集約点）
  tabs/
    RotTab.jsx
    SettingsTab.jsx
    CalendarTab.jsx
    _shared.jsx
```

---

## 3. React.lazy 適用方針と初回ロード削減見込み

### 3.1 適用対象

- 条件レンダーしている **RotTab / CalendarTab(AnalysisDashboard 内) / SettingsTab** を `React.lazy(() => import(...))` 化し、`<Suspense fallback={...}>` で包む。
- 初回起動時の `home` モードは `HomeDashboard`（既に別ファイル）なので、lazy 化により **RotTab(約5,600行) / SettingsTab(約2,900行) / CalendarTab(約1,100行) を初回バンドルから除外**できる。

### 3.2 削減見込み（行数ベースの概算）

現状 Tabs.jsx 11,615 行が初回バンドルに同梱。lazy 化で初回チャンクから外せる行数:

| 切り出し | 初回バンドルから外れる概算行数 |
|---|---|
| RotTab を別チャンク | 約 5,800 |
| SettingsTab を別チャンク | 約 2,900 |
| CalendarTab を別チャンク | 約 1,100 |
| DataTab/HistoryTab 削除（任意） | 約 1,400（dead code 削除のおまけ） |

→ 行数比では Tabs 由来コードの **約 75〜85% を初回ロードから遅延**にできる。バンドル全体 852KB に対する Tabs.jsx の支配率を踏まえると、**初回 JS は数百 KB 規模（概算で 40〜60% 程度）削減が見込める**。正確な数値は実装後の `vite build` のチャンクレポートで測定する（本タスクでは測定しない）。

> 注意: decision/ machines/ 等の依存も、利用元タブのみが import するため、対応する遅延チャンクへ自動的に分離される（rollup の動的 import 解析による）。`MachineSpecWorkspace` とその CSS は SettingsTab チャンクへ寄る見込み。

### 3.3 vite 側のチャンク設定

`React.lazy` の動的 import を入れれば rollup が自動でチャンク分割するため、**`manualChunks` の追加は必須ではない**。500KB 警告対策として react / react-dom を vendor チャンクへ分ける `manualChunks` を任意で追加してよいが、これは「ついで改修」に当たるため**別提案として切り出し、本分割タスクには混ぜない**。

### 3.4 UX 影響と対策（店内体感）

- **懸念**: タブ切替時に未ロードのチャンクを取りに行く → 一瞬の空白。店内回線・実戦中の操作では致命的になりうる。
- **対策（プリロード）**:
  1. `Suspense` の fallback は**真っ白にせず**、最低限の骨格（ダークテーマ背景＋中央に小さなローディング表示）にして 3 秒理解の原則を崩さない。
  2. **記録（record）モードのプリロード**: 実戦で最頻のタブのため、`home` 表示後の `requestIdleCallback`（or `setTimeout`）で `import("./tabs/RotTab")` を**先読み**しておく。さらに ModeTabBar の「記録」ボタンの `onPointerDown` / `onMouseEnter` でプリロードをトリガーすれば、タップ確定前にチャンク取得が始まり体感ゼロ遅延に近づく。
  3. **セッション中（sessionStarted=true）は RotTab を確実に常駐**させる（プリロード済みなら再 import は即時解決）。実戦中にチャンク取得待ちが起きないことを最優先する。
  4. PWA（VitePWA / workbox）が `**/*.js` を precache する設定のため、**2 回目以降の起動では全チャンクがキャッシュ済み**になり、タブ切替の遅延はオフライン同等に消える。初回オンライン起動時のみの考慮で済む。

---

## 4. 段階的移行手順

各フェーズ完了ごとに `npm run lint` / `npm run build` をエラーゼロで通すこと（※本タスクでは実行しない。実装タスク側の必須項目）。各フェーズは独立コミットにし、いつでも 1 コミット revert でロールバック可能にする。

### フェーズ 0: dead code の確定（リスク最小）
- `DataTab` / `HistoryTab` / `FlowValueCard` / `FlowChoiceButton` が本当に未使用かを最終確認（grep 済みだが実装直前に再確認）。
- **削除は提案ベース**で行い、ユーザー承認後に実施。承認が無ければ「未使用だが残す」判断でも以降のフェーズは進む。
- 検証: lint（no-unused 系）、build 成功、機能差分ゼロ（描画されないコードのため挙動不変）。

### フェーズ 1: 物理分割（lazy なし・バレル経由）
- `tabs/CalendarTab.jsx` を最初に切り出す（**最小・依存が軽い 1,100 行・利用元が AnalysisDashboard の 1 箇所のみでリスク最小**）。
- 次に `tabs/SettingsTab.jsx`（利用元 App の 1 箇所、`S` 依存のみ）。
- 最後に `tabs/RotTab.jsx`（最大・依存最多。専用ヘルパーも同居移動）と `tabs/_shared.jsx`。
- `Tabs.jsx` は §2.3 のバレルへ縮退。**App.jsx / AnalysisDashboard.jsx の import 文は変更不要**。
- 各切り出し後の検証:
  - lint / build エラーゼロ。
  - 該当タブの画面表示・主要操作（RotTab: 回転入力→ev 反映、大当たり記録チェーン、Undo / SettingsTab: 各設定変更の保存 / CalendarTab: 日別表示）が従来どおり。
  - **`S` 経由の state 共有が崩れていないこと**（rotRows 入力が ev に反映、Undo が効く）を手動確認。

### フェーズ 2: lazy + Suspense 化（軽量化の本体）
- App.jsx で `RotTab` / `SettingsTab` を `React.lazy` 化し、`<main>` 内のレンダー箇所を `<Suspense>` で包む。AnalysisDashboard 内の `CalendarTab` も同様。
- §3.4 のプリロード（home 表示後の idle で RotTab を先読み + タブボタン hover/pointerdown で先読み）を追加。
- 検証:
  - `vite build` のチャンクレポートで**初回 index チャンクのサイズ低下を実測**（フェーズ前後で比較し本書 §3.2 の見込みを検証）。
  - 初回オンライン起動 → home 表示 → 各タブ切替で空白が体感に出ないか（fallback の見え方）。
  - 実戦シナリオ（記録モードでセッション開始→入力→終了精算）でチャンク待ちが発生しないこと。
  - オフライン 2 回目起動で全タブ即時表示（PWA precache 動作）。

### ロールバック容易性
- 各フェーズが独立コミット。フェーズ 2 で UX 問題（切替遅延）が出たら、**フェーズ 2 のみ revert** すれば物理分割（フェーズ 1）は維持したまま lazy を外せる（バレル経由の同期 import に戻るだけ）。
- フェーズ 1 で問題が出れば該当タブの切り出しコミット単体を revert。バレルがあるため import 側は無傷。

---

## 5. リスクと対策

| リスク | 内容 | 対策 |
|---|---|---|
| **state 共有の崩れ** | 全タブが巨大な `S` オブジェクトを受け取り state を共有。ファイル移動で props 受け渡しが切れると ev 未反映・保存失敗が起きうる | props は一切変えず、ファイル移動のみ行う。`S` の構造・キーは不変。フェーズごとに rotRows 入力→ev 反映、Undo、設定保存を手動確認 |
| **rotRows データフロー** | rotRows の真実源は App.jsx の `useLS("pt_rotRows")`。RotTab は `S.rotRows`/`setRotRows`（および同値の rows/setRows）経由で参照 | 分割は表示層のファイル境界のみ。真実源・データフローは触らない。`logic.js`（calcPreciseEV 等）も不変 |
| **DataTab 内の LineChart 等の帰属** | DataTab を残すか削るかで `_shared.jsx` に置くヘルパーが変わる | フェーズ 0 で DataTab/HistoryTab の扱いを先に確定 → その後 `_shared` を確定 |
| **スワイプ/ジェスチャとの関係** | 現状 App は条件レンダーでタブ切替（タブ間スワイプ専用ジェスチャは App.jsx には見当たらない）。lazy 化でマウント遅延が増えると、もしスワイプ切替がある画面では引っかかりが出うる | record モードは idle プリロード必須。条件レンダー方式自体は維持（lazy はその子を遅延させるだけで切替ロジックは不変） |
| **portal（ReactDOM）の分散** | 各タブが `ReactDOM.createPortal` を使用。分割後も各ファイルが `react-dom` を import すれば問題なし | 各タブファイルで個別 import。共通化不要 |
| **巨大ファイル編集のミス** | RotTab 5,600 行の移動でコピー漏れ・括弧ずれが起きうる | 行範囲を機械的に切り出し（694–6,325 + 専用ヘルパー）、移動直後に build で構文検証 |
| **PWA キャッシュの陳腐化** | チャンク名変更で旧 SW がキャッシュした古い JS を返す恐れ | 既存設定の `cleanupOutdatedCaches: true` + `registerType: 'prompt'` を維持。設定変更しない |

---

## 6. やらないこと（明示的除外）

- **`src/logic.js` の変更**（calcPreciseEV / deriveFromRows / calcCash / calcMochi / useLS 等）。一切触らない。
- **計算式・判断ロジックの変更**（`decision/evDecision.js` の条件等）。
- **保存データ構造 / localStorage キー / `rotRows` の真実源の変更**。rotRows を迂回する新データフローも作らない。
- **過剰な共通化**: RotTab 専用ヘルパーを無理に共有モジュールへ抽出しない。`_shared.jsx` は「2 タブ以上が実際に使う」ものだけに限定。
- **「ついで」の機能改修**: App が RotTab に渡す未使用 `border` prop の削除、props 名 `s`/`S` の統一、dead helper のリネーム等の整理は本タスクに混ぜない（必要なら別提案）。
- **`manualChunks` による vendor 分割**: lazy 化に必須でないため本タスク範囲外（別提案）。
- **DataTab / HistoryTab / FlowValueCard / FlowChoiceButton の削除を無断実施しない**: 未使用と判明しているが、削除はユーザー承認を得た上で別途。本書では「提案」に留める。
- **npm コマンド実行**: 別エージェントが同リポジトリで作業中のため、本調査タスクでは lint/build を実行しない。

---

## 付録: 調査で判明した「想定外の事実」まとめ

1. **`DataTab` と `HistoryTab` は export されているがリポジトリ内のどこからも import されていない**（内部 JSX 利用も 0）。HistoryTab の機能は RotTab へ「移植」済みとコメントに記載（L2890「HistoryTabから完全移植」/ L1659）。合わせて約 1,400 行の dead export。
2. **`FlowValueCard` / `FlowChoiceButton` は利用箇所 0 の dead code**。
3. **App.jsx が RotTab に渡す `border` prop は RotTab のシグネチャに無く未使用**（border は `S.border` で参照されている）。
4. ビルドは**単一 852KB チャンク**でコード分割ゼロ。`vite.config.js` に manualChunks 設定なし。
5. 全タブが App.jsx の条件レンダー（短絡評価）で一度に 1 つしかマウントされず、**lazy 化に構造的に好都合**。
6. PWA（workbox）が全 JS を precache するため、**遅延チャンクの体感遅延は初回オンライン起動時のみ**の考慮で済む。
