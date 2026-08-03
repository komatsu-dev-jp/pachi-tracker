// A deliberately small, side-effect free correction model. UI callers keep the
// snapshot / persistence boundary; this module either returns a complete next
// value or an error without changing the supplied records.

const MODES = new Set(["cash", "mochi", "chodama"]);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const cloneRow = (row) => ({ ...row });

export function createRotationModeFingerprint(row, index) {
  return {
    index,
    mode: row?.mode,
    cumRot: row?.cumRot,
    thisRot: row?.thisRot,
    invest: row?.invest,
    ballsConsumed: row?.ballsConsumed,
  };
}

export function matchesRotationModeFingerprint(rows, fingerprint) {
  const row = rows?.[fingerprint?.index];
  if (!row) return false;
  return ["mode", "cumRot", "thisRot", "invest", "ballsConsumed"].every((key) => row[key] === fingerprint[key]);
}

export function createArchiveCorrectionFingerprint(archive) {
  return {
    id: archive?.id,
    rotRows: JSON.stringify(archive?.rotRows),
    investYen: archive?.investYen,
    rawInvest: archive?.stats?.rawInvest,
    carriedInYen: archive?.carriedInYen,
    yutimeRuns: JSON.stringify(archive?.yutimeRuns),
  };
}

export function matchesArchiveCorrectionFingerprint(archive, fingerprint) {
  return archive?.id === fingerprint?.id
    && JSON.stringify(archive?.rotRows) === fingerprint?.rotRows
    && archive?.investYen === fingerprint?.investYen
    && archive?.stats?.rawInvest === fingerprint?.rawInvest
    && archive?.carriedInYen === fingerprint?.carriedInYen
    && JSON.stringify(archive?.yutimeRuns) === fingerprint?.yutimeRuns;
}

export function isEditableRotationModeRow(row) {
  return row?.type === "data" && finite(row.thisRot) && row.thisRot > 0 && MODES.has(row.mode);
}

export function resolveNextPlayMode({ playMode, currentMochiBalls, currentChodama }) {
  if (playMode === "cash") return "cash";
  const mochi = Number(currentMochiBalls);
  const chodama = Number(currentChodama);
  if (playMode === "mochi" && finite(mochi) && mochi > 0) return "mochi";
  if ((playMode === "mochi" || playMode === "chodama") && finite(chodama) && chodama > 0) return "chodama";
  return "cash";
}

function failure(reason) {
  return { ok: false, reason };
}

function priorInvest(rows, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i]?.type === "data") return rows[i].invest;
  }
  return 0;
}

function consumptionFor(row, previousInvest, rentBalls) {
  if (row.mode === "cash") {
    const delta = row.invest - previousInvest;
    if (!finite(delta) || delta < 0) return null;
    return delta * rentBalls / 1000;
  }
  // An explicit zero is evidence, whereas an absent legacy field is not.
  const value = row.ballsConsumed ?? rentBalls;
  return finite(value) && value >= 0 ? value : null;
}

function hasValidCumulativeInvest(rows) {
  let previous = 0;
  for (const row of rows) {
    if (row?.type !== "data") continue;
    if (!finite(row.invest) || row.invest < previous) return false;
    previous = row.invest;
  }
  return true;
}

/**
 * Rebuild a corrected data row and all following cumulative/snapshot values.
 * The returned balances are derived from snapshots by returning the old source
 * consumption then debiting the new source consumption.
 */
export function correctRotationMode({ rows, fingerprint, mode, rentBalls }) {
  if (!Array.isArray(rows) || !matchesRotationModeFingerprint(rows, fingerprint)) return failure("編集対象が変更されています。もう一度開き直してください。");
  if (!MODES.has(mode)) return failure("遊技方法を選択してください。");
  if (!finite(rentBalls) || rentBalls <= 0) return failure("貸玉数が不正です。");
  const index = fingerprint.index;
  const target = rows[index];
  if (!isEditableRotationModeRow(target)) return failure("通常回転の行だけ編集できます。");
  if (!hasValidCumulativeInvest(rows)) return failure("累積投資額の証拠が不正です。");
  if (!finite(target.invest) || target.invest < 0) return failure("投資額の証拠が不正です。");
  const oldMode = target.mode;
  const previous = priorInvest(rows, index);
  if (!finite(previous) || previous < 0) return failure("直前の投資額の証拠が不正です。");
  const consumed = consumptionFor(target, previous, rentBalls);
  if (consumed === null) return failure("消費玉数の証拠が不正です。");
  if (consumed === 0) return failure("消費玉数または投資額が0の行は変更できません。");

  const oldCashYen = oldMode === "cash" ? target.invest - previous : 0;
  const newCashYen = mode === "cash" ? consumed * 1000 / rentBalls : 0;
  if (!finite(newCashYen) || newCashYen < 0) return failure("現金額が不正です。");
  const cashDelta = newCashYen - oldCashYen;
  const balanceDelta = { mochi: 0, chodama: 0 };
  if (oldMode === "mochi") balanceDelta.mochi += consumed;
  if (oldMode === "chodama") balanceDelta.chodama += consumed;
  if (mode === "mochi") balanceDelta.mochi -= consumed;
  if (mode === "chodama") balanceDelta.chodama -= consumed;

  // Changing into a non-cash source must be backed by the target snapshot;
  // otherwise a legacy row could create an unprovable negative balance.
  const newSourceSnapshot = mode === "mochi" ? target.mochiBalls : mode === "chodama" ? target.chodamaBalls : null;
  if (mode !== "cash" && (!finite(newSourceSnapshot) || newSourceSnapshot + balanceDelta[mode] < 0)) return failure("変更先の残玉証拠が不足しています。");

  const nextRows = rows.map(cloneRow);
  nextRows[index] = { ...target, mode, ballsConsumed: mode === "cash" ? 0 : consumed };
  for (let i = index; i < nextRows.length; i += 1) {
    const row = nextRows[i];
    nextRows[i] = { ...row };
    if (row.type === "data") {
      const invest = Number(row.invest);
      if (!finite(invest) || invest < 0) return failure("後続行の投資額の証拠が不正です。");
      nextRows[i].invest = invest + cashDelta;
    }
    if (row.mochiBalls !== undefined && row.mochiBalls !== null) {
      if (!finite(row.mochiBalls) || row.mochiBalls + balanceDelta.mochi < 0) return failure("持ち玉の証拠が不足しています。");
      nextRows[i].mochiBalls = row.mochiBalls + balanceDelta.mochi;
    }
    if (row.chodamaBalls !== undefined && row.chodamaBalls !== null) {
      if (!finite(row.chodamaBalls) || row.chodamaBalls + balanceDelta.chodama < 0) return failure("貯玉の証拠が不足しています。");
      nextRows[i].chodamaBalls = row.chodamaBalls + balanceDelta.chodama;
    }
  }
  return { ok: true, rows: nextRows, consumed, cashDelta, balanceDelta, index };
}

