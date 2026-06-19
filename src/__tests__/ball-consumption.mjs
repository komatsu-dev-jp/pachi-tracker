// 実測消費玉リコンサイル（ballConsumption.js）の回帰テスト。
// logic.js（deriveFromRows / calcPreciseEV）には触れず、ballsConsumed をグロス
// （区間開始玉）へ整える挙動と、calcPreciseEV を通した「補正後（実消費）」回転率が
// 正しいことを検証する。上皿残玉の差し引きは trayCorrection が行うため、本関数は
// グロスを入れる（二重控除を避ける）。
// 実行: node src/__tests__/ball-consumption.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { reconcileSegmentConsumption, clearPushCorrections } from "../ballConsumption.js";

// logic.js の純粋計算ブロックだけを取り出す（React 依存を回避）
function loadFns() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const logicSource = readFileSync(resolve(__dirname, "../logic.js"), "utf8");
  const idx = logicSource.indexOf("SHARED CALC HELPERS");
  const start = logicSource.lastIndexOf("/*", idx);
  const pure = logicSource.slice(start).replaceAll("export function ", "function ");
  return Function(`${pure}\nreturn { deriveFromRows, calcPreciseEV };`)();
}

const { deriveFromRows, calcPreciseEV } = loadFns();
const RENT = 250;

let pass = 0, fail = 0;
function approx(a, b, eps = 0.3) { return Math.abs(a - b) <= eps; }
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

// 等価（交換率4円・貸玉250玉/K）で calcPreciseEV を回す共通パラメータ
function evParams(rotRows, jpLog) {
  return {
    rotRows, startRot: 211, jpLog,
    rentBalls: RENT, exRate: 250, synthDenom: 319.7, rotPerHour: 600,
    totalTrayBalls: 0, border: 18, spec1R: 140, specAvgRounds: 0, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  };
}

