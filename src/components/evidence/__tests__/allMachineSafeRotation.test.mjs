import assert from "node:assert/strict";
import { machineDB } from "../../../machineDB.js";
import {
  buildDeltaEvidence,
  estimateDeltaObservation,
  findMachineSpec,
  machineBorder,
  resolveMachineStats,
} from "../../delta/deltaEvidence.js";
import { buildPEvidenceAnalytics } from "../pevidenceAnalytics.js";

const DAILY_INPUT_BALLS = 11750;
const FOUR_DAY_INPUT_BALLS = DAILY_INPUT_BALLS * 4;
const SESSION_STD_DEV_STRESS_VALUE = 99999;

function scansFor(machine, border) {
  const observedRate = Math.max(5.1, Math.min(44.9, border + 0.5));
  const dailyHits = [12, 12, 12, 13];
  return dailyHits.map((totalStarts, index) => {
    const day = String(index + 1).padStart(2, "0");
    const date = `2026-07-${day}`;
    const baseRow = {
      date,
      island: "全機種監査島",
      machineName: machine.name,
      num: "1",
      normalSpins: Math.round(observedRate * DAILY_INPUT_BALLS / 250) + (index % 2),
      totalStarts,
    };
    const payoutProbe = estimateDeltaObservation({ ...baseRow, val: 0 }, machine);
    assert.ok(
      Number.isFinite(payoutProbe.estimatedPayoutBalls),
      `${machine.name}: 機種別の大当り計数方式から監査用の払出玉を作れる`,
    );
    return {
      id: `all-machine-safe-rotation-${machine.name}-${day}`,
      storeId: "all-machine-safe-rotation-audit",
      storeName: "全機種回帰テスト店",
      date,
      createdAt: `${date}T20:00:00.000Z`,
      rows: [{
        ...baseRow,
        val: payoutProbe.estimatedPayoutBalls - DAILY_INPUT_BALLS,
      }],
    };
  });
}

// 正式名は同名の別名より必ず優先し、全マスターが自分自身へ解決されること。
for (const machine of machineDB) {
  assert.strictEqual(
    findMachineSpec(machine.name, [], machineDB),
    machine,
    `${machine.name}: 正式名が別機種の別名に奪われない`,
  );
}

// 77ver. と49ver.の両方に使われる短縮名は推測で片方へ結び付けない。
assert.equal(
  findMachineSpec("eACわんわんセレブレーション", [], machineDB),
  null,
  "複数型式にまたがる曖昧な別名は未登録扱いにする",
);

const analyzedMachines = [];
const borderUnavailableMachines = [];
for (const machine of machineDB) {
  const border = machineBorder(machine);
  const stats = resolveMachineStats(machine);

  assert.equal(
    resolveMachineStats({ ...machine, stdDev: 1000 }).payoutStdDevPerHit,
    resolveMachineStats({ ...machine, stdDev: SESSION_STD_DEV_STRESS_VALUE }).payoutStdDevPerHit,
    `${machine.name}: セッション収支標準偏差を大当り1回の出玉誤差へ流用しない`,
  );
  assert.doesNotMatch(
    stats.payoutStdDevSource,
    /session|2200/i,
    `${machine.name}: 大当り1回の出玉誤差にセッション由来の値を使わない`,
  );

  const sampleRow = {
    normalSpins: 800,
    totalStarts: 12,
    val: 12 * stats.avgPayout - DAILY_INPUT_BALLS,
  };
  if (!(border > 0)) {
    borderUnavailableMachines.push(machine.name);
    const evidence = buildDeltaEvidence([sampleRow], machine);
    assert.equal(evidence.hasEstimate, false, `${machine.name}: ボーダー未登録なら予測しない`);
    assert.equal(evidence.reason, "ボーダー未設定");
    continue;
  }

  assert.ok(stats.avgPayout > 0, `${machine.name}: 分析対象には1回平均出玉が必要`);
  const scans = scansFor(machine, border);
  const effectiveMachine = { ...machine, dataUpdatedAt: "9999-12-30" };
  const base = buildPEvidenceAnalytics({
    scans,
    customMachines: [effectiveMachine],
  });
  const stressed = buildPEvidenceAnalytics({
    scans,
    customMachines: [{
      ...effectiveMachine,
      stdDev: SESSION_STD_DEV_STRESS_VALUE,
    }],
  });
  const row = base.currentRows[0];
  const stressedRow = stressed.currentRows[0];

  assert.ok(row?.valid, `${machine.name}: 4日・${FOUR_DAY_INPUT_BALLS.toLocaleString()}玉の監査行を計算できる`);
  assert.equal(row.machine?.name, machine.name, `${machine.name}: 正式な機種マスターを使用する`);
  assert.equal(
    Math.round(row.cumulativeInputBalls),
    FOUR_DAY_INPUT_BALLS,
    `${machine.name}: 共通監査条件の投入玉`,
  );
  assert.ok(
    Number.isFinite(row.decisionLowerRotation),
    `${machine.name}: 判断用下限を計算できる`,
  );
  assert.ok(
    row.decisionLowerRotation >= 10,
    `${machine.name}: 4日・${FOUR_DAY_INPUT_BALLS.toLocaleString()}玉で判断用下限が10回/k未満へ崩れない`,
  );
  assert.equal(
    stressedRow?.decisionLowerRotation,
    row.decisionLowerRotation,
    `${machine.name}: セッション収支標準偏差を変えても判断用下限は変わらない`,
  );
  analyzedMachines.push(machine.name);
}

assert.equal(
  analyzedMachines.length + borderUnavailableMachines.length,
  machineDB.length,
  "全機種を分析済みまたは安全停止へ分類する",
);
assert.ok(analyzedMachines.length >= 100, "全機種監査が一部の代表機種だけになっていない");
assert.deepEqual(
  borderUnavailableMachines.sort(),
  [
    "P NEW TOKIO ハカマタイプ",
    "e ソードアート・オンライン アリシゼーション 夜空",
  ].sort(),
  "ボーダー未登録機種は仮値で予測せず安全停止する",
);

console.log(
  `allMachineSafeRotation.test.mjs: ${analyzedMachines.length}機種を計算、`
  + `${borderUnavailableMachines.length}機種を安全停止、全${machineDB.length}機種 passed`,
);
