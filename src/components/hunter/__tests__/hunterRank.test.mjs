// ハンターランクの純関数テスト（Node 標準 assert のみ。CI 未統合・手動実行）
//
// 実行: node src/components/hunter/__tests__/hunterRank.test.mjs

import assert from "node:assert/strict";
import {
  requiredXpForLevel,
  deriveRankFromTotalXp,
  initialRank,
  addXp,
  computeMigratedRank,
  XP_SESSION_COMPLETE,
} from "../hunterRank.js";

let pass = 0;
let fail = 0;
function it(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  NG  ${name}\n      ${e.message}`);
  }
}

console.log("hunterRank.test.mjs");

it("requiredXpForLevel: 既知値が変わらない", () => {
  assert.equal(requiredXpForLevel(1), 100);
  assert.equal(requiredXpForLevel(2), 282);
  assert.equal(requiredXpForLevel(3), 519);
  assert.equal(requiredXpForLevel(4), 800);
  assert.equal(requiredXpForLevel(5), 1118);
});

it("requiredXpForLevel: 境界値（0・負・NaN）で 0 を返す", () => {
  assert.equal(requiredXpForLevel(0), 0);
  assert.equal(requiredXpForLevel(-1), 0);
  assert.equal(requiredXpForLevel(NaN), 0);
});

it("deriveRankFromTotalXp: 0 XP は Lv1 / currentXp=0", () => {
  const r = deriveRankFromTotalXp(0);
  assert.equal(r.level, 1);
  assert.equal(r.currentXp, 0);
  assert.equal(r.nextRequired, 100);
});

it("deriveRankFromTotalXp: Lv1 直前は 99 XP", () => {
  const r = deriveRankFromTotalXp(99);
  assert.equal(r.level, 1);
  assert.equal(r.currentXp, 99);
});

it("deriveRankFromTotalXp: 100 XP で Lv2 / 余り 0", () => {
  const r = deriveRankFromTotalXp(100);
  assert.equal(r.level, 2);
  assert.equal(r.currentXp, 0);
  assert.equal(r.nextRequired, 282);
});

it("deriveRankFromTotalXp: 100+282=382 XP で Lv3 / 余り 0", () => {
  const r = deriveRankFromTotalXp(382);
  assert.equal(r.level, 3);
  assert.equal(r.currentXp, 0);
});

it("deriveRankFromTotalXp: 100+282+250 = 632 XP で Lv3 / 余り 250", () => {
  const r = deriveRankFromTotalXp(632);
  assert.equal(r.level, 3);
  assert.equal(r.currentXp, 250);
});

it("deriveRankFromTotalXp: 不正入力（負・NaN・null）は 0 として扱う", () => {
  assert.equal(deriveRankFromTotalXp(-1).level, 1);
  assert.equal(deriveRankFromTotalXp(NaN).level, 1);
  assert.equal(deriveRankFromTotalXp(null).level, 1);
});

it("initialRank: 既定値", () => {
  const r = initialRank();
  assert.equal(r.level, 1);
  assert.equal(r.currentXp, 0);
  assert.equal(r.totalXp, 0);
  assert.deepEqual(r.unlockedBadges, []);
  assert.equal(r.lastActionAt, 0);
});

it("addXp: 入力 rank を変更しない（純関数）", () => {
  const base = initialRank();
  const snap = JSON.parse(JSON.stringify(base));
  addXp(base, 50, 12345);
  assert.deepEqual(base, snap);
});

it("addXp: +50 でレベル維持・currentXp が増える", () => {
  const r1 = addXp(initialRank(), 50, 1000);
  assert.equal(r1.level, 1);
  assert.equal(r1.currentXp, 50);
  assert.equal(r1.totalXp, 50);
  assert.equal(r1.lastActionAt, 1000);
});

it("addXp: 累計 100 XP でレベルアップ Lv1→Lv2", () => {
  let r = initialRank();
  r = addXp(r, 50, 1);
  r = addXp(r, 50, 2);
  assert.equal(r.level, 2);
  assert.equal(r.currentXp, 0);
  assert.equal(r.totalXp, 100);
});

it("addXp: 一気に大量加算しても deriveRankFromTotalXp と一致", () => {
  const r = addXp(initialRank(), 5000, 1);
  const d = deriveRankFromTotalXp(5000);
  assert.equal(r.level, d.level);
  assert.equal(r.currentXp, d.currentXp);
  assert.equal(r.totalXp, 5000);
});

it("addXp: 0 加算は lastActionAt を更新しない", () => {
  const base = { ...initialRank(), lastActionAt: 999 };
  const r = addXp(base, 0, 12345);
  assert.equal(r.lastActionAt, 999);
});

it("addXp: 不正入力（NaN・負）も安全に 0 として扱う", () => {
  const r1 = addXp(initialRank(), NaN, 1);
  assert.equal(r1.totalXp, 0);
  const r2 = addXp(initialRank(), -100, 1);
  assert.equal(r2.totalXp, 0);
});

it("addXp: null rank 入力で initialRank ベースに加算", () => {
  const r = addXp(null, 50, 1);
  assert.equal(r.totalXp, 50);
  assert.equal(r.level, 1);
});

it("computeMigratedRank: archives 空で初期 rank", () => {
  const r = computeMigratedRank({ archives: [] });
  assert.equal(r.totalXp, 0);
  assert.equal(r.level, 1);
});

it("computeMigratedRank: archives 3 件で 150 XP / Lv2 余り 50", () => {
  const r = computeMigratedRank({ archives: [{}, {}, {}] });
  assert.equal(r.totalXp, 3 * XP_SESSION_COMPLETE);
  assert.equal(r.level, 2);
  assert.equal(r.currentXp, 50);
});

it("computeMigratedRank: 引数なしでも安全", () => {
  const r = computeMigratedRank();
  assert.equal(r.totalXp, 0);
  assert.equal(r.level, 1);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
