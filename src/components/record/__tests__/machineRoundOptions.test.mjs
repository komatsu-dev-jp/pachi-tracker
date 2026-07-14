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
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e花の慶次～黄金の一撃"), "rush")),
  ["10R×1", "10R×2", "10R×4"],
  "花の慶次は1500・3000・6000玉を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("eとある科学の超電磁砲 PHASE NEXT"), "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "超電磁砲は1500～7500玉の各セット数を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("eフィーバーキン肉マン"), "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "キン肉マンは1500～7500玉の全セット数を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e牙狼12黄金騎士極限 XX-MJ"), "rush")),
  ["10R×1", "10R×5"],
  "牙狼12は1500・7500玉を選択できること",
);
const ryza = machine("eライザのアトリエ 常闇の女王と秘密の隠れ家 K3");
assert.ok(signatures(getMachineRoundOptions(ryza, "heso")).includes("12R×1"), "ライザの1800玉は2R+10R=12Rで記録できること");
const ryzaLoop = getMachineRoundLoop(ryza, "rush", 10);
assert.equal(changeRoundMultiplier(3, 1, ryzaLoop), 6, "ライザは4500玉単位で上乗せできること");
assert.equal(changeRoundMultiplier(9, -1, ryzaLoop), 6, "ライザの上乗せ回数を訂正できること");
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("e86-エイティシックス- MAM2"), "rush")),
  ["2R×1", "10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "86はキリヤ血戦を含む公表範囲を選択できること",
);
assert.deepEqual(
  signatures(getMachineRoundOptions(machine("eリング 最恐領域 RHA"), "rush")),
  ["10R×1", "10R×2", "10R×4"],
  "リング最恐領域は1500・3000・6000玉を選択できること",
);

assert.equal(changeRoundMultiplier(4, 1), 5, "未登録のループ機種も1セットずつ手動調整できること");

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("eルパン三世VSキャッツ・アイ 157ver. 極限突破ブッた斬り7500"), "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "ルパン猫157は1500～7500発を実際の10R回数で選べること",
);

const megami = machine("e女神のカフェテラス JLZ");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(megami, "rush")),
  ["10R×1", "10R×2", "10R×3"],
  "女神のカフェテラスは1500・3000・4500発を選べること",
);
const megamiLoop = getMachineRoundLoop(megami, "rush", 10);
assert.equal(changeRoundMultiplier(3, 1, megamiLoop), 4, "女神のカフェテラスは爆乗せ分を10R単位で追加できること");
assert.equal(changeRoundMultiplier(7, -1, megamiLoop), 6, "女神のカフェテラスの上乗せ回数を訂正できること");

const blueLock = machine("eフィーバーブルーロック");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(blueLock, "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "ブルーロックは1500～7500発を選べること",
);
const blueLockLoop = getMachineRoundLoop(blueLock, "rush", 10);
assert.equal(changeRoundMultiplier(5, 1, blueLockLoop), 6, "ブルーロックは保証分を加えた実質9000発を記録できること");
assert.equal(changeRoundMultiplier(8, -1, blueLockLoop), 7, "ブルーロックの連続上乗せ回数を訂正できること");

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("e新世紀エヴァンゲリオン ～はじまりの記憶～"), "rush")),
  ["8R×2", "8R×4"],
  "はじまりの記憶は2400・4800発を8R回数で記録できること",
);

const kake219 = machine("eカケグルイ219ver.");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(kake219, "rush")),
  ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
  "カケグルイ219は1500～7500発を選べること",
);
assert.equal(changeRoundMultiplier(5, 1, getMachineRoundLoop(kake219, "rush", 10)), 10, "カケグルイ219は7500発単位で再上乗せできること");

const kake7500 = machine("eカケグルイ7500ver.");
assert.deepStrictEqual(signatures(getMachineRoundOptions(kake7500, "rush")), ["10R×1", "10R×5"], "カケグルイ7500の基本候補");
assert.equal(changeRoundMultiplier(5, 1, getMachineRoundLoop(kake7500, "rush", 10)), 10, "カケグルイ7500は30%ループを記録できること");

const hikikomari = machine("eひきこまり吸血姫の悶々");
assert.deepStrictEqual(signatures(getMachineRoundOptions(hikikomari, "rush")), ["10R×1", "10R×2", "10R×3", "10R×4"], "ひきこまりのBONUS候補");
assert.equal(changeRoundMultiplier(4, 1, getMachineRoundLoop(hikikomari, "rush", 10)), 5, "ひきこまりは1G連保証分を追加できること");

const bio6 = machine("eバイオハザード6");
const bioOptions = getMachineRoundOptions(bio6, "rush");
assert.equal(bioOptions.length, 25, "バイオ6は公表25パターンを記録候補に持つこと");
assert.deepStrictEqual([bioOptions[0].totalRounds, bioOptions.at(-1).totalRounds], [2, 50], "バイオ6は2R相当～50R相当を記録できること");

