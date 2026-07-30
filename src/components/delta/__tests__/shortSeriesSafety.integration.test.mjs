import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import { runAnalysis } from "../deltaEngine.js";
import { attachGraphPanelMetadata } from "../graphPanelMetadataOcr.js";
import {
  applySafeShortSeriesValidation,
} from "../graphShortSeriesValidator.js";
import { attachMachineNumbersToSlots } from "../machineNumberOcr.js";
import { parseSiteSevenTableImageData } from "../siteSevenImageOcr.js";
import { matchSiteSevenGraphPanels } from "../siteSevenJointMatcher.js";
import { buildSiteSevenStructuredRows } from "../siteSevenStructuredRows.js";

const PRIVATE_FIXTURE_ENV = "SITE7_FULL_PAGE_FIXTURE_DIR";
const PRIVATE_TRUTH_ENV = "SITE7_FULL_PAGE_GRAPH_TRUTH_PATH";
const PRIVATE_FIXTURE_DIR = process.env[PRIVATE_FIXTURE_ENV]?.trim()
  ? path.resolve(process.env[PRIVATE_FIXTURE_ENV])
  : null;
const PRIVATE_TRUTH_PATH = process.env[PRIVATE_TRUTH_ENV]?.trim()
  ? path.resolve(process.env[PRIVATE_TRUTH_ENV])
  : null;
const PRIVATE_INTEGRATION_READY = Boolean(
  PRIVATE_FIXTURE_DIR && PRIVATE_TRUTH_PATH,
);

function syntheticSafetyCase() {
  const numbers = ["501", "502", "503"];
  const slots = numbers.map((number, index) => ({
    status: "ok",
    val: index * 500,
    reasonCodes: [],
    source: {
      imageIndex: 0,
      imageName: "synthetic-page",
      panelIndex: index,
      row: Math.floor(index / 2),
      column: index % 2,
    },
  }));

  slots[1] = {
    ...slots[1],
    status: "review",
    val: 2500,
    confidence: 0.95,
    reasonCodes: ["short-series", "faint-series"],
    calibration: {
      source: "panel",
      quality: 0.98,
      gridSpacing: 45,
      plotTopY: 20,
      plotBottomY: 290,
    },
    bbox: {
      x: 0,
      y: 0,
      width: 330,
      height: 310,
    },
    shortSeriesEvidence: {
      accepted: true,
      profileCount: 4,
      requiredProfileCount: 4,
      roundedValue: 2500,
      thresholdRoundedValues: [2500],
      roundedValueSpread: 0,
      endpointLocalY: 170,
      endpointSpread: 1,
      maximumEndpointSpread: 2.25,
      primaryRoundedValue: 2500,
      primaryValueAgrees: true,
      reasonCodes: [],
    },
    boundaryObservation: null,
    valueConstraint: null,
    machineNumberOcr: {
      accepted: true,
      candidate: "502",
      ensemble: { votes: 5 },
    },
    graphMaxPayout: {
      accepted: false,
      value: 7777,
      candidates: [
        { value: 7777, score: 0.1 },
        { value: 8888, score: 0.18 },
      ],
    },
  };

  const matches = numbers.map((number, index) => ({
    graphIndex: index,
    tableIndex: index,
    graphId: `graph:${index}`,
    panelId: `graph:${index}`,
    rowId: `table:${index}`,
    resolvedNum: number,
    num: number,
    matchedBy: "num",
    matchType: "num-exact",
    accepted: true,
    tableRow: {
      num: number,
      numAccepted: true,
      maxPayout: index === 1 ? 7777 : 9001 + index,
      maxPayoutAccepted: true,
      fieldAccepted: {
        cumulativeStarts: true,
        normalSpins: true,
        firstHitCount: true,
        totalStarts: true,
        maxPayout: true,
      },
      structuredRowTrusted: true,
      sourceIndex: 0,
      rowIndex: index,
      rowId: `table:${index}`,
    },
  }));

  return {
    slots,
    jointMatch: { matches },
  };
}