export function applyArchiveRotationCorrection(archive, correction) {
  if (!correction?.ok) return failure(correction?.reason || "修正に失敗しました。");
  const finalData = [...correction.rows].reverse().find((row) => row.type === "data");
  const finalInvest = finalData?.invest;
  if (!finite(finalInvest) || finalInvest < 0) return failure("アーカイブ投資額が不正です。");
  const oldFinalData = [...(archive?.rotRows || [])].reverse().find((row) => row?.type === "data");
  const oldRawInvest = oldFinalData?.invest;
  if (!finite(oldRawInvest) || oldRawInvest < 0) return failure("元の現金投資額が不正です。");
  const storedRawInvest = archive?.stats?.rawInvest;
  if (storedRawInvest !== undefined && storedRawInvest !== null && (!finite(storedRawInvest) || storedRawInvest !== oldRawInvest)) return failure("保存済みの現金投資額と回転数データが一致しません。");
  const carriedInYen = archive?.carriedInYen ?? 0;
  if (!finite(carriedInYen) || carriedInYen < 0) return failure("持ち込み玉コストが不正です。");
  const yutimeRuns = archive?.yutimeRuns;
  if (yutimeRuns !== undefined && yutimeRuns !== null && !Array.isArray(yutimeRuns)) return failure("遊タイム履歴が不正です。");
  let totalSupport = 0;
  for (const run of yutimeRuns ?? []) {
    if (!run || typeof run !== "object" || Array.isArray(run)) return failure("遊タイム履歴の形式が不正です。");
    const support = run.supportCashYen ?? 0;
    if (!finite(support) || support < 0) return failure("遊タイム現金投資が不正です。");
    totalSupport += support;
  }
  const oldArchiveInvestYen = archive?.investYen;
  if (!finite(oldArchiveInvestYen) || oldArchiveInvestYen < 0) return failure("総投資額が不正です。");
  const signedManualAdjustment = oldArchiveInvestYen - oldRawInvest - carriedInYen - totalSupport;
  if (!finite(signedManualAdjustment)) return failure("手動補正額が不正です。");
  const newArchiveInvestYen = finalInvest + carriedInYen + totalSupport + signedManualAdjustment;
  if (!finite(newArchiveInvestYen) || newArchiveInvestYen < 0 || newArchiveInvestYen !== oldArchiveInvestYen + (finalInvest - oldRawInvest)) return failure("修正後の総投資額が不正です。");
  const oldFinalMochi = archive?.finalMochiBalls;
  const oldFinalChodama = archive?.finalChodama;
  if (!finite(oldFinalMochi) || oldFinalMochi + correction.balanceDelta.mochi < 0 || !finite(oldFinalChodama) || oldFinalChodama + correction.balanceDelta.chodama < 0) return failure("最終残玉の証拠が不足しています。");
  const finalMochiBalls = oldFinalMochi + correction.balanceDelta.mochi;
  const finalChodama = oldFinalChodama + correction.balanceDelta.chodama;
  const initialChodama = archive.initialChodama ?? 0;
  if (!finite(initialChodama)) return failure("開始時の貯玉が不正です。");
  const chodamaNetBalls = finalChodama - initialChodama;
  return {
    ok: true,
    archive: {
      ...archive,
      rotRows: correction.rows,
      investYen: newArchiveInvestYen,
      finalMochiBalls,
      finalChodama,
      chodamaNetBalls,
      stats: { ...archive.stats, rawInvest: finalInvest },
    },
  };
}
