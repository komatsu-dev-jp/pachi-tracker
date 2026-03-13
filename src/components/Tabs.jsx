import React, { useState, useEffect, useRef } from "react";
import { C, f, sc, sp, tsNow, font, mono } from "../constants";
import { NI, Card, MiniStat, Btn, SecLabel, KV, ModeToggle } from "./Atoms";
import { searchMachines } from "../machineDB";

/* ================================================================
   MachineTab — 実機データ検索
================================================================ */
export function MachineTab({ S }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const results = searchMachines(query);

    const applyMachine = (m) => {
        S.setSynthDenom(m.synthProb);
        setSelected(null);
    };

    if (selected) {
        // 交換率キー一覧
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
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均1R出玉</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{f(selected.avg1R)}</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均ラウンド</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{selected.avgRound}R</div>
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

                {/* 設定に反映ボタン */}
                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} bg={C.blue} fg="#fff" bd="none" />
            </div>
        );
    }

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 検索バー */}
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

            {/* 結果一覧 */}
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
                            <div style={{ fontSize: 9, color: C.sub }}>1R: {f(m.avg1R)}玉</div>
                        </div>
                    </button>
                ))
            )}
        </div>
    );
}

/* ================================================================
   DataTab — 全データ一覧表示
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

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 回転率・ボーダー */}
            <Card style={{ marginTop: 12 }}>
                <SecLabel label="回転率・ボーダー" />
                {stat("1Kスタート", ev.start1K > 0 ? f(ev.start1K, 1) : "—", "回/K", sc(ev.bDiff))}
                {stat("実測ボーダー", ev.measuredBorder > 0 ? f(ev.measuredBorder, 1) : "—", "回/K", C.subHi)}
                {stat("ボーダー差", ev.bDiff !== 0 ? sp(ev.bDiff, 1) : "—", "回/K", sc(ev.bDiff))}
            </Card>

            {/* 期待値・収支 */}
            <Card>
                <SecLabel label={ev.evSource === "border" ? "期待値・収支（ボーダー基準）" : "期待値・収支"} />
                {stat("期待値/K", ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—", "円", sc(ev.ev1K))}
                {stat("仕事量", ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—", "円", sc(ev.workAmount))}
                {stat("時給", ev.wage !== 0 ? sp(ev.wage, 0) : "—", "円/h", sc(ev.wage))}
            </Card>

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
                {stat("持ち玉比率", ev.mochiRatio > 0 ? Math.round(ev.mochiRatio * 100).toString() : "0", "%", C.orange)}
            </Card>
        </div>
    );
}

/* ================================================================
   RotTab — 回転数入力 + リアルタイム実測統計パネル
================================================================ */
export function RotTab({ border, rows, setRows, S, ev }) {
    const [input, setInput] = useState("");
    const [showHitModal, setShowHitModal] = useState(false);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [trayBalls, setTrayBalls] = useState("");
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

    // Stats from ev engine
    const hasData = ev.jpCount > 0;

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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 8px" }}>
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
                    }}>🔄 台移動</button>
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
                                            {!chain.completed ? "連チャン中" : `第${jpLog.length - ci}初当たり — ${chain.hits.length}連`}
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
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: C.sub }}>1R出玉</div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}発</div>
                                            </div>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: C.sub }}>サポ増減</div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}発</div>
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
   SettingsTab — 設定＆リセット＆アーカイブ保存