test("合成3台: 四つの閾値・台番号順・表の最大出玉が一致した短系列だけ確定する", () => {
  const { slots, jointMatch } = syntheticSafetyCase();
  const resolved = applySafeShortSeriesValidation(slots, jointMatch);

  assert.strictEqual(resolved[0], slots[0]);
  assert.strictEqual(resolved[2], slots[2]);
  assert.equal(resolved[1].status, "ok");
  assert.equal(resolved[1].val, 2500);
  assert.equal(resolved[1].machineNumber, "502");
  assert.deepEqual(resolved[1].reasonCodes, []);
  assert.deepEqual(resolved[1].shortSeriesValidation.reasonCodes, []);
  assert.equal(resolved[1].shortSeriesValidation.maxPayout, 7777);
  assert.equal(
    resolved[1].shortSeriesValidation.maxPayoutEvidenceMode,
    "table-corroborated-best-candidate",
  );
});

function syntheticNearZeroCase() {
  const safetyCase = syntheticSafetyCase();
  const slot = safetyCase.slots[1];
  const tableRow = safetyCase.jointMatch.matches[1].tableRow;
  slot.val = -1000;
  slot.calibration.zeroY = 100;
  slot.shortSeriesEvidence = {
    accepted: false,
    profileCount: 4,
    requiredProfileCount: 4,
    roundedValue: -1500,
    thresholdRoundedValues: [-1000, -1500],
    roundedValueSpread: 500,
    endpointLocalY: 106,
    endpointSpread: 1,
    maximumEndpointSpread: 2.25,
    startSpread: 1,
    endSpread: 1,
    primaryRoundedValue: -1000,
    primaryValueAgrees: false,
    reasonCodes: [
      "short-series-threshold-value-disagreement",
      "short-series-primary-value-disagreement",
    ],
    attempts: [
      {
        profile: "strict",
        endpointLocalY: 105.5,
        roundedValue: -1000,
        span: 9,
        bounds: { minX: 30, maxX: 38 },
      },
      {
        profile: "standard",
        endpointLocalY: 106,
        roundedValue: -1500,
        span: 10,
        bounds: { minX: 30, maxX: 39 },
      },
      {
        profile: "jpeg-tolerant",
        endpointLocalY: 106,
        roundedValue: -1500,
        span: 10,
        bounds: { minX: 30, maxX: 39 },
      },
      {
        profile: "faint",
        endpointLocalY: 106.5,
        roundedValue: -1500,
        span: 11,
        bounds: { minX: 29, maxX: 39 },
      },
    ],
  };
  slot.graphMaxPayout = {
    accepted: false,
    value: 10,
    candidates: [
      { value: 10, score: 0.1 },
      { value: 20, score: 0.18 },
    ],
  };
  tableRow.cumulativeStarts = 50;
  tableRow.normalSpins = 50;
  tableRow.firstHitCount = 0;
  tableRow.totalStarts = 0;
  tableRow.maxPayout = 10;
  tableRow.maxPayoutAccepted = true;

  return safetyCase;
}

test("near-zero estimate: a four-profile, zero-hit, low-activity trace is explicitly marked as estimated -500", () => {
  const { slots, jointMatch } = syntheticNearZeroCase();
  const resolved = applySafeShortSeriesValidation(slots, jointMatch);
  const result = resolved[1];

  assert.equal(result.status, "ok");
  assert.equal(result.val, -500);
  assert.equal(result.estimated, true);
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.shortSeriesValidation.accepted, true);
  assert.equal(result.shortSeriesValidation.estimated, true);
  assert.equal(result.shortSeriesValidation.originalValue, -1000);
  assert.equal(result.shortSeriesValidation.validatedValue, -500);
  assert.equal(result.shortSeriesValidation.cumulativeStarts, 50);
  assert.equal(result.shortSeriesValidation.normalSpins, 50);
  assert.equal(result.shortSeriesValidation.firstHitCount, 0);
  assert.equal(result.shortSeriesValidation.totalStarts, 0);
  assert.equal(result.shortSeriesValidation.maxPayout, 10);
  assert.equal(
    result.shortSeriesValidation.validationSource,
    "user-approved-near-zero-low-activity-approximation",
  );
  assert.ok(
    result.shortSeriesValidation.standardValidationReasonCodes.includes(
      "short-series-primary-value-conflict",
    ),
  );
  assert.deepEqual(
    result.shortSeriesValidation.estimationReasonCodes,
    [
      "four-profiles-negative-and-near-zero",
      "extremely-short-component-consensus",
      "exact-machine-number-and-order",
      "zero-first-hit-and-low-max-payout",
    ],
  );
});

