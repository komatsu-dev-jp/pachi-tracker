import { db } from "./db.js";
import {
  getPersistenceEpochSync,
  PERSISTENCE_EPOCH_META_KEY,
  withExclusivePersistence,
} from "./persistence.js";

export const PUSH_INBOX_DB_NAME = "pachi_tracker_db";
export const PUSH_INBOX_STORE_NAME = "pushInbox";
export const PUSH_ENVELOPE_SCHEMA = "pachi-tracker.push-batch";
export const DELTA_IMPORT_SCHEMA = "pachi-tracker.delta-import";
export const PAIR_REQUEST_SCHEMA = "pachi-tracker.pair-request";
export const PAIR_RESPONSE_SCHEMA = "pachi-tracker.pair-response";
export const PUSH_SCHEMA_VERSION = 1;
export const AUTO_HEADER_CONTEXT_ENGINE_VERSION =
  "windows-local-v1-auto-worker-header-v1";
export const AUTO_HEADER_CONTEXT_SOURCE = "windows-ocr-site7-header-consensus";
export const SUPPORTED_ANALYSIS_ENGINE_VERSIONS = Object.freeze([
  "windows-local-v1",
  "windows-local-v1-*",
]);
export const COMPACT_ROW_FIELDS = Object.freeze([
  "num",
  "val",
  "px",
  "confidencePermille",
  "machineName",
  "normalSpins",
  "totalStarts",
  "maxPayout",
  "cumulativeStarts",
  "firstHitCount",
]);

const ENVELOPE_KEYS = new Set([
  "schema",
  "version",
  "batchId",
  "createdAt",
  "digest",
  "payload",
]);
const PAYLOAD_KEYS = new Set(["schema", "version", "source", "compactRows", "scan"]);
const SCAN_KEYS = new Set([
  "id",
  "storeId",
  "storeName",
  "date",
  "event",
  "machineName",
  "sourceFingerprint",
  "analysisEngineVersion",
  "contextEvidence",
  "observedAt",
  "rows",
]);
const FINGERPRINT_KEYS = new Set(["algorithm", "hash", "fileCount", "fileHashes"]);
const CONTEXT_EVIDENCE_KEYS = new Set([
  "source",
  "version",
  "profileVotes",
  "headerFileCount",
]);
const OBJECT_ROW_KEYS = new Set([
  "num",
  "val",
  "px",
  "confidence",
  "confidencePermille",
  "machineName",
  "normalSpins",
  "totalStarts",
  "maxPayout",
  "cumulativeStarts",
  "firstHitCount",
  "status",
]);
const PAIR_REQUEST_KEYS = new Set([
  "schema",
  "version",
  "pairingId",
  "vapidPublicKey",
  "createdAt",
  "expiresAt",
  "senderLabel",
]);

