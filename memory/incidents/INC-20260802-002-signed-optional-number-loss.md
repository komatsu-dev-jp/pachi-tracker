---
id: INC-20260802-002
type: incident
department: economics
status: promoted
created_at: 2026-08-02
verified_at: 2026-08-02
review_after: 2027-02-02
owner: pachi-memory-curator
scope:
  - specSapo handoff
  - signed optional numeric normalization
  - expected payout inputs
evidence:
  - src/recordStartFlow.js
  - src/components/tabs/RotTab.jsx
  - src/components/yutime/yutimeCalculator.js
  - src/__tests__/record-start-flow.test.mjs
  - src/__tests__/yutime-record-start.integration.test.mjs
  - src/components/yutime/__tests__/yutimeCalculator.test.mjs
duplicate_of: null
promoted_to: LES-ECONOMICS-001
---

# 想定した結果

[事実] サポート増減値は、有限な負値、明示0、欠落を区別したまま機種情報から開始 draft、画面状態、期待出玉計算へ渡る。

# 実際の結果

[事実] `>= 0` による採用条件や `Number(value) || 0` による既定化では、有限な負値が拒否され、明示0と欠落も同じ状態へ潰れる経路があった。

# 影響

[事実] 負の補正値が0として計算されると、検証対象の本番連鎖条件では期待出玉が約15%過大になり得た。

# 再現手順

[事実] 負のサポート増減値を持つ機種情報から遊タイム選択、共通開始 draft、同日開始、期待出玉計算へ渡し、途中で0へ変わる経路を確認した。明示0と欠落でも別々に確認した。

# 根本原因

[事実] 「数値として有限か」「符号を許すか」「値が欠落しているか」の3条件を、非負判定や truthy/falsy 判定（0などを偽とみなす判定）で一括処理していた。

# 対策

[事実] 有限な符号付き数値だけを返し、欠落は `undefined` のまま保つ resolver（値を決める共通処理）を導入した。引き継ぎはプロパティの有無と `??` で判断し、開始キャンセル時は以前の値を復元する。

# 検証

[事実] 負値、明示0、欠落、無効値、本番連鎖条件、同日再開の持ち玉/現金、キャンセル復元、未登録機種の0をテストした。2026-08-02 に shared memory 管理者が関連する対象テストを再実行し成功した。申し送りでは全体テスト成功、独立検証成功、Sol の最終レビュー `APPROVE` が確認済みである。

# 再利用できる予防策の候補

[事実] 符号付き任意数値は、有限性・符号・欠落を別々に扱い、`||` や非負条件を既定化に使わない。境界テストには負値・0・欠落・キャンセル復元・本番と同じ連鎖を含める。

# 独立確認者

[事実] `pachi_verifier` が実装者とは別に検証し、`pachi_reviewer`（Sol）が最終レビューで `APPROVE` と判定した。

# 推測・未確認

[推測] なし。約15%は検証対象条件での影響であり、全機種へ一律に当てはめない。
