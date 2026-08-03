---
id: LES-ECONOMICS-001
type: lesson
department: economics
status: active
created_at: 2026-08-02
verified_at: 2026-08-02
review_after: 2027-02-02
owner: pachi-memory-curator
scope:
  - signed optional numeric values
  - record-start handoff and cancellation restore
  - expected payout inputs
evidence:
  - src/recordStartFlow.js
  - src/components/tabs/RotTab.jsx
  - src/__tests__/record-start-flow.test.mjs
  - src/__tests__/yutime-record-start.integration.test.mjs
  - src/components/yutime/__tests__/yutimeCalculator.test.mjs
source_incidents:
  - INC-20260802-002
supersedes: null
---

# 一行ルール

符号付き任意数値は負値・明示0・欠落を別状態として扱い、有限値判定と `??` で引き継ぎ、本番と同じ計算連鎖までテストする。

# 適用する場合

- [事実] サポート増減など、負値と0がどちらも有効で、欠落時だけ既定値へ戻す数値。
- [事実] 機種情報、開始 draft、画面 state、保存、計算の間で任意数値を引き継ぐ場合。

# 適用しない場合

- [事実] 玉数や回転数など、仕様上0以上に制限される値。これらは別の非負 resolver を使う。
- [事実] 空欄を明示0と同じ意味にすることが仕様として確認済みの入力。

# 手順

1. 値の型を確認し、空文字、非数、無限値を欠落として扱う。
2. 有限な数値なら負値と0をそのまま保持する。
3. 値の有無は truthy/falsy ではなく、プロパティの存在と `undefined` で判断する。
4. 既定値への切替は `??` を使い、`|| 0` や `>= 0` で有効値を落とさない。
5. キャンセル時は変更前の値を復元する。
6. 負値・0・欠落・無効値・本番と同じ計算連鎖・キャンセル復元をテストする。

# 検証

- [事実] 負値、0、欠落、無効値が共通 resolver と開始 draft で区別されるテストが成功した。
- [事実] 負値が遊タイム開始、通常開始、同日再開の持ち玉/現金、期待出玉計算まで保持される統合テストが成功した。
- [事実] キャンセル復元と未登録機種の0を含む回帰確認、独立検証、Sol 最終レビュー `APPROVE` が完了している。

# 根拠

- [事実] 根本原因は、非負条件と `||` が有限な負値、明示0、欠落を区別できないことだった。
- [事実] 有限値 resolver、存在判定、`??` を組み合わせた後、対象の単体・統合テストが成功した。
- [事実] `memory/INDEX.md` と `memory/` 全件を確認し、同内容の既存 lesson はなかった。

# 見直しのきっかけ

- 符号や欠落の仕様、保存形式、開始 draft、期待出玉式が変わるとき。
- 数値変換や既定値処理を共通化・置換するとき。

# 独立確認者

[事実] `pachi_verifier` が実装者とは別に検証し、`pachi_reviewer`（Sol）が `APPROVE` と判定した。

# 推測・未確認

[推測] なし。影響率は入力条件で変わるため、特定の割合を一般化しない。
