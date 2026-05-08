import { useState } from "react";
import { getSync, set as persistSet } from "./persistence.js";

// useLS: 同期 setter / 同期初期値取得という外部契約を維持したまま、
// 内部で IndexedDB(Dexie) バックの memCache に書き込む。
// CLAUDE.md 規定: API シグネチャ不変 = `[val, set] = useLS(key, init)`。
export function useLS(key, init) {
    const [val, setVal] = useState(() => {
        const cached = getSync(key);
        return cached !== undefined ? cached : init;
    });

    const set = (v) => {
        setVal(prev => {
            const s = v instanceof Function ? v(prev) : v;
            try {
                persistSet(key, s);
            } catch (e) {
                console.error("Persistence error:", e);
            }
            return s;
        });
    };

    return [val, set];
}

/* ================================================================
   SHARED CALC HELPERS
================================================================ */
export function deriveFromRows(rotRows, startRot = 0, rentBalls = 250) {
    const dataRows = (rotRows || []).filter(r => r.type === "data");
    if (dataRows.length === 0) return { rot: 0, kCount: 0, invest: 0, cashKCount: 0, mochiKCount: 0, chodamaKCount: 0 };

    const lastRow = dataRows[dataRows.length - 1];
    const invest = lastRow.invest || 0;

    // 総通常回転数 = 各データ行のthisRotを合計（累積回転数の差分ではなく実際の回転数を使用）
    // これにより大当たり後スタートのリセットに関わらず正確な総回転数が得られる
    let netRot = 0;
    dataRows.forEach(r => {
        netRot += r.thisRot || 0;
    });

    // 投資金額ベースでK数を計算（行数ではなく実際の投資/消費額から算出）
    let cashKCount = 0;
    let mochiKCount = 0;
    let chodamaKCount = 0;

    let prevInvest = 0;
    dataRows.forEach(r => {
        const investDiff = (r.invest || 0) - prevInvest;
        prevInvest = r.invest || 0;

        if (r.mode === "mochi") {
            // 持ち玉: 消費玉数からK数を計算（ballsConsumed / rentBalls）
            // ballsConsumedがない場合は rentBalls 玉消費として計算
            const consumed = r.ballsConsumed || rentBalls;
            mochiKCount += consumed / rentBalls;
        } else if (r.mode === "chodama") {
            // 貯玉: 消費玉数からK数を計算（持ち玉と同じ換算）
            const consumed = r.ballsConsumed || rentBalls;
            chodamaKCount += consumed / rentBalls;
        } else {
            // 現金: 投資差分からK数を計算
            cashKCount += investDiff / 1000;
        }
    });

    return { rot: netRot, kCount: cashKCount + mochiKCount + chodamaKCount, invest, cashKCount, mochiKCount, chodamaKCount };
}

