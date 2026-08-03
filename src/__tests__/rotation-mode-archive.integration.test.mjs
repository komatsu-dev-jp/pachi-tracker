import test from "node:test";
import assert from "node:assert/strict";
import { applyEconomicEV, deriveUsageFromRows } from "../economics.js";
import { applyArchiveRotationCorrection, correctRotationMode, createArchiveCorrectionFingerprint, createRotationModeFingerprint, isEditableRotationModeRow, matchesArchiveCorrectionFingerprint } from "../rotationModeCorrection.js";

const totalK = (rows) => {
  const usage = deriveUsageFromRows(rows, 250);
  return usage.cashKCount + usage.mochiKCount + usage.chodamaKCount;
};

for (const [from, to] of [["cash", "mochi"], ["cash", "chodama"], ["mochi", "cash"], ["chodama", "cash"]]) {
  test(`${from} to ${to} preserves total K for 1000 yen / 250 balls`, () => {
    const row = { type: "data", mode: from, thisRot: 10, cumRot: 10, invest: from === "cash" ? 1000 : 0, ballsConsumed: from === "cash" ? 0 : 250, mochiBalls: 500, chodamaBalls: 500 };
    const result = correctRotationMode({ rows: [row], fingerprint: createRotationModeFingerprint(row, 0), mode: to, rentBalls: 250 });
    assert.equal(result.ok, true);
    assert.ok(Math.abs(totalK([row]) - totalK(result.rows)) <= 1e-9);
  });
}

test("cash 500 yen converts to 125 balls without changing total K", () => {
  const row = { type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 500, ballsConsumed: 0, mochiBalls: 125, chodamaBalls: 500 };
  const result = correctRotationMode({ rows: [row], fingerprint: createRotationModeFingerprint(row, 0), mode: "mochi", rentBalls: 250 });
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].ballsConsumed, 125);
  assert.ok(Math.abs(totalK([row]) - totalK(result.rows)) <= 1e-9);
});

test("archive chodama cost is positive and is the persisted chodamaYen source", () => {
  const rows = [{ type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 1000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 500 }];
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "chodama", rentBalls: 250 });
  const archive = { gameType: "pachinko", investYen: 1000, initialChodama: 500, finalMochiBalls: 500, finalChodama: 500, stats: { netRot: 10, workAmount: 0 }, settings: { rentBalls: 250, exRate: 280 }, rotRows: rows };
  const applied = applyArchiveRotationCorrection(archive, correction);
  assert.equal(applied.ok, true);
  const stats = applyEconomicEV({ netRot: 10, workAmount: 0 }, { rotRows: applied.archive.rotRows, rentBalls: 250, exRate: 280 });
  assert.ok(stats.chodamaCostYen > 0);
  assert.equal(Math.round(stats.chodamaCostYen), 893);
  assert.equal(isEditableRotationModeRow({ type: "data", mode: "cash", thisRot: 0 }), false);
  assert.equal(isEditableRotationModeRow({ type: "hit", mode: "cash", thisRot: 10 }), false);
});

test("archive total keeps carry, support and signed manual adjustment while raw follows rows", () => {
  const rows = [{ type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 1000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 500 }];
  const archive = { investYen: 3800, carriedInYen: 2000, initialChodama: 500, finalMochiBalls: 500, finalChodama: 500, yutimeRuns: [{ supportCashYen: 500 }], stats: { rawInvest: 1000 }, rotRows: rows };
  const toMochi = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "mochi", rentBalls: 250 });
  const changed = applyArchiveRotationCorrection(archive, toMochi);
  assert.equal(changed.ok, true);
  assert.equal(changed.archive.stats.rawInvest, 0);
  assert.equal(changed.archive.investYen, 2800);
  assert.deepEqual(changed.archive.yutimeRuns, archive.yutimeRuns);
  const back = correctRotationMode({ rows: changed.archive.rotRows, fingerprint: createRotationModeFingerprint(changed.archive.rotRows[0], 0), mode: "cash", rentBalls: 250 });
  const restored = applyArchiveRotationCorrection(changed.archive, back);
  assert.equal(restored.ok, true);
  assert.equal(restored.archive.stats.rawInvest, 1000);
  assert.equal(restored.archive.investYen, 3800);
});