const NEAR_ZERO_FAIL_CLOSED_CASES = Object.freeze([
  {
    name: "minus 2000 is outside the narrowly approved band",
    reason: "near-zero-primary-value-outside-negative-band",
    mutate({ slots }) {
      slots[1].val = -2000;
      slots[1].shortSeriesEvidence.attempts.forEach((attempt) => {
        attempt.roundedValue = -2000;
      });
    },
  },
  {
    name: "a mixed positive and negative profile is not an all-negative observation",
    reason: "near-zero-profile-values-not-all-negative-near-zero",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[3].roundedValue = 500;
    },
  },
  {
    name: "a machine with a first hit is not treated as a near-zero idle trace",
    reason: "near-zero-table-first-hit-not-zero",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.firstHitCount = 1;
    },
  },
  {
    name: "a payout other than the minimum observed value is not treated as near zero",
    reason: "near-zero-table-max-payout-not-minimum",
    mutate({ slots, jointMatch }) {
      slots[1].graphMaxPayout.value = 21;
      slots[1].graphMaxPayout.candidates[0].value = 21;
      jointMatch.matches[1].tableRow.maxPayout = 21;
    },
  },
  {
    name: "more than 100 cumulative starts is outside the narrow exception",
    reason: "near-zero-table-cumulative-starts-too-large",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.cumulativeStarts = 101;
    },
  },
  {
    name: "more than 100 normal spins is outside the narrow exception",
    reason: "near-zero-table-normal-spins-too-large",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.normalSpins = 101;
    },
  },
  {
    name: "cumulative starts and normal spins differ",
    reason: "near-zero-table-start-counts-differ",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.normalSpins = 49;
    },
  },
  {
    name: "total starts is not zero",
    reason: "near-zero-table-total-starts-not-zero",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.totalStarts = 1;
    },
  },
  {
    name: "a related table field is not independently accepted",
    reason: "near-zero-table-start-counts-untrusted",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.fieldAccepted.normalSpins = false;
    },
  },
  {
    name: "panel calibration quality is below 0.95",
    reason: "near-zero-calibration-too-low",
    mutate({ slots }) {
      slots[1].calibration.quality = 0.949;
    },
  },
  {
    name: "the component occupies more than four percent of the panel",
    reason: "near-zero-profile-components-not-extremely-short",
    mutate({ slots }) {
      slots[1].bbox.width = 250;
    },
  },
  {
    name: "profile spans disagree by more than two pixels",
    reason: "near-zero-component-disagreement",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[3].span = 11;
      slots[1].shortSeriesEvidence.attempts[0].span = 8;
    },
  },
  {
    name: "the endpoint is too close to zero relative to grid spacing",
    reason: "near-zero-profile-endpoints-not-below-zero-nearby",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[0].endpointLocalY = 103;
    },
  },
  {
    name: "the profile value spread is more than 500",
    reason: "near-zero-value-spread-too-large",
    mutate({ slots }) {
      slots[1].val = -500;
      slots[1].shortSeriesEvidence.roundedValue = -1500;
      slots[1].shortSeriesEvidence.roundedValueSpread = 1000;
      slots[1].shortSeriesEvidence.attempts[0].roundedValue = -500;
      slots[1].shortSeriesEvidence.attempts[1].roundedValue = -1500;
    },
  },
  {
    name: "the value spread is zero instead of the observed 500 boundary disagreement",
    reason: "near-zero-value-spread-too-large",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.roundedValueSpread = 0;
    },
  },
  {
    name: "the consensus and primary values do not differ by exactly 500",
    reason: "near-zero-value-spread-too-large",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.roundedValue = -1000;
    },
  },
  {
    name: "the four attempt values do not span exactly 500",
    reason: "near-zero-value-spread-too-large",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts.forEach((attempt) => {
        attempt.roundedValue = -1000;
      });
    },
  },
  {
    name: "the consensus engine already marked the evidence accepted",
    reason: "near-zero-has-unsafe-consensus-reason",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.accepted = true;
    },
  },
  {
    name: "the primary value was already marked as agreeing",
    reason: "near-zero-has-unsafe-consensus-reason",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.primaryValueAgrees = true;
    },
  },
  {
    name: "the two expected consensus disagreement reasons are not both present",
    reason: "near-zero-has-unsafe-consensus-reason",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.reasonCodes = [
        "short-series-threshold-value-disagreement",
      ];
    },
  },
  {
    name: "a 14-pixel component is not extremely short",
    reason: "near-zero-profile-components-not-extremely-short",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[3].span = 14;
      slots[1].shortSeriesEvidence.attempts[3].bounds.maxX = 42;
    },
  },
  {
    name: "an endpoint more than 7 pixels below zero is not near zero",
    reason: "near-zero-profile-endpoints-not-below-zero-nearby",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[3].endpointLocalY = 107.5;
    },
  },
  {
    name: "all four named threshold profiles are mandatory",
    reason: "near-zero-four-profiles-missing",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.attempts[3].profile = "standard";
    },
  },
]);

