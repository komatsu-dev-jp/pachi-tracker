// 実測消費玉リコンサイル（ballConsumption.js）の回帰テスト。
// logic.js（deriveFromRows）には触れず、ballsConsumed を実測値へ整える挙動と、
// deriveFromRows を通した最終的な回転率（rot / kCount）が正しいことを検証する。
// 実行: node src/__tests__/ball-consumption.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { reconcileSegmentConsumption } from "../ballConsumption.js";

// logic.js の純粋計算ブロックだけを取り出して deriveFromRows を得る（React 依存を回避）
function loadDeriveFromRows() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const logicSource = readFileSync(resolve(__dirname, "../logic.js"), "utf8");
  const idx = logicSource.indexOf("SHARED CALC HELPERS");
  const start = logicSource.lastIndexOf("/*", idx);
  const pure = logicSource.slice(start).replaceAll("export function ", "function ");
  return Function(`${pure}\nreturn { deriveFromRows };`)().deriveFromRows;
}

const deriveFromRows = loadDeriveFromRows();
const RENT = 250;

let pass = 0, fail = 0;
function approx(a, b, eps = 0.01) { return Math.abs(a - b) <= eps; }
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

// ── ケースA: 瞬間当たり（ユーザー報告シナリオ） ──────────────
// 貯玉125玉スタート、回転入力なしで10回転後に当たり、上皿残54玉。
{
  const rows = [
    { type: "start", cumRot: 211, mode: "chodama", chodamaBalls: 125 },
    { type: "data", mode: "chodama", cumRot: 221, thisRot: 10, invest: 0 }, // 当たり data 行（ballsConsumed 無し）
    { type: "hit", chainId: 1, cumRot: 221, thisRot: 10, mode: "chodama" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", trayRemaining: 54, currentBalance: 125, rentBalls: RENT });
  const hitData = out[1];
  check("A: 消費玉 = 125 - 54 = 71", hitData.ballsConsumed === 71, `→ ${hitData.ballsConsumed}`);
  const d = deriveFromRows(out, 0, RENT);
  check("A: 総回転 = 10", d.rot === 10, `→ ${d.rot}`);
  const start1K = d.rot / d.kCount;
  check("A: 回転率 ≈ 35.2 G/K", approx(start1K, 10 / (71 / 250)), `→ ${start1K.toFixed(2)}`);
}

// ── ケースB: 通常入力を挟んだ場合（暫定250玉→実測へ置換 + 比例配分） ──
{
  const rows = [
    { type: "start", cumRot: 0, mode: "chodama", chodamaBalls: 1000 },
    { type: "data", mode: "chodama", cumRot: 50, thisRot: 50, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 110, thisRot: 60, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 120, thisRot: 10, invest: 0 }, // 当たり data 行
    { type: "hit", chainId: 1, cumRot: 120, thisRot: 10, mode: "chodama" },
  ];
  // currentBalance = 1000 - 250 - 250 = 500、上皿残 400 → 実消費 = (500+500) - 400 = 600
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", trayRemaining: 400, currentBalance: 500, rentBalls: RENT });
  const sum = out.filter(r => r.type === "data").reduce((s, r) => s + (r.ballsConsumed || 0), 0);
  check("B: 区間消費合計 = 600", sum === 600, `→ ${sum}`);
  const d = deriveFromRows(out, 0, RENT);
  check("B: 回転率 = 50 G/K (120回転 / 2.4K)", approx(d.rot / d.kCount, 120 / (600 / 250)), `→ ${(d.rot / d.kCount).toFixed(2)}`);
}

// ── ケースC: 入力矛盾（残玉 > 開始玉）は実測せず暫定維持 ──────
{
  const rows = [
    { type: "start", cumRot: 0, mode: "chodama", chodamaBalls: 125 },
    { type: "data", mode: "chodama", cumRot: 10, thisRot: 10, invest: 0 },
    { type: "hit", chainId: 1, cumRot: 10, thisRot: 10, mode: "chodama" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", trayRemaining: 200, currentBalance: 125, rentBalls: RENT });
  check("C: 矛盾入力では行を変更しない", out[1].ballsConsumed === undefined, `→ ${out[1].ballsConsumed}`);
}

// ── ケースD: 現金モードは対象外（素通り） ───────────────────
{
  const rows = [
    { type: "start", cumRot: 0, mode: "cash" },
    { type: "data", mode: "cash", cumRot: 100, thisRot: 100, invest: 3000 },
    { type: "hit", chainId: 1, cumRot: 100, thisRot: 100, mode: "cash" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "cash", trayRemaining: 0, currentBalance: 0, rentBalls: RENT });
  check("D: 現金モードは同一配列を返す", out === rows);
}

// ── ケースE: 持ち玉モードも実測化される ───────────────────
{
  const rows = [
    { type: "start", cumRot: 0, mode: "mochi", mochiBalls: 300 },
    { type: "data", mode: "mochi", cumRot: 20, thisRot: 20, invest: 0 },
    { type: "hit", chainId: 1, cumRot: 20, thisRot: 20, mode: "mochi" },
  ];
  // 持ち玉300、上皿残100 → 実消費 200玉
  const out = reconcileSegmentConsumption(rows, { playMode: "mochi", trayRemaining: 100, currentBalance: 300, rentBalls: RENT });
  check("E: 持ち玉 消費 = 300 - 100 = 200", out[1].ballsConsumed === 200, `→ ${out[1].ballsConsumed}`);
  const d = deriveFromRows(out, 0, RENT);
  check("E: 回転率 = 25 G/K (20回転 / 0.8K)", approx(d.rot / d.kCount, 20 / (200 / 250)), `→ ${(d.rot / d.kCount).toFixed(2)}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
