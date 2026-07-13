import assert from "node:assert/strict";
import { machineDB } from "../../../machineDB.js";
import {
  buildMultiRoundHit,
  getMachineRoundOptions,
  parseRoundOptions,
} from "../machineRoundOptions.js";

const machine = (name) => {
  const found = machineDB.find((item) => item.name === name);
  assert.ok(found, `${name} が機種マスタにありません`);
  return found;
};

const signatures = (options) => options.map(({ rounds, mult }) => `${rounds}R×${mult}`);

assert.deepEqual(
  signatures(parseRoundOptions("2R or 10R×2～6＋α")),
  ["2R×1", "10R×2", "10R×6"],
  "複数候補と倍率範囲を抽出できること",
);

const hissatsuRush = signatures(getMachineRoundOptions(machine("ぱちんこ 必殺仕事人Ⅵ"), "rush"));
assert.deepEqual(
  hissatsuRush,
  ["10R×1", "10R×2", "10R×4"],
  "簡易rushDistに無い10R×2・10R×4も詳細振分から取得すること",
);

const ghoulHeso = signatures(getMachineRoundOptions(machine("e 東京喰種 超デカ超一撃ver."), "heso"));
assert.ok(ghoulHeso.includes("10R×2"), "東京喰種の10R×2を選択できること");
assert.ok(ghoulHeso.includes("10R×5"), "東京喰種の10R×5を選択できること");

const hit6000 = buildMultiRoundHit(1, {
  rounds: 10,
  mult: 4,
  displayBalls: 1500,
  lastOutBalls: 1000,
  nextTimingBalls: 7000,
  elecSapoRot: 100,
  time: "test-time",
});
assert.equal(hit6000.hitNumber, 1, "大当たり回数は1回のまま");
assert.equal(hit6000.rawRounds, 10, "表示用の1セットR数を保持");
assert.equal(hit6000.mult, 4, "セット回数を保持");
assert.equal(hit6000.rounds, 40, "集計用R数は10R×4=40R");
assert.equal(hit6000.displayBalls, 6000, "液晶出玉は1500×4=6000玉");
assert.equal(hit6000.sapoChange, 0, "増減計算でも合計出玉を使うこと");

const hit3000 = buildMultiRoundHit(2, {
  rounds: 10,
  mult: 2,
  displayBalls: 1500,
  time: "test-time",
});
assert.equal(hit3000.rounds, 20, "10R×2=20R");
assert.equal(hit3000.displayBalls, 3000, "1500×2=3000玉");
assert.equal(hit6000.rounds + hit3000.rounds, 60, "実践全体の総R数も正しく合算できること");

const normalHit = buildMultiRoundHit(3, {
  rounds: 3,
  displayBalls: 450,
  time: "test-time",
});
assert.equal(normalHit.rounds, 3, "通常の単一大当たりは従来どおり");
assert.equal(normalHit.displayBalls, 450, "通常の出玉は従来どおり");

console.log("machineRoundOptions: all tests passed");