for (const scenario of NEAR_ZERO_FAIL_CLOSED_CASES) {
  test(`near-zero estimate stays in review when ${scenario.name}`, () => {
    const safetyCase = syntheticNearZeroCase();
    scenario.mutate(safetyCase);
    const originalValue = safetyCase.slots[1].val;
    const resolved = applySafeShortSeriesValidation(
      safetyCase.slots,
      safetyCase.jointMatch,
    );

    assert.equal(resolved[1].status, "review");
    assert.equal(resolved[1].val, originalValue);
    assert.notEqual(resolved[1].estimated, true);
    assert.ok(
      resolved[1].shortSeriesValidation.nearZeroEstimate.reasonCodes.includes(
        scenario.reason,
      ),
      `${scenario.reason}: ${JSON.stringify(
        resolved[1].shortSeriesValidation.nearZeroEstimate.reasonCodes,
      )}`,
    );
  });
}

const FAIL_CLOSED_CASES = Object.freeze([
  {
    name: "主判定と四つの閾値の中央値が500玉ずれる",
    reason: "short-series-primary-value-conflict",
    mutate({ slots }) {
      slots[1].val = 2000;
      slots[1].shortSeriesEvidence.primaryRoundedValue = 2000;
      slots[1].shortSeriesEvidence.primaryValueAgrees = false;
      slots[1].shortSeriesEvidence.thresholdRoundedValues = [2500, 2000];
      slots[1].shortSeriesEvidence.roundedValueSpread = 500;
    },
  },
  {
    name: "四つの閾値の終点が一致しない",
    reason: "short-series-threshold-consensus-missing",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.accepted = false;
      slots[1].shortSeriesEvidence.reasonCodes = [
        "short-series-endpoint-disagreement",
      ];
    },
  },
  {
    name: "グラフと表の台番号が食い違う",
    reason: "short-series-machine-number-conflict",
    mutate({ slots }) {
      slots[1].machineNumberOcr.candidate = "999";
    },
  },
  {
    name: "台番号OCRの多数決が不足する",
    reason: "short-series-graph-number-consensus-too-low",
    mutate({ slots }) {
      slots[1].machineNumberOcr.ensemble.votes = 4;
    },
  },
  {
    name: "前後の表行が連続していない",
    reason: "short-series-table-order-not-consecutive",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableIndex = 4;
    },
  },
  {
    name: "前後の行が同じ表に属していない",
    reason: "short-series-table-source-conflict",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.sourceIndex = 1;
    },
  },
  {
    name: "表とグラフの最大出玉が食い違う",
    reason: "short-series-max-payout-conflict",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.maxPayout = 8888;
    },
  },
  {
    name: "表の最大出玉が未確定",
    reason: "short-series-table-max-payout-untrusted",
    mutate({ jointMatch }) {
      jointMatch.matches[1].tableRow.maxPayoutAccepted = false;
    },
  },
  {
    name: "グラフの最大出玉候補に十分な差がない",
    reason: "short-series-graph-max-payout-untrusted",
    mutate({ slots }) {
      slots[1].graphMaxPayout.candidates[1].score = 0.14;
    },
  },
  {
    name: "短系列以外の危険理由が残る",
    reason: "short-series-has-unsafe-graph-reason",
    mutate({ slots }) {
      slots[1].reasonCodes.push("boundary-touch");
    },
  },
  {
    name: "終点がグラフ境界に近すぎる",
    reason: "short-series-endpoint-near-boundary",
    mutate({ slots }) {
      slots[1].shortSeriesEvidence.endpointLocalY = 21;
    },
  },
]);

