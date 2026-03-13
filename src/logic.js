import { useState } from "react";

export function useLS(key, init) {
    const [val, setVal] = useState(() => {
        try {
            const i = window.localStorage.getItem(key);
            return i ? JSON.parse(i) : init;
        } catch {
            return init;
        }
    });

    const set = (v) => {
        try {
            const s = v instanceof Function ? v(val) : v;
            setVal(s);
            window.localStorage.setItem(key, JSON.stringify(s));
        } catch (e) {
            console.error("LocalStorage error:", e);
        }
    };

    return [val, set];
}

/* ================================================================
   SHARED CALC HELPERS
================================================================ */
export function deriveFromRows(rotRows, startRot = 0) {
    const dataRows = (rotRows || []).filter(r => r.type === "data");
    if (dataRows.length === 0) return { rot: 0, kCount: 0, invest: 0, cashKCount: 0, mochiKCount: 0 };

    const lastRow = dataRows[dataRows.length - 1];
    const totalRot = lastRow.cumRot;
    const netRot = totalRot - startRot;
    const invest = lastRow.invest || 0;
    const cashKCount = dataRows.filter(r => r.mode !== "mochi").length;
    const mochiKCount = dataRows.filter(r => r.mode === "mochi").length;
    return { rot: netRot, kCount: dataRows.length, invest, cashKCount, mochiKCount };
}

/* ================================================================
   高精度 期待値 / 仕事量 / ボーダー 算出エンジン
   ─ jpLog の実測データから動的算出
================================================================ */
export function calcPreciseEV({
    rotRows, startRot, jpLog,
    rentBalls, exRate, synthDenom, rotPerHour,
    totalTrayBalls,  // Σ全初当たり時の上皿玉数
    border,          // 設定ボーダー（初当たりなし時のEV算出用）
}) {
    const { rot: netRot, invest: rawInvest, cashKCount, mochiKCount } = deriveFromRows(rotRows, startRot);

    // ── 実測パラメータを jpLog から集計（v3チェーン構造対応） ──
    const completedEntries = (jpLog || []).filter(j => j.completed === true);
    const jpCount = completedEntries.length;

    let totalRounds = 0;
    let totalDisplayBalls = 0;
    let totalNetGain = 0;
    let totalFinalBalls = 0;
    let totalEntryTray = 0;

    completedEntries.forEach(chain => {
        if (chain.summary) {
            totalRounds += (chain.summary.totalRounds || 0);
            totalDisplayBalls += (chain.summary.totalDisplayBalls || 0);
            totalNetGain += (chain.summary.netGain || 0);
        }
        totalFinalBalls += (chain.finalBalls || 0);
        totalEntryTray += (chain.trayBalls || 0);
    });

    // ── 派生指標 ──
    // 平均1R出玉 = Σ表記出玉 / Σラウンド数
    const avg1R = totalRounds > 0 ? totalDisplayBalls / totalRounds : 0;

    // 平均R数/初当たり
    const avgRpJ = jpCount > 0 ? totalRounds / jpCount : 0;

    // サポ増減（総量） = Σ最終残玉 - Σ上皿玉 - Σ表記出玉
    const totalSapoDelta = totalFinalBalls - totalEntryTray - totalDisplayBalls;

    // サポ増減/初当たり
    const sapoPerJP = jpCount > 0 ? totalSapoDelta / jpCount : 0;

    // 平均純増出玉/初当たり = Σ(finalBalls - trayBalls) / jpCount
    const avgNetGainPerJP = jpCount > 0 ? totalNetGain / jpCount : 0;

    // ── 投資玉数の補正（上皿玉を除外した真の消費玉） ──
    const trayCorrection = totalTrayBalls || 0;
    // 持ち玉混合コスト: 現金=1000円/K, 持ち玉=1000×(交換率/貸し玉)円/K
    const mochiCostPerK = (exRate && rentBalls) ? 1000 * exRate / rentBalls : 1000;
    const blendedInvest = cashKCount * 1000 + mochiKCount * mochiCostPerK;
    const correctedInvestYen = Math.max(blendedInvest - (trayCorrection * (1000 / (rentBalls || 250))), 0);

    // ── 回転率（1Kスタート） ──
    const start1K = correctedInvestYen > 0 ? netRot / (correctedInvestYen / 1000) : 0;

    // ── 実測ボーダー ──
    // 1初当たりあたりの正味獲得円 = 純増出玉 × 換金レート
    const exchP = 1000 / (exRate || 1);  // 1玉あたりの円
    const netGainYenPerJP = avgNetGainPerJP * exchP;
    const measuredBorder = netGainYenPerJP > 0
        ? (synthDenom * 1000) / netGainYenPerJP
        : 0;

    // ── 期待値/K ──
    // 初当たりがある場合: 実測データベース
    // 初当たりがない場合: 設定ボーダーベース（回転数だけで算出）
    let ev1K = 0;
    if (start1K > 0 && avgNetGainPerJP > 0) {
        // 実測ベース
        ev1K = (start1K / synthDenom) * netGainYenPerJP - 1000;
    } else if (start1K > 0 && border > 0) {
        // ボーダーベース: 期待値/K = (start1K / border - 1) × 1000
        ev1K = (start1K / border - 1) * 1000;
    }

    // EVソース: 実測 or ボーダーベース
    const evSource = (jpCount > 0 && avgNetGainPerJP > 0) ? "measured" : (start1K > 0 && border > 0 ? "border" : "none");

    // ── 仕事量（確定済み期待値） ──
    // = 期待値/K × (通常総回転数 / 1Kスタート)
    const workAmount = (start1K > 0 && ev1K !== 0)
        ? ev1K * (netRot / start1K)
        : 0;

    // ── 時給 ──
    const wage = (rotPerHour > 0 && netRot > 0)
        ? workAmount / (netRot / rotPerHour)
        : 0;

    // ── ボーダー差 ──
    // 実測ボーダーがある場合はそれと比較、なければ設定ボーダーと比較
    const bDiff = measuredBorder > 0 ? start1K - measuredBorder : (border > 0 ? start1K - border : 0);

    return {
        // 実測パラメータ
        avg1R,
        avgRpJ,
        sapoPerJP,
        avgNetGainPerJP,
        jpCount,
        totalRounds,
        totalDisplayBalls,
        totalNetGain,
        totalSapoDelta,

        // 回転率・ボーダー
        start1K,
        measuredBorder,
        bDiff,

        // 期待値・仕事量・時給
        ev1K,
        workAmount,
        wage,
        evSource,

        // 投資情報
        netRot,
        rawInvest,
        correctedInvestYen,

        // 持ち玉比率
        cashKCount,
        mochiKCount,
        mochiRatio: (cashKCount + mochiKCount) > 0 ? mochiKCount / (cashKCount + mochiKCount) : 0,
    };
}

