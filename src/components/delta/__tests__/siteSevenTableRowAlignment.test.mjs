import test from "node:test";
import assert from "node:assert/strict";
import {
  alignSiteSevenTableRows,
  resolveAlignedMachineNumber,
} from "../siteSevenTableRowAlignment.js";

function ocrRow(candidate, {
  confidence = 0.92,
  accepted = true,
  candidates = [],
} = {}) {
  return {
    machineNumberCandidate: candidate,
    machineNumberAccepted: accepted,
    machineNumberRecognition: {
      value: candidate,
      confidence,
      accepted,
      unanimous: accepted,
      variants: candidate ? [candidate, candidate, candidate] : ["", "", ""],
      candidates,
    },
  };
}

test("exact rows produce fixed expected-order assignments", () => {
  const expected = [479, 480, 481, 482, 499, 500];
  const result = alignSiteSevenTableRows(expected.map((number) => ocrRow(number)), expected);

  assert.deepEqual(
    result.rowAssignments.map(({ expectedNumber }) => expectedNumber),
    expected.map(String),
  );
  assert.ok(result.rowAssignments.every(({ accepted }) => accepted));
  assert.equal(result.summary.autoAcceptable, true);
});

test("one bad OCR value and a duplicate candidate do not shift following rows", () => {
  const expected = [479, 480, 481, 482, 483, 484];
  const rows = [479, 481, 481, 482, 483, 484].map((number) => ocrRow(number));
  const result = alignSiteSevenTableRows(rows, expected);

  assert.deepEqual(
    result.rowAssignments.map(({ expectedNumber }) => expectedNumber),
    expected.map(String),
  );
  assert.equal(result.rowAssignments[1].observedCandidate, "481");
  assert.equal(result.rowAssignments[1].expectedNumber, "480");
  assert.equal(result.rowAssignments[1].accepted, false);
  assert.ok(result.rowAssignments[1].reasonCodes.includes("duplicate-ocr-candidate"));
  assert.deepEqual(resolveAlignedMachineNumber(rows[1], result.rowAssignments[1]), {
    num: "",
    suggestedNumber: "480",
    source: "review-suggestion",
  });
  assert.equal(result.rowAssignments[2].expectedNumber, "481");
  assert.ok(result.rowAssignments[2].reasonCodes.includes("duplicate-ocr-candidate-resolved"));
  assert.equal(result.summary.autoAcceptable, false);
});

test("an unreadable number between anchors is inferred without moving later data", () => {
  const expected = [100, 101, 102, 103, 104];
  const rows = [ocrRow(100), ocrRow(101), ocrRow("", { accepted: false, confidence: 0 }), ocrRow(103), ocrRow(104)];
  const result = alignSiteSevenTableRows(rows, expected);

  assert.equal(result.rowAssignments[2].expectedNumber, "102");
  assert.equal(result.rowAssignments[2].accepted, true);
  assert.ok(result.rowAssignments[2].reasonCodes.includes("sequence-aligned"));
  assert.equal(result.rowAssignments[4].expectedNumber, "104");
});

test("a physically missing table row leaves one expected placeholder and later rows stay aligned", () => {
  const expected = [100, 101, 102, 103, 104, 105];
  const rows = [100, 101, 103, 104, 105].map((number) => ocrRow(number));
  const result = alignSiteSevenTableRows(rows, expected);

  assert.deepEqual(
    result.rowAssignments.map(({ expectedNumber }) => expectedNumber),
    ["100", "101", "103", "104", "105"],
  );
  assert.deepEqual(result.missingExpected.map(({ expectedNumber }) => expectedNumber), ["102"]);
  assert.equal(result.rowAssignments[2].expectedNumber, "103");
  assert.equal(result.summary.missingExpectedCount, 1);
  assert.equal(result.summary.autoAcceptable, false);
});

test("an extra detected row is isolated instead of shifting all rows below it", () => {
  const expected = [100, 101, 102, 103, 104];
  const rows = [ocrRow(100), ocrRow(101), ocrRow(777), ocrRow(102), ocrRow(103), ocrRow(104)];
  const result = alignSiteSevenTableRows(rows, expected);

  assert.equal(result.rowAssignments[2].expectedIndex, null);
  assert.ok(result.rowAssignments[2].reasonCodes.includes("unexpected-observed-row"));
  assert.deepEqual(
    result.rowAssignments.slice(3).map(({ expectedNumber }) => expectedNumber),
    ["102", "103", "104"],
  );
  assert.equal(result.summary.extraRowCount, 1);
});

