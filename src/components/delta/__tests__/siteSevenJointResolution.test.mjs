import test from "node:test";
import assert from "node:assert/strict";

import { resolveMatchedSiteSevenRows } from "../siteSevenJointResolution.js";

const match = {
  accepted: true,
  tableIndex: 0,
  resolvedNum: "479",
  matchedBy: "unique-max",
  panelId: "graph:0",
};

test("共同照合で台番号だけ解決した行は数字確認待ちを解除する", () => {
  const [row] = resolveMatchedSiteSevenRows([{
    num: "475",
    numAccepted: false,
    reviewRequired: true,
    reviewReason: "台番号を十分な精度で読めませんでした",
    nonNumberReviewRequired: false,
    nonNumberReviewReason: "",
    fieldAccepted: { num: false, normalSpins: true, maxPayout: true, totalStarts: true },
    fieldReviewRequired: { num: true, normalSpins: false, maxPayout: false, totalStarts: false },
    fieldReviewReason: { num: "台番号を十分な精度で読めませんでした" },
  }], [match]);

  assert.equal(row.num, "479");
  assert.equal(row.numAccepted, true);
  assert.equal(row.reviewRequired, false);
  assert.equal(row.reviewReason, "");
  assert.equal(row.fieldAccepted.num, true);
  assert.equal(row.fieldReviewRequired.num, false);
  assert.equal(row.fieldReviewReason.num, "");
  assert.equal(row.matchedBy, "unique-max");
});

test("回転数など台番号以外の要確認は共同照合後も残す", () => {
  const [row] = resolveMatchedSiteSevenRows([{
    num: "475",
    numAccepted: false,
    reviewRequired: true,
    reviewReason: "台番号と通常回転を確認してください",
    nonNumberReviewRequired: true,
    nonNumberReviewReason: "通常中スタートを確認してください",
    fieldAccepted: { num: false, normalSpins: false },
    fieldReviewRequired: { num: true, normalSpins: true },
    fieldReviewReason: { num: "台番号", normalSpins: "通常中スタート" },
  }], [match]);

  assert.equal(row.num, "479");
  assert.equal(row.reviewRequired, true);
  assert.equal(row.reviewReason, "通常中スタートを確認してください");
  assert.equal(row.fieldReviewRequired.normalSpins, true);
});

test("未対応行は同じオブジェクトのまま保持する", () => {
  const source = { num: "480", reviewRequired: true };
  const [row] = resolveMatchedSiteSevenRows([source], []);
  assert.equal(row, source);
});

function maxPayoutReviewRow(overrides = {}) {
  const reason = "最高出玉の読み取り結果が条件によって一致しません";
  return {
    num: "246",
    numAccepted: true,
    cumulativeStarts: "4078",
    normalSpins: "3073",
    firstHitCount: "7",
    maxPayout: "12340",
    totalStarts: "21",
    sourceFile: "table.JPG",
    reviewRequired: true,
    reviewReason: reason,
    nonNumberReviewRequired: true,
    nonNumberReviewReason: reason,
    globalReviewRequired: false,
    maxPayoutAccepted: false,
    fieldAccepted: {
      num: true,
      cumulativeStarts: true,
      normalSpins: true,
      firstHitCount: true,
      maxPayout: false,
      totalStarts: true,
    },
    fieldReviewRequired: {
      num: false,
      cumulativeStarts: false,
      normalSpins: false,
      firstHitCount: false,
      maxPayout: true,
      totalStarts: false,
    },
    fieldReviewReason: {
      num: "",
      cumulativeStarts: "",
      normalSpins: "",
      firstHitCount: "",
      maxPayout: reason,
      totalStarts: "",
    },
    maxPayoutCandidates: [
      { value: "12340", distance: 0.00298, score: 0.00698 },
      { value: "15340", distance: 0.05476, score: 0.05976 },
    ],
    ...overrides,
  };
}

