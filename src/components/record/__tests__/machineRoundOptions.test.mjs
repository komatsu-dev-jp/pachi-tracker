import assert from "node:assert/strict";
import { machineDB } from "../../../machineDB.js";
import {
  buildMultiRoundHit,
  changeRoundMultiplier,
  getMachineRoundLoop,
  getMachineRoundOptions,
  parseRoundOptions,
} from "../machineRoundOptions.js";

const machine = (name) => {
  const found = machineDB.find((item) => item.name === name);
  assert.ok(found, `${name} が機種マスタにありません`);
  return found;
};

const signatures = (options) => options.map(({ rounds, mult }) => `${rounds}R×${mult}`);

assert.deepEqual(
  signatures(parseRoundOptions("2R or 10R×2～6＋α")),
  ["2R×1", "10R×2", "10R×6"],
  "複数候補と倍率範囲を抽出できること",
);

const hissatsuRush = signatures(getMachineRoundOptions(machine("ぱちんこ 必殺仕事人Ⅵ"), "rush"));
assert.deepEqual(
  hissatsuRush,
  ["10R×1", "10R×2", "10R×4"],
  "簡易rushDistに無い10R×2・10R×4も詳細振分から取得すること",
);

const ghoulHeso = signatures(getMachineRoundOptions(machine("e 東京喰種 超デカ超一撃ver."), "heso"));
assert.ok(ghoulHeso.includes("10R×2"), "東京喰種の10R×2を選択できること");
assert.ok(ghoulHeso.includes("10R×5"), "東京喰種の10R×5を選択できること");

const enen = machine("eフィーバー炎炎ノ消防隊2 シンラver.");
assert.deepEqual(
  signatures(getMachineRoundOptions(enen, "rush")),
  ["10R×1", "10R×2"],
  "炎炎は通常1500玉と上乗せ開始3000玉を選択できること",
);
const enenLoop = getMachineRoundLoop(enen, "rush", 10);
assert.equal(changeRoundMultiplier(2, 1, enenLoop), 3, "炎炎は1500玉（10R×1）ずつ上乗せ");
assert.equal(changeRoundMultiplier(5, 1, enenLoop), 6, "炎炎の50%ループが何回続いても増やせること");

const lycoris = machine("eリコリス・リコイル");
assert.deepEqual(
  signatures(getMachineRoundOptions(lycoris, "rush")),
  ["5R×1", "5R×4", "5R×8"],
  "リコリスの750・3000・6000玉相当を選択できること",
);
const lycorisLoop = getMachineRoundLoop(lycoris, "rush", 5);
assert.equal(changeRoundMultiplier(8, 1, lycorisLoop), 12, "リコリスは3000玉（5R×4）ずつ上乗せ");
assert.equal(changeRoundMultiplier(12, 1, lycorisLoop), 16, "リコリスの50%ループが何回続いても増やせること");
assert.equal(changeRoundMultiplier(12, -1, lycorisLoop), 8, "リコリスの上乗せ回数を訂正できること");

const ghoulW = machine("e東京喰種W");
assert.deepEqual(
  signatures(getMachineRoundOptions(ghoulW, "rush")),
  ["10R×2", "10R×4"],
  "東京喰種Wは3000玉・6000玉を選択できること",
);
const ghoulWLoop = getMachineRoundLoop(ghoulW, "rush", 10);
assert.equal(changeRoundMultiplier(4, 1, ghoulWLoop), 6, "東京喰種Wは3000玉単位の追加分を記録できること");

const yoshimune = machine("e吉宗極乗3000ver.");
assert.ok(signatures(getMachineRoundOptions(yoshimune, "rush")).includes("5R×4"), "吉宗は3000玉を選択できること");
const yoshimuneLoop = getMachineRoundLoop(yoshimune, "rush", 5);
assert.equal(changeRoundMultiplier(4, 1, yoshimuneLoop), 8, "吉宗は3000玉単位の上乗せを記録できること");
assert.equal(changeRoundMultiplier(12, -1, yoshimuneLoop), 8, "吉宗の上乗せ回数を訂正できること");

