const QUALITY_VERSION = 1;

export const DATA_QUALITY_ACTIONS = Object.freeze({
  ACCEPTED: "accepted",
  DISMISSED: "dismissed",
  CORRECTED: "corrected",
  EXCLUDED: "excluded",
  INCLUDED: "included",
  RESTORED: "restored",
});

export const DATA_QUALITY_RULES = Object.freeze([
  {
    id: "missing-identity",
    label: "店舗・機種・台番号の入力",
    fields: ["storeId", "storeName", "machineName", "machineNum"],
    adoption: "未入力でも自動除外せず、予測へ使う前に確認を促す",
  },
  {
    id: "negative-value",
    label: "投資・回収・持ち玉・貯玉の負数",
    fields: ["investYen", "recoveryYen", "finalMochiBalls", "initialChodama", "finalChodama"],
    adoption: "負数は分析に使わず、修正または明示的な確認を促す",
  },
  {
    id: "settlement-balls",
    label: "持ち玉と回収額の整合",
    fields: ["finalMochiBalls", "recoveryYen", "settings.exRate"],
    adoption: "差が大きい場合も自動修正せず、根拠と修正候補を表示する",
  },
  {
    id: "store-rate",
    label: "記録と店舗設定の貸玉・交換率",
    fields: ["storeId", "settings.rentBalls", "settings.exRate"],
    adoption: "店舗設定との差を表示し、どちらを採用するかユーザーが決める",
  },
  {
    id: "session-time",
    label: "開始・終了時刻と実践時間",
    fields: ["sessionStartedAt", "sessionTargetEndAt", "playMinutes", "stats.netRot"],
    adoption: "時刻の逆転や極端な回転速度を確認対象にする",
  },
  {
    id: "duplicate-record",
    label: "同一日・店舗・機種・台番号の重複記録",
    fields: ["date", "storeId", "storeName", "machineName", "machineNum"],
    adoption: "重複候補を表示し、自動統合・自動削除はしない",
  },
]);

const finite = (value) => Number.isFinite(Number(value));
const nonNegative = (value) => finite(value) && Number(value) >= 0;
const normalized = (value) => String(value ?? "").trim().toLowerCase();
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

function getPath(object, path) {
  return String(path).split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = String(path).split(".");
  let target = object;
  keys.slice(0, -1).forEach((key) => {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  });
  target[keys.at(-1)] = value;
}

function archiveKey(archive) {
  return String(archive?.recordId ?? archive?.id ?? "archive");
}

function issue(archive, ruleId, {
  severity = "warning",
  possibility,
  evidence,
  impact,
  suggestions = [],
  fields = [],
  inferredValues = {},
}) {
  return {
    id: `${ruleId}:${archiveKey(archive)}`,
    ruleId,
    severity,
    possibility,
    evidence,
    impact,
    suggestions,
    fields,
    inferredValues,
  };
}

function selectedStore(archive, stores) {
  const list = Array.isArray(stores) ? stores : [];
  return list.find((store) => store && typeof store === "object" && (
    archive?.storeId != null && String(store.id) === String(archive.storeId)
  )) || list.find((store) => store && typeof store === "object"
    && normalized(store.name) === normalized(archive?.storeName)) || null;
}

function decisionFor(archive, ruleId) {
  const history = Array.isArray(archive?.dataQuality?.history) ? archive.dataQuality.history : [];
  return [...history].reverse().find((entry) => entry.ruleId === ruleId && (
    entry.action === DATA_QUALITY_ACTIONS.ACCEPTED
    || entry.action === DATA_QUALITY_ACTIONS.DISMISSED
    || entry.action === DATA_QUALITY_ACTIONS.EXCLUDED
    || entry.action === DATA_QUALITY_ACTIONS.INCLUDED
    || entry.action === DATA_QUALITY_ACTIONS.CORRECTED
  )) || null;
}

