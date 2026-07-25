import { machineDB } from "../../machineDB.js";
import { evidenceDayNumber, normalizeEvidenceDate } from "../../evidenceDate.js";
import { findMachineSpec } from "../delta/deltaEvidence.js";
import {
  buildMachineOverride,
  normalizeMachine,
} from "../machines/machineSpecModel.js";

function finite(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calibrationHistory(machine) {
  return (Array.isArray(machine?.pevidenceCalibrationHistory)
    ? machine.pevidenceCalibrationHistory
    : [])
    .filter((entry) => normalizeEvidenceDate(entry?.effectiveFrom))
    .sort((left, right) => (
      evidenceDayNumber(left.effectiveFrom) - evidenceDayNumber(right.effectiveFrom)
      || String(left.approvedAt || "").localeCompare(String(right.approvedAt || ""))
    ));
}

// 過去のバックテストは、現在の係数で全期間を塗り替えず、
// その日に実際に有効だった承認済み係数を使って再現する。
export function priorBallsForEvidenceDate(machine, date) {
  const history = calibrationHistory(machine);
  if (!history.length) {
    const current = finite(machine?.muraCoef);
    return current !== null && current > 0 ? current : null;
  }
  const targetDay = evidenceDayNumber(date);
  const initial = finite(history[0]?.previousPriorBalls);
  let resolved = initial !== null && initial > 0 ? initial : finite(machine?.muraCoef);
  if (!Number.isFinite(targetDay)) return resolved !== null && resolved > 0 ? resolved : null;
  for (const entry of history) {
    if (evidenceDayNumber(entry.effectiveFrom) > targetDay) break;
    const applied = finite(entry.appliedPriorBalls);
    if (applied !== null && applied > 0) resolved = applied;
  }
  return resolved !== null && resolved > 0 ? resolved : null;
}

function resolvedMachineName(candidate) {
  return String(candidate?.machineRecordName || candidate?.machineName || "").trim();
}

function nextEvidenceDate(value) {
  const day = evidenceDayNumber(value);
  if (!Number.isFinite(day)) return "";
  return new Date((day + 1) * 86400000).toISOString().slice(0, 10);
}

function upsertByIdentity(customMachines, record, sourceName) {
  const list = Array.isArray(customMachines) ? customMachines : [];
  const index = list.findIndex((machine) => (
    (record.id != null && machine?.id === record.id)
    || String(machine?.name || "").trim() === sourceName
  ));
  if (index < 0) return [...list, record];
  const next = [...list];
  next[index] = { ...record, id: list[index]?.id ?? record.id };
  return next;
}

export function applyCalibrationCandidate(
  customMachines,
  candidate,
  {
    builtInMachines = machineDB,
    approvedAt = new Date().toISOString(),
    recordId = Date.now(),
  } = {},
) {
  const recommended = finite(candidate?.recommendedPriorBalls);
  const current = finite(candidate?.currentPriorBalls);
  if (
    candidate?.eligible !== true
    || recommended === null
    || current === null
    || recommended <= 0
    || current <= 0
    || recommended === current
  ) {
    return { ok: false, reason: "candidate-not-applicable", customMachines };
  }

  const sourceName = resolvedMachineName(candidate);
  const source = findMachineSpec(sourceName, customMachines, builtInMachines);
  if (!source || !sourceName) {
    return { ok: false, reason: "machine-not-found", customMachines };
  }
  const sourceCurrent = finite(source?.muraCoef);
  if (sourceCurrent === recommended) {
    return { ok: false, reason: "candidate-not-applicable", customMachines };
  }
  if (sourceCurrent === null || sourceCurrent !== current) {
    return { ok: false, reason: "stale-candidate", customMachines };
  }
  if (
    candidate?.machineModelName
    && source?.modelName
    && String(candidate.machineModelName) !== String(source.modelName)
  ) {
    return { ok: false, reason: "model-mismatch", customMachines };
  }

  const evidenceThroughDate = normalizeEvidenceDate(candidate?.evidenceThroughDate);
  if (!evidenceThroughDate) {
    return { ok: false, reason: "evidence-date-missing", customMachines };
  }
  const approvedDate = normalizeEvidenceDate(approvedAt);
  const effectiveFrom = [
    nextEvidenceDate(evidenceThroughDate),
    approvedDate,
  ].filter(Boolean).sort().at(-1) || "";
  if (!effectiveFrom) {
    return { ok: false, reason: "evidence-date-missing", customMachines };
  }
  const model = normalizeMachine(source);
  model.muraCoef = String(recommended);
  const override = buildMachineOverride(source, model);
  const existingHistory = calibrationHistory(source);
  const historyEntry = {
    id: `${approvedAt}:${candidate.method || "coverage-and-border-benchmark-v1"}`,
    approvedAt,
    effectiveFrom,
    evidenceThroughDate,
    sampleCount: Math.max(0, Math.floor(Number(candidate.n) || 0)),
    previousPriorBalls: sourceCurrent,
    appliedPriorBalls: recommended,
    method: candidate.method || "coverage-and-border-benchmark-v1",
    stores: [...new Set(Array.isArray(candidate.stores) ? candidate.stores.map(String) : [])],
  };
  const record = {
    ...override,
    id: source?.id ?? recordId,
    name: source.name,
    muraCoef: recommended,
    dataUpdatedAt: normalizeEvidenceDate(approvedAt) || evidenceThroughDate,
    pevidenceCalibrationHistory: [...existingHistory, historyEntry],
  };
  return {
    ok: true,
    reason: null,
    record,
    historyEntry,
    customMachines: upsertByIdentity(customMachines, record, source.name),
  };
}
