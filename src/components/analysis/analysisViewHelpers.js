import { archiveWorkMinutes, getActualPL, getEvAmount } from "./analysisSelectors.js";
import { getSpinRate } from "./analyzerSelectors.js";

export function buildMachineSessions(archives, machineName) {
  return (Array.isArray(archives) ? archives : []).filter((archive) => String(archive?.machineName || "") === String(machineName || "")).map((archive) => ({
    key: archive.id ?? `${archive.date}-${archive.time}`, sortKey: `${archive.date || ""}_${archive.id ?? 0}`, date: archive.date, store: archive.storeName || "未設定", pl: getActualPL(archive), ev: getEvAmount(archive), invest: Number(archive.investYen) || 0, recovery: Number(archive.recoveryYen) || 0, spin: getSpinRate(archive), hours: archiveWorkMinutes(archive) / 60, netRot: Number(archive?.stats?.netRot) || 0, machineNum: archive.machineNum != null ? String(archive.machineNum) : "",
  })).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

export function getActualWageDisplay(archive, actual = (Number(archive?.recoveryYen) || 0) - (Number(archive?.investYen) || 0) - (Number(archive?.chodamaYen) || 0)) {
  const minutes = archiveWorkMinutes(archive);
  if (minutes < 30) return { visible: false, value: null, minutes };
  return { visible: true, value: Math.round(actual / (minutes / 60)), minutes };
}

export const getActualHourlyDisplay = getActualWageDisplay;
