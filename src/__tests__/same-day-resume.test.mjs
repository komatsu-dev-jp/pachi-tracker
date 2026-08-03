import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canCreateSameDayResumeCandidate, createOneTimeStartGuard, createSameDayResumeCandidate, createSameDayResumeStart, isSameDayResumeExpired, matchSameDayResumeCandidate, normalizeSameDayResumeCandidate, resolveSameDayResumeSettlement } from "../sameDayResume.js";
const candidate = createSameDayResumeCandidate({ candidateId: "a", businessDate: "2026-08-02", createdAt: "2026-08-02T01:00:00.000Z", storeId: 1, storeName: "店", machineName: "台", machineNum: "12", balls: 100, carriedValueYen: 400 });
test("normalizes only valid candidates", () => { assert.equal(normalizeSameDayResumeCandidate({ version: 1, balls: 0 }), null); assert.equal(candidate.balls, 100); });
test("matches exact identity and empty-number fallback only", () => { assert.equal(matchSameDayResumeCandidate(candidate, { businessDate: "2026-08-02", storeId: 1, machineName: "台", machineNum: "12" }).matched, true); assert.equal(matchSameDayResumeCandidate(candidate, { businessDate: "2026-08-02", storeId: 1, machineName: "台", machineNum: "" }).matched, false); assert.equal(matchSameDayResumeCandidate({ ...candidate, machineNum: "" }, { businessDate: "2026-08-02", storeId: 1, machineName: "台", machineNum: "" }).fallback, true); });
test("expires on a different business date and builds one-time start state", () => { assert.equal(isSameDayResumeExpired(candidate, "2026-08-03"), true); assert.deepEqual(createSameDayResumeStart({ candidate, mode: "mochi", startRot: 12, yutimeLowSpins: 500, existingChodamaBalls: 5000 }).startRow, { type: "start", cumRot: 12, yutimeLowSpins: 500, mode: "mochi", mochiBalls: 100, chodamaBalls: 5000 }); assert.equal(createSameDayResumeStart({ candidate, mode: "cash", existingChodamaBalls: 0 }).carriedInYen, 0); });
test("keeps a non-negative integer store balance for either resume mode", () => { assert.equal(createSameDayResumeStart({ candidate, mode: "cash", existingChodamaBalls: -1 }).currentChodama, 0); assert.equal(createSameDayResumeStart({ candidate, mode: "mochi", existingChodamaBalls: 12.6 }).initialChodama, 13); });
test("one-time guard rejects a second start before a second row can be created", () => { const guard = createOneTimeStartGuard(); assert.equal(guard.claim(), true); assert.equal(guard.claim(), false); });
test("same-day settlement fails closed when the candidate cannot be normalized", () => {
  const base = { candidateId: "hold", businessDate: "2026-08-03", createdAt: "2026-08-03T00:00:00.000Z", storeId: "A", storeName: "店舗A", machineName: "機種", machineNum: "668", balls: 100, carriedValueYen: 400 };
  assert.equal(canCreateSameDayResumeCandidate(base), true);
  assert.equal(canCreateSameDayResumeCandidate({ ...base, storeName: "  " }), false);
  assert.equal(canCreateSameDayResumeCandidate({ ...base, storeId: null }), false);
  assert.deepEqual(resolveSameDayResumeSettlement({ method: "same_day_hold", candidateInput: { ...base, storeName: "  " } }), { canProceed: false, candidate: null });
  assert.deepEqual(resolveSameDayResumeSettlement({ method: "cash", candidateInput: base }), { canProceed: true, candidate: null });
});
test("end-session creates a same-day candidate from the selected store name only", async () => {
  const source = await readFile(new URL("../App.jsx", import.meta.url), "utf8");
  assert.match(source, /const sameDayStoreName = String\(targetStore\?\.name \?\? ""\)/);
  assert.match(source, /storeName: sameDayStoreName/);
  assert.match(source, /if \(!sameDaySettlement\.canProceed\) return false;/);
});
