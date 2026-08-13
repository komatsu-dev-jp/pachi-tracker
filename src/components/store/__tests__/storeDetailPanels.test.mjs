import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("範囲外の貸玉詳細は4円・25玉と警告根拠を表示する", () => {
  const data = resolveStoreDetail([{ ...store, rentBalls: 39 }], store.id);
  const panel = buildStoreDetailPanels(data)[DETAIL_KEYS.RENTAL_RATE];
  assert.equal(panel.hero.value, "4円パチンコ");
  assert.deepEqual(panel.sections[0].rows[0], { label: "状態", value: "範囲外の保存値を4円貸しで仮表示中" });
  assert.equal(panel.sections[0].rows[1].value, "25玉");
});

test("正常な貸玉詳細には仮表示の状態行を出さない", () => {
  const data = resolveStoreDetail([{ ...store, rentBalls: 1000 }], store.id);
  const panel = buildStoreDetailPanels(data)[DETAIL_KEYS.RENTAL_RATE];

  assert.notEqual(panel.sections[0].rows[0].label, "状態");
});

test("店舗詳細は範囲外貸玉の共通警告を表示する", async () => {
  const source = await readFile(new URL("../../../pages/StoreDetail.jsx", import.meta.url), "utf8");

  assert.match(source, /data\.rentBallsWarning/);
  assert.match(source, /role="alert"/);
  assert.match(source, /保存値が範囲外のため4円貸し（25玉\/100円）で仮表示中です/);
  assert.match(source, /onClick=\{onOpenSettings\}/);
  assert.match(source, /min-h-11/);
  assert.match(source, /設定トップで訂正/);
  assert.ok(
    source.indexOf("data.rentBallsWarning") > source.indexOf("</nav>")
      && source.indexOf("data.rentBallsWarning") < source.indexOf('activeTab === "overview"')
  );
});