for (const scenario of FAIL_CLOSED_CASES) {
  test(`合成3台: ${scenario.name}場合は確認待ちのままにする`, () => {
    const safetyCase = syntheticSafetyCase();
    scenario.mutate(safetyCase);

    const resolved = applySafeShortSeriesValidation(
      safetyCase.slots,
      safetyCase.jointMatch,
    );

    assert.equal(resolved[1].status, "review");
    assert.equal(
      resolved[1].val,
      scenario.reason === "short-series-primary-value-conflict" ? 2000 : 2500,
    );
    assert.ok(
      resolved[1].shortSeriesValidation.reasonCodes.includes(scenario.reason),
      `${scenario.reason}: ${JSON.stringify(
        resolved[1].shortSeriesValidation.reasonCodes,
      )}`,
    );
  });
}

function assertPrivateTruth(truth) {
  assert.ok(truth && typeof truth === "object", "正解JSONはobjectが必要です");
  assert.ok(
    typeof truth.tableImageFile === "string" && truth.tableImageFile.trim(),
    "正解JSONにtableImageFileが必要です",
  );
  assert.ok(
    Array.isArray(truth.graphPages) && truth.graphPages.length > 0,
    "正解JSONにgraphPagesが必要です",
  );
  assert.ok(
    Array.isArray(truth.expectedRows) && truth.expectedRows.length > 0,
    "正解JSONにexpectedRowsが必要です",
  );

  for (const page of truth.graphPages) {
    assert.ok(
      typeof page?.file === "string" && page.file.trim(),
      "graphPages[].fileが必要です",
    );
    assert.ok(
      Number.isInteger(page?.count) && page.count > 0,
      "graphPages[].countは正の整数が必要です",
    );
  }

  const panelCount = truth.graphPages.reduce(
    (total, page) => total + page.count,
    0,
  );
  assert.equal(
    panelCount,
    truth.expectedRows.length,
    "graphPagesの合計枠数とexpectedRowsの件数が一致する必要があります",
  );

  for (const row of truth.expectedRows) {
    assert.match(
      String(row?.machineNumber ?? ""),
      /^\d+$/u,
      "expectedRows[].machineNumberは数字が必要です",
    );
    assert.ok(
      Number.isSafeInteger(row?.maxPayout) && row.maxPayout >= 0,
      "expectedRows[].maxPayoutは0以上の整数が必要です",
    );
    assert.ok(
      Number.isFinite(row?.graphValueBefore),
      "expectedRows[].graphValueBeforeは数値が必要です",
    );
    assert.ok(
      Number.isFinite(row?.graphValueAfter),
      "expectedRows[].graphValueAfterは数値が必要です",
    );
    assert.equal(
      typeof row?.shortSeries,
      "boolean",
      "expectedRows[].shortSeriesはbooleanが必要です",
    );
    assert.equal(
      typeof row?.autoConfirm,
      "boolean",
      "expectedRows[].autoConfirmはbooleanが必要です",
    );
    assert.ok(
      row.autoConfirm !== true || row.shortSeries === true,
      "autoConfirm=trueは短系列行だけに指定できます",
    );
  }
}

