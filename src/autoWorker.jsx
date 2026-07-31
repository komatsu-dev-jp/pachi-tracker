/* eslint-disable react-refresh/only-export-components */

const AUTO_WORKER_PROTOCOL_VERSION = 1;
const DEFAULT_JOB_ENDPOINT = "/api/auto-worker/jobs/next";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_JOB_FILES = 64;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_JOB_BYTES = 256 * 1024 * 1024;
const MAX_OCR_HINT_BYTES = 16 * 1024 * 1024;
const MAX_OCR_HINT_SUMMARY_BYTES = 256 * 1024;
const ACCEPTED_KINDS = new Set(["image", "pdf", "csv"]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const BOUNDED_DELTA_APPROVAL_SCHEMA =
  "site7-push-bridge.bounded-delta-approval";
const BOUNDED_DELTA_APPROVAL_METHOD =
  "explicit-user-confirmation";
const BOUNDED_DELTA_STANDING_POLICY_METHOD =
  "standing-user-overflow-policy";
const BOUNDED_DELTA_APPROVAL_METHODS = new Set([
  BOUNDED_DELTA_APPROVAL_METHOD,
  BOUNDED_DELTA_STANDING_POLICY_METHOD,
]);
const REVIEW_DELTA_APPROVAL_SCHEMA =
  "site7-push-bridge.review-delta-approval";
const REVIEW_DELTA_APPROVAL_METHOD =
  "explicit-user-confirmation";
const BOUNDED_DELTA_APPROVAL_KEYS = new Set([
  "schema",
  "version",
  "jobId",
  "aggregateFingerprint",
  "machineNumber",
  "value",
  "approvedAt",
  "approvalMethod",
]);
const REVIEW_DELTA_APPROVAL_KEYS = new Set([
  "schema",
  "version",
  "jobId",
  "aggregateFingerprint",
  "machineNumber",
  "value",
  "approvedAt",
  "approvalMethod",
]);
const USER_APPROVABLE_REVIEW_REASONS = new Set([
  "short-series",
  "faint-series",
]);

export const AUTO_WORKER_POLICY = Object.freeze({
  localhostOnly: true,
  persistsLocally: false,
  deletesSourceFiles: false,
  overwritesAppData: false,
});

function stringValue(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function safeJobId(value) {
  const jobId = stringValue(value, 200);
  if (!jobId || !/^[\p{L}\p{N}._:-]+$/u.test(jobId)) {
    throw new Error("jobIdが未設定、または使用できない形式です");
  }
  return jobId;
}

function safeFileName(value, fallback) {
  const cleaned = Array.from(stringValue(value || fallback, 255))
    .map((character) => {
      const code = character.charCodeAt(0);
      return character === "/" || character === "\\" || code < 32 || code === 127
        ? "_"
        : character;
    })
    .join("");
  return cleaned || fallback;
}

function normalizeOrigin(originLike) {
  const raw = typeof originLike === "string"
    ? originLike
    : originLike?.origin;
  if (!raw) throw new Error("自動解析ページの接続元を確認できません");
  return new URL(raw).origin;
}

export function isLoopbackHostname(hostname) {
  const normalized = stringValue(hostname, 255)
    .toLowerCase()
    .replace(/^\[|\]$/gu, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "::1"
    || /^127(?:\.\d{1,3}){3}$/u.test(normalized);
}

export function requireLoopbackLocation(locationLike) {
  const hostname = locationLike?.hostname;
  if (!isLoopbackHostname(hostname)) {
    throw new Error("自動解析はこのWindows内のlocalhostから開いた場合だけ実行できます");
  }
  return true;
}

export function resolveSameOriginUrl(value, originLike) {
  const origin = normalizeOrigin(originLike);
  const url = new URL(stringValue(value, 2048), `${origin}/`);
  if (!["http:", "https:"].includes(url.protocol)
    || url.origin !== origin
    || url.username
    || url.password) {
    throw new Error("localhost以外のファイルや送信先は使用できません");
  }
  return url.href;
}

function inferFileKind(name, mediaType, declaredKind = "") {
  const explicit = stringValue(declaredKind, 20).toLowerCase();
  if (ACCEPTED_KINDS.has(explicit)) return explicit;
  const normalizedName = stringValue(name, 255).toLowerCase();
  const normalizedType = stringValue(mediaType, 100).toLowerCase();
  if (normalizedType === "application/pdf" || normalizedName.endsWith(".pdf")) return "pdf";
  if (["text/csv", "text/tab-separated-values", "application/vnd.ms-excel"].includes(normalizedType)
    || /\.(?:csv|tsv)$/u.test(normalizedName)) return "csv";
  if (["image/jpeg", "image/png", "image/webp"].includes(normalizedType)
    || /\.(?:jpe?g|png|webp)$/u.test(normalizedName)) return "image";
  return null;
}

function defaultMediaType(kind, name) {
  if (kind === "pdf") return "application/pdf";
  if (kind === "csv") return String(name).toLowerCase().endsWith(".tsv")
    ? "text/tab-separated-values"
    : "text/csv";
  if (String(name).toLowerCase().endsWith(".png")) return "image/png";
  if (String(name).toLowerCase().endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalizeContext(rawContext) {
  const context = rawContext && typeof rawContext === "object" ? rawContext : {};
  const normalized = {
    storeId: context.storeId ?? null,
    storeName: stringValue(context.storeName, 200),
    date: stringValue(context.date, 30),
    event: stringValue(context.event, 100),
    machineName: stringValue(context.machineName, 200),
  };
  if (Array.isArray(context.expectedNumbers)) {
    normalized.expectedNumbers = context.expectedNumbers
      .map((value) => stringValue(value, 20))
      .filter(Boolean)
      .slice(0, 10_000);
  }
  if (context.expectCompleteTable === true) normalized.expectCompleteTable = true;
  if (Array.isArray(context.customMachines)) {
    normalized.customMachines = context.customMachines.slice(0, 2_000);
  }
  return normalized;
}

function normalizeBoundedDeltaApprovals(
  rawApprovals,
  { jobId, aggregateFingerprint } = {},
) {
  if (rawApprovals === undefined) return [];
  if (
    !Array.isArray(rawApprovals)
    || rawApprovals.length < 1
    || rawApprovals.length > 64
    || !SHA256_HEX.test(String(aggregateFingerprint || ""))
  ) {
    throw new Error("bounded delta approvals are invalid");
  }
  const seen = new Set();
  return rawApprovals.map((approval) => {
    if (
      !approval
      || typeof approval !== "object"
      || Array.isArray(approval)
      || Object.keys(approval).some((key) => !BOUNDED_DELTA_APPROVAL_KEYS.has(key))
      || approval.schema !== BOUNDED_DELTA_APPROVAL_SCHEMA
      || approval.version !== 1
      || approval.jobId !== jobId
      || approval.aggregateFingerprint !== aggregateFingerprint
      || !Number.isSafeInteger(approval.machineNumber)
      || approval.machineNumber < 1
      || approval.machineNumber > 999_999
      || seen.has(approval.machineNumber)
      || !Number.isSafeInteger(approval.value)
      || approval.value < -10_000_000
      || approval.value > 10_000_000
      || approval.value % 500 !== 0
      || typeof approval.approvedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(approval.approvedAt)
      || !Number.isFinite(Date.parse(approval.approvedAt))
      || !BOUNDED_DELTA_APPROVAL_METHODS.has(approval.approvalMethod)
    ) {
      throw new Error("bounded delta approval does not match the job");
    }
    seen.add(approval.machineNumber);
    return {
      schema: BOUNDED_DELTA_APPROVAL_SCHEMA,
      version: 1,
      jobId,
      aggregateFingerprint,
      machineNumber: approval.machineNumber,
      value: approval.value,
      approvedAt: approval.approvedAt,
      approvalMethod: approval.approvalMethod,
    };
  });
}

function normalizeReviewDeltaApprovals(
  rawApprovals,
  { jobId, aggregateFingerprint } = {},
) {
  if (rawApprovals === undefined) return [];
  if (
    !Array.isArray(rawApprovals)
    || rawApprovals.length < 1
    || rawApprovals.length > 64
    || !SHA256_HEX.test(String(aggregateFingerprint || ""))
  ) {
    throw new Error("review delta approvals are invalid");
  }
  const seen = new Set();
  return rawApprovals.map((approval) => {
    if (
      !approval
      || typeof approval !== "object"
      || Array.isArray(approval)
      || Object.keys(approval).some((key) => !REVIEW_DELTA_APPROVAL_KEYS.has(key))
      || approval.schema !== REVIEW_DELTA_APPROVAL_SCHEMA
      || approval.version !== 1
      || approval.jobId !== jobId
      || approval.aggregateFingerprint !== aggregateFingerprint
      || !Number.isSafeInteger(approval.machineNumber)
      || approval.machineNumber < 1
      || approval.machineNumber > 999_999
      || seen.has(approval.machineNumber)
      || !Number.isSafeInteger(approval.value)
      || approval.value < -10_000_000
      || approval.value > 10_000_000
      || approval.value % 500 !== 0
      || typeof approval.approvedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(approval.approvedAt)
      || !Number.isFinite(Date.parse(approval.approvedAt))
      || approval.approvalMethod !== REVIEW_DELTA_APPROVAL_METHOD
    ) {
      throw new Error("review delta approval does not match the job");
    }
    seen.add(approval.machineNumber);
    return {
      schema: REVIEW_DELTA_APPROVAL_SCHEMA,
      version: 1,
      jobId,
      aggregateFingerprint,
      machineNumber: approval.machineNumber,
      value: approval.value,
      approvedAt: approval.approvedAt,
      approvalMethod: REVIEW_DELTA_APPROVAL_METHOD,
    };
  });
}

function serializedUtf8Size(value) {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(serialized).byteLength;
  }
  return serialized.length;
}

function normalizePersistedWindowsOcrHintSummary(rawSummary, fileCount) {
  if (!rawSummary || typeof rawSummary !== "object" || Array.isArray(rawSummary)) {
    throw new Error("Windows OCR要約はJSONオブジェクトである必要があります");
  }
  if (serializedUtf8Size(rawSummary) > MAX_OCR_HINT_SUMMARY_BYTES) {
    throw new Error("Windows OCR要約がサイズ上限を超えています");
  }
  if (
    rawSummary.schema !== "site7-push-bridge.windows-ocr-hints-summary"
    || rawSummary.version !== 1
    || rawSummary.advisoryOnly !== true
    || rawSummary.summaryOnly !== true
    || rawSummary.engine !== "Windows.Media.Ocr"
  ) {
    throw new Error("Windows OCR要約の形式が未対応です");
  }
  const policy = rawSummary.policy;
  if (
    !policy
    || typeof policy !== "object"
    || Array.isArray(policy)
    || policy.requiresIndependentMatch !== true
    || policy.requiresMultiProfileAgreement !== true
    || policy.minimumMatchingProfiles !== 2
    || policy.maySetStrictReady !== false
    || policy.engineConfidenceAvailable !== false
    || policy.networkUsed !== false
    || policy.sourceModified !== false
  ) {
    throw new Error("Windows OCR要約の安全ルールが一致しません");
  }
  const retention = rawSummary.retention;
  if (
    !retention
    || typeof retention !== "object"
    || Array.isArray(retention)
    || retention.rawHintsPersisted !== false
    || retention.rawHintsIncludedInManifest !== false
    || retention.coordinatesPersisted !== false
    || retention.recognizedTextPersisted !== false
  ) {
    throw new Error("Windows OCR要約の保存ルールが一致しません");
  }
  const generatedAt = stringValue(rawSummary.generatedAt, 35);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(generatedAt)
    || !Number.isFinite(Date.parse(generatedAt))
    || !SHA256_HEX.test(String(rawSummary.rawHintsSha256 || "").toLowerCase())
    || !Number.isSafeInteger(rawSummary.rawHintsBytes)
    || rawSummary.rawHintsBytes < 1
    || rawSummary.rawHintsBytes > 64 * 1024 * 1024
  ) {
    throw new Error("Windows OCR要約の監査情報が不正です");
  }
  if (
    !Array.isArray(rawSummary.files)
    || rawSummary.files.length < 1
    || rawSummary.files.length > MAX_JOB_FILES
    || rawSummary.files.length !== fileCount
    || rawSummary.fileCount !== fileCount
  ) {
    throw new Error("Windows OCR要約と画像の件数が一致しません");
  }
  const seenIndexes = new Set();
  const seenHashes = new Set();
  const files = rawSummary.files.map((entry) => {
    const fileIndex = entry?.fileIndex;
    const source = entry?.source;
    if (
      !Number.isSafeInteger(fileIndex)
      || fileIndex < 0
      || fileIndex >= fileCount
      || seenIndexes.has(fileIndex)
      || !source
      || typeof source !== "object"
      || Array.isArray(source)
      || source.readOnlyAccess !== true
      || source.unchanged !== true
      || !SHA256_HEX.test(String(source.sha256 || "").toLowerCase())
      || seenHashes.has(String(source.sha256).toLowerCase())
      || !Number.isSafeInteger(source.size)
      || source.size < 1
      || source.size > 100 * 1024 * 1024
      || !Number.isSafeInteger(entry.profileCount)
      || entry.profileCount < 1
      || entry.profileCount > 16
      || !Number.isSafeInteger(entry.numericTokenCount)
      || entry.numericTokenCount < 0
      || entry.numericTokenCount > 320_000
    ) {
      throw new Error("Windows OCR要約の画像対応が不正です");
    }
    seenIndexes.add(fileIndex);
    const sha256 = String(source.sha256).toLowerCase();
    seenHashes.add(sha256);
    return {
      fileIndex,
      sha256,
      sourceSize: source.size,
      sourceUnchanged: true,
      readOnlyAccess: true,
      profileCount: entry.profileCount,
      numericTokenCount: entry.numericTokenCount,
    };
  });
  const profileCount = files.reduce((sum, file) => sum + file.profileCount, 0);
  const numericTokenCount = files.reduce((sum, file) => sum + file.numericTokenCount, 0);
  if (
    rawSummary.profileCount !== profileCount
    || rawSummary.numericTokenCount !== numericTokenCount
  ) {
    throw new Error("Windows OCR要約の集計件数が一致しません");
  }
  return {
    schema: rawSummary.schema,
    version: 1,
    generatedAt,
    advisoryOnly: true,
    summaryOnly: true,
    engine: "Windows.Media.Ocr",
    policy: {
      requiresIndependentMatch: true,
      requiresMultiProfileAgreement: true,
      minimumMatchingProfiles: 2,
      maySetStrictReady: false,
      engineConfidenceAvailable: false,
      networkUsed: false,
      sourceModified: false,
    },
    retention: {
      rawHintsPersisted: false,
      rawHintsIncludedInManifest: false,
      coordinatesPersisted: false,
      recognizedTextPersisted: false,
    },
    rawHintsSha256: String(rawSummary.rawHintsSha256).toLowerCase(),
    rawHintsBytes: rawSummary.rawHintsBytes,
    fileCount,
    profileCount,
    numericTokenCount,
    files,
  };
}

function normalizeWindowsOcrHintSummary(rawHints, fileCount) {
  if (rawHints === undefined || rawHints === null) return null;
  if (!rawHints || typeof rawHints !== "object" || Array.isArray(rawHints)) {
    throw new Error("Windows OCR補助情報がJSONオブジェクトではありません");
  }
  if (serializedUtf8Size(rawHints) > MAX_OCR_HINT_BYTES) {
    throw new Error("Windows OCR補助情報がサイズ上限を超えています");
  }
  if (
    rawHints.schema !== "site7-push-bridge.windows-ocr-hints"
    || rawHints.version !== 1
    || rawHints.advisoryOnly !== true
    || rawHints.engine !== "Windows.Media.Ocr"
  ) {
    throw new Error("Windows OCR補助情報の形式が未対応です");
  }
  const policy = rawHints.policy;
  if (
    !policy
    || typeof policy !== "object"
    || Array.isArray(policy)
    || policy.requiresIndependentMatch !== true
    || policy.requiresMultiProfileAgreement !== true
    || policy.minimumMatchingProfiles !== 2
    || policy.maySetStrictReady !== false
    || policy.engineConfidenceAvailable !== false
    || policy.networkUsed !== false
    || policy.sourceModified !== false
  ) {
    throw new Error("Windows OCR補助情報の安全ルールが一致しません");
  }
  const generatedAt = stringValue(rawHints.generatedAt, 35);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(generatedAt)
    || !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw new Error("Windows OCR補助情報の作成日時が不正です");
  }
  if (
    !Array.isArray(rawHints.files)
    || rawHints.files.length < 1
    || rawHints.files.length > MAX_JOB_FILES
    || rawHints.files.length !== fileCount
  ) {
    throw new Error("Windows OCR補助情報と画像の件数が一致しません");
  }
  const seenIndexes = new Set();
  const seenHashes = new Set();
  const files = rawHints.files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Windows OCR補助情報の画像項目が不正です");
    }
    const fileIndex = Number(entry.fileIndex);
    const source = entry.source;
    const profiles = entry.profiles;
    if (
      !Number.isInteger(fileIndex)
      || fileIndex < 0
      || fileIndex >= fileCount
      || seenIndexes.has(fileIndex)
      || !source
      || typeof source !== "object"
      || Array.isArray(source)
      || source.readOnlyAccess !== true
      || source.unchanged !== true
      || !SHA256_HEX.test(String(source.sha256 || "").toLowerCase())
      || seenHashes.has(String(source.sha256).toLowerCase())
      || !Array.isArray(profiles)
      || profiles.length < 1
      || profiles.length > 16
    ) {
      throw new Error("Windows OCR補助情報の画像対応が不正です");
    }
    seenIndexes.add(fileIndex);
    const sha256 = String(source.sha256).toLowerCase();
    seenHashes.add(sha256);
    const profileIds = new Set();
    let numericTokenCount = 0;
    for (const profile of profiles) {
      const profileId = stringValue(profile?.profileId, 100);
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(profileId)
        || profileIds.has(profileId)
        || !Array.isArray(profile?.numericTokens)
        || profile.numericTokens.length > 20_000
      ) {
        throw new Error("Windows OCR補助情報の読取りプロファイルが不正です");
      }
      profileIds.add(profileId);
      numericTokenCount += profile.numericTokens.length;
    }
    return {
      fileIndex,
      sha256,
      profileCount: profiles.length,
      numericTokenCount,
    };
  });
  return {
    schema: rawHints.schema,
    version: 1,
    generatedAt,
    advisoryOnly: true,
    engine: "Windows.Media.Ocr",
    policy: {
      requiresIndependentMatch: true,
      requiresMultiProfileAgreement: true,
      minimumMatchingProfiles: 2,
      maySetStrictReady: false,
      engineConfidenceAvailable: false,
      networkUsed: false,
      sourceModified: false,
    },
    fileCount: files.length,
    profileCount: files.reduce((sum, file) => sum + file.profileCount, 0),
    numericTokenCount: files.reduce((sum, file) => sum + file.numericTokenCount, 0),
    files,
  };
}

