import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildMachineSessions, getActualWageDisplay } from "../analysisViewHelpers.js";
test("machine sessions keep exact machine name and empty machine numbers", () => { const rows = buildMachineSessions([{ machineName: "A", machineNum: "" }, { machineName: "B" }, {}], "A"); assert.equal(rows.length, 1); assert.equal(rows[0].machineNum, ""); });
test("actual wage hides under 30 minutes and includes chodama cost", () => { const base = { gameType: "slot", playMinutes: 30, investYen: 100, recoveryYen: 100, chodamaYen: 100 }; assert.equal(getActualWageDisplay({ ...base, playMinutes: 29 + 59 / 60 }).visible, false); assert.equal(getActualWageDisplay(base).value, -200); assert.equal(getActualWageDisplay({ ...base, recoveryYen: 300, chodamaYen: 0 }).value, 400); assert.equal(getActualWageDisplay({ ...base, recoveryYen: 100, chodamaYen: 0 }).value, 0); });
test("DaySessionCard has one actual wage label and uses the helper", async () => { const source = await readFile(new URL("../AnalysisDashboard.jsx", import.meta.url), "utf8"); assert.equal((source.match(/実績時給/g) || []).length, 1); assert.match(source, /getActualWageDisplay\(archive, actual\)/); });
