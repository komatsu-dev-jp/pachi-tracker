import React, { useState } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, sp, tsNow, font, mono } from "../../constants";
import { Card, Btn, SecLabel, NI } from "../Atoms";

export function HistoryTab({ jpLog, sesLog, delJPLast, delSesLast, S, ev }) {
    const [sub, setSub] = useState("jp");
    const [swipingId, setSwipingId] = useState(null);
    const [swipeX, setSwipeX] = useState(0);
    const [swipeDirection, setSwipeDirection] = useState(null);
    const startX = React.useRef(0);
    const startY = React.useRef(0);

    const lastChain = jpLog[jpLog.length - 1];
    const isChainActive = lastChain && !lastChain.completed;

    // --- 連チャン追加用ウィザードのステート ---
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardData, setChainWizardData] = useState({
        rounds: "",
        displayBalls: "",
        elecSapoRot: "",
        lastOutBalls: "",
        nextTimingBalls: "",
        jitanSpins: "",
        finalBallsAfterJitan: "",
    });
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true);

    // --- 連チャンを伴わない単発終了用のステート ---
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0);
    const [directSingleEndData, setDirectSingleEndData] = useState({
        jitanSpins: "",
        finalBallsAfterJitan: "",
    });

    const machineRushRounds = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16];

    const handleSwipeStart = (e, id) => {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        setSwipingId(id);
        setSwipeX(0);
        setSwipeDirection(null);
    };

    const handleSwipeMove = (e) => {
        if (!swipingId) return;
        const dx = startX.current - e.touches[0].clientX;
        const dy = startY.current - e.touches[0].clientY;

        if (!swipeDirection) {
            if (Math.abs(dx) > 10) setSwipeDirection("horizontal");
            else if (Math.abs(dy) > 10) setSwipeDirection("vertical");
            return;
        }

        if (swipeDirection === "horizontal") {
            if (dx > 0) setSwipeX(Math.min(dx, 100));
            else setSwipeX(0);
        }
    };

    const handleSwipeEnd = (id) => {
        if (swipeX > 60) {
            if (window.confirm("この履歴を削除しますか？")) {
                S.setJpLog(jpLog.filter(c => c.chainId !== id));
            }
        }
        setSwipingId(null);
        setSwipeX(0);
        setSwipeDirection(null);
    };

    const clearChainWizard = () => {
        setChainWizardData({
            rounds: "",
            displayBalls: "",
            elecSapoRot: "",
            lastOutBalls: "",
            nextTimingBalls: "",
            jitanSpins: "",
            finalBallsAfterJitan: "",
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
    };

    const getPrevEndBalls = () => {
        if (!lastChain) return 0;
        if (lastChain.hits.length === 0) return 0;
        return lastChain.hits[lastChain.hits.length - 1].nextTimingBalls;
    };

    const openChainWizard = () => {
        if (!isChainActive) return;
        const prevEnd = getPrevEndBalls();
        setChainWizardData(prev => ({
            ...prev,
            lastOutBalls: prevEnd > 0 ? String(prevEnd) : "",
        }));
        setChainWizardStep(0);
        setChainWizardOpen(true);
    };

    const handleChainWizardComplete = (isFinal = false) => {
        const rnd = Number(chainWizardData.rounds) || 0;
        const disp = Number(chainWizardData.displayBalls) || 0;
        const elecRot = Number(chainWizardData.elecSapoRot) || 0;
        const lastOut = Number(chainWizardData.lastOutBalls) || 0;
        const nextTiming = Number(chainWizardData.nextTimingBalls) || 0;
        const sapoChange = nextTiming - lastOut - disp;
        const perRot = elecRot > 0 ? sapoChange / elecRot : 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                rounds: rnd,
                displayBalls: disp,
                elecSapoRot: elecRot,
                lastOutBalls: lastOut,
                nextTimingBalls: nextTiming,
                sapoChange,
                sapoPerRot: perRot,
                time: tsNow(),
            }];

            if (isFinal) {
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                const totalSapoRot = chain.hits.reduce((s, h) => s + h.elecSapoRot, 0);
                const totalSapoChange = chain.hits.reduce((s, h) => s + h.sapoChange, 0);

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
            }
            updated[updated.length - 1] = chain;
            return updated;
        });

        if (isFinal) {
            const totalChainGain = (lastChain.trayBalls || 0) +
                lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0) +
                (disp + sapoChange);
            S.setCurrentMochiBalls((prev) => prev + totalChainGain);
            S.pushLog({ type: "連チャン終了", time: tsNow() });
            S.setPlayMode("mochi");
            S.setTab("rot");
            S.setShowStartPrompt(true);
        }

        setChainWizardOpen(false);
        clearChainWizard();
    };

    const handleChainWizardSingleEnd = () => {
        const rnd = Number(chainWizardData.rounds) || 0;
        const disp = Number(chainWizardData.displayBalls) || 0;
        const elecRot = Number(chainWizardData.elecSapoRot) || 0;
        const lastOut = Number(chainWizardData.lastOutBalls) || 0;
        const nextTiming = Number(chainWizardData.nextTimingBalls) || 0;
        const sapoChange = nextTiming - lastOut - disp;
        const perRot = elecRot > 0 ? sapoChange / elecRot : 0;
        const jitan = Number(chainWizardData.jitanSpins) || 0;
        const finalBalls = Number(chainWizardData.finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                rounds: rnd,
                displayBalls: disp,
                elecSapoRot: elecRot,
                lastOutBalls: lastOut,
                nextTimingBalls: nextTiming,
                sapoChange,
                sapoPerRot: perRot,
                time: tsNow(),
            }];
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;

            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + h.elecSapoRot, 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + h.sapoChange, 0);

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

        const currentChain = jpLog[jpLog.length - 1];
        const existingTotal = (currentChain?.trayBalls || 0) +
            (currentChain?.hits || []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal + disp + sapoChange;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setTab("rot");
        S.setShowStartPrompt(true);

        setChainWizardOpen(false);
        clearChainWizard();
    };

    const openDirectSingleEnd = () => {
        if (!isChainActive || lastChain.hits.length === 0) return;
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setDirectSingleEndStep(0);
        setDirectSingleEndOpen(true);
    };

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

        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setTab("rot");
        S.setShowStartPrompt(true);

        setDirectSingleEndOpen(false);
    };

    const handleChainEnd = () => {
        if (!isChainActive) return;
        if (lastChain.hits.length === 0) return;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.completed = true;

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
                netGain: totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        S.setCurrentMochiBalls((prev) => prev + existingTotal);
        S.pushLog({ type: "連チャン終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setTab("rot");
        S.setShowStartPrompt(true);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

                        {isChainActive ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                <button className="b" onClick={openChainWizard} style={{ padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(16,185,129,0.4)" }}>連チャン追加</button>
                                <button className="b" onClick={openDirectSingleEnd} disabled={lastChain.hits.length === 0} style={{ padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14, background: lastChain.hits.length === 0 ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", boxShadow: lastChain.hits.length === 0 ? "none" : "0 4px 16px rgba(99,102,241,0.4)", opacity: lastChain.hits.length === 0 ? 0.5 : 1 }}>単発終了</button>
                                <button className="b" onClick={handleChainEnd} style={{ padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>大当り終了</button>
                            </div>
                        ) : (
                            <Card style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>回転数タブの「初当たり」ボタンから<br />チェーンを開始してください</div>
                            </Card>
                        )}

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

                        {jpLog.length === 0 ? (
                            <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                        ) : (
                            [...jpLog].reverse().map((chain, ci) => (
                                <div key={chain.chainId || ci} style={{ position: "relative", overflow: "hidden", marginBottom: 12 }} onTouchStart={(e) => handleSwipeStart(e, chain.chainId)} onTouchMove={handleSwipeMove} onTouchEnd={() => handleSwipeEnd(chain.chainId)}>
                                    {swipingId === chain.chainId && swipeDirection === "horizontal" && swipeX > 0 && (
                                        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, borderRadius: "0 12px 12px 0" }}>削除</div>
                                    )}
                                    <Card style={{ padding: "12px 16px", background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "rgba(255,255,255,0.02)", transform: swipingId === chain.chainId ? `translateX(-${swipeX}px)` : "translateX(0)", transition: swipingId === chain.chainId ? "none" : "transform 0.2s ease" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>{!chain.completed ? "連チャン中" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}</span>
                                            <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                        </div>
                                        {chain.hitRot > 0 && (
                                            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                                <span style={{ fontSize: 10, color: C.sub }}>総回転: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitRot)}</span></span>
                                                {chain.hitThisRot > 0 && <span style={{ fontSize: 10, color: C.sub }}>ハマり: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitThisRot)}</span></span>}
                                            </div>
                                        )}
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
                                                        <div><div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div><div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div></div>
                                                        <div><div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div><div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}回</div></div>
                                                        <div><div style={{ fontSize: 7, color: C.sub }}>サポ増減</div><div style={{ fontSize: 12, fontWeight: 600, color: sc(change), fontFamily: mono }}>{change >= 0 ? "+" : ""}{change}</div></div>
                                                        <div><div style={{ fontSize: 7, color: C.sub }}>サポ/回転</div><div style={{ fontSize: 12, fontWeight: 600, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {chain.completed && chain.summary && (
                                            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: C.sub }}>1R出玉</div><div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}</div></div>
                                                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: C.sub }}>サポ増減/回転</div><div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoPerRot || 0), fontFamily: mono }}>{chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}</div></div>
                                                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: C.sub }}>サポ総増減</div><div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}</div></div>
                                                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 7, color: C.sub }}>純増出玉</div><div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}</div></div>
                                                </div>
                                                <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>{f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}{f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = {f(Math.round(chain.summary.netGain))}</div>
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

            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 9999, display: "flex", flexDirection: "column", height: "100dvh", width: "100vw" }}>
                    <div style={{ padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000" }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {chainWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRushRounds.map(r => (
                                        <button key={r} className="b" onClick={() => { setChainWizardData(d => ({ ...d, rounds: r })); setChainWizardStep(1); setChainWizardFirstKey(true); }} style={{ width: 80, height: 80, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: 26, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>{r}R</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {chainWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span></div>
                            </div>
                        )}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>サポ増減 ①</div>
                                <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span></div>
                            </div>
                        )}
                        {chainWizardStep === 3 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            const isWarning = prevEndBalls > 0 && Math.abs(diff) > 500;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当たり直前</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevEndBalls > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回終了時: {f(prevEndBalls)}玉</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.lastOutBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span></div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>{[-50, -10, +10, +50].map(delta => (<button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.lastOutBalls) || 0; setChainWizardData(d => ({ ...d, lastOutBalls: String(Math.max(0, cur + delta)) })); }} style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>{delta > 0 ? "+" : ""}{delta}</button>))}</div>
                                    {prevEndBalls > 0 && <button className="b" onClick={() => setChainWizardData(d => ({ ...d, lastOutBalls: String(prevEndBalls) }))} style={{ marginTop: 12, padding: "10px 24px", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "rgba(59,130,246,0.2)", border: `1px solid ${C.blue}`, color: C.blue }}>変更なし（前回値を採用）</button>}
                                    {prevEndBalls > 0 && current > 0 && <div style={{ marginTop: 12 }}><span style={{ fontSize: 12, color: isWarning ? C.orange : C.sub }}>電サポ中の増減: <span style={{ fontWeight: 700, color: sc(diff), fontFamily: mono }}>{diff >= 0 ? "+" : ""}{diff}</span></span>{isWarning && <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>極端な変動です。入力値をご確認ください</div>}</div>}
                                </div>
                            );
                        })()}
                        {chainWizardStep === 4 && (() => {
                            const prevBalls = Number(chainWizardData.lastOutBalls) || 0;
                            const currentBalls = Number(chainWizardData.nextTimingBalls) || 0;
                            const dispBalls = Number(chainWizardData.displayBalls) || 0;
                            const sapoChange = currentBalls - prevBalls - dispBalls;
                            const rot = Number(chainWizardData.elecSapoRot) || 0;
                            const perRot = rot > 0 ? sapoChange / rot : 0;
                            const isWarning = Math.abs(perRot) > 3;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevBalls > 0 && <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当たり直前: {f(prevBalls)}玉</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.nextTimingBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span></div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>{[-50, -10, +10, +50].map(delta => (<button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.nextTimingBalls) || 0; setChainWizardData(d => ({ ...d, nextTimingBalls: String(Math.max(0, cur + delta)) })); }} style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>{delta > 0 ? "+" : ""}{delta}</button>))}</div>
                                    {(prevBalls > 0 || currentBalls > 0) && <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderRadius: 12 }}><div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center" }}><div><div style={{ fontSize: 10, color: C.sub }}>電サポ増減</div><div style={{ fontSize: 18, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>{sapoChange >= 0 ? "+" : ""}{sapoChange}</div></div>{rot > 0 && <div><div style={{ fontSize: 10, color: C.sub }}>1回転あたり</div><div style={{ fontSize: 18, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>{perRot >= 0 ? "+" : ""}{perRot.toFixed(2)}</div></div>}</div>{isWarning && <div style={{ fontSize: 11, color: C.orange, marginTop: 8 }}>極端な増減です。入力値をご確認ください</div>}</div>}
                                </div>
                            );
                        })()}
                        {chainWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>この大当たりは？</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                                    <button className="b" onClick={() => handleChainWizardComplete(false)} style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(16,185,129,0.4)" }}>連チャン継続</button>
                                    <button className="b" onClick={() => { setChainWizardStep(6); setChainWizardFirstKey(true); }} style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>単発終了</button>
                                    <button className="b" onClick={() => handleChainWizardComplete(true)} style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "linear-gradient(135deg, #f97316, #ea580c)", border: "none", color: "#fff", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>最終大当たり</button>
                                </div>
                                <button className="b" onClick={() => { setChainWizardStep(4); setChainWizardFirstKey(true); }} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}
                        {chainWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span></div>
                            </div>
                        )}
                        {chainWizardStep === 7 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{chainWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span></div>
                            </div>
                        )}
                    </div>
                    {chainWizardStep !== 0 && chainWizardStep !== 5 && (
                        <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => { if (chainWizardStep === 1) setChainWizardStep(0); else if (chainWizardStep === 6) setChainWizardStep(5); else setChainWizardStep(s => s - 1); setChainWizardFirstKey(true); }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>戻る</button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>記録完了</button>
                                ) : (
                                    <button className="b" onClick={() => { if (chainWizardStep === 3) { const lastOut = Number(chainWizardData.lastOutBalls) || 0; const disp = Number(chainWizardData.displayBalls) || 0; const suggested = lastOut + disp; if (!chainWizardData.nextTimingBalls) { setChainWizardData(d => ({ ...d, nextTimingBalls: String(suggested) })); } } setChainWizardStep(s => s + 1); setChainWizardFirstKey(true); }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>次へ</button>
                                )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                    <button key={n} className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => { if (chainWizardFirstKey) { return { ...d, [field]: String(n) }; } const current = d[field] || ""; const newVal = current === "0" ? String(n) : current + n; return { ...d, [field]: newVal }; }); setChainWizardFirstKey(false); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                                ))}
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: "" })); setChainWizardFirstKey(false); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => { if (chainWizardFirstKey) { return { ...d, [field]: "0" }; } const current = d[field] || ""; if (current === "") return d; return { ...d, [field]: current + "0" }; }); setChainWizardFirstKey(false); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); setChainWizardFirstKey(false); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

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
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{directSingleEndData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span></div>
                            </div>
                        )}
                        {directSingleEndStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>時短終了後の出玉</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>{directSingleEndData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span></div>
                            </div>
                        )}
                    </div>
                    <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => { if (directSingleEndStep === 0) setDirectSingleEndOpen(false); else setDirectSingleEndStep(0); }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "rgba(255,255,255,0.08)", border: "none", color: C.text }}>{directSingleEndStep === 0 ? "キャンセル" : "戻る"}</button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff" }}>記録完了</button>
                            ) : (
                                <button className="b" onClick={() => setDirectSingleEndStep(1)} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff" }}>次へ</button>
                            )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                <button key={n} className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => { const current = d[field] || ""; const newVal = current === "0" ? String(n) : current + n; return { ...d, [field]: newVal }; }); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                            ))}
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: "" })); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => { const current = d[field] || ""; if (current === "") return d; return { ...d, [field]: current + "0" }; }); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "rgba(255,255,255,0.1)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "rgba(255,255,255,0.1)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
