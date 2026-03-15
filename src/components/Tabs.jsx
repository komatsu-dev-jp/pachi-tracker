import React, { useState, useEffect, useRef, useMemo } from "react";
import { C, f, sc, sp, tsNow, font, mono } from "../constants";
import { NI, Card, MiniStat, Btn, SecLabel, KV, ModeToggle } from "./Atoms";
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
                {ev.measuredBorder > 0 && stat("実測ボーダー", f(ev.measuredBorder, 1), "回/K", C.teal)}
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
                {stat("サポ増減/初当たり", ev.jpCount > 0 ? sp(ev.sapoPerJP, 0) : "—", "玉", sc(ev.sapoPerJP))}
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
   RotTab — 回転数入力 + リアルタイム実測統計パネル
================================================================ */
export function RotTab({ border: displayBorder, rows, setRows, S, ev }) {
    // 回転色判定にはEVで使用しているボーダーを優先
    const border = ev.useBorder > 0 ? ev.useBorder : displayBorder;
    const [input, setInput] = useState("");
    const [showHitModal, setShowHitModal] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [trayBalls, setTrayBalls] = useState("");
    const [showStoreDD, setShowStoreDD] = useState(false);
    const tableRef = useRef(null);

    useEffect(() => {
        if (tableRef.current) tableRef.current.scrollTop = tableRef.current.scrollHeight;
    }, [rows]);

    const dataRows = rows.filter((r) => r.type === "data");
    const last = dataRows[dataRows.length - 1];

    const rotCol = (v) => {
        if (v == null || isNaN(v)) return C.text;
        if (v >= border + 3) return C.green;
        if (v >= border) return "#86efac";
        if (v >= border - 3) return C.yellow;
        return C.red;
    };

    const decide = () => {
        const val = Number(input);
        if (!input || isNaN(val) || val < 0) return;

        const prevCumRot = last ? last.cumRot : S.startRot;
        const thisRot = val - prevCumRot;
        const newInvest = (last ? last.invest : 0) + 1000;
        const newAvg = parseFloat(((val - S.startRot) / (newInvest / 1000)).toFixed(1));

        setRows((r) => [...r, { type: "data", thisRot, cumRot: val, avgRot: newAvg, invest: newInvest, mode: S.playMode }]);
        S.pushLog({ type: "1K決定", time: tsNow(), rot: thisRot, cash: 1000, mode: S.playMode });
        setInput("");
    };

    const doStart = () => {
        const val = Number(input);
        if (!input || isNaN(val) || val < 0) return;

        S.setStartRot(val);
        setRows((r) => [...r, { type: "start", cumRot: val }]);
        S.pushLog({ type: "スタート", time: tsNow(), rot: val });
        setInput("");
    };

    const handleHitSubmit = () => {
        const tray = Number(trayBalls) || 0;
        S.setTotalTrayBalls((p) => p + tray);
        S.pushJP({
            chainId: Date.now(),
            trayBalls: tray,
            hits: [],
            finalBalls: null,
            summary: null,
            completed: false,
            time: tsNow(),
        });
        S.pushLog({ type: "初当たり", time: tsNow(), tray });
        setShowHitModal(false);
        setTrayBalls("");
        S.setTab("history");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Table Header */}
            <div style={{ display: "grid", gridTemplateColumns: "55px 1fr 1fr 1fr 70px", background: "linear-gradient(to right, #f97316, #ea580c)", padding: "12px 4px", flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                {["種別", "総回転数", "今回", "平均", "投資額"].map((h) => (
                    <div key={h} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "#fff", fontFamily: font, letterSpacing: 1 }}>{h}</div>
                ))}
            </div>

            {/* Data Rows */}
            <div ref={tableRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingBottom: 10 }}>
                {rows.length === 0 && (
                    <div style={{ textAlign: "center", color: C.sub, fontSize: 13, padding: "80px 16px", fontFamily: font, opacity: 0.6 }}>
                        開始回転数を入力して「スタート」を押してください
                    </div>
                )}
                {rows.map((row, i) => {
                    const isMochi = row.mode === "mochi";
                    const badgeColor = isMochi ? C.orange : C.blue;
                    const badgeLabel = isMochi ? "持" : "現";
                    if (row.type === "start") return (
                        <div key={i} className="fin" style={{ display: "grid", gridTemplateColumns: "55px 1fr 1fr 1fr 70px", padding: "12px 4px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeColor + "20", borderRadius: 6, padding: "3px 7px", border: `1px solid ${badgeColor}40` }}>{badgeLabel}</span></div>
                            <div style={{ textAlign: "center", fontSize: 14, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                            <div style={{ textAlign: "center", fontSize: 11, color: C.sub }}>—</div>
                            <div style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: C.yellow, letterSpacing: 2 }}>START</div>
                            <div style={{ textAlign: "center", fontSize: 11, color: C.sub }}>—</div>
                        </div>
                    );
                    return (
                        <div key={i} className="fin" style={{ display: "grid", gridTemplateColumns: "55px 1fr 1fr 1fr 70px", padding: "14px 4px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)", borderBottom: `1px solid ${C.border}` }}>
                            <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: badgeColor, background: badgeColor + "20", borderRadius: 6, padding: "3px 7px", border: `1px solid ${badgeColor}40` }}>{badgeLabel}</span></div>
                            <div style={{ textAlign: "center", fontSize: 14, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: rotCol(row.thisRot), fontFamily: mono }}>{row.thisRot}</div>
                            <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, color: rotCol(row.avgRot), fontFamily: mono }}>{row.avgRot}</div>
                            <div style={{ textAlign: "center", fontSize: 12, color: C.sub, fontFamily: mono }}>{f(row.invest)}円</div>
                        </div>
                    );
                })}
            </div>

            {/* Bottom Panel */}
            <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, flexShrink: 0, paddingBottom: "calc(80px + env(safe-area-inset-bottom))", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)", borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                {/* Store & Machine Number — pre-session setup */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 12px 6px" }}>
                    <div style={{ position: "relative" }}>
                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>店舗</div>
                        <div style={{ position: "relative" }}>
                            <input type="text" value={S.storeName || ""} onChange={e => S.setStoreName(e.target.value)} placeholder="店舗名"
                                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "8px 28px 8px 10px", fontSize: 12, color: C.text, fontFamily: font, outline: "none" }} />
                            {(S.stores || []).length > 0 && (
                                <button className="b" onClick={() => setShowStoreDD(!showStoreDD)} style={{
                                    position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)",
                                    background: "transparent", border: "none", color: C.sub, fontSize: 12, padding: "2px 4px", cursor: "pointer"
                                }}>▼</button>
                            )}
                            {showStoreDD && (S.stores || []).length > 0 && (
                                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, zIndex: 10, maxHeight: 120, overflowY: "auto", marginTop: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                                    {(S.stores || []).map((st, i) => (
                                        <button key={i} className="b" onClick={() => { S.setStoreName(st); setShowStoreDD(false); }} style={{
                                            width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                            color: C.text, fontSize: 12, padding: "8px 10px", textAlign: "left", fontFamily: font, cursor: "pointer"
                                        }}>{st}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>台番号</div>
                        <input type="text" value={S.machineNum || ""} onChange={e => S.setMachineNum(e.target.value)} placeholder="台番号"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ModeToggle mode={S.playMode === "mochi" ? "持ち玉" : "現金"} setMode={(m) => S.setPlayMode(m === "持ち玉" ? "mochi" : "cash")} />
                        {ev.mochiRatio > 0 && (
                            <span style={{ fontSize: 10, color: C.orange, fontFamily: mono, fontWeight: 700 }}>
                                持玉{Math.round(ev.mochiRatio * 100)}%
                            </span>
                        )}
                    </div>
                    <button className="b" onClick={() => setRows((r) => r.slice(0, -1))} style={{ background: "rgba(239, 68, 68, 0.1)", border: `1px solid ${C.red}40`, borderRadius: 8, color: C.red, fontSize: 11, padding: "6px 12px", fontFamily: font, fontWeight: 700 }}>一行削除</button>
                </div>

                {/* Input */}
                <div style={{ padding: "0 12px 10px" }}>
                    <NI v={input} set={setInput} w="100%" ph="データカウンタの数値を入力" big onEnter={decide} />
                </div>

                {/* Action Buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 12px 8px" }}>
                    <Btn label="1K決定" onClick={decide} primary />
                    <Btn label="スタート" onClick={doStart} bg={C.green} fg="#fff" bd="none" />
                    <Btn label="初当たり" onClick={() => setShowHitModal(true)} bg={C.orange} fg="#fff" bd="none" />
                </div>
                {/* 台移動ボタン */}
                <div style={{ padding: "0 12px 12px" }}>
                    <button className="b" onClick={() => setShowMoveModal(true)} style={{
                        width: "100%", background: "rgba(139, 92, 246, 0.1)", border: `1px solid ${C.purple}40`,
                        borderRadius: 10, color: C.purple, fontSize: 13, fontWeight: 700, padding: "10px 0",
                        fontFamily: font, letterSpacing: 1
                    }}>台移動</button>
                </div>
            </div>

            {/* Move Modal — 台移動確認 */}
            {showMoveModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="台移動" />
                        <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                            現在のデータを自動保存して新しい台の記録を開始します。
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <Btn label="移動する" onClick={() => { setShowMoveModal(false); S.handleMoveTable(); }} bg={C.purple} fg="#fff" bd="none" />
                            <Btn label="キャンセル" onClick={() => setShowMoveModal(false)} />
                        </div>
                    </Card>
                </div>
            )}

            {/* Hit Modal — 初当たり時の上皿玉数入力 */}
            {showHitModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="初当たり入力" />
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>上皿の残り玉数を入力してください</div>
                            <NI v={trayBalls} set={setTrayBalls} w="100%" big center ph="0〜125" />
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <Btn label="決定" onClick={handleHitSubmit} primary />
                            <Btn label="キャンセル" onClick={() => setShowHitModal(false)} />
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}

/* ================================================================
   HistoryTab — 大当たり履歴（チェーンベース連チャン記録）
================================================================ */
export function HistoryTab({ jpLog, sesLog, pushJP, delJPLast, delSesLast, S, ev }) {
    const [sub, setSub] = useState("jp");

    // 連チャン入力 state
    const [iSapoRot, setISapoRot] = useState("");
    const [iRounds, setIRounds] = useState("");
    const [iDisplayBalls, setIDisplayBalls] = useState("");
    const [iActualBalls, setIActualBalls] = useState("");

    // 最新の未完了チェーンがあるか
    const lastChain = jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    const isChainActive = lastChain && !lastChain.completed;

    const clearInputs = () => {
        setISapoRot("");
        setIRounds("");
        setIDisplayBalls("");
        setIActualBalls("");
    };

    // 連チャン追加: チェーンにヒットを追加
    const addHitToChain = () => {
        const rounds = Number(iRounds) || 0;
        if (rounds <= 0) return;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                sapoRot: Number(iSapoRot) || 0,
                rounds,
                displayBalls: Number(iDisplayBalls) || 0,
                actualBalls: Number(iActualBalls) || 0,
                time: tsNow(),
            }];
            updated[updated.length - 1] = chain;
            return updated;
        });
        S.pushLog({ type: "連チャン追加", time: tsNow(), rounds: Number(iRounds) || 0 });
        clearInputs();
    };

    // 最終大当たり終了: 最後のヒットを追加してチェーン完了
    const handleChainEnd = () => {
        if (!isChainActive) return;

        const rounds = Number(iRounds) || 0;
        const currentHitsCount = lastChain.hits.length;

        // ヒットが0かつ新規入力もない場合は終了できない
        if (currentHitsCount === 0 && rounds <= 0) return;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            // ラウンド入力がある場合は最後のヒットを追加
            if (rounds > 0) {
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1,
                    sapoRot: Number(iSapoRot) || 0,
                    rounds,
                    displayBalls: Number(iDisplayBalls) || 0,
                    actualBalls: Number(iActualBalls) || 0,
                    time: tsNow(),
                }];
            }
            // サマリー計算
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalActualBalls = chain.hits.reduce((s, h) => s + h.actualBalls, 0);
            const finalBalls = totalActualBalls;
            const trayBalls = chain.trayBalls || 0;

            chain.finalBalls = finalBalls;
            chain.completed = true;
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalActualBalls,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: finalBalls - trayBalls - totalDisplayBalls,
                netGain: finalBalls - trayBalls,
            };
            updated[updated.length - 1] = chain;
            return updated;
        });

        S.pushLog({ type: "連チャン終了", time: tsNow() });
        clearInputs();
        // 持ち玉モードに自動切替
        S.setPlayMode("mochi");
        S.setTab("rot");
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
                                <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, marginBottom: 4 }}>連チャン中 — {lastChain.hits.length}連目まで記録済み</div>
                                <div style={{ fontSize: 10, color: C.sub }}>上皿玉: {f(lastChain.trayBalls)}玉 | {lastChain.time}</div>
                            </div>
                        )}

                        {/* Input Card — 連チャン中のみ表示 */}
                        {isChainActive ? (
                            <Card style={{ padding: 16, marginBottom: 16 }}>
                                <SecLabel label={`${lastChain.hits.length + 1}連目 入力`} />
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>電サポ回転数</div>
                                    <NI v={iSapoRot} set={setISapoRot} w="100%" center ph="0" />
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>ラウンド数(R)</div>
                                        <NI v={iRounds} set={setIRounds} w="100%" center ph="10" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>出玉(液晶)</div>
                                        <NI v={iDisplayBalls} set={setIDisplayBalls} w="100%" center ph="1500" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>実際の出玉</div>
                                        <NI v={iActualBalls} set={setIActualBalls} w="100%" center ph="1200" />
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <Btn label="連チャン追加" onClick={addHitToChain} bg={C.green} fg="#fff" bd="none" />
                                    <Btn label="最終大当たり終了" onClick={handleChainEnd} bg={C.orange} fg="#fff" bd="none" />
                                </div>
                            </Card>
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
                                    { label: "サポ増減/回", val: ev.jpCount > 0 ? sp(ev.sapoPerJP, 1) : "—", unit: "玉", col: sc(ev.sapoPerJP) },
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
                                <Card key={chain.chainId || ci} style={{ padding: "12px 16px", background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "rgba(255,255,255,0.02)" }}>
                                    {/* Chain Header */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>
                                            {!chain.completed ? "連チャン中" : `第${jpLog.length - ci}初当たり — ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連"}`}
                                        </span>
                                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                    </div>

                                    {/* Individual Hits */}
                                    {chain.hits.map((hit, hi) => (
                                        <div key={hi} style={{ padding: "6px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow }}>{hit.hitNumber}連目</span>
                                                <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{hit.time}</span>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.sapoRot || hit.sapoCount || 0}回</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>実出玉</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: mono }}>{f(hit.actualBalls)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Chain Summary (completed only) */}
                                    {chain.completed && chain.summary && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 4 }}>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 8, color: C.sub }}>1R出玉</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}発</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 8, color: C.sub }}>サポ増減</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}発</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 8, color: C.sub }}>純増出玉</div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}発</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                {f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {chain.summary.sapoDelta >= 0 ? "+" : ""}{f(chain.summary.sapoDelta)} = {f(Math.round(chain.summary.avg1R * chain.summary.totalRounds + chain.summary.sapoDelta))}
                                            </div>
                                        </div>
                                    )}

                                    {!chain.completed && chain.hits.length === 0 && (
                                        <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                    )}
                                </Card>
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

    const textInput = (val, set, placeholder) => (
        <input type="text" value={val || ""} onChange={e => set(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
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

    // ── Detail View for a specific archive ──
    if (selectedArchiveId) {
        const a = archives.find(ar => ar.id === selectedArchiveId);
        if (!a) { setSelectedArchiveId(null); return null; }
        const st = a.stats || {};
        const pl = (a.investYen > 0 || a.recoveryYen > 0) ? (a.recoveryYen || 0) - (a.investYen || 0) : null;
        const aggKey = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
        const agg = a.machineNum ? machineAggregates[aggKey] : null;

        // Editable state for this archive
        const [editStore, setEditStore] = useState(a.storeName || "");
        const [editMachineNum, setEditMachineNum] = useState(a.machineNum || "");
        const [editInvest, setEditInvest] = useState(a.investYen || "");
        const [editRecovery, setEditRecovery] = useState(a.recoveryYen || "");
        const [showEditStoreDD, setShowEditStoreDD] = useState(false);

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
                                            {storeList.map((st, i) => (
                                                <button key={i} className="b" onClick={() => { setEditStore(st); setShowEditStoreDD(false); }} style={{
                                                    width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                    color: C.text, fontSize: 13, padding: "10px 12px", textAlign: "left", fontFamily: font, cursor: "pointer"
                                                }}>{st}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>台番号</div>
                                {textInput(editMachineNum, setEditMachineNum, "台番号")}
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
                            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr 55px", background: "rgba(249,115,22,0.12)", padding: "5px 4px" }}>
                                {["種別", "総回転", "今回", "平均", "投資"].map(h => (
                                    <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.sub }}>{h}</div>
                                ))}
                            </div>
                            {a.rotRows.map((row, i) => {
                                const isMochi = row.mode === "mochi";
                                const badgeCol = isMochi ? C.orange : C.blue;
                                const badge = isMochi ? "持" : "現";
                                return (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 1fr 55px", padding: "5px 4px", borderBottom: `1px solid ${C.border}` }}>
                                        <div style={{ textAlign: "center" }}>
                                            <span style={{ fontSize: 8, fontWeight: 700, color: badgeCol, background: badgeCol + "20", borderRadius: 4, padding: "1px 4px" }}>{badge}</span>
                                        </div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.type === "start" ? "START" : row.thisRot}</div>
                                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.avgRot || "—"}</div>
                                        <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{row.invest ? f(row.invest) : "—"}</div>
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
                                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>第{ci + 1}初当たり — {(chain.hits?.length || 0) <= 1 ? "単発" : (chain.hits?.length || 0) + "連"}</span>
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
                                            <span style={{ fontSize: 10, color: sc(chain.summary.sapoDelta) }}>サポ: {sp(chain.summary.sapoDelta, 0)}発</span>
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(monthTotal), fontFamily: mono, marginTop: 1 }}>
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
                            <div style={{ fontSize: 13, fontWeight: isToday(day) ? 800 : 500, color: dow === 0 ? C.red : dow === 6 ? C.blue : C.text, lineHeight: 1 }}>{day}</div>
                            {hasData && (
                                <div style={{ fontSize: 8, fontWeight: 700, color: sc(total), fontFamily: mono, marginTop: 3, lineHeight: 1 }}>
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
                                <div style={{ fontSize: 14, fontWeight: 700, color: sc(dayTotal), fontFamily: mono }}>
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

                        {/* Archive entries — reference app style summary cards */}
                        {dateArchives.length > 0 ? dateArchives.map(a => (
                            <SummaryCard key={a.id} a={a} onClick={() => setSelectedArchiveId(a.id)} />
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
    const results = searchMachines(query);
    const [newStore, setNewStore] = useState("");

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

    // Machine detail view
    if (selected) {
        const borderKeys = Object.keys(selected.border).sort((a, b) => Number(b) - Number(a));
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

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{selected.specAvgTotalRounds}R</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>ラウンド振り分け</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.subHi, lineHeight: 1.5 }}>{selected.roundDist}</div>
                        </div>
                    </div>
                </Card>

                {/* ボーダー表 */}
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

                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} bg={C.blue} fg="#fff" bd="none" />
            </div>
        );
    }

    // Machine search view
    if (showMachineSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineSearch(false); setQuery(""); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 設定に戻る</button>

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

                {results.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>該当する機種がありません</div>
                ) : (
                    results.map((m, i) => (
                        <button key={i} className="b" onClick={() => setSelected(m)} style={{
                            width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                            border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
                            display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                            textAlign: "left",
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{m.name}</div>
                                <div style={{ fontSize: 10, color: C.sub }}>{m.maker} | {m.type}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{m.prob}</div>
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
            {/* 機種検索ボタン */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="機種検索" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.6, padding: "0 4px" }}>
                    機種を検索して確率・スペックを自動設定できます。
                </div>
                <Btn label="機種を検索する" onClick={() => setShowMachineSearch(true)} primary />
            </Card>

            {/* 店舗登録 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="店舗登録" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 10, lineHeight: 1.6, padding: "0 4px" }}>
                    よく行く店舗を登録すると、記録時に選択できます。
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <input type="text" value={newStore} onChange={e => setNewStore(e.target.value)} placeholder="店舗名を入力"
                        style={{ flex: 1, background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }}
                        onFocus={e => e.target.style.borderColor = "var(--blue)"}
                        onBlur={e => e.target.style.borderColor = "var(--border-hi)"} />
                    <button className="b" onClick={() => {
                        if (newStore.trim() && !(s.stores || []).includes(newStore.trim())) {
                            s.setStores((prev) => [...(prev || []), newStore.trim()]);
                            setNewStore("");
                        }
                    }} style={{ background: C.blue, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, padding: "0 16px", fontFamily: font }}>追加</button>
                </div>
                {(s.stores || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(s.stores || []).map((st, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "6px 10px" }}>
                                <span style={{ fontSize: 12, color: C.text }}>{st}</span>
                                <button className="b" onClick={() => s.setStores((prev) => prev.filter((_, j) => j !== i))} style={{
                                    background: "transparent", border: "none", color: C.red, fontSize: 14, padding: 0, lineHeight: 1, cursor: "pointer"
                                }}>×</button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card>
                <SecLabel label="基本設定" />
                {[
                    { lbl: "貸し玉個数", v: s.rentBalls, set: s.setRentBalls, unit: "玉/1K" },
                    { lbl: "交換率", v: s.exRate, set: s.setExRate, unit: "玉/1K" },
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
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>理論ボーダー</div>
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
