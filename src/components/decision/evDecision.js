// src/components/decision/evDecision.js
// 純粋関数。React/DOM/localStorage 依存ゼロ。
// opts パラメータは将来の riskAdjusted 切替のために予約（Step 2 以降で追加予定）。

function calcConfidence(ev) {
  if (ev?.evidence?.hasEstimate && Number.isFinite(Number(ev.evidence.confidence))) {
    const total = Math.min(1, Math.max(0, Number(ev.evidence.confidence)));
    // P-EVIDENCE有効時: rot=実戦投入玉由来 / jp=保存済み差玉解析由来。
    // ラベルもUI（ConfidenceBar）でこの意味に合わせて表示する。
    return {
      rot: Math.min(1, Math.max(0, Number(ev.evidence.liveConfidence) || 0)),
      jp: Math.min(1, Math.max(0, Number(ev.evidence.deltaConfidence) || 0)),
      total,
      rotLabel: "実戦",
      jpLabel: "差玉",
    };
  }
  const rotConf = Math.min((ev.netRot ?? 0) / 1500, 1.0);
  const jpConf  = Math.min((ev.jpCount ?? 0) / 5, 1.0);
  return {
    rot: rotConf,
    jp: jpConf,
    total: rotConf * 0.7 + jpConf * 0.3,
    rotLabel: "回転",
    jpLabel: "大当り",
  };
}

/**
 * EV と統計から判断を返す。
 * 純粋関数。React/DOM/localStorage 依存ゼロ。
 *
 * @param {object} ev - calcPreciseEV の戻り値
 * @returns {{
 *   verdict: "continue_strong" | "continue" | "hold" | "stop",
 *   confidence: number,
 *   confidenceParts: { rot: number, jp: number },
 *   reasons: Array<{ ok: boolean, text: string }>,
 *   evAdjusted: number,
 * }}
 */
export function evDecision(ev) {
  const safeEv = ev || {};
  const conf = calcConfidence(safeEv);
  // 上皿補正後の値を判断に使用（Step 2b）
  // 生の値（ev1K / bDiff）は UI 表示用に保持される
  const evidence = safeEv.evidence?.hasEstimate ? safeEv.evidence : null;
  const evidenceEv = evidence?.trueBorder > 0
    ? ((evidence.predictedRotation - evidence.trueBorder) / evidence.trueBorder) * 1000
    : null;
  const evAdj = evidenceEv ?? safeEv.effectiveEV1K ?? safeEv.ev1KCorrected ?? safeEv.ev1K ?? 0;
  const bDiff = evidence?.borderDifference ?? safeEv.effectiveBDiff ?? safeEv.bDiffCorrected ?? safeEv.bDiff ?? 0;
  const netRot = safeEv.netRot ?? 0;
  const jpCount = safeEv.jpCount ?? 0;

  // データ不足（回転数ゼロ）は安全側（ヤメ）に倒す
  if (!netRot && !evidence) {
    return {
      verdict: "stop",
      confidence: 0,
      confidenceParts: { rot: 0, jp: 0, rotLabel: "回転", jpLabel: "大当り" },
      reasons: [{ ok: false, text: "データ不足のため判断不可（回転数入力が必要です）" }],
      evAdjusted: 0,
    };
  }

  let verdict;
  if (evAdj > 300 && conf.total > 0.5 && bDiff > 2.0) verdict = "continue_strong";
  else if (evAdj > 100 && conf.total > 0.4 && bDiff > 0.5) verdict = "continue";
  else if (evAdj >= -50 && evAdj <= 100 && conf.total > 0.3) verdict = "hold";
  else if (evAdj < -50 || bDiff < -1.0) verdict = "stop";
  else verdict = "hold";

  const sign = (v) => (v >= 0 ? "+" : "");
  const reasons = [
    { ok: evAdj > 100,      text: `EV/K ${sign(evAdj)}${Math.round(evAdj)}円（基準 +100超え）` },
    { ok: bDiff > 0.5,      text: `ボーダー差 ${sign(bDiff)}${bDiff.toFixed(1)}回/K（基準 +0.5超え）` },
    { ok: conf.total > 0.4, text: `信頼度 ${Math.round(conf.total * 100)}%（基準 40%以上）` },
    evidence
      ? {
          ok: (evidence.delta?.observationCount || 0) >= 2 || netRot >= 1500,
          text: `差玉記録 ${evidence.delta?.observationCount || 0}件 / 実戦 ${netRot}回転`,
        }
      : { ok: jpCount >= 5, text: `大当り ${jpCount}回（信頼度基準 5回以上）` },
  ];

  return {
    verdict,
    confidence: conf.total,
    confidenceParts: { rot: conf.rot, jp: conf.jp, rotLabel: conf.rotLabel, jpLabel: conf.jpLabel },
    reasons,
    evAdjusted: evAdj,
  };
}
