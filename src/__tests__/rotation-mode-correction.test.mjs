import test from "node:test";
import assert from "node:assert/strict";
import { applyArchiveRotationCorrection, correctRotationMode, createRotationModeFingerprint, resolveNextPlayMode } from "../rotationModeCorrection.js";

const baseRows = () => [
  { type: "start", cumRot: 0, unknown: "keep" },
  { type: "data", mode: "cash", thisRot: 20, cumRot: 20, invest: 1000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 700 },
  { type: "data", mode: "cash", thisRot: 20, cumRot: 40, invest: 2000, ballsConsumed: 0, mochiBalls: 500, chodamaBalls: 700 },
];

test("cash correction preserves fingerprint fields and moves later cumulative invest", () => {
  const rows = baseRows();
  const result = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[1], 1), mode: "mochi", rentBalls: 250 });
  assert.equal(result.ok, true);
  assert.equal(result.rows[1].invest, 0);
  assert.equal(result.rows[2].invest, 1000);
  assert.equal(result.rows[1].ballsConsumed, 250);
  assert.equal(result.rows[1].thisRot, 20);
  assert.equal(result.rows[0].unknown, "keep");
});

test("explicit zero is rejected while missing legacy consumption falls back to rent balls", () => {
  const rows = [{ type: "data", mode: "mochi", thisRot: 10, cumRot: 10, invest: 0, ballsConsumed: 0 }, { type: "data", mode: "mochi", thisRot: 10, cumRot: 20, invest: 0 }];
  const zero = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "cash", rentBalls: 250 });
  const legacy = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[1], 1), mode: "cash", rentBalls: 250 });
  assert.equal(zero.ok, false);
  assert.equal(legacy.rows[1].invest, 1000);
});

test("invalid balances and stale fingerprints reject without mutation", () => {
  const rows = baseRows();
  const fingerprint = createRotationModeFingerprint(rows[1], 1);
  rows[1].invest = 500;
  assert.equal(correctRotationMode({ rows, fingerprint, mode: "chodama", rentBalls: 250 }).ok, false);
  const bad = [{ type: "data", mode: "mochi", thisRot: 1, cumRot: 1, invest: 0, ballsConsumed: -1 }];
  assert.equal(correctRotationMode({ rows: bad, fingerprint: createRotationModeFingerprint(bad[0], 0), mode: "cash", rentBalls: 250 }).ok, false);
});

test("archive application changes only selected archive payload and next mode follows mochi to chodama to cash", () => {
  const rows = baseRows();
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[1], 1), mode: "chodama", rentBalls: 250 });
  const archive = { id: 1, investYen: 2000, initialChodama: 1000, settings: { exRate: 250 }, stats: {}, rotRows: rows, finalMochiBalls: 500, finalChodama: 700 };
  const applied = applyArchiveRotationCorrection(archive, correction);
  assert.equal(applied.ok, true);
  assert.equal(applied.archive.investYen, 1000);
  assert.equal(resolveNextPlayMode({ playMode: "mochi", currentMochiBalls: 0, currentChodama: 1 }), "chodama");
  assert.equal(resolveNextPlayMode({ playMode: "chodama", currentMochiBalls: 0, currentChodama: 0 }), "cash");
  assert.equal(resolveNextPlayMode({ playMode: "cash", currentMochiBalls: 0, currentChodama: 10 }), "cash");
});

test("snapshot absence does not hide an insufficient final balance", () => {
  const rows = [{ type: "data", mode: "chodama", thisRot: 10, cumRot: 10, invest: 0, ballsConsumed: 250, chodamaBalls: 500 }];
  const correction = correctRotationMode({ rows, fingerprint: createRotationModeFingerprint(rows[0], 0), mode: "mochi", rentBalls: 250 });
  assert.equal(correction.ok, false, "missing target mochi snapshot rejects before any update");
  const withSnapshot = [{ ...rows[0], mochiBalls: 300 }];
  const validCorrection = correctRotationMode({ rows: withSnapshot, fingerprint: createRotationModeFingerprint(withSnapshot[0], 0), mode: "mochi", rentBalls: 250 });
  const archive = { investYen: 0, initialChodama: 500, finalMochiBalls: 100, finalChodama: 250, stats: {}, rotRows: withSnapshot };
  assert.equal(applyArchiveRotationCorrection(archive, validCorrection).ok, false);
});