================================================================ */
export function SettingsTab({ s, onReset }) {
    const [confirming, setConfirming] = useState(false);
    const [archiveConfirm, setArchiveConfirm] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleArchive = () => {
        const archive = {
            id: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            rotRows: s.rotRows,
            jpLog: s.jpLog,
            sesLog: s.sesLog,
            settings: {
                rentBalls: s.rentBalls, exRate: s.exRate,
                synthDenom: s.synthDenom, rotPerHour: s.rotPerHour,
                border: s.border, ballVal: s.ballVal,
            },
            stats: s.ev ? { ...s.ev } : {},
            totalTrayBalls: s.totalTrayBalls,
            startRot: s.startRot,
        };
        s.setArchives((prev) => [...prev, archive]);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleArchiveAndReset = () => {
        handleArchive();
        onReset();
        setArchiveConfirm(false);
    };

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            <Card>
                <SecLabel label="基本設定" />
                {[
                    { lbl: "貸し玉個数", v: s.rentBalls, set: s.setRentBalls, unit: "玉/1K" },
                    { lbl: "交換率", v: s.exRate, set: s.setExRate, unit: "玉/1K" },
                    { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom, unit: "1/x" },
                    { lbl: "1h消化回転数", v: s.rotPerHour, set: s.setRotPerHour, unit: "回/h" },
                    { lbl: "目標ボーダー", v: s.border, set: s.setBorder, unit: "回/K" },
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

            {/* セッション保存 */}
            <Card style={{ padding: 16 }}>
                <SecLabel label="セッション保存" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.6, padding: "0 4px" }}>
                    現在のセッションデータをアーカイブに保存します。記録タブから過去のデータを閲覧できます。
                </div>
                {saved && (
                    <div style={{ fontSize: 12, color: C.green, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>保存しました</div>
                )}
                {!archiveConfirm ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <Btn label="保存のみ" onClick={handleArchive} primary />
                        <Btn label="保存してリセット" onClick={() => setArchiveConfirm(true)} bg={C.orange} fg="#fff" bd="none" />
                    </div>
                ) : (
                    <div style={{ display: "flex", gap: 10 }}>
                        <Btn label="保存＆リセット実行" onClick={handleArchiveAndReset} bg={C.orange} fg="#fff" bd="none" />
                        <Btn label="キャンセル" onClick={() => setArchiveConfirm(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    </div>
                )}
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

/* ================================================================
   ArchiveTab — 過去の実践データ閲覧
================================================================ */
export function ArchiveTab({ S, onReset }) {
    const [selectedId, setSelectedId] = useState(null);
    const [delConfirm, setDelConfirm] = useState(null);
    const archives = S.archives || [];
    const selected = selectedId ? archives.find(a => a.id === selectedId) : null;

    const deleteArchive = (id) => {
        S.setArchives((prev) => prev.filter(a => a.id !== id));
        setDelConfirm(null);
    };

    // Detail View
    if (selected) {
        const stats = selected.stats || {};
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", flexShrink: 0 }}>
                    <button className="b" onClick={() => setSelectedId(null)} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 一覧に戻る</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 12 }}>{selected.date}</div>

                    {/* Stats Summary */}
                    <div style={{ margin: "0 0 16px", background: "rgba(0,0,0,0.2)", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                            {[
                                { label: "実測ボーダー", val: stats.measuredBorder > 0 ? f(stats.measuredBorder, 1) : "—", unit: "回/K", col: C.subHi },
                                { label: "1Kスタート", val: stats.start1K > 0 ? f(stats.start1K, 1) : "—", unit: "回/K", col: sc(stats.bDiff) },
                                { label: "期待値/K", val: stats.ev1K != null && stats.ev1K !== 0 ? sp(stats.ev1K, 0) : "—", unit: "円", col: sc(stats.ev1K) },
                            ].map(({ label, val, unit, col }, idx) => (
                                <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 2 ? `1px solid ${C.border}` : "none" }}>
                                    <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                    <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${C.border}` }}>
                            {[
                                { label: "仕事量", val: stats.workAmount != null && stats.workAmount !== 0 ? sp(stats.workAmount, 0) : "—", unit: "円", col: sc(stats.workAmount) },
                                { label: "時給", val: stats.wage != null && stats.wage !== 0 ? sp(stats.wage, 0) : "—", unit: "円/h", col: sc(stats.wage) },
                                { label: "平均1R出玉", val: stats.avg1R > 0 ? f(stats.avg1R, 1) : "—", unit: "玉", col: C.teal },
                            ].map(({ label, val, unit, col }, idx) => (
                                <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 2 ? `1px solid ${C.border}` : "none" }}>
                                    <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                    <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rotation Rows (Read-Only) */}
                    {selected.rotRows && selected.rotRows.length > 0 && (
                        <Card style={{ overflow: "hidden", marginBottom: 16 }}>
                            <SecLabel label="回転数データ" />
                            <div style={{ display: "grid", gridTemplateColumns: "45px 1fr 1fr 1fr 65px", background: "rgba(249,115,22,0.15)", padding: "8px 4px" }}>
                                {["種別", "総回転", "今回", "平均", "投資額"].map(h => (
                                    <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.sub }}>{h}</div>
                                ))}
                            </div>
                            {selected.rotRows.map((row, i) => {
                                const isMochi = row.mode === "mochi";
                                const badgeCol = isMochi ? C.orange : C.blue;
                                const badge = isMochi ? "持" : "現";
                                return (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "45px 1fr 1fr 1fr 65px", padding: "8px 4px", borderBottom: `1px solid ${C.border}` }}>
                                        <div style={{ textAlign: "center" }}>
                                            <span style={{ fontSize: 9, fontWeight: 700, color: badgeCol, background: badgeCol + "20", borderRadius: 4, padding: "2px 5px" }}>{badge}</span>
                                        </div>
                                        <div style={{ textAlign: "center", fontSize: 12, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                                        <div style={{ textAlign: "center", fontSize: 12, color: C.text, fontFamily: mono }}>{row.type === "start" ? "START" : row.thisRot}</div>
                                        <div style={{ textAlign: "center", fontSize: 12, color: C.text, fontFamily: mono }}>{row.avgRot || "—"}</div>
                                        <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{row.invest ? f(row.invest) + "円" : "—"}</div>
                                    </div>
                                );
                            })}
                        </Card>
                    )}

                    {/* JP History (Read-Only) */}
                    {selected.jpLog && selected.jpLog.length > 0 && (
                        <div>
                            <SecLabel label="大当たり履歴" />
                            {[...selected.jpLog].reverse().map((chain, ci) => (
                                <Card key={chain.chainId || ci} style={{ padding: "12px 16px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: C.blue }}>
                                            第{selected.jpLog.length - ci}初当たり — {(chain.hits || []).length}連
                                        </span>
                                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                    </div>
                                    {(chain.hits || []).map((hit, hi) => (
                                        <div key={hi} style={{ padding: "4px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: C.yellow, marginBottom: 2 }}>{hit.hitNumber}連目</div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                                <div><div style={{ fontSize: 7, color: C.sub }}>サポ</div><div style={{ fontSize: 11, color: C.subHi, fontFamily: mono }}>{hit.sapoCount}回</div></div>
                                                <div><div style={{ fontSize: 7, color: C.sub }}>{hit.rounds}R</div><div style={{ fontSize: 11, color: C.subHi, fontFamily: mono }}>{hit.hitRot > 0 ? hit.hitRot : "—"}</div></div>
                                                <div><div style={{ fontSize: 7, color: C.sub }}>出玉</div><div style={{ fontSize: 11, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div></div>
                                                <div><div style={{ fontSize: 7, color: C.sub }}>実出玉</div><div style={{ fontSize: 11, color: C.green, fontFamily: mono }}>{f(hit.actualBalls)}</div></div>
                                            </div>
                                        </div>
                                    ))}
                                    {chain.summary && (
                                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: C.sub }}>1R出玉</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}発</div>
                                            </div>
                                            <div style={{ textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: C.sub }}>サポ増減</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}発</div>
                                            </div>
                                        </div>
                                    )}
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // List View
    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            <SecLabel label="過去の実践データ" />
            {archives.length === 0 ? (
                <div style={{ textAlign: "center", color: C.sub, padding: "60px 16px", fontSize: 12, lineHeight: 1.8 }}>
                    アーカイブがありません<br />設定タブの「セッション保存」から保存できます
                </div>
            ) : (
                [...archives].reverse().map((a) => {
                    const st = a.stats || {};
                    return (
                        <Card key={a.id} style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{a.date}</span>
                                <div style={{ display: "flex", gap: 6 }}>
                                    <button className="b" onClick={() => setSelectedId(a.id)} style={{
                                        background: C.blue + "20", border: `1px solid ${C.blue}40`, borderRadius: 6,
                                        color: C.blue, fontSize: 10, padding: "4px 10px", fontWeight: 700, fontFamily: font
                                    }}>詳細</button>
                                    {delConfirm === a.id ? (
                                        <button className="b" onClick={() => deleteArchive(a.id)} style={{
                                            background: C.red, border: "none", borderRadius: 6,
                                            color: "#fff", fontSize: 10, padding: "4px 10px", fontWeight: 700, fontFamily: font
                                        }}>削除確定</button>
                                    ) : (
                                        <button className="b" onClick={() => setDelConfirm(a.id)} style={{
                                            background: "rgba(239,68,68,0.1)", border: `1px solid ${C.red}40`, borderRadius: 6,
                                            color: C.red, fontSize: 10, padding: "4px 10px", fontWeight: 700, fontFamily: font
                                        }}>削除</button>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                {[
                                    { label: "総回転", val: st.netRot > 0 ? f(st.netRot) : "—", col: C.subHi },
                                    { label: "初当たり", val: st.jpCount > 0 ? st.jpCount + "回" : "—", col: C.green },
                                    { label: "期待値/K", val: st.ev1K != null && st.ev1K !== 0 ? sp(st.ev1K, 0) : "—", col: sc(st.ev1K) },
                                    { label: "仕事量", val: st.workAmount != null && st.workAmount !== 0 ? sp(st.workAmount, 0) : "—", col: sc(st.workAmount) },
                                ].map(({ label, val, col }) => (
                                    <div key={label} style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 2 }}>{label}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: col, fontFamily: mono }}>{val}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
