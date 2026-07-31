import {
  hasTrustedHeaderContextEvidence,
  isStrictAutoImportCandidate,
  listPendingPushBatches,
  markPushBatchStatus,
  resolveReviewNoticesForFingerprint,
  validateAndDecodePushEnvelope,
} from "./pushInbox.js";
import {
  validateDeltaRows,
} from "./components/delta/deltaSelectors.js";
import { getRank } from "./components/delta/deltaEngine.js";
import {
  findMachineSpec,
  normalizeEvidenceMachineName,
  validateDeltaRowMachineAssignments,
} from "./components/delta/deltaEvidence.js";
import { relateRowsToStoreLayout } from "./components/delta/storeLayoutRowRelation.js";
import { getStoreIslands } from "./components/select/hallMapSelectors.js";
import {
  getPersistenceEpochSync,
  getSync,
} from "./persistence.js";

// 差玉解析エンジンが status="ok" にする下限と同じ値。
// これより低い行や review / bounded（画面外へ見切れた値）は自動登録しない。
export const AUTO_IMPORT_MIN_CONFIDENCE = 0.7;

function normalizeStoreName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("ja-JP");
}

function conciseErrors(errors) {
  return (Array.isArray(errors) ? errors : [])
    .slice(0, 8)
    .map((value) => String(value).slice(0, 300));
}

function fingerprintOf(scan) {
  return String(scan?.sourceFingerprint?.hash || "").toLowerCase();
}

export function resolveRegisteredPushStore(
  scan,
  stores = [],
  { allowObservedLabel = false } = {},
) {
  const list = (Array.isArray(stores) ? stores : [])
    .filter((store) => store && typeof store === "object");
  const sourceId = scan?.storeId;
  const sourceName = String(scan?.storeName || "").trim();

  if (sourceId !== null && sourceId !== undefined && String(sourceId).trim()) {
    const store = list.find((candidate) => String(candidate.id) === String(sourceId));
    if (!store) {
      return { status: "waiting", code: "store-not-registered", store: null };
    }
    if (
      sourceName
      && normalizeStoreName(sourceName) !== normalizeStoreName(store.name)
    ) {
      return { status: "rejected", code: "store-name-conflict", store: null };
    }
    return { status: "ready", code: "", store };
  }

  if (!sourceName) {
    return { status: "rejected", code: "store-missing", store: null };
  }
  const matches = list.filter(
    (store) => normalizeStoreName(store.name) === normalizeStoreName(sourceName),
  );
  if (matches.length === 0) {
    if (allowObservedLabel) {
      return {
        status: "ready",
        code: "",
        store: null,
        observedLabel: true,
      };
    }
    return { status: "waiting", code: "store-not-registered", store: null };
  }
  if (matches.length > 1) {
    return { status: "waiting", code: "store-name-ambiguous", store: null };
  }
  return { status: "ready", code: "", store: matches[0] };
}

