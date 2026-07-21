import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStoreMachineNumberCandidates,
  buildStoreMachineNumberRelation,
  compareConfirmedMachineNumbers,
  summarizeStoreMachineNumberRelations,
} from "../storeMachineNumberRelation.js";

const expected52 = [
  ...Array.from({ length: 12 }, (_, index) => String(479 + index)),
  ...Array.from({ length: 11 }, (_, index) => String(499 + index)),
  ...Array.from({ length: 29 }, (_, index) => String(546 + index)),
];

function jointSlot(number) {
  return { jointMatch: { accepted: true, resolvedNum: String(number) } };
}

function ocrSlot(number) {
  return { machineNumberOcr: { accepted: true, candidate: String(number) } };
}

test("正式52台の飛び番号を1島の候補として正確に表現する", () => {
  const [candidate] = buildStoreMachineNumberCandidates([{
    id: "tokyo-ghoul",
    name: "東京喰種島",
    machineName: "e東京喰種",
    // 行方向が逆でも、サイト掲載順の 479〜490 / 499〜509 / 546〜574 へ揃える。
    ranges: [
      { start: 509, end: 499 },
      { start: 479, end: 490 },
      { start: 546, end: 574 },
    ],
  }]);

  assert.equal(candidate.numberCount, 52);
  assert.deepEqual(candidate.numbers, expected52);
  assert.equal(candidate.candidateName, "東京喰種島");
  assert.equal(candidate.candidateLabel, "東京喰種島・e東京喰種");
  assert.equal(candidate.numbers.includes("491"), false);
  assert.equal(candidate.numbers.includes("545"), false);
  assert.deepEqual(
    [0, 11, 12, 19, 20, 22, 23, 39, 40, 51].map((index) => candidate.numbers[index]),
    ["479", "490", "499", "506", "507", "509", "546", "562", "563", "574"],
  );
});

test("正式52台を1範囲と欠け番号で登録しても同じ候補になる", () => {
  const gaps = [
    ...Array.from({ length: 8 }, (_, index) => 491 + index),
    ...Array.from({ length: 36 }, (_, index) => 510 + index),
  ];
  const [candidate] = buildStoreMachineNumberCandidates([{
    id: "gap-form",
    name: "欠け表現",
    start: 479,
    end: 574,
    gaps,
  }]);
  assert.deepEqual(candidate.numbers, expected52);
});

test("rangesとgapsを反映し、欠け台を補助候補へ混ぜない", () => {
  const [candidate] = buildStoreMachineNumberCandidates([{
    id: "gap-island",
    name: "欠け台あり",
    ranges: [{ start: 479, end: 483 }, { start: 490, end: 492 }],
    gaps: [481, 491],
  }]);

  assert.deepEqual(candidate.numbers, ["479", "480", "482", "483", "490", "492"]);
  assert.equal(candidate.numberCount, 6);
});

test("一意候補は固定点を上書きせず、未解決slotだけ補助入力として返す", () => {
  const slots = Array.from({ length: 52 }, () => ({}));
  slots[0] = jointSlot(479);
  slots[11] = jointSlot(490);
  slots[12] = ocrSlot(499);
  slots[23] = jointSlot(546);
  slots[51] = jointSlot(574);

  const relation = buildStoreMachineNumberRelation({
    islands: [{
      id: "only",
      name: "正式52台",
      ranges: [
        { start: 479, end: 490 },
        { start: 499, end: 509 },
        { start: 546, end: 574 },
      ],
    }],
    slots,
  });

  assert.equal(relation.compatibleCandidates.length, 1);
  assert.equal(relation.suggestion.available, true);
  assert.equal(relation.suggestion.autoConfirmed, false);
  assert.equal(relation.suggestion.manualVerificationRequired, true);
  assert.equal(relation.suggestion.basis, "fixed-index");
  assert.equal(relation.suggestion.suggestedManualNumbersByIndex[1], "480");
  assert.equal(relation.suggestion.suggestedManualNumbersByIndex[50], "573");
  for (const fixedIndex of [0, 11, 12, 23, 51]) {
    assert.equal(
      Object.hasOwn(relation.suggestion.suggestedManualNumbersByIndex, fixedIndex),
      false,
      `固定済みindex ${fixedIndex}を補助入力で上書きしない`,
    );
  }
  assert.ok(relation.suggestion.suggestions.every((suggestion) => (
    suggestion.source === "store-map" && suggestion.requiresReview === true
  )));
});

test("同じslot数の候補が複数残る場合は補助入力を作らない", () => {
  const relation = buildStoreMachineNumberRelation({
    islands: [
      { id: "a", name: "A島", start: 100, end: 102 },
      { id: "b", name: "B島", start: 200, end: 202 },
    ],
    slots: [{}, {}, {}],
  });

  assert.equal(relation.compatibleCandidates.length, 2);
  assert.equal(relation.suggestion.available, false);
  assert.equal(relation.suggestion.reason, "multiple-compatible-candidates");
  assert.deepEqual(relation.suggestion.suggestedManualNumbersByIndex, {});
});

