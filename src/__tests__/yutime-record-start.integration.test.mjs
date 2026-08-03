import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRecordStartDraft, createStrategyMapYutimeInitialContext, createYutimeRecordStartSelection, resolveRecordStartSpecSapo, shouldDiscardSameDayResumeForYutimeAction } from "../recordStartFlow.js";
import { deriveSpecForMachine, machineDB } from "../machineDB.js";
import { deriveNormalExpectedNetBalls } from "../components/yutime/yutimeCalculator.js";
import { createSameDayResumeCandidate, createSameDayResumeStart } from "../sameDayResume.js";

test("yutime fresh start creates one complete draft through the standard record flow", () => {
  const selection = createYutimeRecordStartSelection({ storeId: "s", storeName: "店", machineName: "台", machineNum: "12", currentLowSpins: 450, assumedStart1K: 18, rentBalls: 250, exRate: 280, investPace: 1000, synthDenom: 319, spec1R: 140, specAvgRounds: 10, specSapo: 0, yutimeSession: { targetingEnabled: true } });
  const draft = createRecordStartDraft({ id: "one", selection, stores: [{ id: "s", name: "店", chodama: 5000 }], rentBalls: 250, exRate: 250 });
  assert.equal(draft.source, "yutime-calculator");
  assert.equal(draft.machineNum, "12");
  assert.equal(draft.startRot, 450);
  assert.equal(draft.yutimeLowSpins, 450);
  assert.equal(draft.rentBalls, 250);
  assert.equal(draft.exRate, 280);
  assert.equal(draft.initialChodama, 5000);
});

test("candidate discard is limited to successful replace, move, and update actions", () => {
  assert.equal(shouldDiscardSameDayResumeForYutimeAction("start"), false);
  assert.equal(shouldDiscardSameDayResumeForYutimeAction("onConfirm"), false);
  assert.equal(shouldDiscardSameDayResumeForYutimeAction("replace"), true);
  assert.equal(shouldDiscardSameDayResumeForYutimeAction("move"), true);
  assert.equal(shouldDiscardSameDayResumeForYutimeAction("update"), true);
});

test("fresh yutime start delegates to the standard draft callback instead of direct setters", async () => {
  const source = await readFile(new URL("../components/yutime/YutimeCalculatorSheet.jsx", import.meta.url), "utf8");
  assert.match(source, /S\.startRecordFromSelection\(createYutimeRecordStartSelection/);
  assert.match(source, /if \(startAction === "start"\) \{[\s\S]*?return;/);
});

test("strategy-map passes displayed store and machine context to the yutime sheet", async () => {
  const source = await readFile(new URL("../components/strategy/StrategyMapDashboard.jsx", import.meta.url), "utf8");
  assert.match(source, /createStrategyMapYutimeInitialContext\(/);
  const context = createStrategyMapYutimeInitialContext({ storeId: "B", storeName: "店舗B", machineNum: 668 });
  const draft = createRecordStartDraft({
    id: "displayed-B",
    selection: createYutimeRecordStartSelection({ storeId: context.initialStoreId, storeName: context.initialStoreName, machineName: "機種", machineNum: context.initialMachineNum }),
    stores: [{ id: "A", name: "店舗A", chodama: 5000, exRate: 280 }, { id: "B", name: "店舗B", chodama: 700, exRate: 250 }],
    rentBalls: 250,
    exRate: 280,
  });
  assert.equal(draft.storeId, "B");
  assert.equal(draft.machineNum, "668");
  assert.equal(draft.initialChodama, 700);
});

test("negative support correction survives the full yutime and same-day-start chain", async () => {
  const machine = machineDB.find((item) => item.spec1R === 140 && item.specAvgTotalRounds === 42.8 && item.specSapo === -800);
  const spec = deriveSpecForMachine(machine);
  const selection = createYutimeRecordStartSelection({ machineName: machine.name, specSapo: spec.specSapo });
  const draft = createRecordStartDraft({ id: "negative", selection, stores: [], rentBalls: 250, exRate: 250 });
  assert.equal(resolveRecordStartSpecSapo({ draft, machineSpecSapo: spec.specSapo }), -800);
  const strategyDraft = createRecordStartDraft({ id: "strategy", selection: { machineName: machine.name }, stores: [], rentBalls: 250, exRate: 250 });
  assert.equal(resolveRecordStartSpecSapo({ draft: strategyDraft, machineSpecSapo: spec.specSapo }), -800);
  assert.equal(deriveNormalExpectedNetBalls({ spec1R: spec.spec1R, specAvgRounds: spec.specAvgRounds, specSapo: spec.specSapo }), 5192);
  const candidate = createSameDayResumeCandidate({ candidateId: "resume", businessDate: "2026-08-03", createdAt: "2026-08-03T00:00:00.000Z", storeId: "s", storeName: "store", machineName: machine.name, machineNum: "1", balls: 100, carriedValueYen: 400 });
  for (const mode of ["mochi", "cash"]) {
    assert.equal(createSameDayResumeStart({ candidate, mode, existingChodamaBalls: 5000 }).playMode, mode);
    assert.equal(deriveNormalExpectedNetBalls({ spec1R: spec.spec1R, specAvgRounds: spec.specAvgRounds, specSapo: spec.specSapo }), 5192);
  }
  assert.equal(resolveRecordStartSpecSapo({ draft: { specSapo: "bad" }, machineSpecSapo: undefined }), 0);
  const rotSource = await readFile(new URL("../components/tabs/RotTab.jsx", import.meta.url), "utf8");
  assert.match(rotSource, /resolveRecordStartSpecSapo\(/);
  assert.match(rotSource, /S\.setSpecSapo\(previous\.specSapo\)/);
});