const utawarerumono = machine("PFうたわれるもの LT-Light ver.");
assert.ok(signatures(getMachineRoundOptions(utawarerumono, "rush")).includes("10R×3"), "うたわれるものは最低2100発を選択できること");
const utawarerumonoLoop = getMachineRoundLoop(utawarerumono, "rush", 10);
assert.equal(changeRoundMultiplier(3, 1, utawarerumonoLoop), 5, "うたわれるものは1400発単位の上乗せを記録できること");
assert.equal(changeRoundMultiplier(7, -1, utawarerumonoLoop), 5, "うたわれるものの上乗せ回数を訂正できること");

assert.deepEqual(
  signatures(getMachineRoundOptions(machine("PF彼女、お借りします LT-Light ver."), "rush")),
  ["8R×1", "14R×1", "20R×1", "26R×1", "32R×1"],
  "彼女、お借りしますは4回分の全合計R数を選択できること",
);

const gojiGold = machine("eゴジラ対エヴァンゲリオン2 超デカゴールド");
const gojiGoldLoop = getMachineRoundLoop(gojiGold, "rush", 10);
assert.equal(changeRoundMultiplier(2, 1, gojiGoldLoop), 3, "ゴジエヴァGOLDは1500発単位の上乗せを記録できること");
assert.equal(changeRoundMultiplier(5, -1, gojiGoldLoop), 4, "ゴジエヴァGOLDの上乗せ回数を訂正できること");

const gojiSilver = machine("Pゴジラ対エヴァンゲリオン2 超デカシルバー");
const gojiSilverLoop = getMachineRoundLoop(gojiSilver, "rush", 4);
assert.equal(changeRoundMultiplier(2, 1, gojiSilverLoop), 3, "ゴジエヴァSILVERは400発単位の上乗せを記録できること");
assert.equal(changeRoundMultiplier(6, -1, gojiSilverLoop), 5, "ゴジエヴァSILVERの可変ループ回数を訂正できること");

assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e真・北斗無双 第5章 夢幻闘双"), "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "北斗無双5は1500～7500玉の全セット数を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("eフィーバーBASTARD!! -暗黒の破壊神-"), "rush")),
  ["10R×1", "10R×2", "10R×3"],
  "BASTARDは1500・3000・4500玉を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e魔法少女まどか☆マギカ3 時間遡行"), "rush")),
  ["5R×1", "5R×2", "5R×4"],
  "まどか3は750・1500・3000玉を選択できること",
);
assert.ok(
  signatures(getMachineRoundOptions(machine("e北斗の拳11 暴凶星"), "heso")).includes("12R×1"),
  "北斗11の拳王覚醒は2R+10Rを合計12Rとして記録できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e北斗の拳11 暴凶星"), "rush")),
  ["10R×1", "10R×3", "10R×4"],
  "北斗11は1500・4500・6000玉を選択できること",
);

assert.equal(changeRoundMultiplier(4, 1), 5, "未登録のループ機種も1セットずつ手動調整できること");

const hit6000 = buildMultiRoundHit(1, {
  rounds: 10,
  mult: 4,
  displayBalls: 1500,
  lastOutBalls: 1000,
  nextTimingBalls: 7000,
  elecSapoRot: 100,
  time: "test-time",
});
assert.equal(hit6000.hitNumber, 1, "大当たり回数は1回のまま");
assert.equal(hit6000.rawRounds, 10, "表示用の1セットR数を保持");
assert.equal(hit6000.mult, 4, "セット回数を保持");
assert.equal(hit6000.rounds, 40, "集計用R数は10R×4=40R");
assert.equal(hit6000.displayBalls, 6000, "液晶出玉は1500×4=6000玉");
assert.equal(hit6000.sapoChange, 0, "増減計算でも合計出玉を使うこと");

const hit3000 = buildMultiRoundHit(2, {
  rounds: 10,
  mult: 2,
  displayBalls: 1500,
  time: "test-time",
});
assert.equal(hit3000.rounds, 20, "10R×2=20R");
assert.equal(hit3000.displayBalls, 3000, "1500×2=3000玉");
assert.equal(hit6000.rounds + hit3000.rounds, 60, "実践全体の総R数も正しく合算できること");

const normalHit = buildMultiRoundHit(3, {
  rounds: 3,
  displayBalls: 450,
  time: "test-time",
});
assert.equal(normalHit.rounds, 3, "通常の単一大当たりは従来どおり");
assert.equal(normalHit.displayBalls, 450, "通常の出玉は従来どおり");

console.log("machineRoundOptions: all tests passed");
