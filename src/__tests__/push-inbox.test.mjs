import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AUTO_HEADER_CONTEXT_ENGINE_VERSION,
  AUTO_HEADER_CONTEXT_SOURCE,
  canonicalJson,
  decodeDeltaImportPayload,
  decodeReviewNoticePayload,
  hasTrustedHeaderContextEvidence,
  isLegacyRejectedReviewNotice,
  isStrictAutoImportCandidate,
  parsePairingRequestText,
  sha256Digest,
  selectProcessablePushRecords,
  subscribeFromPairingRequest,
  validateAndDecodePushEnvelope,
  validatePushEnvelopeShape,
  verifyAndDecodePushEnvelope,
} from "../pushInbox.js";

const FIXED_NOW = Date.parse("2026-07-30T04:00:00.000Z");

function makeFingerprint() {
  return {
    algorithm: "SHA-256",
    hash: "a".repeat(64),
    fileCount: 1,
    fileHashes: ["b".repeat(64)],
  };
}

function makeContextEvidence(overrides = {}) {
  return {
    source: AUTO_HEADER_CONTEXT_SOURCE,
    version: 1,
    profileVotes: 2,
    headerFileCount: 1,
    ...overrides,
  };
}

function makeReviewPayload() {
  return {
    schema: "pachi-tracker.review-notice",
    version: 1,
    source: "site-seven-windows",
    notice: {
      jobId: "job-20260730-review-1",
      date: "2026-07-30",
      storeName: "テスト店",
      machineName: "Pテスト",
      analyzedAt: "2026-07-30T02:55:00.000Z",
      sourceFingerprint: {
        algorithm: "SHA-256",
        hash: "c".repeat(64),
        fileCount: 4,
      },
      pendingMachines: [{
        machineNumber: "102",
        reasons: ["bounded-delta"],
      }],
      blockingReasons: ["review-required"],
    },
  };
}

function makePayload({ compactRows = true } = {}) {
  return {
    schema: "pachi-tracker.delta-import",
    version: 1,
    source: "site-seven-windows",
    compactRows,
    scan: {
      id: "scan-20260730-001",
      storeId: "store-1",
      storeName: "テスト店",
      date: "2026-07-30",
      event: "",
      machineName: "Pテスト",
      sourceFingerprint: makeFingerprint(),
      analysisEngineVersion: "windows-local-v1",
      observedAt: "2026-07-30T02:50:00.000Z",
      rows: compactRows
        ? [["17", 11450, 80, 995, null, 717, 9, 11450, 717, 2]]
        : [{
          num: "17",
          val: 11450,
          px: 80,
          confidence: 0.995,
          machineName: null,
          normalSpins: 717,
          totalStarts: 9,
          maxPayout: 11450,
          cumulativeStarts: 717,
          firstHitCount: 2,
          status: "ok",
        }],
    },
  };
}

test("canonical JSONはオブジェクトのキー順に依存しない", () => {
  assert.equal(
    canonicalJson({ z: 1, nested: { b: 2, a: 1 } }),
    canonicalJson({ nested: { a: 1, b: 2 }, z: 1 }),
  );
});