export function evaluateDecodedPushScan(
  scan,
  {
    stores = [],
    customMachines = [],
    builtInMachines = [],
    hallMaps = {},
    minimumConfidence = AUTO_IMPORT_MIN_CONFIDENCE,
  } = {},
) {
  if (!isStrictAutoImportCandidate(scan, { minimumConfidence })) {
    return {
      status: "rejected",
      code: "not-strict-auto-import",
      scan: null,
    };
  }

  const validation = validateDeltaRows(scan.rows);
  const everyRowExact = validation.valid === true
    && validation.unresolvedCount === 0
    && validation.boundedCount === 0
    && validation.savableRows.length === validation.total
    && validation.savableRows.every((row) => row?.status === "ok");
  if (!everyRowExact) {
    return {
      status: "rejected",
      code: "delta-validation-failed",
      scan: null,
      validation,
    };
  }

  const allowObservedLabels = hasTrustedHeaderContextEvidence(scan);
  const storeResult = resolveRegisteredPushStore(scan, stores, {
    allowObservedLabel: allowObservedLabels,
  });
  if (storeResult.status !== "ready") {
    return {
      status: storeResult.status,
      code: storeResult.code,
      scan: null,
      validation,
    };
  }

  const canonicalStore = storeResult.store;
  const configuredIslands = canonicalStore
    ? getStoreIslands(hallMaps, canonicalStore.id)
    : [];
  const layoutRelation = configuredIslands.length > 0
    ? relateRowsToStoreLayout(validation.savableRows, {
      islands: configuredIslands,
      scope: "all",
    })
    : null;
  if (
    layoutRelation
    && (
      layoutRelation.summary.scopeFound !== true
      || layoutRelation.summary.reviewCount > 0
      || layoutRelation.summary.mappedCount !== validation.savableRows.length
    )
  ) {
    return {
      status: "waiting",
      code: "store-layout-review",
      scan: null,
      validation,
      layoutRelation,
    };
  }
  const relatedRows = layoutRelation?.rows || validation.savableRows;
  const machineValidation = validateDeltaRowMachineAssignments(
    relatedRows,
    customMachines,
    builtInMachines,
  );
  const canonicalScanMachine = findMachineSpec(
    scan.machineName,
    customMachines,
    builtInMachines,
  );
  if (machineValidation.missingCount > 0) {
    return {
      status: "rejected",
      code: "machine-name-missing",
      scan: null,
      validation,
      layoutRelation,
      machineValidation,
    };
  }
  if (
    (!canonicalScanMachine || machineValidation.unregisteredCount > 0)
    && allowObservedLabels
  ) {
    const normalizedScanMachine = normalizeEvidenceMachineName(scan.machineName);
    const everyRowMatchesScan = normalizedScanMachine
      && relatedRows.every(
        (row) => normalizeEvidenceMachineName(row?.machineName) === normalizedScanMachine,
      );
    if (!everyRowMatchesScan) {
      return {
        status: "rejected",
        code: "machine-name-conflict",
        scan: null,
        validation,
        layoutRelation,
        machineValidation,
      };
    }
  }
  if (!machineValidation.valid && !allowObservedLabels) {
    return {
      status: "waiting",
      code: "machine-not-registered",
      scan: null,
      validation,
      layoutRelation,
      machineValidation,
    };
  }
  const canonicalRows = relatedRows.map((row) => {
    const machine = findMachineSpec(row?.machineName, customMachines, builtInMachines);
    return {
      ...row,
      machineName: String(
        machine?.name
        || (allowObservedLabels ? scan.machineName : row?.machineName)
        || "",
      ).trim(),
    };
  });
  return {
    status: "ready",
    code: "",
    validation,
    machineValidation,
    layoutRelation,
    scan: {
      ...scan,
      storeId: canonicalStore?.id ?? null,
      storeName: String(canonicalStore?.name || scan.storeName || "").trim(),
      machineName: String(canonicalScanMachine?.name || scan.machineName || "").trim(),
      rows: canonicalRows.map((row) => ({
        ...row,
        rank: getRank(row.val).rank,
      })),
    },
  };
}

async function safeMark(batchId, status, details, signal, expectedEpoch) {
  try {
    await markPushBatchStatus(batchId, status, details, { signal, expectedEpoch });
    return true;
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) throw error;
    console.error("[push-import] status update failed:", error);
    return false;
  }
}

async function safeResolveReviewNotices(
  sourceFingerprint,
  details,
  signal,
  expectedEpoch,
) {
  try {
    return await resolveReviewNoticesForFingerprint(
      sourceFingerprint,
      details,
      { signal, expectedEpoch },
    );
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) throw error;
    console.error("[push-import] review resolution failed:", error);
    return 0;
  }
}

