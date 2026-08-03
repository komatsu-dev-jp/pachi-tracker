import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
let server;
let worker;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  worker = await server.ssrLoadModule("/src/autoWorker.jsx");
});

after(async () => {
  await server?.close();
});

function lowActivityAnalysis({ normalSpins = 5 } = {}) {
  return {
    slots: [{
      val: null,
      status: "failed",
      reasonCodes: ["missing-series"],
      calibration: { source: "panel", quality: 0.961 },
      machineNumber: "805",
      machineNumberVerified: true,
      machineNumberOcr: {
        accepted: true,
        candidate: "805",
        ensemble: { votes: 6 },
      },
      jointMatch: { accepted: true, matchedBy: "num", resolvedNum: "805" },
      source: { imageName: "graph.jpg" },
      graphMaxPayout: {
        value: 0,
        candidates: [{ value: 0, score: 0.124 }, { value: 9, score: 0.286 }],
      },
    }],
    reports: [{ imageIndex: 0, name: "graph.jpg", total: 1, readable: 1, review: 0, missing: 0 }],
    numberOcr: { accepted: true, numbers: ["805"] },
    jointMatch: { summary: { matchedCount: 1 } },
    siteSevenRows: [{
      num: "805",
      cumulativeStarts: normalSpins,
      normalSpins,
      firstHitCount: 0,
      maxPayout: 0,
      totalStarts: 0,
      maxPayoutAccepted: true,
      jointMatchAccepted: true,
      matchedBy: "num",
      reviewRequired: false,
      globalReviewRequired: false,
      sourceFile: "table.jpg",
      fieldAccepted: {
        num: true,
        cumulativeStarts: true,
        normalSpins: true,
        firstHitCount: true,
        maxPayout: true,
        totalStarts: true,
      },
    }],
    siteSevenSummary: {
      rowCount: 1,
      reviewCount: 0,
      skippedCount: 0,
      duplicateCount: 0,
      failedFileCount: 0,
      unsafeFileCount: 0,
    },
  };
}

test("auto worker exempts graph-slot blocking only for accepted low-activity zero evidence", async () => {
  const accepted = await worker.buildAutoWorkerCandidate(lowActivityAnalysis());
  assert.equal(accepted.candidateRows[0].lowActivityZeroValidation.accepted, true);
  assert.equal(accepted.candidateRows[0].val, 0);
  assert.equal(accepted.blockingReasons.includes("graph-slot-not-ok"), false);

  const outsideAutoBand = await worker.buildAutoWorkerCandidate(
    lowActivityAnalysis({ normalSpins: 11 }),
  );
  assert.notEqual(outsideAutoBand.candidateRows[0].lowActivityZeroValidation?.accepted, true);
  assert.ok(outsideAutoBand.blockingReasons.includes("graph-slot-not-ok"));
});