/* ================================================================
   旧互換 calcCash (RotTab統計パネル用 — jpLogなしのフォールバック)
================================================================ */
export function calcCash({ rotRows, startRot, cashRB, cashJP, exRate, synthDenom, rotPerHour }) {
    const exchP = 1000 / (exRate || 1);
    const { rot: netRot, invest: cashInvest } = deriveFromRows(rotRows, startRot);

    const cashRBpJ = cashJP > 0 ? cashRB / cashJP : 0;
    const cash1K = cashInvest > 0 ? netRot / (cashInvest / 1000) : 0;
    const cashBorder = cashRBpJ > 0 ? (synthDenom * exRate) / cashRBpJ : 0;
    const cashEV = (cash1K > 0 && cashRBpJ > 0) ? (cash1K * cashRBpJ * exchP) / synthDenom - 1000 : 0;
    const cashWage = (cash1K > 0 && rotPerHour > 0) ? (cashEV * rotPerHour) / cash1K : 0;
    const bDiff = cash1K - cashBorder;

    return { cashRBpJ, cash1K, cashBorder, cashEV, cashWage, bDiff, cashRot: netRot, cashInvest };
}

/* ================================================================
   旧互換 calcMochi
================================================================ */
export function calcMochi({ rotRows, startRot, mRB, mJP, rentBalls, exRate, synthDenom, rotPerHour }) {
    const exchP = 1000 / (exRate || 1);
    const cprK = rentBalls * exchP;
    const { rot: netRot, invest: cashInvest } = deriveFromRows(rotRows, startRot);
    const mRBpJ = mJP > 0 ? mRB / mJP : 0;
    const m1K = cashInvest > 0 ? netRot / (cashInvest / 1000) : 0;
    const mBorder = mRBpJ > 0 ? (synthDenom * rentBalls) / mRBpJ : 0;
    const mEV = (m1K > 0 && mRBpJ > 0) ? (m1K * mRBpJ * exchP) / synthDenom - cprK : 0;
    const mWage = (m1K > 0 && rotPerHour > 0) ? (mEV * rotPerHour) / m1K : 0;
    const bDiff = m1K - mBorder;

    return { mRBpJ, m1K, mBorder, mEV, mWage, bDiff, mRot: netRot, mBall: (cashInvest / 1000) * rentBalls };
}