async function runPendingPushImports({
  saveScan,
  stores,
  customMachines,
  builtInMachines,
  hallMaps,
  limit = 100,
  signal,
} = {}) {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw signal.reason || new DOMException("処理を中止しました", "AbortError");
    }
  };
  throwIfAborted();
  const expectedEpoch = getPersistenceEpochSync();
  const summary = {
    found: 0,
    imported: 0,
    duplicate: 0,
    review: 0,
    waiting: 0,
    rejected: 0,
    errors: 0,
  };
  const records = await listPendingPushBatches({ limit });
  throwIfAborted();
  summary.found = records.length;
  if (!records.length) return summary;

  const registeredStores = Array.isArray(stores)
    ? stores
    : (getSync("pt_stores") || []);
  const registeredCustomMachines = Array.isArray(customMachines)
    ? customMachines
    : (getSync("pt_customMachines") || []);
  const registeredHallMaps = hallMaps && typeof hallMaps === "object"
    ? hallMaps
    : (getSync("pt_hallMaps") || {});
  const machineCatalog = Array.isArray(builtInMachines)
    ? builtInMachines
    : (await import("./machineDB.js")).machineDB;
  throwIfAborted();

  for (const record of records) {
    throwIfAborted();
    const batchId = String(record?.batchId || "");
    try {
      const decoded = await validateAndDecodePushEnvelope(record?.envelope);
      throwIfAborted();
      if (decoded.valid && decoded.kind === "review" && decoded.reviewNotice) {
        summary.review += 1;
        await safeMark(batchId, "review", {
          jobId: decoded.reviewNotice.jobId,
          date: decoded.reviewNotice.date,
          storeName: decoded.reviewNotice.storeName,
          machineName: decoded.reviewNotice.machineName,
          pendingMachineCount: decoded.reviewNotice.pendingMachines.length,
          sourceFingerprint: decoded.reviewNotice.sourceFingerprint.hash,
          reasonCodes: decoded.reviewNotice.blockingReasons,
        }, signal, expectedEpoch);
        continue;
      }
      if (!decoded.valid || !decoded.scan) {
        summary.rejected += 1;
        await safeMark(batchId, "rejected", {
          reasonCodes: ["invalid-envelope"],
          errors: conciseErrors(decoded.errors),
        }, signal, expectedEpoch);
        continue;
      }

      const evaluation = evaluateDecodedPushScan(decoded.scan, {
        stores: registeredStores,
        customMachines: registeredCustomMachines,
        builtInMachines: machineCatalog,
        hallMaps: registeredHallMaps,
      });
      if (evaluation.status === "waiting") {
        summary.waiting += 1;
        await safeMark(batchId, "pending", {
          reasonCodes: [evaluation.code],
          scanId: decoded.scan.id,
          rowCount: decoded.scan.rows.length,
        }, signal, expectedEpoch);
        continue;
      }
      if (evaluation.status !== "ready") {
        summary.rejected += 1;
        await safeMark(batchId, "rejected", {
          reasonCodes: [evaluation.code],
          scanId: decoded.scan.id,
          rowCount: decoded.scan.rows.length,
        }, signal, expectedEpoch);
        continue;
      }
      if (typeof saveScan !== "function") {
        summary.waiting += 1;
        await safeMark(batchId, "pending", {
          reasonCodes: ["app-save-path-unavailable"],
          scanId: evaluation.scan.id,
        }, signal, expectedEpoch);
        continue;
      }

      // App.jsxの既存追記専用経路へ渡す。ここから既存スキャンを直接変更しない。
      throwIfAborted();
      const saved = await saveScan(evaluation.scan, { signal, expectedEpoch });
      throwIfAborted();
      if (saved?.status === "saved") {
        summary.imported += 1;
        await safeMark(batchId, "imported", {
          scanId: evaluation.scan.id,
          rowCount: evaluation.scan.rows.length,
          sourceFingerprint: fingerprintOf(evaluation.scan),
        }, signal, expectedEpoch);
        await safeResolveReviewNotices(
          fingerprintOf(evaluation.scan),
          { resolvedByBatchId: batchId, resolvedAs: "imported" },
          signal,
          expectedEpoch,
        );
        continue;
      }

      const sameFingerprint = fingerprintOf(evaluation.scan)
        && fingerprintOf(saved?.existing) === fingerprintOf(evaluation.scan);
      if (saved?.status === "duplicate" || (saved?.status === "id-conflict" && sameFingerprint)) {
        summary.duplicate += 1;
        await safeMark(batchId, "duplicate", {
          scanId: evaluation.scan.id,
          existingScanId: saved?.existing?.id ?? null,
          sourceFingerprint: fingerprintOf(evaluation.scan),
        }, signal, expectedEpoch);
        await safeResolveReviewNotices(
          fingerprintOf(evaluation.scan),
          { resolvedByBatchId: batchId, resolvedAs: "duplicate" },
          signal,
          expectedEpoch,
        );
        continue;
      }

      if (saved?.status === "id-conflict" || saved?.status === "invalid") {
        summary.rejected += 1;
        await safeMark(batchId, "rejected", {
          reasonCodes: [saved.status],
          scanId: evaluation.scan.id,
          existingScanId: saved?.existing?.id ?? null,
        }, signal, expectedEpoch);
        continue;
      }

      summary.waiting += 1;
      await safeMark(batchId, "pending", {
        reasonCodes: ["app-save-not-completed"],
        scanId: evaluation.scan.id,
      }, signal, expectedEpoch);
    } catch (error) {
      if (error?.name === "AbortError" || signal?.aborted) throw error;
      // 一時的な保存失敗で受信原本を捨てない。pendingのまま次回起動時に再試行する。
      summary.errors += 1;
      await safeMark(batchId, "pending", {
        reasonCodes: ["processing-error"],
        errors: conciseErrors([error?.message || error]),
      }, signal, expectedEpoch);
    }
  }
  return summary;
}

let activeProcessPromise = null;
let rerunRequested = false;
let latestProcessOptions = {};

export function processPendingPushImports(options = {}) {
  latestProcessOptions = options;
  if (activeProcessPromise) {
    rerunRequested = true;
    return activeProcessPromise;
  }
  activeProcessPromise = (async () => {
    let latestSummary = null;
    do {
      rerunRequested = false;
      const runOptions = latestProcessOptions;
      try {
        latestSummary = await runPendingPushImports(runOptions);
      } catch (error) {
        if (error?.name !== "AbortError" || !rerunRequested) throw error;
      }
    } while (rerunRequested);
    return latestSummary;
  })()
    .finally(() => {
      activeProcessPromise = null;
    });
  return activeProcessPromise;
}