// ── ケースA: 瞬間当たり（ユーザー報告シナリオ） ──────────────
// 貯玉125玉スタート、回転入力なしで10回転後に当たり、上皿残54玉。
{
  const rows = [
    { type: "start", cumRot: 211, mode: "chodama", chodamaBalls: 125 },
    { type: "data", mode: "chodama", cumRot: 221, thisRot: 10, invest: 0 },
    { type: "hit", chainId: 1, cumRot: 221, thisRot: 10, mode: "chodama" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", currentBalance: 125 });
  check("A: ballsConsumed = グロス125", out[1].ballsConsumed === 125, `→ ${out[1].ballsConsumed}`);

  // 補正後（trayCorrection が上皿54玉を差し引く）→ 実消費71玉 → 10/(71/250) ≈ 35.2
  const jpLog = [{ chainId: 1, completed: true, trayBalls: 54, hits: [{ rounds: 4 }], summary: { totalRounds: 4, totalDisplayBalls: 560 } }];
  const ev = calcPreciseEV(evParams(out, jpLog));
  check("A: 生回転率 = 20 G/K (グロス0.5K)", approx(ev.start1K, 20), `→ ${ev.start1K.toFixed(2)}`);
  check("A: 補正後回転率 ≈ 35.2 G/K", approx(ev.start1KCorrected, 10 / (71 / 250)), `→ ${ev.start1KCorrected.toFixed(2)}`);
}

// ── ケースB: 通常入力がある区間は暫定消費（残高の実減少）を信頼する ──
// 貯玉残高が大きくても、持ち越し玉を当該区間の消費に加算しない（過大計上バグの防止）。
{
  const rows = [
    { type: "start", cumRot: 0, mode: "chodama", chodamaBalls: 5000 },
    { type: "data", mode: "chodama", cumRot: 50, thisRot: 50, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 110, thisRot: 60, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 120, thisRot: 10, invest: 0, ballsConsumed: 250 },
    { type: "hit", chainId: 1, cumRot: 120, thisRot: 10, mode: "chodama" },
  ];
  // 残高4250玉（持ち越し）が大きくても加算しない → グロス = 暫定750玉
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", currentBalance: 4250, rentBalls: RENT });
  const sum = out.filter(r => r.type === "data").reduce((s, r) => s + (r.ballsConsumed || 0), 0);
  check("B: 暫定消費を信頼し持ち越し玉を加算しない = 750玉", sum === 750, `→ ${sum}`);
  // 明示の区間開始玉を入れれば真値で確定（編集UI経路）
  const out2 = reconcileSegmentConsumption(rows, { playMode: "chodama", segmentStartBalls: 1000, chainId: 1 });
  const sum2 = out2.filter(r => r.type === "data").reduce((s, r) => s + (r.ballsConsumed || 0), 0);
  check("B: 明示の区間開始玉=1000で確定", sum2 === 1000, `→ ${sum2}`);
}

// ── ケースC: 編集（segmentStartBalls 明示・chainId 指定） ──────
{
  const rows = [
    { type: "start", cumRot: 211, mode: "chodama", chodamaBalls: 0 },
    { type: "data", mode: "chodama", cumRot: 221, thisRot: 10, invest: 0 }, // 既に誤った値が入っている想定
    { type: "hit", chainId: 99, cumRot: 221, thisRot: 10, mode: "chodama" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", segmentStartBalls: 125, chainId: 99 });
  check("C: 明示グロス125を書き込む", out[1].ballsConsumed === 125, `→ ${out[1].ballsConsumed}`);
}

// ── ケースD: 現金モードは対象外（素通り） ───────────────────
{
  const rows = [
    { type: "start", cumRot: 0, mode: "cash" },
    { type: "data", mode: "cash", cumRot: 100, thisRot: 100, invest: 3000 },
    { type: "hit", chainId: 1, cumRot: 100, thisRot: 100, mode: "cash" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "cash", currentBalance: 0 });
  check("D: 現金モードは同一配列を返す", out === rows);
}

// ── ケースE: プッシュ補正行の除去（誤って押した現金行を取り消す） ──
{
  const rows = [
    { type: "start", cumRot: 211, mode: "chodama", chodamaBalls: 125 },
    { type: "data", mode: "chodama", cumRot: 221, thisRot: 10, invest: 0, ballsConsumed: 125 },
    { type: "hit", chainId: 1, cumRot: 221, thisRot: 10, mode: "chodama", invest: 0 },
    { type: "data", mode: "cash", cumRot: 221, thisRot: 0, invest: 500, ballsConsumed: 0 }, // 誤プッシュ500円
  ];
  const out = clearPushCorrections(rows, { chainId: 1 });
  check("E: プッシュ行が除去される", out.length === 3 && !out.some(r => r.thisRot === 0 && r.type === "data"), `→ len ${out.length}`);
  const cashRows = out.filter(r => r.mode === "cash" && r.type === "data");
  check("E: 現金投資行が残らない", cashRows.length === 0, `→ ${cashRows.length}`);
}

// ── ケースF: 持ち玉モードも実測化される ───────────────────
{
  const rows = [
    { type: "start", cumRot: 0, mode: "mochi", mochiBalls: 300 },
    { type: "data", mode: "mochi", cumRot: 20, thisRot: 20, invest: 0 },
    { type: "hit", chainId: 1, cumRot: 20, thisRot: 20, mode: "mochi" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "mochi", currentBalance: 300 });
  check("F: 持ち玉グロス = 300", out[1].ballsConsumed === 300, `→ ${out[1].ballsConsumed}`);
  // 上皿残100 → 実消費200 → 20/(200/250) = 25
  const jpLog = [{ chainId: 1, completed: true, trayBalls: 100, hits: [{ rounds: 4 }], summary: { totalRounds: 4, totalDisplayBalls: 560 } }];
  const ev = calcPreciseEV(evParams(out, jpLog));
  check("F: 補正後回転率 = 25 G/K", approx(ev.start1KCorrected, 25), `→ ${ev.start1KCorrected.toFixed(2)}`);
}

// ── ケースG: 持ち越し玉（RUSH出玉）を消費に加算しない ───────────
// 大当たり/RUSH 終了後、持ち玉5000玉を持ち越したまま通常を6回入力（暫定250玉×6=1500玉）。
// 旧バグ: グロス = currentBalance(3500) + 暫定(1500) = 5000玉 を1区間で消費扱い
//        → 実質投資が約2万円に膨張、補正後回転率が0.9に潰れる（ユーザー報告バグ）。
// 新挙動: 暫定消費1500玉のみを信頼し、持ち越し3500玉は加算しない。
{
  const rows = [{ type: "start", cumRot: 0, mode: "mochi", mochiBalls: 5000 }];
  let cum = 0;
  for (let k = 0; k < 6; k++) { cum += 3; rows.push({ type: "data", mode: "mochi", cumRot: cum, thisRot: 3, invest: 0, ballsConsumed: 250 }); }
  rows.push({ type: "hit", chainId: 7, cumRot: cum, thisRot: 0, mode: "mochi" });
  const out = reconcileSegmentConsumption(rows, { playMode: "mochi", currentBalance: 3500, rentBalls: RENT });
  const sum = out.filter(r => r.type === "data").reduce((s, r) => s + (r.ballsConsumed || 0), 0);
  // 旧バグなら 5000玉。新挙動は暫定1500玉のまま（持ち越し3500玉を足さない）。
  check("G: 持ち越し玉を加算せず暫定1500玉を維持（旧5000玉）", sum === 1500, `→ ${sum}`);
  // 暫定1500玉 → 実質投資が等価で約6000円（旧2万円から大幅縮小）
  const ev = calcPreciseEV(evParams(out, []));
  check("G: 実質投資が爆発しない（旧2万円→8000円未満）", Math.round(ev.correctedInvestYen) < 8000, `→ ${Math.round(ev.correctedInvestYen)}`);
}

// ── ケースH: ユーザー実ログ（貯玉スタート200→+15/+17/+15→250初当たり）──
// 暫定250玉×3入力=750玉。持ち越し貯玉が大きくても実質投資は約3000円（≒725玉）に収まる。
{
  const rows = [
    { type: "start", cumRot: 200, mode: "chodama", chodamaBalls: 5000 },
    { type: "data", mode: "chodama", cumRot: 215, thisRot: 15, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 232, thisRot: 17, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 247, thisRot: 15, invest: 0, ballsConsumed: 250 },
    { type: "data", mode: "chodama", cumRot: 250, thisRot: 3, invest: 0 }, // 初当たり区間（ballsConsumed未設定）
    { type: "hit", chainId: 1, cumRot: 250, thisRot: 3, mode: "chodama" },
  ];
  const out = reconcileSegmentConsumption(rows, { playMode: "chodama", currentBalance: 4250, rentBalls: RENT });
  const sum = out.filter(r => r.type === "data").reduce((s, r) => s + (r.ballsConsumed || 0), 0);
  check("H: 消費玉 = 暫定750玉（持ち越し玉を加算しない）", sum === 750, `→ ${sum}`);
  // 上皿30玉控除後 → 実消費720玉。実質投資は等価で約3000円弱に収まる。
  const jpLog = [{ chainId: 1, completed: true, trayBalls: 30, hits: [{ rounds: 4 }], summary: { totalRounds: 4, totalDisplayBalls: 560 } }];
  const ev = calcPreciseEV(evParams(out, jpLog));
  check("H: 実質投資が3000円弱（< 3500円）", Math.round(ev.correctedInvestYen) < 3500, `→ ${Math.round(ev.correctedInvestYen)}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