async function loadPrivateTruth(filePath) {
  let bytes;
  try {
    bytes = await readFile(filePath, "utf8");
  } catch (error) {
    assert.fail(`${PRIVATE_TRUTH_ENV}を読み込めません: ${filePath}\n${error}`);
  }

  let truth;
  try {
    truth = JSON.parse(bytes);
  } catch (error) {
    assert.fail(`${PRIVATE_TRUTH_ENV}は有効なJSONが必要です\n${error}`);
  }
  assertPrivateTruth(truth);
  return truth;
}

async function privateImageData(directory, file) {
  const filePath = path.join(directory, file);
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    assert.fail(
      `${PRIVATE_FIXTURE_ENV}に必要な非公開画像がありません: ${filePath}\n${error}`,
    );
  }
  const image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}

async function analyzePrivateGraphFixtures(directory, graphPages) {
  const slots = [];
  for (let pageIndex = 0; pageIndex < graphPages.length; pageIndex += 1) {
    const page = graphPages[pageIndex];
    const image = await privateImageData(directory, page.file);
    const analysis = runAnalysis(image.data, image.width, image.height);
    assert.equal(analysis.error, undefined, `page ${pageIndex}: graph analysis`);
    assert.equal(
      analysis.results.length,
      page.count,
      `page ${pageIndex}: panel count`,
    );
    const withMetadata = attachGraphPanelMetadata(
      image.data,
      image.width,
      image.height,
      analysis.results,
    );
    const withNumbers = attachMachineNumbersToSlots(
      image.data,
      image.width,
      image.height,
      withMetadata,
    );
    slots.push(...withNumbers.slots.map((slot, panelIndex) => ({
      ...slot,
      source: {
        imageIndex: pageIndex,
        imageName: `private-page-${pageIndex}`,
        panelIndex,
        row: slot.row,
        column: slot.column,
      },
    })));
  }
  return slots;
}

function privateJointMatch(slots, tableRows) {
  const graphPanels = slots.map((slot, graphIndex) => ({
    ...slot,
    panelId: `${slot.source.imageName}:${slot.source.panelIndex}`,
    observedNumCandidate: slot.machineNumberOcr?.candidate,
    machineNumberAccepted: slot.machineNumberOcr?.accepted === true,
    pageIndex: slot.source.imageIndex,
    rowIndex: slot.source.row,
    colIndex: slot.source.column,
    graphIndex,
  }));
  return matchSiteSevenGraphPanels(graphPanels, tableRows);
}

