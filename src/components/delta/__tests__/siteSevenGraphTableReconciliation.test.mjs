import test from "node:test";
import assert from "node:assert/strict";

import { reconcileSiteSevenRowsWithGraphSequence } from "../siteSevenGraphTableReconciliation.js";

function graphSequence(numbers, { source = "graphs-1.jpg" } = {}) {
  return {
    accepted: true,
    numbers: numbers.map(String),
    slots: numbers.map((number, index) => ({
      machineNumberOcr: { accepted: true, candidate: String(number) },
      source: { imageName: source, panelIndex: index },
    })),
    failedPageIndices: [],
    unresolvedIndices: [],
    duplicateNumbers: [],
    duplicateMachineNumbers: [],
  };
}

function tableRows(numbers, { acceptedThrough = numbers.length } = {}) {
  return numbers.map((number, index) => ({
    num: String(number),
    machineNumberObserved: String(number),
    numAccepted: index < acceptedThrough,
    numConfidence: index < acceptedThrough ? 1 : 0.1,
    numCandidates: [{ value: String(number), confidence: index < acceptedThrough ? 1 : 0.1 }],
    sourceFile: "table.jpg",
    sourceLine: index + 1,
    rowIndex: index,
    normalSpins: String(100 + index),
    totalStarts: String(index),
    nonNumberReviewRequired: false,
    globalReviewRequired: false,
    reviewRequired: index >= acceptedThrough,
    reviewReason: index >= acceptedThrough ? "machine number review" : "",
    fieldAccepted: { num: index < acceptedThrough, normalSpins: true, totalStarts: true },
    fieldReviewRequired: { num: index >= acceptedThrough, normalSpins: false, totalStarts: false },
    fieldReviewReason: { num: index >= acceptedThrough ? "machine number review" : "" },
  }));
}

test("independent accepted graph sequence resolves weak table machine numbers", () => {
  const numbers = Array.from({ length: 10 }, (_, index) => 500 + index);
  const rows = tableRows(numbers, { acceptedThrough: 6 });
  rows[7].nonNumberReviewRequired = true;
  rows[7].nonNumberReviewReason = "cumulative starts review";
  rows[7].reviewRequired = true;

  const result = reconcileSiteSevenRowsWithGraphSequence(rows, graphSequence(numbers));

  assert.equal(result.applied, true);
  assert.equal(result.resolvedCount, 4);
  assert.deepEqual(result.rows.map((row) => row.num), numbers.map(String));
  assert.ok(result.rows.every((row) => row.numAccepted === true));
  assert.equal(result.rows[6].reviewRequired, false);
  assert.equal(result.rows[7].reviewRequired, true);
  assert.equal(result.rows[7].reviewReason, "cumulative starts review");
  assert.equal(result.rows[9].normalSpins, "109");
  assert.equal(result.rows[9].machineNumberResolutionSource, "independent-graph-sequence");
});

test("stable sequence repairs two duplicate OCR candidates without changing play data", () => {
  const numbers = Array.from({ length: 20 }, (_, index) => 800 + index);
  const rows = tableRows(numbers, { acceptedThrough: 14 });
  rows[16] = {
    ...rows[16],
    num: "806",
    machineNumberObserved: "806",
    numAccepted: false,
    normalSpins: "777",
  };
  rows[18] = {
    ...rows[18],
    num: "808",
    machineNumberObserved: "808",
    numAccepted: false,
    normalSpins: "999",
  };

  const result = reconcileSiteSevenRowsWithGraphSequence(rows, graphSequence(numbers));

  assert.equal(result.applied, true);
  assert.equal(result.rows[16].num, "816");
  assert.equal(result.rows[18].num, "818");
  assert.equal(result.rows[16].machineNumberObserved, "806");
  assert.equal(result.rows[16].normalSpins, "777");
  assert.equal(result.rows[18].normalSpins, "999");
});

test("reconciliation refuses conflicting trusted anchors and same-image evidence", () => {
  const numbers = Array.from({ length: 10 }, (_, index) => 600 + index);
  const conflictRows = tableRows(numbers, { acceptedThrough: 10 });
  conflictRows[4] = { ...conflictRows[4], num: "999", machineNumberObserved: "999" };

  const conflict = reconcileSiteSevenRowsWithGraphSequence(
    conflictRows,
    graphSequence(numbers),
  );
  assert.equal(conflict.applied, false);
  assert.equal(conflict.reasonCode, "table-anchor-evidence-insufficient");

  const sameSourceRows = tableRows(numbers, { acceptedThrough: 10 })
    .map((row) => ({ ...row, sourceFile: "graphs-1.jpg" }));
  const sameSource = reconcileSiteSevenRowsWithGraphSequence(
    sameSourceRows,
    graphSequence(numbers),
  );
  assert.equal(sameSource.applied, false);
  assert.equal(sameSource.reasonCode, "cross-image-independence-missing");
});

test("reconciliation requires every graph slot to have accepted independent OCR", () => {
  const numbers = Array.from({ length: 10 }, (_, index) => 700 + index);
  const graph = graphSequence(numbers);
  graph.slots[8].machineNumberOcr.accepted = false;

  const result = reconcileSiteSevenRowsWithGraphSequence(
    tableRows(numbers, { acceptedThrough: 10 }),
    graph,
  );
  assert.equal(result.applied, false);
  assert.equal(result.reasonCode, "graph-slot-evidence-incomplete");
});