export function evaluateArchiveDataQuality(archive, { archives = [], stores = [] } = {}) {
  if (!archive || typeof archive !== "object") {
    return {
      version: QUALITY_VERSION,
      score: 0,
      predictionConfidence: null,
      issues: [],
      unresolvedIssues: [],
      adoption: { status: "review_required", explicitlyExcluded: false },
    };
  }

  const issues = [];
  const missing = [
    !normalized(archive.storeName) && archive.storeId == null ? "店舗" : "",
    !normalized(archive.machineName) ? "機種" : "",
    !normalized(archive.machineNum) ? "台番号" : "",
  ].filter(Boolean);
  if (missing.length) {
    issues.push(issue(archive, "missing-identity", {
      severity: "notice",
      possibility: `${missing.join("・")}が未入力の可能性`,
      evidence: `未入力項目: ${missing.join("、")}`,
      impact: "店舗別・機種別・台番号別の分析に正しく分類できない場合があります。",
      suggestions: ["記録編集で未入力項目を補う", "意図的な未入力なら「確認済み」にする"],
      fields: ["storeId", "storeName", "machineName", "machineNum"],
    }));
  }

  const numberFields = ["investYen", "recoveryYen", "finalMochiBalls", "initialChodama", "finalChodama"];
  const negatives = numberFields.filter((path) => finite(getPath(archive, path)) && Number(getPath(archive, path)) < 0);
  if (negatives.length) {
    issues.push(issue(archive, "negative-value", {
      severity: "warning",
      possibility: "玉数または金額が負数になっています",
      evidence: negatives.map((path) => `${path}=${getPath(archive, path)}`).join("、"),
      impact: "収支・持ち玉比率・店舗資産の集計が反転する可能性があります。",
      suggestions: ["0以上の実測値へ修正する"],
      fields: negatives,
    }));
  }

  const finalMochi = Number(archive.finalMochiBalls ?? archive.yutimeContext?.finalMochiBalls);
  const recovery = Number(archive.recoveryYen);
  const exRate = Number(archive.settings?.exRate);
  if (finalMochi > 0 && recovery >= 0 && exRate > 0) {
    const inferredRecovery = Math.round(finalMochi * (1000 / exRate));
    const difference = Math.abs(inferredRecovery - recovery);
    const tolerance = Math.max(1000, Math.round(inferredRecovery * 0.2));
    if (difference > tolerance) {
      issues.push(issue(archive, "settlement-balls", {
        severity: "warning",
        possibility: "持ち玉と回収額が一致していない可能性",
        evidence: `${finalMochi.toLocaleString()}玉 × 1玉${(1000 / exRate).toFixed(2)}円 ≒ ${inferredRecovery.toLocaleString()}円、保存回収額 ${Math.round(recovery).toLocaleString()}円`,
        impact: "実収支と店舗・機種別の成績がずれる可能性があります。",
        suggestions: ["実際の精算額を確認する", `回収額を${inferredRecovery.toLocaleString()}円へ修正する`],
        fields: ["finalMochiBalls", "recoveryYen", "settings.exRate"],
        inferredValues: { recoveryYen: inferredRecovery },
      }));
    }
  }

  const store = selectedStore(archive, stores);
  if (store) {
    const rateDiffs = [];
    if (Number(store.rentBalls) > 0 && Number(archive.settings?.rentBalls) > 0
      && Number(store.rentBalls) !== Number(archive.settings.rentBalls)) {
      rateDiffs.push(`貸玉 ${archive.settings.rentBalls}→店舗設定 ${store.rentBalls}`);
    }
    if (Number(store.exRate) > 0 && Number(archive.settings?.exRate) > 0
      && Number(store.exRate) !== Number(archive.settings.exRate)) {
      rateDiffs.push(`交換 ${archive.settings.exRate}→店舗設定 ${store.exRate}`);
    }
    if (rateDiffs.length) {
      issues.push(issue(archive, "store-rate", {
        severity: "notice",
        possibility: "実践記録と現在の店舗レートが異なります",
        evidence: rateDiffs.join("、"),
        impact: "当時のレート変更なら正常です。誤入力の場合は収支換算がずれます。",
        suggestions: ["実践当時のレートなら「確認済み」にする", "誤入力なら記録のレートを修正する"],
        fields: ["storeId", "settings.rentBalls", "settings.exRate"],
        inferredValues: { "settings.rentBalls": store.rentBalls, "settings.exRate": store.exRate },
      }));
    }
  }

  const startedAt = Date.parse(archive.sessionStartedAt || "");
  const targetEndAt = Date.parse(archive.sessionTargetEndAt || "");
  if (Number.isFinite(startedAt) && Number.isFinite(targetEndAt) && targetEndAt <= startedAt) {
    issues.push(issue(archive, "session-time", {
      severity: "warning",
      possibility: "終了予定時刻が開始時刻より前です",
      evidence: `開始 ${archive.sessionStartedAt} / 終了 ${archive.sessionTargetEndAt}`,
      impact: "実践時間・時給・閉店までの予測が正しく計算できません。",
      suggestions: ["開始・終了時刻を確認する"],
      fields: ["sessionStartedAt", "sessionTargetEndAt"],
    }));
  } else {
    const minutes = Number(archive.playMinutes)
      || (Number.isFinite(startedAt) && Number.isFinite(targetEndAt) ? (targetEndAt - startedAt) / 60000 : 0);
    const netRot = Number(archive.stats?.netRot);
    const rotationsPerHour = minutes > 0 && netRot >= 0 ? netRot / (minutes / 60) : null;
    if (rotationsPerHour != null && (rotationsPerHour < 20 || rotationsPerHour > 600)) {
      issues.push(issue(archive, "session-time", {
        severity: "notice",
        possibility: "通常回転数と実践時間の組み合わせが極端です",
        evidence: `${Math.round(netRot).toLocaleString()}回 / ${Math.round(minutes)}分 = 約${Math.round(rotationsPerHour)}回/時`,
        impact: "時給・稼働時間の分析が実態とずれる可能性があります。",
        suggestions: ["回転数と実践時間を確認する", "休憩を含む実践なら「確認済み」にする"],
        fields: ["playMinutes", "stats.netRot"],
      }));
    }
  }

  const duplicate = (Array.isArray(archives) ? archives : []).find((candidate) => {
    if (!candidate || candidate === archive || String(candidate.id) === String(archive.id)) return false;
    return normalized(candidate.date) === normalized(archive.date)
      && normalized(candidate.storeName) === normalized(archive.storeName)
      && normalized(candidate.machineName) === normalized(archive.machineName)
      && normalized(candidate.machineNum) === normalized(archive.machineNum);
  });
  if (duplicate) {
    issues.push(issue(archive, "duplicate-record", {
      severity: "notice",
      possibility: "同じ実践を二重保存した可能性",
      evidence: `${archive.date || "日付未入力"} / ${archive.storeName || "店舗未入力"} / ${archive.machineName || "機種未入力"} / ${archive.machineNum || "台番号未入力"}`,
      impact: "収支・期待値・勝率が二重集計される可能性があります。",
      suggestions: ["別セッションなら「確認済み」にする", "重複なら片方を削除する"],
      fields: ["date", "storeId", "storeName", "machineName", "machineNum"],
    }));
  }

  const decorated = issues.map((item) => ({ ...item, decision: decisionFor(archive, item.ruleId) }));
  const unresolvedIssues = decorated.filter((item) => !item.decision || item.decision.action === DATA_QUALITY_ACTIONS.INCLUDED);
  const penalties = decorated.reduce((sum, item) => sum + (item.severity === "warning" ? 18 : 8), 0);
  const history = Array.isArray(archive.dataQuality?.history) ? archive.dataQuality.history : [];
  const explicit = [...history].reverse().find((entry) => (
    entry.action === DATA_QUALITY_ACTIONS.EXCLUDED || entry.action === DATA_QUALITY_ACTIONS.INCLUDED
  ));
  const explicitlyExcluded = explicit?.action === DATA_QUALITY_ACTIONS.EXCLUDED;

  return {
    version: QUALITY_VERSION,
    score: Math.max(0, 100 - penalties),
    // 予測信頼度とは別指標。ここから予測信頼度を算出しない。
    predictionConfidence: null,
    issues: decorated,
    unresolvedIssues,
    adoption: {
      status: explicitlyExcluded ? "excluded" : unresolvedIssues.length ? "review_required" : "included",
      explicitlyExcluded,
      rule: "自動除外しない。除外はユーザーが明示した場合だけ行う。",
    },
  };
}

