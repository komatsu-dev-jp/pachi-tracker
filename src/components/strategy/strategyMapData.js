// 保存済み差玉解析（pt_deltaScans）から戦略マップ表示データを作る純粋関数。
// 仮データ・乱数は使わない。Google Sheets への通信も行わない。

import { machineDB } from "../../machineDB.js";
import {
  buildDeltaEvidence,
  collectDeltaRows,
  findMachineSpec,
} from "../delta/deltaEvidence.js";
import { buildPEvidenceAnalytics } from "../evidence/pevidenceAnalytics.js";
import { getStoreIslands } from "../select/hallMapSelectors.js";

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function classify(borderDiff, confidence) {
  if (confidence < 20) return "nodata";
  if (borderDiff >= 0.5) return "strong";
  if (borderDiff >= -0.4) return "watch";
  return "weak";
}

function scoreOf(machine) {
  return Number(machine.goodMachineScore || 0);
}

function evPerHourOf(rotation, border) {
  if (!(rotation > 0) || !(border > 0)) return 0;
  const evPerK = ((rotation - border) / border) * 1000;
  return Math.round(evPerK * (210 / rotation));
}

function emptyMap(playingNum) {
  return {
    source: "delta",
    machineName: "差玉データなし",
    total: 0,
    border: 0,
    islands: [],
    all: [],
    candidates: [],
    top5: [],
    kpi: { evPerHour: 0, rot: 0, confidence: 0, candidates: 0 },
    leadId: null,
    playingNum,
    islandAvgRot: () => 0,
    analytics: null,
    portfolio: { plan: [], totalHours: 0, expectedProfit: 0 },
    aiProfile: { overall: { rate: 0, count: 0 }, profiles: [] },
    nextMap: [],
    islandStats: [],
  };
}

function latestScanGroup(scans) {
  const valid = (scans || []).filter((scan) => Array.isArray(scan?.rows) && scan.rows.length);
  if (!valid.length) return [];
  const latest = [...valid].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) ||
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  )[0];
  return valid.filter((scan) =>
    String(scan.storeId ?? scan.storeName ?? "") === String(latest.storeId ?? latest.storeName ?? "") &&
    String(scan.date || "") === String(latest.date || "")
  );
}

