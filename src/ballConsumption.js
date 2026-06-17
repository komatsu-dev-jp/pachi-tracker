// 貯玉/持ち玉プレーの「実測消費玉」確定ロジック（純関数）
//
// 背景:
//   通常入力（decide）では貯玉/持ち玉の消費を「1Kあたり rentBalls 玉（既定250玉）」
//   という固定値で暫定計上している。これは台の玉数を読めない打鍵中の概算に過ぎない。
//   一方、区間開始時の玉数（打ち始めに手元にあった玉）は実測でき、これを各 data 行の
//   ballsConsumed に正しく書き戻すことで回転率が正確になる。
//
// 重要な単位の取り決め（logic.js / calcPreciseEV との整合）:
//   ballsConsumed は「グロス（区間で手元にあった玉＝投入可能だった玉）」を表す。
//   上皿に残った玉（未消化分）の差し引きは calcPreciseEV 側の trayCorrection が
//   chain.trayBalls を使って行う（補正後＝実消費）。
//   したがって本関数が書き込む区間合計は「区間開始玉（グロス）」であり、
//   上皿残玉はここでは差し引かない（二重控除を避ける）。
//
// 設計上の制約:
//   - src/logic.js は変更禁止。deriveFromRows は各 data 行の ballsConsumed を
//     「正の値があればそれを優先、無ければ rentBalls」で読む。
//     よって本関数は rotRows の ballsConsumed を「区間合計＝区間開始玉」になるよう
//     書き直すだけで、計算式そのものには一切触れない。
//   - 回転率は「総回転数 ÷ 総消費K数」でしか効かないため、区間内の各行への
//     配分方法は回転率の値に影響しない（合計さえ合えばよい）。表示の自然さのため
//     各行の thisRot に比例配分する。

// 対象区間（指定 hit の直前区間）の data 行範囲を求める内部ヘルパ。
function findSegmentBounds(rows, chainId) {
    const hitIdxs = [];
    rows.forEach((r, i) => { if (r.type === "hit") hitIdxs.push(i); });
    if (hitIdxs.length === 0) return null;
    let pos;
    if (chainId != null) {
        pos = hitIdxs.findIndex(i => rows[i].chainId === chainId);
        if (pos < 0) return null;
    } else {
        pos = hitIdxs.length - 1; // 既定は最新の当たり
    }
    return {
        targetHitIdx: hitIdxs[pos],
        prevHitIdx: pos >= 1 ? hitIdxs[pos - 1] : -1,
        nextHitIdx: pos < hitIdxs.length - 1 ? hitIdxs[pos + 1] : rows.length,
    };
}

// rows: rotRows 全体
// opts.playMode: "chodama" | "mochi"（この区間のモード）
// opts.currentBalance: 現在の貯玉/持ち玉残高（区間開始玉の復元用。= 区間開始玉 − 暫定消費の累計）
// opts.segmentStartBalls: 区間開始玉（グロス）を直接指定する場合（編集UIなど）。優先される。
// opts.chainId: 対象の当たり（省略時は最新の当たり区間）
// 返り値: ballsConsumed を更新した新しい rows 配列（条件を満たさない場合は元配列をそのまま返す）
export function reconcileSegmentConsumption(rows, { playMode, currentBalance, segmentStartBalls, chainId }) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    if (playMode !== "chodama" && playMode !== "mochi") return rows;

    const bounds = findSegmentBounds(rows, chainId);
    if (!bounds) return rows;
    const { prevHitIdx, targetHitIdx } = bounds;

    // 区間内の「このモードの」data 行（現金プッシュ行などは除外）
    const segIdxs = [];
    for (let i = prevHitIdx + 1; i < targetHitIdx; i++) {
        const r = rows[i];
        if (r.type === "data" && r.mode === playMode) segIdxs.push(i);
    }
    if (segIdxs.length === 0) return rows;

    // 区間開始玉（グロス）。明示指定が無ければ残高 + 暫定消費の累計で復元する。
    const assumedSum = segIdxs.reduce((s, i) => s + (Number(rows[i].ballsConsumed) || 0), 0);
    const grossStart = (segmentStartBalls != null && segmentStartBalls !== "")
        ? (Number(segmentStartBalls) || 0)
        : (Number(currentBalance) || 0) + assumedSum;

    const totalRot = segIdxs.reduce((s, i) => s + (Number(rows[i].thisRot) || 0), 0);
    if (!(grossStart > 0) || !(totalRot > 0)) return rows;

    // thisRot 比例で配分。最終行に丸め残差を吸収させ、各行は最低1玉とする。
    const next = rows.slice();
    let assigned = 0;
    segIdxs.forEach((rowIdx, k) => {
        let consumed;
        if (k === segIdxs.length - 1) {
            consumed = Math.max(1, grossStart - assigned);
        } else {
            const thisRot = Number(rows[rowIdx].thisRot) || 0;
            consumed = Math.max(1, Math.round(grossStart * (thisRot / totalRot)));
            assigned += consumed;
        }
        next[rowIdx] = { ...next[rowIdx], ballsConsumed: consumed };
    });
    return next;
}

