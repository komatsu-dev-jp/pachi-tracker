import test from "node:test";
import assert from "node:assert/strict";
import { resolveStoreDetail } from "../storeDetailSelectors.js";
import { buildStoreDetailPanels, DETAIL_KEYS } from "../storeDetailPanels.js";

const store = {
  id: "store-1",
  name: "テストホール",
  address: "愛媛県松山市",
  rentBalls: 250,
  exRate: 280,
  chodama: 1000,
  memberCard: { created: true, number: "12345678", deposit: 3000 },
};

test("全詳細キーにタイトル・内訳・関連操作を持つパネルが存在する", () => {
  const data = resolveStoreDetail([store], store.id, { archives: [], chodamaLog: [] });
  const panels = buildStoreDetailPanels(data);

  for (const key of Object.values(DETAIL_KEYS)) {
    assert.ok(panels[key], `${key} の詳細パネルがありません`);
    assert.ok(panels[key].title, `${key} のタイトルがありません`);
    assert.ok(Array.isArray(panels[key].sections), `${key} の内訳がありません`);
    assert.ok(["record", "settings"].includes(panels[key].action), `${key} の関連操作がありません`);
  }
});

test("空データの詳細だけ表示例になり、通常カードの集計値は0のまま", () => {
  const data = resolveStoreDetail([store], store.id, { archives: [], chodamaLog: [] });
  const panels = buildStoreDetailPanels(data);

  assert.equal(data.dataSufficiency.validRecords, 0);
  assert.equal(panels[DETAIL_KEYS.RECORDS].demo, true);
  assert.equal(panels[DETAIL_KEYS.MACHINES].demo, true);
  assert.equal(panels[DETAIL_KEYS.WEEKDAYS].demo, true);
  assert.equal(panels[DETAIL_KEYS.TIME_SLOTS].demo, true);
  assert.equal(panels[DETAIL_KEYS.STORE_BALLS].demo, true);
  assert.match(panels[DETAIL_KEYS.RECORDS].sections[0].rows[0].label, /サンプル/);
});

test("実データがある詳細にはサンプルを混ぜない", () => {
  const data = resolveStoreDetail([store], store.id, {
    archives: [{
      id: "actual",
      storeId: store.id,
      date: "2026-07-17",
      time: "14:00",
      machineName: "実機種",
      investYen: 1000,
      recoveryYen: 2000,
      decisionSnapshots: [{ action: "continue", reason: "実際の理由", checkpointK: 5 }],
    }],
    chodamaLog: [{ id: "balance", storeId: store.id, date: "2026-07-17", type: "deposit", balls: 100 }],
  });
  const panels = buildStoreDetailPanels(data);

  assert.equal(panels[DETAIL_KEYS.RECORDS].demo, false);
  assert.equal(panels[DETAIL_KEYS.MACHINES].demo, false);
  assert.equal(panels[DETAIL_KEYS.WEEKDAYS].demo, false);
  assert.equal(panels[DETAIL_KEYS.TIME_SLOTS].demo, false);
  assert.equal(panels[DETAIL_KEYS.JUDGMENT_GOOD].demo, false);
  assert.equal(panels[DETAIL_KEYS.STORE_BALLS].demo, false);
  assert.equal(panels[DETAIL_KEYS.RECORDS].sections[0].rows[0].label, "実機種");
  assert.doesNotMatch(JSON.stringify(panels[DETAIL_KEYS.RECORDS]), /サンプル/);
});
