import assert from "node:assert/strict";
import test from "node:test";
import { MACHINE_SORT_OPTIONS, sortMachines } from "../../../machineSort.js";

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
