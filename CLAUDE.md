# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

-----

## プロジェクト概要

パチンコ店内で稼働中に使うセッション記録・期待値計算 PWA。
ユーザーは片手操作・騒音環境・時間的プレッシャーの中で使う。

技術スタック: React 19 + Vite 7 + vite-plugin-pwa + localStorage 永続化。テストランナーは導入されていない（lint と build が唯一の検証手段）。

-----

## コマンド

```bash
npm install        # 依存関係
npm run dev        # 開発サーバー（Vite）
npm run lint       # ESLint（flat config、dist は無視）
npm run build      # 本番ビルド（dist/）
npm run preview    # ビルド成果物のローカル確認
```

### ビルド検証（必須）

ファイルを作成・修正したら、必ず以下を実行してからコミットする：

```bash
npm run lint
npm run build
```

両方がエラーゼロで通ること。警告は内容を確認して報告する。

### ESLint 特記事項

`eslint.config.js` は `no-unused-vars` に `varsIgnorePattern: '^[A-Z_]'` を設定している。大文字始まり・アンダースコア始まりの変数は「未使用」警告の対象外になる（`_unused` 慣習と、React コンポーネント定義が区別されない場合の回避のため）。通常の未使用変数は error になる。

### デプロイ

- `.github/workflows/deploy.yml` が `main` への push で GitHub Pages にデプロイする。
- `vite.config.js` の `base: '/pachi-tracker/'` により、本番アセットは `/pachi-tracker/` サブパスから配信される。ローカルと本番で絶対パス参照の挙動が変わる点に注意。

-----

## アーキテクチャ（全体像）

### 状態の一元管理 — `src/App.jsx`

`App.jsx` が**すべての**アプリ状態を `useState` / `useLS` で保持し、`S` という 1 つのオブジェクトに束ねて子コンポーネントへ props で渡す。ルーター・Context・Redux などは使わない。新しい状態を追加する場合は `App.jsx` に追加し、`S` に含め、関連タブコンポーネントの署名を更新する。

- 永続化は `useLS(key, init)`（`src/logic.js`）。localStorage キーは全て `pt_` プレフィックス（現在 51 個）。キー名を変えると既存ユーザーのデータがリセットされる — 互換性を考慮すること。
- ボトムナビのタブは 3 つ: `rot`（新規稼働 / `RotTab`）、`calendar`（記録 / `CalendarTab`）、`settings`（設定 / `SettingsTab`）。`DataTab` と `HistoryTab` は `RotTab` 内のサブタブとして使われる。
- PIN ロック（`appLock` + `appPin`）が有効な場合、アプリ本体の前にフルスクリーンの PIN 画面を描画する分岐が `App.jsx` 末尾にある。
- `main.jsx` はアプリを `ErrorBoundary` で包み、クラッシュ時に「データをリセットして再起動」（`localStorage.clear()`）のリカバリ UI を出す。PWA Service Worker 登録と「新バージョン利用可能」バナーもここ。

### 計算エンジン — `src/logic.js`

このアプリの存在意義そのもの。数式の誤りはユーザーの金銭的損失に直結する。

- **`deriveFromRows(rotRows, startRot, rentBalls)`**: `rotRows` から `netRot` / `cashKCount` / `mochiKCount` / `chodamaKCount` を導出する唯一の関数。`thisRot` の単純合計を使うことで「大当たり後の累積回転数リセット」に影響されない設計になっている。ここを迂回するデータフローを作らない。
- **`calcPreciseEV({...})`**: 1Kスタート・理論ボーダー・実測ボーダー・期待値/K・仕事量・時給を一括算出。完了した `jpLog` チェーン（`completed: true`）を集計し、機種スペック（`spec1R`, `specAvgRounds`, `specSapo`）があればそれ優先、なければ手動 `border` へフォールバック。`evSource` フィールドで `"spec" | "border" | "none"` を返す。
- **`calcCash` / `calcMochi`**: 旧互換のフォールバック経路。現金と持ち玉の計算パスは明確に分離されている — 混ぜない。
- `rotRows` が回転数の **Single Source of Truth**。

### UI — `src/components/`

- `Atoms.jsx`: 再利用 UI（`NI` 数値入力、`Card`、`Btn`、`KV`、`MiniStat`、`ModeToggle`、`ModeBadge`）。
- `Tabs.jsx`: **6600 行超の単一ファイル**に 5 つの Tab コンポーネント（`DataTab` / `RotTab` / `HistoryTab` / `CalendarTab` / `SettingsTab`）、カスタム `NumericKeypad`、`LineChart` を格納。意図的にこの構造になっている — 統合・分割を提案する前に既存の理由を確認すること。
- スタイルは `src/index.css` の CSS カスタムプロパティ（`--bg`, `--surface`, `--blue`, ...）をベースにしたインライン style。テーマは `data-theme` 属性と `high-contrast` / `color-blind` クラスで切り替え。アクセントカラーは `App.jsx` の `COLOR_THEMES` 配列から `--blue` と `--accent-grad` を上書きする方式。
- 色参照は `src/constants.js` の `C` オブジェクト経由（`C.blue` → `var(--blue)`）。フォーマッタ `f()`、符号付きフォーマッタ `sp()`、符号カラー `sc()` も同じファイル。