const inuyasha3 = machine("P犬夜叉3.0甘SPEC");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(inuyasha3, "rush")),
  ["2R×1", "10R×1", "10R×2"],
  "犬夜叉甘は200・1000・2000発のR数を選べること",
);
assert.equal(changeRoundMultiplier(2, 1, getMachineRoundLoop(inuyasha3, "rush", 10)), 3, "犬夜叉甘は+αの10Rを追加できること");

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PA海物語 極JAPAN Withナギナミ"), "rush")),
  ["3R×1", "10R×1", "10R×2"],
  "極JAPANは3R・10R・10R×2を区別して記録できること",
);

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("e真・一騎当千～軍神覚醒～ 396ver."), "rush")),
  ["10R×1", "10R×2"],
  "一騎当千396は1500・3000発を記録できること",
);

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("Pクイーンズブレイド奈落 ナナエル79Ver."), "rush")),
  ["10R×1", "10R×5"],
  "QB奈落は600発と3000発（10R×5）を区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PフィーバークィーンⅡ YS"), "rush")),
  ["4R×1", "10R×1"],
  "クィーンⅡは電サポ表と別に4R・10Rを記録できること",
);
const ginpara = machine("eまわるん超ワープ ギンギラパラダイス VIVA FESTA HTA2");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(ginpara, "rush")),
  ["3R×1", "10R×1", "10R×2", "10R×3"],
  "ギンパラVIVA FESTAは∞ストック分を実際のR数で記録できること",
);
assert.equal(changeRoundMultiplier(3, 1, getMachineRoundLoop(ginpara, "rush", 10)), 4, "ギンパラの追加10Rを記録できること");
const lupinOc = machine("eルパン三世 ONE COLLECTION 超ブチヌキLTver.");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(lupinOc, "rush")),
  ["2R×1", "2R×2", "10R×1", "10R×2"],
  "ルパン超ブチヌキは2回セットの実際の組合せを記録できること",
);
assert.equal(changeRoundMultiplier(2, 1, getMachineRoundLoop(lupinOc, "rush", 10)), 3, "ルパン超ブチヌキの+αを追加できること");

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("eぱちんこ押忍!番長 男の頂"), "rush")),
  ["2R×1", "20R×1"],
  "番長の3000発は10R+5R+5Rの合計20Rとして記録できること",
);
for (const name of ["Pフィーバーからくりサーカス2 運命ver.", "eフィーバーからくりサーカス2 魔王ver."]) {
  assert.deepStrictEqual(
    signatures(getMachineRoundOptions(machine(name), "rush")),
    ["10R×1", "10R×2", "10R×3", "10R×4", "10R×5"],
    `${name}は1500～7500発を実際の10R回数で記録できること`,
  );
}
const sympho4 = machine("eフィーバー戦姫絶唱シンフォギア4 キャロルver.");
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(sympho4, "rush")),
  ["10R×1", "10R×2", "10R×3"],
  "シンフォギア4は1500・3000・最低4500発を記録できること",
);
assert.equal(changeRoundMultiplier(3, 1, getMachineRoundLoop(sympho4, "rush", 10)), 4, "シンフォギア4の上乗せ10Rを追加できること");

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PA海物語3R3"), "rush")),
  ["5R×1", "10R×1"],
  "海物語3R3は5R・10Rを区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PA大海物語5ブラックLT99ver."), "rush")),
  ["3R×1", "8R×1"],
  "大海5ブラックLT99は3R・8Rを区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("Pデビルマン THE FINAL"), "rush")),
  ["2R×1", "3R×1", "7R×1"],
  "デビルマンTHE FINALは2R・3R・7Rを区別して記録できること",
);

assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("P海物語 極JAPAN"), "rush")),
  ["2R×1", "10R×1", "20R×1"],
  "極JAPANは300・1500・3000発を実際のR数で記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PAスーパー海物語IN地中海2"), "rush")),
  ["4R×1", "6R×1", "10R×1"],
  "地中海2は4R・6R・10Rを区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("P大海物語5ブラック"), "rush")),
  ["3R×1", "10R×1"],
  "大海5ブラックは3R・10Rを区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("e新海物語349"), "rush")),
  ["2R×1", "10R×1"],
  "e新海349は2R・10Rを区別して記録できること",
);
assert.deepStrictEqual(
  signatures(getMachineRoundOptions(machine("PA大海物語5 Withアグネス・ラム"), "rush")),
  ["4R×1", "6R×1", "10R×1"],
  "大海5アグネスは4R・6R・10Rを区別して記録できること",
);

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
