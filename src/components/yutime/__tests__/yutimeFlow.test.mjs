import assert from "node:assert/strict";
import test from "node:test";
import {
  addYutimeSupportCash,
  completeYutimeRun,
  countNormalFirstHits,
  createYutimeRun,
  getActiveYutimeRun,
  getYutimeCardStage,
  getYutimeEventMode,
  shouldAutoShowYutimeCard,
  sumYutimeSupportCash,
} from "../yutimeFlow.js";
import { deriveFromRows } from "../../../logic.js";

const spec = { triggerLowSpins: 950, targetingEnabled: false };

test("far-away normal play keeps the yutime card hidden", () => {
  assert.equal(shouldAutoShowYutimeCard({
    spec,
    result: { arrivalReady: true, remainingSpins: 400, reachProbability: 0.2 },
  }), false);
});

test("explicit targeting and the automatic approach threshold show the card", () => {
  assert.equal(shouldAutoShowYutimeCard({
    spec: { ...spec, targetingEnabled: true },
    result: { arrivalReady: true, remainingSpins: 400, reachProbability: 0.2 },
  }), true);
  assert.equal(shouldAutoShowYutimeCard({
    spec,
    result: { arrivalReady: true, remainingSpins: 150, reachProbability: 0.36 },
  }), true);
  assert.equal(shouldAutoShowYutimeCard({
    spec,
    result: { arrivalReady: true, remainingSpins: 120, reachProbability: 0.1 },
  }), true);
});

test("consumed eligibility stays hidden unless a run is active", () => {
  const activeRun = { id: "run-1", status: "active" };
  assert.equal(shouldAutoShowYutimeCard({
    spec: { ...spec, consumed: true },
    result: { arrivalReady: true, remainingSpins: 0, reachProbability: 1 },
  }), false);
  assert.equal(shouldAutoShowYutimeCard({ spec: { ...spec, consumed: true }, activeRun }), true);
  assert.equal(getYutimeCardStage({ spec, activeRun }), "active");
});

test("event menu exposes exactly one yutime operation for the current state", () => {
  const target = { ...spec, targetingEnabled: true };
  assert.equal(getYutimeEventMode({ spec: target }), "entry");
  assert.equal(getYutimeEventMode({
    spec: target,
    activeRun: { id: "run-1", status: "active" },
  }), "active");
  assert.equal(getYutimeEventMode({ spec: { ...target, consumed: true } }), "hidden");
  assert.equal(getYutimeEventMode({ spec }), "hidden");
});

test("run creation, cash addition, and hit completion preserve the record", () => {
  const run = createYutimeRun({
    id: "run-1",
    machineName: "test",
    triggerLowSpins: 950,
    durationSpins: 1200,
    entryLowSpins: 950,
    entryCumRot: 550,
    startBalls: 1234,
    playMode: "cash",
    enteredAt: "2026-07-23T00:00:00.000Z",
  });
  assert.equal(getActiveYutimeRun([run])?.id, "run-1");

  const funded = addYutimeSupportCash([run], "run-1", 1000);
  const completed = completeYutimeRun(funded, "run-1", {
    outcome: "hit",
    supportSpins: 87,
    endBalls: 900,
    linkedChainId: "chain-1",
    endedAt: "2026-07-23T00:10:00.000Z",
  });
  assert.equal(completed[0].outcome, "hit");
  assert.equal(completed[0].supportCashYen, 1000);
  assert.equal(completed[0].supportSpins, 87);
  assert.equal(completed[0].linkedChainId, "chain-1");
  assert.equal(getActiveYutimeRun(completed), null);
  assert.equal(sumYutimeSupportCash(completed), 1000);
});

test("normal first-hit count excludes only yutime-origin jackpots", () => {
  assert.equal(countNormalFirstHits([
    { id: "normal-1" },
    { id: "yutime-1", origin: "yutime" },
    { id: "normal-2", origin: "normal" },
  ]), 2);
});

test("yutime support events never enter the normal rotation-rate totals", () => {
  const result = deriveFromRows([
    { type: "start", cumRot: 0 },
    { type: "data", mode: "cash", cumRot: 20, thisRot: 20, invest: 1000 },
    { type: "yutime_start", cumRot: 20, lowSpins: 950 },
    { type: "yutime_end", cumRot: 20, supportSpins: 1200, outcome: "through" },
  ], 0, 250);
  assert.equal(result.rot, 20);
  assert.equal(result.invest, 1000);
});