test("a middle partial photo is located by its OCR anchors", () => {
  const expected = [479, 480, 481, 482, 483, 484, 485, 486, 499, 500, 501, 502];
  const rows = [484, 485, 486, 499].map((number) => ocrRow(number));
  const result = alignSiteSevenTableRows(rows, expected);

  assert.deepEqual(
    result.rowAssignments.map(({ expectedNumber }) => expectedNumber),
    ["484", "485", "486", "499"],
  );
  assert.ok(result.rowAssignments.every(({ accepted }) => accepted));
  assert.deepEqual(
    result.missingExpected.map(({ expectedNumber }) => expectedNumber),
    ["479", "480", "481", "482", "483", "500", "501", "502"],
  );
});

test("a partial photo without anchors is suggested but never auto-confirmed", () => {
  const expected = [100, 101, 102, 103, 104, 105];
  const rows = Array.from({ length: 3 }, () => ocrRow("", { accepted: false, confidence: 0 }));
  const result = alignSiteSevenTableRows(rows, expected);

  assert.ok(result.rowAssignments.every(({ accepted }) => !accepted));
  assert.ok(result.rowAssignments.every(({ reviewRequired }) => reviewRequired));
  assert.ok(result.rowAssignments.every(({ reasonCodes }) => (
    reasonCodes.includes("insufficient-anchor-evidence")
  )));
  assert.equal(result.summary.autoAcceptable, false);
});

test("one anchor in a partial photo confirms only itself, not surrounding guesses", () => {
  const expected = [100, 101, 102, 103, 104, 105];
  const rows = [
    ocrRow("", { accepted: false, confidence: 0 }),
    ocrRow(103),
    ocrRow("", { accepted: false, confidence: 0 }),
  ];
  const result = alignSiteSevenTableRows(rows, expected);

  assert.deepEqual(result.rowAssignments.map(({ expectedNumber }) => expectedNumber), ["102", "103", "104"]);
  assert.deepEqual(result.rowAssignments.map(({ accepted }) => accepted), [false, true, false]);
});

test("an OCR alternative can support the sequence-selected expected number", () => {
  const expected = [200, 201, 202, 203];
  const rows = [
    ocrRow(200),
    ocrRow(291, { accepted: false, confidence: 0.35, candidates: [{ value: "201", score: 0.04 }] }),
    ocrRow(202),
    ocrRow(203),
  ];
  const result = alignSiteSevenTableRows(rows, expected);

  assert.equal(result.rowAssignments[1].expectedNumber, "201");
  assert.equal(result.rowAssignments[1].accepted, true);
  assert.ok(result.rowAssignments[1].reasonCodes.includes("ocr-candidate-overridden"));
});

test("duplicate expected machine numbers are rejected before alignment", () => {
  assert.throws(
    () => alignSiteSevenTableRows([ocrRow(100)], [100, 100]),
    /must not contain duplicates/u,
  );
});

test("high-confidence out-of-scope OCR conflict is never auto-overridden", () => {
  const rows = [ocrRow(479), ocrRow(480), ocrRow(481)];
  const result = alignSiteSevenTableRows(rows, [475, 480, 481]);
  const first = result.rowAssignments[0];

  assert.equal(first.accepted, false);
  assert.ok(first.reasonCodes.includes("high-confidence-ocr-conflict")
    || first.reasonCodes.includes("unexpected-observed-row"));
  assert.deepEqual(resolveAlignedMachineNumber(rows[0], first), {
    num: "479",
    suggestedNumber: first.expectedNumber,
    source: "trusted-raw-ocr",
  });
  assert.deepEqual(
    result.rowAssignments.slice(1).map(({ expectedNumber, accepted }) => [expectedNumber, accepted]),
    [["480", true], ["481", true]],
  );
});

test("an OCR alternative cannot override a high-confidence conflicting primary", () => {
  const rows = [
    ocrRow(479, {
      confidence: 0.99,
      accepted: true,
      candidates: [{ value: "475", score: 0.01 }],
    }),
    ocrRow(480),
    ocrRow(481),
  ];
  const result = alignSiteSevenTableRows(rows, [475, 480, 481]);
  const first = result.rowAssignments[0];

  assert.equal(first.evidenceType, "exact-alternative");
  assert.equal(first.accepted, false);
  assert.ok(first.reasonCodes.includes("high-confidence-ocr-conflict"));
  assert.notEqual(resolveAlignedMachineNumber(rows[0], first).num, "475");
});