// 編集UI用: 指定区間で現在計上されているグロス（区間開始玉の現値）を推定する。
// deriveFromRows と同じ「ballsConsumed が無ければ rentBalls」の規約で合算する。
export function estimateSegmentGross(rows, { playMode, chainId, rentBalls = 250 }) {
    if (!Array.isArray(rows)) return 0;
    const bounds = findSegmentBounds(rows, chainId);
    if (!bounds) return 0;
    const { prevHitIdx, targetHitIdx } = bounds;
    let g = 0;
    for (let i = prevHitIdx + 1; i < targetHitIdx; i++) {
        const r = rows[i];
        if (r.type === "data" && r.mode === playMode) g += (Number(r.ballsConsumed) || rentBalls);
    }
    return g;
}

// 編集UI用: 指定区間にプッシュ補正行（thisRot===0 の data 行）が存在するか。
export function hasPushCorrections(rows, { chainId } = {}) {
    if (!Array.isArray(rows)) return false;
    const bounds = findSegmentBounds(rows, chainId);
    if (!bounds) return false;
    const { prevHitIdx, nextHitIdx } = bounds;
    for (let i = prevHitIdx + 1; i < nextHitIdx; i++) {
        const r = rows[i];
        if (r.type === "data" && (Number(r.thisRot) || 0) === 0) return true;
    }
    return false;
}

// 指定の当たり区間（前の当たり〜次の当たり）に含まれる「プッシュ補正行」を取り除く。
// プッシュ補正行 = thisRot===0 の data 行（回転を伴わない現金/玉投入の補正のみの行）。
// 取り除く際は、その行が積み増した投資差分を後続 data 行から減算して整合を保つ。
export function clearPushCorrections(rows, { chainId } = {}) {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const bounds = findSegmentBounds(rows, chainId);
    if (!bounds) return rows;
    const { prevHitIdx, nextHitIdx } = bounds;

    // 対象範囲内の thisRot===0 の data 行を抽出
    const removeIdxs = [];
    for (let i = prevHitIdx + 1; i < nextHitIdx; i++) {
        const r = rows[i];
        if (r.type === "data" && (Number(r.thisRot) || 0) === 0) removeIdxs.push(i);
    }
    if (removeIdxs.length === 0) return rows;

    // 各プッシュ行が積んだ投資差分を後続 data 行から減算（現金投資の累積整合）
    const work = rows.map(r => ({ ...r }));
    removeIdxs.forEach((idx) => {
        // 直前の data 行の invest
        let prevInvest = 0;
        for (let j = idx - 1; j >= 0; j--) {
            if (work[j].type === "data") { prevInvest = Number(work[j].invest) || 0; break; }
        }
        const delta = (Number(work[idx].invest) || 0) - prevInvest;
        if (delta !== 0) {
            for (let j = idx + 1; j < work.length; j++) {
                if (work[j].type === "data" || work[j].type === "hit") {
                    if (work[j].invest != null) work[j].invest = (Number(work[j].invest) || 0) - delta;
                }
            }
        }
    });

    const removeSet = new Set(removeIdxs);
    return work.filter((_, i) => !removeSet.has(i));
}
