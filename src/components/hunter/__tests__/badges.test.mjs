// バッジ解放の純関数テスト（Node 標準 assert のみ。CI 未統合・手動実行）
//
// 実行: node src/components/hunter/__tests__/badges.test.mjs

import assert from "node:assert/strict";
import {
  BADGES,
  computeBadgeMetrics,
  evaluateBadgeUnlocks,
  unlockBadges,
  getBadgeById,
} from "../badges.js";
import { initialRank } from "../hunterRank.js";

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

console.log("badges.test.mjs");

it("BADGES: 必須 ID が揃っている", () => {
  const ids = BADGES.map((b) => b.id);
  for (const required of [
    "first_jp", "sessions_10", "sessions_50", "lv5", "lv10", "lv25",
    "xp_10k", "streak_3", "streak_7", "streak_30", "rot_10k", "jp_100",
  ]) {
    assert.ok(ids.includes(required), `missing badge: ${required}`);
  }
});

it("BADGES: id は重複しない", () => {
  const ids = BADGES.map((b) => b.id);
  const uniq = new Set(ids);
  assert.equal(uniq.size, ids.length);
});

it("getBadgeById: 存在する ID で定義を返す / 存在しない ID で null", () => {
  assert.equal(getBadgeById("lv10").label, "中堅ハンター");
  assert.equal(getBadgeById("not_exist"), null);
  assert.equal(getBadgeById(null), null);
});

it("computeBadgeMetrics: 空入力で全て 0/初期値", () => {
  const m = computeBadgeMetrics({});
  assert.equal(m.level, 1);
  assert.equal(m.totalXp, 0);
  assert.equal(m.streakDays, 0);
  assert.equal(m.sessionsCount, 0);
  assert.equal(m.lifetimeHits, 0);
  assert.equal(m.lifetimeRot, 0);
});

it("computeBadgeMetrics: 現在 jpLog から hits を集計", () => {
  const jpLog = [
    { hits: [{}, {}] },
    { hits: [{}] },
    {}, // hits 欠損
  ];
  const m = computeBadgeMetrics({ jpLog });
  assert.equal(m.lifetimeHits, 3);
});

it("computeBadgeMetrics: archives の hits も合算", () => {
  const archives = [
    { jpLog: [{ hits: [{}, {}] }, { hits: [{}] }] },
    { jpLog: [{ hits: [{}, {}, {}] }] },
  ];
  const jpLog = [{ hits: [{}] }];
  const m = computeBadgeMetrics({ archives, jpLog });
  assert.equal(m.lifetimeHits, 3 + 3 + 1);
});

it("computeBadgeMetrics: archives の stats.netRot と現在 ev.netRot を合算", () => {
  const archives = [
    { stats: { netRot: 4000 } },
    { stats: { netRot: 2500 } },
    { stats: {} }, // 欠損
    null,          // 不正データ
  ];
  const ev = { netRot: 1234 };
  const m = computeBadgeMetrics({ archives, ev });
  assert.equal(m.lifetimeRot, 4000 + 2500 + 1234);
});

it("computeBadgeMetrics: sessionsCount は archives 件数（null 除外）", () => {
  const archives = [{}, {}, null, {}];
  const m = computeBadgeMetrics({ archives });
  assert.equal(m.sessionsCount, 3);
});

it("computeBadgeMetrics: rank 不正でも安全に既定値", () => {
  const m = computeBadgeMetrics({ rank: null });
  assert.equal(m.level, 1);
  assert.equal(m.totalXp, 0);
});

it("evaluateBadgeUnlocks: 条件成立 + 未解放のみ返す", () => {
  const metrics = {
    level: 12, totalXp: 12000, streakDays: 4,
    sessionsCount: 11, lifetimeHits: 50, lifetimeRot: 15000,
  };
  const newly = evaluateBadgeUnlocks(metrics, []);
  const ids = newly.map((b) => b.id);
  // 該当: first_jp, sessions_10, lv5, lv10, xp_10k, streak_3, rot_10k
  assert.ok(ids.includes("first_jp"));
  assert.ok(ids.includes("sessions_10"));
  assert.ok(ids.includes("lv5"));
  assert.ok(ids.includes("lv10"));
  assert.ok(ids.includes("xp_10k"));
  assert.ok(ids.includes("streak_3"));
  assert.ok(ids.includes("rot_10k"));
  // 未成立: sessions_50, lv25, streak_7, streak_30, jp_100
  assert.ok(!ids.includes("sessions_50"));
  assert.ok(!ids.includes("lv25"));
  assert.ok(!ids.includes("streak_7"));
  assert.ok(!ids.includes("streak_30"));
  assert.ok(!ids.includes("jp_100"));
});