### データ構造

#### `rotRows`（回転記録 — SSOT）
行の `type` は `"start"` / `"data"` / `"hit"`。`data` 行のみが計算に使われ、`mode: "cash" | "mochi" | "chodama"`、`thisRot`（その区間の回転数）、`invest`（累計投資）、`ballsConsumed`（持ち玉/貯玉モード時の消費玉）を持つ。

#### `jpLog` v3（大当たりチェーン）
localStorage キーは `pt_jpLog3`（v2 からのマイグレーションを避けるため番号付き）。構造：

```javascript
{
  chainId, trayBalls, hitRot,
  hits: [{ hitNumber, rounds, displayBalls, actualBalls,
           lastOutBalls, nextTimingBalls, sapoChange }],
  completed: boolean,
  finalBalls,
  summary: { totalRounds, totalDisplayBalls, totalSapoRot,
             totalSapoChange, netGain }
}
```

`completed: true` のチェーンのみ `calcPreciseEV` に集計される。削除処理（`delJPLast`）は `currentMochiBalls` と `totalTrayBalls` の減算が必要 — この整合性を壊さないこと（過去のバグ箇所）。

#### 貯玉（`chodama`）
`includeChodamaInBalance` フラグで収支に含めるかを切り替える。日付変更時に `chodamaUsedToday` を自動リセット（`chodamaLastDate` と現在日を比較）。

### PWA

`vite-plugin-pwa` が Service Worker を自動生成。`registerType: 'autoUpdate'`、`cleanupOutdatedCaches: true`、`skipWaiting: true`、`clientsClaim: true`。キャッシュ破棄が関わる不具合を修正する場合は、ユーザー側の SW 更新が必要になる点をリリースノートに明記する。

-----

## 設計原則

### 1. UIは「店内で片手で使える」が最優先

ユーザーはパチンコ台の前で、玉を打ちながら操作する。
あらゆるUI変更は「操作ステップが1つでも減るか？」で判断する。

- タップ領域は最低44px以上、理想は48px以上
- 視認性 > 美しさ。ダークテーマ・高コントラスト・大きな数字
- 装飾的な要素は追加しない。情報密度を上げるための工夫は歓迎する
- 迷ったら「忙しい人が3秒で理解できるか？」を基準にする

### 2. 計算ロジック（logic.js）は心臓部

`logic.js` にある期待値計算・仕事量・ボーダー計算は、このアプリの存在意義そのもの。
数式の誤りは「ユーザーの金銭的損失」に直結する。

**守るべきルール：**

- `deriveFromRows`, `calcCash`, `calcMochi`, `useLS` は既に検証済みの関数。変更する場合は、変更前後の計算結果を境界値（0, 極端に大きい値, 負数）で比較して提示すること
- `rotRows` が回転数の唯一の真実源（Single Source of Truth）。ここを迂回するデータフローを作らない
- 現金（`calcCash`）と持ち玉（`calcMochi`）の計算パスは明確に分離されている。混ぜない
- 期待値計算の基本式を変更する場合は、数学的根拠を説明してから実装する

### 3. 状態管理との整合性

`App.jsx` の `useState` / `useLS` で状態を一元管理している。

- 新しい状態を追加する場合は、既存の状態との依存関係を確認してから実装する
- 矛盾が生じそうな場合は、実装を止めて設計案を提示する
- localStorage との永続化ロジック（`useLS`）を壊さないこと
- localStorage キー名（`pt_*`）を変更すると既存ユーザーのデータが失われる

### 4. コードベースの安定性

多数のマージを経て現在の安定性がある。

- リファクタリングは「動作の軽量化」または「バグ修正」に直結する場合のみ行う
- 「きれいにしたい」だけの理由でファイル構成を変えない（特に `Tabs.jsx` の単一ファイル構造）
- 既存のコンポーネント分割には理由があるので、統合・分割する前に既存構造の意図を確認する

-----

## 実行ルール

### コミットメッセージ

日本語で、変更内容が一目でわかるように書く。

```
fix: サポ増減の計算で電サポ回転数が0の場合のゼロ除算を修正
feat: 大当たり記録画面にサポ開始/終了時持ち玉入力フィールドを追加
refactor: rotRows導出ロジックの不要な中間変数を削除
```

### 変更の報告

実装完了時に以下を含めること：

1. 何を変えたか（差分の要約）
2. なぜ変えたか（目的）
3. 計算ロジックに触れた場合 → 境界値での検算結果
4. UI に触れた場合 → 操作ステップ数の変化

### 言語

日本語のみ。UI ラベルに英語を使わない。
