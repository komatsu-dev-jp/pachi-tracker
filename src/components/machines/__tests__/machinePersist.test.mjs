// 機種スペック編集 → カスタム機種保存（buildMachineOverride）の「矛盾なし」検査。
// 実行: node src/components/machines/__tests__/machinePersist.test.mjs
//
// 検査の狙い:
//  T1 無編集セーブは元データを変えない（fallback 既定値の捏造ゼロ）
//  T2 R数の往復（parse→行→build）が記録フローの抽出結果を保つ
//  T3 R数を編集すると roundDist にその通り反映され、比率合計=100
//  T4 同名カスタムが searchMachines 先頭でビルトインを上書きする（記録フローが拾うのは編集値）
//  T5 buildMachineOverride は machineDB（ビルトイン）を一切変更しない

import assert from "node:assert";
import { searchMachines, machineDB } from "../../../machineDB.js";
import {
  normalizeMachine,
  buildMachineOverride,
  sumRatio,
} from "../machineSpecModel.js";

// 記録フローと同一のラウンド抽出（Tabs.jsx getMachineRounds 相当）
const flowRounds = (dist) => {
  const m = (dist || "").match(/(\d+)R/g);
  return m ? [...new Set(m.map((x) => parseInt(x, 10)))].sort((a, b) => a - b) : null;
};

let passed = 0;
let failed = 0;
const out = {};
function check(name, fn) {
  try {
    fn();
    out[name] = "PASS";
    passed++;
  } catch (e) {
    out[name] = `FAIL: ${e.message}`;
    failed++;
  }
}

// ── T1: 無編集セーブは元データを変えない ──
check("T1_無編集セーブは元データ保全", () => {
  const src = structuredClone(machineDB[0]); // P大海物語5 MTE2
  const model = normalizeMachine(src); // 一切編集しない
  const ov = buildMachineOverride(src, model);

  // 読み取り専用スペックは完全保全（捏造・改変なし）
  assert.strictEqual(ov.synthProb, src.synthProb, "synthProb");
  assert.strictEqual(ov.spec1R, src.spec1R, "spec1R");
  assert.strictEqual(ov.specAvgTotalRounds, src.specAvgTotalRounds, "specAvgTotalRounds");
  assert.deepStrictEqual(ov.border, src.border, "border");
  assert.strictEqual(ov.avgPayoutPerHit, src.avgPayoutPerHit, "avgPayoutPerHit");
  // 振分も元と一致（roundDist は件数不一致のため生値フォールバックで保全）
  assert.strictEqual(ov.roundDist, src.roundDist, "roundDist");
  assert.strictEqual(ov.rushDist, src.rushDist, "rushDist");
  assert.deepStrictEqual(ov.hesoDist, src.hesoDist, "hesoDist");
  assert.strictEqual(ov.isCustom, true, "isCustom");
});

// ── T2: R数の往復が記録フロー抽出を保つ ──
check("T2_R数往復が記録フロー抽出を保つ", () => {
  const src = {
    name: "テスト機A",
    synthProb: 319.6,
    hesoDist: [{ payout: 600, rate: 40 }, { payout: 1500, rate: 60 }],
    roundDist: "4R:40%, 10R:60%",
  };
  const model = normalizeMachine(src);
  const ov = buildMachineOverride(src, model);
  assert.deepStrictEqual(
    flowRounds(ov.roundDist),
    flowRounds(src.roundDist),
    `往復不一致: ${ov.roundDist}`
  );
  assert.deepStrictEqual(flowRounds(ov.roundDist), [4, 10]);
  assert.strictEqual(sumRatio(model.heso), 100, "比率合計100");
});

// ── T3: R数編集が roundDist へ反映され、比率合計=100 ──
check("T3_R数編集がroundDistへ反映", () => {
  const src = {
    name: "テスト機B",
    synthProb: 319.6,
    hesoDist: [{ payout: 450, rate: 30 }, { payout: 1500, rate: 70 }],
    roundDist: "3R:30%, 10R:70%",
  };
  const model = normalizeMachine(src);
  // ユーザーが R数を 3R→2R、10R→9R に編集したと仮定
  const edited = {
    ...model,
    heso: [
      { ...model.heso[0], rounds: "2", ratio: "30" },
      { ...model.heso[1], rounds: "9", ratio: "70" },
    ],
  };
  const ov = buildMachineOverride(src, edited);
  assert.deepStrictEqual(flowRounds(ov.roundDist), [2, 9], `roundDist=${ov.roundDist}`);
  assert.strictEqual(sumRatio(edited.heso), 100, "比率合計100");
});

