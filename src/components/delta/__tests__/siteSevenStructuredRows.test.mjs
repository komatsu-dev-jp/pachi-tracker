import test from "node:test";
import assert from "node:assert/strict";

import { buildSiteSevenStructuredRows } from "../siteSevenStructuredRows.js";

test("buildSiteSevenStructuredRows: 厳密解析済みPDF行をmatcher用の固定点へ整形する", () => {
  const rows = buildSiteSevenStructuredRows({
    rows: [{
      num: "４７９",
      cumulativeStarts: 1912,
      normalSpins: 1104,
      firstHitCount: 3,
      maxPayout: "17,370玉",
      totalStarts: 14,
    }],
  }, {
    importKind: "pdf",
    sourceIndex: 2,
    sourceId: "site-seven-2026-02-13.pdf",
  });

  assert.deepEqual(rows, [{
    num: "479",
    cumulativeStarts: 1912,
    normalSpins: 1104,
    firstHitCount: 3,
    maxPayout: 17370,
    totalStarts: 14,
    numAccepted: true,
    maxPayoutAccepted: true,
    sourceIndex: 2,
    rowIndex: 0,
    rowId: "site-seven-2026-02-13.pdf:2:0",
    importKind: "pdf",
    structuredRowTrusted: true,
    structuredTrustReasons: [],
  }]);
});

test("buildSiteSevenStructuredRows: 重複番号は両方ともtrustedにしない", () => {
  const rows = buildSiteSevenStructuredRows({ rows: [
    { num: 479, normalSpins: 1104, totalStarts: 14, maxPayout: 17370 },
    { num: "479", normalSpins: 1104, totalStarts: 14, maxPayout: 17370 },
    { num: 480, normalSpins: 1319, totalStarts: 12, maxPayout: 13330 },
  ] }, { importKind: "csv", sourceIndex: 0, sourceId: "table.csv" });

  assert.equal(rows[0].numAccepted, false);
  assert.equal(rows[0].maxPayoutAccepted, false);
  assert.ok(rows[0].structuredTrustReasons.includes("duplicate-machine-number"));
  assert.equal(rows[1].numAccepted, false);
  assert.equal(rows[1].maxPayoutAccepted, false);
  assert.equal(rows[2].numAccepted, true);
  assert.equal(rows[2].maxPayoutAccepted, true);
});

test("buildSiteSevenStructuredRows: parserが報告した重複も残存1行をtrustedにしない", () => {
  const rows = buildSiteSevenStructuredRows({
    rows: [{ num: 479, normalSpins: 1104, totalStarts: 14, maxPayout: 17370 }],
    duplicates: [{ num: 479, pageNumber: 2 }],
  });

  assert.equal(rows[0].numAccepted, false);
  assert.equal(rows[0].maxPayoutAccepted, false);
  assert.ok(rows[0].structuredTrustReasons.includes("duplicate-machine-number"));
});

test("buildSiteSevenStructuredRows: 不正値・未確認review・明示拒否をtrustedにしない", () => {
  const rows = buildSiteSevenStructuredRows({ rows: [
    { num: 0, normalSpins: 100, totalStarts: 1, maxPayout: 1000 },
    { num: 480, normalSpins: -1, totalStarts: 12, maxPayout: 13330 },
    { num: 481, normalSpins: 1088, totalStarts: 33, maxPayout: -1 },
    {
      num: 482,
      normalSpins: 805,
      totalStarts: 12,
      maxPayout: 8600,
      reviewRequired: true,
      reviewConfirmed: false,
    },
    {
      num: 483,
      normalSpins: 1478,
      totalStarts: 12,
      maxPayout: 11710,
      numAccepted: false,
    },
  ] });

  for (const row of rows) {
    assert.equal(row.numAccepted, false);
    assert.equal(row.maxPayoutAccepted, false);
    assert.equal(row.structuredRowTrusted, false);
  }
  assert.ok(rows[0].structuredTrustReasons.includes("invalid-machine-number"));
  assert.ok(rows[1].structuredTrustReasons.includes("invalid-structured-values"));
  assert.ok(rows[2].structuredTrustReasons.includes("invalid-max-payout"));
  assert.ok(rows[3].structuredTrustReasons.includes("review-pending"));
  assert.ok(rows[4].structuredTrustReasons.includes("machine-number-rejected"));
});

test("buildSiteSevenStructuredRows: 目視確認済み行と最高出玉なし行を区別する", () => {
  const rows = buildSiteSevenStructuredRows({ rows: [
    {
      num: 479,
      normalSpins: 1104,
      totalStarts: 14,
      maxPayout: 17370,
      reviewRequired: true,
      reviewConfirmed: true,
    },
    { num: 480, normalSpins: 1319, totalStarts: 12 },
  ] });

  assert.equal(rows[0].numAccepted, true);
  assert.equal(rows[0].maxPayoutAccepted, true);
  assert.equal(rows[1].numAccepted, true);
  assert.equal(rows[1].maxPayoutAccepted, false);
  assert.ok(rows[1].structuredTrustReasons.includes("missing-max-payout"));
});
