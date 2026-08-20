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
export const REVIEW_NOTICE_SCHEMA = "pachi-tracker.review-notice";
export const PAIR_REQUEST_SCHEMA = "pachi-tracker.pair-request";
export const PAIR_RESPONSE_SCHEMA = "pachi-tracker.pair-response";
export const PUSH_SCHEMA_VERSION = 1;
export const LEGACY_REVIEW_RECOVERY_VERSION = 1;
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
const REVIEW_PAYLOAD_KEYS = new Set(["schema", "version", "source", "notice"]);
const REVIEW_NOTICE_KEYS = new Set([
  "jobId",
  "date",
  "storeName",
  "machineName",
  "analyzedAt",
  "sourceFingerprint",
  "pendingMachines",
  "blockingReasons",
]);
const REVIEW_FINGERPRINT_KEYS = new Set(["algorithm", "hash", "fileCount"]);
const REVIEW_MACHINE_KEYS = new Set(["machineNumber", "reasons"]);
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
  "estimatedRows",
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
const REVIEW_JOB_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const REVIEW_REASON = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MAX_ROWS = 500;
const MAX_STRING = 240;
const MAX_COUNTER = 100_000_000;
const MAX_ABS_DELTA = 10_000_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_PAIRING_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ESTIMATE_SOURCES = new Set([
  "short-3of4",
  "short-near-zero",
  "user-censored-top",
  "user-censored-bottom",
]);
const SUPPORTED_PAYLOAD_SCHEMAS = new Set([
  DELTA_IMPORT_SCHEMA,
  REVIEW_NOTICE_SCHEMA,
]);
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const PUSH_BATCH_STATUSES = new Set([
  "pending",
  "review",
  "resolved",
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

function validateEstimatedRows(value, rows, fingerprint, errors) {
  const path = "payload.scan.estimatedRows";
  if (!Array.isArray(value) || value.length < 1 || value.length > rows.length) {
    errors.push(`${path}: 1件以上かつ行数以下の配列が必要です`);
    return [];
  }
  const rowValues = new Map(rows.map((row) => [Number(row?.num), row?.val]));
  const seen = new Set();
  const normalized = [];
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 6) {
      errors.push(`${entryPath}: 6項目の配列が必要です`);
      return;
    }
    const machineNumber = entry[0];
    const estimatedValue = entry[1];
    const source = entry[2];
    if (
      !integerInRange(machineNumber, 1, 999_999)
      || !integerInRange(estimatedValue, -MAX_ABS_DELTA, MAX_ABS_DELTA)
      || !ESTIMATE_SOURCES.has(source)
      || seen.has(machineNumber)
      || rowValues.get(machineNumber) !== estimatedValue
    ) {
      errors.push(`${entryPath}: 元の行と一致する一意な推定値が必要です`);
      return;
    }
    seen.add(machineNumber);
    if (source === "user-censored-top" || source === "user-censored-bottom") {
      const approvedAt = entry[3];
      const boundaryValue = entry[4];
      const jobId = entry[5];
      const boundaryDirectionMatches = source === "user-censored-top"
        ? estimatedValue >= boundaryValue
        : estimatedValue <= boundaryValue;
      if (
        !isIsoTimestamp(approvedAt)
        || !integerInRange(boundaryValue, -MAX_ABS_DELTA, MAX_ABS_DELTA)
        || estimatedValue % 500 !== 0
        || !boundaryDirectionMatches
        || jobId !== `job-${fingerprint?.hash?.slice(0, 32)}`
      ) {
        errors.push(`${entryPath}: 承認日時・上限境界・元画像識別値が一致しません`);
        return;
      }
      normalized.push([
        machineNumber,
        estimatedValue,
        source,
        approvedAt,
        boundaryValue,
        jobId,
      ]);
      return;
    }
    if (entry[3] !== null || entry[4] !== null || entry[5] !== null) {
      errors.push(`${entryPath}: 自動推定に利用者承認項目は指定できません`);
      return;
    }
    normalized.push([machineNumber, estimatedValue, source, null, null, null]);
  });
  return normalized;
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

