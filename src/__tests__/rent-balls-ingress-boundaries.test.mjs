import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveRentBalls } from "../rentBalls.js";
import { createMoveTableDestination } from "../components/tabs/moveTableDestination.js";

test("ingress boundaries resolve invalid rent balls without mutating raw candidates", () => {
  const raw = { rentBalls: 39 };
  assert.deepEqual(resolveRentBalls(raw.rentBalls), { value: 250, isValid: false, isAbnormal: true });
  const result = createMoveTableDestination({
    moveMochiBalls: 0, moveMachineName: "台", moveMachineNum: "1", moveStartRot: 0,
    moveYutimeTarget: { rentBalls: 39 }, picked: null, S: {},
    calculateYutimeEV: () => null, deriveNormalExpectedNetBalls: () => 0, isYutimeTargetingSession: () => false,
  });
  assert.equal(result.dest.rentBalls, 250);
  assert.equal(raw.rentBalls, 39);
});

test("specified ingress files connect raw rate candidates to resolveRentBalls", async () => {
  const files = [
    "../components/scout/ScoutDashboard.jsx",
    "../components/strategy/StrategyMapDashboard.jsx",
    "../components/tabs/RotTab.jsx",
    "../components/yutime/YutimeCalculatorSheet.jsx",
    "../components/tabs/moveTableDestination.js",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(source, /resolveRentBalls/);
  }
});
