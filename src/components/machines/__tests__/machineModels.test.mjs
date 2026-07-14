import assert from "node:assert/strict";
import {
  machineDB,
  machineModelRegistry,
  searchMachines,
} from "../../../machineDB.js";
import { normalizeMachine } from "../machineSpecModel.js";

assert.equal(Object.keys(machineModelRegistry).length, 84, "正式型式レジストリは84件必要です");
const targetMachines = Object.keys(machineModelRegistry).map((name) => {
  const machine = machineDB.find((item) => item.name === name);
  assert.ok(machine, `${name}: 型式登録対象が機種DBにありません`);
  return machine;
});

for (const machine of targetMachines) {
  assert.equal(machine.modelVerified, true, `${machine.name}: 型式確認状態`);
  assert.ok(machine.modelName?.trim(), `${machine.name}: 正式型式が空です`);
  assert.match(machine.modelSourceUrl, /^https:\/\//, `${machine.name}: 確認元URL`);
  assert.equal(machine.modelUpdatedAt, "2026-07-13", `${machine.name}: 型式確認日`);
  const normalized = normalizeMachine(machine);
  assert.equal(normalized.modelName, machine.modelName, `${machine.name}: 詳細表示への型式連携`);
  assert.equal(normalized.modelVerified, true, `${machine.name}: 詳細表示への確認状態連携`);
}

const modelCodeResults = searchMachines("LTM-JH");
assert.ok(
  modelCodeResults.some((machine) => machine.name === "e真・一騎当千～軍神覚醒～ 396ver."),
  "正式型式コードで機種検索できません",
);

console.log("machineModels: 型式84件 PASS");
