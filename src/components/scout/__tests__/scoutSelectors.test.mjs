// src/components/scout/__tests__/scoutSelectors.test.mjs
// 実行: node src/components/scout/__tests__/scoutSelectors.test.mjs
//
// 偵察モードの店舗別集計セレクタの境界値テスト。
// - 空配列・不正データで破綻しないこと
// - 店舗名空欄は "店舗未登録" に集約されること
// - 実損益あり店舗が期待値のみの店舗より上位に来ること
// - verdict 判定が閾値で切り替わること
// - 直近 N 日フィルタが正しく機能すること

import assert from "node:assert";
import { getStoreRanking, listKnownStores } from "../scoutSelectors.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL [${name}]: ${e.message}`);
    failed++;
  }
}

// ──────────── 空配列 / 不正入力 ────────────
test("空配列でも空配列を返す", () => {
  assert.deepStrictEqual(getStoreRanking([]), []);
  assert.deepStrictEqual(getStoreRanking([], { limit: 5 }), []);
});
test("null/undefined を渡しても破綻しない", () => {
  assert.deepStrictEqual(getStoreRanking(null), []);
  assert.deepStrictEqual(getStoreRanking(undefined), []);
});
test("listKnownStores: 空入力で空配列", () => {
  assert.deepStrictEqual(listKnownStores([]), []);
  assert.deepStrictEqual(listKnownStores(null), []);
});

// ──────────── 基本集計 ────────────
test("単一店舗・実損益あり: 1件で集計が回る", () => {
  const archives = [
    {
      date: "2026-05-10",
      storeName: "マルハン渋谷",
      investYen: 20000,
      recoveryYen: 32000,
      stats: { workAmount: 5000 },
    },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].storeName, "マルハン渋谷");
  assert.strictEqual(r[0].rank, 1);
  assert.strictEqual(r[0].sessions, 1);
  assert.strictEqual(r[0].days, 1);
  assert.strictEqual(r[0].totalPL, 12000);
  assert.strictEqual(r[0].totalInvest, 20000);
  assert.strictEqual(r[0].totalRecovery, 32000);
  assert.strictEqual(r[0].hasActual, true);
  assert.strictEqual(r[0].winRate, 100);
  assert.strictEqual(Math.round(r[0].recoverRate), 160);
  assert.strictEqual(r[0].verdict, "strong"); // totalPL >= 10000
});

test("店舗名が空文字 → '店舗未登録' に集約", () => {
  const archives = [
    { date: "2026-05-01", storeName: "", investYen: 5000, recoveryYen: 3000, stats: { workAmount: 100 } },
    { date: "2026-05-02", storeName: "   ", investYen: 6000, recoveryYen: 4000, stats: { workAmount: 200 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].storeName, "店舗未登録");
  assert.strictEqual(r[0].sessions, 2);
});

test("複数店舗: 実損益記録あり店舗が EV のみ店舗より上位", () => {
  const archives = [
    // A 店: 実損益あり (収支 +5000)
    { date: "2026-05-10", storeName: "A店", investYen: 10000, recoveryYen: 15000, stats: { workAmount: 1000 } },
    // B 店: 実損益なし (期待値 100000 — 大きい)
    { date: "2026-05-10", storeName: "B店", investYen: 0, recoveryYen: 0, stats: { workAmount: 100000 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].storeName, "A店");
  assert.strictEqual(r[1].storeName, "B店");
  assert.strictEqual(r[0].hasActual, true);
  assert.strictEqual(r[1].hasActual, false);
});

test("複数の実損益店舗: 収支降順で並ぶ", () => {
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 10000, recoveryYen: 11000, stats: { workAmount: 0 } },
    { date: "2026-05-10", storeName: "B", investYen: 10000, recoveryYen: 25000, stats: { workAmount: 0 } },
    { date: "2026-05-10", storeName: "C", investYen: 10000, recoveryYen: 5000,  stats: { workAmount: 0 } },
  ];
  const r = getStoreRanking(archives);
  assert.deepStrictEqual(r.map((x) => x.storeName), ["B", "A", "C"]);
  assert.deepStrictEqual(r.map((x) => x.rank), [1, 2, 3]);
});

