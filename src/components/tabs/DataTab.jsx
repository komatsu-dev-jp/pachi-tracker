import { useMemo } from "react";
import { C, f, sc, sp, mono } from "../../constants";
import { Card, SecLabel } from "../Atoms";
import { getEvAmount, getYutimeEvAmount } from "../analysis/analysisSelectors";
import { LineChart, hasRotDataRows, EmptySub, UndoControls, effectiveEv } from "./TabsShared";

export function DataTab({ ev, jpLog, S }) {
    const stat = (label, val, unit, col) => (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: col, fontFamily: mono }}>{val}</span>
                <span style={{ fontSize: 10, color: C.sub }}>{unit}</span>
            </div>
        </div>
    );

    // Build cumulative EV graph data from archives + current session
    const archives = useMemo(() => S.archives || [], [S.archives]);
    const evGraphData = useMemo(() => {
        const points = [];
        let cumEV = 0;
        archives.forEach((a) => {
            const w = getEvAmount(a);
            cumEV += w;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumEV) });
        });
        // Add current session
        const currentWork = (ev.effectiveWorkAmount ?? ev.workAmount ?? 0)
            + getYutimeEvAmount({ yutimeDecision: S.yutimeDecision });
        if (currentWork !== 0) {
            cumEV += currentWork;
            points.push({ label: "今日", value: Math.round(cumEV) });
        }
        return points;
    }, [archives, ev.effectiveWorkAmount, ev.workAmount, S.yutimeDecision]);

    // Build cumulative profit/loss graph from archives (actual results based)
    const _plGraphData = useMemo(() => {
        const points = [];
        let cumPL = 0;
        archives.forEach((a) => {
            const st = a.stats || {};
            // Use workAmount as proxy for daily result
            const daily = st.workAmount || 0;
            cumPL += daily;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumPL) });
        });
        const currentWork = ev.effectiveWorkAmount ?? ev.workAmount;
        if (currentWork !== 0) {
            cumPL += currentWork;
            points.push({ label: "今日", value: Math.round(cumPL) });
        }
        return points;
    }, [archives, ev.effectiveWorkAmount, ev.workAmount]);

    const hasRot = hasRotDataRows(S.rotRows);
    const hasJp = (jpLog || []).length > 0;
    const evEff = effectiveEv(ev);

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 回転率・ボーダー */}
            <Card style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 8 }}>
                    <SecLabel label="回転率・ボーダー" />
                    <UndoControls S={S} />
                </div>
                {!hasRot && <EmptySub msg="回転データなし（入力するとここに表示されます）" />}
                {stat("1Kスタート", hasRot ? f(ev.start1K, 1) : "—", "回/K", sc(ev.bDiff))}
                {stat("理論ボーダー", ev.theoreticalBorder > 0 ? f(ev.theoreticalBorder, 1) : "—", "回/K", C.subHi)}
                {stat("ボーダー差", hasRot ? sp(ev.bDiff, 1) : "—", "回/K", sc(ev.bDiff))}
            </Card>

            {/* 期待値・収支 */}
            <Card>
                <SecLabel label={ev.evSource === "spec" ? "期待値・収支（スペック基準）" : ev.evSource === "measured" ? "期待値・収支（実測）" : "期待値・収支"} />
                {!hasRot && <EmptySub msg="回転データなし" />}
                {stat("期待値/K", hasRot ? sp(evEff.ev1K, 0) : "—", "円", sc(evEff.ev1K))}
                {stat("単価", hasRot ? sp(evEff.evPerRot, 2) : "—", "円/回", sc(evEff.evPerRot))}
                {stat("仕事量", hasRot ? sp(evEff.workAmount, 0) : "—", "円", sc(evEff.workAmount))}
                {stat("時給", hasRot ? sp(evEff.wage, 0) : "—", "円/h", sc(evEff.wage))}
            </Card>

            {/* 期待値グラフ */}
            {evGraphData.length >= 2 && (
                <Card style={{ padding: "12px 8px" }}>
                    <SecLabel label="累計期待値（仕事量）推移" />
                    <LineChart data={evGraphData} color="#3b82f6" />
                </Card>
            )}

            {/* 出玉データ */}
            <Card>
                <SecLabel label="出玉データ" />
                {!hasJp && <EmptySub msg="大当たり履歴なし" />}
                {stat("平均出玉/大当たり", ev.avgNetGainPerHit > 0 ? f(ev.avgNetGainPerHit, 0) : "—", "玉", C.green)}
                {stat("大当たり回数", ev.totalHits > 0 ? String(ev.totalHits) : "—", "回", C.purple)}
                {stat("平均R数/大当たり", ev.avgRoundsPerHit > 0 ? f(ev.avgRoundsPerHit, 1) : "—", "R", C.blue)}
                {stat("サポ増減(実測残差)", ev.realMeasuredChainCount > 0 ? sp(ev.estimatedSapoChange, 0) : "—", "玉", sc(ev.estimatedSapoChange))}
                {stat("平均1R出玉", ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", "玉", C.teal)}
                {stat("平均R数/初当たり", ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", "R", C.blue)}
                {stat("サポ増減/回転", ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", "玉/回転", sc(ev.sapoPerRot))}
                {stat("平均純増/初当たり", ev.avgNetGainPerJP > 0 ? f(ev.avgNetGainPerJP, 0) : "—", "玉", C.green)}
            </Card>

            {/* 稼働データ */}
            <Card>
                <SecLabel label="稼働データ" />
                {!hasRot && <EmptySub msg="投資・回転データなし" />}
                {stat("初当たり回数", jpLog.length > 0 ? jpLog.length.toString() : "0", "回", C.green)}
                {stat("総回転数", hasRot ? f(ev.netRot) : "—", "回", C.subHi)}
                {stat("総投資額", hasRot ? f(ev.rawInvest) : "—", "円", C.red)}
                {ev.trayBallsYen > 0 && stat("上皿補正", "-" + f(ev.trayBallsYen), "円", C.teal)}
                {ev.correctedInvestYen > 0 && ev.trayBallsYen > 0 && stat("実質投資", f(Math.round(ev.correctedInvestYen)), "円", C.yellow)}
                {stat("非現金比率", ev.nonCashRatio > 0 ? Math.round(ev.nonCashRatio * 100).toString() : "0", "%", C.orange)}
                {stat("持ち玉比率", ev.mochiRatio > 0 ? Math.round(ev.mochiRatio * 100).toString() : "0", "%", C.orange)}
                {stat("貯玉比率", ev.chodamaRatio > 0 ? Math.round(ev.chodamaRatio * 100).toString() : "0", "%", C.purple)}
            </Card>
        </div>
    );
}