export function attachDataQualitySnapshot(archive, context = {}) {
  const next = clone(archive);
  const result = evaluateArchiveDataQuality(next, context);
  next.dataQuality = {
    ...(next.dataQuality || {}),
    version: QUALITY_VERSION,
    score: result.score,
    predictionConfidence: null,
    lastEvaluatedAt: context.at || new Date().toISOString(),
    issueSnapshot: result.issues.map((item) => Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "decision"),
    )),
    adoption: result.adoption,
    originalValues: next.dataQuality?.originalValues || {},
    inferredValues: Object.assign({}, ...result.issues.map((item) => item.inferredValues || {})),
    history: Array.isArray(next.dataQuality?.history) ? next.dataQuality.history : [],
  };
  return next;
}

export function recordDataQualityDecision(archive, {
  ruleId,
  action,
  at = new Date().toISOString(),
  note = "",
} = {}, context = {}) {
  const allowed = new Set([
    DATA_QUALITY_ACTIONS.ACCEPTED,
    DATA_QUALITY_ACTIONS.DISMISSED,
    DATA_QUALITY_ACTIONS.EXCLUDED,
    DATA_QUALITY_ACTIONS.INCLUDED,
  ]);
  if (!allowed.has(action)) return clone(archive);
  const next = clone(archive);
  const history = Array.isArray(next.dataQuality?.history) ? next.dataQuality.history : [];
  next.dataQuality = {
    ...(next.dataQuality || {}),
    history: [...history, {
      id: `quality-${Date.now()}-${history.length}`,
      kind: "decision",
      ruleId: ruleId || "archive",
      action,
      at,
      note,
    }],
  };
  return attachDataQualitySnapshot(next, { ...context, at });
}

