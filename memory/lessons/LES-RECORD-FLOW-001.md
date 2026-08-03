---
id: LES-RECORD-FLOW-001
type: lesson
department: record-flow
status: active
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
  - src/__tests__/record-start-flow.test.mjs
  - src/__tests__/same-day-resume-store-balance.integration.test.mjs
  - src/__tests__/yutime-record-start.integration.test.mjs
source_incidents:
  - INC-20260802-001
supersedes: null
---

# 一行ルール

同じ稼働開始へ入る全入口を共通フローへ合流させ、店舗ID・同日再開候補・終了方法の組合せを統合テストする。

# 適用する場合

- [事実] 通常、台選び、店舗詳細、遊タイムなど、同じ稼働開始を起動する入口を追加または変更する場合。
- [事実] 店舗貯玉の初期化、同日再開候補の照合・消費、開始後の保存へ影響する場合。

# 適用しない場合

- [事実] 稼働開始状態を変更しない表示だけの変更。
- [事実] 台移動や稼働中更新など、既存記録を維持する別契約の操作。これらを新規開始と同じ初期化処理へ強制的に通さない。

# 手順

1. 入口は個別に開始状態を更新せず、共通の record-start draft（開始情報の一時データ）を作る。
2. 店舗残高は表示名ではなく店舗IDで解決し、明示された0を欠落として扱わない。
3. 同日再開候補は対象日・店舗・機種・台の一致を確認し、開始成功前に破棄しない。
4. 新規開始、置換、台移動、更新の契約を分け、既存記録を意図せず初期化しない。
5. 全入口に加え、残高、持ち玉/現金、終了方法の組合せを統合テストする。

# 検証

- [事実] 2026-08-02 に対象3テストファイル、計26件が成功した。
- [事実] 同日再開について、2残高 × 2開始モード × 3終了方法の12組合せが成功した。
- [事実] 独立検証と Sol 最終レビュー `APPROVE` が確認済みである。

# 根拠

- [事実] 根本原因は、入口固有の状態更新が店舗残高解決と候補ライフサイクルを迂回できたことにある。
- [事実] 共通フローへ合流後、通常・台選び・店舗詳細・遊タイムの入口と12組合せの回帰テストが成功した。
- [事実] `memory/INDEX.md` と `memory/` 全件を確認し、同内容の既存 lesson はなかった。

# 見直しのきっかけ

- 稼働開始の入口、同日再開候補の照合キー、店舗IDの扱い、終了方法が増減したとき。
- 共通フローを通らない開始処理が必要になったとき。

# 独立確認者

[事実] `pachi_verifier` が実装者とは別に検証し、`pachi_reviewer`（Sol）が `APPROVE` と判定した。

# 推測・未確認

[推測] なし。適用範囲は上記の開始フローと関連状態に限定する。
