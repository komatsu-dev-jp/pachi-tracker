import { normalizeEvidenceDate } from "../../evidenceDate.js";

function scanRowStoreKey(scan, row) {
  return String(
    scan?.storeId
    ?? row?.storeId
    ?? scan?.storeName
    ?? row?.storeName
    ?? row?.store
    ?? "",
  ).trim();
}

function scanRowIslandName(scan, row) {
  const machineName = String(row?.machineName || scan?.machineName || "").trim();
  return String(row?.island || (machineName ? `${machineName}島` : "")).trim();
}

export function findDeltaScanDateTargets(scans = [], {
  date = "",
  storeKey = "",
  island = "",
} = {}) {
  const sourceDate = normalizeEvidenceDate(date);
  const expectedStore = String(storeKey || "").trim();
  const expectedIsland = String(island || "").trim();
  if (!sourceDate) return [];

  return (Array.isArray(scans) ? scans : []).filter((scan) => {
    if (!scan || normalizeEvidenceDate(scan.date) !== sourceDate) return false;
    const rows = Array.isArray(scan.rows) ? scan.rows : [];
    if (!expectedStore && !expectedIsland) return true;
    return rows.some((row) => (
      (!expectedStore || scanRowStoreKey(scan, row) === expectedStore)
      && (!expectedIsland || scanRowIslandName(scan, row) === expectedIsland)
    ));
  });
}

export function updateDeltaScanDate(scans = [], {
  scanIds = [],
  fromDate = "",
  toDate = "",
  changedAt = new Date().toISOString(),
} = {}) {
  const list = Array.isArray(scans) ? scans : [];
  const sourceDate = normalizeEvidenceDate(fromDate);
  const nextDate = normalizeEvidenceDate(toDate);
  if (!sourceDate || !nextDate) {
    return { ok: false, reason: "invalid-date", scans: list, updatedCount: 0 };
  }
  if (sourceDate === nextDate) {
    return { ok: false, reason: "same-date", scans: list, updatedCount: 0 };
  }

  const targetIds = new Set(
    (Array.isArray(scanIds) ? scanIds : [])
      .filter((id) => id !== null && id !== undefined)
      .map(String),
  );
  if (!targetIds.size) {
    return { ok: false, reason: "no-target", scans: list, updatedCount: 0 };
  }

  let updatedCount = 0;
  const nextScans = list.map((scan) => {
    if (
      !scan
      || !targetIds.has(String(scan.id))
      || normalizeEvidenceDate(scan.date) !== sourceDate
    ) return scan;

    updatedCount += 1;
    const rows = (Array.isArray(scan.rows) ? scan.rows : []).map((row) => {
      if (!row || normalizeEvidenceDate(row.date) !== sourceDate) return row;
      return { ...row, date: nextDate };
    });
    const previousCorrections = Array.isArray(scan.dateCorrections)
      ? scan.dateCorrections
      : [];
    return {
      ...scan,
      date: nextDate,
      rows,
      updatedAt: changedAt,
      dateCorrections: [
        ...previousCorrections,
        { from: sourceDate, to: nextDate, changedAt },
      ].slice(-5),
    };
  });

  if (!updatedCount) {
    return { ok: false, reason: "no-target", scans: list, updatedCount: 0 };
  }
  return {
    ok: true,
    reason: null,
    scans: nextScans,
    updatedCount,
    fromDate: sourceDate,
    toDate: nextDate,
  };
}

export function deleteDeltaScans(scans = [], {
  scanIds = [],
  fromDate = "",
} = {}) {
  const list = Array.isArray(scans) ? scans : [];
  const sourceDate = normalizeEvidenceDate(fromDate);
  if (!sourceDate) {
    return { ok: false, reason: "invalid-date", scans: list, deletedCount: 0, deletedRowCount: 0 };
  }

  const targetIds = new Set(
    (Array.isArray(scanIds) ? scanIds : [])
      .filter((id) => id !== null && id !== undefined)
      .map(String),
  );
  if (!targetIds.size) {
    return { ok: false, reason: "no-target", scans: list, deletedCount: 0, deletedRowCount: 0 };
  }

  let deletedCount = 0;
  let deletedRowCount = 0;
  const nextScans = list.filter((scan) => {
    const shouldDelete = Boolean(
      scan
      && targetIds.has(String(scan.id))
      && normalizeEvidenceDate(scan.date) === sourceDate
    );
    if (!shouldDelete) return true;
    deletedCount += 1;
    deletedRowCount += Array.isArray(scan.rows) ? scan.rows.length : 0;
    return false;
  });

  if (!deletedCount) {
    return { ok: false, reason: "no-target", scans: list, deletedCount: 0, deletedRowCount: 0 };
  }
  return {
    ok: true,
    reason: null,
    scans: nextScans,
    deletedCount,
    deletedRowCount,
    fromDate: sourceDate,
  };
}
