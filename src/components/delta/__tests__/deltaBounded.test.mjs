import test from "node:test";
import assert from "node:assert/strict";

import {
  attachClippedDeltaRanges,
  deriveClippedDeltaRange,
  formatDeltaRange,
  isBoundedDeltaRow,
} from "../deltaBounded.js";
import { buildClippedDeltaSuggestion } from "../clippedDeltaSuggestion.js";

const machine = {
  name: "P大海物語5 MTE2",
  aliases: ["P大海物語5"],
  border: { "4.00": 16.7 },
  avgPayoutPerHit: 1350,
  stdDev: 13000,
};

function clipped548(overrides = {}) {
  return {
    num: "548",
    machineName: machine.name,
    val: 28500,
    rank: "SSS",
    status: "review",
    confidence: 0.92,
    calibration: { source: "panel", quality: 0.95 },
    reasonCodes: ["endpoint-clipped-top", "clipped-series"],
    boundaryObservation: { kind: "censored-top", boundary: "top", value: 30000, exact: false },
    valueConstraint: null,
    visibleValueRange: { lower: -2500, upper: 30000 },
    normalSpins: 631,
    totalStarts: 40,
    maxPayout: 49190,
    maxPayoutAccepted: true,
    jointMatch: { accepted: true, resolvedNum: "548", maxPayout: 49190 },
    taiImportAudit: {
      jointMatchAccepted: true,
      sourceType: "local-image-ocr",
      reviewRequired: false,
      fieldAccepted: { normalSpins: true, totalStarts: true, maxPayout: true },
      graphMaxPayout: 49190,
      graphMaxPayoutAccepted: true,
      importedMaxPayout: 49190,
      importedMaxPayoutAccepted: true,
    },
    ...overrides,
  };
}

test("共同照合済みでも一点値やhard下限を捏造せず、上限接触として保存する", () => {
  const range = deriveClippedDeltaRange(clipped548());
  assert.deepEqual(range, {
    kind: "censored-top",
    boundary: "top",
    boundaryValue: 30000,
    observedCandidate: 28500,
    lower: null,
    upper: null,
    source: "graph-boundary",
    metricSemantics: null,
    exact: false,
  });

  const [bounded] = attachClippedDeltaRanges([clipped548()]);
  assert.equal(bounded.status, "bounded");
  assert.equal(bounded.val, null);
  assert.equal(bounded.rank, null);
  assert.equal(bounded.rawGraphCandidate.val, 28500);
  assert.equal(isBoundedDeltaRow(bounded), true);
  assert.equal(formatDeltaRange(bounded.deltaRange, (value) => value.toLocaleString("ja-JP")), "上限付近（30,000玉超の可能性）");
});

test("境界到達記録に一点値またはランクが混ざった行は有効扱いしない", () => {
  const [bounded] = attachClippedDeltaRanges([clipped548()]);
  assert.equal(isBoundedDeltaRow({ ...bounded, val: 30000 }), false);
  assert.equal(isBoundedDeltaRow({ ...bounded, rank: "SSS" }), false);
});

test("最高出玉が未確認または共同照合なしでもグラフ接触の事実だけを保存する", () => {
  const withoutJoint = clipped548({ jointMatch: null });
  assert.deepEqual(deriveClippedDeltaRange(withoutJoint), {
    kind: "censored-top",
    boundary: "top",
    boundaryValue: 30000,
    observedCandidate: 28500,
    lower: null,
    upper: null,
    source: "graph-boundary",
    metricSemantics: null,
    exact: false,
  });
});

test("画像全体の代替校正は確認不要のhard範囲へ昇格させない", () => {
  const fallback = clipped548({ calibration: { source: "image-median", quality: 0.8 } });
  assert.equal(deriveClippedDeltaRange(fallback), null);
  assert.equal(attachClippedDeltaRanges([fallback])[0].status, "review");
});

test("個別パネル校正でも低信頼ならhard範囲へ昇格させない", () => {
  const lowConfidence = clipped548({
    confidence: 0.64,
    calibration: { source: "panel", quality: 0.65 },
  });
  assert.equal(deriveClippedDeltaRange(lowConfidence), null);
  assert.equal(attachClippedDeltaRanges([lowConfidence])[0].status, "review");
});