export function recordArchiveCorrections(previousArchive, nextArchive, {
  fields = [
    "storeId",
    "storeName",
    "machineName",
    "machineNum",
    "investYen",
    "recoveryYen",
    "finalMochiBalls",
    "settings.rentBalls",
    "settings.exRate",
    "playMinutes",
  ],
  at = new Date().toISOString(),
} = {}, context = {}) {
  const next = clone(nextArchive);
  const before = {};
  const after = {};
  fields.forEach((path) => {
    const previousValue = getPath(previousArchive, path);
    const nextValue = getPath(next, path);
    if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) return;
    before[path] = clone(previousValue);
    after[path] = clone(nextValue);
  });
  if (!Object.keys(before).length) return attachDataQualitySnapshot(next, { ...context, at });

  const currentQuality = next.dataQuality || previousArchive?.dataQuality || {};
  const originalValues = { ...(currentQuality.originalValues || {}) };
  Object.entries(before).forEach(([path, value]) => {
    if (!(path in originalValues)) originalValues[path] = clone(value);
  });
  const history = Array.isArray(currentQuality.history) ? currentQuality.history : [];
  next.dataQuality = {
    ...currentQuality,
    originalValues,
    currentValues: { ...(currentQuality.currentValues || {}), ...after },
    history: [...history, {
      id: `quality-correction-${Date.now()}-${history.length}`,
      kind: "correction",
      ruleId: "manual-correction",
      action: DATA_QUALITY_ACTIONS.CORRECTED,
      at,
      before,
      after,
    }],
  };
  return attachDataQualitySnapshot(next, { ...context, at });
}

export function restoreArchiveCorrection(archive, correctionId, context = {}) {
  const next = clone(archive);
  const history = Array.isArray(next.dataQuality?.history) ? next.dataQuality.history : [];
  const correction = history.find((entry) => entry.id === correctionId && entry.kind === "correction");
  if (!correction) return next;
  Object.entries(correction.before || {}).forEach(([path, value]) => setPath(next, path, clone(value)));
  next.dataQuality = {
    ...(next.dataQuality || {}),
    history: [...history, {
      id: `quality-restore-${Date.now()}-${history.length}`,
      kind: "restore",
      ruleId: correction.ruleId,
      action: DATA_QUALITY_ACTIONS.RESTORED,
      restoredCorrectionId: correctionId,
      at: context.at || new Date().toISOString(),
    }],
  };
  return attachDataQualitySnapshot(next, context);
}

export function shouldUseArchiveForPrediction(archive) {
  const history = Array.isArray(archive?.dataQuality?.history) ? archive.dataQuality.history : [];
  const explicit = [...history].reverse().find((entry) => (
    entry.action === DATA_QUALITY_ACTIONS.EXCLUDED || entry.action === DATA_QUALITY_ACTIONS.INCLUDED
  ));
  return explicit?.action !== DATA_QUALITY_ACTIONS.EXCLUDED;
}

export function hasUsableSettlementValues(archive) {
  return nonNegative(archive?.investYen) && nonNegative(archive?.recoveryYen);
}