test("a duplicated OCR candidate never auto-fills the missing number between anchors", () => {
  const rows = [100, 102, 102, 103, 104]
    .map((number) => ocrRow(number, { confidence: 0.99, accepted: true }));
  const result = alignSiteSevenTableRows(rows, [100, 101, 102, 103, 104]);

  assert.equal(result.rowAssignments[1].expectedNumber, "101");
  assert.equal(result.rowAssignments[1].accepted, false);
  assert.ok(result.rowAssignments[1].reasonCodes.includes("duplicate-ocr-candidate"));
  assert.deepEqual(resolveAlignedMachineNumber(rows[1], result.rowAssignments[1]), {
    num: "",
    suggestedNumber: "101",
    source: "review-suggestion",
  });
  assert.equal(result.rowAssignments[2].accepted, true);
  assert.ok(result.rowAssignments[3].accepted);
  assert.ok(result.rowAssignments[4].accepted);
});

test("anchorless alignment keeps suggestion out of the machine-number input", () => {
  const row = ocrRow("", { accepted: false, confidence: 0 });
  const [assignment] = alignSiteSevenTableRows([row], [479, 480, 481]).rowAssignments;
  assert.equal(assignment.accepted, false);
  assert.deepEqual(resolveAlignedMachineNumber(row, assignment), {
    num: "",
    suggestedNumber: assignment.expectedNumber,
    source: "review-suggestion",
  });
});

test("100 deterministic fault combinations never auto-confirm a shifted row and later anchors recover", () => {
  const expected = [
    ...Array.from({ length: 12 }, (_, index) => 479 + index),
    ...Array.from({ length: 11 }, (_, index) => 499 + index),
    ...Array.from({ length: 29 }, (_, index) => 546 + index),
  ];
  let state = 0x52_02_13;
  const random = () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let trial = 0; trial < 100; trial += 1) {
    const missingIndex = 2 + Math.floor(random() * (expected.length - 4));
    const source = expected
      .map((number) => ({ ...ocrRow(number), truth: String(number), extra: false }))
      .filter((_, index) => index !== missingIndex);
    const corruptibleIndices = Array.from({ length: source.length - 4 }, (_, index) => index + 2);
    for (let count = 0; count < 5; count += 1) {
      const picked = corruptibleIndices.splice(
        Math.floor(random() * corruptibleIndices.length),
        1,
      )[0];
      const replacement = count % 2 === 0 ? "" : source[Math.max(0, picked - 1)].machineNumberCandidate;
      source[picked] = {
        ...source[picked],
        ...ocrRow(replacement, { accepted: false, confidence: 0.12 }),
      };
    }
    const extraIndex = 2 + Math.floor(random() * (source.length - 4));
    source.splice(extraIndex, 0, {
      ...ocrRow(999, { accepted: false, confidence: 0.4 }),
      truth: null,
      extra: true,
    });

    const result = alignSiteSevenTableRows(source, expected);
    const candidateCounts = new Map();
    source.forEach(({ machineNumberCandidate }) => {
      const value = String(machineNumberCandidate || "");
      if (value) candidateCounts.set(value, (candidateCounts.get(value) || 0) + 1);
    });
    result.rowAssignments.forEach((assignment, rowIndex) => {
      const truth = source[rowIndex].truth;
      if (assignment.accepted) {
        assert.equal(
          assignment.expectedNumber,
          truth,
          `trial ${trial}: row ${rowIndex} was incorrectly auto-confirmed`,
        );
      }
      if (truth
        && String(source[rowIndex].machineNumberCandidate) === truth
        && candidateCounts.get(truth) === 1) {
        assert.equal(
          assignment.expectedNumber,
          truth,
          `trial ${trial}: exact anchor ${truth} did not recover the sequence`,
        );
      }
    });
    assert.equal(
      result.summary.missingExpectedCount,
      result.summary.extraRowCount,
      `trial ${trial}: sequence accounting became inconsistent`,
    );
    assert.equal(result.summary.autoAcceptable, false);
  }
});
