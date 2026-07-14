import assert from "node:assert/strict";
import {
  machineDB,
  machineModelRegistry,
  searchMachines,
} from "../../../machineDB.js";
import { normalizeMachine } from "../machineSpecModel.js";

const targetMachines = machineDB.filter((machine) => machine.allocationVerified !== true);

assert.equal(targetMachines.length, 84, "対象の未検証機種数が84件から変わっています");
assert.equal(Object.keys(machineModelRegistry).length, 84, "正式型式レジストリは84件必要です");

for (const machine of targetMachines) {
  assert.equal(machine.modelVerified, true, `${machine.name}: 型式確認状態`);
  assert.ok(machine.modelName?.trim(), `${machine.name}: 正式型式が空です`);
  assert.match(machine.modelSourceUrl, /^https:\/\//, `${machine.name}: 確認元URL`);
  assert.equal(machine.modelUpdatedAt, "2026-07-13", `${machine.name}: 型式確認日`);
  assert.notEqual(machine.allocationVerified, true, `${machine.name}: 振り分け状態を変更してはいけません`);

  const normalized = normalizeMachine(machine);
  assert.equal(normalized.modelName, machine.modelName, `${machine.name}: 詳細表示への型式連携`);
  assert.equal(normalized.modelVerified, true, `${machine.name}: 詳細表示への確認状態連携`);
}

const modelCodeResults = searchMachines("LTM-JH");
assert.ok(
  modelCodeResults.some((machine) => machine.name === "e真・一騎当千～軍神覚醒～ 396ver."),
  "正式型式コードで機種検索できません",
);

const verifiedYutime = machineDB.find((machine) => machine.name === "仮面ライダー轟音")?.yutime;
assert.deepEqual(
  [verifiedYutime?.triggerLowSpins, verifiedYutime?.durationSpins, verifiedYutime?.expectedNetBalls],
  [950, 1200, 6756],
  "確認済み遊タイムデータを自動入力できません",
);
const partialYutime = machineDB.find((machine) => machine.name === "PA新海物語")?.yutime;
assert.equal(partialYutime?.expectedNetBalls, null, "期待出玉の根拠がない機種を推測で補完してはいけません");

console.log("machineModels: 84件 PASS");
