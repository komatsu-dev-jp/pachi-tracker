import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canonicalJson,
  decodeDeltaImportPayload,
  isStrictAutoImportCandidate,
  parsePairingRequestText,
  sha256Digest,
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
