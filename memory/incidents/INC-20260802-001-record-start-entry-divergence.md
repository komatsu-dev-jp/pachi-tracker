---
id: INC-20260802-001
type: incident
department: record-flow
status: promoted
created_at: 2026-08-02
verified_at: 2026-08-02
review_after: 2027-02-02
owner: pachi-memory-curator
scope:
  - record-start entry points
  - store balance initialization
  - same-day resume candidate lifecycle
evidence:
  - src/recordStartFlow.js
  - src/App.jsx
  - src/components/tabs/RotTab.jsx
  - src/components/yutime/YutimeCalculatorSheet.jsx
  - src/__tests__/record-start-flow.test.mjs
  - src/__tests__/same-day-resume-store-balance.integration.test.mjs
  - src/__tests__/yutime-record-start.integration.test.mjs
duplicate_of: null
promoted_to: LES-RECORD-FLOW-001
---

# 想定した結果

[事実] 通常、台選び、店舗詳細、遊タイムなど、どの入口から稼働開始しても、選択した店舗の貯玉と同日再開候補が同じ規則で処理される。

# 実際の結果

[事実] 入口ごとに開始処理が分かれていたため、一部入口では共通の店舗貯玉解決処理または同日再開候補のライフサイクルを通らなかった。

# 影響

[事実] 直前店舗の残高が新しい記録へ混入する、または同日再開候補が早く消費されたり残留したりする可能性があった。

# 再現手順

[事実] 異なる店舗残高を用意し、各入口から新規開始した後、同日再開の持ち玉・現金モードと終了方法を組み合わせると、入口固有処理が共通規則を外れる経路を確認できた。

# 根本原因

[事実] 同じ「稼働開始」という操作が複数の入口固有 setter に分散し、店舗IDによる残高解決と候補の消費時点が一つの契約になっていなかった。

# 対策

[事実] 各入口を `createRecordStartDraft` と共通の開始処理へ合流させ、店舗残高は店舗IDで解決し、同日再開候補は開始処理が成功する時点で扱うようにした。

# 検証

[事実] 通常・台選び・店舗詳細・遊タイムの入口、店舗残高、同日再開の持ち玉/現金、3終了方法を対象にした単体・統合テストが追加された。2026-08-02 に shared memory 管理者が対象3ファイルを再実行し、26件すべて成功した。申し送りでは全体テスト成功、独立検証成功、Sol の最終レビュー `APPROVE` が確認済みである。

# 再利用できる予防策の候補

[事実] 意味が同じ開始操作に入口が増える場合、状態更新を入口へ複製せず共通フローへ合流させ、入口・保存残高・候補・終了方法の組合せを統合テストする。

# 独立確認者

[事実] `pachi_verifier` が実装者とは別に検証し、`pachi_reviewer`（Sol）が最終レビューで `APPROVE` と判定した。

# 推測・未確認

[推測] なし。上記は実装、テスト、および検証済み申し送りで確認した範囲に限定する。
