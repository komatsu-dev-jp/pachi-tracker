// 上限切れ差玉の「参考候補」を、同じ日の確定グラフ・台データ・機種マスタから作る。
// 候補は最終差玉の観測値ではないため、必ず requiresReview=true のまま返す。

import {
  findMachineSpec,
  machineBorder,
  resolveMachineStats,
} from "./deltaEvidence.js";
import { isBoundedDeltaRow } from "./deltaBounded.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round500(value) {
  const rounded = Math.round(value / 500) * 500;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sameMachine(left, right) {
  return String(left || "").normalize("NFKC").replace(/\s+/gu, "").toLowerCase()
    === String(right || "").normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function trustedAuditFields(audit, fields) {
  const accepted = audit?.fieldAccepted;
  if (fields.some((field) => accepted?.[field] === false)) return false;
  if (fields.every((field) => accepted?.[field] === true)) return true;
  const sourceType = String(audit?.sourceType || "").toLowerCase();
  return ["pdf", "csv"].includes(sourceType)
    && audit?.structuredRowTrusted === true
    && audit?.reviewRequired !== true;
}

function exactPeerRotation(row) {
  // 推定・手修正を次の推定教師へ戻すと循環証拠になるため、
  // ピクセル解析がそのままokにしたグラフだけを教師にする。
  const statusIsExact = row?.status === "ok"
    && !["manual-review", "assisted-review", "import"].includes(row?.valueSource);
  const delta = finite(row?.val);
  const normalSpins = finite(row?.normalSpins);
  const totalStarts = finite(row?.totalStarts);
  const audit = row?.taiImportAudit;
  const tableFieldsTrusted = trustedAuditFields(audit, ["normalSpins", "totalStarts"]);
  const jointTrusted = row?.jointMatch?.accepted === true
    && audit?.jointMatchAccepted === true;
  if (!statusIsExact || !tableFieldsTrusted || !jointTrusted
    || delta === null || delta >= 0 || !(normalSpins > 0) || totalStarts !== 0) return null;
  const rate = normalSpins * 250 / Math.abs(delta);
  return rate >= 5 && rate <= 45 ? rate : null;
}

export function buildClippedDeltaSuggestion(row, rows, customMachines = [], builtInMachines = []) {
  if (!isBoundedDeltaRow(row) || row?.deltaRange?.kind !== "censored-top") return null;
  const boundaryValue = finite(row.deltaRange.boundaryValue);
  const observedCandidate = finite(row.deltaRange.observedCandidate);
  const normalSpins = finite(row?.normalSpins);
  const totalStarts = finite(row?.totalStarts);
  const maxPayout = finite(row?.maxPayout);
  if (boundaryValue === null || !(normalSpins >= 0) || !(totalStarts >= 0)) return null;

  const audit = row?.taiImportAudit;
  const tableFieldsTrusted = trustedAuditFields(
    audit,
    ["normalSpins", "totalStarts", "maxPayout"],
  );
  const graphMaxPayout = finite(audit?.graphMaxPayout);
  const importedMaxPayout = finite(audit?.importedMaxPayout);
  const highestOutputTrusted = audit?.graphMaxPayoutAccepted === true
    && audit?.importedMaxPayoutAccepted === true
    && maxPayout !== null
    && graphMaxPayout === maxPayout
    && importedMaxPayout === maxPayout;
  if (row?.jointMatch?.accepted !== true
    || audit?.jointMatchAccepted !== true
    || !tableFieldsTrusted
    || !highestOutputTrusted) return null;

  const machineName = String(row?.machineName || "").trim();
  const machine = findMachineSpec(machineName, customMachines, builtInMachines);
  if (!machine) return null;
  const stats = resolveMachineStats(machine);
  if (!(stats.avgPayout > 0)) return null;

  const peerRows = (Array.isArray(rows) ? rows : []).filter((peer) => (
    String(peer?.num ?? "") !== String(row?.num ?? "")
    && sameMachine(peer?.machineName, machineName)
  ));
  const peerEvidence = peerRows.map((peer) => ({
    num: String(peer?.num ?? ""),
    rate: exactPeerRotation(peer),
  })).filter((peer) => peer.rate !== null);
  const peerRotation = median(peerEvidence.map((peer) => peer.rate));
  const fallbackRotation = machineBorder(machine);
  const rotation = peerEvidence.length >= 2 && peerRotation !== null ? peerRotation : fallbackRotation;
  if (!(rotation >= 5 && rotation <= 45)) return null;

  const inputBalls = normalSpins * 250 / rotation;
  const payoutCandidate = totalStarts * stats.avgPayout - inputBalls;
  const plausibilityFloor = Math.min(
    boundaryValue,
    observedCandidate === null ? boundaryValue : observedCandidate,
  ) - 1000;
  if (!Number.isFinite(payoutCandidate)
    || payoutCandidate < plausibilityFloor) return null;

  const rawValue = payoutCandidate;
  const value = round500(rawValue);
  const confidence = peerEvidence.length >= 2 ? "medium" : "low";

  return {
    value,
    lower: null,
    upper: null,
    boundaryValue,
    observedCandidate,
    confidence,
    requiresReview: true,
    autoConfirm: false,
    method: "site-seven-joint-clipped-v1",
    basis: {
      machineName: machine?.name || machineName,
      normalSpins,
      totalStarts,
      maxPayout,
      averagePayoutPerHit: stats.avgPayout,
      assumedRotation: Math.round(rotation * 10) / 10,
      rotationSource: peerEvidence.length >= 2 ? "same-day-zero-hit-peers" : "machine-border",
      peerNumbers: peerEvidence.map((peer) => peer.num),
      payoutCandidate: round500(payoutCandidate),
      graphObservation: row?.boundaryObservation
        ? { ...row.boundaryObservation }
        : row?.rawGraphCandidate?.boundaryObservation
          ? { ...row.rawGraphCandidate.boundaryObservation }
          : null,
    },
  };
}