/* ================================================================
   高精度 期待値 / 仕事量 / ボーダー 算出エンジン
   ─ jpLog の実測データから動的算出
================================================================ */
export function calcPreciseEV({
    rotRows, startRot, jpLog,
    rentBalls, exRate, synthDenom, rotPerHour,
    totalTrayBalls,  // Σ全初当たり時の上皿玉数
    border,          // 目標ボーダー（表示用）
    spec1R = 140,    // 機種スペック: 1R出玉（実出玉）
    specAvgRounds = 0,  // 機種スペック: 平均総R/初当たり（連チャン含む）
    specSapo = 0,    // 機種スペック: サポ増減/初当たり
    chodamaSettings = {},  // 貯玉設定: { includeChodamaInBalance: true }
}) {
    const { rot: netRot, invest: rawInvest, cashKCount, mochiKCount, chodamaKCount } = deriveFromRows(rotRows, startRot, rentBalls);

    // ── 実測パラメータを jpLog から集計（v3チェーン構造対応） ──
    const completedEntries = (jpLog || []).filter(j => j.completed === true);
    const jpCount = completedEntries.length;

    let totalRounds = 0;
    let totalDisplayBalls = 0;
    let totalNetGain = 0;
    let totalSapoRot = 0;
    let totalSapoChange = 0;

    completedEntries.forEach(chain => {
        if (chain.summary) {
            totalRounds += (chain.summary.totalRounds || 0);
            totalDisplayBalls += (chain.summary.totalDisplayBalls || 0);
            totalNetGain += (chain.summary.netGain || 0);
            totalSapoRot += (chain.summary.totalSapoRot || 0);
            totalSapoChange += (chain.summary.totalSapoChange || chain.summary.sapoDelta || 0);
        }
    });

    // ── 派生指標 ──
    // 平均1R出玉 = Σ表記出玉 / Σラウンド数
    const avg1R = totalRounds > 0 ? totalDisplayBalls / totalRounds : 0;

    // 平均R数/初当たり
    const avgRpJ = jpCount > 0 ? totalRounds / jpCount : 0;

    // サポ増減（総量）= Σ各ヒットの(nextTimingBalls - lastOutBalls)
    const totalSapoDelta = totalSapoChange;

    // サポ増減/初当たり
    const sapoPerJP = jpCount > 0 ? totalSapoDelta / jpCount : 0;

    // 電サポ効率: 1回転あたりのサポ増減 = 総サポ増減 / 総電サポ回転数
    const sapoPerRot = totalSapoRot > 0 ? totalSapoDelta / totalSapoRot : 0;

    // 平均純増出玉/初当たり
    const avgNetGainPerJP = jpCount > 0 ? totalNetGain / jpCount : 0;

    // ── 投資玉数の補正（上皿玉を除外した真の消費玉） ──
    const trayCorrection = totalTrayBalls || 0;
    // 上皿玉の円換算（貸し玉レートで）
    const trayBallsYen = trayCorrection * (1000 / (rentBalls || 250));
    // 持ち玉混合コスト: 現金=1000円/K, 持ち玉=1000×(交換率/貸し玉)円/K
    const mochiCostPerK = (exRate && rentBalls) ? 1000 * exRate / rentBalls : 1000;
    // 貯玉コスト: 収支に含める場合は持ち玉と同じ、含めない場合は0円
    const includeChodama = chodamaSettings.includeChodamaInBalance !== false;
    const chodamaCostPerK = includeChodama ? mochiCostPerK : 0;
    const blendedInvest = cashKCount * 1000 + mochiKCount * mochiCostPerK + chodamaKCount * chodamaCostPerK;
    const correctedInvestYen = Math.max(blendedInvest - trayBallsYen, 0);

    // ── 回転率（1Kスタート） = 総回転数 ÷ 総K数（全モード合算） ──
    const totalKCount = cashKCount + mochiKCount + chodamaKCount;
    const start1K = totalKCount > 0 ? netRot / totalKCount : 0;

    // 上皿玉を考慮した「実消費 K 数」と「補正後の 1K スタート」
    // 上皿に残っている玉は次回転に未消化なので、消費 K 数から差し引く
    const correctedKCount = correctedInvestYen / 1000;
    const start1KCorrected = correctedKCount > 0 ? netRot / correctedKCount : 0;

    // ── 実測ボーダー（JP実績がある場合） ──
    const exchP = 1000 / (exRate || 250);  // 1玉あたりの円（デフォルト4円）
    const netGainYenPerJP = avgNetGainPerJP * exchP;
    const measuredBorder = netGainYenPerJP > 0
        ? (synthDenom * 1000) / netGainYenPerJP
        : 0;

    // ── 理論ボーダー（機種スペックから算出 — P tools互換） ──
    // avgNetGainSpec = 1R出玉 × 平均総R/初当たり + サポ増減/初当たり
    // specAvgRoundsが0の場合はデフォルト30Rを使用
    const effectiveSpecAvgRounds = specAvgRounds > 0 ? specAvgRounds : 30;
    const avgNetGainSpec = (spec1R || 140) * effectiveSpecAvgRounds + (specSapo || 0);
    const specNetGainYen = avgNetGainSpec * exchP;
    const theoreticalBorder = specNetGainYen > 0
        ? (synthDenom * 1000) / specNetGainYen
        : 0;

    // ── 期待値/K（P tools互換計算式） ──
    // EV/K = (回転率/synthDenom) × 純増出玉円 - 1000
    let ev1K = 0;
    let useBorder = 0;  // 使用するボーダー

    // 機種スペックベースで計算（P tools準拠）
    if (start1K > 0 && theoreticalBorder > 0) {
        // P tools準拠: EV/K = (1Kスタート / 大当たり確率) × 平均純増出玉 × 交換レート - 1000
        ev1K = (start1K / synthDenom) * specNetGainYen - 1000;
        useBorder = theoreticalBorder;
    } else if (start1K > 0 && border > 0) {
        // フォールバック: 手動ボーダーから計算
        // EV/K = (1Kスタート - ボーダー) / ボーダー × 1000
        ev1K = ((start1K - border) / border) * 1000;
        useBorder = border;
    }

    // EVソース
    const evSource = (theoreticalBorder > 0) ? "spec" : (border > 0 ? "border" : "none");

    // ── 単価（1回転あたりの期待値円 — P tools互換） ──
    // 単価 = EV/K ÷ 1Kスタート
    const evPerRot = start1K > 0 ? ev1K / start1K : 0;

    // ── 仕事量 = 単価 × 総通常回転数 ──
    const workAmount = evPerRot * netRot;

    // ── 時給 = 仕事量 ÷ 稼働時間 ──
    const wage = (rotPerHour > 0 && netRot > 0)
        ? workAmount / (netRot / rotPerHour)
        : 0;

    // ── ボーダー差 = 実測回転率 - 理論ボーダー ──
    const bDiff = theoreticalBorder > 0 ? start1K - theoreticalBorder : (border > 0 ? start1K - border : 0);

    return {
        // 実測パラメータ
        avg1R,
        avgRpJ,
        sapoPerJP,
        sapoPerRot,
        totalSapoRot,
        avgNetGainPerJP,
        jpCount,
        totalRounds,
        totalDisplayBalls,
        totalNetGain,
        totalSapoDelta,

        // 回転率・ボーダー
        start1K,
        correctedKCount,
        start1KCorrected,
        measuredBorder,
        theoreticalBorder,
        useBorder,
        bDiff,

        // 期待値・仕事量・時給
        ev1K,
        workAmount,
        wage,
        evPerRot,
        evSource,

        // 投資情報
        netRot,
        rawInvest,
        correctedInvestYen,
        trayBallsYen: Math.round(trayBallsYen),
        trayCorrection,

        // 持ち玉・貯玉比率
        cashKCount,
        mochiKCount,
        chodamaKCount,
        mochiRatio: (cashKCount + mochiKCount + chodamaKCount) > 0 ? mochiKCount / (cashKCount + mochiKCount + chodamaKCount) : 0,
        chodamaRatio: (cashKCount + mochiKCount + chodamaKCount) > 0 ? chodamaKCount / (cashKCount + mochiKCount + chodamaKCount) : 0,
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
