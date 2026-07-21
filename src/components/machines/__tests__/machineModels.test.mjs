import assert from "node:assert/strict";
import {
  machineDB,
  machineModelRegistry,
  machineYutimeRegistry,
  getYutimeSelectionMachines,
  searchMachines,
  yutimeReferenceMachines,
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

const verifiedYutime = machineDB.find((machine) => machine.name === "仮面ライダー轟音")?.yutime;
assert.deepEqual(
  [verifiedYutime?.triggerLowSpins, verifiedYutime?.durationSpins, verifiedYutime?.expectedNetBalls],
  [950, 1200, 6756],
  "確認済み遊タイムデータを自動入力できません",
);

const partialYutime = machineDB.find((machine) => machine.name === "PA新海物語")?.yutime;
assert.equal(partialYutime?.expectedNetBalls, 1260.07, "公開シミュレーションの遊タイム平均獲得玉を連携します");

assert.equal(machineDB.length, 125, "98機種に監査済み遊タイム27スペックを統合します");
assert.equal(Object.keys(machineYutimeRegistry).length, 98, "98機種すべてに遊タイム監査結果が必要です");
const yutimeStatusCounts = machineDB.reduce((counts, machine) => {
  counts[machine.yutimeAudit?.status] = (counts[machine.yutimeAudit?.status] || 0) + 1;
  return counts;
}, {});
assert.deepEqual(yutimeStatusCounts, {
  "not-equipped": 90,
  equipped: 34,
  "not-applicable": 1,
}, "統合後125スペックの搭載・非搭載・対象外分類");

const equippedConditions = {
  "仮面ライダー轟音": [950, 1200],
  "ジューシーハニー3": [623, 946],
  "大海物語5 甘デジ": [299, 379],
  "Pとある魔術の禁書目録": [800, 1214],
  "P大海物語5スペシャル": [950, 350],
  "PA大海物語5 Withアグネス・ラム": [299, 379],
  "PA新海物語": [299, 379],
};
for (const [name, expected] of Object.entries(equippedConditions)) {
  const machine = machineDB.find((item) => item.name === name);
  assert.ok(machine, `${name}: 遊タイム搭載機が見つかりません`);
  assert.deepEqual([machine.yutime?.triggerLowSpins, machine.yutime?.durationSpins], expected, `${name}: 発動条件`);
  assert.match(machine.yutime?.sourceUrl || "", /^https:\/\//, `${name}: 根拠URL`);
}
assert.equal(machineDB.find((machine) => machine.name === "e大海物語5スペシャル")?.yutimeAudit?.status, "not-equipped", "e機とP機を混同してはいけません");

assert.equal(yutimeReferenceMachines.length, 27, "2024～2026年の遊タイム参照スペック数");
for (const machine of yutimeReferenceMachines) {
  assert.equal(machine.modelVerified, true, `${machine.name}: 型式確認状態`);
  assert.ok(machine.modelName, `${machine.name}: 正式型式`);
  assert.equal(machine.yutimeAudit?.status, "equipped", `${machine.name}: 搭載状態`);
  assert.ok(machine.yutime?.triggerLowSpins > 0, `${machine.name}: 発動回転数`);
  assert.match(machine.yutime?.sourceUrl || "", /^https:\/\//, `${machine.name}: 根拠URL`);
  assert.ok(machine.yutime?.expectedNetBalls > 0, `${machine.name}: 遊タイム平均獲得玉`);
  assert.ok(machine.normalExpectedNetBalls > 0, `${machine.name}: 通常時平均獲得玉`);
  assert.match(machine.normalExpectedNetBallsMethod || "", /^(published-simulation|allocation-derived|border-derived)$/, `${machine.name}: 通常時平均獲得玉の算出根拠`);
  assert.ok(machine.avgPayoutPerHit > 0, `${machine.name}: 大当り1回平均出玉`);
  assert.ok(machine.hesoAvgPayout > 0, `${machine.name}: ヘソ平均出玉`);
  assert.ok(machine.rushAvgPayout > 0, `${machine.name}: RUSH平均出玉`);
  assert.ok(machine.border1K > 0, `${machine.name}: 等価ボーダー`);
  assert.ok(machine.stdDev > 0, `${machine.name}: P-EVIDENCE標準偏差`);
  assert.equal(machine.stdDevMethod, "p-evidence-branching-v2", `${machine.name}: 標準偏差算出方式`);
}
const kabuki87 = yutimeReferenceMachines.find((machine) => machine.modelName === "PA花の慶次～傾奇一転N");
assert.equal(kabuki87?.yutime?.expectedNetBalls, 1329.5, "87ver.は確認済み遊タイム平均獲得玉を登録します");
assert.equal(kabuki87?.synthProb, 87.84, "87ver.は確認済み大当り確率を登録します");
const norimono59 = yutimeReferenceMachines.find((machine) => machine.modelName === "PA乗物娘2GO2");
assert.equal(norimono59?.yutime?.triggerLowSpins, 160, "59ver.は公式資料どおり低確率160回転で登録します");
const garo = searchMachines("牙狼 甘デジ").find((machine) => machine.modelName === "PA激デジ牙狼月虹ノ旅人-RL");
assert.ok(garo, "PA激デジ牙狼を通常の機種検索から選べます");
assert.equal(garo.avgPayoutPerHit, 244.48, "PA激デジ牙狼の初当り平均出玉");
const eacModes = searchMachines("eACわんわんセレブレーション");
assert.equal(eacModes.length, 2, "2in1機は77ver.と49ver.を別々に選べます");
assert.equal(getYutimeSelectionMachines().length, 125, "統合後の全スペックを遊タイム選択画面へ連携します");

console.log("machineModels: 型式84件 + 125スペック遊タイム監査 + 参照27スペック PASS");