test("partial correction and multiple supports retain the exact total contract", () => {
  const rows = [{ type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 1000, ballsConsumed: 0, mochiBalls: 125, chodamaBalls: 500 }, { type: "data", mode: "cash", thisRot: 10, cumRot: 20, invest: 1500, ballsConsumed: 0, mochiBalls: 125, chodamaBalls: 500 }];
  const archive = { investYen: 2450, carriedInYen: 1000, initialChodama: 500, finalMochiBalls: 125, finalChodama: 500, yutimeRuns: [{ supportCashYen: 100 }, { supportCashYen: 200 }], stats: { rawInvest: 1500 }, rotRows: rows };
  const result = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[1], 1), mode: "mochi", rentBalls: 250 });
  const changed = applyArchiveRotationCorrection(archive, result);
  assert.equal(changed.ok, true);
  assert.equal(changed.archive.stats.rawInvest, 1000);
  assert.equal(changed.archive.investYen, 1950);
  assert.deepEqual(changed.archive.yutimeRuns, archive.yutimeRuns);
});

test("negative manual adjustment is preserved and invalid archive evidence is atomically rejected", () => {
  const rows = [{ type: "data", mode: "mochi", thisRot: 10, cumRot: 10, invest: 0, ballsConsumed: 250, mochiBalls: 500, chodamaBalls: 500 }];
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "cash", rentBalls: 250 });
  const valid = { investYen: 250, carriedInYen: 500, initialChodama: 500, finalMochiBalls: 500, finalChodama: 500, yutimeRuns: [], stats: { rawInvest: 0 }, rotRows: rows };
  assert.equal(applyArchiveRotationCorrection(valid, correction).archive.investYen, 1250);
  for (const invalid of [{ ...valid, carriedInYen: -1 }, { ...valid, yutimeRuns: [{ supportCashYen: Infinity }] }, { ...valid, stats: { rawInvest: 999 } }, { ...valid, investYen: -1 }]) {
    const before = structuredClone(invalid);
    assert.equal(applyArchiveRotationCorrection(invalid, correction).ok, false);
    assert.deepEqual(invalid, before);
  }
  const fingerprint = createArchiveCorrectionFingerprint(valid);
  assert.equal(matchesArchiveCorrectionFingerprint(valid, fingerprint), true);
  assert.equal(matchesArchiveCorrectionFingerprint({ ...valid, investYen: 751 }, fingerprint), false);
});

test("malformed yutimeRuns are rejected without throwing or mutating the archive", () => {
  const rows = [{ type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 1000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 500 }];
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "mochi", rentBalls: 250 });
  const base = { investYen: 1000, initialChodama: 500, finalMochiBalls: 500, finalChodama: 500, stats: { rawInvest: 1000 }, rotRows: rows };
  for (const yutimeRuns of [{ supportCashYen: 500 }, "invalid", [null], [42], ["x"], [[]]]) {
    const archive = { ...base, yutimeRuns };
    const before = structuredClone(archive);
    assert.doesNotThrow(() => assert.equal(applyArchiveRotationCorrection(archive, correction).ok, false));
    assert.deepEqual(archive, before);
  }
});

test("missing or null yutimeRuns has zero support and remains valid", () => {
  const rows = [{ type: "data", mode: "cash", thisRot: 10, cumRot: 10, invest: 1000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 500 }];
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "mochi", rentBalls: 250 });
  for (const yutimeRuns of [undefined, null]) {
    const archive = { investYen: 1000, initialChodama: 500, finalMochiBalls: 500, finalChodama: 500, stats: { rawInvest: 1000 }, rotRows: rows, ...(yutimeRuns === undefined ? {} : { yutimeRuns }) };
    const result = applyArchiveRotationCorrection(archive, correction);
    assert.equal(result.ok, true);
    assert.equal(result.archive.investYen, 0);
  }
});