// ── T4: 同名カスタムが searchMachines 先頭でビルトインを上書き ──
check("T4_カスタムがビルトインを上書き", () => {
  const builtin = machineDB[0]; // P大海物語5 MTE2 (roundDist 10R)
  const src = structuredClone(builtin);
  const model = normalizeMachine(src);
  // ユーザーが初当たり振分を 3R/7R に編集
  const edited = {
    ...model,
    heso: [
      { ...model.heso[0], rounds: "3", ratio: "50" },
      { ...model.heso[1], rounds: "7", ratio: "50" },
    ],
  };
  const override = buildMachineOverride(src, edited);

  const results = searchMachines(builtin.name, [override]);
  assert.strictEqual(results[0].name, builtin.name, "先頭が同名");
  assert.strictEqual(results[0].isCustom, true, "先頭がカスタム");
  // 記録フローが拾うラウンドは編集値（ビルトインの[10]ではない）
  assert.deepStrictEqual(flowRounds(results[0].roundDist), [3, 7], `roundDist=${results[0].roundDist}`);
  assert.notDeepStrictEqual(flowRounds(results[0].roundDist), flowRounds(builtin.roundDist));
});

// ── T5: buildMachineOverride は machineDB を変更しない ──
check("T5_machineDB不変", () => {
  const before = JSON.stringify(machineDB[0]);
  const model = normalizeMachine(machineDB[0]);
  const edited = {
    ...model,
    heso: model.heso.map((h, i) => ({ ...h, rounds: i === 0 ? "5" : "8" })),
    avgPayout: "9,999",
  };
  buildMachineOverride(machineDB[0], edited); // 入力（machineDB[0]）を破壊しないこと
  assert.strictEqual(JSON.stringify(machineDB[0]), before, "machineDB[0] が変更された");
});

// ── T6: 基本スペック編集がカスタム機種へ保存される ──
check("T6_基本スペック編集を保存", () => {
  const src = structuredClone(machineDB[0]);
  const model = normalizeMachine(src);
  const edited = {
    ...model,
    name: "P大海物語5 MTE2 修正版",
    maker: "三洋物産",
    type: "ハイミドル",
    synthProb: "318.1",
    border1K: "17.9",
    prize: "3",
    unitCost: "12.5",
    initialProb: "0.55",
    muraCoef: "50000",
    spatialSens: "1.2",
    regimeSens: "0.9",
    mcExpectedDaily: "1234",
    mcWinRate: "55.5",
  };
  const ov = buildMachineOverride(src, edited);
  assert.strictEqual(ov.name, "P大海物語5 MTE2 修正版", "name");
  assert.strictEqual(ov.maker, "三洋物産", "maker");
  assert.strictEqual(ov.synthProb, 318.1, "synthProb");
  assert.strictEqual(ov.prob, "1/318.1", "prob");
  assert.strictEqual(ov.border1K, 17.9, "border1K");
  assert.strictEqual(ov.border["4.00"], 17.9, "border.4.00");
  assert.strictEqual(ov.unitCost, 12.5, "unitCost");
  assert.strictEqual(ov.initialProb, 0.55, "initialProb");
  assert.strictEqual(ov.muraCoef, 50000, "muraCoef");
  assert.strictEqual(ov.spatialSens, 1.2, "spatialSens");
  assert.strictEqual(ov.regimeSens, 0.9, "regimeSens");
  assert.strictEqual(ov.mcExpectedDaily, 1234, "mcExpectedDaily");
  assert.strictEqual(ov.mcWinRate, 55.5, "mcWinRate");
});

console.log(JSON.stringify(out, null, 2));
console.log(`\n${passed} passed / ${failed} failed`);
if (failed > 0) process.exit(1);