test("同日0当り台と機種情報を使い、548の参考候補だけを作る", () => {
  const [target] = attachClippedDeltaRanges([clipped548()]);
  const peers = [
    { num: "486", machineName: machine.name, status: "ok", val: -6500, normalSpins: 467, totalStarts: 0, jointMatch: { accepted: true }, taiImportAudit: { jointMatchAccepted: true, fieldAccepted: { normalSpins: true, totalStarts: true } } },
    { num: "553", machineName: machine.name, status: "ok", val: -16500, normalSpins: 1260, totalStarts: 0, jointMatch: { accepted: true }, taiImportAudit: { jointMatchAccepted: true, fieldAccepted: { normalSpins: true, totalStarts: true } } },
    { num: "508", machineName: machine.name, status: "review", val: -3500, normalSpins: 230, totalStarts: 0 },
    { num: "503", machineName: machine.name, status: "review", reviewConfirmed: true, valueSource: "manual-review", val: -2000, normalSpins: 192, totalStarts: 0 },
  ];
  const suggestion = buildClippedDeltaSuggestion(target, [target, ...peers], [], [machine]);
  assert.equal(suggestion.value, 45500);
  assert.equal(suggestion.requiresReview, true);
  assert.equal(suggestion.autoConfirm, false);
  assert.equal(suggestion.confidence, "medium");
  assert.deepEqual(suggestion.basis.peerNumbers, ["486", "553"]);
  assert.equal(suggestion.basis.rotationSource, "same-day-zero-hit-peers");
});

test("共同照合または表の必須項目が未採用なら参考候補を表示しない", () => {
  const [notJoint] = attachClippedDeltaRanges([clipped548({ jointMatch: null })]);
  assert.equal(buildClippedDeltaSuggestion(notJoint, [notJoint], [], [machine]), null);

  const rejectedFields = clipped548({
    taiImportAudit: {
      ...clipped548().taiImportAudit,
      fieldAccepted: { normalSpins: false, totalStarts: true, maxPayout: true },
    },
  });
  const [bounded] = attachClippedDeltaRanges([rejectedFields]);
  assert.equal(buildClippedDeltaSuggestion(bounded, [bounded], [], [machine]), null);

  const structuredRejected = clipped548({
    taiImportAudit: {
      ...clipped548().taiImportAudit,
      sourceType: "csv",
      structuredRowTrusted: true,
      fieldAccepted: { normalSpins: false, totalStarts: true, maxPayout: true },
    },
  });
  const [rejectedStructured] = attachClippedDeltaRanges([structuredRejected]);
  assert.equal(buildClippedDeltaSuggestion(rejectedStructured, [rejectedStructured], [], [machine]), null);
});

test("未編集の構造化PDF・CSVは明示拒否がなければ参考推定に使える", () => {
  const structured = clipped548({
    taiImportAudit: {
      ...clipped548().taiImportAudit,
      sourceType: "csv",
      structuredRowTrusted: true,
      reviewRequired: false,
      fieldAccepted: null,
    },
  });
  const [target] = attachClippedDeltaRanges([structured]);
  const suggestion = buildClippedDeltaSuggestion(target, [target], [], [machine]);
  assert.ok(suggestion);
  assert.equal(suggestion.confidence, "low");
});

test("共同照合や回転数項目が未採用の参照台を回転率補正に使わない", () => {
  const [target] = attachClippedDeltaRanges([clipped548()]);
  const untrustedPeers = [
    { num: "486", machineName: machine.name, status: "ok", val: -6500, normalSpins: 467, totalStarts: 0 },
    { num: "553", machineName: machine.name, status: "ok", val: -16500, normalSpins: 1260, totalStarts: 0, jointMatch: { accepted: true }, taiImportAudit: { jointMatchAccepted: true, fieldAccepted: { normalSpins: false, totalStarts: true } } },
  ];
  const suggestion = buildClippedDeltaSuggestion(target, [target, ...untrustedPeers], [], [machine]);
  assert.equal(suggestion.confidence, "low");
  assert.deepEqual(suggestion.basis.peerNumbers, []);
  assert.equal(suggestion.basis.rotationSource, "machine-border");
});

test("途中接触の通常行には範囲も参考候補も付けない", () => {
  const ordinary = {
    ...clipped548(),
    status: "ok",
    reasonCodes: ["historical-boundary-contact"],
    boundaryObservation: null,
    valueConstraint: null,
  };
  assert.equal(deriveClippedDeltaRange(ordinary), null);
  assert.equal(buildClippedDeltaSuggestion(ordinary, [ordinary], [], [machine]), null);
});