async function sha256Text(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error("SHA-256を利用できない環境です");
  const bytes = new TextEncoder().encode(String(value));
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
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
  const estimatedRows = sourceScan.estimatedRows === undefined
    ? []
    : validateEstimatedRows(sourceScan.estimatedRows, validRows, fingerprint, errors);
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
    rows: validRows.map((row) => {
      const estimate = estimatedRows.find(
        (entry) => entry[0] === Number(row.num) && entry[1] === row.val,
      );
      return {
        ...row,
        machineName: row.machineName || sourceScan.machineName.trim(),
        ...(estimate
          ? {
            estimated: true,
            valueSource: estimate[2].startsWith("user-censored-")
              ? "paired-windows-user-approved-estimate"
              : "paired-windows-estimate",
            estimateAudit: {
              source: estimate[2],
              ...(estimate[2].startsWith("user-censored-")
                ? {
                  approvedAt: estimate[3],
                  boundaryValue: estimate[4],
                  jobId: estimate[5],
                }
                : {}),
            },
          }
          : {}),
      };
    }),
    observedAt: sourceScan.observedAt,
    createdAt: sourceScan.observedAt,
    sourceFingerprint: fingerprint,
    analysisEngineVersion: sourceScan.analysisEngineVersion.trim(),
    ...(contextEvidence ? { contextEvidence } : {}),
    ...(estimatedRows.length ? { estimatedRows } : {}),
    importSource: "paired-windows-push",
  };
  return { valid: true, errors: [], scan };
}

