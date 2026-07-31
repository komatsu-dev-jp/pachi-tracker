import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIDENCE_THRESHOLDS,
  EVIDENCE_SCORE_THRESHOLDS,
  classifyEvidenceTier,
  confidenceLevelLabel,
  decisionLabel,
  sessionActionLabel,
} from "../decisionVocabulary.js";

test("画面別の旧IDを共通5段階ラベルへ正規化する", () => {
  assert.equal(decisionLabel("continue_strong"), "有力");
  assert.equal(decisionLabel("strong"), "有力");
  assert.equal(decisionLabel("continue"), "候補");
  assert.equal(decisionLabel("watch"), "様子見");
  assert.equal(decisionLabel("weak"), "見送り");
  assert.equal(decisionLabel("nodata"), "判定待ち");
});

test("実戦アクションも共通定義から返す", () => {
  assert.equal(sessionActionLabel("continue_strong"), "続行（有力）");
  assert.equal(sessionActionLabel("continue"), "続行（候補）");
  assert.equal(sessionActionLabel("stop"), "撤退");
});

test("信頼度・スコア境界は1つの定義で固定する", () => {
  assert.equal(classifyEvidenceTier(999, CONFIDENCE_THRESHOLDS.minimum - 0.001), "nodata");
  assert.equal(classifyEvidenceTier(EVIDENCE_SCORE_THRESHOLDS.strong, CONFIDENCE_THRESHOLDS.minimum), "strong");
  assert.equal(classifyEvidenceTier(EVIDENCE_SCORE_THRESHOLDS.watch, 1), "watch");
  assert.equal(classifyEvidenceTier(EVIDENCE_SCORE_THRESHOLDS.watch - 0.001, 1), "weak");
  assert.equal(confidenceLevelLabel(CONFIDENCE_THRESHOLDS.high), "高い");
  assert.equal(confidenceLevelLabel(CONFIDENCE_THRESHOLDS.medium), "中");
});
