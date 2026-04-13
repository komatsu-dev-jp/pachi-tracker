import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, sp, tsNow, font, mono } from "../constants";
import { NI, Card, MiniStat, Btn, SecLabel, KV, ModeToggle, ModeBadge } from "./Atoms";
import { searchMachines } from "../machineDB";

/* ================================================================
   Simple SVG Line Chart component
================================================================ */
function LineChart({ data, width = 320, height = 140, color = "#3b82f6", showZero = true }) {
    if (!data || data.length < 2) return null;
    const pad = { top: 10, right: 10, bottom: 20, left: 45 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const vals = data.map(d => d.value);
    const minV = Math.min(...vals, showZero ? 0 : Infinity);
    const maxV = Math.max(...vals, showZero ? 0 : -Infinity);
    const range = maxV - minV || 1;

    const points = data.map((d, i) => {
        const x = pad.left + (i / (data.length - 1)) * w;
        const y = pad.top + h - ((d.value - minV) / range) * h;
        return { x, y, ...d };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // Zero line
    const zeroY = pad.top + h - ((0 - minV) / range) * h;

    // Y-axis labels
    const yLabels = [maxV, Math.round((maxV + minV) / 2), minV].map(v => ({
        v, y: pad.top + h - ((v - minV) / range) * h
    }));

    return (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
            {/* Grid lines */}
            {yLabels.map((l, i) => (
                <g key={i}>
                    <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                    <text x={pad.left - 4} y={l.y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={8} fontFamily="monospace">
                        {l.v >= 1000 || l.v <= -1000 ? (l.v / 1000).toFixed(0) + "k" : l.v.toLocaleString()}
                    </text>
                </g>
            ))}
            {/* Zero line */}
            {showZero && minV < 0 && maxV > 0 && (
                <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,3" />
            )}
            {/* Area fill */}
            <path d={`${pathD} L ${points[points.length - 1].x} ${pad.top + h} L ${points[0].x} ${pad.top + h} Z`}
                fill={`url(#grad-${color.replace("#", "")})`} />
            <defs>
                <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {/* Line */}
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots */}
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
            ))}
            {/* X-axis labels (show first, middle, last) */}
            {[0, Math.floor(data.length / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
                <text key={i} x={points[i].x} y={height - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>
                    {data[i].label}
                </text>
            ))}
        </svg>
    );
}

/* ================================================================
   DataTab — 全データ一覧表示 + グラフ
================================================================ */
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
    const archives = S.archives || [];
    const evGraphData = useMemo(() => {
        const points = [];
        let cumEV = 0;
        archives.forEach((a) => {
            const w = a.stats?.workAmount || 0;
            cumEV += w;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumEV) });
        });
        // Add current session
        if (ev.workAmount !== 0) {
            cumEV += ev.workAmount;
            points.push({ label: "今日", value: Math.round(cumEV) });
        }
        return points;
    }, [archives, ev.workAmount]);

    // Build cumulative profit/loss graph from archives (actual results based)
    const plGraphData = useMemo(() => {
        const points = [];
        let cumPL = 0;
        archives.forEach((a) => {
            const st = a.stats || {};
            // Use workAmount as proxy for daily result
            const daily = st.workAmount || 0;
            cumPL += daily;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumPL) });
        });
        if (ev.workAmount !== 0) {
            cumPL += ev.workAmount;
            points.push({ label: "今日", value: Math.round(cumPL) });
        }
        return points;
    }, [archives, ev.workAmount]);

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 回転率・ボーダー */}
            <Card style={{ marginTop: 12 }}>
                <SecLabel label="回転率・ボーダー" />
                {stat("1Kスタート", ev.start1K > 0 ? f(ev.start1K, 1) : "—", "回/K", sc(ev.bDiff))}
                {stat("理論ボーダー", ev.theoreticalBorder > 0 ? f(ev.theoreticalBorder, 1) : "—", "回/K", C.subHi)}
                {stat("ボーダー差", ev.bDiff !== 0 ? sp(ev.bDiff, 1) : "—", "回/K", sc(ev.bDiff))}
            </Card>

            {/* 期待値・収支 */}
            <Card>
                <SecLabel label={ev.evSource === "spec" ? "期待値・収支（スペック基準）" : ev.evSource === "measured" ? "期待値・収支（実測）" : "期待値・収支"} />
                {stat("期待値/K", ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—", "円", sc(ev.ev1K))}
                {stat("単価", ev.evPerRot !== 0 ? sp(ev.evPerRot, 2) : "—", "円/回", sc(ev.evPerRot))}
                {stat("仕事量", ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—", "円", sc(ev.workAmount))}
                {stat("時給", ev.wage !== 0 ? sp(ev.wage, 0) : "—", "円/h", sc(ev.wage))}
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
                {stat("平均1R出玉", ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", "玉", C.teal)}
                {stat("平均R数/初当たり", ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", "R", C.blue)}
                {stat("サポ増減/回転", ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", "玉/回転", sc(ev.sapoPerRot))}
                {stat("平均純増/初当たり", ev.avgNetGainPerJP > 0 ? f(ev.avgNetGainPerJP, 0) : "—", "玉", C.green)}
            </Card>

            {/* 稼働データ */}
            <Card>
                <SecLabel label="稼働データ" />
                {stat("初当たり回数", jpLog.length > 0 ? jpLog.length.toString() : "0", "回", C.green)}
                {stat("総回転数", ev.netRot > 0 ? f(ev.netRot) : "—", "回", C.subHi)}
                {stat("総投資額", ev.rawInvest > 0 ? f(ev.rawInvest) : "—", "円", C.red)}
                {ev.trayBallsYen > 0 && stat("上皿補正", "-" + f(ev.trayBallsYen), "円", C.teal)}
                {ev.correctedInvestYen > 0 && ev.trayBallsYen > 0 && stat("実質投資", f(Math.round(ev.correctedInvestYen)), "円", C.yellow)}
                {stat("持ち玉比率", ev.mochiRatio > 0 ? Math.round(ev.mochiRatio * 100).toString() : "0", "%", C.orange)}
            </Card>
        </div>
    );
}

/* ================================================================
   RotTab — 回転数入力 + リアルタイム実測統計パネル（刷新版）
================================================================ */
export function RotTab({ border: displayBorder, rows, setRows, S, ev }) {
    // 回転色判定にはEVで使用しているボーダーを優先
    const border = ev.useBorder > 0 ? ev.useBorder : displayBorder;
    const [input, setInput] = useState("");
    const [inputError, setInputError] = useState("");
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showStoreDD, setShowStoreDD] = useState(false);
    const [showMachineDD, setShowMachineDD] = useState(false);
    const [machineQuery, setMachineQuery] = useState("");
    const [summaryCollapsed, setSummaryCollapsed] = useState(true);
    const [showInvestSettings, setShowInvestSettings] = useState(false);
    const tableRef = useRef(null);

    // 初当たりウィザード用state
    const [hitWizardOpen, setHitWizardOpen] = useState(false);
    const [hitWizardStep, setHitWizardStep] = useState(0);
    const [hitWizardData, setHitWizardData] = useState({
        trayBalls: "", rounds: 0, displayBalls: "", actualBalls: "",
        hitType: "", // "単発" or "確変"
        jitanSpins: "", // 時短回数
        finalBallsAfterJitan: "" // 時短終了後最終出玉
    });
    const [activeKeypadField, setActiveKeypadField] = useState(null); // "trayBalls" | "displayBalls" | "actualBalls" | "jitanSpins" | "finalBalls"

    // 機種からラウンド情報を取得（初当たり用 - roundDist使用）
    const getMachineRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine || !machine.roundDist) return [3, 4, 5, 6, 7, 8, 9, 10]; // デフォルト
        // roundDist例: "4R:50%, 10R:50%" → [4, 10]
        const matches = machine.roundDist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRounds = useMemo(getMachineRounds, [S.machineName, S.customMachines]);

    // 機種から確変中のラウンド情報を取得（連チャン用 - rushDist使用、なければroundDistにフォールバック）
    const getMachineRushRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine) return [3, 4, 5, 6, 7, 8, 9, 10];
        // rushDistがあればそれを使用、なければroundDistにフォールバック
        const dist = machine.rushDist || machine.roundDist;
        if (!dist) return [3, 4, 5, 6, 7, 8, 9, 10];
        const matches = dist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRushRounds = useMemo(getMachineRushRounds, [S.machineName, S.customMachines]);

    // ========== 大当たり履歴タブ用state（HistoryTabから移植） ==========
    const [historySub, setHistorySub] = useState("jp"); // "jp" or "ses"

    // 長押し削除用state
    const longPressTimerRef = useRef(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    // 連チャン追加ウィザード state
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true);
    const [chainWizardData, setChainWizardData] = useState({
        rounds: 0, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "",
        hitType: "", jitanSpins: "", finalBallsAfterJitan: ""
    });

    // 直接単発終了モーダル state
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0);
    const [directSingleEndData, setDirectSingleEndData] = useState({ jitanSpins: "", finalBallsAfterJitan: "" });

    // 最新の未完了チェーン
    const jpLog = S.jpLog || [];
    const sesLog = S.sesLog || [];
    const lastChain = jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    const isChainActive = lastChain && !lastChain.completed;

    // 前回のラウンド終了時の総持ち玉を取得
    const getPrevEndBalls = () => {
        if (!lastChain || lastChain.hits.length === 0) return 0;
        const lastHit = lastChain.hits[lastChain.hits.length - 1];
        return lastHit.nextTimingBalls || 0;
    };

    const clearChainWizard = () => {
        setChainWizardData({ rounds: 0, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
    };

    // 連チャン追加ウィザードを開始
    const openChainWizard = () => {
        const prevEndBalls = getPrevEndBalls();
        setChainWizardData({
            rounds: 0, displayBalls: "", lastOutBalls: String(prevEndBalls),
            nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: ""
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardOpen(true);
    };

    // 連チャン追加ウィザード完了（継続 or 最終）
    const handleChainWizardComplete = (isFinal = false) => {
        const { rounds, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) { setChainWizardOpen(false); return; }

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;

        if (isFinal) {
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1, lastOutBalls: lastOut, nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot, sapoChange, sapoPerRot, rounds: rnd, displayBalls: disp, actualBalls: 0, time: tsNow(),
                }];
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
                chain.completed = true;
                chain.summary = {
                    totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: totalSapoChange,
                    sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                    netGain: totalDisplayBalls + totalSapoChange,
                };
                chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
                updated[updated.length - 1] = chain;
                return updated;
            });
            const lastChainCopy = jpLog[jpLog.length - 1];
            const existingTotal = (lastChainCopy.trayBalls || 0) +
                lastChainCopy.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
            const finalBallsToAdd = existingTotal + disp + sapoChange;
            S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
            S.pushLog({ type: "連チャン終了", time: tsNow() });
            S.setPlayMode("mochi");
            S.setSessionSubTab("rot");
            S.setShowStartPrompt(true);
        } else {
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1, lastOutBalls: lastOut, nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot, sapoChange, sapoPerRot, rounds: rnd, displayBalls: disp, actualBalls: 0, time: tsNow(),
                }];
                updated[updated.length - 1] = chain;
                return updated;
            });
            S.pushLog({ type: "連チャン追加", time: tsNow(), rounds: rnd });
        }
        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 単発終了ウィザード完了
    const handleChainWizardSingleEnd = () => {
        const { rounds, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot, jitanSpins, finalBallsAfterJitan } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) { setChainWizardOpen(false); return; }

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1, lastOutBalls: lastOut, nextTimingBalls: nextTiming,
                elecSapoRot: elecRot, sapoChange, sapoPerRot, rounds: rnd, displayBalls: disp, actualBalls: 0, time: tsNow(),
            }];
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const currentChain = jpLog[jpLog.length - 1];
        const existingTotal = (currentChain?.trayBalls || 0) +
            (currentChain?.hits || []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal + disp + sapoChange;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow(), rounds: rnd });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 直接単発終了を開く
    const openDirectSingleEnd = () => {
        if (!isChainActive || lastChain.hits.length === 0) return;
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setDirectSingleEndStep(0);
        setDirectSingleEndOpen(true);
    };

    // 直接単発終了完了
    const handleDirectSingleEndComplete = () => {
        if (!isChainActive) return;
        const jitan = Number(directSingleEndData.jitanSpins) || 0;
        const finalBalls = Number(directSingleEndData.finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
        setDirectSingleEndOpen(false);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
    };

    // 大当り終了
    const handleChainEnd = () => {
        if (!isChainActive) return;
        const currentHitsCount = lastChain.hits.length;
        if (currentHitsCount === 0) return; // ヒットがない場合は終了できない

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || h.sapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.completed = true;
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const finalBallsToAdd = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
        S.pushLog({ type: "連チャン終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
    };

    // 長押し削除ハンドラー
    const handleLongPressStart = (chainId) => {
        longPressTimerRef.current = setTimeout(() => {
            setDeleteTargetId(chainId);
            setDeleteConfirmOpen(true);
        }, 500);
    };

    const handleLongPressEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleDeleteConfirm = () => {
        if (deleteTargetId) {
            S.setJpLog((prev) => {
                const chainToDelete = prev.find(c => c.chainId === deleteTargetId);
                if (chainToDelete && chainToDelete.completed) {
                    const ballsToRemove = chainToDelete.finalBalls || 0;
                    const trayToRemove = chainToDelete.trayBalls || 0;
                    S.setCurrentMochiBalls((p) => Math.max(0, p - ballsToRemove));
                    S.setTotalTrayBalls((p) => Math.max(0, p - trayToRemove));
                }
                return prev.filter(c => c.chainId !== deleteTargetId);
            });
        }
        setDeleteConfirmOpen(false);
        setDeleteTargetId(null);
    };
    // ========== 大当たり履歴タブ用state ここまで ==========

    // セットアップ用の一時state
    const [setupStore, setSetupStore] = useState("");
    const [setupMachineNum, setSetupMachineNum] = useState("");
    const [setupMachineName, setSetupMachineName] = useState("");
    const [setupStartRot, setSetupStartRot] = useState("");
    const [setupInitialBalls, setSetupInitialBalls] = useState("");

    // 機種検索結果
    const machineResults = useMemo(() => {
        if (!machineQuery.trim()) return [];
        return searchMachines(machineQuery, S.customMachines).slice(0, 8);
    }, [machineQuery, S.customMachines]);

    // 店舗の貯玉残高を取得
    const currentStoreData = useMemo(() => {
        const stores = S.stores || [];
        return stores.find(st => typeof st === "object" && st.name === S.storeName);
    }, [S.stores, S.storeName]);

    // セッションが開始されているか
    const sessionActive = rows.some(r => r.type === "start");

    useEffect(() => {
        // 新しいデータが追加された時に自動スクロールで最新を表示
        if (tableRef.current && rows.length > 0) {
            // より確実にDOMの更新を待つ
            const scrollToBottom = () => {
                if (tableRef.current) {
                    const element = tableRef.current;
                    // scrollHeightがcontentの全高、scrollTopを最大にして最下部へ
                    element.scrollTop = element.scrollHeight;
                }
            };
            // 複数のタイミングでスクロールを試行（遅延を増やして確実に）
            requestAnimationFrame(() => {
                scrollToBottom();
                // 追加のタイミングで再度スクロール（遅延レンダリング対策）
                setTimeout(scrollToBottom, 50);
                setTimeout(scrollToBottom, 150);
                setTimeout(scrollToBottom, 300);
            });
        }
    }, [rows.length]);

    const dataRows = rows.filter((r) => r.type === "data");
    const last = dataRows[dataRows.length - 1];

    const rotCol = (v) => {
        if (v == null || isNaN(v)) return C.text;
        if (v >= border + 3) return C.green;
        if (v >= border) return "#86efac";
        if (v >= border - 3) return C.yellow;
        return C.red;
    };

    // 行背景色（ボーダー超えでも帯は表示しない）
    const rowBg = (v, isEven) => {
        return isEven ? "transparent" : "rgba(255,255,255,0.015)";
    };

    // バリデーション付き記録関数
    const validateInput = () => {
        const trimmed = input.trim();
        if (!trimmed) {
            setInputError("回転数を入力してください");
            return null;
        }
        const val = Number(trimmed);
        if (isNaN(val)) {
            setInputError("数値を入力してください");
            return null;
        }
        if (val <= 0) {
            setInputError("0より大きい値を入力してください");
            return null;
        }
        setInputError("");
        return val;
    };

    const investPace = S.investPace || 1000;
    const rentBalls = S.rentBalls || 250; // 貸玉数（デフォルト250玉/1K）

    const decide = () => {
        const val = validateInput();
        if (val === null) return;

        // 前回の累計回転数: 全ての行（data, start, hit）で最後の行を見る
        const lastRow = rows[rows.length - 1];
        const prevCumRot = lastRow ? lastRow.cumRot : S.startRot;
        const thisRot = val - prevCumRot;
        const prevInvest = last ? last.invest : 0;

        let newInvest = prevInvest;
        let ballsConsumed = 0;

        if (S.playMode === "cash") {
            // 現金モード：投資額を増加
            newInvest = prevInvest + investPace;
        } else if (S.playMode === "mochi") {
            // 持ち玉モード：投資は増えない、持ち玉を減らす
            ballsConsumed = rentBalls * (investPace / 1000); // 1Kあたりの玉数
            S.setCurrentMochiBalls((prev) => Math.max(0, prev - ballsConsumed));
        } else if (S.playMode === "chodama") {
            // 貯玉モード：貯玉を消費し、等価換算で投資に反映（4円=250玉/1K）
            ballsConsumed = rentBalls * (investPace / 1000);
            S.setCurrentChodama((prev) => Math.max(0, prev - ballsConsumed));
            // 貯玉使用を投資に反映
            newInvest = prevInvest + investPace;
        }

        // 平均回転数計算 - セッション全体の累積平均（上皿補正込み）
        // 総通常回転数 = 全データ行のthisRotの合計
        const allDataRows = rows.filter(r => r.type === "data");
        let totalThisRot = 0;
        allDataRows.forEach(r => {
            totalThisRot += r.thisRot || 0;
        });
        totalThisRot += thisRot; // 今回の回転数も追加

        // 上皿補正: jpLogから全チェーンのtrayBallsを円換算
        const totalTrayBalls = (S.jpLog || []).reduce((sum, chain) => sum + (chain.trayBalls || 0), 0);
        const trayYenCorrection = totalTrayBalls * (1000 / rentBalls); // 上皿玉の円換算

        // 実質現金投資 = 現金投資 - 上皿補正（0未満にはしない）
        const correctedCashInvest = Math.max(newInvest - trayYenCorrection, 0);

        // 総投資K数 = 実質現金K + 持ち玉K + 貯玉K
        let totalKUsed = correctedCashInvest / 1000;
        allDataRows.forEach(r => {
            // 持ち玉/貯玉モードの行は、消費玉数を投資K数に換算して追加
            // ballsConsumedが未定義の場合（古いデータ）はinvestPace相当の玉数を使用
            if (r.mode === "mochi" || r.mode === "chodama") {
                const consumed = r.ballsConsumed !== undefined && r.ballsConsumed !== null
                    ? r.ballsConsumed
                    : rentBalls * ((S.investPace || 1000) / 1000);
                if (consumed > 0) {
                    totalKUsed += consumed / rentBalls;
                }
            }
        });
        // 今回の持ち玉/貯玉消費も追加
        if (S.playMode === "mochi" || S.playMode === "chodama") {
            totalKUsed += ballsConsumed / rentBalls;
        }

        const newAvg = totalKUsed > 0
            ? parseFloat((totalThisRot / totalKUsed).toFixed(1))
            : (totalThisRot > 0 ? totalThisRot : 0); // 投資0でも回転数があれば回転数を表示

        setRows((r) => [...r, {
            type: "data",
            thisRot,
            cumRot: val,
            avgRot: newAvg,
            invest: S.playMode === "mochi" ? prevInvest : newInvest, // 持ち玉モードは投資額変わらない
            mode: S.playMode,
            ballsConsumed, // 消費玉数を記録
            mochiBalls: S.playMode === "mochi" ? Math.max(0, S.currentMochiBalls - ballsConsumed) : S.currentMochiBalls,
            chodamaBalls: S.playMode === "chodama" ? Math.max(0, S.currentChodama - ballsConsumed) : S.currentChodama
        }]);

        const logType = S.playMode === "mochi"
            ? `持ち玉${ballsConsumed}玉消費`
            : S.playMode === "chodama"
            ? `貯玉${ballsConsumed}玉消費`
            : `${investPace >= 1000 ? investPace/1000 + "K" : investPace + "円"}決定`;
        S.pushLog({ type: logType, time: tsNow(), rot: thisRot, cash: S.playMode === "mochi" ? 0 : investPace, mode: S.playMode });
        setInput("");
        setInputError("");
    };

    // 新規稼働開始
    const handleStartSession = () => {
        const val = Number(setupStartRot) || 0;

        // 店舗・機種設定を適用
        if (setupStore) S.setStoreName(setupStore);
        if (setupMachineNum) S.setMachineNum(setupMachineNum);
        if (setupMachineName) S.setMachineName(setupMachineName);
        // 新規稼働開始時は貯玉を設定（未入力なら0でリセット）
        S.setCurrentChodama(Number(setupInitialBalls) || 0);
        // 持ち玉は0にリセット（移動時に設定する）
        S.setCurrentMochiBalls(0);

        // セッション開始
        S.setStartRot(val);
        S.setSessionStarted(true);
        const initialChodama = Number(setupInitialBalls) || 0;
        setRows((r) => [...r, { type: "start", cumRot: val, mode: S.playMode, mochiBalls: 0, chodamaBalls: initialChodama }]);
        S.pushLog({ type: "スタート", time: tsNow(), rot: val });

        // モーダルを閉じてリセット
        setShowSetupModal(false);
        setSetupStore("");
        setSetupMachineNum("");
        setSetupMachineName("");
        setSetupStartRot("");
        setSetupInitialBalls("");
    };

    // 初当たりボタン → ウィザード開始
    const handleStartChain = () => {
        const val = Number(input);
        const prevCumRot = last ? last.cumRot : S.startRot;
        const hitRot = val > 0 ? val : (prevCumRot || 0);
        const hitThisRot = val > 0 ? val - prevCumRot : 0;

        // 回転数テーブルに初当たりマーカー行を追加
        if (val > 0) {
            setRows(r => [...r, { type: "hit", cumRot: val, thisRot: hitThisRot, invest: last ? last.invest : 0, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama }]);
        }

        S.pushJP({
            chainId: Date.now(),
            trayBalls: 0,
            hits: [],
            hitRot,
            hitThisRot,
            finalBalls: null,
            summary: null,
            completed: false,
            time: tsNow(),
        });
        S.pushLog({ type: "初当たり", time: tsNow(), rot: hitRot });
        setInput("");
        // ウィザードを開始
        setHitWizardData({ trayBalls: "", rounds: 3, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setHitWizardStep(0);
        setHitWizardOpen(true);
    };

    // 大当たり後スタート: 現在の入力値を新しいスタート回転数として設定し、テーブルに行を追加
    const handlePostJackpotStart = () => {
        const val = Number(input);
        if (val > 0) {
            S.setStartRot(val);
            // テーブルにスタート行を追加（投資額も記録して平均回転数計算の基準にする）
            setRows((r) => [...r, { type: "start", cumRot: val, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true, invest: S.investYen }]);
            S.pushLog({ type: "大当たり後スタート", time: tsNow(), rot: val });
            setInput("");
        }
    };

    // ウィザード完了時の処理
    // ウィザード完了: 単発の場合はチェーン完了、確変の場合はHistoryTabへ
    // overrideHitType: 確変ボタンから直接呼ばれる場合に使用（setStateが非同期のため）
    const handleWizardComplete = (overrideHitType) => {
        const { trayBalls, rounds, displayBalls, actualBalls, hitType: stateHitType, jitanSpins, finalBallsAfterJitan } = hitWizardData;
        const hitType = overrideHitType || stateHitType;
        const rnd = Number(rounds) || 0;
        const tray = Number(trayBalls) || 0;
        const disp = Number(displayBalls) || 0;
        const actual = Number(actualBalls) || 0;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        if (rnd <= 0) {
            setHitWizardOpen(false);
            return;
        }

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.trayBalls = tray;
            S.setTotalTrayBalls((p) => p + tray);
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                lastOutBalls: 0,
                nextTimingBalls: 0,
                elecSapoRot: 0,
                sapoChange: 0,
                sapoPerRot: 0,
                rounds: rnd,
                displayBalls: disp,
                actualBalls: actual,
                time: tsNow(),
            }];

            // 単発の場合: チェーンを完了させる
            if (hitType === "単発") {
                chain.hitType = "単発";
                chain.jitanSpins = jitan;
                chain.finalBallsAfterJitan = finalBalls;
                chain.completed = true;
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                chain.summary = {
                    totalRounds,
                    totalDisplayBalls,
                    totalSapoRot: 0,
                    totalSapoChange: 0,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: 0,
                    sapoPerRot: 0,
                    netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls,
                };
                chain.finalBalls = finalBalls > 0 ? finalBalls : (tray + totalDisplayBalls);
            }

            updated[updated.length - 1] = chain;
            return updated;
        });

        S.pushLog({ type: hitType === "単発" ? "単発終了" : "初当たり記録", time: tsNow(), rounds: rnd });
        setHitWizardOpen(false);
        setHitWizardData({ trayBalls: "", rounds: 3, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });

        // 確変の場合: HistoryTabで連チャン記録継続
        if (hitType === "確変") {
            S.setTab("history");
        } else {
            // 単発の場合: 持ち玉モードに切替 & 出玉を持ち玉に加算 & 回転タブへ
            const addBalls = finalBalls > 0 ? finalBalls : (tray + disp);
            S.setCurrentMochiBalls((prev) => prev + addBalls);
            S.setPlayMode("mochi");
            S.setTab("rot");
            // 時短終了後のスタート入力プロンプトを表示
            S.setShowStartPrompt(true);
        }
    };

    // セッション内サブタブのスワイプ処理
    const sessionSubTabs = ["data", "rot", "history", "settings"];
    const sessionSubTabLabels = { data: "データ", rot: "回転入力", history: "大当たり", settings: "機種設定" };
    const swipeAreaRef = useRef(null);
    const swipeState = useRef({ startX: null, startY: null, dir: null, offset: 0 });
    const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
    const [headerIsAnimating, setHeaderIsAnimating] = useState(false);

    // useEffectでタッチイベントを{ passive: false }で登録
    useEffect(() => {
        const el = swipeAreaRef.current;
        if (!el) return;

        const handleTouchStart = (e) => {
            if (headerIsAnimating) return;
            swipeState.current = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                dir: null,
                offset: 0
            };
        };

        const handleTouchMove = (e) => {
            const state = swipeState.current;
            if (state.startX === null || headerIsAnimating) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - state.startX;
            const diffY = currentY - state.startY;

            // 方向が未確定の場合、10px以上動いたら判定
            if (state.dir === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
                if (Math.abs(diffY) > Math.abs(diffX)) {
                    state.dir = "vertical";
                    return;
                } else {
                    state.dir = "horizontal";
                }
            }

            if (state.dir !== "horizontal") return;

            // 水平スワイプ時はブラウザのデフォルト動作を防止
            e.preventDefault();
            e.stopPropagation();

            const currentIndex = sessionSubTabs.indexOf(S.sessionSubTab);
            const isAtStart = currentIndex === 0 && diffX > 0;
            const isAtEnd = currentIndex === sessionSubTabs.length - 1 && diffX < 0;
            // 1:1追従。端では抵抗をかける
            const resistance = (isAtStart || isAtEnd) ? 0.3 : 1.0;
            state.offset = diffX * resistance;
            setHeaderSwipeOffset(state.offset);
        };

        const handleTouchEnd = () => {
            const state = swipeState.current;
            if (state.startX === null || headerIsAnimating || state.dir !== "horizontal") {
                swipeState.current = { startX: null, startY: null, dir: null, offset: 0 };
                setHeaderSwipeOffset(0);
                return;
            }

            const threshold = 50; // 50px以上スワイプで切り替え
            const currentIndex = sessionSubTabs.indexOf(S.sessionSubTab);

            if (Math.abs(state.offset) > threshold) {
                if (state.offset > 0 && currentIndex > 0) {
                    setHeaderIsAnimating(true);
                    S.setSessionSubTab(sessionSubTabs[currentIndex - 1]);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 180);
                } else if (state.offset < 0 && currentIndex < sessionSubTabs.length - 1) {
                    setHeaderIsAnimating(true);
                    S.setSessionSubTab(sessionSubTabs[currentIndex + 1]);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 180);
                } else {
                    setHeaderIsAnimating(true);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 150);
                }
            } else {
                setHeaderIsAnimating(true);
                setHeaderSwipeOffset(0);
                setTimeout(() => setHeaderIsAnimating(false), 150);
            }

            swipeState.current = { startX: null, startY: null, dir: null, offset: 0 };
        };

        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            el.removeEventListener("touchstart", handleTouchStart);
            el.removeEventListener("touchmove", handleTouchMove);
            el.removeEventListener("touchend", handleTouchEnd);
        };
    }, [headerIsAnimating, S.sessionSubTab]);

    // セッション未開始：新規稼働ボタンを中央に表示
    if (!sessionActive) {
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", padding: 24 }}>
                {/* 中央の新規稼働ボタン - プレミアムデザイン */}
                <button
                    className="b"
                    onClick={() => setShowSetupModal(true)}
                    style={{
                        width: 140,
                        height: 140,
                        borderRadius: "50%",
                        background: "linear-gradient(145deg, #f97316, #ea580c)",
                        border: "3px solid rgba(255,255,255,0.1)",
                        boxShadow: "0 12px 40px rgba(249, 115, 22, 0.45), inset 0 2px 0 rgba(255,255,255,0.2)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        cursor: "pointer",
                        transition: "transform 0.25s ease, box-shadow 0.25s ease",
                    }}
                >
                    <span style={{ fontSize: 56, color: "#fff", fontWeight: 200, lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>+</span>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>新規稼働</span>
                </button>

                <p style={{ marginTop: 28, fontSize: 14, color: C.sub, textAlign: "center", lineHeight: 1.7 }}>
                    タップして稼働を開始
                </p>

                {/* 貯玉残高表示 - カード化 */}
                {currentStoreData?.chodama > 0 && (
                    <div className="summary-card" style={{ marginTop: 24, padding: "16px 32px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>{currentStoreData.name} 貯玉残高</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: C.purple, fontFamily: mono }}>{f(currentStoreData.chodama)}</div>
                    </div>
                )}

                {/* セットアップモーダル - プレミアムデザイン */}
                {showSetupModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                        <div className="card-premium" style={{ width: "100%", maxWidth: 360, maxHeight: "85vh", overflowY: "auto" }}>
                            <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
                                <h2 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>稼働開始</h2>
                                <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>台の情報を入力してください</p>
                            </div>

                            <div style={{ padding: 18 }}>
                                {/* 店舗選択 */}
                                <div style={{ marginBottom: 16, position: "relative" }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>店舗</div>
                                    <div style={{ position: "relative" }}>
                                        <input
                                            type="text"
                                            value={setupStore}
                                            onChange={e => setSetupStore(e.target.value)}
                                            placeholder="店舗名を入力"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px 40px 14px 14px", fontSize: 16, color: C.text, fontFamily: font, outline: "none", transition: "border-color 0.2s" }}
                                        />
                                        {(S.stores || []).length > 0 && (
                                            <button className="b" onClick={() => setShowStoreDD(!showStoreDD)} style={{
                                                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                                background: "rgba(255,255,255,0.05)", border: "none", color: C.sub, fontSize: 12, padding: "6px 8px", borderRadius: 6
                                            }}>▼</button>
                                        )}
                                    </div>
                                    {showStoreDD && (S.stores || []).length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 150, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                            {(S.stores || []).map((st, i) => {
                                                const name = typeof st === "object" ? st.name : st;
                                                const chodama = typeof st === "object" ? st.chodama : 0;
                                                return (
                                                    <button key={st.id || i} className="b" onClick={() => {
                                                        setSetupStore(name);
                                                        if (typeof st === "object") {
                                                            if (st.rentBalls) S.setRentBalls(st.rentBalls);
                                                            if (st.exRate) S.setExRate(st.exRate);
                                                            if (st.chodama) S.setCurrentChodama(st.chodama);
                                                            S.setSelectedStoreId(st.id);
                                                        }
                                                        setShowStoreDD(false);
                                                    }} style={{
                                                        width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                        color: C.text, fontSize: 14, padding: "12px 14px", textAlign: "left", fontFamily: font, display: "flex", justifyContent: "space-between", alignItems: "center"
                                                    }}>
                                                        <span>{name}</span>
                                                        {chodama > 0 && <span style={{ fontSize: 11, color: C.purple, fontFamily: mono }}>貯玉: {f(chodama)}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* 機種選択 */}
                                <div style={{ marginBottom: 12, position: "relative" }}>
                                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, fontWeight: 600 }}>機種</div>
                                    <input
                                        type="text"
                                        value={setupMachineName}
                                        onChange={e => { setSetupMachineName(e.target.value); setMachineQuery(e.target.value); setShowMachineDD(true); }}
                                        onFocus={() => setShowMachineDD(true)}
                                        placeholder="機種名を検索..."
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "12px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }}
                                    />
                                    {showMachineDD && machineResults.length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                            {machineResults.map((m, i) => (
                                                <button key={m.id || i} className="b" onClick={() => {
                                                    setSetupMachineName(m.name);
                                                    S.setSynthDenom(m.synthProb);
                                                    if (m.spec1R) S.setSpec1R(m.spec1R);
                                                    if (m.specAvgTotalRounds) S.setSpecAvgRounds(m.specAvgTotalRounds);
                                                    if (m.specSapo != null) S.setSpecSapo(m.specSapo);
                                                    setShowMachineDD(false);
                                                    setMachineQuery("");
                                                }} style={{
                                                    width: "100%", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", border: "none", borderBottom: `1px solid ${C.border}`,
                                                    padding: "12px 14px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center"
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.name}</div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>{m.maker || ""}</div>
                                                    </div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow, fontFamily: mono }}>{m.prob || `1/${m.synthProb}`}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 台番号・開始回転数 */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>台番号</div>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            value={setupMachineNum}
                                            onChange={e => setSetupMachineNum(e.target.value)}
                                            placeholder="例: 123"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>開始回転数</div>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            value={setupStartRot}
                                            onChange={e => setSetupStartRot(e.target.value)}
                                            placeholder="0"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                        />
                                    </div>
                                </div>

                                {/* 貯玉 */}
                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貯玉（任意）</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={setupInitialBalls}
                                        onChange={e => setSetupInitialBalls(e.target.value)}
                                        placeholder="0"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>

                                {/* ボタン - プレミアムデザイン */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <button className="b" onClick={() => setShowSetupModal(false)} style={{
                                        background: "rgba(255,255,255,0.05)", border: `1px solid ${C.borderHi}`, borderRadius: 14, color: C.text, fontSize: 15, fontWeight: 700, padding: "16px 0", fontFamily: font
                                    }}>キャンセル</button>
                                    <button className="b btn-premium btn-secondary" onClick={handleStartSession}>
                                        稼働開始
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 現在のモードでの投資表示を計算
    const getInvestDisplay = (invest) => {
        if (S.playMode === "mochi") return "—";
        return f(invest);
    };

    // 貯玉使用時の投資額計算（等価4円: 250玉 = 1000円）
    const getChodamaInvestYen = (balls) => {
        const ballValue = 4; // 等価4円
        return Math.floor(balls / (1000 / ballValue / S.rentBalls)) * 1000;
    };

    // セッション開始後：データ表示とコントロール
    return (
        <div
            ref={swipeAreaRef}
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
            {/* セッションヘッダー：スワイプ可能なタブ */}
            <div
                style={{
                    flexShrink: 0,
                    borderBottom: `1px solid ${C.border}`,
                    background: "rgba(15,15,20,0.98)"
                }}
            >
                {/* 機種・店舗情報 */}
                <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="b" onClick={() => setSummaryCollapsed(!summaryCollapsed)} style={{
                        flex: 1, background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 6
                    }}>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{S.machineName || "機種未設定"}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>{S.storeName} {S.machineNum && `#${S.machineNum}`}</div>
                        </div>
                        <span style={{ fontSize: 8, color: C.sub }}>{summaryCollapsed ? "▼" : "▲"}</span>
                    </button>
                    <button className="b" onClick={() => setShowInvestSettings(true)} style={{
                        background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: "5px 8px", display: "flex", alignItems: "center", gap: 4
                    }}>
                        <span style={{ fontSize: 11 }}>⚙️</span>
                        <span style={{ fontSize: 10, color: C.subHi, fontWeight: 600 }}>{investPace >= 1000 ? `${investPace/1000}K` : `${investPace}円`}</span>
                    </button>
                </div>

                {/* サマリーカード群（折りたたみ） */}
                {!summaryCollapsed && (
                    <div className="summary-card" style={{ padding: 6, margin: "0 12px 6px", borderRadius: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>回転率</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.bDiff), fontFamily: mono, lineHeight: 1 }}>{ev.start1K > 0 ? f(ev.start1K, 1) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>EV/K</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.ev1K), fontFamily: mono, lineHeight: 1 }}>{ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>仕事量</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.workAmount), fontFamily: mono, lineHeight: 1 }}>{ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>初当</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: mono, lineHeight: 1 }}>{ev.jpCount || 0}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* スワイプ可能タブバー */}
                <div
                    style={{
                        display: "flex",
                        overflow: "hidden",
                        transform: `translateX(${headerSwipeOffset}px)`,
                        transition: headerIsAnimating ? "transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none"
                    }}
                >
                    {sessionSubTabs.map((tabId) => {
                        const isActive = S.sessionSubTab === tabId;
                        return (
                            <button
                                key={tabId}
                                className="b"
                                onClick={() => S.setSessionSubTab(tabId)}
                                style={{
                                    flex: 1,
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: isActive ? `3px solid ${C.blue}` : "3px solid transparent",
                                    padding: "10px 4px 8px",
                                    fontSize: 12,
                                    fontWeight: isActive ? 700 : 500,
                                    color: isActive ? C.blue : C.sub,
                                    fontFamily: font,
                                    transition: "all 0.2s"
                                }}
                            >
                                {sessionSubTabLabels[tabId]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 回転入力タブ */}
            {S.sessionSubTab === "rot" && (
                <>
                    {/* Table Header - コンパクト */}
                    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 48px 52px", background: "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(139, 92, 246, 0.08))", padding: "8px 4px", margin: "4px 12px 4px", borderRadius: 8, flexShrink: 0, border: `1px solid rgba(59, 130, 246, 0.15)` }}>
                        {["種別", "総回転", "今回", "平均", "投資", "持ち玉"].map((h) => (
                            <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: C.subHi, fontFamily: font, letterSpacing: 0.3 }}>{h}</div>
                        ))}
                    </div>

                    {/* Data Rows - 視認性向上、文字小さめ */}
                    <div ref={tableRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 12px", paddingBottom: 280, overscrollBehavior: "contain" }}>
                {rows.map((row, i) => {
                    // 投資表示（持ち玉/貯玉モードは消費玉数を円換算で表示）
                    const investDisplay = (row.mode === "mochi" || row.mode === "chodama")
                        ? (row.ballsConsumed ? f(row.ballsConsumed * (1000 / rentBalls)) : "—")
                        : f(row.invest || 0);

                    if (row.type === "start") return (
                        <div key={i} className="fin row-start" style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 48px 52px", padding: "10px 4px", marginBottom: 3, borderRadius: 8, alignItems: "center" }}>
                            <div style={{ textAlign: "center" }}><ModeBadge mode={row.mode || "cash"} /></div>
                            <div style={{ textAlign: "center", fontSize: 14, color: C.blue, fontFamily: mono, fontWeight: 600 }}>{f(row.cumRot)}</div>
                            <div style={{ textAlign: "center", fontSize: 11, color: C.sub }}>—</div>
                            <div style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: 1, background: "rgba(59, 130, 246, 0.12)", padding: "3px 6px", borderRadius: 5 }}>START</div>
                            <div style={{ textAlign: "center", fontSize: 10, color: C.sub }}>—</div>
                            <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0))}</div>
                        </div>
                    );
                    if (row.type === "hit") return (
                        <div key={i} className="fin row-hit" style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 48px 52px", padding: "10px 4px", marginBottom: 3, borderRadius: 8, alignItems: "center" }}>
                            <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "linear-gradient(135deg, #f97316, #ea580c)", borderRadius: 5, padding: "3px 6px", boxShadow: "0 2px 6px rgba(249, 115, 22, 0.25)" }}>当</span></div>
                            <div style={{ textAlign: "center", fontSize: 14, color: C.orange, fontFamily: mono, fontWeight: 700 }}>{f(row.cumRot)}</div>
                            <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: C.orange, fontFamily: mono }}>{row.thisRot}</div>
                            <div style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: C.orange, background: "rgba(249, 115, 22, 0.12)", padding: "3px 5px", borderRadius: 5 }}>当G数</div>
                            <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{investDisplay}</div>
                            <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0))}</div>
                        </div>
                    );
                    const isAboveBorder = row.avgRot >= border;
                    return (
                        <div key={i} className={`fin ${i % 2 === 0 ? "" : "row-data"}`} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 48px 52px", padding: "10px 4px", marginBottom: 2, borderRadius: 6, alignItems: "center", background: rowBg(row.avgRot, i % 2 === 0) }}>
                            <div style={{ textAlign: "center" }}><ModeBadge mode={row.mode || "cash"} /></div>
                            <div style={{ textAlign: "center", fontSize: 13, color: isAboveBorder ? C.green : C.subHi, fontFamily: mono, fontWeight: 500 }}>{f(row.cumRot)}</div>
                            <div style={{ textAlign: "center", fontSize: 20, fontWeight: 800, color: rotCol(row.thisRot), fontFamily: mono }}>{row.thisRot}</div>
                            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: rotCol(row.avgRot || 0), fontFamily: mono }}>
                                {row.avgRot || "—"}
                            </div>
                            <div style={{ textAlign: "center", fontSize: 10, color: isAboveBorder ? C.green : C.sub, fontFamily: mono }}>{investDisplay}</div>
                            <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : (isAboveBorder ? C.green : C.orange), fontFamily: mono }}>{f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0))}</div>
                        </div>
                    );
                })}
            </div>

            {/* Bottom Control Panel - 中央下段 */}
            <div style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: "calc(65px + env(safe-area-inset-bottom))",
                background: "linear-gradient(180deg, rgba(15,15,20,0.95) 0%, rgba(15,15,20,0.98) 100%)",
                backdropFilter: "blur(12px)",
                borderTop: `1px solid ${C.border}`,
                padding: "10px 12px 12px",
                zIndex: 100
            }}>
                {/* 入力欄 - コンパクト */}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                    <input
                        type="tel"
                        inputMode="numeric"
                        value={input}
                        onChange={e => { setInput(e.target.value); setInputError(""); }}
                        onKeyDown={e => e.key === "Enter" && decide()}
                        placeholder="回転数"
                        className={`input-premium ${inputError ? "error" : ""}`}
                        style={{ flex: 1, boxSizing: "border-box", fontFamily: mono, padding: "10px 12px", fontSize: 16 }}
                    />
                    {/* 削除ボタン */}
                    <button className="b" onClick={() => {
                        setRows((r) => {
                            if (r.length === 0) return r;
                            const lastRow = r[r.length - 1];
                            // 持ち玉/貯玉モードの行を削除する場合、消費玉数を戻す
                            if (lastRow.type === "data") {
                                const ballsConsumed = lastRow.ballsConsumed || (rentBalls * (investPace / 1000));
                                if (lastRow.mode === "mochi") {
                                    S.setCurrentMochiBalls((prev) => prev + ballsConsumed);
                                } else if (lastRow.mode === "chodama") {
                                    S.setCurrentChodama((prev) => prev + ballsConsumed);
                                }
                            }
                            return r.slice(0, -1);
                        });
                        setInputError("");
                    }} style={{ background: "rgba(239, 68, 68, 0.12)", border: `1px solid rgba(239, 68, 68, 0.3)`, borderRadius: 8, color: C.red, fontSize: 10, padding: "10px 10px", fontFamily: font, fontWeight: 700 }}>削除</button>
                </div>
                {inputError && (
                    <div className="error-msg" style={{ marginBottom: 8, fontSize: 10 }}>{inputError}</div>
                )}

                {/* メインボタン 2つ - 大きめ */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <button className="b btn-premium btn-primary" onClick={decide} style={{ padding: "18px 8px", fontSize: 15, fontWeight: 800 }}>記録</button>
                    <button className="b btn-premium btn-secondary" onClick={handleStartChain} style={{ padding: "18px 8px", fontSize: 15, fontWeight: 800 }}>初当たり</button>
                </div>

                {/* モード切替 - 現/持/貯玉 */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                    <ModeToggle mode={S.playMode} setMode={S.setPlayMode} showChodama={true} compact={false} />
                </div>

                {/* 下段ボタン: 台移動 & 大当たり後スタート */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button className="b" onClick={() => setShowMoveModal(true)} style={{ background: "rgba(139, 92, 246, 0.15)", border: `1px solid rgba(139, 92, 246, 0.3)`, borderRadius: 10, color: C.purple, fontSize: 12, fontWeight: 700, padding: "12px 8px", fontFamily: font }}>台移動</button>
                    <button className="b" onClick={handlePostJackpotStart} style={{ background: "rgba(16, 185, 129, 0.15)", border: `1px solid rgba(16, 185, 129, 0.3)`, borderRadius: 10, color: C.green, fontSize: 12, fontWeight: 700, padding: "12px 8px", fontFamily: font }}>大当たり後スタート</button>
                </div>
            </div>
                </>
            )}

            {/* 大当たりタブ - HistoryTabから完全移植 */}
            {S.sessionSubTab === "history" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Sub Tab */}
                    <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", padding: "4px", margin: "12px 14px", borderRadius: 12, flexShrink: 0 }}>
                        {[["jp", "大当たり履歴"], ["ses", "稼働ログ"]].map(([id, lbl]) => (
                            <button key={id} className="b" onClick={() => setHistorySub(id)} style={{
                                flex: 1, background: historySub === id ? C.surfaceHi : "transparent", border: "none",
                                borderRadius: 8, color: historySub === id ? C.text : C.sub, fontSize: 13, fontWeight: historySub === id ? 700 : 500,
                                padding: "10px 0", fontFamily: font, boxShadow: historySub === id ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                            }}>{lbl}</button>
                        ))}
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
                        {historySub === "jp" ? (
                            <div>
                                {/* 連チャン中バナー */}
                                {isChainActive && (
                                    <div style={{ background: `linear-gradient(135deg, ${C.orange}20, ${C.red}10)`, border: `1px solid ${C.orange}40`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, marginBottom: 4 }}>
                                            {lastChain.hits.length === 0 ? "初当たり — 1連目を入力してください" : `連チャン中 — ${lastChain.hits.length}連目まで記録済み`}
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub }}>
                                            {lastChain.hits.length > 0 && `上皿玉: ${f(lastChain.trayBalls)}玉 | `}{lastChain.time}
                                        </div>
                                    </div>
                                )}

                                {/* アクションボタン */}
                                {isChainActive ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                        <button className="b" onClick={openChainWizard} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff",
                                            boxShadow: "0 4px 16px rgba(16,185,129,0.4)"
                                        }}>連チャン追加</button>
                                        <button className="b" onClick={openDirectSingleEnd} disabled={lastChain.hits.length === 0} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: lastChain.hits.length === 0 ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                                            border: "none", color: "#fff",
                                            boxShadow: lastChain.hits.length === 0 ? "none" : "0 4px 16px rgba(99,102,241,0.4)",
                                            opacity: lastChain.hits.length === 0 ? 0.5 : 1
                                        }}>単発終了</button>
                                        <button className="b" onClick={handleChainEnd} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff",
                                            boxShadow: "0 4px 16px rgba(249,115,22,0.4)"
                                        }}>大当り終了</button>
                                    </div>
                                ) : (
                                    <Card style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                                            回転数タブの「初当たり」ボタンから<br />チェーンを開始してください
                                        </div>
                                    </Card>
                                )}

                                {/* 実測サマリー */}
                                <div style={{ margin: "0 0 16px", background: "rgba(0,0,0,0.2)", border: `1px solid ${C.teal}30`, borderRadius: 12, overflow: "hidden" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                                        {[
                                            { label: "平均1R出玉", val: ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", unit: "玉", col: C.teal },
                                            { label: "サポ増減/回転", val: ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", unit: "玉/回転", col: sc(ev.sapoPerRot) },
                                            { label: "平均R数", val: ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", unit: "R", col: C.blue },
                                            { label: "初当たり", val: jpLog.length > 0 ? jpLog.length.toString() : "0", unit: "回", col: C.green },
                                        ].map(({ label, val, unit, col }, idx) => (
                                            <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 3 ? `1px solid ${C.border}` : "none" }}>
                                                <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                                <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* History — Chain Cards */}
                                {jpLog.length === 0 ? (
                                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                                ) : (
                                    [...jpLog].reverse().map((chain, ci) => (
                                        <Card
                                            key={chain.chainId || ci}
                                            style={{
                                                padding: "12px 16px", marginBottom: 12,
                                                background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "rgba(255,255,255,0.02)"
                                            }}
                                            onTouchStart={() => handleLongPressStart(chain.chainId)}
                                            onTouchEnd={handleLongPressEnd}
                                            onTouchMove={handleLongPressEnd}
                                        >
                                            {/* Chain Header */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>
                                                    {!chain.completed ? "連チャン中" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}
                                                </span>
                                                <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                            </div>
                                            {/* 初当たり回転数 */}
                                            {chain.hitRot > 0 && (
                                                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                                    <span style={{ fontSize: 10, color: C.sub }}>総回転: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitRot)}</span></span>
                                                    {chain.hitThisRot > 0 && <span style={{ fontSize: 10, color: C.sub }}>ハマり: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitThisRot)}</span></span>}
                                                </div>
                                            )}
                                            {/* Individual Hits */}
                                            {chain.hits.map((hit, hi) => {
                                                const change = hit.sapoChange != null ? hit.sapoChange : 0;
                                                const perRot = hit.sapoPerRot != null ? hit.sapoPerRot : 0;
                                                return (
                                                    <div key={hi} style={{ padding: "6px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                            <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow }}>{hit.hitNumber}連目</span>
                                                            <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{hit.time}</span>
                                                        </div>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}回</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>サポ増減</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: sc(change), fontFamily: mono }}>{change >= 0 ? "+" : ""}{change}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>サポ/回転</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* Chain Summary */}
                                            {chain.completed && chain.summary && (
                                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>1R出玉</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}</div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>サポ増減/回転</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoPerRot || 0), fontFamily: mono }}>
                                                                {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>サポ総増減</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}</div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>純増出玉</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                        {f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}{f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = {f(Math.round(chain.summary.netGain))}
                                                    </div>
                                                </div>
                                            )}
                                            {!chain.completed && chain.hits.length === 0 && (
                                                <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                            )}
                                        </Card>
                                    ))
                                )}
                                <Btn label="最新履歴を削除" onClick={() => { S.setJpLog((p) => p.slice(0, -1)); }} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                            </div>
                        ) : (
                            <div>
                                {sesLog.length === 0 ? (
                                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>ログがありません</div>
                                ) : (
                                    sesLog.map((e, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{e.type}</div>
                                                <div style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{e.time}</div>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                {e.rot != null && <div style={{ fontSize: 12, color: C.blue, fontFamily: mono }}>{f(e.rot)}回</div>}
                                                {e.cash != null && <div style={{ fontSize: 12, color: C.red, fontFamily: mono }}>-{f(e.cash)}円</div>}
                                                {e.tray != null && <div style={{ fontSize: 10, color: C.teal }}>上皿:{f(e.tray)}玉</div>}
                                                {e.netGain != null && <div style={{ fontSize: 10, color: C.green }}>純増:{f(e.netGain)}玉</div>}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <Btn label="最新ログを削除" onClick={() => { S.setSesLog((p) => p.slice(0, -1)); }} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                            </div>
                        )}
                    </div>

                    {/* 削除確認モーダル */}
                    {deleteConfirmOpen && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                            <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                                <SecLabel label="削除確認" />
                                <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                                    このデータを削除しますか？
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    <Btn label="キャンセル" onClick={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }} />
                                    <Btn label="削除" onClick={handleDeleteConfirm} bg={C.red} fg="#fff" bd="none" />
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* データタブ - セッション統計（DataTabと同じスタイル） */}
            {S.sessionSubTab === "data" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
                    {/* 回転率・ボーダー */}
                    <Card style={{ marginTop: 12 }}>
                        <SecLabel label="回転率・ボーダー" />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>1Kスタート</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.bDiff), fontFamily: mono }}>{ev.start1K > 0 ? f(ev.start1K, 1) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>回/K</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>理論ボーダー</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{ev.theoreticalBorder > 0 ? f(ev.theoreticalBorder, 1) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>回/K</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>ボーダー差</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.bDiff), fontFamily: mono }}>{ev.bDiff !== 0 ? sp(ev.bDiff, 1) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>回/K</span>
                            </div>
                        </div>
                    </Card>

                    {/* 期待値・収支 */}
                    <Card>
                        <SecLabel label="期待値・収支" />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>期待値/K</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.ev1K), fontFamily: mono }}>{ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>単価</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.evPerRot), fontFamily: mono }}>{ev.evPerRot !== 0 ? sp(ev.evPerRot, 2) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>円/回</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>仕事量</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.workAmount), fontFamily: mono }}>{ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>時給</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: sc(ev.wage), fontFamily: mono }}>{ev.wage !== 0 ? sp(ev.wage, 0) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>円/h</span>
                            </div>
                        </div>
                    </Card>

                    {/* 出玉データ */}
                    <Card>
                        <SecLabel label="出玉データ" />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>平均1R出玉</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{ev.avg1R > 0 ? f(ev.avg1R, 1) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>玉</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>平均R数/初当たり</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>R</span>
                            </div>
                        </div>
                    </Card>

                    {/* 稼働データ */}
                    <Card>
                        <SecLabel label="稼働データ" />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>初当たり回数</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>{S.jpLog.length > 0 ? S.jpLog.length.toString() : "0"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>回</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>総回転数</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{ev.netRot > 0 ? f(ev.netRot) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>回</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px" }}>
                            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>総投資額</span>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                <span style={{ fontSize: 18, fontWeight: 800, color: C.red, fontFamily: mono }}>{ev.rawInvest > 0 ? f(ev.rawInvest) : "—"}</span>
                                <span style={{ fontSize: 10, color: C.sub }}>円</span>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* 機種設定タブ */}
            {S.sessionSubTab === "settings" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "12px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
                    <Card>
                        <SecLabel label="機種情報" />
                        <div style={{ padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>機種名</div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{S.machineName || "未設定"}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "12px 0" }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>合成確率</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.yellow, fontFamily: mono }}>1/{S.synthDenom}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>1Rあたり出玉</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.teal, fontFamily: mono }}>{S.spec1R}玉</div>
                            </div>
                        </div>
                    </Card>
                    <Card>
                        <SecLabel label="交換率・貸玉" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "12px 0" }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貸玉数</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: mono }}>{S.rentBalls}玉/K</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換率</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: mono }}>{S.exRate}玉/K</div>
                            </div>
                        </div>
                    </Card>
                    <Card>
                        <SecLabel label="店舗・台番号" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "12px 0" }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店舗</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{S.storeName || "未設定"}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>台番号</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{S.machineNum || "—"}</div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Move Modal */}
            {showMoveModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="台移動" />
                        <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                            現在のデータを保存して新しい台へ移動します
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <Btn label="キャンセル" onClick={() => setShowMoveModal(false)} />
                            <Btn label="移動する" onClick={() => { setShowMoveModal(false); S.handleMoveTable(); }} bg={C.purple} fg="#fff" bd="none" />
                        </div>
                    </Card>
                </div>
            )}

            {/* 投資ペース設定モーダル */}
            {showInvestSettings && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="投資金額ペース" />
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                            1回の記録で加算する投資金額を選択
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                            {[500, 1000, 2000].map(pace => (
                                <button key={pace} className="b" onClick={() => { S.setInvestPace(pace); setShowInvestSettings(false); }} style={{
                                    padding: "14px 0", borderRadius: 10, fontWeight: 700, fontFamily: mono, fontSize: 15,
                                    background: investPace === pace ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "rgba(255,255,255,0.05)",
                                    border: investPace === pace ? "none" : `1px solid ${C.border}`,
                                    color: investPace === pace ? "#fff" : C.text,
                                    boxShadow: investPace === pace ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none"
                                }}>
                                    {pace >= 1000 ? `${pace/1000}K` : `${pace}円`}
                                </button>
                            ))}
                        </div>
                        <button className="b" onClick={() => setShowInvestSettings(false)} style={{
                            width: "100%", padding: "12px", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`,
                            borderRadius: 10, color: C.text, fontSize: 14, fontWeight: 600, fontFamily: font
                        }}>閉じる</button>
                    </Card>
                </div>
            )}

            {/* 初当たりウィザードモーダル - フルスクリーン */}
            {hitWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    height: "100dvh",
                    width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setHitWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>大当たり記録</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: 上皿の残り玉数 */}
                        {hitWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.blue, marginBottom: 16 }}>上皿の残り玉数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.trayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 1: ラウンド数 */}
                        {hitWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRounds.map(r => (
                                        <button
                                            key={r}
                                            className="b"
                                            onClick={() => { setHitWizardData(d => ({ ...d, rounds: r })); setHitWizardStep(2); }}
                                            style={{
                                                width: 80, height: 80, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: 26,
                                                background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff",
                                                boxShadow: "0 4px 16px rgba(249,115,22,0.4)"
                                            }}
                                        >
                                            {r}R
                                        </button>
                                    ))}
                                </div>
                                <button className="b" onClick={() => setHitWizardStep(0)} style={{ marginTop: 24, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 2: 液晶表示玉数 */}
                        {hitWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{hitWizardData.rounds}R選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 実玉数 */}
                        {hitWizardStep === 3 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.green, marginBottom: 16 }}>実玉数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.actualBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 4: 単発/確変選択 */}
                        {hitWizardStep === 4 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>当たり種別</div>
                                <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                                    <button className="b" onClick={() => { setHitWizardData(d => ({ ...d, hitType: "単発" })); setHitWizardStep(5); }}
                                        style={{ width: 130, height: 90, borderRadius: 16, fontWeight: 800, fontSize: 22, background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
                                        単発
                                    </button>
                                    <button className="b" onClick={() => handleWizardComplete("確変")}
                                        style={{ width: 130, height: 90, borderRadius: 16, fontWeight: 800, fontSize: 22, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>
                                        確変
                                    </button>
                                </div>
                                <button className="b" onClick={() => setHitWizardStep(3)} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 5: 時短回数 */}
                        {hitWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 6: 時短終了後最終出玉 */}
                        {hitWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* テンキー（Step 1と4以外で表示） */}
                    {hitWizardStep !== 1 && hitWizardStep !== 4 && (
                        <div style={{
                            padding: "8px 12px",
                            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                            background: "rgba(20,20,25,1)",
                            borderTop: `1px solid ${C.border}`,
                            flexShrink: 0
                        }}>
                            {/* 戻る/次へボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => {
                                    if (hitWizardStep === 0) setHitWizardOpen(false);
                                    else if (hitWizardStep === 2) setHitWizardStep(1);
                                    else if (hitWizardStep === 5) setHitWizardStep(4);
                                    else setHitWizardStep(s => s - 1);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>
                                    {hitWizardStep === 0 ? "キャンセル" : "戻る"}
                                </button>
                                {hitWizardStep === 6 ? (
                                    <button className="b" onClick={handleWizardComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>
                                        記録完了
                                    </button>
                                ) : (
                                    <button className="b" onClick={() => setHitWizardStep(s => s + 1)} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>
                                        次へ
                                    </button>
                                )}
                            </div>
                            {/* テンキー - 大きくして精度向上 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setHitWizardData(d => {
                                            const current = d[field] || "";
                                            // 先頭が0のみの場合は置き換え
                                            const newVal = current === "0" ? String(n) : current + n;
                                            return { ...d, [field]: newVal };
                                        });
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                        {n}
                                    </button>
                                ))}
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => ({ ...d, [field]: "" }));
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                    AC
                                </button>
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => {
                                        const current = d[field] || "";
                                        // 空の場合は0を入れない（表示上は0が見えている）
                                        if (current === "") return d;
                                        return { ...d, [field]: current + "0" };
                                    });
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                    0
                                </button>
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>
                                    ←
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* スタート入力プロンプト - 時短/大当たり終了後 */}
            {S.showStartPrompt && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0,0,0,0.9)",
                    backdropFilter: "blur(8px)",
                    zIndex: 9998,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20
                }}>
                    <div style={{
                        width: "100%",
                        maxWidth: 340,
                        background: C.surface,
                        borderRadius: 20,
                        padding: 24,
                        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
                    }}>
                        <div style={{ textAlign: "center", marginBottom: 20 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: C.orange, marginBottom: 8 }}>
                                スタート回転数を入力
                            </div>
                            <div style={{ fontSize: 12, color: C.sub }}>
                                時短/大当たり終了後のスタート位置を記録
                            </div>
                        </div>
                        <input
                            type="tel"
                            inputMode="numeric"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="回転数"
                            autoFocus
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                background: C.bg,
                                border: `2px solid ${C.orange}`,
                                borderRadius: 12,
                                padding: "16px",
                                fontSize: 24,
                                fontWeight: 700,
                                color: C.text,
                                fontFamily: mono,
                                textAlign: "center",
                                outline: "none",
                                marginBottom: 20
                            }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <button className="b" onClick={() => {
                                S.setShowStartPrompt(false);
                                setInput("");
                            }} style={{
                                padding: "14px 0",
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: 15,
                                background: "rgba(255,255,255,0.08)",
                                border: "none",
                                color: C.sub
                            }}>
                                スキップ
                            </button>
                            <button className="b" onClick={() => {
                                const val = Number(input);
                                if (val > 0) {
                                    S.setStartRot(val);
                                    setRows((r) => [...r, { type: "start", cumRot: val, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true }]);
                                    S.pushLog({ type: "大当たり後スタート", time: tsNow(), rot: val });
                                }
                                S.setShowStartPrompt(false);
                                setInput("");
                            }} style={{
                                padding: "14px 0",
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: 15,
                                background: "linear-gradient(135deg, #f97316, #ea580c)",
                                border: "none",
                                color: "#fff",
                                boxShadow: "0 4px 12px rgba(249,115,22,0.3)"
                            }}>
                                記録
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 連チャン追加ウィザードモーダル */}
            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "#000", zIndex: 9999, display: "flex", flexDirection: "column", height: "100dvh", width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000"
                    }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: ラウンド数選択 */}
                        {chainWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRushRounds.map(r => (
                                        <button key={r} className="b" onClick={() => { setChainWizardData(d => ({ ...d, rounds: r })); setChainWizardStep(1); setChainWizardFirstKey(true); }}
                                            style={{ width: 80, height: 80, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: 26, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>
                                            {r}R
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 1: 液晶表示玉数 */}
                        {chainWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 2: 電サポ回転数 */}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>サポ増減 ①</div>
                                <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 大当たり直前 */}
                        {chainWizardStep === 3 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当たり直前</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevEndBalls > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回終了時: {f(prevEndBalls)}玉</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.lastOutBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.lastOutBalls) || 0; setChainWizardData(d => ({ ...d, lastOutBalls: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {prevEndBalls > 0 && (
                                        <button className="b" onClick={() => setChainWizardData(d => ({ ...d, lastOutBalls: String(prevEndBalls) }))}
                                            style={{ marginTop: 12, padding: "10px 24px", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "rgba(59,130,246,0.2)", border: `1px solid ${C.blue}`, color: C.blue }}>
                                            変更なし（前回値を採用）
                                        </button>
                                    )}
                                    {prevEndBalls > 0 && current > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: C.sub }}>電サポ中の増減: <span style={{ fontWeight: 700, color: sc(diff), fontFamily: mono }}>{diff >= 0 ? "+" : ""}{diff}</span></span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 4: ラウンド終了 */}
                        {chainWizardStep === 4 && (() => {
                            const prevBalls = Number(chainWizardData.lastOutBalls) || 0;
                            const currentBalls = Number(chainWizardData.nextTimingBalls) || 0;
                            const dispBalls = Number(chainWizardData.displayBalls) || 0;
                            const sapoChange = currentBalls - prevBalls - dispBalls;
                            const rot = Number(chainWizardData.elecSapoRot) || 0;
                            const perRot = rot > 0 ? sapoChange / rot : 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevBalls > 0 && <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当たり直前: {f(prevBalls)}玉</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.nextTimingBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.nextTimingBalls) || 0; setChainWizardData(d => ({ ...d, nextTimingBalls: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {(prevBalls > 0 || currentBalls > 0) && (
                                        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderRadius: 12 }}>
                                            <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontSize: 10, color: C.sub }}>電サポ増減</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>{sapoChange >= 0 ? "+" : ""}{sapoChange}</div>
                                                </div>
                                                {rot > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>1回転あたり</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>{perRot >= 0 ? "+" : ""}{perRot.toFixed(2)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 5: 継続/最終/単発選択 */}
                        {chainWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>この大当たりは？</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                                    <button className="b" onClick={() => handleChainWizardComplete(false)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(16,185,129,0.4)" }}>連チャン継続</button>
                                    <button className="b" onClick={() => { setChainWizardStep(6); setChainWizardFirstKey(true); }}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>単発終了</button>
                                    <button className="b" onClick={() => handleChainWizardComplete(true)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>最終大当たり</button>
                                </div>
                                <button className="b" onClick={() => { setChainWizardStep(4); setChainWizardFirstKey(true); }} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 6: 時短回数 */}
                        {chainWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 7: 時短終了後出玉 */}
                        {chainWizardStep === 7 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* テンキー */}
                    {chainWizardStep !== 0 && chainWizardStep !== 5 && (
                        <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => { if (chainWizardStep === 1) setChainWizardStep(0); else if (chainWizardStep === 6) setChainWizardStep(5); else setChainWizardStep(s => s - 1); setChainWizardFirstKey(true); }}
                                    style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>戻る</button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>記録完了</button>
                                ) : (
                                    <button className="b" onClick={() => {
                                        if (chainWizardStep === 3 && !chainWizardData.nextTimingBalls) {
                                            const lastOut = Number(chainWizardData.lastOutBalls) || 0;
                                            const disp = Number(chainWizardData.displayBalls) || 0;
                                            setChainWizardData(d => ({ ...d, nextTimingBalls: String(lastOut + disp) }));
                                        }
                                        setChainWizardStep(s => s + 1); setChainWizardFirstKey(true);
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>次へ</button>
                                )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setChainWizardData(d => chainWizardFirstKey ? { ...d, [field]: String(n) } : { ...d, [field]: (d[field] === "0" ? String(n) : (d[field] || "") + n) });
                                        setChainWizardFirstKey(false);
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                                ))}
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: "" })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => chainWizardFirstKey ? { ...d, [field]: "0" } : (d[field] === "" ? d : { ...d, [field]: d[field] + "0" })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* 直接単発終了モーダル */}
            {directSingleEndOpen && ReactDOM.createPortal(
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 9999, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000" }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>単発終了</span>
                        <div style={{ width: 70 }} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {directSingleEndStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}
                        {directSingleEndStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => { if (directSingleEndStep === 0) setDirectSingleEndOpen(false); else setDirectSingleEndStep(0); }}
                                style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>{directSingleEndStep === 0 ? "キャンセル" : "戻る"}</button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>記録完了</button>
                            ) : (
                                <button className="b" onClick={() => setDirectSingleEndStep(1)} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>次へ</button>
                            )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <button key={n} className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: (d[field] === "0" ? String(n) : (d[field] || "") + n) })); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                            ))}
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: "" })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => (d[field] === "" ? d : { ...d, [field]: d[field] + "0" })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/* ================================================================
   HistoryTab — 大当たり履歴（チェーンベース連チャン記録）
================================================================ */
export function HistoryTab({ jpLog, sesLog, pushJP, delJPLast, delSesLast, S, ev }) {
    const [sub, setSub] = useState("jp");

    // スワイプ削除用state（横スワイプのみ反応）
    const [swipingId, setSwipingId] = useState(null);
    const [swipeX, setSwipeX] = useState(0);
    const [swipeDirection, setSwipeDirection] = useState(null); // "horizontal" | "vertical" | null
    const swipeStartX = useRef(0);
    const swipeStartY = useRef(0);

    const handleSwipeStart = (e, chainId) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
        setSwipingId(chainId);
        setSwipeDirection(null);
    };

    const handleSwipeMove = (e) => {
        if (swipingId === null) return;
        const diffX = swipeStartX.current - e.touches[0].clientX;
        const diffY = Math.abs(e.touches[0].clientY - swipeStartY.current);

        // 方向が未確定の場合、10px以上動いたら判定
        if (swipeDirection === null && (Math.abs(diffX) > 10 || diffY > 10)) {
            if (diffY > Math.abs(diffX)) {
                setSwipeDirection("vertical");
                return;
            } else {
                setSwipeDirection("horizontal");
            }
        }

        // 横スワイプの場合のみ処理
        if (swipeDirection === "horizontal") {
            e.stopPropagation(); // 画面切り替えスワイプを防止
            setSwipeX(Math.max(0, Math.min(diffX, 80)));
        }
    };

    const handleSwipeEnd = (chainId) => {
        if (swipeDirection === "horizontal" && swipeX > 50) {
            if (confirm("このデータを削除しますか？")) {
                S.setJpLog((prev) => {
                    const chainToDelete = prev.find(c => c.chainId === chainId);
                    // 削除するチェーンが完了している場合、持ち玉と上皿玉を減算
                    if (chainToDelete && chainToDelete.completed) {
                        const ballsToRemove = chainToDelete.finalBalls || 0;
                        const trayToRemove = chainToDelete.trayBalls || 0;
                        S.setCurrentMochiBalls((p) => Math.max(0, p - ballsToRemove));
                        S.setTotalTrayBalls((p) => Math.max(0, p - trayToRemove));
                    }
                    return prev.filter(c => c.chainId !== chainId);
                });
            }
        }
        setSwipeX(0);
        setSwipingId(null);
        setSwipeDirection(null);
    };

    // 連チャン入力 state
    const [iTrayBalls, setITrayBalls] = useState("");         // 上皿玉（1連目のみ）
    const [iLastOutBalls, setILastOutBalls] = useState("");   // 直前の実出玉
    const [iNextTimingBalls, setINextTimingBalls] = useState(""); // 次のタイミングの出玉
    const [iElecSapoRot, setIElecSapoRot] = useState("");    // 電サポ回転数
    const [iRounds, setIRounds] = useState("");
    const [iDisplayBalls, setIDisplayBalls] = useState("");
    const [iActualBalls, setIActualBalls] = useState("");     // 実玉数

    // 連チャン追加ウィザード state
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true); // 各ステップの最初のキー入力を追跡
    const [chainWizardData, setChainWizardData] = useState({
        rounds: 0, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "",
        hitType: "", // "継続" or "最終" or "単発"
        jitanSpins: "", // 時短回数（単発終了用）
        finalBallsAfterJitan: "" // 時短終了後出玉（単発終了用）
    });

    // 直接単発終了モーダル state（ヒットが既にある場合用）
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0); // 0: 時短回数, 1: 時短終了後出玉
    const [directSingleEndData, setDirectSingleEndData] = useState({ jitanSpins: "", finalBallsAfterJitan: "" });

    // 機種からラウンド情報を取得（初当たり用）
    const getMachineRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine || !machine.roundDist) return [3, 4, 5, 6, 7, 8, 9, 10];
        const matches = machine.roundDist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRounds = useMemo(getMachineRounds, [S.machineName, S.customMachines]);

    // 確変中のラウンド情報を取得（連チャン用 - rushDistを優先）
    const getMachineRushRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine) return [3, 4, 5, 6, 7, 8, 9, 10];
        const dist = machine.rushDist || machine.roundDist;
        if (!dist) return [3, 4, 5, 6, 7, 8, 9, 10];
        const matches = dist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRushRounds = useMemo(getMachineRushRounds, [S.machineName, S.customMachines]);

    // 最新の未完了チェーンがあるか
    const lastChain = jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    const isChainActive = lastChain && !lastChain.completed;

    const clearInputs = () => {
        setITrayBalls("");
        setILastOutBalls("");
        setINextTimingBalls("");
        setIElecSapoRot("");
        setIRounds("");
        setIDisplayBalls("");
        setIActualBalls("");
    };

    const clearChainWizard = () => {
        setChainWizardData({ rounds: 0, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
    };

    // 前回のラウンド終了時の総持ち玉を取得
    const getPrevEndBalls = () => {
        if (!lastChain || lastChain.hits.length === 0) return 0;
        const lastHit = lastChain.hits[lastChain.hits.length - 1];
        return lastHit.nextTimingBalls || 0;
    };

    // 連チャン追加ウィザードを開始
    const openChainWizard = () => {
        const prevEndBalls = getPrevEndBalls();
        setChainWizardData({
            rounds: 0,
            displayBalls: "",
            lastOutBalls: String(prevEndBalls), // 前回の値を初期値として設定
            nextTimingBalls: "",
            elecSapoRot: "",
            hitType: "",
            jitanSpins: "",
            finalBallsAfterJitan: ""
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardOpen(true);
    };

    // 連チャン追加: チェーンにヒットを追加（旧版 - フォールバック用）
    const addHitToChain = () => {
        const rounds = Number(iRounds) || 0;
        if (rounds <= 0) return;

        const lastOut = Number(iLastOutBalls) || 0;
        const nextTiming = Number(iNextTimingBalls) || 0;
        const elecRot = Number(iElecSapoRot) || 0;
        const disp = Number(iDisplayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;
        const isFirstHit = lastChain && lastChain.hits.length === 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            // 1連目の場合: 上皿玉を保存
            if (isFirstHit) {
                const tray = Number(iTrayBalls) || 0;
                chain.trayBalls = tray;
                S.setTotalTrayBalls((p) => p + tray);
            }
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                lastOutBalls: lastOut,
                nextTimingBalls: nextTiming,
                elecSapoRot: elecRot,
                sapoChange,
                sapoPerRot,
                rounds,
                displayBalls: Number(iDisplayBalls) || 0,
                actualBalls: Number(iActualBalls) || 0,
                time: tsNow(),
            }];
            updated[updated.length - 1] = chain;
            return updated;
        });
        S.pushLog({ type: isFirstHit ? "初当たり記録" : "連チャン追加", time: tsNow(), rounds: Number(iRounds) || 0 });
        clearInputs();
    };

    // 連チャン追加ウィザード完了（継続 or 最終）
    const handleChainWizardComplete = (isFinal = false) => {
        const { rounds, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) {
            setChainWizardOpen(false);
            return;
        }

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;

        if (isFinal) {
            // 最終大当たり - チェーンを完了させる
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1,
                    lastOutBalls: lastOut,
                    nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot,
                    sapoChange,
                    sapoPerRot,
                    rounds: rnd,
                    displayBalls: disp,
                    actualBalls: 0,
                    time: tsNow(),
                }];
                // サマリー計算
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
                chain.completed = true;
                chain.summary = {
                    totalRounds,
                    totalDisplayBalls,
                    totalSapoRot,
                    totalSapoChange,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: totalSapoChange,
                    sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                    netGain: totalDisplayBalls + totalSapoChange,
                };
                chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
                updated[updated.length - 1] = chain;
                return updated;
            });
            // 出玉を持ち玉に加算
            const lastChainCopy = jpLog[jpLog.length - 1];
            const existingTotal = (lastChainCopy.trayBalls || 0) +
                lastChainCopy.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
            const finalBallsToAdd = existingTotal + disp + sapoChange;
            S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
            S.pushLog({ type: "連チャン終了", time: tsNow() });
            S.setPlayMode("mochi");
            S.setTab("rot");
            S.setShowStartPrompt(true);
        } else {
            // 連チャン継続
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1,
                    lastOutBalls: lastOut,
                    nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot,
                    sapoChange,
                    sapoPerRot,
                    rounds: rnd,
                    displayBalls: disp,
                    actualBalls: 0,
                    time: tsNow(),
                }];
                updated[updated.length - 1] = chain;
                return updated;
            });
            S.pushLog({ type: "連チャン追加", time: tsNow(), rounds: rnd });
        }

        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 単発終了ウィザード完了（時短データ含む）
    const handleChainWizardSingleEnd = () => {
        const { rounds, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot, jitanSpins, finalBallsAfterJitan } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) {
            setChainWizardOpen(false);
            return;
        }

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                lastOutBalls: lastOut,
                nextTimingBalls: nextTiming,
                elecSapoRot: elecRot,
                sapoChange,
                sapoPerRot,
                rounds: rnd,
                displayBalls: disp,
                actualBalls: 0,
                time: tsNow(),
            }];
            // 単発終了として完了
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            // サマリー計算
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 出玉を持ち玉に加算（既存のヒット + 最後のヒット + 上皿玉）
        const currentChain = jpLog[jpLog.length - 1];
        const existingTotal = (currentChain?.trayBalls || 0) +
            (currentChain?.hits || []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal + disp + sapoChange;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow(), rounds: rnd });
        S.setPlayMode("mochi");
        S.setTab("rot");
        // 時短終了後のスタート入力プロンプトを表示
        S.setShowStartPrompt(true);

        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 直接単発終了を開く（ヒットが既にある場合のみ）
    const openDirectSingleEnd = () => {
        if (!isChainActive || lastChain.hits.length === 0) return;
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setDirectSingleEndStep(0);
        setDirectSingleEndOpen(true);
    };

    // 直接単発終了完了
    const handleDirectSingleEndComplete = () => {
        if (!isChainActive) return;
        const jitan = Number(directSingleEndData.jitanSpins) || 0;
        const finalBalls = Number(directSingleEndData.finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            // サマリー計算
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 出玉を持ち玉に加算
        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setTab("rot");
        S.setShowStartPrompt(true);

        setDirectSingleEndOpen(false);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
    };

    // 最終大当たり終了: 最後のヒットを追加してチェーン完了
    const handleChainEnd = () => {
        if (!isChainActive) return;

        const rounds = Number(iRounds) || 0;
        const currentHitsCount = lastChain.hits.length;

        // ヒットが0かつ新規入力もない場合は終了できない
        if (currentHitsCount === 0 && rounds <= 0) return;

        const lastOut = Number(iLastOutBalls) || 0;
        const nextTiming = Number(iNextTimingBalls) || 0;
        const elecRot = Number(iElecSapoRot) || 0;
        const disp = Number(iDisplayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const hitSapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;

        const isFirstHit = lastChain.hits.length === 0;
        const trayForFirstHit = isFirstHit ? (Number(iTrayBalls) || 0) : 0;

        // 持ち玉計算を先に行う（setJpLog前の状態から計算）
        // 既存のヒットの出玉合計 + 今回追加するヒットの出玉（rounds > 0の場合のみ）
        const existingDisplayBalls = lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0), 0);
        const existingSapoChange = lastChain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
        const existingTrayBalls = lastChain.trayBalls || 0;
        // 1連目の場合は今回入力するtrayBallsを使用、そうでなければ既存のtrayBallsを使用
        const trayBalls = isFirstHit ? trayForFirstHit : existingTrayBalls;
        const newHitBalls = rounds > 0 ? (disp + sapoChange) : 0;
        const finalBallsToAdd = trayBalls + existingDisplayBalls + existingSapoChange + newHitBalls;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            // 1連目の場合: 上皿玉を保存
            if (isFirstHit) {
                chain.trayBalls = trayForFirstHit;
                S.setTotalTrayBalls((p) => p + trayForFirstHit);
            }
            // ラウンド入力がある場合は最後のヒットを追加
            if (rounds > 0) {
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1,
                    lastOutBalls: lastOut,
                    nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot,
                    sapoChange,
                    sapoPerRot: hitSapoPerRot,
                    rounds,
                    displayBalls: disp,
                    actualBalls: Number(iActualBalls) || 0,
                    time: tsNow(),
                }];
            }
            // サマリー計算（新しいサポ増減定義）
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || h.sapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);

            chain.completed = true;
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 連チャン終了後の出玉を持ち玉に加算
        S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);

        S.pushLog({ type: "連チャン終了", time: tsNow() });
        clearInputs();
        // 持ち玉モードに自動切替
        S.setPlayMode("mochi");
        S.setTab("rot");
        // 大当たり終了後のスタート入力プロンプトを表示
        S.setShowStartPrompt(true);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Sub Tab */}
            <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", padding: "4px", margin: "12px 14px", borderRadius: 12, flexShrink: 0 }}>
                {[["jp", "大当たり履歴"], ["ses", "稼働ログ"]].map(([id, lbl]) => (
                    <button key={id} className="b" onClick={() => setSub(id)} style={{
                        flex: 1, background: sub === id ? C.surfaceHi : "transparent", border: "none",
                        borderRadius: 8, color: sub === id ? C.text : C.sub, fontSize: 13, fontWeight: sub === id ? 700 : 500,
                        padding: "10px 0", fontFamily: font, boxShadow: sub === id ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                    }}>{lbl}</button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
                {sub === "jp" ? (
                    <div>
                        {/* 連チャン中バナー */}
                        {isChainActive && (
                            <div style={{ background: `linear-gradient(135deg, ${C.orange}20, ${C.red}10)`, border: `1px solid ${C.orange}40`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, marginBottom: 4 }}>
                                    {lastChain.hits.length === 0 ? "初当たり — 1連目を入力してください" : `連チャン中 — ${lastChain.hits.length}連目まで記録済み`}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub }}>
                                    {lastChain.hits.length > 0 && `上皿玉: ${f(lastChain.trayBalls)}玉 | `}{lastChain.time}
                                </div>
                            </div>
                        )}

                        {/* アクションボタン — 連チャン中のみ表示 */}
                        {isChainActive ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                <button className="b" onClick={openChainWizard} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff",
                                    boxShadow: "0 4px 16px rgba(16,185,129,0.4)"
                                }}>
                                    連チャン追加
                                </button>
                                <button className="b" onClick={openDirectSingleEnd} disabled={lastChain.hits.length === 0} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: lastChain.hits.length === 0 ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                                    border: "none", color: "#fff",
                                    boxShadow: lastChain.hits.length === 0 ? "none" : "0 4px 16px rgba(99,102,241,0.4)",
                                    opacity: lastChain.hits.length === 0 ? 0.5 : 1
                                }}>
                                    単発終了
                                </button>
                                <button className="b" onClick={handleChainEnd} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff",
                                    boxShadow: "0 4px 16px rgba(249,115,22,0.4)"
                                }}>
                                    大当り終了
                                </button>
                            </div>
                        ) : (
                            <Card style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                                    回転数タブの「初当たり」ボタンから<br />チェーンを開始してください
                                </div>
                            </Card>
                        )}

                        {/* 実測サマリー */}
                        <div style={{ margin: "0 0 16px", background: "rgba(0,0,0,0.2)", border: `1px solid ${C.teal}30`, borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                                {[
                                    { label: "平均1R出玉", val: ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", unit: "玉", col: C.teal },
                                    { label: "サポ増減/回転", val: ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", unit: "玉/回転", col: sc(ev.sapoPerRot) },
                                    { label: "平均R数", val: ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", unit: "R", col: C.blue },
                                    { label: "初当たり", val: jpLog.length > 0 ? jpLog.length.toString() : "0", unit: "回", col: C.green },
                                ].map(({ label, val, unit, col }, idx) => (
                                    <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 3 ? `1px solid ${C.border}` : "none" }}>
                                        <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                        <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* History — Chain Cards */}
                        {jpLog.length === 0 ? (
                            <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                        ) : (
                            [...jpLog].reverse().map((chain, ci) => (
                                <div
                                    key={chain.chainId || ci}
                                    style={{ position: "relative", overflow: "hidden", marginBottom: 12 }}
                                    onTouchStart={(e) => handleSwipeStart(e, chain.chainId)}
                                    onTouchMove={handleSwipeMove}
                                    onTouchEnd={() => handleSwipeEnd(chain.chainId)}
                                >
                                    {/* 削除ボタン（スワイプ時のみ表示） */}
                                    {swipingId === chain.chainId && swipeDirection === "horizontal" && swipeX > 0 && (
                                        <div style={{
                                            position: "absolute",
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: 80,
                                            background: "#ef4444",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#fff",
                                            fontWeight: 700,
                                            fontSize: 12,
                                            borderRadius: "0 12px 12px 0"
                                        }}>
                                            削除
                                        </div>
                                    )}
                                    <Card style={{
                                        padding: "12px 16px",
                                        background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "rgba(255,255,255,0.02)",
                                        transform: swipingId === chain.chainId ? `translateX(-${swipeX}px)` : "translateX(0)",
                                        transition: swipingId === chain.chainId ? "none" : "transform 0.2s ease"
                                    }}>
                                    {/* Chain Header */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>
                                            {!chain.completed ? "連チャン中" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}
                                        </span>
                                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                    </div>
                                    {/* 初当たり回転数 */}
                                    {chain.hitRot > 0 && (
                                        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                            <span style={{ fontSize: 10, color: C.sub }}>総回転: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitRot)}</span></span>
                                            {chain.hitThisRot > 0 && <span style={{ fontSize: 10, color: C.sub }}>ハマり: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitThisRot)}</span></span>}
                                        </div>
                                    )}

                                    {/* Individual Hits */}
                                    {chain.hits.map((hit, hi) => {
                                        const change = hit.sapoChange != null ? hit.sapoChange : 0;
                                        const perRot = hit.sapoPerRot != null ? hit.sapoPerRot : 0;
                                        return (
                                        <div key={hi} style={{ padding: "6px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow }}>{hit.hitNumber}連目</span>
                                                <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{hit.time}</span>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}回</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ増減</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: sc(change), fontFamily: mono }}>{change >= 0 ? "+" : ""}{change}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ/回転</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}

                                    {/* Chain Summary (completed only) */}
                                    {chain.completed && chain.summary && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>1R出玉</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ増減/回転</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoPerRot || 0), fontFamily: mono }}>
                                                        {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ総増減</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>純増出玉</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                {f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}{f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = {f(Math.round(chain.summary.netGain))}
                                            </div>
                                        </div>
                                    )}

                                    {!chain.completed && chain.hits.length === 0 && (
                                        <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                    )}
                                </Card>
                                </div>
                            ))
                        )}
                        <Btn label="最新履歴を削除" onClick={delJPLast} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                    </div>
                ) : (
                    <div>
                        {sesLog.length === 0 ? (
                            <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>ログがありません</div>
                        ) : (
                            sesLog.map((e, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{e.type}</div>
                                        <div style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{e.time}</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        {e.rot != null && <div style={{ fontSize: 12, color: C.blue, fontFamily: mono }}>{f(e.rot)}回</div>}
                                        {e.cash != null && <div style={{ fontSize: 12, color: C.red, fontFamily: mono }}>-{f(e.cash)}円</div>}
                                        {e.tray != null && <div style={{ fontSize: 10, color: C.teal }}>上皿:{f(e.tray)}玉</div>}
                                        {e.netGain != null && <div style={{ fontSize: 10, color: C.green }}>純増:{f(e.netGain)}玉</div>}
                                    </div>
                                </div>
                            ))
                        )}
                        <Btn label="最新ログを削除" onClick={delSesLast} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                    </div>
                )}
            </div>

            {/* 連チャン追加ウィザードモーダル */}
            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    height: "100dvh",
                    width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: ラウンド数選択（確変中振り分けを使用） */}
                        {chainWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRushRounds.map(r => (
                                        <button
                                            key={r}
                                            className="b"
                                            onClick={() => { setChainWizardData(d => ({ ...d, rounds: r })); setChainWizardStep(1); setChainWizardFirstKey(true); }}
                                            style={{
                                                width: 80, height: 80, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: 26,
                                                background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff",
                                                boxShadow: "0 4px 16px rgba(249,115,22,0.4)"
                                            }}
                                        >
                                            {r}R
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 1: 液晶表示玉数 */}
                        {chainWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 2: サポ増減 - 電サポ回転数 */}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>サポ増減 ①</div>
                                <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 大当たり直前の総持ち玉 */}
                        {chainWizardStep === 3 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            const isWarning = prevEndBalls > 0 && Math.abs(diff) > 500;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当たり直前</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevEndBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回終了時: {f(prevEndBalls)}玉</div>
                                    )}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.lastOutBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    {/* 微調整ボタン */}
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => {
                                                const cur = Number(chainWizardData.lastOutBalls) || 0;
                                                setChainWizardData(d => ({ ...d, lastOutBalls: String(Math.max(0, cur + delta)) }));
                                            }} style={{
                                                padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                                                background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                                border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                                                color: delta > 0 ? C.green : C.red, fontFamily: mono
                                            }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {/* 変更なしボタン */}
                                    {prevEndBalls > 0 && (
                                        <button className="b" onClick={() => {
                                            setChainWizardData(d => ({ ...d, lastOutBalls: String(prevEndBalls) }));
                                        }} style={{
                                            marginTop: 12, padding: "10px 24px", borderRadius: 10, fontWeight: 700, fontSize: 14,
                                            background: "rgba(59,130,246,0.2)", border: `1px solid ${C.blue}`, color: C.blue
                                        }}>
                                            変更なし（前回値を採用）
                                        </button>
                                    )}
                                    {/* 差分表示・警告 */}
                                    {prevEndBalls > 0 && current > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: isWarning ? C.orange : C.sub }}>
                                                電サポ中の増減: <span style={{ fontWeight: 700, color: sc(diff), fontFamily: mono }}>{diff >= 0 ? "+" : ""}{diff}</span>
                                            </span>
                                            {isWarning && (
                                                <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>極端な変動です。入力値をご確認ください</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 4: ラウンド終了時の総持ち玉 */}
                        {chainWizardStep === 4 && (() => {
                            const prevBalls = Number(chainWizardData.lastOutBalls) || 0;
                            const currentBalls = Number(chainWizardData.nextTimingBalls) || 0;
                            const dispBalls = Number(chainWizardData.displayBalls) || 0;
                            // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
                            const sapoChange = currentBalls - prevBalls - dispBalls;
                            const rot = Number(chainWizardData.elecSapoRot) || 0;
                            const perRot = rot > 0 ? sapoChange / rot : 0;
                            const isWarning = Math.abs(perRot) > 3; // 1回転あたり±3を超えたら警告
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当たり直前: {f(prevBalls)}玉</div>
                                    )}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.nextTimingBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    {/* 微調整ボタン */}
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => {
                                                const cur = Number(chainWizardData.nextTimingBalls) || 0;
                                                setChainWizardData(d => ({ ...d, nextTimingBalls: String(Math.max(0, cur + delta)) }));
                                            }} style={{
                                                padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                                                background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                                border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                                                color: delta > 0 ? C.green : C.red, fontFamily: mono
                                            }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {/* 計算結果表示 */}
                                    {(prevBalls > 0 || currentBalls > 0) && (
                                        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderRadius: 12 }}>
                                            <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontSize: 10, color: C.sub }}>電サポ増減</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>
                                                        {sapoChange >= 0 ? "+" : ""}{sapoChange}
                                                    </div>
                                                </div>
                                                {rot > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>1回転あたり</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>
                                                            {perRot >= 0 ? "+" : ""}{perRot.toFixed(2)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {isWarning && (
                                                <div style={{ fontSize: 11, color: C.orange, marginTop: 8 }}>極端な増減です。入力値をご確認ください</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 5: 継続/最終/単発選択 */}
                        {chainWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>この大当たりは？</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                                    <button className="b" onClick={() => handleChainWizardComplete(false)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(16,185,129,0.4)" }}>
                                        連チャン継続
                                    </button>
                                    <button className="b" onClick={() => { setChainWizardStep(6); setChainWizardFirstKey(true); }}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
                                        単発終了
                                    </button>
                                    <button className="b" onClick={() => handleChainWizardComplete(true)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>
                                        最終大当たり
                                    </button>
                                </div>
                                <button className="b" onClick={() => { setChainWizardStep(4); setChainWizardFirstKey(true); }} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 6: 時短回数（単発終了用） */}
                        {chainWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 7: 時短終了後最終出玉（単発終了用） */}
                        {chainWizardStep === 7 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* テンキー（Step 0と5以外で表示） */}
                    {chainWizardStep !== 0 && chainWizardStep !== 5 && (
                        <div style={{
                            padding: "8px 12px",
                            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                            background: "rgba(20,20,25,1)",
                            borderTop: `1px solid ${C.border}`,
                            flexShrink: 0
                        }}>
                            {/* 戻る/次へボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => {
                                    if (chainWizardStep === 1) setChainWizardStep(0);
                                    else if (chainWizardStep === 6) setChainWizardStep(5);
                                    else setChainWizardStep(s => s - 1);
                                    setChainWizardFirstKey(true);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>
                                    戻る
                                </button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>
                                        記録完了
                                    </button>
                                ) : (
                                    <button className="b" onClick={() => {
                                        // Step 3→4の遷移時、nextTimingBallsを自動計算（直前出玉+液晶表示玉数）
                                        if (chainWizardStep === 3) {
                                            const lastOut = Number(chainWizardData.lastOutBalls) || 0;
                                            const disp = Number(chainWizardData.displayBalls) || 0;
                                            const suggested = lastOut + disp;
                                            // nextTimingBallsが未入力の場合のみ自動設定
                                            if (!chainWizardData.nextTimingBalls) {
                                                setChainWizardData(d => ({ ...d, nextTimingBalls: String(suggested) }));
                                            }
                                        }
                                        setChainWizardStep(s => s + 1);
                                        setChainWizardFirstKey(true);
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>
                                        次へ
                                    </button>
                                )}
                            </div>
                            {/* テンキー - 大きくして精度向上 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setChainWizardData(d => {
                                            // 最初のキー入力なら既存値をクリアして新しい値を設定
                                            if (chainWizardFirstKey) {
                                                return { ...d, [field]: String(n) };
                                            }
                                            const current = d[field] || "";
                                            // 先頭が0のみの場合は置き換え
                                            const newVal = current === "0" ? String(n) : current + n;
                                            return { ...d, [field]: newVal };
                                        });
                                        setChainWizardFirstKey(false);
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                        {n}
                                    </button>
                                ))}
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => ({ ...d, [field]: "" }));
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                    AC
                                </button>
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => {
                                        // 最初のキー入力なら既存値をクリアして0を設定
                                        if (chainWizardFirstKey) {
                                            return { ...d, [field]: "0" };
                                        }
                                        const current = d[field] || "";
                                        // 空の場合は0を入れない（表示上は0が見えている）
                                        if (current === "") return d;
                                        return { ...d, [field]: current + "0" };
                                    });
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                    0
                                </button>
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>
                                    ←
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* 直接単発終了モーダル */}
            {directSingleEndOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>単発終了</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: 時短回数 */}
                        {directSingleEndStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 1: 時短終了後出玉 */}
                        {directSingleEndStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* テンキー */}
                    <div style={{
                        padding: "8px 12px",
                        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                        background: "rgba(20,20,25,1)",
                        borderTop: `1px solid ${C.border}`,
                        flexShrink: 0
                    }}>
                        {/* 戻る/次へボタン */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => {
                                if (directSingleEndStep === 0) setDirectSingleEndOpen(false);
                                else setDirectSingleEndStep(0);
                            }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>
                                {directSingleEndStep === 0 ? "キャンセル" : "戻る"}
                            </button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>
                                    記録完了
                                </button>
                            ) : (
                                <button className="b" onClick={() => setDirectSingleEndStep(1)} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>
                                    次へ
                                </button>
                            )}
                        </div>
                        {/* テンキー */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <button key={n} className="b" onClick={() => {
                                    const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setDirectSingleEndData(d => {
                                        const current = d[field] || "";
                                        // 先頭が0のみの場合は置き換え
                                        const newVal = current === "0" ? String(n) : current + n;
                                        return { ...d, [field]: newVal };
                                    });
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                    {n}
                                </button>
                            ))}
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => ({ ...d, [field]: "" }));
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                AC
                            </button>
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => {
                                    const current = d[field] || "";
                                    // 空の場合は0を入れない（表示上は0が見えている）
                                    if (current === "") return d;
                                    return { ...d, [field]: current + "0" };
                                });
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>
                                0
                            </button>
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>
                                ←
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/* ================================================================
   CalendarTab — カレンダー式記録 + 詳細表示
================================================================ */
export function CalendarTab({ S, onReset }) {
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedArchiveId, setSelectedArchiveId] = useState(null);
    const [viewMonth, setViewMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [delConfirm, setDelConfirm] = useState(null);
    const [expandedRot, setExpandedRot] = useState(null);
    // Edit form state (always declared — not conditional)
    const [editStore, setEditStore] = useState("");
    const [editMachineNum, setEditMachineNum] = useState("");
    const [editInvest, setEditInvest] = useState("");
    const [editRecovery, setEditRecovery] = useState("");
    const [showEditStoreDD, setShowEditStoreDD] = useState(false);
    // Swipe delete state
    const [swipedId, setSwipedId] = useState(null);
    const swipeRef = useRef({ startX: 0, id: null });

    const archives = S.archives || [];

    // Group archives by date
    const byDate = useMemo(() => {
        const map = {};
        archives.forEach(a => {
            const d = a.date || "";
            if (!map[d]) map[d] = [];
            map[d].push(a);
        });
        return map;
    }, [archives]);

    // Calculate daily totals
    const dailyTotals = useMemo(() => {
        const totals = {};
        Object.entries(byDate).forEach(([date, items]) => {
            let total = 0;
            items.forEach(a => {
                if (a.investYen != null && a.recoveryYen != null && (a.investYen > 0 || a.recoveryYen > 0)) {
                    total += (a.recoveryYen || 0) - (a.investYen || 0);
                } else {
                    total += (a.stats?.workAmount || 0);
                }
            });
            totals[date] = total;
        });
        return totals;
    }, [byDate]);

    // Machine number aggregate stats
    const machineAggregates = useMemo(() => {
        const agg = {};
        archives.forEach(a => {
            if (!a.machineNum) return;
            const key = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
            if (!agg[key]) agg[key] = { machineNum: a.machineNum, denom: a.settings?.synthDenom, count: 0, totalRot: 0, totalK: 0, storeName: a.storeName || "" };
            agg[key].count += 1;
            const st = a.stats || {};
            agg[key].totalRot += (st.netRot || 0);
            agg[key].totalK += (st.correctedInvestYen ? st.correctedInvestYen / 1000 : (st.rawInvest ? st.rawInvest / 1000 : 0));
            if (a.storeName) agg[key].storeName = a.storeName;
        });
        return agg;
    }, [archives]);

    // Monthly total
    const monthKey = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;
    const monthTotal = useMemo(() => {
        let total = 0;
        Object.entries(dailyTotals).forEach(([date, val]) => {
            if (date.startsWith(monthKey)) total += val;
        });
        return total;
    }, [dailyTotals, monthKey]);

    // Calendar grid
    const calendarDays = useMemo(() => {
        const first = new Date(viewMonth.year, viewMonth.month, 1);
        const lastDay = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
        const startDow = first.getDay();
        const days = [];
        for (let i = 0; i < startDow; i++) days.push(null);
        for (let d = 1; d <= lastDay; d++) days.push(d);
        return days;
    }, [viewMonth]);

    const prevMonth = () => setViewMonth(p => {
        const m = p.month - 1;
        return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
    });
    const nextMonth = () => setViewMonth(p => {
        const m = p.month + 1;
        return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
    });

    const today = new Date();
    const isToday = (day) => day && today.getFullYear() === viewMonth.year && today.getMonth() === viewMonth.month && today.getDate() === day;
    const dateStr = (day) => `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const deleteArchive = (id) => {
        S.setArchives((prev) => prev.filter(a => a.id !== id));
        setDelConfirm(null);
    };

    // Helper: create archive object (all values must be JSON-serializable)
    const makeArchive = () => {
        const autoInvest = S.ev?.rawInvest || 0;
        const now = new Date();
        // Extract only numeric stats to avoid serialization issues
        const safeStats = S.ev ? Object.fromEntries(
            Object.entries(S.ev).filter(([, v]) => typeof v === "number" || typeof v === "string")
        ) : {};
        return {
            id: now.getTime(),
            date: now.toISOString().slice(0, 10),
            time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
            rotRows: JSON.parse(JSON.stringify(S.rotRows || [])),
            jpLog: JSON.parse(JSON.stringify(S.jpLog || [])),
            sesLog: JSON.parse(JSON.stringify(S.sesLog || [])),
            settings: { rentBalls: S.rentBalls, exRate: S.exRate, synthDenom: S.synthDenom, rotPerHour: S.rotPerHour, border: S.border, ballVal: S.ballVal },
            stats: safeStats,
            totalTrayBalls: S.totalTrayBalls || 0,
            startRot: S.startRot || 0,
            storeName: String(S.storeName || ""),
            machineNum: String(S.machineNum || ""),
            investYen: Number(S.investYen) || autoInvest || 0,
            recoveryYen: Number(S.recoveryYen) || 0,
            machineName: String(S.machineName || `1/${S.synthDenom}`),
        };
    };

    const textInput = (val, set, placeholder, opts = {}) => (
        <input type={opts.type || "text"} inputMode={opts.inputMode || undefined} pattern={opts.pattern || undefined}
            value={val || ""} onChange={e => set(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }} />
    );

    const storeList = S.stores || [];
    const [showStoreDropdown, setShowStoreDropdown] = useState(false);
    const autoInvest = S.ev?.rawInvest || 0;

    // ── Inline summary card for an archive entry (reference app style) ──
    const SummaryCard = ({ a, onClick }) => {
        const st = a.stats || {};
        const invest = a.investYen || 0;
        const recovery = a.recoveryYen || 0;
        const pl = (invest > 0 || recovery > 0) ? recovery - invest : null;
        const displayPL = pl != null ? pl : (st.workAmount || 0);
        const rph = a.settings?.rotPerHour || S.rotPerHour || 200;
        const hours = st.netRot > 0 && rph > 0
            ? (st.netRot / rph).toFixed(1)
            : null;
        const hourlyWage = hours && Number(hours) > 0 && displayPL !== 0
            ? Math.round(displayPL / Number(hours))
            : null;
        const displayName = a.machineName && a.machineName !== `1/${a.settings?.synthDenom}`
            ? a.machineName
            : (a.machineName || `1/${a.settings?.synthDenom || "—"}`);

        return (
            <button className="b" onClick={onClick} style={{
                width: "100%", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "14px 14px", marginBottom: 8, cursor: "pointer",
                textAlign: "left", display: "block",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    {/* Left side */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {a.storeName && (
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 2, fontWeight: 500 }}>{a.storeName}</div>
                        )}
                        <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 2, lineHeight: 1.2 }}>
                            {displayName}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            {a.machineNum && (
                                <span style={{ fontSize: 12, color: C.sub }}>{a.machineNum}番台</span>
                            )}
                            <span style={{ fontSize: 11, color: C.sub }}>4パチ</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {hours && <span style={{ fontSize: 11, color: C.sub }}>時間: <span style={{ fontFamily: mono, color: C.subHi }}>{hours}h</span></span>}
                            {hourlyWage != null && (
                                <span style={{ fontSize: 11, color: C.sub }}>時給: <span style={{ fontFamily: mono, color: sc(hourlyWage) }}>{f(hourlyWage)}/h</span></span>
                            )}
                        </div>
                    </div>

                    {/* Right side — P&L large + detail stats */}
                    <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: sc(displayPL), fontFamily: mono, lineHeight: 1.1, marginBottom: 6 }}>
                            {f(displayPL)}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "1px 8px", justifyContent: "end" }}>
                            <span style={{ fontSize: 11, color: C.sub, textAlign: "right" }}>投資:</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono, textAlign: "right" }}>{f(invest)}</span>
                            <span style={{ fontSize: 11, color: C.sub, textAlign: "right" }}>回収:</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono, textAlign: "right" }}>{f(recovery)}</span>
                            <span style={{ fontSize: 11, color: C.sub, textAlign: "right" }}>収支:</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: sc(pl != null ? pl : displayPL), fontFamily: mono, textAlign: "right" }}>
                                {pl != null ? f(pl) : f(displayPL)}
                            </span>
                            <span style={{ fontSize: 11, color: C.sub, textAlign: "right" }}>期待値:</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.blue, fontFamily: mono, textAlign: "right" }}>
                                {st.workAmount != null && st.workAmount !== 0 ? f(Math.round(st.workAmount)) : "—"}
                            </span>
                        </div>
                        <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>▶</div>
                    </div>
                </div>
            </button>
        );
    };

    // Initialize edit form when archive selection changes
    const prevSelectedRef = useRef(null);
    if (selectedArchiveId && selectedArchiveId !== prevSelectedRef.current) {
        const target = archives.find(ar => ar.id === selectedArchiveId);
        if (target) {
            prevSelectedRef.current = selectedArchiveId;
            // Defer state updates to avoid render-during-render
            setTimeout(() => {
                setEditStore(String(target.storeName || ""));
                setEditMachineNum(String(target.machineNum || ""));
                setEditInvest(target.investYen || "");
                setEditRecovery(target.recoveryYen || "");
                setShowEditStoreDD(false);
            }, 0);
        }
    } else if (!selectedArchiveId && prevSelectedRef.current) {
        prevSelectedRef.current = null;
    }

    // ── Detail View for a specific archive ──
    if (selectedArchiveId) {
        const a = archives.find(ar => ar.id === selectedArchiveId);
        if (!a) { setSelectedArchiveId(null); return null; }
        const st = a.stats || {};
        const pl = (a.investYen > 0 || a.recoveryYen > 0) ? (a.recoveryYen || 0) - (a.investYen || 0) : null;
        const aggKey = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
        const agg = a.machineNum ? machineAggregates[aggKey] : null;

        const updateArchive = (doReset) => {
            S.setArchives(prev => prev.map(ar => ar.id !== a.id ? ar : {
                ...ar,
                storeName: editStore,
                machineNum: editMachineNum,
                investYen: Number(editInvest) || 0,
                recoveryYen: Number(editRecovery) || 0,
            }));
            if (doReset) onReset();
        };

        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="b" onClick={() => { setSelectedArchiveId(null); setExpandedRot(null); setDelConfirm(null); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 戻る</button>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{a.date}</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>

                    {/* Header with P&L */}
                    <Card style={{ padding: 16, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                            <div>
                                {a.storeName && <div style={{ fontSize: 12, color: C.sub }}>{a.storeName}</div>}
                                <div style={{ fontSize: 18, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>
                                    {a.machineName && a.machineName !== `1/${a.settings?.synthDenom}`
                                        ? a.machineName
                                        : (a.machineName || `1/${a.settings?.synthDenom || "—"}`)}
                                </div>
                                <div style={{ fontSize: 12, color: C.sub }}>
                                    {a.machineNum ? a.machineNum + "番台" : ""}{a.settings?.synthDenom ? `, 1/${a.settings.synthDenom}` : ""}{a.isMoveArchive ? " (台移動)" : ""}
                                </div>
                                {a.time && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>時間: {a.time}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                {pl != null ? (
                                    <div style={{ fontSize: 28, fontWeight: 900, color: sc(pl), fontFamily: mono, lineHeight: 1.1 }}>
                                        {f(pl)}
                                    </div>
                                ) : st.workAmount != null && st.workAmount !== 0 ? (
                                    <div style={{ fontSize: 28, fontWeight: 900, color: sc(st.workAmount), fontFamily: mono, lineHeight: 1.1 }}>
                                        {f(st.workAmount)}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                            {[
                                { label: "投資", val: f(a.investYen || 0), col: C.red },
                                { label: "回収", val: f(a.recoveryYen || 0), col: C.green },
                                { label: "収支", val: pl != null ? f(pl) : "0", col: pl != null ? sc(pl) : C.subHi },
                                { label: "仕事量", val: st.workAmount != null && st.workAmount !== 0 ? f(Math.round(st.workAmount)) : "—", col: st.workAmount ? sc(st.workAmount) : C.subHi },
                            ].map(({ label, val, col }) => (
                                <div key={label} style={{ textAlign: "center", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 2px" }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: mono }}>{val}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Edit form */}
                    <Card style={{ padding: 14, marginBottom: 8 }}>
                        <SecLabel label="データ編集" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>店舗</div>
                                <div style={{ position: "relative" }}>
                                    {textInput(editStore, setEditStore, "店舗名")}
                                    {storeList.length > 0 && (
                                        <button className="b" onClick={() => setShowEditStoreDD(!showEditStoreDD)} style={{
                                            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                                            background: "transparent", border: "none", color: C.sub, fontSize: 14, padding: "4px 6px", cursor: "pointer"
                                        }}>▼</button>
                                    )}
                                    {showEditStoreDD && storeList.length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, zIndex: 10, maxHeight: 150, overflowY: "auto", marginTop: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                                            {storeList.map((st, i) => {
                                                const storeName = typeof st === "object" ? st.name : st;
                                                return (
                                                    <button key={st.id || i} className="b" onClick={() => { setEditStore(storeName); setShowEditStoreDD(false); }} style={{
                                                        width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                        color: C.text, fontSize: 13, padding: "10px 12px", textAlign: "left", fontFamily: font, cursor: "pointer"
                                                    }}>{storeName}</button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>台番号</div>
                                {textInput(editMachineNum, setEditMachineNum, "台番号", { type: "tel", inputMode: "numeric", pattern: "[0-9]*" })}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>投資額</div>
                                <NI v={editInvest} set={setEditInvest} w="100%" center ph="10000" />
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>回収額</div>
                                <NI v={editRecovery} set={setEditRecovery} w="100%" center ph="0" />
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <Btn label="保存" onClick={() => updateArchive(false)} primary fs={13} />
                            <Btn label="保存してリセット" onClick={() => updateArchive(true)} bg={C.orange} fg="#fff" bd="none" fs={13} />
                        </div>
                    </Card>

                    {/* EV stats */}
                    <Card style={{ overflow: "hidden", marginBottom: 8 }}>
                        <SecLabel label="EV詳細" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                            {[
                                { label: "1Kスタート", val: st.start1K > 0 ? f(st.start1K, 1) : "—", unit: "回/K" },
                                { label: "期待値/K", val: st.ev1K != null && st.ev1K !== 0 ? sp(Math.round(st.ev1K), 0) : "—", unit: "円" },
                                { label: "時給", val: st.wage ? f(Math.round(st.wage)) : "—", unit: "円/h" },
                            ].map(({ label, val, unit }) => (
                                <div key={label} style={{ textAlign: "center", padding: "10px 4px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: C.subHi, fontFamily: mono }}>{val}</div>
                                    <div style={{ fontSize: 9, color: C.sub, marginTop: 1 }}>{unit}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Machine aggregate */}
                    {agg && agg.count > 1 && (
                        <Card style={{ padding: 12, marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 6 }}>台番号 {agg.machineNum} トータル</div>
                            <div style={{ display: "flex", gap: 12 }}>
                                <span style={{ fontSize: 12, color: C.subHi }}>座り{agg.count}回</span>
                                <span style={{ fontSize: 12, color: C.subHi }}>1K: {agg.totalK > 0 ? f(agg.totalRot / agg.totalK, 1) : "—"}回</span>
                                <span style={{ fontSize: 12, color: C.subHi }}>総{f(agg.totalRot)}回転</span>
                            </div>
                        </Card>
                    )}

                    {/* Rotation data */}
                    {a.rotRows && a.rotRows.length > 0 && (
                        <Card style={{ overflow: "hidden", marginBottom: 8 }}>
                            <SecLabel label={`回転数データ (${a.rotRows.filter(r => r.type === "data").length}K)`} />
                            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 48px 48px", background: "rgba(249,115,22,0.12)", padding: "5px 4px" }}>
                                {["種別", "総回転", "今回", "平均", "投資", "持ち玉"].map(h => (
                                    <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.sub }}>{h}</div>
                                ))}
                            </div>
                            {a.rotRows.map((row, i) => {
                                const isMochi = row.mode === "mochi";
                                const badgeCol = isMochi ? C.orange : row.mode === "chodama" ? C.purple : C.blue;
                                const badge = isMochi ? "持" : row.mode === "chodama" ? "貯" : "現";
                                return (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 48px 48px", padding: "5px 4px", borderBottom: `1px solid ${C.border}` }}>
                                        <div style={{ textAlign: "center" }}>
                                            <span style={{ fontSize: 8, fontWeight: 700, color: badgeCol, background: badgeCol + "20", borderRadius: 4, padding: "1px 4px" }}>{badge}</span>
                                        </div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.type === "start" ? "START" : row.thisRot}</div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.avgRot || "—"}</div>
                                        <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{row.mode === "mochi" ? "—" : (row.invest ? f(row.invest) : "—")}</div>
                                        <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0))}</div>
                                    </div>
                                );
                            })}
                        </Card>
                    )}

                    {/* Jackpot history */}
                    {a.jpLog && a.jpLog.length > 0 && (
                        <Card style={{ overflow: "hidden", marginBottom: 8 }}>
                            <SecLabel label={`大当たり履歴 (${a.jpLog.length}回)`} />
                            {a.jpLog.map((chain, ci) => (
                                <div key={chain.chainId || ci} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{ci + 1}回目データ {(chain.hits?.length || 0) <= 1 ? "単発" : (chain.hits?.length || 0) + "連チャン"}</span>
                                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                    </div>
                                    {chain.hits?.map((hit, hi) => (
                                        <div key={hi} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "3px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                            <div style={{ fontSize: 10, color: C.sub }}>{hit.hitNumber}連: {hit.rounds}R</div>
                                            <div style={{ fontSize: 10, color: C.yellow, fontFamily: mono }}>液晶{f(hit.displayBalls)}</div>
                                            <div style={{ fontSize: 10, color: C.green, fontFamily: mono }}>実{f(hit.actualBalls)}</div>
                                        </div>
                                    ))}
                                    {chain.summary && (
                                        <div style={{ display: "flex", gap: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                                            <span style={{ fontSize: 10, color: C.teal }}>1R: {f(chain.summary.avg1R, 1)}発</span>
                                            <span style={{ fontSize: 10, color: sc(chain.summary.sapoPerRot || 0) }}>
                                                サポ/回転: {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </Card>
                    )}

                    {/* Delete button */}
                    <div style={{ textAlign: "center", marginTop: 8, marginBottom: 16 }}>
                        {delConfirm === a.id ? (
                            <button className="b" onClick={() => { deleteArchive(a.id); setSelectedArchiveId(null); }} style={{
                                background: C.red, border: "none", borderRadius: 8,
                                color: "#fff", fontSize: 13, padding: "10px 24px", fontWeight: 700, fontFamily: font
                            }}>削除確定</button>
                        ) : (
                            <button className="b" onClick={() => setDelConfirm(a.id)} style={{
                                background: "rgba(239,68,68,0.1)", border: `1px solid ${C.red}40`, borderRadius: 8,
                                color: C.red, fontSize: 13, padding: "10px 24px", fontWeight: 700, fontFamily: font
                            }}>このデータを削除</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Calendar View ──
    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* Month header — compact */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <button className="b" onClick={prevMonth} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 14, padding: "4px 10px", fontWeight: 700 }}>‹</button>
                <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{viewMonth.year}年 {viewMonth.month + 1}月</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(monthTotal), fontFamily: font, marginTop: 1 }}>
                        {monthTotal !== 0 ? f(Math.round(monthTotal)) + "円" : "—"}
                    </div>
                </div>
                <button className="b" onClick={nextMonth} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 14, padding: "4px 10px", fontWeight: 700 }}>›</button>
            </div>

            {/* Day of week header — compact */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
                {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                    <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: i === 0 ? C.red : i === 6 ? C.blue : C.sub, padding: "4px 0" }}>{d}</div>
                ))}
            </div>

            {/* Calendar grid — compact */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
                {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`e-${idx}`} />;
                    const ds = dateStr(day);
                    const total = dailyTotals[ds];
                    const hasData = total != null;
                    const isSel = selectedDate === ds;
                    const todayBg = isToday(day) ? "rgba(59, 130, 246, 0.15)" : isSel ? "rgba(59,130,246,0.1)" : "transparent";
                    const dow = idx % 7;

                    return (
                        <button key={day} className="b" onClick={() => setSelectedDate(isSel ? null : ds)} style={{
                            background: todayBg, border: isToday(day) ? `1px solid ${C.blue}40` : isSel ? `1px solid ${C.blue}30` : `1px solid transparent`,
                            borderRadius: 6, padding: "5px 1px", textAlign: "center", minHeight: 42,
                            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
                        }}>
                            <div style={{ fontSize: 19, fontWeight: isToday(day) ? 800 : 600, color: dow === 0 ? C.red : dow === 6 ? C.blue : C.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{day}</div>
                            {hasData && (
                                <div style={{ fontSize: 9, fontWeight: 700, color: sc(total), fontFamily: font, fontVariantNumeric: "tabular-nums", marginTop: 3, lineHeight: 1 }}>
                                    {f(Math.round(total))}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Inline data strip when date is selected ── */}
            {selectedDate && (() => {
                const dateArchives = byDate[selectedDate] || [];
                const dayTotal = dailyTotals[selectedDate];
                const hasCurrentSession = S.rotRows && S.rotRows.length > 0;
                return (
                    <div style={{ marginTop: 10 }}>
                        {/* Selected date header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{selectedDate}</div>
                            {dayTotal != null && (
                                <div style={{ fontSize: 14, fontWeight: 700, color: sc(dayTotal), fontFamily: font }}>
                                    {f(Math.round(dayTotal))}円
                                </div>
                            )}
                        </div>

                        {/* Save current session as new entry (compact) */}
                        {hasCurrentSession && (
                            <div style={{ marginBottom: 10, padding: "10px 12px", background: "rgba(59,130,246,0.06)", border: `1px solid ${C.blue}30`, borderRadius: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>現在のセッションを保存</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                    <Btn label="保存" onClick={() => {
                                        const a = makeArchive();
                                        a.date = selectedDate;
                                        S.setArchives(prev => [...prev, a]);
                                    }} primary fs={12} />
                                    <Btn label="保存+リセット" onClick={() => {
                                        const a = makeArchive();
                                        a.date = selectedDate;
                                        S.setArchives(prev => [...prev, a]);
                                        onReset();
                                    }} bg={C.orange} fg="#fff" bd="none" fs={12} />
                                </div>
                            </div>
                        )}

                        {/* Archive entries — swipeable summary cards */}
                        {dateArchives.length > 0 ? dateArchives.map(a => (
                            <div key={a.id} style={{ position: "relative", overflow: "hidden", borderRadius: 12, marginBottom: 8 }}>
                                {/* Delete button behind card — only visible when swiped */}
                                {swipedId === a.id && (
                                    <div style={{
                                        position: "absolute", right: 0, top: 0, bottom: 0, width: 80,
                                        background: C.red, display: "flex", alignItems: "center", justifyContent: "center",
                                        borderRadius: "0 12px 12px 0", zIndex: 0,
                                    }}>
                                        <button className="b" onClick={(e) => { e.stopPropagation(); deleteArchive(a.id); setSwipedId(null); }} style={{
                                            background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: font, padding: "8px 12px",
                                        }}>削除</button>
                                    </div>
                                )}
                                {/* Swipeable card */}
                                <div
                                    style={{
                                        transform: swipedId === a.id ? "translateX(-80px)" : "translateX(0)",
                                        transition: "transform 0.25s ease",
                                        position: "relative", zIndex: 1,
                                    }}
                                    onTouchStart={(e) => {
                                        swipeRef.current = { startX: e.touches[0].clientX, id: a.id };
                                    }}
                                    onTouchEnd={(e) => {
                                        const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
                                        if (swipeRef.current.id === a.id) {
                                            if (dx < -50) setSwipedId(a.id);
                                            else if (dx > 30) setSwipedId(null);
                                        }
                                    }}
                                    onClick={() => { if (swipedId === a.id) { setSwipedId(null); } }}
                                >
                                    <SummaryCard a={a} onClick={() => { if (swipedId !== a.id) setSelectedArchiveId(a.id); }} />
                                </div>
                            </div>
                        )) : !hasCurrentSession && (
                            <div style={{ textAlign: "center", color: C.sub, fontSize: 12, padding: "20px 0" }}>
                                この日のデータはありません
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Cumulative EV graph */}
            {(() => {
                const monthArchives = archives.filter(a => a.date && a.date.startsWith(monthKey));
                if (monthArchives.length < 2) return null;
                const graphData = [];
                let cum = 0;
                monthArchives.sort((a, b) => a.date.localeCompare(b.date)).forEach(a => {
                    cum += (a.stats?.workAmount || 0);
                    graphData.push({ label: a.date.slice(8), value: Math.round(cum) });
                });
                return (
                    <Card style={{ padding: "12px 8px", marginTop: 12 }}>
                        <SecLabel label={`${viewMonth.month + 1}月 累計仕事量推移`} />
                        <LineChart data={graphData} color="#3b82f6" />
                    </Card>
                );
            })()}

            {/* CSV Import/Export */}
            <Card style={{ padding: 14, marginTop: 12 }}>
                <SecLabel label="データ管理" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Btn label="CSVエクスポート" onClick={() => {
                        if (archives.length === 0) {
                            alert("エクスポートするデータがありません");
                            return;
                        }
                        const headers = [
                            "日付", "時刻", "店舗名", "台番号", "機種名",
                            "投資", "回収", "収支", "確率分母", "貸玉数", "換金率",
                            "時間回転数", "ボーダー", "玉単価", "仕事量", "期待値/K", "1Kスタート", "総回転"
                        ];
                        const rows = archives.map(a => {
                            const st = a.stats || {};
                            const invest = a.investYen || 0;
                            const recovery = a.recoveryYen || 0;
                            return [
                                a.date || "",
                                a.time || "",
                                (a.storeName || "").replace(/,/g, "，"),
                                a.machineNum || "",
                                (a.machineName || "").replace(/,/g, "，"),
                                invest,
                                recovery,
                                recovery - invest,
                                a.settings?.synthDenom || "",
                                a.settings?.rentBalls || "",
                                a.settings?.exRate || "",
                                a.settings?.rotPerHour || "",
                                a.settings?.border || "",
                                a.settings?.ballVal || "",
                                Math.round(st.workAmount || 0),
                                Math.round(st.ev1K || 0),
                                st.start1K ? st.start1K.toFixed(2) : "",
                                Math.round(st.netRot || 0)
                            ].join(",");
                        });
                        const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `pachi-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
                        link.click();
                        URL.revokeObjectURL(url);
                    }} fs={12} />
                    <label style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", borderRadius: 12,
                        color: "#fff", fontSize: 12, fontWeight: 700, padding: "12px 16px", cursor: "pointer",
                        fontFamily: font, textAlign: "center"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                try {
                                    let text = ev.target?.result;
                                    if (typeof text !== "string") return;
                                    // BOM除去
                                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                                    if (lines.length < 2) {
                                        alert("有効なデータがありません");
                                        return;
                                    }
                                    const headerLine = lines[0];
                                    const headers = headerLine.split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
                                    // カラム名の柔軟なマッチング
                                    const colIdx = (names) => {
                                        const arr = Array.isArray(names) ? names : [names];
                                        for (const name of arr) {
                                            const idx = headers.indexOf(name);
                                            if (idx !== -1) return idx;
                                        }
                                        return -1;
                                    };
                                    const getCol = (cols, names, def = "") => {
                                        const idx = colIdx(names);
                                        return idx >= 0 && cols[idx] ? cols[idx] : def;
                                    };
                                    const newArchives = [];
                                    for (let i = 1; i < lines.length; i++) {
                                        const cols = lines[i].split(",").map(c => c.trim());
                                        if (cols.length < 3) continue;
                                        // 日付フォーマット変換 (2026/03/13 → 2026-03-13)
                                        let date = getCol(cols, ["日付", "date"]);
                                        if (date.includes("/")) date = date.replace(/\//g, "-");
                                        if (!date) continue;
                                        const time = getCol(cols, ["時刻", "time"]);
                                        const invest = parseFloat(getCol(cols, ["投資額", "投資", "invest"], "0")) || 0;
                                        const recovery = parseFloat(getCol(cols, ["回収額", "回収", "recovery"], "0")) || 0;
                                        const synthDenom = parseFloat(getCol(cols, ["確率分母"], "319.6")) || 319.6;
                                        const rentBalls = parseFloat(getCol(cols, ["貸玉数"], "250")) || 250;
                                        const exRate = parseFloat(getCol(cols, ["換金率"], "250")) || 250;
                                        const rotPerHour = parseFloat(getCol(cols, ["時間回転数"], "250")) || 250;
                                        const border = parseFloat(getCol(cols, ["ボーダー"], "20")) || 20;
                                        const ballVal = parseFloat(getCol(cols, ["玉単価"], "4")) || 4;
                                        const workAmount = parseFloat(getCol(cols, ["仕事量", "期待値"], "0")) || 0;
                                        const ev1K = parseFloat(getCol(cols, ["期待値/K"], "0")) || 0;
                                        const start1K = parseFloat(getCol(cols, ["1Kスタート"], "0")) || 0;
                                        const netRot = parseFloat(getCol(cols, ["総回転"], "0")) || 0;
                                        const hours = parseFloat(getCol(cols, ["稼働時間"], "0")) || 0;
                                        const hourlyWage = parseFloat(getCol(cols, ["時給"], "0")) || 0;
                                        newArchives.push({
                                            id: Date.now() + i + Math.random(),
                                            date,
                                            time,
                                            storeName: getCol(cols, ["店舗名", "店舗"]).replace(/，/g, ","),
                                            machineNum: getCol(cols, ["台番号"]),
                                            machineName: getCol(cols, ["機種名", "機種"]).replace(/，/g, ","),
                                            investYen: invest,
                                            recoveryYen: recovery,
                                            settings: { synthDenom, rentBalls, exRate, rotPerHour, border, ballVal },
                                            stats: { workAmount, ev1K, start1K, netRot },
                                            rotRows: [],
                                            jpLog: [],
                                            sesLog: [],
                                            totalTrayBalls: 0,
                                            startRot: 0,
                                        });
                                    }
                                    if (newArchives.length === 0) {
                                        alert("インポートできるデータがありませんでした");
                                        return;
                                    }
                                    // デバッグ: 最初のエントリの日付を表示
                                    console.log("Import debug:", newArchives.map(a => ({ date: a.date, invest: a.investYen, recovery: a.recoveryYen, work: a.stats?.workAmount })));
                                    // 重複チェック用のキー生成関数
                                    const getKey = (a) => `${a.date}|${a.storeName || ""}|${a.machineNum || ""}|${a.machineName || ""}|${a.investYen || 0}|${a.recoveryYen || 0}`;
                                    // CSVインポートしたデータにはisImportedフラグを付ける
                                    const importedArchives = newArchives.map(a => ({ ...a, isImported: true }));
                                    S.setArchives(prev => {
                                        // 既存のインポートデータを除外
                                        const nonImported = prev.filter(a => !a.isImported);
                                        // 既存データのキーセットを作成
                                        const existingKeys = new Set(nonImported.map(getKey));
                                        // 重複を除外した新しいインポートデータ
                                        const uniqueImported = importedArchives.filter(a => !existingKeys.has(getKey(a)));
                                        // インポートデータ内での重複も除外
                                        const seenKeys = new Set();
                                        const dedupedImported = uniqueImported.filter(a => {
                                            const key = getKey(a);
                                            if (seenKeys.has(key)) return false;
                                            seenKeys.add(key);
                                            return true;
                                        });
                                        const updated = [...nonImported, ...dedupedImported];
                                        console.log("Archives after import:", updated.length, "(non-imported:", nonImported.length, ", imported:", dedupedImported.length, ", skipped duplicates:", importedArchives.length - dedupedImported.length, ")");
                                        return updated;
                                    });
                                    alert(`${newArchives.length}件のデータをインポートしました（重複データは自動的にスキップされました）\n日付例: ${newArchives[0]?.date}`);
                                } catch (err) {
                                    alert("CSVの読み込みに失敗しました: " + err.message);
                                }
                            };
                            reader.readAsText(file, "UTF-8");
                            e.target.value = "";
                        }} />
                    </label>
                </div>
            </Card>

            {/* 重複データ削除・インポートデータ管理 */}
            <Card style={{ padding: 14, marginTop: 12 }}>
                <SecLabel label="データ整理" />
                {/* 重複データ削除ボタン */}
                {(() => {
                    const getKey = (a) => `${a.date}|${a.storeName || ""}|${a.machineNum || ""}|${a.machineName || ""}|${a.investYen || 0}|${a.recoveryYen || 0}`;
                    const keyCount = {};
                    archives.forEach(a => {
                        const key = getKey(a);
                        keyCount[key] = (keyCount[key] || 0) + 1;
                    });
                    const duplicateCount = Object.values(keyCount).reduce((sum, c) => sum + (c > 1 ? c - 1 : 0), 0);
                    return duplicateCount > 0 ? (
                        <>
                            <p style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>
                                重複データ: {duplicateCount}件検出
                            </p>
                            <button
                                className="b"
                                onClick={() => {
                                    if (window.confirm(`${duplicateCount}件の重複データを削除しますか？\n（各データは1件だけ残ります）`)) {
                                        S.setArchives(prev => {
                                            const seen = new Set();
                                            return prev.filter(a => {
                                                const key = getKey(a);
                                                if (seen.has(key)) return false;
                                                seen.add(key);
                                                return true;
                                            });
                                        });
                                        alert("重複データを削除しました");
                                    }
                                }}
                                style={{
                                    width: "100%",
                                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                                    border: "none",
                                    borderRadius: 12,
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                    fontFamily: font,
                                    marginBottom: 10,
                                }}
                            >
                                重複データを削除
                            </button>
                        </>
                    ) : (
                        <p style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>
                            重複データはありません
                        </p>
                    );
                })()}
                {/* CSVインポートデータ削除 */}
                {archives.some(a => a.isImported) && (
                    <>
                        <p style={{ fontSize: 11, color: C.sub, marginBottom: 10, marginTop: 10 }}>
                            CSVからインポートしたデータ: {archives.filter(a => a.isImported).length}件
                        </p>
                        <button
                            className="b"
                            onClick={() => {
                                if (window.confirm("CSVでインポートしたデータをすべて削除しますか？\n（手動で記録したデータは残ります）")) {
                                    S.setArchives(prev => prev.filter(a => !a.isImported));
                                    alert("インポートデータを削除しました");
                                }
                            }}
                            style={{
                                width: "100%",
                                background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                border: "none",
                                borderRadius: 12,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 700,
                                padding: "14px 16px",
                                cursor: "pointer",
                                fontFamily: font,
                            }}
                        >
                            CSVインポートデータを削除
                        </button>
                    </>
                )}
            </Card>
        </div>
    );
}

/* ================================================================
   SettingsTab — 設定 + 機種検索（統合）
================================================================ */
export function SettingsTab({ s, onReset }) {
    const [confirming, setConfirming] = useState(false);
    const [showMachineSearch, setShowMachineSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [editingMachine, setEditingMachine] = useState(null); // 編集中の機種（nullなら新規登録モード）
    const [showMachineForm, setShowMachineForm] = useState(false);
    const results = searchMachines(query, s.customMachines);

    // 店舗管理用のstate
    const [showStoreSearch, setShowStoreSearch] = useState(false);
    const [storeQuery, setStoreQuery] = useState("");
    const [selectedStore, setSelectedStore] = useState(null);
    const [editingStore, setEditingStore] = useState(null);
    const [showStoreForm, setShowStoreForm] = useState(false);

    // 機種フォームの初期値
    const emptyMachine = {
        name: "", maker: "", type: "ミドル", prob: "1/319.6", synthProb: 319.6,
        spec1R: 140, specAvgTotalRounds: 30, specSapo: 0, roundDist: "", rushDist: "",
        border: { "4.00": 0, "3.57": 0, "3.33": 0, "3.03": 0 }
    };
    const [formData, setFormData] = useState(emptyMachine);

    // 店舗フォームの初期値
    const emptyStore = { name: "", address: "", rentBalls: 250, exRate: 250, memo: "", chodama: 0 };
    const [storeFormData, setStoreFormData] = useState(emptyStore);

    // 店舗データの正規化（旧形式の文字列配列を新形式のオブジェクト配列に変換）+ chodamaフィールドの追加
    const normalizedStores = (s.stores || []).map(st =>
        typeof st === "string"
            ? { id: Date.now() + Math.random(), name: st, address: "", rentBalls: 250, exRate: 250, memo: "", chodama: 0 }
            : { ...st, chodama: st.chodama || 0 }
    );

    // 店舗検索
    const storeResults = storeQuery.trim()
        ? normalizedStores.filter(st =>
            st.name.toLowerCase().includes(storeQuery.toLowerCase()) ||
            (st.address && st.address.toLowerCase().includes(storeQuery.toLowerCase()))
        )
        : normalizedStores;

    // 機種登録フォームを開く
    const openMachineForm = (machine = null) => {
        if (machine) {
            setEditingMachine(machine);
            setFormData({ ...emptyMachine, ...machine });
        } else {
            setEditingMachine(null);
            setFormData(emptyMachine);
        }
        setShowMachineForm(true);
    };

    // 機種を保存
    const saveMachine = () => {
        if (!formData.name.trim()) return;
        const machineData = {
            ...formData,
            id: editingMachine?.id || Date.now(),
            synthProb: parseFloat(formData.synthProb) || 319.6,
            spec1R: parseFloat(formData.spec1R) || 140,
            specAvgTotalRounds: parseFloat(formData.specAvgTotalRounds) || 30,
            specSapo: parseFloat(formData.specSapo) || 0,
        };
        if (editingMachine) {
            // 編集
            s.setCustomMachines(prev => prev.map(m => m.id === editingMachine.id ? machineData : m));
        } else {
            // 新規登録
            s.setCustomMachines(prev => [...prev, machineData]);
        }
        setShowMachineForm(false);
        setEditingMachine(null);
        setFormData(emptyMachine);
    };

    // 機種を削除
    const deleteMachine = (machine) => {
        if (!window.confirm(`「${machine.name}」を削除しますか？`)) return;
        s.setCustomMachines(prev => prev.filter(m => m.id !== machine.id));
        setSelected(null);
    };

    // 店舗登録フォームを開く
    const openStoreForm = (store = null) => {
        if (store) {
            setEditingStore(store);
            setStoreFormData({ ...emptyStore, ...store });
        } else {
            setEditingStore(null);
            setStoreFormData(emptyStore);
        }
        setShowStoreForm(true);
    };

    // 店舗を保存
    const saveStore = () => {
        if (!storeFormData.name.trim()) return;
        const storeData = {
            ...storeFormData,
            id: editingStore?.id || Date.now(),
            rentBalls: parseInt(storeFormData.rentBalls) || 250,
            exRate: parseInt(storeFormData.exRate) || 250,
            chodama: parseInt(storeFormData.chodama) || 0,
        };
        if (editingStore) {
            s.setStores(prev => prev.map(st => (typeof st === "object" && st.id === editingStore.id) ? storeData : st));
        } else {
            s.setStores(prev => [...prev.filter(st => typeof st === "object"), storeData]);
        }
        setShowStoreForm(false);
        setEditingStore(null);
        setStoreFormData(emptyStore);
    };

    // 店舗を削除
    const deleteStore = (store) => {
        if (!window.confirm(`「${store.name}」を削除しますか？`)) return;
        s.setStores(prev => prev.filter(st => typeof st === "object" ? st.id !== store.id : st !== store.name));
        setSelectedStore(null);
    };

    // 店舗の設定を反映
    const applyStore = (store) => {
        s.setStoreName(store.name);
        if (store.rentBalls) s.setRentBalls(store.rentBalls);
        if (store.exRate) s.setExRate(store.exRate);
        setSelectedStore(null);
        setShowStoreSearch(false);
    };

    // === CSV機能 ===
    // スプレッドシート形式のヘッダー定義（インポート/エクスポート共通）
    const csvHeadersJp = [
        "機種名", "大当り確率", "ボーダー(1k)", "賞球数", "回転単価",
        "1大当たり平均出玉（削り込み）", "標準偏差", "初期確率", "ムラ係数",
        "空間感応度", "レジーム感応度", "ヘソ平均出玉(自動)", "RUSH平均出玉",
        "RUSH突入率", "RUSH継続率", "手動入力値(優先)",
        "【ヘソ1】出玉", "【ヘソ1】比率", "【ヘソ2】出玉", "【ヘソ2】比率",
        "【ヘソ3】出玉", "【ヘソ3】比率", "MC期待日当", "MC勝率",
        "ラウンド振り分け", "確変中ラウンド振り分け",
        "ボーダー(4.00)", "ボーダー(3.57)", "ボーダー(3.33)", "ボーダー(3.03)"
    ];

    // 機種データをCSVエクスポート（スプレッドシート形式）
    const exportMachinesCSV = () => {
        const machines = s.customMachines || [];
        if (machines.length === 0) {
            alert("エクスポートするカスタム機種がありません");
            return;
        }
        const csvContent = [
            csvHeadersJp.join(","),
            ...machines.map(m => {
                const hesoDist = m.hesoDist || [];
                const border = m.border || {};
                const formatPercent = (val) => val != null ? `${val}%` : "";
                const row = [
                    m.name || "",
                    m.synthProb || "",
                    m.border1K || "",
                    m.prize || "",
                    m.unitCost || "",
                    m.avgPayoutPerHit || "",
                    m.stdDev || "",
                    m.initialProb || "",
                    m.muraCoef || "",
                    m.spatialSens || "",
                    m.regimeSens || "",
                    m.hesoAvgPayout || "",
                    m.rushAvgPayout || "",
                    formatPercent(m.rushEntryRate),
                    formatPercent(m.rushContinueRate),
                    m.manualHesoValue || "",
                    hesoDist[0]?.payout || "",
                    formatPercent(hesoDist[0]?.rate),
                    hesoDist[1]?.payout || "",
                    formatPercent(hesoDist[1]?.rate),
                    hesoDist[2]?.payout || "",
                    formatPercent(hesoDist[2]?.rate),
                    m.mcExpectedDaily || "",
                    formatPercent(m.mcWinRate),
                    m.roundDist || "",
                    m.rushDist || "",
                    border["4.00"] || "",
                    border["3.57"] || "",
                    border["3.33"] || "",
                    border["3.03"] || ""
                ];
                return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
            })
        ].join("\n");
        downloadCSV(csvContent, "machines.csv");
    };

    // 店舗データをCSVエクスポート
    const exportStoresCSV = () => {
        if (normalizedStores.length === 0) {
            alert("エクスポートする店舗がありません");
            return;
        }
        const headers = ["name", "address", "rentBalls", "exRate", "memo"];
        const csvContent = [
            headers.join(","),
            ...normalizedStores.map(st => headers.map(h => `"${String(st[h] || "").replace(/"/g, '""')}"`).join(","))
        ].join("\n");
        downloadCSV(csvContent, "stores.csv");
    };

    // CSVダウンロード共通関数
    const downloadCSV = (content, filename) => {
        const bom = "\uFEFF";
        const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // CSVパース関数
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
        return lines.slice(1).map(line => {
            const values = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === "," && !inQuotes) {
                    values.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            const obj = {};
            headers.forEach((h, i) => { obj[h] = values[i] || ""; });
            return obj;
        });
    };

    // 日本語ヘッダーから内部フィールド名へのマッピング
    const jpHeaderToField = {
        "機種名": "name",
        "大当り確率": "synthProb",
        "ボーダー(1k)": "border1K",
        "賞球数": "prize",
        "回転単価": "unitCost",
        "1大当たり平均出玉（削り込み）": "avgPayoutPerHit",
        "標準偏差": "stdDev",
        "初期確率": "initialProb",
        "ムラ係数": "muraCoef",
        "空間感応度": "spatialSens",
        "レジーム感応度": "regimeSens",
        "ヘソ平均出玉(自動)": "hesoAvgPayout",
        "RUSH平均出玉": "rushAvgPayout",
        "RUSH突入率": "rushEntryRate",
        "RUSH継続率": "rushContinueRate",
        "手動入力値(優先)": "manualHesoValue",
        "【ヘソ1】出玉": "heso1Payout",
        "【ヘソ1】比率": "heso1Rate",
        "【ヘソ2】出玉": "heso2Payout",
        "【ヘソ2】比率": "heso2Rate",
        "【ヘソ3】出玉": "heso3Payout",
        "【ヘソ3】比率": "heso3Rate",
        "MC期待日当": "mcExpectedDaily",
        "MC勝率": "mcWinRate",
        "ラウンド振り分け": "roundDist",
        "確変中ラウンド振り分け": "rushDist",
        "ボーダー(4.00)": "border400",
        "ボーダー(3.57)": "border357",
        "ボーダー(3.33)": "border333",
        "ボーダー(3.03)": "border303"
    };

    // パーセント文字列から数値に変換
    const parsePercent = (val) => {
        if (val == null || val === "") return null;
        const str = String(val).replace(/[%％]/g, "").replace(/,/g, "").trim();
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    };

    // 数値パース（カンマ除去対応）
    const parseNum = (val) => {
        if (val == null || val === "") return null;
        const str = String(val).replace(/,/g, "").trim();
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    };

    // 機種CSVインポート（スプレッドシート形式対応）
    const importMachinesCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = parseCSV(ev.target.result);
            if (data.length === 0) {
                alert("インポートできるデータがありません");
                return;
            }
            // ヘッダーをチェックして日本語形式か旧形式かを判定
            const firstRow = data[0];
            const isJpFormat = "機種名" in firstRow || firstRow.name === undefined;

            const newMachines = data.filter(d => (isJpFormat ? d["機種名"] : d.name)).map(d => {
                // 日本語ヘッダーからフィールドを取得
                const get = (jpKey, engKey) => isJpFormat ? d[jpKey] : d[engKey];

                // ヘソ分布を構築
                const hesoDist = [];
                const h1p = parseNum(get("【ヘソ1】出玉", "heso1Payout"));
                const h1r = parsePercent(get("【ヘソ1】比率", "heso1Rate"));
                if (h1p != null) hesoDist.push({ payout: h1p, rate: h1r || 100 });
                const h2p = parseNum(get("【ヘソ2】出玉", "heso2Payout"));
                const h2r = parsePercent(get("【ヘソ2】比率", "heso2Rate"));
                if (h2p != null) hesoDist.push({ payout: h2p, rate: h2r || 0 });
                const h3p = parseNum(get("【ヘソ3】出玉", "heso3Payout"));
                const h3r = parsePercent(get("【ヘソ3】比率", "heso3Rate"));
                if (h3p != null) hesoDist.push({ payout: h3p, rate: h3r || 0 });

                const synthProb = parseNum(get("大当り確率", "synthProb")) || 319.6;

                return {
                    id: Date.now() + Math.random(),
                    name: get("機種名", "name") || "",
                    maker: d.maker || "",
                    type: d.type || "ミドル",
                    prob: `1/${synthProb}`,
                    synthProb: synthProb,
                    border1K: parseNum(get("ボーダー(1k)", "border1K")),
                    prize: parseNum(get("賞球数", "prize")) || 3,
                    unitCost: parseNum(get("回転単価", "unitCost")),
                    avgPayoutPerHit: parseNum(get("1大当たり平均出玉（削り込み）", "avgPayoutPerHit")),
                    stdDev: parseNum(get("標準偏差", "stdDev")),
                    initialProb: parseNum(get("初期確率", "initialProb")),
                    muraCoef: parseNum(get("ムラ係数", "muraCoef")),
                    spatialSens: parseNum(get("空間感応度", "spatialSens")),
                    regimeSens: parseNum(get("レジーム感応度", "regimeSens")),
                    hesoAvgPayout: parseNum(get("ヘソ平均出玉(自動)", "hesoAvgPayout")),
                    rushAvgPayout: parseNum(get("RUSH平均出玉", "rushAvgPayout")),
                    rushEntryRate: parsePercent(get("RUSH突入率", "rushEntryRate")),
                    rushContinueRate: parsePercent(get("RUSH継続率", "rushContinueRate")),
                    manualHesoValue: parseNum(get("手動入力値(優先)", "manualHesoValue")),
                    hesoDist: hesoDist.length > 0 ? hesoDist : undefined,
                    mcExpectedDaily: parseNum(get("MC期待日当", "mcExpectedDaily")),
                    mcWinRate: parsePercent(get("MC勝率", "mcWinRate")),
                    // ラウンド振り分け
                    roundDist: get("ラウンド振り分け", "roundDist") || d.roundDist || "",
                    rushDist: get("確変中ラウンド振り分け", "rushDist") || d.rushDist || "",
                    // ボーダー（交換率別）
                    border: {
                        "4.00": parseNum(get("ボーダー(4.00)", "border400")) || 0,
                        "3.57": parseNum(get("ボーダー(3.57)", "border357")) || 0,
                        "3.33": parseNum(get("ボーダー(3.33)", "border333")) || 0,
                        "3.03": parseNum(get("ボーダー(3.03)", "border303")) || 0,
                    },
                    // 既存フィールドとの互換性
                    spec1R: parseNum(d.spec1R) || 140,
                    specAvgTotalRounds: parseNum(d.specAvgTotalRounds) || 30,
                    specSapo: parseNum(d.specSapo) || 0,
                };
            });
            if (newMachines.length > 0) {
                s.setCustomMachines(prev => [...prev, ...newMachines]);
                alert(`${newMachines.length}件の機種をインポートしました`);
            } else {
                alert("インポートできる機種が見つかりませんでした");
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    // 店舗CSVインポート
    const importStoresCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const data = parseCSV(ev.target.result);
            const newStores = data.filter(d => d.name).map(d => ({
                id: Date.now() + Math.random(),
                name: d.name || "",
                address: d.address || "",
                rentBalls: parseInt(d.rentBalls) || 250,
                exRate: parseInt(d.exRate) || 250,
                memo: d.memo || "",
            }));
            if (newStores.length > 0) {
                s.setStores(prev => [...prev.filter(st => typeof st === "object"), ...newStores]);
                alert(`${newStores.length}件の店舗をインポートしました`);
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    const applyMachine = (m) => {
        s.setSynthDenom(m.synthProb);
        if (m.spec1R) s.setSpec1R(m.spec1R);
        if (m.specAvgTotalRounds) s.setSpecAvgRounds(m.specAvgTotalRounds);
        if (m.specSapo != null) s.setSpecSapo(m.specSapo);
        if (m.name) s.setMachineName(m.name);
        setSelected(null);
        setShowMachineSearch(false);
    };

    // 理論ボーダーのリアルタイム計算
    const exchP = 1000 / (s.exRate || 1);
    const avgNetGainSpec = (s.spec1R || 0) * (s.specAvgRounds || 0) + (s.specSapo || 0);
    const specNetGainYen = avgNetGainSpec * exchP;
    const calcBorder = specNetGainYen > 0 ? ((s.synthDenom || 1) * 1000) / specNetGainYen : 0;

    // 交換レート（円/玉）を計算
    const yenPerBall = 100 / ((s.exRate || 250) / 10);
    // 交換レートキーを特定（4.00, 3.57, 3.33, 3.03に近い値）
    const getExRateKey = () => {
        if (Math.abs(yenPerBall - 4.00) < 0.1) return "4.00";
        if (Math.abs(yenPerBall - 3.57) < 0.1) return "3.57";
        if (Math.abs(yenPerBall - 3.33) < 0.1) return "3.33";
        if (Math.abs(yenPerBall - 3.03) < 0.1) return "3.03";
        return null; // カスタムレート
    };
    const exRateKey = getExRateKey();
    const exRateLabel = exRateKey ? `${exRateKey}円交換` : `${yenPerBall.toFixed(2)}円交換`;

    // Store detail view
    if (selectedStore) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelectedStore(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 一覧に戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selectedStore.name}</div>
                    {selectedStore.address && <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{selectedStore.address}</div>}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>貸玉</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{Math.round((selectedStore.rentBalls || 250) / 10)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉/100円</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>交換</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{Math.round((selectedStore.exRate || 250) / 10)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉/100円</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>貯玉残高</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(selectedStore.chodama || 0)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉</div>
                        </div>
                    </div>

                    {selectedStore.memo && (
                        <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>メモ</div>
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{selectedStore.memo}</div>
                        </div>
                    )}
                </Card>

                <Btn label="この店舗の設定を反映" onClick={() => applyStore(selectedStore)} bg={C.blue} fg="#fff" bd="none" />

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <Btn label="編集" onClick={() => { setSelectedStore(null); openStoreForm(selectedStore); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    <Btn label="削除" onClick={() => deleteStore(selectedStore)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                </div>
            </div>
        );
    }

    // Store form view
    if (showStoreForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowStoreForm(false); setEditingStore(null); setStoreFormData(emptyStore); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingStore ? "店舗を編集" : "新規店舗登録"}
                    </div>

                    {/* 店舗名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店舗名 *</div>
                        <input type="text" value={storeFormData.name} onChange={e => setStoreFormData({ ...storeFormData, name: e.target.value })}
                            placeholder="例: パチンコXX店"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 住所 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>住所</div>
                        <input type="text" value={storeFormData.address} onChange={e => setStoreFormData({ ...storeFormData, address: e.target.value })}
                            placeholder="例: 東京都渋谷区..."
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 貸玉100円 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貸玉（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" value={Math.round((storeFormData.rentBalls || 250) / 10)} onChange={e => setStoreFormData({ ...storeFormData, rentBalls: (parseInt(e.target.value) || 25) * 10 })}
                                placeholder="25"
                                style={{ flex: 1, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / ((storeFormData.rentBalls || 250) / 10)).toFixed(2)}円/玉</span>
                        </div>
                    </div>

                    {/* 交換100円 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="number" value={Math.round((storeFormData.exRate || 250) / 10)} onChange={e => setStoreFormData({ ...storeFormData, exRate: (parseInt(e.target.value) || 25) * 10 })}
                                placeholder="25"
                                style={{ flex: 1, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / ((storeFormData.exRate || 250) / 10)).toFixed(2)}円/玉</span>
                        </div>
                    </div>

                    {/* 貯玉残高 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉残高（玉）</div>
                        <input type="number" value={storeFormData.chodama || 0} onChange={e => setStoreFormData({ ...storeFormData, chodama: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* メモ */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メモ</div>
                        <textarea value={storeFormData.memo} onChange={e => setStoreFormData({ ...storeFormData, memo: e.target.value })}
                            placeholder="営業時間など..."
                            rows={3}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none", resize: "vertical" }} />
                    </div>

                    <Btn label={editingStore ? "更新" : "登録"} onClick={saveStore} bg={C.blue} fg="#fff" bd="none" disabled={!storeFormData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Store search view
    if (showStoreSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowStoreSearch(false); setStoreQuery(""); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openStoreForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700
                    }}>+ 店舗を登録</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <input
                        type="text"
                        value={storeQuery}
                        onChange={e => setStoreQuery(e.target.value)}
                        placeholder="店舗名・住所で検索..."
                        style={{
                            width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font,
                            outline: "none",
                        }}
                    />
                </div>

                {/* CSV インポート/エクスポート */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportStoresCSV} style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600
                    }}>CSVエクスポート</button>
                    <label style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600,
                        textAlign: "center", cursor: "pointer"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv" onChange={importStoresCSV} style={{ display: "none" }} />
                    </label>
                </div>

                {storeResults.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>登録された店舗がありません</div>
                ) : (
                    storeResults.map((st, i) => (
                        <button key={st.id || i} className="b" onClick={() => setSelectedStore(st)} style={{
                            width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                            border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
                            display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                            textAlign: "left",
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{st.name}</div>
                                {st.address && <div style={{ fontSize: 10, color: C.sub }}>{st.address}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{st.rentBalls || 250}玉</div>
                                <div style={{ fontSize: 9, color: C.sub }}>{st.exRate || 250}玉交換</div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        );
    }

    // Machine detail view
    if (selected) {
        const borderKeys = selected.border ? Object.keys(selected.border).filter(k => selected.border[k] > 0).sort((a, b) => Number(b) - Number(a)) : [];
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelected(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 一覧に戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{selected.maker} | {selected.type}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>大当たり確率</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{selected.prob}</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{f(selected.spec1R)}</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{selected.specAvgTotalRounds}R</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.subHi, lineHeight: 1.5 }}>{selected.roundDist || "未設定"}</div>
                        </div>
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    {selected.rushDist && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.orange, lineHeight: 1.5 }}>{selected.rushDist}</div>
                            </div>
                        </div>
                    )}

                    {/* 追加スペック情報（データがある場合のみ表示） */}
                    {(selected.avgPayoutPerHit || selected.rushEntryRate || selected.prize) && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                {selected.avgPayoutPerHit > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>平均出玉/当</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.avgPayoutPerHit)}</div>
                                    </div>
                                )}
                                {selected.prize > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>賞球数</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.prize}</div>
                                    </div>
                                )}
                                {selected.unitCost > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>回転単価</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.unitCost}</div>
                                    </div>
                                )}
                            </div>
                            {(selected.rushEntryRate || selected.rushContinueRate) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                    {selected.rushEntryRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH突入率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushEntryRate}%</div>
                                        </div>
                                    )}
                                    {selected.rushContinueRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH継続率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushContinueRate}%</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {(selected.rushAvgPayout || selected.stdDev) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    {selected.rushAvgPayout > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH平均出玉</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.rushAvgPayout)}</div>
                                        </div>
                                    )}
                                    {selected.stdDev > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>標準偏差</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{f(selected.stdDev)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ボーダー表（データがある場合のみ） */}
                {borderKeys.length > 0 && (
                    <Card style={{ overflow: "hidden", marginBottom: 12 }}>
                        <SecLabel label="交換率別ボーダー" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 16px 6px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>交換率</span>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, textAlign: "right" }}>ボーダー (回/K)</span>
                        </div>
                        {borderKeys.map(key => (
                            <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 13, color: C.text }}>{key}円</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono, textAlign: "right" }}>{selected.border[key]}</span>
                            </div>
                        ))}
                    </Card>
                )}

                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} bg={C.blue} fg="#fff" bd="none" />

                {/* カスタム機種の場合は編集・削除ボタンを表示 */}
                {selected.isCustom && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn label="編集" onClick={() => { setSelected(null); openMachineForm(selected); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        <Btn label="削除" onClick={() => deleteMachine(selected)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                    </div>
                )}
            </div>
        );
    }

    // Machine form view (新規登録/編集)
    if (showMachineForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineForm(false); setEditingMachine(null); setFormData(emptyMachine); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingMachine ? "機種を編集" : "新規機種登録"}
                    </div>

                    {/* 機種名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>機種名 *</div>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例: 大海物語5"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* メーカー */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メーカー</div>
                        <input type="text" value={formData.maker} onChange={e => setFormData({ ...formData, maker: e.target.value })}
                            placeholder="例: 三洋"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* タイプ */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>タイプ</div>
                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }}>
                            <option value="ミドル">ミドル</option>
                            <option value="ハイミドル">ハイミドル</option>
                            <option value="ライトミドル">ライトミドル</option>
                            <option value="甘デジ">甘デジ</option>
                            <option value="遊パチ">遊パチ</option>
                        </select>
                    </div>

                    {/* 確率表記 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>大当たり確率（表記用）</div>
                        <input type="text" value={formData.prob} onChange={e => setFormData({ ...formData, prob: e.target.value })}
                            placeholder="例: 1/319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確率分母 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>合成確率分母</div>
                        <input type="number" value={formData.synthProb} onChange={e => setFormData({ ...formData, synthProb: e.target.value })}
                            placeholder="319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 1R出玉 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                        <input type="number" value={formData.spec1R} onChange={e => setFormData({ ...formData, spec1R: e.target.value })}
                            placeholder="140"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 平均総R */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                        <input type="number" value={formData.specAvgTotalRounds} onChange={e => setFormData({ ...formData, specAvgTotalRounds: e.target.value })}
                            placeholder="30"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* サポ増減 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>サポ増減/初当たり</div>
                        <input type="number" value={formData.specSapo} onChange={e => setFormData({ ...formData, specSapo: e.target.value })}
                            placeholder="0"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* ラウンド振り分け */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                        <input type="text" value={formData.roundDist} onChange={e => setFormData({ ...formData, roundDist: e.target.value })}
                            placeholder="例: 4R:50%, 10R:50%"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                        <input type="text" value={formData.rushDist || ""} onChange={e => setFormData({ ...formData, rushDist: e.target.value })}
                            placeholder="例: 10R:100%（未設定時は初当たり振り分けを使用）"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    <Btn label={editingMachine ? "更新" : "登録"} onClick={saveMachine} bg={C.blue} fg="#fff" bd="none" disabled={!formData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Machine search view
    if (showMachineSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowMachineSearch(false); setQuery(""); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openMachineForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700
                    }}>+ 機種を登録</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="機種名・メーカーで検索..."
                        style={{
                            width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font,
                            outline: "none",
                        }}
                    />
                </div>

                {/* CSV インポート/エクスポート */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportMachinesCSV} style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600
                    }}>CSVエクスポート</button>
                    <label style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600,
                        textAlign: "center", cursor: "pointer"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv" onChange={importMachinesCSV} style={{ display: "none" }} />
                    </label>
                </div>

                {results.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>該当する機種がありません</div>
                ) : (
                    results.map((m, i) => (
                        <button key={m.isCustom ? `custom-${m.id}` : `db-${i}`} className="b" onClick={() => setSelected(m)} style={{
                            width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                            border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
                            display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                            textAlign: "left",
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                                    {m.name}
                                    {m.isCustom && <span style={{ fontSize: 9, background: C.teal, color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>カスタム</span>}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub }}>{m.maker || "-"} | {m.type || "-"}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{m.prob || `1/${m.synthProb}`}</div>
                                <div style={{ fontSize: 9, color: C.sub }}>1R: {f(m.spec1R)}玉</div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        );
    }

    // Normal settings view
    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* テーマ設定 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="テーマ設定" />
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button
                        className="b"
                        onClick={() => s.setTheme("dark")}
                        style={{
                            flex: 1,
                            padding: "16px 12px",
                            borderRadius: 12,
                            border: s.theme === "dark" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme === "dark" ? "linear-gradient(135deg, #1a1a24, #252532)" : C.surface,
                            cursor: "pointer",
                            transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                        }}
                    >
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🌙</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.theme === "dark" ? C.blue : C.text }}>ダーク</div>
                        <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>Dark Mode</div>
                    </button>
                    <button
                        className="b"
                        onClick={() => s.setTheme("light")}
                        style={{
                            flex: 1,
                            padding: "16px 12px",
                            borderRadius: 12,
                            border: s.theme === "light" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme === "light" ? "linear-gradient(135deg, #e8f0fe, #f5f7fa)" : C.surface,
                            cursor: "pointer",
                            transition: "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                        }}
                    >
                        <div style={{ fontSize: 24, marginBottom: 8 }}>☀️</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.theme === "light" ? C.blue : C.text }}>ホワイト</div>
                        <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>Light Mode</div>
                    </button>
                </div>
            </Card>

            {/* 機種検索・登録 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="機種検索・登録" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.6, padding: "0 4px" }}>
                    機種を検索して確率・スペックを自動設定、またはオリジナル機種を登録できます。
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <Btn label="機種を検索" onClick={() => setShowMachineSearch(true)} primary small />
                    <Btn label="+ 機種を登録" onClick={() => openMachineForm()} bg={C.teal} fg="#fff" bd="none" small />
                </div>
            </Card>

            {/* 店舗登録 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="店舗検索・登録" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.6, padding: "0 4px" }}>
                    よく行く店舗を登録すると、記録時に選択でき、貸し玉・交換率・貯玉も自動設定できます。
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                    <Btn label="店舗を検索" onClick={() => setShowStoreSearch(true)} primary small />
                    <Btn label="+ 店舗を登録" onClick={() => openStoreForm()} bg={C.teal} fg="#fff" bd="none" small />
                </div>
            </Card>

            {/* 貯玉設定 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="貯玉設定" color={C.purple} />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.6, padding: "0 4px" }}>
                    貯玉を使った稼働時の収支計算方法を設定します。
                </div>

                {/* 貯玉を収支に含める */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>貯玉を収支に含める</div>
                        <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>OFFの場合、貯玉使用分は投資額0円として計算</div>
                    </div>
                    <button
                        className="b"
                        onClick={() => s.setIncludeChodamaInBalance(!s.includeChodamaInBalance)}
                        style={{
                            width: 52,
                            height: 28,
                            borderRadius: 14,
                            border: "none",
                            background: s.includeChodamaInBalance ? C.purple : "rgba(255,255,255,0.1)",
                            position: "relative",
                            transition: "background 0.2s ease",
                        }}
                    >
                        <div style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            background: "#fff",
                            position: "absolute",
                            top: 3,
                            left: s.includeChodamaInBalance ? 27 : 3,
                            transition: "left 0.2s ease",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }} />
                    </button>
                </div>

                {/* 再プレイ上限 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                    <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>1日の再プレイ上限</div>
                        <div style={{ fontSize: 10, color: C.sub, marginTop: 2 }}>上限到達時に警告を表示します</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <NI v={s.chodamaReplayLimit} set={s.setChodamaReplayLimit} w={80} center />
                        <span style={{ fontSize: 10, color: C.sub, minWidth: 20 }}>玉</span>
                    </div>
                </div>
            </Card>

            <Card>
                <SecLabel label="基本設定" />
                {/* 貸玉100円 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>貸玉100円</div>
                        <div style={{ fontSize: 10, color: C.sub }}>{(100 / ((s.rentBalls || 250) / 10)).toFixed(2)}円/玉</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <NI v={Math.round((s.rentBalls || 250) / 10)} set={(v) => s.setRentBalls(v * 10)} w={80} center />
                        <span style={{ fontSize: 10, color: C.sub, minWidth: 40 }}>玉/100円</span>
                    </div>
                </div>
                {/* 交換100円 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", borderBottom: `1px solid ${C.border}` }}>
                    <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>交換100円</div>
                        <div style={{ fontSize: 10, color: C.sub }}>{(100 / ((s.exRate || 250) / 10)).toFixed(2)}円/玉</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <NI v={Math.round((s.exRate || 250) / 10)} set={(v) => s.setExRate(v * 10)} w={80} center />
                        <span style={{ fontSize: 10, color: C.sub, minWidth: 40 }}>玉/100円</span>
                    </div>
                </div>
                {/* 交換レートプリセット */}
                <div style={{ display: "flex", gap: 6, padding: "12px 16px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                    {[
                        { label: "等価", balls: 25, yen: "4.00" },
                        { label: "3.57円", balls: 28, yen: "3.57" },
                        { label: "3.33円", balls: 30, yen: "3.33" },
                        { label: "3.03円", balls: 33, yen: "3.03" },
                    ].map(({ label, balls, yen }) => {
                        const isActive = Math.round((s.exRate || 250) / 10) === balls;
                        return (
                            <button
                                key={yen}
                                className="b"
                                onClick={() => s.setExRate(balls * 10)}
                                style={{
                                    background: isActive ? C.blue : C.surfaceHi,
                                    border: `1px solid ${isActive ? C.blue : C.borderHi}`,
                                    borderRadius: 8,
                                    color: isActive ? "#fff" : C.text,
                                    fontSize: 11,
                                    padding: "8px 12px",
                                    fontFamily: font,
                                    fontWeight: isActive ? 700 : 500,
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                {/* その他の設定 */}
                {[
                    { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom, unit: "1/x" },
                    { lbl: "1h消化回転数", v: s.rotPerHour, set: s.setRotPerHour, unit: "回/h" },
                ].map(({ lbl, v, set, unit }) => (
                    <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{lbl}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <NI v={v} set={set} w={80} center />
                            <span style={{ fontSize: 10, color: C.sub, minWidth: 40 }}>{unit}</span>
                        </div>
                    </div>
                ))}
            </Card>

            {/* 機種スペック設定（P tools互換） */}
            <Card>
                <SecLabel label="機種スペック（期待値算出用）" />
                {[
                    { lbl: "1R出玉（実出玉）", v: s.spec1R, set: s.setSpec1R, unit: "玉/R" },
                    { lbl: "平均総R/初当たり", v: s.specAvgRounds, set: s.setSpecAvgRounds, unit: "R" },
                    { lbl: "サポ増減/初当たり", v: s.specSapo, set: s.setSpecSapo, unit: "玉" },
                ].map(({ lbl, v, set, unit }) => (
                    <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{lbl}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <NI v={v} set={set} w={80} center />
                            <span style={{ fontSize: 10, color: C.sub, minWidth: 40 }}>{unit}</span>
                        </div>
                    </div>
                ))}
                {/* 理論ボーダー表示 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(0,0,0,0.15)", borderRadius: "0 0 12px 12px" }}>
                    <div>
                        <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>理論ボーダー</div>
                        <div style={{ fontSize: 10, color: C.teal }}>{exRateLabel}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>
                        {calcBorder > 0 ? f(calcBorder, 1) : "—"}<span style={{ fontSize: 10, color: C.sub, marginLeft: 4 }}>回/K</span>
                    </div>
                </div>
            </Card>

            <div style={{ padding: "0 4px" }}>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                    以下のボタンを押すと、現在のセッションデータ（回転数、獲得出玉、履歴など）がすべて消去されます。設定値は保持されます。
                </div>

                {!confirming ? (
                    <Btn label="データをリセット" onClick={() => setConfirming(true)} bg="linear-gradient(135deg, #180808, #2d1010)" fg={C.red} bd={C.red + "40"} />
                ) : (
                    <div style={{ display: "flex", gap: 10 }}>
                        <Btn label="本当にリセットしますか？" onClick={() => { onReset(); setConfirming(false); }} bg={C.red} fg="#fff" bd="none" />
                        <Btn label="キャンセル" onClick={() => setConfirming(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    </div>
                )}
            </div>
        </div>
    );
}