it("evaluateBadgeUnlocks: alreadyUnlocked のものは返さない", () => {
  const metrics = { level: 5, totalXp: 0, streakDays: 0, sessionsCount: 0, lifetimeHits: 0, lifetimeRot: 0 };
  const newly = evaluateBadgeUnlocks(metrics, ["lv5"]);
  const ids = newly.map((b) => b.id);
  assert.ok(!ids.includes("lv5"));
});

it("evaluateBadgeUnlocks: 0 入力で何も解放しない", () => {
  const metrics = computeBadgeMetrics({});
  const newly = evaluateBadgeUnlocks(metrics, []);
  assert.equal(newly.length, 0);
});

it("evaluateBadgeUnlocks: 30日連続なら streak_3/7/30 全て解放", () => {
  const m = { level: 1, totalXp: 0, streakDays: 30, sessionsCount: 0, lifetimeHits: 0, lifetimeRot: 0 };
  const ids = evaluateBadgeUnlocks(m, []).map((b) => b.id);
  assert.ok(ids.includes("streak_3"));
  assert.ok(ids.includes("streak_7"));
  assert.ok(ids.includes("streak_30"));
});

it("evaluateBadgeUnlocks: 入力 unlockedBadges を変更しない", () => {
  const m = { level: 25, totalXp: 0, streakDays: 0, sessionsCount: 0, lifetimeHits: 0, lifetimeRot: 0 };
  const original = ["lv5", "lv10"];
  const snap = JSON.parse(JSON.stringify(original));
  evaluateBadgeUnlocks(m, original);
  assert.deepEqual(original, snap);
});

it("unlockBadges: 新規 ID を追加した新 rank を返す", () => {
  const base = { ...initialRank(), unlockedBadges: ["first_jp"] };
  const after = unlockBadges(base, ["lv5", "lv10"]);
  assert.deepEqual(after.unlockedBadges.sort(), ["first_jp", "lv5", "lv10"].sort());
  // 元 rank は変更されていない
  assert.deepEqual(base.unlockedBadges, ["first_jp"]);
});

it("unlockBadges: 重複 ID は無視", () => {
  const base = { ...initialRank(), unlockedBadges: ["lv5"] };
  const after = unlockBadges(base, ["lv5", "lv5", "lv10"]);
  const set = new Set(after.unlockedBadges);
  assert.equal(set.size, 2);
});

it("unlockBadges: 空配列なら元 rank をそのまま返す（プロパティ等価）", () => {
  const base = { ...initialRank(), unlockedBadges: ["lv5"] };
  const after = unlockBadges(base, []);
  assert.deepEqual(after.unlockedBadges, ["lv5"]);
});

it("unlockBadges: BADGES の定義順で並び替え", () => {
  // 定義順: ... lv5, lv10, lv25 ...
  const base = { ...initialRank(), unlockedBadges: ["lv25", "lv5"] };
  const after = unlockBadges(base, ["lv10"]);
  const idx = (id) => after.unlockedBadges.indexOf(id);
  assert.ok(idx("lv5") < idx("lv10"));
  assert.ok(idx("lv10") < idx("lv25"));
});

it("unlockBadges: 未知 ID は末尾に保持（将来互換）", () => {
  const base = { ...initialRank(), unlockedBadges: ["future_badge", "lv5"] };
  const after = unlockBadges(base, ["lv10"]);
  // future_badge は末尾
  assert.equal(after.unlockedBadges[after.unlockedBadges.length - 1], "future_badge");
  assert.ok(after.unlockedBadges.includes("lv5"));
  assert.ok(after.unlockedBadges.includes("lv10"));
});

it("unlockBadges: null rank で initialRank ベース", () => {
  const after = unlockBadges(null, ["lv5"]);
  assert.deepEqual(after.unlockedBadges, ["lv5"]);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
