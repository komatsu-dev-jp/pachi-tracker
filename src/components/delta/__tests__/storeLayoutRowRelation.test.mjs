import { test } from "node:test";
import assert from "node:assert/strict";

import {
  overlayManualMachineSelections,
  propagateManualMachineSelections,
  relateRowsToStoreLayout,
} from "../storeLayoutRowRelation.js";

const expected52 = [
  ...Array.from({ length: 12 }, (_, index) => String(479 + index)),
  ...Array.from({ length: 11 }, (_, index) => String(499 + index)),
  ...Array.from({ length: 29 }, (_, index) => String(546 + index)),
];

function formalIsland(overrides = {}) {
  return {
    id: "ghoul",
    name: "東京喰種島",
    machineName: "e東京喰種",
    ranges: [
      { start: 509, end: 499 },
      { start: 479, end: 490 },
      { start: 546, end: 574 },
    ],
    ...overrides,
  };
}

test("rangesの降順を含む正式52台を、全台同じ店舗島・機種へ一意照合する", () => {
  const sourceRows = expected52.map((num) => ({ num, normalSpins: 1000 }));
  const result = relateRowsToStoreLayout(sourceRows, { islands: [formalIsland()] });

  assert.equal(result.rows.length, 52);
  assert.equal(result.summary.mappedCount, 52);
  assert.equal(result.summary.reviewCount, 0);
  assert.deepEqual(result.summary.statusCounts, {
    matched: 52,
    "manual-override": 0,
    "machine-conflict": 0,
    ambiguous: 0,
    unmapped: 0,
    "island-only": 0,
  });
  assert.ok(result.rows.every((row) => (
    row.islandId === "ghoul"
      && row.island === "東京喰種島"
      && row.machineName === "e東京喰種"
      && row.storeLayoutRelation.machineNameApplied === true
  )));
  assert.equal(result.rows.some((row) => row.num === "491"), false);
  assert.equal(result.rows.some((row) => row.num === "545"), false);
});

test("島全体より少ない部分写真でも、各台番号が範囲内なら照合できる", () => {
  const rows = [{ num: "480" }, { num: "505" }, { num: "562" }];
  const result = relateRowsToStoreLayout(rows, { islands: [formalIsland()] });

  assert.equal(result.summary.mappedCount, 3);
  assert.ok(result.rows.every((row) => row.storeLayoutRelation.status === "matched"));
  assert.deepEqual(result.rows.map((row) => row.islandId), ["ghoul", "ghoul", "ghoul"]);
});

test("ranges・gaps・降順をislandToNumbersどおり反映し、欠け台を範囲外にする", () => {
  const island = {
    id: "layout",
    name: "飛び番島",
    machineName: "P飛び番",
    ranges: [{ start: 105, end: 100 }, { start: 200, end: 202 }],
    gaps: [102, 201],
  };
  const result = relateRowsToStoreLayout(
    [100, 101, 102, 103, 104, 105, 200, 201, 202].map((num) => ({ num })),
    { islands: [island] },
  );

  const byNumber = new Map(result.rows.map((row) => [String(row.num), row]));
  assert.equal(byNumber.get("102").storeLayoutRelation.status, "unmapped");
  assert.equal(byNumber.get("201").storeLayoutRelation.status, "unmapped");
  for (const num of [100, 101, 103, 104, 105, 200, 202]) {
    assert.equal(byNumber.get(String(num)).storeLayoutRelation.status, "matched");
  }
});

test("資料にある機種名を保持し、店舗管理名と異なる場合だけmachine-conflictにする", () => {
  const rows = [
    { num: 479, machineName: "資料の正式機種名" },
    { num: 480, machineName: "ｅ東京喰種" },
  ];
  const result = relateRowsToStoreLayout(rows, { islands: [formalIsland()] });

  assert.equal(result.rows[0].machineName, "資料の正式機種名");
  assert.equal(result.rows[0].storeLayoutRelation.status, "machine-conflict");
  assert.deepEqual(result.rows[0].storeLayoutRelation.machineConflict, {
    existingMachineName: "資料の正式機種名",
    storeMachineName: "e東京喰種",
  });
  assert.equal(result.rows[1].machineName, "ｅ東京喰種", "NFKCで同じ既存表記を保持する");
  assert.equal(result.rows[1].storeLayoutRelation.status, "matched");
  assert.equal(result.rows[1].storeLayoutRelation.machineNameApplied, false);
});

test("利用者が選んだ機種名は再照合後も手動補正として保持する", () => {
  const result = relateRowsToStoreLayout([{
    num: 479,
    machineName: "e東京喰種W",
    machineNameSource: "manual",
  }], { islands: [formalIsland()] });

  assert.equal(result.rows[0].machineName, "e東京喰種W");
  assert.equal(result.rows[0].machineNameSource, "manual");
  assert.equal(result.rows[0].storeLayoutRelation.status, "manual-override");
  assert.equal(result.rows[0].storeLayoutRelation.machineNameApplied, false);
  assert.equal(result.rows[0].storeLayoutRelation.machineConflict, null);
  assert.equal(result.summary.mappedCount, 1);
  assert.equal(result.summary.reviewCount, 0);
});

test("結果画面の手動機種を同じ台番号の取込確認行へ表示する", () => {
  const imported = [{ num: 479, machineName: "e東京喰種", normalSpins: 1104 }];
  const current = [{ num: 479, machineName: "e東京喰種W", machineNameSource: "manual" }];

  const [overlaid] = overlayManualMachineSelections(imported, current);

  assert.equal(overlaid.machineName, "e東京喰種W");
  assert.equal(overlaid.machineNameSource, "manual");
  assert.equal(overlaid.normalSpins, 1104);
});