const HEX_64 = /^[a-f0-9]{64}$/iu;
const BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MAX_ROWS = 500;
const MAX_STRING = 240;
const MAX_COUNTER = 100_000_000;
const MAX_ABS_DELTA = 10_000_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_PAIRING_LIFETIME_MS = 24 * 60 * 60 * 1000;
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const PUSH_BATCH_STATUSES = new Set([
  "pending",
  "imported",
  "duplicate",
  "rejected",
  "error",
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function unexpectedKeys(value, allowed) {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function isSizedString(value, { allowEmpty = true, max = MAX_STRING } = {}) {
  return typeof value === "string"
    && value.length <= max
    && (allowEmpty || value.trim().length > 0);
}

function hasUnsafeText(value) {
  if (typeof value !== "string") return false;
  if (BIDI_CONTROL_PATTERN.test(value)) return true;
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function normalizeNow(now) {
  const value = now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function isTooFarInFuture(value, now) {
  return Date.parse(value) > normalizeNow(now) + MAX_CLOCK_SKEW_MS;
}

function toJapanCalendarDate(value) {
  return new Date(Date.parse(value) + (9 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function isSupportedAnalysisEngineVersion(value) {
  const version = String(value || "").trim();
  return version === "windows-local-v1" || version.startsWith("windows-local-v1-");
}

function isCalendarDate(value) {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function integerInRange(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function normalizeMachineNumber(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,6}$/u.test(text)) return null;
  const number = Number(text);
  if (!integerInRange(number, 1, 999_999)) return null;
  return String(number);
}

function validateNullableCounter(value, field, errors, path) {
  if (value === null || value === undefined) return null;
  if (!integerInRange(value, 0, MAX_COUNTER)) {
    errors.push(`${path}.${field}: 0以上の整数またはnullが必要です`);
    return null;
  }
  return value;
}

function validateNullableMachineName(value, errors, path) {
  if (value === null || value === undefined) return null;
  if (!isSizedString(value) || hasUnsafeText(value)) {
    errors.push(`${path}.machineName: 240文字以内の文字列またはnullが必要です`);
    return null;
  }
  return value.trim();
}

function validateContextEvidence(value, errors) {
  const path = "payload.scan.contextEvidence";
  if (!isPlainObject(value)) {
    errors.push(`${path}: object required`);
    return null;
  }
  const extra = unexpectedKeys(value, CONTEXT_EVIDENCE_KEYS);
  if (extra.length) errors.push(`${path}: unsupported fields ${extra.join(", ")}`);
  if (value.source !== AUTO_HEADER_CONTEXT_SOURCE || hasUnsafeText(value.source)) {
    errors.push(`${path}.source: ${AUTO_HEADER_CONTEXT_SOURCE} required`);
  }
  if (value.version !== 1) {
    errors.push(`${path}.version: 1 required`);
  }
  if (!integerInRange(value.profileVotes, 2, 1024)) {
    errors.push(`${path}.profileVotes: integer from 2 to 1024 required`);
  }
  if (!integerInRange(value.headerFileCount, 1, 64)) {
    errors.push(`${path}.headerFileCount: integer from 1 to 64 required`);
  }
  if (errors.some((error) => error.startsWith(path))) return null;
  return {
    source: AUTO_HEADER_CONTEXT_SOURCE,
    version: 1,
    profileVotes: value.profileVotes,
    headerFileCount: value.headerFileCount,
  };
}

export function hasTrustedHeaderContextEvidence(scan) {
  if (scan?.analysisEngineVersion !== AUTO_HEADER_CONTEXT_ENGINE_VERSION) return false;
  const evidence = scan?.contextEvidence;
  return isPlainObject(evidence)
    && unexpectedKeys(evidence, CONTEXT_EVIDENCE_KEYS).length === 0
    && evidence.source === AUTO_HEADER_CONTEXT_SOURCE
    && !hasUnsafeText(evidence.source)
    && evidence.version === 1
    && integerInRange(evidence.profileVotes, 2, 1024)
    && integerInRange(evidence.headerFileCount, 1, 64);
}

function normalizeRow(rawRow, index, compactRows, errors) {
  const path = `payload.scan.rows[${index}]`;
  let source;

  if (compactRows) {
    if (!Array.isArray(rawRow) || rawRow.length !== COMPACT_ROW_FIELDS.length) {
      errors.push(`${path}: compact行は10項目である必要があります`);
      return null;
    }
    source = Object.fromEntries(COMPACT_ROW_FIELDS.map((field, fieldIndex) => [
      field,
      rawRow[fieldIndex],
    ]));
  } else {
    if (!isPlainObject(rawRow)) {
      errors.push(`${path}: オブジェクト形式である必要があります`);
      return null;
    }
    const extra = unexpectedKeys(rawRow, OBJECT_ROW_KEYS);
    if (extra.length) errors.push(`${path}: 未対応の項目 ${extra.join(", ")}`);
    source = rawRow;
    if (source.status !== "ok") {
      errors.push(`${path}.status: okである必要があります`);
    }
  }

  const num = normalizeMachineNumber(source.num);
  if (num === null) errors.push(`${path}.num: 1〜999999の台番号が必要です`);

  const val = source.val;
  if (!integerInRange(val, -MAX_ABS_DELTA, MAX_ABS_DELTA)) {
    errors.push(`${path}.val: 有効な整数の差玉が必要です`);
  }

  const px = source.px;
  if (!integerInRange(px, 0, MAX_COUNTER)) {
    errors.push(`${path}.px: 0以上の整数が必要です`);
  }

  let confidencePermille = source.confidencePermille;
  if (!compactRows && source.confidence !== undefined) {
    if (source.confidencePermille !== undefined) {
      errors.push(`${path}: confidenceとconfidencePermilleは同時に指定できません`);
    } else if (typeof source.confidence !== "number"
      || !Number.isFinite(source.confidence)
      || source.confidence < 0
      || source.confidence > 1) {
      errors.push(`${path}.confidence: 0〜1の数値が必要です`);
    } else {
      confidencePermille = Math.round(source.confidence * 1000);
    }
  }
  if (!integerInRange(confidencePermille, 0, 1000)) {
    errors.push(`${path}.confidencePermille: 0〜1000の整数が必要です`);
  }

  const machineName = validateNullableMachineName(source.machineName, errors, path);
  const normalSpins = validateNullableCounter(source.normalSpins, "normalSpins", errors, path);
  const totalStarts = validateNullableCounter(source.totalStarts, "totalStarts", errors, path);
  const maxPayout = validateNullableCounter(source.maxPayout, "maxPayout", errors, path);
  const cumulativeStarts = validateNullableCounter(
    source.cumulativeStarts,
    "cumulativeStarts",
    errors,
    path,
  );
  const firstHitCount = validateNullableCounter(source.firstHitCount, "firstHitCount", errors, path);

  if (errors.some((error) => error.startsWith(path))) return null;

  return {
    num,
    val,
    px,
    confidence: confidencePermille / 1000,
    confidencePermille,
    status: "ok",
    machineNumberVerified: true,
    machineNumberSource: "paired-windows",
    valueSource: "paired-windows",
    machineName,
    normalSpins,
    totalStarts,
    maxPayout,
    cumulativeStarts,
    firstHitCount,
  };
}

function validateFingerprint(value, errors) {
  const path = "payload.scan.sourceFingerprint";
  if (!isPlainObject(value)) {
    errors.push(`${path}: 必須です`);
    return null;
  }
  const extra = unexpectedKeys(value, FINGERPRINT_KEYS);
  if (extra.length) errors.push(`${path}: 未対応の項目 ${extra.join(", ")}`);
  if (value.algorithm !== "SHA-256") errors.push(`${path}.algorithm: SHA-256が必要です`);
  if (!HEX_64.test(value.hash || "")) errors.push(`${path}.hash: SHA-256形式ではありません`);
  if (!integerInRange(value.fileCount, 1, 100)) {
    errors.push(`${path}.fileCount: 1〜100の整数が必要です`);
  }
  if (!Array.isArray(value.fileHashes)
    || value.fileHashes.length !== value.fileCount
    || !value.fileHashes.every((hash) => HEX_64.test(hash))) {
    errors.push(`${path}.fileHashes: ファイル数と一致するSHA-256一覧が必要です`);
  }
  if (errors.some((error) => error.startsWith(path))) return null;
  return {
    algorithm: "SHA-256",
    hash: value.hash.toLowerCase(),
    fileCount: value.fileCount,
    fileHashes: value.fileHashes.map((hash) => hash.toLowerCase()),
  };
}

export function canonicalJson(value) {
  const stack = new Set();

  const encode = (item) => {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("正規化JSONに非有限数は使用できません");
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) {
      if (stack.has(item)) throw new TypeError("循環参照は使用できません");
      stack.add(item);
      const encoded = `[${item.map((entry) => {
        if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") {
          throw new TypeError("正規化JSONに未定義値は使用できません");
        }
        return encode(entry);
      }).join(",")}]`;
      stack.delete(item);
      return encoded;
    }
    if (!isPlainObject(item)) throw new TypeError("正規化JSONには通常のオブジェクトが必要です");
    if (stack.has(item)) throw new TypeError("循環参照は使用できません");
    stack.add(item);
    const keys = Object.keys(item).sort();
    const encoded = `{${keys.map((key) => {
      const entry = item[key];
      if (entry === undefined || typeof entry === "function" || typeof entry === "symbol") {
        throw new TypeError("正規化JSONに未定義値は使用できません");
      }
      return `${JSON.stringify(key)}:${encode(entry)}`;
    }).join(",")}}`;
    stack.delete(item);
    return encoded;
  };

  return encode(value);
}

export async function sha256Digest(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error("SHA-256を利用できない環境です");
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function equalDigest(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export function decodeDeltaImportPayload(payload, { createdAt, now = Date.now() } = {}) {
  const errors = [];
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ["payload: オブジェクトが必要です"], scan: null };
  }
  const extraPayloadKeys = unexpectedKeys(payload, PAYLOAD_KEYS);
  if (extraPayloadKeys.length) errors.push(`payload: 未対応の項目 ${extraPayloadKeys.join(", ")}`);
  if (payload.schema !== DELTA_IMPORT_SCHEMA) errors.push(`payload.schema: ${DELTA_IMPORT_SCHEMA}が必要です`);
  if (payload.version !== PUSH_SCHEMA_VERSION) errors.push("payload.version: 1が必要です");
  if (payload.source !== "site-seven-windows") {
    errors.push("payload.source: site-seven-windowsが必要です");
  }
  if (payload.compactRows !== undefined && typeof payload.compactRows !== "boolean") {
    errors.push("payload.compactRows: 真偽値が必要です");
  }

  const sourceScan = payload.scan;
  if (!isPlainObject(sourceScan)) {
    errors.push("payload.scan: オブジェクトが必要です");
    return { valid: false, errors, scan: null };
  }
  const extraScanKeys = unexpectedKeys(sourceScan, SCAN_KEYS);
  if (extraScanKeys.length) errors.push(`payload.scan: 未対応の項目 ${extraScanKeys.join(", ")}`);

  if (!BATCH_ID.test(String(sourceScan.id || ""))) {
    errors.push("payload.scan.id: 有効なIDが必要です");
  }
  if (sourceScan.storeId !== null
    && sourceScan.storeId !== undefined
    && (
      !isSizedString(String(sourceScan.storeId), { allowEmpty: false, max: 120 })
      || hasUnsafeText(String(sourceScan.storeId))
    )) {
    errors.push("payload.scan.storeId: 120文字以内の値またはnullが必要です");
  }
  if (!isSizedString(sourceScan.storeName) || hasUnsafeText(sourceScan.storeName)) {
    errors.push("payload.scan.storeName: 240文字以内の文字列が必要です");
  }
  if (!isCalendarDate(sourceScan.date)) errors.push("payload.scan.date: 実在するYYYY-MM-DDが必要です");
  if (!isSizedString(sourceScan.event) || hasUnsafeText(sourceScan.event)) {
    errors.push("payload.scan.event: 安全な240文字以内の文字列が必要です");
  }
  if (!isSizedString(sourceScan.machineName) || hasUnsafeText(sourceScan.machineName)) {
    errors.push("payload.scan.machineName: 240文字以内の文字列が必要です");
  }
  if (!isSizedString(sourceScan.analysisEngineVersion, { allowEmpty: false, max: 120 })
    || hasUnsafeText(sourceScan.analysisEngineVersion)
    || !isSupportedAnalysisEngineVersion(sourceScan.analysisEngineVersion)) {
    errors.push("payload.scan.analysisEngineVersion: 対応しているWindowsローカル解析版が必要です");
  }
  const contextEvidence = sourceScan.contextEvidence === undefined
    ? null
    : validateContextEvidence(sourceScan.contextEvidence, errors);
  if (!isIsoTimestamp(sourceScan.observedAt)) {
    errors.push("payload.scan.observedAt: ISO日時が必要です");
  } else {
    if (isTooFarInFuture(sourceScan.observedAt, now)) {
      errors.push("payload.scan.observedAt: 端末時刻より5分を超えて未来の日時は使用できません");
    }
    if (isCalendarDate(sourceScan.date)
      && sourceScan.date > toJapanCalendarDate(sourceScan.observedAt)) {
      errors.push("payload.scan.date: 画像の観測日時より未来の日付は使用できません");
    }
  }
  if (createdAt !== undefined && !isIsoTimestamp(createdAt)) {
    errors.push("createdAt: ISO日時が必要です");
  } else if (createdAt !== undefined && isTooFarInFuture(createdAt, now)) {
    errors.push("createdAt: 端末時刻より5分を超えて未来の日時は使用できません");
  }

  const fingerprint = validateFingerprint(sourceScan.sourceFingerprint, errors);
  if (!Array.isArray(sourceScan.rows)
    || sourceScan.rows.length < 1
    || sourceScan.rows.length > MAX_ROWS) {
    errors.push(`payload.scan.rows: 1〜${MAX_ROWS}行が必要です`);
  }

  const rows = Array.isArray(sourceScan.rows)
    ? sourceScan.rows.map((row, index) => normalizeRow(
      row,
      index,
      payload.compactRows === true,
      errors,
    ))
    : [];
  const validRows = rows.filter(Boolean);
  const duplicates = validRows
    .map((row) => row.num)
    .filter((num, index, values) => values.indexOf(num) !== index);
  if (duplicates.length) {
    errors.push(`payload.scan.rows: 台番号が重複しています (${[...new Set(duplicates)].join(", ")})`);
  }

  if (errors.length) return { valid: false, errors, scan: null };

  const scan = {
    id: String(sourceScan.id),
    storeId: sourceScan.storeId ?? null,
    storeName: sourceScan.storeName.trim(),
    date: sourceScan.date,
    event: sourceScan.event.trim(),
    machineName: sourceScan.machineName.trim(),
    rows: validRows.map((row) => ({
      ...row,
      machineName: row.machineName || sourceScan.machineName.trim(),
    })),
    observedAt: sourceScan.observedAt,
    createdAt: sourceScan.observedAt,
    sourceFingerprint: fingerprint,
    analysisEngineVersion: sourceScan.analysisEngineVersion.trim(),
    ...(contextEvidence ? { contextEvidence } : {}),
    importSource: "paired-windows-push",
  };
  return { valid: true, errors: [], scan };
}

export function validatePushEnvelopeShape(envelope, { now = Date.now() } = {}) {
  const errors = [];
  if (!isPlainObject(envelope)) {
    return { valid: false, errors: ["受信内容がオブジェクトではありません"] };
  }
  const extra = unexpectedKeys(envelope, ENVELOPE_KEYS);
  if (extra.length) errors.push(`未対応の項目 ${extra.join(", ")}`);
  if (envelope.schema !== PUSH_ENVELOPE_SCHEMA) {
    errors.push(`schemaは${PUSH_ENVELOPE_SCHEMA}である必要があります`);
  }
  if (envelope.version !== PUSH_SCHEMA_VERSION) errors.push("versionは1である必要があります");
  if (!BATCH_ID.test(String(envelope.batchId || ""))) errors.push("batchIdが不正です");
  if (!isIsoTimestamp(envelope.createdAt)) {
    errors.push("createdAtが不正です");
  } else if (isTooFarInFuture(envelope.createdAt, now)) {
    errors.push("createdAtが端末時刻より5分を超えて未来です");
  }
  if (!/^sha256:[a-f0-9]{64}$/iu.test(String(envelope.digest || ""))) {
    errors.push("digestがSHA-256形式ではありません");
  }
  if (!isPlainObject(envelope.payload)) errors.push("payloadがありません");
  return { valid: errors.length === 0, errors };
}

export async function verifyAndDecodePushEnvelope(
  envelope,
  { cryptoApi = globalThis.crypto, now = Date.now() } = {},
) {
  const shape = validatePushEnvelopeShape(envelope, { now });
  if (!shape.valid) return { valid: false, errors: shape.errors, envelope: null, scan: null };

  const decoded = decodeDeltaImportPayload(envelope.payload, {
    createdAt: envelope.createdAt,
    now,
  });
  if (!decoded.valid) {
    return { valid: false, errors: decoded.errors, envelope: null, scan: null };
  }

  let calculatedDigest;
  try {
    calculatedDigest = await sha256Digest(envelope.payload, cryptoApi);
  } catch {
    return { valid: false, errors: ["SHA-256検証を実行できませんでした"], envelope: null, scan: null };
  }
  if (!equalDigest(envelope.digest, calculatedDigest)) {
    return { valid: false, errors: ["内容が送信後に変化しているため取り込みません"], envelope: null, scan: null };
  }

  return {
    valid: true,
    errors: [],
    envelope,
    scan: decoded.scan,
    calculatedDigest,
  };
}

// 起動時processor向けの安定した公開API。
export async function validateAndDecodePushEnvelope(
  envelope,
  options = {},
) {
  const result = await verifyAndDecodePushEnvelope(envelope, options);
  const safeBatchId = BATCH_ID.test(String(envelope?.batchId || ""))
    ? String(envelope.batchId)
    : null;
  return {
    valid: result.valid,
    errors: result.errors,
    batchId: safeBatchId,
    scan: result.scan,
  };
}

export function isStrictAutoImportCandidate(scan, { minimumConfidence = 0.7 } = {}) {
  if (!scan || !Array.isArray(scan.rows) || scan.rows.length === 0) return false;
  if (!scan.sourceFingerprint || !HEX_64.test(scan.sourceFingerprint.hash || "")) return false;
  const seen = new Set();
  return scan.rows.every((row) => {
    const number = normalizeMachineNumber(row?.num);
    if (!number || seen.has(number)) return false;
    seen.add(number);
    return row.status === "ok"
      && Number.isInteger(row.val)
      && Number.isInteger(row.px)
      && typeof row.confidence === "number"
      && row.confidence >= minimumConfidence
      && row.confidence <= 1
      && [
        row.cumulativeStarts,
        row.normalSpins,
        row.firstHitCount,
        row.maxPayout,
        row.totalStarts,
      ].every((value) => Number.isInteger(value) && value >= 0);
  });
}

export async function ensurePushInboxReady() {
  await db.open();
  if (!db.tables.some((table) => table.name === PUSH_INBOX_STORE_NAME)) {
    throw new Error("Push受信箱を準備できませんでした");
  }
  return true;
}

export async function listPushInboxRecords({ limit = 100 } = {}) {
  const safeLimit = integerInRange(limit, 1, 500) ? limit : 100;
  await ensurePushInboxReady();
  return db.pushInbox.orderBy("receivedAt").reverse().limit(safeLimit).toArray();
}

export async function getPushInboxRecord(batchId) {
  if (!BATCH_ID.test(String(batchId || ""))) return null;
  await ensurePushInboxReady();
  return db.pushInbox.get(String(batchId));
}

function sanitizeStatusDetails(details) {
  if (!isPlainObject(details)) return {};
  const serialized = JSON.stringify(details);
  if (serialized.length > 8_192) throw new Error("処理結果の詳細が大きすぎます");
  const parsed = JSON.parse(serialized);
  if (!isPlainObject(parsed)) return {};
  return parsed;
}

async function listPushInboxWithStatuses() {
  await ensurePushInboxReady();
  const [records, statuses] = await Promise.all([
    db.pushInbox.orderBy("receivedAt").reverse().toArray(),
    db.pushInboxStatus.toArray(),
  ]);
  const statusByBatchId = new Map(statuses.map((entry) => [String(entry.batchId), entry]));
  return records.map((record) => {
    const sidecar = statusByBatchId.get(String(record.batchId));
    return {
      ...record,
      // pushInboxの受信原本は書き換えず、別テーブルの状態を画面上で合成する。
      status: sidecar?.status || record.status || "pending",
      statusUpdatedAt: sidecar?.updatedAt || null,
      statusDetails: sidecar?.details || {},
    };
  });
}

export async function listPendingPushBatches({ limit = 500 } = {}) {
  const safeLimit = integerInRange(limit, 1, 500) ? limit : 500;
  const records = await listPushInboxWithStatuses();
  return records.filter((record) => record.status === "pending").slice(0, safeLimit);
}

export async function markPushBatchStatus(
  batchId,
  status,
  details = {},
  { signal, expectedEpoch } = {},
) {
  const normalizedBatchId = String(batchId || "");
  if (!BATCH_ID.test(normalizedBatchId)) throw new Error("batchIdが不正です");
  if (!PUSH_BATCH_STATUSES.has(status)) throw new Error("未対応の処理状態です");
  await ensurePushInboxReady();
  const safeDetails = sanitizeStatusDetails(details);
  const requiredEpoch = expectedEpoch || getPersistenceEpochSync();
  return withExclusivePersistence(async () => {
    if (signal?.aborted) {
      throw signal.reason || new DOMException("処理を中止しました", "AbortError");
    }
    return db.transaction("rw", db.meta, db.pushInbox, db.pushInboxStatus, async () => {
      const currentEpoch = await db.meta.get(PERSISTENCE_EPOCH_META_KEY);
      if (!requiredEpoch || currentEpoch?.value !== requiredEpoch) {
        throw new DOMException("処理を中止しました", "AbortError");
      }
      const original = await db.pushInbox.get(normalizedBatchId);
      if (!original) throw new Error("対象の受信データがありません");
      if (signal?.aborted) {
        throw signal.reason || new DOMException("処理を中止しました", "AbortError");
      }
      const record = {
        batchId: normalizedBatchId,
        status,
        updatedAt: new Date().toISOString(),
        details: safeDetails,
      };
      // 受信原本とは別の状態テーブルだけを更新する。原本・既存解析記録は変更しない。
      await db.pushInboxStatus.put(record);
      return record;
    });
  }, { signal });
}

export async function getPushInboxSummary() {
  const records = await listPushInboxWithStatuses();
  const summary = {
    total: records.length,
    pending: 0,
    imported: 0,
    duplicate: 0,
    rejected: 0,
    error: 0,
  };
  records.forEach((record) => {
    if (PUSH_BATCH_STATUSES.has(record.status)) summary[record.status] += 1;
    else summary.pending += 1;
  });
  return summary;
}

export function isHomeScreenPwa({
  matchMedia = globalThis.matchMedia,
  navigatorRef = globalThis.navigator,
} = {}) {
  return Boolean(
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches)
    || navigatorRef?.standalone === true,
  );
}

export function base64UrlToBytes(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("VAPID公開鍵が不正です");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/") + padding;
  const binary = globalThis.atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) {
    throw new Error("VAPID公開鍵はP-256非圧縮形式である必要があります");
  }
  return bytes;
}

export function parsePairingRequestText(text, { now = Date.now() } = {}) {
  if (typeof text !== "string" || text.length === 0 || text.length > 32_768) {
    throw new Error(".pachipairファイルのサイズが不正です");
  }
  let request;
  try {
    request = JSON.parse(text);
  } catch {
    throw new Error(".pachipairファイルをJSONとして読み取れません");
  }
  if (!isPlainObject(request)) throw new Error("連携リクエストの形式が不正です");
  const extra = unexpectedKeys(request, PAIR_REQUEST_KEYS);
  if (extra.length) throw new Error(`連携リクエストに未対応の項目があります: ${extra.join(", ")}`);
  if (request.schema !== PAIR_REQUEST_SCHEMA || request.version !== PUSH_SCHEMA_VERSION) {
    throw new Error("パチトラッカー用の連携リクエストではありません");
  }
  if (!BATCH_ID.test(String(request.pairingId || ""))) throw new Error("pairingIdが不正です");
  base64UrlToBytes(request.vapidPublicKey);
  if (!isIsoTimestamp(request.createdAt)) {
    throw new Error("連携リクエストの作成日時が不正です");
  }
  if (!isIsoTimestamp(request.expiresAt)) throw new Error("連携リクエストの期限が不正です");
  const nowMs = normalizeNow(now);
  const createdAtMs = Date.parse(request.createdAt);
  const expiresAtMs = Date.parse(request.expiresAt);
  if (createdAtMs > nowMs + MAX_CLOCK_SKEW_MS) {
    throw new Error("連携リクエストの作成日時が端末時刻より5分を超えて未来です");
  }
  if (expiresAtMs <= nowMs) throw new Error("この連携リクエストは期限切れです");
  if (expiresAtMs <= createdAtMs) throw new Error("連携リクエストの期限が作成日時より後ではありません");
  if (expiresAtMs - createdAtMs > MAX_PAIRING_LIFETIME_MS) {
    throw new Error("連携リクエストの有効期間は24時間以内である必要があります");
  }
  if (request.senderLabel !== undefined && !isSizedString(request.senderLabel, { max: 120 })) {
    throw new Error("送信元名が長すぎます");
  }
  return {
    schema: PAIR_REQUEST_SCHEMA,
    version: PUSH_SCHEMA_VERSION,
    pairingId: String(request.pairingId),
    vapidPublicKey: request.vapidPublicKey,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    ...(request.senderLabel ? { senderLabel: request.senderLabel.trim() } : {}),
  };
}

function sameBytes(left, right) {
  const a = new Uint8Array(left || []);
  const b = new Uint8Array(right || []);
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export async function subscribeFromPairingRequest(
  request,
  {
    registration = null,
    notificationApi = globalThis.Notification,
    navigatorRef = globalThis.navigator,
    requireStandalone = true,
    now = Date.now(),
  } = {},
) {
  const validatedRequest = parsePairingRequestText(JSON.stringify(request), { now });
  if (requireStandalone && !isHomeScreenPwa({ navigatorRef })) {
    throw new Error("iPhoneのホーム画面へ追加したパチトラッカーから実行してください");
  }
  if (!notificationApi?.requestPermission) throw new Error("この端末はWeb Pushに対応していません");
  if (!navigatorRef?.serviceWorker || !globalThis.PushManager) {
    throw new Error("この端末はWeb Pushに対応していません");
  }
  const key = base64UrlToBytes(validatedRequest.vapidPublicKey);
  const permission = notificationApi.permission === "granted"
    ? "granted"
    : await notificationApi.requestPermission();
  if (permission !== "granted") throw new Error("通知が許可されなかったため連携できません");

  await ensurePushInboxReady();
  const readyRegistration = registration || await navigatorRef.serviceWorker.ready;
  const current = await readyRegistration.pushManager.getSubscription();
  if (current) {
    if (!sameBytes(current.options?.applicationServerKey, key)) {
      throw new Error("別のWindowsと連携済みです。先に現在の連携を解除してください");
    }
    return current;
  }
  return readyRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
}

export function createPairingResponse(
  request,
  subscription,
  {
    origin = globalThis.location?.origin || "",
    scope = "",
    now = new Date(),
  } = {},
) {
  const serialized = subscription?.toJSON?.();
  if (!serialized
    || typeof serialized.endpoint !== "string"
    || !serialized.endpoint.startsWith("https://")
    || !isPlainObject(serialized.keys)
    || !isSizedString(serialized.keys.p256dh, { allowEmpty: false, max: 256 })
    || !isSizedString(serialized.keys.auth, { allowEmpty: false, max: 256 })) {
    throw new Error("Push購読情報を安全に書き出せませんでした");
  }
  return {
    schema: PAIR_RESPONSE_SCHEMA,
    version: PUSH_SCHEMA_VERSION,
    pairingId: request.pairingId,
    createdAt: now.toISOString(),
    appOrigin: origin,
    serviceWorkerScope: scope,
    vapidPublicKey: request.vapidPublicKey,
    subscription: {
      endpoint: serialized.endpoint,
      expirationTime: serialized.expirationTime ?? null,
      keys: {
        p256dh: serialized.keys.p256dh,
        auth: serialized.keys.auth,
      },
    },
  };
}

export function buildPairingResponseFile(response) {
  const safeId = String(response?.pairingId || "pairing").replace(/[^A-Za-z0-9._-]/gu, "_");
  const filename = `pachi-tracker-${safeId}-response.pachipair`;
  const file = new File(
    [`${JSON.stringify(response, null, 2)}\n`],
    filename,
    { type: "application/json" },
  );
  return { file, filename };
}

export async function sharePairingResponse(
  response,
  { navigatorRef = globalThis.navigator } = {},
) {
  const { file } = buildPairingResponseFile(response);
  if (!navigatorRef?.share || !navigatorRef?.canShare?.({ files: [file] })) {
    throw new Error("この端末では共有シートへ書き出せません");
  }
  await navigatorRef.share({
    title: "パチトラッカー Windows連携",
    text: "この応答ファイルを連携するWindowsへ送ってください。",
    files: [file],
  });
}

export async function savePairingResponseFile(
  response,
  { windowRef = globalThis.window } = {},
) {
  if (typeof windowRef?.showSaveFilePicker !== "function") {
    throw new Error("この端末では保存先を選ぶ機能を利用できません");
  }
  const { file, filename } = buildPairingResponseFile(response);
  const handle = await windowRef.showSaveFilePicker({
    suggestedName: filename,
    types: [{
      description: "Pachi Tracker pairing response",
      accept: { "application/json": [".pachipair"] },
    }],
  });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
}

export function downloadPairingResponse(
  response,
  {
    documentRef = globalThis.document,
    urlApi = globalThis.URL,
  } = {},
) {
  if (!documentRef?.body || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL) {
    throw new Error("この端末ではダウンロードを利用できません");
  }
  const { file, filename } = buildPairingResponseFile(response);
  const url = urlApi.createObjectURL(file);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => urlApi.revokeObjectURL(url), 1000);
}

export async function unsubscribeFromPush({
  registration = null,
  navigatorRef = globalThis.navigator,
} = {}) {
  if (!navigatorRef?.serviceWorker) return false;
  const readyRegistration = registration || await navigatorRef.serviceWorker.ready;
  const subscription = await readyRegistration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}
