import test from "node:test";
import assert from "node:assert/strict";
import EHIME_STORES from "../data/ehimeStores.js";
import { EHIME_STORE_RATE_CHECKED_AT } from "../data/ehimeStoreRates.js";
import {
  RATE_UNCONFIRMED_REASON,
  STORE_RATE_STATUS,
  deriveStoreRateStatus,
  formatExchangeRate,
  formatPachinkoRateResearchSummary,
  formatResearchDate,
} from "../storeRateResearch.js";

test("内蔵34店舗すべてに確認日とみんパチ参照元を記録する", () => {
  assert.equal(EHIME_STORES.length, 34);
  assert.equal(new Set(EHIME_STORES.map((store) => store.name)).size, 34);
  for (const store of EHIME_STORES) {
    assert.equal(store.rateResearch?.sourceLabel, "みんパチ", store.name);
    assert.equal(store.rateResearch?.checkedAt, EHIME_STORE_RATE_CHECKED_AT, store.name);
    assert.match(store.rateResearch?.sourceUrl || "", /^https:\/\/minpachi\.com\//, store.name);
    assert.equal(store.rateResearch?.status, deriveStoreRateStatus(store.pachinkoRates), store.name);
  }
});

test("全店舗の確認状態を確認済み・一部確認・未確認に分ける", () => {
  const counts = EHIME_STORES.reduce((result, store) => {
    result[store.rateResearch.status] = (result[store.rateResearch.status] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    [STORE_RATE_STATUS.UNCONFIRMED]: 26,
    [STORE_RATE_STATUS.VERIFIED]: 6,
    [STORE_RATE_STATUS.PARTIAL]: 2,
  });
});

test("代表店舗の複数レートと未確認理由を保持する", () => {
  const byName = new Map(EHIME_STORES.map((store) => [store.name, store]));
  assert.deepEqual(
    byName.get("丸之内ヘリオス2000竹原").pachinkoRates.map((rate) => [rate.lendingYen, rate.exchangeBallsPer100Yen]),
    [[4, 25.5], [1, 108]],
  );
  assert.equal(
    byName.get("ナングン東温店").rateResearch.unconfirmedReason,
    RATE_UNCONFIRMED_REASON.NO_PACHINKO,
  );
});

test("一覧表示向けの表記を整形する", () => {
  assert.equal(
    formatPachinkoRateResearchSummary([
      { lendingYen: 4, exchangeBallsPer100Yen: 25 },
      { lendingYen: 1, exchangeBallsPer100Yen: null },
    ]),
    "4円: 等価（25玉/100円） / 1円: 非等価・具体値未確認",
  );
  assert.equal(formatExchangeRate({ lendingYen: 4, exchangeBallsPer100Yen: null }), "非等価・具体値未確認");
  assert.equal(formatResearchDate("2026-07-25"), "2026/07/25");
});