export function normalizeJobManifest(rawManifest, originLike) {
  const manifest = rawManifest?.job && typeof rawManifest.job === "object"
    ? rawManifest.job
    : rawManifest;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("ジョブ情報がJSONオブジェクトではありません");
  }
  const jobId = safeJobId(manifest.jobId);
  const aggregateFingerprint = stringValue(manifest.aggregateFingerprint, 64)
    .toLowerCase();
  if (manifest.aggregateFingerprint !== undefined && !SHA256_HEX.test(aggregateFingerprint)) {
    throw new Error("aggregateFingerprint must be a SHA-256 value");
  }
  const sourceFiles = Array.isArray(manifest.files) ? manifest.files : [];
  if (!sourceFiles.length) throw new Error("解析するファイルがありません");
  if (sourceFiles.length > MAX_JOB_FILES) {
    throw new Error(`1回に解析できるファイルは${MAX_JOB_FILES}件までです`);
  }
  const files = sourceFiles.map((source, index) => {
    if (!source || typeof source !== "object") {
      throw new Error(`ファイル${index + 1}の情報が正しくありません`);
    }
    const url = resolveSameOriginUrl(source.url, originLike);
    const fallbackName = `site-seven-${index + 1}`;
    const name = safeFileName(source.name, fallbackName);
    const declaredType = stringValue(source.type, 100).toLowerCase();
    const declaredKind = stringValue(source.kind, 20).toLowerCase();
    const kind = inferFileKind(name, declaredType, declaredKind);
    if (!kind) {
      throw new Error(`${name}は対応していないファイル形式です`);
    }
    return {
      id: stringValue(source.id, 250) || `${jobId}:${index}`,
      name,
      url,
      kind,
      mediaType: ACCEPTED_KINDS.has(declaredType)
        ? defaultMediaType(kind, name)
        : declaredType || defaultMediaType(kind, name),
    };
  });
  const resultUrl = resolveSameOriginUrl(
    manifest.resultUrl || `/api/auto-worker/jobs/${encodeURIComponent(jobId)}/result`,
    originLike,
  );
  if (manifest.ocrHintSummary !== undefined && manifest.ocrHints !== undefined) {
    throw new Error("Windows OCRの生データと要約を同時に受け取ることはできません");
  }
  return {
    protocolVersion: AUTO_WORKER_PROTOCOL_VERSION,
    jobId,
    aggregateFingerprint: aggregateFingerprint || null,
    files,
    context: normalizeContext(manifest.context),
    ocrHints: manifest.ocrHintSummary !== undefined
      ? normalizePersistedWindowsOcrHintSummary(manifest.ocrHintSummary, files.length)
      : normalizeWindowsOcrHintSummary(manifest.ocrHints, files.length),
    boundedDeltaApprovals: normalizeBoundedDeltaApprovals(
      manifest.boundedDeltaApprovals,
      { jobId, aggregateFingerprint },
    ),
    reviewDeltaApprovals: normalizeReviewDeltaApprovals(
      manifest.reviewDeltaApprovals,
      { jobId, aggregateFingerprint },
    ),
    resultUrl,
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name}を画像として読み込めませんでした`));
    reader.readAsDataURL(file);
  });
}

export async function downloadJobFiles(job, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("fetchを使用できません");
  const loaded = [];
  let totalBytes = 0;
  for (let index = 0; index < job.files.length; index += 1) {
    const descriptor = job.files[index];
    const response = await fetchImpl(descriptor.url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "image/jpeg,image/png,image/webp,application/pdf,text/csv,text/tab-separated-values" },
    });
    if (!response?.ok) {
      throw new Error(`${descriptor.name}を取得できませんでした（HTTP ${response?.status || 0}）`);
    }
    const declaredLength = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
      throw new Error(`${descriptor.name}は上限30MBを超えています`);
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error(`${descriptor.name}は空のファイルです`);
    if (blob.size > MAX_FILE_BYTES) throw new Error(`${descriptor.name}は上限30MBを超えています`);
    totalBytes += blob.size;
    if (totalBytes > MAX_JOB_BYTES) throw new Error("ファイル合計が上限256MBを超えています");
    const responseType = stringValue(blob.type, 100).toLowerCase();
    const effectiveKind = inferFileKind(descriptor.name, responseType, descriptor.kind);
    if (!effectiveKind || effectiveKind !== descriptor.kind) {
      throw new Error(`${descriptor.name}の内容とファイル形式が一致しません`);
    }
    const mediaType = responseType || descriptor.mediaType || defaultMediaType(effectiveKind, descriptor.name);
    const file = new File([blob], descriptor.name, { type: mediaType });
    loaded.push({
      id: descriptor.id,
      name: descriptor.name,
      kind: effectiveKind,
      file,
      dataUrl: effectiveKind === "image" ? await fileToDataUrl(file) : null,
    });
  }
  return loaded;
}

function dateTextForAnalysis(value) {
  const normalized = stringValue(value, 30);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match ? `${match[1]}/${Number(match[2])}/${Number(match[3])}` : normalized;
}

export async function runImageAnalysis(files, context, onProgress) {
  const { analyzeImages } = await import("./components/delta/DeltaAnalyzer.jsx");
  return analyzeImages(files, onProgress, {
    dateText: dateTextForAnalysis(context?.date),
    storeName: context?.storeName || "",
    expectedNumbers: context?.expectedNumbers || [],
    expectCompleteTable: context?.expectCompleteTable === true,
  });
}

function addBlockingReason(reasons, condition, code) {
  if (condition && !reasons.includes(code)) reasons.push(code);
}

function finiteInteger(value) {
  const normalized = typeof value === "string" && /^-?\d+$/u.test(value)
    ? Number(value)
    : value;
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function boundedApprovalEligibility(row, approval) {
  const machineNumber = finiteInteger(row?.num);
  const observation = row?.boundaryObservation
    ?? row?.rawGraphCandidate?.boundaryObservation;
  const boundaryValue = finiteInteger(observation?.value);
  const boundaryKind = row?.deltaRange?.kind;
  const isTop = boundaryKind === "censored-top";
  const isBottom = boundaryKind === "censored-bottom";
  const boundary = isTop ? "top" : isBottom ? "bottom" : null;
  const endpointReason = isTop
    ? "endpoint-clipped-top"
    : isBottom
      ? "endpoint-clipped-bottom"
      : null;
  const observedCandidate = finiteInteger(
    row?.deltaRange?.observedCandidate
      ?? row?.rawGraphCandidate?.val,
  );
  const roundedObservedCandidate = observedCandidate === null
    ? null
    : Math.round(observedCandidate / 500) * 500;
  const visibleBoundary = finiteInteger(
    isTop
      ? row?.visibleValueRange?.upper
      : isBottom
        ? row?.visibleValueRange?.lower
        : null,
  );
  const approvedDisplayBoundary = (
    visibleBoundary !== null
    && boundaryValue !== null
    && visibleBoundary % 500 === 0
    && (
      (isTop && visibleBoundary >= boundaryValue && visibleBoundary - boundaryValue <= 500)
      || (isBottom && visibleBoundary <= boundaryValue && boundaryValue - visibleBoundary <= 500)
    )
  )
    ? visibleBoundary
    : null;
  const reasonCodes = Array.isArray(row?.reasonCodes) ? row.reasonCodes : [];
  const directionMatches = (
    (isTop && approval.value >= boundaryValue)
    || (isBottom && approval.value <= boundaryValue)
  );
  const eligible = (
    machineNumber === approval.machineNumber
    && row?.machineNumberVerified === true
    && row?.jointMatch?.accepted === true
    && row?.status === "bounded"
    && row?.valueSource === "bounded-range"
    && row?.val === null
    && (isTop || isBottom)
    && row?.deltaRange?.boundary === boundary
    && row?.deltaRange?.exact === false
    && observation?.kind === boundaryKind
    && observation?.boundary === boundary
    && observation?.exact === false
    && reasonCodes.includes(endpointReason)
    && reasonCodes.includes("clipped-series")
    && row?.calibration?.source === "panel"
    && Number(row?.calibration?.quality) >= 0.7
    && Number(row?.rawGraphCandidate?.confidence) >= 0.7
    && boundaryValue !== null
    && observedCandidate !== null
    && directionMatches
    && (
      approval.value === roundedObservedCandidate
      || approval.value === approvedDisplayBoundary
    )
  );
  return {
    eligible,
    boundary,
    boundaryKind,
    boundaryValue,
    observedCandidate,
    roundedObservedCandidate,
    approvedDisplayBoundary,
    endpointReason,
    reasonCodes,
  };
}

export function applyApprovedBoundedDeltas(
  rows,
  {
    jobId,
    aggregateFingerprint,
    approvals = [],
    getRank: getRankImpl = (value) => ({ rank: String(value) }),
  } = {},
) {
  const list = Array.isArray(rows) ? rows : [];
  const applied = [];
  const rejected = [];
  const byMachine = new Map(
    (Array.isArray(approvals) ? approvals : [])
      .map((approval) => [approval.machineNumber, approval]),
  );
  const transformed = list.map((row) => {
    const machineNumber = finiteInteger(row?.num);
    const approval = byMachine.get(machineNumber);
    if (!approval) return row;
    const evidence = boundedApprovalEligibility(row, approval);
    if (!evidence.eligible) {
      rejected.push({
        machineNumber,
        value: approval.value,
        reason: "bounded-evidence-mismatch",
      });
      return row;
    }
    const audit = {
      schema: BOUNDED_DELTA_APPROVAL_SCHEMA,
      version: 1,
      jobId,
      aggregateFingerprint,
      machineNumber,
      value: approval.value,
      approvedAt: approval.approvedAt,
      approvalMethod: approval.approvalMethod,
      boundaryKind: evidence.boundaryKind,
      boundaryValue: evidence.boundaryValue,
      observedCandidate: evidence.observedCandidate,
      reasonCodes: [evidence.endpointReason, "clipped-series"],
    };
    applied.push(audit);
    return {
      ...row,
      val: approval.value,
      rank: getRankImpl(approval.value).rank,
      status: "ok",
      confidence: 0.7,
      estimated: true,
      valueSource: "explicit-bounded-user-approval",
      reviewConfirmed: true,
      reviewedAt: approval.approvedAt,
      boundedDeltaApprovalAudit: audit,
    };
  });
  const presentMachines = new Set(
    list.map((row) => finiteInteger(row?.num)).filter((value) => value !== null),
  );
  for (const approval of byMachine.values()) {
    if (!presentMachines.has(approval.machineNumber)) {
      rejected.push({
        machineNumber: approval.machineNumber,
        value: approval.value,
        reason: "approved-machine-missing",
      });
    }
  }
  return { rows: transformed, applied, rejected };
}

function reviewApprovalEligibility(row, approval) {
  const reasonCodes = Array.isArray(row?.reasonCodes) ? row.reasonCodes : [];
  const machineNumber = finiteInteger(row?.num);
  const rowValue = finiteInteger(row?.val);
  const originalValue = finiteInteger(
    row?.shortSeriesValidation?.originalValue ?? row?.val,
  );
  return (
    row?.status === "review"
    && row?.reviewConfirmed !== true
    && machineNumber === approval.machineNumber
    && rowValue === approval.value
    && originalValue === approval.value
    && row?.machineNumberVerified === true
    && row?.jointMatch?.accepted === true
    && finiteInteger(row?.jointMatch?.resolvedNum) === approval.machineNumber
    && Number(row?.confidence) >= 0.8
    && row?.calibration?.source === "panel"
    && Number(row?.calibration?.quality) >= 0.95
    && row?.boundaryObservation == null
    && row?.valueConstraint == null
    && row?.shortSeriesValidation?.accepted === false
    && reasonCodes.includes("short-series")
    && reasonCodes.every((reason) => USER_APPROVABLE_REVIEW_REASONS.has(reason))
  );
}

export function applyApprovedReviewDeltas(
  rows,
  {
    jobId,
    aggregateFingerprint,
    approvals = [],
  } = {},
) {
  const list = Array.isArray(rows) ? rows : [];
  const applied = [];
  const rejected = [];
  const byMachine = new Map(
    (Array.isArray(approvals) ? approvals : [])
      .map((approval) => [approval.machineNumber, approval]),
  );
  const transformed = list.map((row) => {
    const machineNumber = finiteInteger(row?.num);
    const approval = byMachine.get(machineNumber);
    if (!approval) return row;
    if (!reviewApprovalEligibility(row, approval)) {
      rejected.push({
        machineNumber,
        value: approval.value,
        reason: "review-evidence-mismatch",
      });
      return row;
    }
    const audit = {
      schema: REVIEW_DELTA_APPROVAL_SCHEMA,
      version: 1,
      jobId,
      aggregateFingerprint,
      machineNumber,
      value: approval.value,
      approvedAt: approval.approvedAt,
      approvalMethod: REVIEW_DELTA_APPROVAL_METHOD,
      originalStatus: "review",
      reasonCodes: [...row.reasonCodes],
    };
    applied.push(audit);
    return {
      ...row,
      val: approval.value,
      status: "review",
      reviewConfirmed: true,
      reviewedAt: approval.approvedAt,
      valueSource: "explicit-review-user-approval",
      reviewDeltaApprovalAudit: audit,
    };
  });
  const presentMachines = new Set(
    list.map((row) => finiteInteger(row?.num)).filter((value) => value !== null),
  );
  for (const approval of byMachine.values()) {
    if (!presentMachines.has(approval.machineNumber)) {
      rejected.push({
        machineNumber: approval.machineNumber,
        value: approval.value,
        reason: "approved-machine-missing",
      });
    }
  }
  return { rows: transformed, applied, rejected };
}

export async function buildAutoWorkerCandidate(
  analysis,
  context = {},
  approvalContext = {},
) {
  const [
    selectors,
    siteSevenInput,
    bounded,
    evidence,
    deltaEngine,
  ] = await Promise.all([
    import("./components/delta/deltaSelectors.js"),
    import("./components/delta/siteSevenDataInput.js"),
    import("./components/delta/deltaBounded.js"),
    import("./components/delta/deltaEvidence.js"),
    import("./components/delta/deltaEngine.js"),
  ]);
  const slots = Array.isArray(analysis?.slots) ? analysis.slots : [];
  const numberOcr = analysis?.numberOcr || null;
  const numbers = numberOcr?.accepted === true && Array.isArray(numberOcr.numbers)
    ? numberOcr.numbers.map((number) => stringValue(number, 20))
    : [];
  const assignedRows = selectors.assignNumbers(slots, numbers).map((row, index) => ({
    ...row,
    machineName: stringValue(row?.machineName || context?.machineName, 200),
    machineNumberSource: slots[index]?.jointMatch?.accepted === true
      ? "joint-site-seven"
      : "ocr",
    machineNumberVerified: numberOcr?.accepted === true,
  }));
  const preparedRows = siteSevenInput.prepareSiteSevenImportedRows(
    analysis?.siteSevenRows,
    { expectedNumbers: numbers },
  );
  const mergeResult = preparedRows.rows.length
    ? selectors.mergeTaiData(assignedRows, preparedRows.rows)
    : {
      rows: assignedRows,
      matched: 0,
      duplicateNumbers: [],
      invalidDeltaNumbers: [],
      conflictNumbers: [],
      unverifiedDeltaNumbers: [],
    };
  const boundedRows = bounded.attachClippedDeltaRanges(mergeResult.rows);
  const approvalResult = applyApprovedBoundedDeltas(boundedRows, {
    jobId: approvalContext.jobId,
    aggregateFingerprint: approvalContext.aggregateFingerprint,
    approvals: approvalContext.boundedDeltaApprovals,
    getRank: deltaEngine.getRank,
  });
  const reviewApprovalResult = applyApprovedReviewDeltas(approvalResult.rows, {
    jobId: approvalContext.jobId,
    aggregateFingerprint: approvalContext.aggregateFingerprint,
    approvals: approvalContext.reviewDeltaApprovals,
  });
  const candidateRows = reviewApprovalResult.rows;
  const validation = selectors.validateDeltaRows(candidateRows);
  let machineValidation = null;
  if (Array.isArray(context?.customMachines)) {
    const { machineDB } = await import("./machineDB.js");
    machineValidation = evidence.validateDeltaRowMachineAssignments(
      validation.savableRows,
      context.customMachines,
      machineDB,
    );
  }

  const siteSummary = analysis?.siteSevenSummary || {};
  const jointSummary = analysis?.jointMatch?.summary || null;
  const siteRows = Array.isArray(analysis?.siteSevenRows) ? analysis.siteSevenRows : [];
  const requiredTableFields = [
    "cumulativeStarts",
    "normalSpins",
    "firstHitCount",
    "maxPayout",
    "totalStarts",
  ];
  const tableRowsFullyAccepted = siteRows.length > 0 && siteRows.every((row) => (
    row?.reviewRequired !== true
    && row?.globalReviewRequired !== true
    && row?.numAccepted === true
    && requiredTableFields.every((field) => (
      row?.fieldAccepted?.[field] === true
      && Number.isInteger(Number(row?.[field]))
      && Number(row[field]) >= 0
    ))
  ));
  const blockingReasons = [];
  addBlockingReason(blockingReasons, slots.length === 0, "no-graph-slots");
  addBlockingReason(blockingReasons, siteRows.length === 0, "no-site-seven-table");
  addBlockingReason(blockingReasons, !tableRowsFullyAccepted, "site-seven-table-not-fully-accepted");
  addBlockingReason(blockingReasons, siteRows.length !== slots.length, "table-graph-count-mismatch");
  addBlockingReason(blockingReasons, preparedRows.rows.length !== slots.length, "prepared-table-count-mismatch");
  addBlockingReason(blockingReasons, Number(mergeResult.matched || 0) !== slots.length, "merge-count-mismatch");
  addBlockingReason(blockingReasons, !jointSummary, "joint-match-missing");
  addBlockingReason(
    blockingReasons,
    jointSummary && Number(jointSummary.matchedCount || 0) !== slots.length,
    "joint-match-count-mismatch",
  );
  addBlockingReason(
    blockingReasons,
    slots.some((slot, index) => (
      (slot?.status !== "ok" || !Number.isFinite(Number(slot?.val)))
      && !candidateRows[index]?.boundedDeltaApprovalAudit
      && !candidateRows[index]?.reviewDeltaApprovalAudit
    )),
    "graph-slot-not-ok",
  );
  addBlockingReason(
    blockingReasons,
    approvalResult.rejected.length !== 0
      || approvalResult.applied.length
        !== (approvalContext.boundedDeltaApprovals?.length || 0),
    "bounded-approval-not-applicable",
  );
  addBlockingReason(
    blockingReasons,
    reviewApprovalResult.rejected.length !== 0
      || reviewApprovalResult.applied.length
        !== (approvalContext.reviewDeltaApprovals?.length || 0),
    "review-approval-not-applicable",
  );
  addBlockingReason(blockingReasons, numberOcr?.accepted !== true, "machine-number-ocr-not-accepted");
  addBlockingReason(blockingReasons, numbers.length !== slots.length, "machine-number-count-mismatch");
  addBlockingReason(blockingReasons, validation.valid !== true, "candidate-validation-failed");
  addBlockingReason(blockingReasons, validation.unresolvedCount !== 0, "unresolved-delta");
  addBlockingReason(blockingReasons, validation.boundedCount !== 0, "bounded-delta");
  addBlockingReason(blockingReasons, Number(siteSummary.reviewCount || 0) !== 0, "site-seven-review-pending");
  addBlockingReason(blockingReasons, Number(siteSummary.skippedCount || 0) !== 0, "site-seven-skipped");
  addBlockingReason(blockingReasons, Number(siteSummary.duplicateCount || 0) !== 0, "site-seven-duplicate");
  addBlockingReason(blockingReasons, Number(siteSummary.failedFileCount || 0) !== 0, "site-seven-file-failed");
  addBlockingReason(blockingReasons, Number(siteSummary.unsafeFileCount || 0) !== 0, "site-seven-file-unsafe");
  addBlockingReason(blockingReasons, preparedRows.invalidCount !== 0, "site-seven-invalid-row");
  addBlockingReason(blockingReasons, preparedRows.reviewPendingCount !== 0, "site-seven-row-review-pending");
  addBlockingReason(blockingReasons, preparedRows.duplicateCount !== 0, "site-seven-prepared-duplicate");
  addBlockingReason(blockingReasons, preparedRows.unexpectedCount !== 0, "site-seven-unexpected-number");
  addBlockingReason(blockingReasons, mergeResult.duplicateNumbers.length !== 0, "merge-duplicate");
  addBlockingReason(blockingReasons, mergeResult.invalidDeltaNumbers.length !== 0, "merge-invalid-delta");
  addBlockingReason(blockingReasons, mergeResult.conflictNumbers.length !== 0, "merge-delta-conflict");
  addBlockingReason(blockingReasons, mergeResult.unverifiedDeltaNumbers.length !== 0, "merge-unverified-delta");
  addBlockingReason(
    blockingReasons,
    jointSummary && (
      Number(jointSummary.unmatchedGraphCount || 0) !== 0
      || Number(jointSummary.unmatchedRowCount || 0) !== 0
      || (analysis?.jointMatch?.reviewReasons?.length || 0) !== 0
    ),
    "joint-match-incomplete",
  );
  addBlockingReason(
    blockingReasons,
    machineValidation && machineValidation.valid !== true,
    "machine-assignment-invalid",
  );

  return {
    candidateRows,
    strictReady: blockingReasons.length === 0,
    blockingReasons,
    validation,
    machineValidation,
    appliedBoundedDeltaApprovals: approvalResult.applied,
    rejectedBoundedDeltaApprovals: approvalResult.rejected,
    appliedReviewDeltaApprovals: reviewApprovalResult.applied,
    rejectedReviewDeltaApprovals: reviewApprovalResult.rejected,
    preparedSiteSeven: {
      rowCount: preparedRows.rows.length,
      invalidCount: preparedRows.invalidCount,
      reviewPendingCount: preparedRows.reviewPendingCount,
      duplicateCount: preparedRows.duplicateCount,
      unexpectedCount: preparedRows.unexpectedCount,
    },
    mergeSummary: {
      matched: mergeResult.matched || 0,
      duplicateNumbers: mergeResult.duplicateNumbers || [],
      invalidDeltaNumbers: mergeResult.invalidDeltaNumbers || [],
      conflictNumbers: mergeResult.conflictNumbers || [],
      unverifiedDeltaNumbers: mergeResult.unverifiedDeltaNumbers || [],
    },
  };
}

function publicContext(context) {
  return {
    storeId: context?.storeId ?? null,
    storeName: context?.storeName || "",
    date: context?.date || "",
    event: context?.event || "",
    machineName: context?.machineName || "",
  };
}

export async function buildCompletedPayload(job, analysis) {
  const candidate = await buildAutoWorkerCandidate(analysis, job.context, {
    jobId: job.jobId,
    aggregateFingerprint: job.aggregateFingerprint,
    boundedDeltaApprovals: job.boundedDeltaApprovals,
    reviewDeltaApprovals: job.reviewDeltaApprovals,
  });
  return {
    protocolVersion: AUTO_WORKER_PROTOCOL_VERSION,
    jobId: job.jobId,
    status: "analyzed",
    analyzedAt: new Date().toISOString(),
    policy: AUTO_WORKER_POLICY,
    context: publicContext(job.context),
    rows: Array.isArray(analysis?.siteSevenRows) ? analysis.siteSevenRows : [],
    reports: {
      graph: Array.isArray(analysis?.reports) ? analysis.reports : [],
      siteSeven: Array.isArray(analysis?.siteSevenSummary?.reports)
        ? analysis.siteSevenSummary.reports
        : [],
    },
    candidateRows: candidate.candidateRows,
    strictReady: candidate.strictReady,
    blockingReasons: candidate.blockingReasons,
    appliedBoundedDeltaApprovals: candidate.appliedBoundedDeltaApprovals,
    appliedReviewDeltaApprovals: candidate.appliedReviewDeltaApprovals,
    diagnostics: {
      validation: candidate.validation,
      machineValidation: candidate.machineValidation,
      preparedSiteSeven: candidate.preparedSiteSeven,
      merge: candidate.mergeSummary,
      graphSlotCount: Array.isArray(analysis?.slots) ? analysis.slots.length : 0,
      tableRowCount: Array.isArray(analysis?.siteSevenRows) ? analysis.siteSevenRows.length : 0,
      windowsOcrHints: job.ocrHints,
    },
    analysis,
  };
}

function failedPayload(job, error) {
  return {
    protocolVersion: AUTO_WORKER_PROTOCOL_VERSION,
    jobId: job.jobId,
    status: "failed",
    analyzedAt: new Date().toISOString(),
    policy: AUTO_WORKER_POLICY,
    context: publicContext(job.context),
    rows: [],
    reports: { graph: [], siteSeven: [] },
    candidateRows: [],
    strictReady: false,
    blockingReasons: ["worker-error"],
    diagnostics: {
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error || "自動解析に失敗しました"),
      },
      windowsOcrHints: job.ocrHints,
    },
    analysis: null,
  };
}

async function postResult(job, payload, fetchImpl) {
  const response = await fetchImpl(job.resultUrl, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response?.ok) {
    throw new Error(`解析結果を返せませんでした（HTTP ${response?.status || 0}）`);
  }
}

export async function runAutoWorkerOnce({
  fetchImpl = globalThis.fetch,
  locationLike = globalThis.location,
  jobEndpoint = DEFAULT_JOB_ENDPOINT,
  analyzeImpl = runImageAnalysis,
  onStatus = () => {},
} = {}) {
  requireLoopbackLocation(locationLike);
  const origin = normalizeOrigin(locationLike);
  const endpoint = resolveSameOriginUrl(jobEndpoint, origin);
  onStatus({ phase: "checking", message: "新しい画像を確認しています" });
  const response = await fetchImpl(endpoint, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (response?.status === 204 || response?.status === 404) {
    onStatus({ phase: "idle", message: "新しい画像を待っています" });
    return { status: "idle" };
  }
  if (!response?.ok) {
    throw new Error(`ジョブ確認に失敗しました（HTTP ${response?.status || 0}）`);
  }
  const job = normalizeJobManifest(await response.json(), origin);
  onStatus({ phase: "downloading", jobId: job.jobId, message: "画像を安全に読み込んでいます" });
  let payload;
  try {
    const files = await downloadJobFiles(job, fetchImpl);
    const analysis = await analyzeImpl(files, job.context, (current, total) => {
      onStatus({
        phase: "analyzing",
        jobId: job.jobId,
        current,
        total,
        message: `${current}/${total}件を解析しています`,
      });
    });
    payload = await buildCompletedPayload(job, analysis);
  } catch (error) {
    payload = failedPayload(job, error);
  }
  onStatus({ phase: "reporting", jobId: job.jobId, message: "解析結果をWindowsへ返しています" });
  await postResult(job, payload, fetchImpl);
  onStatus({
    phase: payload.strictReady ? "ready" : "review",
    jobId: job.jobId,
    message: payload.strictReady
      ? "自動取込できる解析結果を返しました"
      : "安全確認が必要な解析結果を返しました",
  });
  return { status: payload.status, jobId: job.jobId, payload };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startAutoWorker({
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  onStatus = () => {},
  ...options
} = {}) {
  let stopped = false;
  const done = (async () => {
    while (!stopped) {
      try {
        await runAutoWorkerOnce({ ...options, onStatus });
      } catch (error) {
        onStatus({
          phase: "error",
          message: error instanceof Error ? error.message : "自動解析でエラーが発生しました",
        });
      }
      if (!stopped) await wait(Math.max(500, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS));
    }
  })();
  return {
    stop() {
      stopped = true;
    },
    done,
  };
}

function renderStatus(status) {
  const statusElement = document.getElementById("worker-status");
  const detailElement = document.getElementById("worker-detail");
  if (statusElement) statusElement.textContent = status?.message || "待機しています";
  if (detailElement) {
    detailElement.textContent = status?.jobId
      ? `ジョブ: ${status.jobId}`
      : "画像やアプリデータを、このページ内へ保存することはありません。";
  }
  document.body.dataset.workerPhase = status?.phase || "idle";
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    requireLoopbackLocation(window.location);
    const endpoint = new URLSearchParams(window.location.search).get("endpoint")
      || DEFAULT_JOB_ENDPOINT;
    window.__PACHI_AUTO_WORKER__ = startAutoWorker({
      jobEndpoint: endpoint,
      onStatus: renderStatus,
    });
  } catch (error) {
    renderStatus({
      phase: "error",
      message: error instanceof Error ? error.message : "自動解析を開始できません",
    });
  }
}