test("limit が効く", () => {
  const archives = Array.from({ length: 10 }, (_, i) => ({
    date: "2026-05-10",
    storeName: `店${i}`,
    investYen: 10000,
    recoveryYen: 10000 + i * 100,
    stats: { workAmount: 0 },
  }));
  const r = getStoreRanking(archives, { limit: 3 });
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].storeName, "店9");
});

// ──────────── verdict 判定 ────────────
test("verdict: 大幅プラス → strong", () => {
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 20000, recoveryYen: 40000, stats: { workAmount: 0 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].verdict, "strong");
});
test("verdict: 大幅マイナス → weak", () => {
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 30000, recoveryYen: 5000, stats: { workAmount: 0 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].verdict, "weak");
});
test("verdict: 微増 → neutral", () => {
  // recoverRate 105% / totalPL 1000 → どちらの strong/weak しきい値にも該当しない
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 20000, recoveryYen: 21000, stats: { workAmount: 0 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].verdict, "neutral");
});
test("verdict: 期待値のみ大きい → strong", () => {
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 0, recoveryYen: 0, stats: { workAmount: 50000 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].verdict, "strong");
});

// ──────────── 勝率 ────────────
test("勝率: 3勝1敗 → 75%", () => {
  const archives = [
    { date: "2026-05-10", storeName: "A", investYen: 10000, recoveryYen: 15000, stats: { workAmount: 0 } },
    { date: "2026-05-11", storeName: "A", investYen: 10000, recoveryYen: 12000, stats: { workAmount: 0 } },
    { date: "2026-05-12", storeName: "A", investYen: 10000, recoveryYen: 11000, stats: { workAmount: 0 } },
    { date: "2026-05-13", storeName: "A", investYen: 10000, recoveryYen: 5000,  stats: { workAmount: 0 } },
  ];
  const r = getStoreRanking(archives);
  assert.strictEqual(r[0].winRate, 75);
  assert.strictEqual(r[0].days, 4);
  assert.strictEqual(r[0].sessions, 4);
});

// ──────────── recentDays フィルタ ────────────
test("recentDays フィルタ: 範囲外は除外", () => {
  const ref = "2026-05-20";
  const archives = [
    { date: "2026-05-19", storeName: "A", investYen: 10000, recoveryYen: 12000, stats: { workAmount: 0 } }, // 1日前 → 含む
    { date: "2026-05-13", storeName: "B", investYen: 10000, recoveryYen: 12000, stats: { workAmount: 0 } }, // 7日前 → 含む
    { date: "2026-04-01", storeName: "C", investYen: 10000, recoveryYen: 12000, stats: { workAmount: 0 } }, // 50日前 → 除外
  ];
  const r = getStoreRanking(archives, { recentDays: 7, refDate: ref });
  const names = r.map((x) => x.storeName);
  assert.ok(names.includes("A"));
  assert.ok(names.includes("B"));
  assert.ok(!names.includes("C"));
});

// ──────────── listKnownStores ────────────
test("listKnownStores: 出現回数降順", () => {
  const archives = [
    { storeName: "A" },
    { storeName: "B" },
    { storeName: "A" },
    { storeName: "C" },
    { storeName: "A" },
    { storeName: "B" },
    { storeName: "" },    // 空文字は除外
    { storeName: "  " },  // 空白のみも除外
  ];
  assert.deepStrictEqual(listKnownStores(archives), ["A", "B", "C"]);
});

// ──────────── 不正データの混入 ────────────
test("date 欠落・型不正でも他レコードを集計できる", () => {
  const archives = [
    { storeName: "A", investYen: 10000, recoveryYen: 15000, stats: { workAmount: 0 } }, // date 欠落 → 集計対象（recentDays 指定時のみフィルタ）
    null,
    undefined,
    { storeName: "B", investYen: "abc", recoveryYen: null, stats: null }, // 投資/回収パースエラー
  ];
  const r = getStoreRanking(archives);
  // 少なくとも A 店は集計されている
  const a = r.find((x) => x.storeName === "A");
  assert.ok(a);
  assert.strictEqual(a.totalPL, 5000);
});

// ──────────── 出力サマリー ────────────
if (failed === 0) {
  console.log(`OK: ${passed} tests passed`);
  process.exit(0);
} else {
  console.error(`NG: ${failed} test(s) failed (${passed} passed)`);
  process.exit(1);
}