function historyFor(scans, machineName, num, machine) {
  const byDate = new Map();
  for (const row of collectDeltaRows(scans, { machineName, num })) {
    if (!byDate.has(row.date)) byDate.set(row.date, []);
    byDate.get(row.date).push(row);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .slice(-7)
    .map(([, rows]) => round1(buildDeltaEvidence(rows, machine).predictedRotation));
}

function islandGrade(goodRate) {
  if (goodRate >= 0.5) return "A-";
  if (goodRate >= 0.38) return "B+";
  if (goodRate >= 0.28) return "B";
  if (goodRate >= 0.18) return "C+";
  return "C";
}

function summarizeIsland(island) {
  const list = island.machines;
  const strong = list.filter((machine) => machine.verdict === "strong");
  const goodRate = list.length ? strong.length / list.length : 0;
  const best = [...list].sort((a, b) => b.score - a.score)[0] || null;
  return {
    ...island,
    grade: islandGrade(goodRate),
    goodRate: Math.round(goodRate * 100),
    candidates: strong.length,
    evDensity: strong.length
      ? Math.round(strong.reduce((sum, machine) => sum + machine.evPerHour, 0) / strong.length)
      : 0,
    strongZone: best ? `${best.num}番周辺` : "—",
  };
}

// 島マップ管理で登録した順番と台番号範囲を、分析結果へ重ねる。
// 分析データがない台も画面上では灰色で残せるよう、start/end を必ず返す。
function applyHallLayout(analyzedIslands, hallIslands) {
  if (!hallIslands.length) return analyzedIslands;
  const used = new Set();
  const laidOut = hallIslands.map((layout, order) => {
    const matched = analyzedIslands.find((island) => {
      if (used.has(island.id)) return false;
      if (String(island.name) === String(layout.name)) return true;
      return island.machines.some((machine) => {
        const num = Number(machine.num);
        const machineMatches = !layout.machineName || machine.machineName === layout.machineName;
        return machineMatches && num >= layout.start && num <= layout.end;
      });
    });
    if (matched) used.add(matched.id);
    return {
      ...(matched || summarizeIsland({ id: layout.name || layout.id, name: layout.name, machines: [] })),
      layoutId: layout.id,
      name: layout.name || matched?.name || `島${order + 1}`,
      machineName: layout.machineName || matched?.machineName || "",
      start: layout.start,
      end: layout.end,
      layoutOrder: order,
      registeredLayout: true,
    };
  });
  const extras = analyzedIslands
    .filter((island) => !used.has(island.id))
    .map((island, index) => ({
      ...island,
      end: Math.max(...island.machines.map((machine) => Number(machine.num) || 0)),
      layoutOrder: laidOut.length + index,
      registeredLayout: false,
    }));
  return [...laidOut, ...extras];
}

export function buildStrategyMap({
  playingNum = null,
  scans = [],
  customMachines = [],
  hallMaps = {},
  selectedStoreId = null,
} = {}) {
  const currentScans = latestScanGroup(scans);
  if (!currentScans.length) return emptyMap(playingNum);

  const analysisStoreId = currentScans[0]?.storeId ?? selectedStoreId;
  const hallIslands = getStoreIslands(hallMaps, analysisStoreId);
  // ポートフォリオ・翌日予測に他店舗の台が混ざらないよう、
  // 解析対象は表示中の店舗（最新スキャンの店舗）の履歴に限定する。
  const analysisStoreKey = String(currentScans[0]?.storeId ?? currentScans[0]?.storeName ?? "");
  const storeScans = (scans || []).filter((scan) =>
    String(scan?.storeId ?? scan?.storeName ?? "") === analysisStoreKey
  );
  const analytics = buildPEvidenceAnalytics({ scans: storeScans, customMachines, islands: hallIslands });
  const analyticsByMachine = new Map(analytics.latestRows.map((item) => [
    `${item.store}___${item.machineName}___${item.num}`,
    item,
  ]));

  const currentRows = currentScans.flatMap((scan) =>
    (scan.rows || []).map((row) => ({
      ...row,
      machineName: row.machineName || scan.machineName || "",
      island: row.island || `${row.machineName || scan.machineName || "未分類"}島`,
      storeId: scan.storeId,
      storeName: scan.storeName,
    }))
  );
  const uniqueRows = new Map();
  for (const row of currentRows) uniqueRows.set(`${row.machineName}:${row.num}`, row);

  const islandMap = new Map();
  for (const row of uniqueRows.values()) {
    const machineName = row.machineName;
    const machineSpec = findMachineSpec(machineName, customMachines, machineDB);
    if (!machineSpec) continue;
    const historyRows = collectDeltaRows(scans, {
      storeId: row.storeId,
      storeName: row.storeId == null ? row.storeName : "",
      machineName,
      num: row.num,
    });
    const evidence = buildDeltaEvidence(historyRows, machineSpec);
    const rowStore = String(row.storeId ?? row.storeName ?? "").trim();
    const pe = analyticsByMachine.get(`${rowStore}___${machineName}___${String(row.num).replace(/_旧.*/, "").trim()}`);
    const predictedRotation = pe?.valid ? pe.predictedRotation : evidence.predictedRotation;
    const trueBorder = pe?.valid ? pe.border : evidence.trueBorder;
    const confidence = pe?.valid ? pe.confidence : evidence.confidence;
    const confidencePct = Math.round(confidence * 100);
    const borderDiff = round1(pe?.valid ? pe.borderDifference : (evidence.borderDifference || 0));
    const verdict = pe?.valid ? pe.verdict : classify(borderDiff, confidencePct);
    const islandName = row.island || `${machineName}島`;
    const islandId = islandName;
    const history = historyFor(scans, machineName, row.num, machineSpec);
    const machine = {
      id: `m-${machineName}-${row.num}`,
      num: Number(row.num) || row.num,
      islandId,
      machineName,
      rot: round1(predictedRotation),
      confidence: confidencePct,
      border: round1(trueBorder),
      borderDiff,
      goodMachineScore: round1(pe?.valid ? pe.score : evidence.goodMachineScore),
      score: 0,
      evPerHour: pe?.valid ? pe.hourly : evPerHourOf(predictedRotation, trueBorder),
      verdict,
      isStar: verdict === "strong" && (pe?.score ?? evidence.goodMachineScore) >= 50,
      isPlaying: playingNum != null && String(row.num) === String(playingNum),
      history: history.length > 1
        ? history
        : [history[0] ?? round1(evidence.predictedRotation), history[0] ?? round1(evidence.predictedRotation)],
      evidence,
      pevidence: pe || null,
      ema: round1(pe?.ema || 0),
      cusumUp: round1(pe?.cusumUp || 0),
      cusumDown: round1(pe?.cusumDown || 0),
      nailAlert: pe?.nailAlert || "データ収集中",
      regimeStart: pe?.regimeStart || "",
      tomorrowTight: Math.round((pe?.tightProbability || 0) * 100),
      weekdayTight: Math.round((pe?.weekdayTightRate || 0) * 100),
      weekdaySamples: pe?.weekdaySampleCount || 0,
      winRate: Math.round((pe?.winRate || 0) * 100),
      unitPrice: pe?.unitPrice || 0,
      daily: pe?.daily || 0,
      hourlyLow: pe?.hourlyLow || 0,
      hourlyHigh: pe?.hourlyHigh || 0,
      dailyLow: pe?.dailyLow || 0,
      dailyHigh: pe?.dailyHigh || 0,
      hourlyRisk: pe?.hourlyRisk || 0,
      dailyRisk: pe?.dailyRisk || 0,
      sharpe: round1(pe?.sharpe || 0),
      spatialAlert: pe?.spatial?.label || "隣接情報なし",
      oppositeAlert: pe?.opposite?.label || "対面情報なし",
      nextPrediction: analytics.nextMap.find((item) =>
        String(item.number) === String(row.num) &&
        item.machineName === machineName &&
        String(item.store ?? "") === rowStore
      )?.prediction || "データ収集中",
    };
    machine.score = scoreOf(machine);
    if (!islandMap.has(islandId)) islandMap.set(islandId, { id: islandId, name: islandName, machines: [] });
    islandMap.get(islandId).machines.push(machine);
  }

  const analyzedIslands = [...islandMap.values()].map((island) => summarizeIsland({
    ...island,
    machines: island.machines.sort((a, b) => Number(a.num) - Number(b.num)),
    start: Math.min(...island.machines.map((machine) => Number(machine.num) || 0)),
  }));
  const islands = applyHallLayout(analyzedIslands, hallIslands);
  const all = islands.flatMap((island) => island.machines);
  if (!all.length) return emptyMap(playingNum);
  const candidates = all.filter((machine) => machine.verdict === "strong");
  const top5 = [...all]
    .filter((machine) => machine.verdict !== "nodata")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((machine, index) => ({ ...machine, rank: index + 1 }));
  const lead = top5[0] || [...all].sort((a, b) => b.confidence - a.confidence)[0];
  const machineNames = [...new Set(all.map((machine) => machine.machineName))];
  const islandAvgRot = (id) => {
    const list = all.filter((machine) => machine.islandId === id && machine.rot > 0);
    return list.length ? round1(list.reduce((sum, machine) => sum + machine.rot, 0) / list.length) : 0;
  };

  return {
    source: "delta",
    machineName: machineNames.length === 1 ? machineNames[0] : `${machineNames.length}機種`,
    total: all.length,
    border: lead?.border || 0,
    islands,
    all,
    candidates,
    top5,
    kpi: {
      evPerHour: lead?.evPerHour || 0,
      rot: lead?.rot || 0,
      confidence: lead?.confidence || 0,
      candidates: candidates.length,
    },
    leadId: lead?.id || null,
    islandAvgRot,
    analytics,
    portfolio: analytics.portfolio,
    aiProfile: analytics.aiProfile,
    nextMap: analytics.nextMap,
    islandStats: analytics.islandStats,
  };
}
