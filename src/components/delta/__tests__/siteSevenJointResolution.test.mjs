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
