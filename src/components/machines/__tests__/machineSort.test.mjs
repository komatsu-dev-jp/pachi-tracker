import assert from "node:assert/strict";
import test from "node:test";
import {
  MACHINE_PROBABILITY_FILTER_OPTIONS,
  MACHINE_SORT_OPTIONS,
  filterMachines,
  getMachineMakerKey,
  sortMachines,
} from "../../../machineSort.js";

const machines = [
  { name: "P北斗10", maker: "サミー", synthProb: 349, dataUpdatedAt: "2026-06-01" },
  { name: "eエヴァ17", maker: "ビスティ", synthProb: 399, dataUpdatedAt: "2026-07-01" },
  { name: "PA海物語", maker: "三洋", synthProb: 99, dataUpdatedAt: "2026-05-01" },
  { name: "カスタム機", maker: "", prob: "未設定" },
];

test("並び替え項目を提供する", () => {
  assert.deepEqual(
    MACHINE_SORT_OPTIONS.map((option) => option.value),
    ["default", "name-asc", "name-desc", "maker-asc", "prob-asc", "prob-desc", "updated-desc"],
  );
});

test("登録順は元配列を変更せず維持する", () => {
  const result = sortMachines(machines, "default");
  assert.notEqual(result, machines);
  assert.deepEqual(result, machines);
});

test("機種名順では型式記号を除いた作品名で比較する", () => {
  assert.deepEqual(
    sortMachines(machines, "name-asc").map((machine) => machine.name),
    ["eエヴァ17", "カスタム機", "PA海物語", "P北斗10"],
  );
  assert.deepEqual(
    sortMachines([
      { name: "PFかのじょ" },
      { name: "Pえゔぁ" },
      { name: "PAうみ" },
    ], "name-asc").map((machine) => machine.name),
    ["PAうみ", "Pえゔぁ", "PFかのじょ"],
  );
});

test("メーカー順では未設定を最後にする", () => {
  assert.deepEqual(
    sortMachines(machines, "maker-asc").map((machine) => machine.maker),
    ["サミー", "ビスティ", "三洋", ""],
  );
});

test("大当り確率は軽い順・重い順にでき、未設定は最後にする", () => {
  assert.deepEqual(
    sortMachines(machines, "prob-asc").map((machine) => machine.synthProb),
    [99, 349, 399, undefined],
  );
  assert.deepEqual(
    sortMachines(machines, "prob-desc").map((machine) => machine.synthProb),
    [399, 349, 99, undefined],
  );
});

test("更新日は新しい順に並べ、未設定を最後にする", () => {
  assert.deepEqual(
    sortMachines(machines, "updated-desc").map((machine) => machine.dataUpdatedAt),
    ["2026-07-01", "2026-06-01", "2026-05-01", undefined],
  );
});

test("メーカーの英字・日本語表記を同じグループとして扱う", () => {
  assert.equal(getMachineMakerKey({ maker: "KYORAKU" }), "京楽");
  assert.equal(getMachineMakerKey({ maker: "京楽" }), "京楽");
  assert.equal(getMachineMakerKey({ maker: "Sammy" }), "サミー");
  assert.equal(getMachineMakerKey({ maker: "サミー" }), "サミー");
});

test("タイプ・メーカー・確率帯を組み合わせて絞り込む", () => {
  const candidates = [
    { name: "A", maker: "KYORAKU", type: "スマパチ", synthProb: 349 },
    { name: "B", maker: "京楽", type: "ライトミドル・LT", synthProb: 199.9 },
    { name: "C", maker: "SANKYO", type: "ライトミドル", synthProb: 129.9 },
    { name: "D", maker: "Sammy", type: "スマパチ", synthProb: 319.9 },
  ];

  assert.deepEqual(
    filterMachines(candidates, { maker: "京楽" }).map((machine) => machine.name),
    ["A", "B"],
  );
  assert.deepEqual(
    filterMachines(candidates, { type: "ライトミドル", probability: "130-199" }).map((machine) => machine.name),
    ["B"],
  );
  assert.deepEqual(
    filterMachines(candidates, { maker: "サミー", probability: "200-319" }).map((machine) => machine.name),
    ["D"],
  );
});

test("確率帯の表示項目を提供する", () => {
  assert.deepEqual(
    MACHINE_PROBABILITY_FILTER_OPTIONS.map((option) => option.value),
    ["all", "under-130", "130-199", "200-319", "over-320"],
  );
});
