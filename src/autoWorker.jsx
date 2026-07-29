/* eslint-disable react-refresh/only-export-components */

const AUTO_WORKER_PROTOCOL_VERSION = 1;
const DEFAULT_JOB_ENDPOINT = "/api/auto-worker/jobs/next";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_JOB_FILES = 64;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_JOB_BYTES = 256 * 1024 * 1024;
const ACCEPTED_KINDS = new Set(["image", "pdf", "csv"]);

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

export function normalizeJobManifest(rawManifest, originLike) {
  const manifest = rawManifest?.job && typeof rawManifest.job === "object"
    ? rawManifest.job
    : rawManifest;
  if (!manifest || typeof manifest !== "object") {
    throw new Error("ジョブ情報がJSONオブジェクトではありません");
  }
  const jobId = safeJobId(manifest.jobId);
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
  return {
    protocolVersion: AUTO_WORKER_PROTOCOL_VERSION,
    jobId,
    files,
    context: normalizeContext(manifest.context),
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

export async function buildAutoWorkerCandidate(analysis, context = {}) {
  const [
    selectors,
    siteSevenInput,
    bounded,
    evidence,
  ] = await Promise.all([
    import("./components/delta/deltaSelectors.js"),
    import("./components/delta/siteSevenDataInput.js"),
    import("./components/delta/deltaBounded.js"),
    import("./components/delta/deltaEvidence.js"),
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
  const candidateRows = bounded.attachClippedDeltaRanges(mergeResult.rows);
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
    slots.some((slot) => slot?.status !== "ok" || !Number.isFinite(Number(slot?.val))),
    "graph-slot-not-ok",
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
  const candidate = await buildAutoWorkerCandidate(analysis, job.context);
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
    diagnostics: {
      validation: candidate.validation,
      machineValidation: candidate.machineValidation,
      preparedSiteSeven: candidate.preparedSiteSeven,
      merge: candidate.mergeSummary,
      graphSlotCount: Array.isArray(analysis?.slots) ? analysis.slots.length : 0,
      tableRowCount: Array.isArray(analysis?.siteSevenRows) ? analysis.siteSevenRows.length : 0,
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