test(
  "外部の非公開実画像と正解JSON: 根拠が一致する短系列だけを安全に確定する",
  {
    skip: PRIVATE_INTEGRATION_READY
      ? false
      : `${PRIVATE_FIXTURE_ENV}と${PRIVATE_TRUTH_ENV}を指定した場合だけ実行します`,
  },
  async () => {
    const truth = await loadPrivateTruth(PRIVATE_TRUTH_PATH);
    const expectedNumbers = truth.expectedRows.map(
      (row) => String(row.machineNumber),
    );
    const expectedMaxPayouts = truth.expectedRows.map((row) => row.maxPayout);
    const expectedValuesBefore = truth.expectedRows.map(
      (row) => row.graphValueBefore,
    );
    const expectedValuesAfter = truth.expectedRows.map(
      (row) => row.graphValueAfter,
    );
    const expectedShortSeriesIndices = truth.expectedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.shortSeries)
      .map(({ index }) => index);
    const expectedAutoConfirmIndices = truth.expectedRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.autoConfirm)
      .map(({ index }) => index);

    const slots = await analyzePrivateGraphFixtures(
      PRIVATE_FIXTURE_DIR,
      truth.graphPages,
    );
    const tableImage = await privateImageData(
      PRIVATE_FIXTURE_DIR,
      truth.tableImageFile,
    );
    const parsedTable = parseSiteSevenTableImageData(tableImage, {
      expectedNumbers,
    });
    const structuredRows = buildSiteSevenStructuredRows(parsedTable, {
      importKind: "image",
      sourceIndex: 0,
      sourceId: "private-table",
    });

    assert.equal(slots.length, truth.expectedRows.length);
    assert.equal(structuredRows.length, truth.expectedRows.length);
    assert.deepEqual(
      slots.map((slot) => slot.machineNumberOcr?.candidate),
      expectedNumbers,
    );
    assert.ok(slots.every((slot) => slot.machineNumberOcr?.accepted === true));
    assert.deepEqual(
      structuredRows.map((row) => row.num),
      expectedNumbers,
    );
    assert.deepEqual(
      structuredRows.map((row) => Number(row.maxPayout)),
      expectedMaxPayouts,
    );
    assert.ok(structuredRows.every((row) => row.numAccepted === true));
    assert.ok(structuredRows.every((row) => row.maxPayoutAccepted === true));
    assert.deepEqual(slots.map((slot) => slot.val), expectedValuesBefore);
    assert.deepEqual(
      slots
        .map((slot, index) => ({ slot, index }))
        .filter(({ slot }) => slot.status === "review")
        .map(({ index }) => index),
      expectedShortSeriesIndices,
    );

    for (const index of expectedAutoConfirmIndices) {
      const evidence = slots[index].shortSeriesEvidence;
      assert.equal(evidence?.accepted, true, `index ${index}: threshold consensus`);
      assert.equal(evidence?.profileCount, 4, `index ${index}: profile count`);
      assert.equal(
        evidence?.requiredProfileCount,
        4,
        `index ${index}: required profiles`,
      );
      assert.ok(
        evidence.endpointSpread <= evidence.maximumEndpointSpread,
        `index ${index}: endpoint spread`,
      );
    }

    const jointMatch = privateJointMatch(slots, structuredRows);
    assert.equal(jointMatch.summary.matchedCount, truth.expectedRows.length);
    assert.equal(jointMatch.summary.unmatchedGraphCount, 0);
    assert.equal(jointMatch.summary.unmatchedRowCount, 0);
    assert.deepEqual(jointMatch.reviewReasons, []);

    const resolved = applySafeShortSeriesValidation(slots, jointMatch);
    const promotedIndices = resolved
      .map((slot, index) => ({ slot, original: slots[index], index }))
      .filter(({ slot, original }) => (
        slot.status === "ok" && original.status === "review"
      ))
      .map(({ index }) => index);

    assert.deepEqual(promotedIndices, expectedAutoConfirmIndices);
    const expectedAutoConfirmIndexSet = new Set(expectedAutoConfirmIndices);
    assert.ok(resolved.every((slot, index) => (
      expectedShortSeriesIndices.includes(index)
        ? slot.status === (expectedAutoConfirmIndexSet.has(index) ? "ok" : "review")
        : slot.status === "ok"
    )));
    assert.deepEqual(resolved.map((slot) => slot.val), expectedValuesAfter);

    const shortSeriesIndexSet = new Set(expectedShortSeriesIndices);
    resolved.forEach((slot, index) => {
      if (expectedAutoConfirmIndexSet.has(index)) {
        assert.equal(slot.shortSeriesValidation?.accepted, true);
        assert.deepEqual(slot.shortSeriesValidation?.reasonCodes, []);
        assert.equal(
          slot.shortSeriesValidation?.maxPayout,
          expectedMaxPayouts[index],
        );
        assert.equal(slot.machineNumber, expectedNumbers[index]);
      } else if (!shortSeriesIndexSet.has(index)) {
        assert.strictEqual(slot, slots[index], `index ${index}: slot identity`);
      } else {
        assert.equal(slot.shortSeriesValidation?.accepted, false);
        assert.equal(slot.status, "review");
      }
    });
  },
);
