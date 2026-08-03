import assert from "node:assert/strict";
import test from "node:test";
import { createSameDayResumeCandidate, createSameDayResumeStart } from "../sameDayResume.js";
import { updateStoresForSessionReset } from "../settingsUtils.js";
import { createRecordStartDraft, resolveRecordStartChodama, setupInitialChodamaFromDraft } from "../recordStartFlow.js";

const candidate = createSameDayResumeCandidate({ candidateId: "resume", businessDate: "2026-08-03", createdAt: "2026-08-03T01:00:00.000Z", storeId: "store-1", storeName: "store", machineName: "machine", machineNum: "12", balls: 1500, carriedValueYen: 6000 });
const stores = [{ id: "store-1", chodama: 5000 }];

function beginFromRecordDraft(balance) {
  const sourceStores = [{ id: "store-1", chodama: balance }];
  const draft = createRecordStartDraft({ id: "draft", selection: { storeId: "store-1", machineName: "machine" }, stores: sourceStores, rentBalls: 250, exRate: 250 });
  return resolveRecordStartChodama(sourceStores, draft.storeId, setupInitialChodamaFromDraft(draft));
}

for (const existingChodamaBalls of [5000, 3800]) {
  for (const mode of ["mochi", "cash"]) {
    for (const endMethod of ["cash", "same_day_hold", "chodama"]) {
      test(`same-day ${mode} resume preserves ${existingChodamaBalls} store balls after ${endMethod}`, () => {
      const start = createSameDayResumeStart({ candidate, mode, startRot: 120, yutimeLowSpins: 450, existingChodamaBalls: beginFromRecordDraft(existingChodamaBalls) });
      assert.equal(start.initialChodama, existingChodamaBalls);
      assert.equal(start.currentChodama, existingChodamaBalls);
      assert.equal(start.startRow.chodamaBalls, existingChodamaBalls);
      assert.equal(start.startRow.cumRot, 120);
      assert.equal(start.startRow.yutimeLowSpins, 450);
      assert.equal(start.playMode, mode);
      assert.equal(start.initialMochiBalls, mode === "mochi" ? 1500 : 0);
      assert.equal(start.currentMochiBalls, mode === "mochi" ? 1500 : 0);
      assert.equal(start.carriedInYen, mode === "mochi" ? 6000 : 0);
      const settled = updateStoresForSessionReset(stores, {
        selectedStoreId: "store-1",
        currentChodama: start.currentChodama,
        extraChodama: endMethod === "chodama" ? 1500 : 0,
      });
      assert.equal(settled[0].chodama, endMethod === "chodama" ? existingChodamaBalls + 1500 : existingChodamaBalls);
    });
    }
  }
}