test("compact行をアプリ用scanへ展開する", () => {
  const result = decodeDeltaImportPayload(makePayload(), {
    createdAt: "2026-07-30T03:00:00.000Z",
    now: FIXED_NOW,
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.scan.rows[0].num, "17");
  assert.equal(result.scan.rows[0].confidence, 0.995);
  assert.equal(result.scan.rows[0].machineName, "Pテスト");
  assert.equal(result.scan.rows[0].status, "ok");
  assert.equal(result.scan.importSource, "paired-windows-push");
  assert.equal(result.scan.observedAt, "2026-07-30T02:50:00.000Z");
  assert.equal(result.scan.createdAt, "2026-07-30T02:50:00.000Z");
  assert.equal(isStrictAutoImportCandidate(result.scan), true);
});

test("header consensus context evidence is strictly decoded and preserved", () => {
  const payload = makePayload();
  payload.scan.analysisEngineVersion = AUTO_HEADER_CONTEXT_ENGINE_VERSION;
  payload.scan.contextEvidence = makeContextEvidence({
    profileVotes: 1024,
    headerFileCount: 64,
  });
  const result = decodeDeltaImportPayload(payload, {
    createdAt: "2026-07-30T03:00:00.000Z",
    now: FIXED_NOW,
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.scan.contextEvidence, payload.scan.contextEvidence);
  assert.equal(hasTrustedHeaderContextEvidence(result.scan), true);
  assert.equal(result.scan.rows[0].machineName, result.scan.machineName);
});

test("context evidence rejects unknown fields, invalid bounds, controls, and bidi", () => {
  const invalidEvidence = [
    null,
    makeContextEvidence({ extra: true }),
    makeContextEvidence({ source: `${AUTO_HEADER_CONTEXT_SOURCE}\n` }),
    makeContextEvidence({ version: 2 }),
    makeContextEvidence({ profileVotes: 1 }),
    makeContextEvidence({ profileVotes: 1025 }),
    makeContextEvidence({ headerFileCount: 0 }),
    makeContextEvidence({ headerFileCount: 65 }),
  ];
  for (const contextEvidence of invalidEvidence) {
    const payload = makePayload();
    payload.scan.analysisEngineVersion = AUTO_HEADER_CONTEXT_ENGINE_VERSION;
    payload.scan.contextEvidence = contextEvidence;
    const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
    assert.equal(result.valid, false, JSON.stringify(contextEvidence));
    assert.match(result.errors.join("\n"), /contextEvidence/u);
  }

  const unsafeLabels = [
    ["storeName", "店舗\u0000名"],
    ["storeId", "store\u202e1"],
    ["event", "旧イベント\n"],
    ["machineName", "P\u2066テスト"],
  ];
  for (const [field, value] of unsafeLabels) {
    const payload = makePayload();
    payload.scan[field] = value;
    const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
    assert.equal(result.valid, false, field);
  }

  const unsafeRow = makePayload();
  unsafeRow.scan.rows[0][4] = "P\u200fテスト";
  assert.equal(decodeDeltaImportPayload(unsafeRow, { now: FIXED_NOW }).valid, false);
});

test("trusted context requires the exact header worker engine version", () => {
  const payload = makePayload();
  payload.scan.contextEvidence = makeContextEvidence();
  const oldEngine = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(oldEngine.valid, true, oldEngine.errors.join("\n"));
  assert.equal(hasTrustedHeaderContextEvidence(oldEngine.scan), false);

  payload.scan.analysisEngineVersion = "windows-local-v1-auto-worker-header-v1-extra";
  const suffixEngine = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(suffixEngine.valid, true, suffixEngine.errors.join("\n"));
  assert.equal(hasTrustedHeaderContextEvidence(suffixEngine.scan), false);
});

test("通常オブジェクト行も検証して展開する", () => {
  const result = decodeDeltaImportPayload(makePayload({ compactRows: false }), {
    createdAt: "2026-07-30T03:00:00.000Z",
    now: FIXED_NOW,
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.scan.rows[0].confidencePermille, 995);
});

test("processor用APIはbatchIdと展開済みscanを返す", async () => {
  const payload = makePayload();
  const envelope = {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "batch-processor-1",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: await sha256Digest(payload),
    payload,
  };
  const result = await validateAndDecodePushEnvelope(envelope, { now: FIXED_NOW });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.batchId, "batch-processor-1");
  assert.equal(result.scan.rows[0].status, "ok");
});

test("通常オブジェクト行はstatus=ok以外を拒否する", () => {
  const payload = makePayload({ compactRows: false });
  payload.scan.rows[0].status = "review";
  const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /\.status/u);
});

test("compact行の前半必須値にnullを許可しない", () => {
  const payload = makePayload();
  payload.scan.rows[0][1] = null;
  const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /\.val/u);
});

test("表の5数値が欠けたscanは形式を保持できても自動取込しない", () => {
  const payload = makePayload();
  payload.scan.rows[0][8] = null;
  const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(isStrictAutoImportCandidate(result.scan), false);
});

test("未知の項目と重複台番号を拒否する", () => {
  const payload = makePayload();
  payload.untrusted = true;
  payload.scan.rows.push([...payload.scan.rows[0]]);
  const result = decodeDeltaImportPayload(payload, { now: FIXED_NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /未対応の項目/u);
  assert.match(result.errors.join("\n"), /重複/u);
});

test("正しいdigestだけを検証し、改変後は拒否する", async () => {
  const payload = makePayload();
  const envelope = {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "batch-20260730-001",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: await sha256Digest(payload),
    payload,
  };
  const valid = await verifyAndDecodePushEnvelope(envelope, { now: FIXED_NOW });
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  envelope.payload.scan.rows[0][1] = 99999;
  const changed = await verifyAndDecodePushEnvelope(envelope, { now: FIXED_NOW });
  assert.equal(changed.valid, false);
  assert.match(changed.errors.join("\n"), /変化/u);
});

test("外側envelopeも完全一致のスキーマだけを許可する", () => {
  const result = validatePushEnvelopeShape({
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "batch-1",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: `sha256:${"a".repeat(64)}`,
    payload: {},
    overwrite: true,
  }, { now: FIXED_NOW });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /未対応/u);
});

