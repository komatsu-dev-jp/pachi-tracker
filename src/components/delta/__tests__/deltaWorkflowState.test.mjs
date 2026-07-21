import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPartialMachineNumberAssignment,
  canAutoAcceptSiteSevenReports,
  createImageSelectionSnapshot,
  seedPartialMachineNumberInputs,
  shouldAcceptImageAnalysis,
  summarizeSiteSevenReviewState,
  trustedMachineNumberForSlot,
} from "../deltaWorkflowState.js";

test("サイトセブン資料は全ファイルが安全な場合だけ共同照合を自動確定する", () => {
  const safe = [{
    kind: "pdf",
    autoAcceptable: true,
    skippedCount: 0,
    duplicateCount: 0,
    error: null,
  }];

  assert.equal(canAutoAcceptSiteSevenReports(safe), true);
  assert.equal(canAutoAcceptSiteSevenReports([]), false);
  assert.equal(canAutoAcceptSiteSevenReports([{ ...safe[0], autoAcceptable: false }]), false);
  assert.equal(canAutoAcceptSiteSevenReports([{ ...safe[0], skippedCount: 1 }]), false);
  assert.equal(canAutoAcceptSiteSevenReports([{ ...safe[0], duplicateCount: 1 }]), false);
  assert.equal(canAutoAcceptSiteSevenReports([{ ...safe[0], error: "read failed" }]), false);
  assert.equal(canAutoAcceptSiteSevenReports([{
    kind: "image",
    autoAcceptable: true,
    skippedCount: 0,
    fieldReviewCount: 1,
    duplicateCount: 0,
    error: null,
  }]), true, "回転数などのfield reviewはnum/max共同照合の自動確定を妨げない");
});

test("解析開始後に画像の追加・削除・並べ替えがあれば古い結果を採用しない", () => {
  const first = { id: "graph-1", name: "graph-1.jpg", dataUrl: "data:a" };
  const second = { id: "table-1", name: "table-1.jpg", dataUrl: "data:bb" };
  const selected = [first, second];
  const snapshot = createImageSelectionSnapshot(selected);

  assert.equal(shouldAcceptImageAnalysis({
    requestId: 4,
    activeRequestId: 4,
    selectionSnapshot: snapshot,
    currentImages: selected,
  }), true);
  assert.equal(shouldAcceptImageAnalysis({
    requestId: 4,
    activeRequestId: 5,
    selectionSnapshot: snapshot,
    currentImages: selected,
  }), false);
  assert.equal(shouldAcceptImageAnalysis({
    requestId: 4,
    activeRequestId: 4,
    selectionSnapshot: snapshot,
    currentImages: [second, first],
  }), false);
  assert.equal(shouldAcceptImageAnalysis({
    requestId: 4,
    activeRequestId: 4,
    selectionSnapshot: snapshot,
    currentImages: [first],
  }), false);
});

test("部分照合の固定番号は変更せず、未解決slotだけ手入力を採用する", () => {
  const slots = [
    { jointMatch: { accepted: true, resolvedNum: "479" } },
    {},
    {
      machineNumberOcr: { accepted: true, candidate: "481" },
      machineNumberCandidate: "999",
    },
  ];

  assert.equal(trustedMachineNumberForSlot(slots[0]), "479");
  assert.equal(trustedMachineNumberForSlot(slots[1]), "");
  assert.equal(trustedMachineNumberForSlot(slots[2]), "481");
  assert.deepEqual(
    buildPartialMachineNumberAssignment(slots, { 0: "999", 1: "480", 2: "998" }),
    ["479", "480", "481"],
  );
  assert.deepEqual(
    buildPartialMachineNumberAssignment(slots, { 1: "abc" }),
    ["479", "", "481"],
  );
  assert.deepEqual(
    buildPartialMachineNumberAssignment(slots, { 1: "480", 2: "482" }, { jointOnly: true }),
    ["479", "480", "482"],
    "共同照合中はhard conflictになり得る単独OCR候補を固定点にしない",
  );
  assert.deepEqual(
    seedPartialMachineNumberInputs(slots, ["479", "480", "482"], { jointOnly: true }),
    { 1: "480", 2: "482" },
    "結果画面から戻っても未解決slotの確認済み入力だけを復元する",
  );
});

test("表の目視確認後はsummaryの要確認件数を0へ更新する", () => {
  const summary = {
    fileCount: 1,
    rowCount: 52,
    reviewCount: 3,
    skippedCount: 3,
    imageCount: 1,
  };
  const rows = [
    { num: "546", reviewRequired: true, reviewConfirmed: true },
    { num: "553", reviewRequired: true, reviewConfirmed: true },
    { num: "564", reviewRequired: true, reviewConfirmed: true },
    { num: "574", reviewRequired: false, reviewConfirmed: false },
  ];

  assert.deepEqual(summarizeSiteSevenReviewState(summary, rows), {
    ...summary,
    reviewCount: 0,
    skippedCount: 0,
  });
  assert.equal(
    summarizeSiteSevenReviewState(summary, [
      ...rows.slice(0, 2),
      { ...rows[2], reviewConfirmed: false },
    ]).reviewCount,
    1,
  );
});