function exactNumGraphMatch(overrides = {}) {
  return {
    accepted: true,
    tableIndex: 0,
    resolvedNum: "246",
    matchedBy: "num",
    matchType: "num-exact",
    panelId: "graph:246",
    graphPanel: {
      panelId: "graph:246",
      status: "ok",
      machineNumberAccepted: true,
      observedNumCandidate: "246",
      machineNumberOcr: {
        accepted: true,
        candidate: "246",
      },
      maxPayout: 12340,
      graphMaxPayout: {
        value: 12340,
        accepted: false,
        reasons: ["max-payout-low-confidence"],
        candidates: [
          { value: 12340, score: 0.13198 },
          { value: 12349, score: 0.17183 },
          { value: 340, score: 0.1784 },
        ],
      },
      source: {
        imageName: "graph.JPG",
      },
    },
    ...overrides,
  };
}

test("別画像の同一台グラフと強い候補が一致した最高出玉だけ共同確定する", () => {
  const [row] = resolveMatchedSiteSevenRows(
    [maxPayoutReviewRow()],
    [exactNumGraphMatch()],
  );

  assert.equal(row.maxPayout, "12340");
  assert.equal(row.maxPayoutAccepted, true);
  assert.equal(row.fieldAccepted.maxPayout, true);
  assert.equal(row.fieldReviewRequired.maxPayout, false);
  assert.equal(row.fieldReviewReason.maxPayout, "");
  assert.equal(row.reviewRequired, false);
  assert.equal(row.reviewReason, "");
  assert.equal(row.nonNumberReviewRequired, false);
  assert.equal(row.nonNumberReviewReason, "");
  assert.equal(row.maxPayoutResolution.source, "table-graph-cross-image-consensus");
  assert.equal(row.maxPayoutResolution.machineNumber, "246");
  assert.equal(row.maxPayoutResolution.table.sourceFile, "table.JPG");
  assert.equal(row.maxPayoutResolution.graph.sourceFile, "graph.JPG");
});

test("独立画像・台番号・値・候補差のどれかが弱い最高出玉は確定しない", () => {
  const cases = [
    {
      name: "同じ画像",
      row: maxPayoutReviewRow({ sourceFile: "graph.JPG" }),
      match: exactNumGraphMatch(),
    },
    {
      name: "グラフ台番号未確定",
      row: maxPayoutReviewRow(),
      match: exactNumGraphMatch({
        graphPanel: {
          ...exactNumGraphMatch().graphPanel,
          machineNumberOcr: { accepted: false, candidate: "246" },
        },
      }),
    },
    {
      name: "最高出玉が不一致",
      row: maxPayoutReviewRow(),
      match: exactNumGraphMatch({
        graphPanel: {
          ...exactNumGraphMatch().graphPanel,
          maxPayout: 12349,
          graphMaxPayout: {
            ...exactNumGraphMatch().graphPanel.graphMaxPayout,
            value: 12349,
            candidates: [
              { value: 12349, score: 0.12 },
              { value: 12340, score: 0.16 },
            ],
          },
        },
      }),
    },
    {
      name: "表候補差が小さい",
      row: maxPayoutReviewRow({
        maxPayoutCandidates: [
          { value: "12340", distance: 0.00298, score: 0.00698 },
          { value: "12349", distance: 0.018, score: 0.02 },
        ],
      }),
      match: exactNumGraphMatch(),
    },
    {
      name: "グラフ候補差が小さい",
      row: maxPayoutReviewRow(),
      match: exactNumGraphMatch({
        graphPanel: {
          ...exactNumGraphMatch().graphPanel,
          graphMaxPayout: {
            ...exactNumGraphMatch().graphPanel.graphMaxPayout,
            candidates: [
              { value: 12340, score: 0.13198 },
              { value: 12349, score: 0.145 },
            ],
          },
        },
      }),
    },
  ];

  for (const scenario of cases) {
    const [row] = resolveMatchedSiteSevenRows([scenario.row], [scenario.match]);
    assert.equal(row.fieldAccepted.maxPayout, false, scenario.name);
    assert.equal(row.reviewRequired, true, scenario.name);
    assert.equal(row.maxPayoutResolution, undefined, scenario.name);
  }
});