test("slot数不一致または固定番号の順序矛盾がある候補は0件になる", () => {
  const countMismatch = buildStoreMachineNumberRelation({
    islands: [{ id: "short", name: "2台島", start: 479, end: 480 }],
    slots: [{}, {}, {}],
  });
  assert.equal(countMismatch.compatibleCandidates.length, 0);
  assert.equal(countMismatch.rejectedCandidates[0].countMatches, false);
  assert.equal(countMismatch.suggestion.reason, "no-compatible-candidate");

  const orderConflict = buildStoreMachineNumberRelation({
    islands: [{ id: "three", name: "3台島", start: 479, end: 481 }],
    slots: [{}, jointSlot(481), {}],
  });
  assert.equal(orderConflict.compatibleCandidates.length, 0);
  assert.deepEqual(orderConflict.rejectedCandidates[0].conflictIndices, [1]);
  assert.equal(orderConflict.suggestion.available, false);
});

test("jointOnlyでは共同照合の固定点だけを使い、単独OCR候補を上書き禁止にしない", () => {
  const islands = [{ id: "map", name: "店舗候補", start: 479, end: 481 }];
  const slots = [jointSlot(479), ocrSlot(999), {}];

  const normal = buildStoreMachineNumberRelation({ islands, slots });
  assert.equal(normal.compatibleCandidates.length, 0, "通常時は信頼済みOCR 999との矛盾を検出する");

  const joint = buildStoreMachineNumberRelation({ islands, slots, jointOnly: true });
  assert.equal(joint.compatibleCandidates.length, 1);
  assert.equal(joint.suggestion.suggestedManualNumbersByIndex[1], "480");
  assert.equal(Object.hasOwn(joint.suggestion.suggestedManualNumbersByIndex, 0), false);
});

test("全確定番号との一致数・不足・余分・候補名と順序矛盾を要約する", () => {
  const candidates = buildStoreMachineNumberCandidates([
    { id: "a", name: "A島", ranges: [{ start: 479, end: 480 }, { start: 482, end: 482 }] },
    { id: "b", name: "B島", start: 600, end: 602 },
  ]);
  const summary = summarizeStoreMachineNumberRelations([479, 480, 999], candidates);
  const a = summary.candidateSummaries.find((candidate) => candidate.candidateId === "a");

  assert.deepEqual(summary.candidateNames, ["A島", "B島"]);
  assert.equal(a.matchCount, 2);
  assert.deepEqual(a.missingNumbers, ["482"]);
  assert.deepEqual(a.extraNumbers, ["999"]);
  assert.equal(a.exactSetMatch, false);
  assert.equal(a.exactOrderMatch, false);
  assert.deepEqual(summary.bestCandidateNames, ["A島"]);

  const reversed = summarizeStoreMachineNumberRelations([480, 479, 482], [candidates[0]])
    .candidateSummaries[0];
  assert.equal(reversed.exactSetMatch, true);
  assert.equal(reversed.exactOrderMatch, false);
  assert.deepEqual(reversed.orderMismatchIndices, [0, 1]);
});

test("完全一致・誤読1台・入れ替えを集合と順序に分けて比較する", () => {
  const exact = compareConfirmedMachineNumbers(expected52, expected52);
  assert.equal(exact.exact, true);
  assert.equal(exact.sameSet, true);
  assert.equal(exact.sameOrder, true);

  const misread = [...expected52];
  misread[43] = "586"; // 566 を 586 と誤読したケース
  const mismatch = compareConfirmedMachineNumbers(misread, expected52);
  assert.equal(mismatch.exact, false);
  assert.deepEqual(mismatch.missingNumbers, ["566"]);
  assert.deepEqual(mismatch.extraNumbers, ["586"]);

  const swapped = [...expected52];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  const order = compareConfirmedMachineNumbers(swapped, expected52);
  assert.equal(order.sameSet, true);
  assert.equal(order.sameOrder, false);
  assert.equal(order.exact, false);
  assert.deepEqual(order.indexMismatches.map(({ index }) => index), [0, 1]);
});

test("重なりrangesや0番を店舗候補として採用しない", () => {
  const candidates = buildStoreMachineNumberCandidates([
    { id: "overlap", name: "重複範囲", ranges: [{ start: 479, end: 481 }, { start: 481, end: 483 }] },
    { id: "zero", name: "0番を含む", start: 0, end: 2 },
    { id: "valid", name: "正常", start: 10, end: 12 },
  ]);
  assert.deepEqual(candidates.map(({ candidateId }) => candidateId), ["valid"]);
});
