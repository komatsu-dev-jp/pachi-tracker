// 保護関数（deriveFromRows / calcCash / calcMochi / calcPreciseEV）の境界値ハーネス。
// 移行前後で `node src/__tests__/protected-fns.mjs` の出力が完全一致することを確認する。
// CLAUDE.md の保護関数規定への準拠検証用。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function loadProtectedFns() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const logicPath = resolve(__dirname, "../logic.js");
  const logicSource = readFileSync(logicPath, "utf8");
  const sharedLabel = "SHARED CALC HELPERS";
  const sharedLabelIndex = logicSource.indexOf(sharedLabel);
  const sharedStart = sharedLabelIndex === -1
    ? -1
    : logicSource.lastIndexOf("/*", sharedLabelIndex);

  if (sharedStart === -1) {
    throw new Error("logic.js の純粋計算関数ブロックが見つかりません");
  }

  const pureSource = logicSource
    .slice(sharedStart)
    .replaceAll("export function ", "function ");

  return Function(`${pureSource}
return { deriveFromRows, calcCash, calcMochi, calcPreciseEV };`)();
}

const { deriveFromRows, calcCash, calcMochi, calcPreciseEV } = loadProtectedFns();

const cases = {
  empty: {
    rotRows: [],
    startRot: 0,
    rentBalls: 250,
  },
  singleData: {
    rotRows: [
      { type: "data", thisRot: 50, invest: 1000, mode: "cash" },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  cashThreeRows: {
    rotRows: [
      { type: "data", thisRot: 30, invest: 1000, mode: "cash" },
      { type: "data", thisRot: 45, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 25, invest: 3000, mode: "cash" },
    ],
    startRot: 100,
    rentBalls: 250,
  },
  startResetMixed: {
    rotRows: [
      { type: "data", thisRot: 80, invest: 2000, mode: "cash" },
      { type: "start", val: 0 },
      { type: "data", thisRot: 30, invest: 3000, mode: "cash" },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  mochiMode: {
    rotRows: [
      { type: "data", thisRot: 60, invest: 0, mode: "mochi", ballsConsumed: 250 },
      { type: "data", thisRot: 50, invest: 0, mode: "mochi", ballsConsumed: 500 },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  chodamaMode: {
    rotRows: [
      { type: "data", thisRot: 60, invest: 0, mode: "chodama", ballsConsumed: 250 },
      { type: "data", thisRot: 50, invest: 0, mode: "chodama", ballsConsumed: 250 },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  mixedAllModes: {
    rotRows: [
      { type: "data", thisRot: 50, invest: 1000, mode: "cash" },
      { type: "data", thisRot: 40, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 30, invest: 2000, mode: "mochi", ballsConsumed: 250 },
      { type: "data", thisRot: 20, invest: 2000, mode: "chodama", ballsConsumed: 250 },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  negativeThisRot: {
    rotRows: [
      { type: "data", thisRot: -5, invest: 1000, mode: "cash" },
      { type: "data", thisRot: 50, invest: 2000, mode: "cash" },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  largeInvest: {
    rotRows: [
      { type: "data", thisRot: 9999, invest: 9_999_999, mode: "cash" },
    ],
    startRot: 0,
    rentBalls: 250,
  },
  longSequence: (() => {
    const rows = [];
    for (let i = 1; i <= 500; i++) {
      rows.push({ type: "data", thisRot: 30 + (i % 17), invest: i * 1000, mode: "cash" });
    }
    return { rotRows: rows, startRot: 0, rentBalls: 250 };
  })(),
};

const sampleJpLog = [
  {
    completed: true,
    summary: { totalRounds: 30, totalDisplayBalls: 4500, netGain: 4200, totalSapoRot: 100, totalSapoChange: -50 },
  },
  {
    completed: true,
    summary: { totalRounds: 18, totalDisplayBalls: 2700, netGain: 2500, totalSapoRot: 60, totalSapoChange: -30 },
  },
];

const evCases = {
  evEmpty: {
    rotRows: [],
    startRot: 0,
    jpLog: [],
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250,
    totalTrayBalls: 0, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  },
  evNormal: {
    rotRows: cases.cashThreeRows.rotRows,
    startRot: 100,
    jpLog: sampleJpLog,
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250,
    totalTrayBalls: 100, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  },
  evMixed: {
    rotRows: cases.mixedAllModes.rotRows,
    startRot: 0,
    jpLog: sampleJpLog,
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250,
    totalTrayBalls: 0, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  },
  evChodamaExcluded: {
    rotRows: cases.mixedAllModes.rotRows,
    startRot: 0,
    jpLog: sampleJpLog,
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250,
    totalTrayBalls: 0, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: false },
  },
  evUpperTrayCorrection: {
    rotRows: [
      { type: "data", thisRot: 20, invest: 1000, mode: "cash" },
      { type: "data", thisRot: 20, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 5, invest: 2000, mode: "cash" },
      { type: "hit", thisRot: 0, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 0, invest: 2500, mode: "cash" },
    ],
    startRot: 0,
    jpLog: [],
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 500,
    totalTrayBalls: 100, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  },
  evUpperTrayFromJpLog: {
    rotRows: [
      { type: "data", thisRot: 20, invest: 1000, mode: "cash" },
      { type: "data", thisRot: 20, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 5, invest: 2000, mode: "cash" },
      { type: "hit", thisRot: 0, invest: 2000, mode: "cash" },
      { type: "data", thisRot: 0, invest: 2500, mode: "cash" },
    ],
    startRot: 0,
    jpLog: [{ completed: false, trayBalls: 100, hits: [] }],
    rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 500,
    totalTrayBalls: 0, border: 20,
    spec1R: 140, specAvgRounds: 34.17, specSapo: 0,
    chodamaSettings: { includeChodamaInBalance: true },
  },
};

const cashCases = {
  cashEmpty: { rotRows: [], startRot: 0, cashRB: 0, cashJP: 0, exRate: 250, synthDenom: 319.6, rotPerHour: 250 },
  cashNormal: { rotRows: cases.cashThreeRows.rotRows, startRot: 100, cashRB: 8000, cashJP: 2, exRate: 250, synthDenom: 319.6, rotPerHour: 250 },
  cashZeroDenom: { rotRows: cases.cashThreeRows.rotRows, startRot: 100, cashRB: 0, cashJP: 0, exRate: 250, synthDenom: 319.6, rotPerHour: 250 },
};

const mochiCases = {
  mochiEmpty: { rotRows: [], startRot: 0, mRB: 0, mJP: 0, rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250 },
  mochiNormal: { rotRows: cases.cashThreeRows.rotRows, startRot: 100, mRB: 8000, mJP: 2, rentBalls: 250, exRate: 250, synthDenom: 319.6, rotPerHour: 250 },
};

const out = {};
for (const [name, args] of Object.entries(cases)) {
  out[`derive:${name}`] = deriveFromRows(args.rotRows, args.startRot, args.rentBalls);
}
for (const [name, args] of Object.entries(evCases)) {
  out[`ev:${name}`] = calcPreciseEV(args);
}
for (const [name, args] of Object.entries(cashCases)) {
  out[`cash:${name}`] = calcCash(args);
}
for (const [name, args] of Object.entries(mochiCases)) {
  out[`mochi:${name}`] = calcMochi(args);
}

console.log(JSON.stringify(out, null, 2));