test("取込資料が1台欠けても島の手動機種を全結果へ伝播する", () => {
  const resultRows = [479, 480, 481].map((num) => ({
    num,
    islandId: "ghoul",
    island: "東京喰種島",
    machineName: "e東京喰種",
    storeLayoutRelation: { status: "matched", machineNameApplied: true },
  }));
  const importedRows = [479, 480].map((num) => ({
    num,
    islandId: "ghoul",
    machineName: "e東京喰種W",
    machineNameSource: "manual",
  }));

  const propagated = propagateManualMachineSelections(resultRows, importedRows);

  assert.equal(propagated.length, 3);
  assert.ok(propagated.every((row) => row.machineName === "e東京喰種W"));
  assert.ok(propagated.every((row) => row.machineNameSource === "manual"));
  assert.ok(propagated.every((row) => row.storeLayoutRelation.status === "manual-override"));
});

test("巨大な島範囲の誤設定を展開せず照合対象外にする", () => {
  const result = relateRowsToStoreLayout([{ num: 1 }], {
    islands: [{ id: "invalid", name: "誤設定島", start: 1, end: 1_000_000_000 }],
  });

  assert.equal(result.summary.islandCount, 0);
  assert.equal(result.rows[0].storeLayoutRelation.status, "unmapped");
});

test("同じ台番号を含む島が複数ある場合はambiguousで、既存値を推測上書きしない", () => {
  const row = { num: 500, islandId: "source-id", island: "資料島", machineName: "資料機種" };
  const result = relateRowsToStoreLayout([row], {
    islands: [
      { id: "a", name: "A島", machineName: "A機種", start: 499, end: 501 },
      { id: "b", name: "B島", machineName: "B機種", start: 500, end: 502 },
    ],
  });
  const [related] = result.rows;

  assert.equal(related.storeLayoutRelation.status, "ambiguous");
  assert.deepEqual(related.storeLayoutRelation.candidateIslandIds, ["a", "b"]);
  assert.equal(related.islandId, "source-id");
  assert.equal(related.island, "資料島");
  assert.equal(related.machineName, "資料機種");
});

test("店舗範囲外はunmapped、島の機種名が空欄なら島だけをisland-onlyで付与する", () => {
  const result = relateRowsToStoreLayout([
    { num: 999, island: "元島", machineName: "元機種" },
    { num: 700, machineName: "資料機種" },
  ], {
    islands: [{ id: "empty-machine", name: "機種未登録島", machineName: "", start: 700, end: 702 }],
  });

  assert.equal(result.rows[0].storeLayoutRelation.status, "unmapped");
  assert.equal(result.rows[0].island, "元島");
  assert.equal(result.rows[0].machineName, "元機種");
  assert.equal(result.rows[1].storeLayoutRelation.status, "island-only");
  assert.equal(result.rows[1].islandId, "empty-machine");
  assert.equal(result.rows[1].island, "機種未登録島");
  assert.equal(result.rows[1].machineName, "資料機種");
});

test("特定島scopeは重複候補を解消し、選択していない島の番号をunmappedにする", () => {
  const islands = [
    { id: "a", name: "A島", machineName: "A機種", start: 100, end: 102 },
    { id: "b", name: "B島", machineName: "B機種", start: 102, end: 104 },
  ];
  const all = relateRowsToStoreLayout([{ num: 102 }], { islands, scope: "all" });
  assert.equal(all.rows[0].storeLayoutRelation.status, "ambiguous");

  const selected = relateRowsToStoreLayout([{ num: 102 }, { num: 104 }], {
    islands,
    scope: { islandId: "a" },
  });
  assert.equal(selected.rows[0].storeLayoutRelation.status, "matched");
  assert.equal(selected.rows[0].islandId, "a");
  assert.equal(selected.rows[1].storeLayoutRelation.status, "unmapped");
  assert.deepEqual(selected.summary.scope, { type: "island", islandId: "a" });
  assert.equal(selected.summary.scopeFound, true);

  const alias = relateRowsToStoreLayout([{ num: 103 }], {
    islands,
    scopeIslandId: "b",
  });
  assert.equal(alias.rows[0].islandId, "b");
});

test("再照合では過去のstore-layout由来値だけを更新し、利用者の修正は保持する", () => {
  const original = { num: 800, island: "資料島", machineName: "" };
  const first = relateRowsToStoreLayout([original], {
    islands: [{ id: "old", name: "旧島", machineName: "旧機種", start: 800, end: 800 }],
  }).rows[0];
  assert.deepEqual(
    [first.islandId, first.island, first.machineName],
    ["old", "旧島", "旧機種"],
  );

  const updated = relateRowsToStoreLayout([first], {
    islands: [{ id: "new", name: "新島", machineName: "新機種", start: 800, end: 800 }],
  }).rows[0];
  assert.deepEqual(
    [updated.islandId, updated.island, updated.machineName],
    ["new", "新島", "新機種"],
    "変更されていない店舗由来値は新しい店舗設定へ更新する",
  );

  const userEdited = { ...updated, machineName: "利用者が選んだ機種" };
  const afterUserEdit = relateRowsToStoreLayout([userEdited], {
    islands: [{ id: "new", name: "新島", machineName: "さらに新しい機種", start: 800, end: 800 }],
  }).rows[0];
  assert.equal(afterUserEdit.machineName, "利用者が選んだ機種");
  assert.equal(afterUserEdit.storeLayoutRelation.status, "machine-conflict");

  const unmapped = relateRowsToStoreLayout([updated], { islands: [] }).rows[0];
  assert.equal(unmapped.storeLayoutRelation.status, "unmapped");
  assert.equal(unmapped.islandId, "");
  assert.equal(unmapped.island, "資料島", "元の資料島へ戻す");
  assert.equal(unmapped.machineName, "", "元が空欄だった店舗補完機種を残さない");
});