test(".pachipair連携リクエストのVAPID公開鍵を検証する", () => {
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
  const request = parsePairingRequestText(JSON.stringify({
    schema: "pachi-tracker.pair-request",
    version: 1,
    pairingId: "windows-home",
    vapidPublicKey: key,
    createdAt: "2026-07-30T03:00:00.000Z",
    expiresAt: "2026-07-31T03:00:00.000Z",
    senderLabel: "自宅Windows",
  }), { now: FIXED_NOW });
  assert.equal(request.pairingId, "windows-home");
  assert.equal(request.senderLabel, "自宅Windows");
});

test("observedAt・送信日時の未来値と未対応の解析版を拒否する", () => {
  const futureScan = makePayload();
  futureScan.scan.observedAt = "2026-07-30T04:05:00.001Z";
  const futureScanResult = decodeDeltaImportPayload(futureScan, { now: FIXED_NOW });
  assert.equal(futureScanResult.valid, false);
  assert.match(futureScanResult.errors.join("\n"), /observedAt.*未来/u);

  const unsupportedEngine = makePayload();
  unsupportedEngine.scan.analysisEngineVersion = "unknown-cloud-v9";
  const unsupportedResult = decodeDeltaImportPayload(unsupportedEngine, { now: FIXED_NOW });
  assert.equal(unsupportedResult.valid, false);
  assert.match(unsupportedResult.errors.join("\n"), /analysisEngineVersion/u);

  const supportedWorker = makePayload();
  supportedWorker.scan.analysisEngineVersion = "windows-local-v1-auto-worker";
  assert.equal(
    decodeDeltaImportPayload(supportedWorker, { now: FIXED_NOW }).valid,
    true,
  );

  const futureEnvelope = validatePushEnvelopeShape({
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "batch-future",
    createdAt: "2026-07-30T04:05:00.001Z",
    digest: `sha256:${"a".repeat(64)}`,
    payload: {},
  }, { now: FIXED_NOW });
  assert.equal(futureEnvelope.valid, false);
  assert.match(futureEnvelope.errors.join("\n"), /未来/u);
});

test(".pachipairは作成・期限日時を必須にし、時計ずれ5分・有効期間24時間を守る", () => {
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
  const base = {
    schema: "pachi-tracker.pair-request",
    version: 1,
    pairingId: "windows-secure",
    vapidPublicKey: key,
    createdAt: "2026-07-30T03:00:00.000Z",
    expiresAt: "2026-07-31T03:00:00.000Z",
  };

  const missingCreatedAt = { ...base };
  delete missingCreatedAt.createdAt;
  assert.throws(
    () => parsePairingRequestText(JSON.stringify(missingCreatedAt), { now: FIXED_NOW }),
    /作成日時/u,
  );

  assert.throws(
    () => parsePairingRequestText(JSON.stringify({
      ...base,
      createdAt: "2026-07-30T04:05:00.001Z",
      expiresAt: "2026-07-31T04:05:00.001Z",
    }), { now: FIXED_NOW }),
    /5分を超えて未来/u,
  );

  assert.throws(
    () => parsePairingRequestText(JSON.stringify({
      ...base,
      expiresAt: "2026-07-31T03:00:00.001Z",
    }), { now: FIXED_NOW }),
    /24時間以内/u,
  );
});

test("読み込み後に期限切れになった.pachipairはPush購読の直前にも拒否する", async () => {
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
  await assert.rejects(
    subscribeFromPairingRequest({
      schema: "pachi-tracker.pair-request",
      version: 1,
      pairingId: "windows-expired",
      vapidPublicKey: key,
      createdAt: "2026-07-30T03:00:00.000Z",
      expiresAt: "2026-07-30T04:00:00.000Z",
    }, {
      now: FIXED_NOW,
      requireStandalone: false,
    }),
    /期限切れ/u,
  );
});