export function decodeReviewNoticePayload(payload, { createdAt, now = Date.now() } = {}) {
  const errors = [];
  if (!isPlainObject(payload)) {
    return { valid: false, errors: ["payload: object required"], notice: null };
  }
  const extraPayloadKeys = unexpectedKeys(payload, REVIEW_PAYLOAD_KEYS);
  if (extraPayloadKeys.length) {
    errors.push(`payload: unsupported fields ${extraPayloadKeys.join(", ")}`);
  }
  if (payload.schema !== REVIEW_NOTICE_SCHEMA) {
    errors.push(`payload.schema: ${REVIEW_NOTICE_SCHEMA} required`);
  }
  if (payload.version !== PUSH_SCHEMA_VERSION) {
    errors.push("payload.version: 1 required");
  }
  if (payload.source !== "site-seven-windows") {
    errors.push("payload.source: site-seven-windows required");
  }

  const sourceNotice = payload.notice;
  if (!isPlainObject(sourceNotice)) {
    errors.push("payload.notice: object required");
    return { valid: false, errors, notice: null };
  }
  const extraNoticeKeys = unexpectedKeys(sourceNotice, REVIEW_NOTICE_KEYS);
  if (extraNoticeKeys.length) {
    errors.push(`payload.notice: unsupported fields ${extraNoticeKeys.join(", ")}`);
  }
  if (!REVIEW_JOB_ID.test(String(sourceNotice.jobId || ""))) {
    errors.push("payload.notice.jobId: valid job ID required");
  }
  if (!isCalendarDate(sourceNotice.date)) {
    errors.push("payload.notice.date: valid YYYY-MM-DD required");
  }
  for (const field of ["storeName", "machineName"]) {
    if (!isSizedString(sourceNotice[field]) || hasUnsafeText(sourceNotice[field])) {
      errors.push(`payload.notice.${field}: safe text required`);
    }
  }
  if (!isIsoTimestamp(sourceNotice.analyzedAt)) {
    errors.push("payload.notice.analyzedAt: ISO timestamp required");
  } else {
    if (isTooFarInFuture(sourceNotice.analyzedAt, now)) {
      errors.push("payload.notice.analyzedAt: future timestamp is not allowed");
    }
    if (isCalendarDate(sourceNotice.date)
      && sourceNotice.date > toJapanCalendarDate(sourceNotice.analyzedAt)) {
      errors.push("payload.notice.date: cannot be after the Japan analysis date");
    }
  }
  if (createdAt !== undefined && !isIsoTimestamp(createdAt)) {
    errors.push("createdAt: ISO timestamp required");
  } else if (createdAt !== undefined && isTooFarInFuture(createdAt, now)) {
    errors.push("createdAt: future timestamp is not allowed");
  }

  const sourceFingerprint = sourceNotice.sourceFingerprint;
  if (!isPlainObject(sourceFingerprint)) {
    errors.push("payload.notice.sourceFingerprint: object required");
  } else {
    const extraFingerprintKeys = unexpectedKeys(sourceFingerprint, REVIEW_FINGERPRINT_KEYS);
    if (extraFingerprintKeys.length) {
      errors.push(`payload.notice.sourceFingerprint: unsupported fields ${extraFingerprintKeys.join(", ")}`);
    }
    if (sourceFingerprint.algorithm !== "SHA-256") {
      errors.push("payload.notice.sourceFingerprint.algorithm: SHA-256 required");
    }
    if (!HEX_64.test(String(sourceFingerprint.hash || ""))) {
      errors.push("payload.notice.sourceFingerprint.hash: 64 hexadecimal characters required");
    }
    if (!integerInRange(sourceFingerprint.fileCount, 1, 64)) {
      errors.push("payload.notice.sourceFingerprint.fileCount: integer from 1 to 64 required");
    }
  }

  const blockingReasons = sourceNotice.blockingReasons;
  if (!Array.isArray(blockingReasons) || blockingReasons.length < 1 || blockingReasons.length > 500) {
    errors.push("payload.notice.blockingReasons: 1 to 500 safe reason codes required");
  } else if (blockingReasons.some((reason) => !REVIEW_REASON.test(String(reason || "")))) {
    errors.push("payload.notice.blockingReasons: invalid reason code");
  }

  const pendingMachines = sourceNotice.pendingMachines;
  const normalizedMachines = [];
  if (!Array.isArray(pendingMachines) || pendingMachines.length > 500) {
    errors.push("payload.notice.pendingMachines: 0 to 500 machines required");
  } else {
    const seen = new Set();
    pendingMachines.forEach((entry, index) => {
      const path = `payload.notice.pendingMachines[${index}]`;
      if (!isPlainObject(entry)) {
        errors.push(`${path}: object required`);
        return;
      }
      const extraMachineKeys = unexpectedKeys(entry, REVIEW_MACHINE_KEYS);
      if (extraMachineKeys.length) {
        errors.push(`${path}: unsupported fields ${extraMachineKeys.join(", ")}`);
      }
      const machineNumber = normalizeMachineNumber(entry.machineNumber);
      if (!machineNumber) {
        errors.push(`${path}.machineNumber: valid machine number required`);
      } else if (seen.has(machineNumber)) {
        errors.push(`${path}.machineNumber: duplicate machine number`);
      } else {
        seen.add(machineNumber);
      }
      if (!Array.isArray(entry.reasons)
        || entry.reasons.length < 1
        || entry.reasons.length > 50
        || entry.reasons.some((reason) => !REVIEW_REASON.test(String(reason || "")))) {
        errors.push(`${path}.reasons: 1 to 50 safe reason codes required`);
      }
      if (machineNumber && Array.isArray(entry.reasons)) {
        normalizedMachines.push({
          machineNumber,
          reasons: entry.reasons.map(String),
        });
      }
    });
  }

  if (errors.length) return { valid: false, errors, notice: null };
  return {
    valid: true,
    errors: [],
    notice: {
      jobId: String(sourceNotice.jobId),
      date: sourceNotice.date,
      storeName: sourceNotice.storeName.trim(),
      machineName: sourceNotice.machineName.trim(),
      analyzedAt: sourceNotice.analyzedAt,
      sourceFingerprint: {
        algorithm: "SHA-256",
        hash: sourceFingerprint.hash.toLowerCase(),
        fileCount: sourceFingerprint.fileCount,
      },
      pendingMachines: normalizedMachines,
      blockingReasons: blockingReasons.map(String),
    },
  };
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

  const isReviewNotice = envelope.payload.schema === REVIEW_NOTICE_SCHEMA;
  const isDeltaImport = envelope.payload.schema === DELTA_IMPORT_SCHEMA;

  let calculatedDigest;
  try {
    calculatedDigest = await sha256Digest(envelope.payload, cryptoApi);
  } catch {
    return { valid: false, errors: ["SHA-256検証を実行できませんでした"], envelope: null, scan: null };
  }
  if (!equalDigest(envelope.digest, calculatedDigest)) {
    return { valid: false, errors: ["内容が送信後に変化しているため取り込みません"], envelope: null, scan: null };
  }

  if (!isReviewNotice && !isDeltaImport) {
    const payloadSchema = envelope.payload.schema;
    return {
      valid: false,
      errors: ["payload.schema is not supported by this app version"],
      envelope: null,
      kind: "unsupported",
      unsupportedPayloadSchema: isSizedString(payloadSchema, {
        allowEmpty: false,
        max: MAX_STRING,
      }) && !hasUnsafeText(payloadSchema)
        ? payloadSchema
        : null,
      scan: null,
      reviewNotice: null,
      calculatedDigest,
    };
  }

  const decoded = isReviewNotice
    ? decodeReviewNoticePayload(envelope.payload, {
      createdAt: envelope.createdAt,
      now,
    })
    : decodeDeltaImportPayload(envelope.payload, {
      createdAt: envelope.createdAt,
      now,
    });
  if (!decoded.valid) {
    return {
      valid: false,
      errors: decoded.errors,
      envelope: null,
      kind: null,
      scan: null,
      reviewNotice: null,
    };
  }

  return {
    valid: true,
    errors: [],
    envelope,
    kind: isReviewNotice ? "review" : "delta",
    scan: decoded.scan || null,
    reviewNotice: decoded.notice || null,
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
    kind: result.kind || null,
    scan: result.scan,
    reviewNotice: result.reviewNotice || null,
    unsupportedPayloadSchema: result.unsupportedPayloadSchema || null,
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

function diagnosticSha256Hash(value) {
  const hash = String(value || "");
  return HEX_64.test(hash) ? hash.toLowerCase() : null;
}

function diagnosticEnvelopeDigest(value) {
  const match = /^sha256:([a-f0-9]{64})$/iu.exec(String(value || ""));
  return match ? `sha256:${match[1].toLowerCase()}` : null;
}

// This DTO deliberately copies only batch-level metadata. Keep raw envelopes,
// rows, and subscription details out of the diagnostics surface.
export function createPushInboxDiagnostic(record) {
  const payload = record?.envelope?.payload;
  const scan = payload?.scan;
  const notice = payload?.notice;
  const reasonCodes = Array.isArray(record?.statusDetails?.reasonCodes)
    ? record.statusDetails.reasonCodes.filter((reason) => typeof reason === "string").slice(0, 8)
    : [];

  return {
    batchId: typeof record?.batchId === "string" ? record.batchId : null,
    status: typeof record?.status === "string" ? record.status : null,
    reasonCodes,
    payloadSchema: typeof payload?.schema === "string" ? payload.schema : null,
    date: typeof scan?.date === "string"
      ? scan.date
      : (typeof notice?.date === "string" ? notice.date : null),
    jobId: typeof notice?.jobId === "string" ? notice.jobId : null,
    scanId: typeof scan?.id === "string" ? scan.id : null,
    sourceFingerprint: diagnosticSha256Hash(
      scan?.sourceFingerprint?.hash || notice?.sourceFingerprint?.hash,
    ),
    digest: diagnosticEnvelopeDigest(record?.envelope?.digest),
  };
}

export function orderPushInboxDiagnostics(diagnostics, { limit = 20 } = {}) {
  const safeLimit = integerInRange(limit, 1, 500) ? limit : 20;
  const source = Array.isArray(diagnostics) ? diagnostics : [];
  const pendingOrReview = source.filter((diagnostic) => (
    diagnostic?.status === "pending" || diagnostic?.status === "review"
  ));
  const completedOrOther = source.filter((diagnostic) => (
    diagnostic?.status !== "pending" && diagnostic?.status !== "review"
  ));
  return [...pendingOrReview, ...completedOrOther].slice(0, safeLimit);
}

export async function listPushInboxDiagnostics({ limit = 20 } = {}) {
  const records = await listPushInboxWithStatuses();
  return orderPushInboxDiagnostics(
    records.map(createPushInboxDiagnostic),
    { limit },
  );
}

export async function listPendingPushBatches({ limit = 500 } = {}) {
  const safeLimit = integerInRange(limit, 1, 500) ? limit : 500;
  const records = await listPushInboxWithStatuses();
  return records.filter((record) => record.status === "pending").slice(0, safeLimit);
}

function recordReasonCodes(record) {
  return Array.isArray(record?.statusDetails?.reasonCodes)
    ? record.statusDetails.reasonCodes.map((reason) => String(reason))
    : [];
}

function recordPayloadSchema(record) {
  const schema = record?.envelope?.payload?.schema;
  return typeof schema === "string" ? schema : "";
}

function rawReviewFingerprint(record) {
  const hash = record?.envelope?.payload?.notice?.sourceFingerprint?.hash;
  return HEX_64.test(String(hash || "")) ? String(hash).toLowerCase() : null;
}

function finalizedSourceEvidence(record) {
  if (!["imported", "duplicate"].includes(record?.status)) return null;
  if (recordPayloadSchema(record) !== DELTA_IMPORT_SCHEMA) return null;
  const scan = record?.envelope?.payload?.scan;
  const fingerprint = scan?.sourceFingerprint;
  const hash = String(fingerprint?.hash || "").toLowerCase();
  const statusHash = String(record?.statusDetails?.sourceFingerprint || "").toLowerCase();
  const fileHashes = Array.isArray(fingerprint?.fileHashes)
    ? fingerprint.fileHashes.map((value) => String(value).toLowerCase())
    : [];
  if (
    !HEX_64.test(hash)
    || statusHash !== hash
    || fingerprint?.algorithm !== "SHA-256"
    || !integerInRange(fingerprint?.fileCount, 1, 100)
    || fileHashes.length !== fingerprint.fileCount
    || new Set(fileHashes).size !== fileHashes.length
    || fileHashes.some((value) => !HEX_64.test(value))
    || !isCalendarDate(scan?.date)
    || !BATCH_ID.test(String(record?.batchId || ""))
  ) {
    return null;
  }
  return {
    batchId: String(record.batchId),
    date: scan.date,
    fileHashes: [...fileHashes].sort(),
    hash,
    status: record.status,
  };
}

function reviewSourceEvidence(record) {
  if (record?.status !== "review") return null;
  if (recordPayloadSchema(record) !== REVIEW_NOTICE_SCHEMA) return null;
  const notice = record?.envelope?.payload?.notice;
  const fingerprint = notice?.sourceFingerprint;
  const hash = String(fingerprint?.hash || "").toLowerCase();
  const statusHash = String(record?.statusDetails?.sourceFingerprint || "").toLowerCase();
  if (
    !HEX_64.test(hash)
    || statusHash !== hash
    || fingerprint?.algorithm !== "SHA-256"
    || !integerInRange(fingerprint?.fileCount, 1, 64)
    || !isCalendarDate(notice?.date)
    || !BATCH_ID.test(String(record?.batchId || ""))
  ) {
    return null;
  }
  return {
    batchId: String(record.batchId),
    date: notice.date,
    fileCount: fingerprint.fileCount,
    hash,
  };
}

function resolutionKey(date, hash) {
  return `${date}:${hash}`;
}

// Review notices intentionally contain no images or measured values. Older
// context splits could therefore leave one-file notices after the same source
// image had already become part of a verified final import. Rebuild only the
// SHA-256 source-set identifiers needed to prove that relationship.
export async function findSupersededReviewResolutions(
  records,
  { cryptoApi = globalThis.crypto } = {},
) {
  const sourceRecords = Array.isArray(records) ? records : [];
  const reviews = sourceRecords.map(reviewSourceEvidence).filter(Boolean);
  if (!reviews.length) return [];

  const reviewDates = new Set(reviews.map((review) => review.date));
  const finalized = sourceRecords
    .map(finalizedSourceEvidence)
    .filter((evidence) => evidence && reviewDates.has(evidence.date));
  if (!finalized.length) return [];

  const exactMatches = new Map();
  const singletonMatches = new Map();
  for (const evidence of finalized) {
    let aggregateHash;
    try {
      aggregateHash = await sha256Text(evidence.fileHashes.join("\n"), cryptoApi);
    } catch {
      continue;
    }
    // Do not use file coverage from an internally inconsistent final payload.
    if (aggregateHash !== evidence.hash) continue;
    const exactKey = resolutionKey(evidence.date, evidence.hash);
    if (!exactMatches.has(exactKey)) exactMatches.set(exactKey, evidence);

    for (const fileHash of evidence.fileHashes) {
      const singletonHash = await sha256Text(fileHash, cryptoApi);
      const singletonKey = resolutionKey(evidence.date, singletonHash);
      if (!singletonMatches.has(singletonKey)) {
        singletonMatches.set(singletonKey, evidence);
      }
    }
  }

  const resolutions = [];
  for (const review of reviews) {
    const key = resolutionKey(review.date, review.hash);
    const exact = exactMatches.get(key);
    const superset = review.fileCount === 1 ? singletonMatches.get(key) : null;
    const match = exact || superset;
    if (!match) continue;
    resolutions.push({
      batchId: review.batchId,
      sourceFingerprint: review.hash,
      resolvedByBatchId: match.batchId,
      resolvedAs: match.status,
      resolutionMatch: exact ? "exact-source-set" : "source-file-superset",
      supersedingSourceFingerprint: match.hash,
    });
  }
  return resolutions;
}

export function isLegacyRejectedReviewNotice(record) {
  const errors = Array.isArray(record?.statusDetails?.errors)
    ? record.statusDetails.errors.map((error) => String(error))
    : [];
  return (
    record?.status === "rejected"
    && recordPayloadSchema(record) === REVIEW_NOTICE_SCHEMA
    && recordReasonCodes(record).includes("invalid-envelope")
    && errors.some((error) => error.includes(DELTA_IMPORT_SCHEMA))
    && record?.statusDetails?.legacyReviewRecoveryVersion
      !== LEGACY_REVIEW_RECOVERY_VERSION
  );
}

export function selectProcessablePushRecords(
  records,
  {
    limit = 500,
    supportedPayloadSchemas = SUPPORTED_PAYLOAD_SCHEMAS,
  } = {},
) {
  const safeLimit = integerInRange(limit, 1, 500) ? limit : 500;
  const sourceRecords = Array.isArray(records) ? records : [];
  const supported = supportedPayloadSchemas instanceof Set
    ? supportedPayloadSchemas
    : new Set(supportedPayloadSchemas || []);
  const finalizedByFingerprint = new Map();
  sourceRecords.forEach((record) => {
    if (!["imported", "duplicate"].includes(record?.status)) return;
    const fingerprint = String(record?.statusDetails?.sourceFingerprint || "").toLowerCase();
    if (!HEX_64.test(fingerprint)) return;
    finalizedByFingerprint.set(fingerprint, String(record.batchId || ""));
  });

  const recoveryRecords = [];
  const pendingRecords = [];
  for (const record of sourceRecords) {
    if (record?.status === "pending") {
      const deferredForUpdate = recordReasonCodes(record)
        .includes("unsupported-payload-schema");
      if (deferredForUpdate && !supported.has(recordPayloadSchema(record))) continue;
      pendingRecords.push(record);
      continue;
    }
    if (!isLegacyRejectedReviewNotice(record)) continue;
    const fingerprint = rawReviewFingerprint(record);
    recoveryRecords.push({
      ...record,
      processingContext: {
        legacyReviewRecoveryVersion: LEGACY_REVIEW_RECOVERY_VERSION,
        finalizedByBatchId: fingerprint
          ? finalizedByFingerprint.get(fingerprint) || null
          : null,
        sourceFingerprint: fingerprint,
      },
    });
  }
  // Recover old review notices first. If a final delta is pending in the same
  // run, it then resolves the recovered review through the normal import path.
  return [...recoveryRecords, ...pendingRecords].slice(0, safeLimit);
}

export async function listProcessablePushBatches({ limit = 500 } = {}) {
  const records = await listPushInboxWithStatuses();
  return selectProcessablePushRecords(records, { limit });
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

export async function resolveReviewNoticesForFingerprint(
  sourceFingerprint,
  details = {},
  options = {},
) {
  const fingerprint = String(sourceFingerprint || "").toLowerCase();
  if (!HEX_64.test(fingerprint)) return 0;
  const records = await listPushInboxWithStatuses();
  const matches = records.filter((record) => (
    record.status === "review"
    && String(record.statusDetails?.sourceFingerprint || "").toLowerCase() === fingerprint
  ));
  for (const record of matches) {
    await markPushBatchStatus(record.batchId, "resolved", {
      ...details,
      sourceFingerprint: fingerprint,
    }, options);
  }
  return matches.length;
}

export async function resolveSupersededReviewNotices(
  details = {},
  options = {},
) {
  const records = await listPushInboxWithStatuses();
  const resolutions = await findSupersededReviewResolutions(records, options);
  for (const resolution of resolutions) {
    await markPushBatchStatus(resolution.batchId, "resolved", {
      ...details,
      reasonCodes: ["superseded-by-final-import"],
      sourceFingerprint: resolution.sourceFingerprint,
      resolvedByBatchId: resolution.resolvedByBatchId,
      resolvedAs: resolution.resolvedAs,
      resolutionMatch: resolution.resolutionMatch,
      supersedingSourceFingerprint: resolution.supersedingSourceFingerprint,
    }, options);
  }
  return resolutions.length;
}

export async function getPushInboxSummary() {
  const records = await listPushInboxWithStatuses();
  const summary = {
    total: records.length,
    pending: 0,
    review: 0,
    resolved: 0,
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