test("Service Workerは通知を必ず表示し、受信箱へaddし、既存解析DB名を参照しない", async () => {
  const source = await readFile(
    new URL("../../public/push-sw.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /showNotification/u);
  assert.match(source, /store\.add\(/u);
  assert.doesNotMatch(source, /pt_deltaScans/u);
  assert.doesNotMatch(source, /store\.put\(/u);
  assert.match(source, /existing\?\.envelope\?\.digest/u);
  assert.match(source, /batch-id-conflict/u);
  assert.match(source, /PUSH_INBOX_UPDATED/u);
  assert.doesNotMatch(source, /client\.navigate/u);
});

test("review notice decodes without image or unapproved delta values", async () => {
  const payload = makeReviewPayload();
  const decoded = decodeReviewNoticePayload(payload, {
    createdAt: "2026-07-30T03:00:00.000Z",
    now: FIXED_NOW,
  });
  assert.equal(decoded.valid, true, decoded.errors.join("\n"));
  assert.equal(decoded.notice.pendingMachines[0].machineNumber, "102");
  assert.equal("val" in decoded.notice.pendingMachines[0], false);

  const envelope = {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "review-batch-1",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: await sha256Digest(payload),
    payload,
  };
  const result = await validateAndDecodePushEnvelope(envelope, { now: FIXED_NOW });
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.kind, "review");
  assert.equal(result.scan, null);
  assert.equal(result.reviewNotice.sourceFingerprint.hash, "c".repeat(64));
});

test("review notice rejects extra fields and unsafe reason text", () => {
  const payload = makeReviewPayload();
  payload.notice.pendingMachines[0].val = -2500;
  payload.notice.blockingReasons = ["unsafe\nreason"];
  const decoded = decodeReviewNoticePayload(payload, { now: FIXED_NOW });
  assert.equal(decoded.valid, false);
  assert.match(decoded.errors.join("\n"), /unsupported fields val/u);
  assert.match(decoded.errors.join("\n"), /invalid reason code/u);
});

test("legacy rejected review notices are selected once and linked to final imports", () => {
  const reviewEnvelope = {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "legacy-review-1",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: `sha256:${"d".repeat(64)}`,
    payload: makeReviewPayload(),
  };
  const legacy = {
    batchId: reviewEnvelope.batchId,
    status: "rejected",
    envelope: reviewEnvelope,
    statusDetails: {
      reasonCodes: ["invalid-envelope"],
      errors: ["payload.schema: pachi-tracker.delta-import required"],
    },
  };
  assert.equal(isLegacyRejectedReviewNotice(legacy), true);

  const finalized = {
    batchId: "final-delta-1",
    status: "imported",
    envelope: { payload: { schema: "pachi-tracker.delta-import" } },
    statusDetails: {
      sourceFingerprint: "c".repeat(64),
    },
  };
  const deferred = {
    batchId: "future-1",
    status: "pending",
    envelope: { payload: { schema: "pachi-tracker.future-import" } },
    statusDetails: {
      reasonCodes: ["unsupported-payload-schema"],
    },
  };
  const selected = selectProcessablePushRecords([deferred, finalized, legacy]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].batchId, legacy.batchId);
  assert.equal(selected[0].processingContext.legacyReviewRecoveryVersion, 1);
  assert.equal(selected[0].processingContext.finalizedByBatchId, finalized.batchId);

  const pendingFinal = {
    batchId: "pending-final-delta",
    status: "pending",
    envelope: { payload: { schema: "pachi-tracker.delta-import" } },
    statusDetails: {},
  };
  const sameRun = selectProcessablePushRecords([pendingFinal, legacy]);
  assert.deepEqual(
    sameRun.map((record) => record.batchId),
    [legacy.batchId, pendingFinal.batchId],
  );

  const checked = structuredClone(legacy);
  checked.statusDetails.legacyReviewRecoveryVersion = 1;
  assert.equal(isLegacyRejectedReviewNotice(checked), false);
  const unrelated = structuredClone(legacy);
  unrelated.statusDetails.errors = ["different validation error"];
  assert.equal(isLegacyRejectedReviewNotice(unrelated), false);

  const futureSupported = selectProcessablePushRecords([deferred], {
    supportedPayloadSchemas: new Set(["pachi-tracker.future-import"]),
  });
  assert.equal(futureSupported.length, 1);
});

test("unknown payload schemas are deferred only after their digest is verified", async () => {
  const payload = {
    schema: "pachi-tracker.future-import",
    version: 1,
    source: "site-seven-windows",
    data: { value: 1 },
  };
  const envelope = {
    schema: "pachi-tracker.push-batch",
    version: 1,
    batchId: "future-envelope-1",
    createdAt: "2026-07-30T03:00:00.000Z",
    digest: await sha256Digest(payload),
    payload,
  };
  const deferred = await validateAndDecodePushEnvelope(envelope, {
    now: FIXED_NOW,
  });
  assert.equal(deferred.valid, false);
  assert.equal(deferred.kind, "unsupported");
  assert.equal(
    deferred.unsupportedPayloadSchema,
    "pachi-tracker.future-import",
  );

  envelope.payload.data.value = 2;
  const tampered = await validateAndDecodePushEnvelope(envelope, {
    now: FIXED_NOW,
  });
  assert.equal(tampered.valid, false);
  assert.equal(tampered.kind, null);
});
