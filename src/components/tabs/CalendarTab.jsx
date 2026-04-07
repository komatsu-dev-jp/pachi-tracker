import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, tsNow, mono } from "../../constants";
import { Card, Btn, SecLabel, MiniStat, LineChart } from "../Atoms";

export function CalendarTab({ S }) {
    const [selectedArchive, setSelectedArchive] = useState(null);
    const archives = S.archives || [];

    // Monthly summary calculation
    const monthlyStats = useMemo(() => {
        const stats = {};
        archives.forEach(a => {
            const m = (a.date || "").slice(0, 7);
            if (!m) return;
            if (!stats[m]) stats[m] = { balance: 0, work: 0, count: 0, hours: 0 };
            const inv = a.investYen || 0;
            const rec = a.recoveryYen || 0;
            stats[m].balance += (rec - inv);
            stats[m].work += (a.stats?.workAmount || 0);
            stats[m].count += 1;
            stats[m].hours += (a.stats?.totalHours || 0);
        });
        return Object.entries(stats).sort((a, b) => b[0].localeCompare(a[0]));
    }, [archives]);

    const openArchive = (a) => {
        setSelectedArchive(a);
    };

    const deleteArchive = (id) => {
        if (window.confirm("このログを削除しますか？")) {
            S.setArchives(archives.filter(a => a.id !== id));
            setSelectedArchive(null);
        }
    };

    const handleFinishSession = () => {
        if (S.rotRows.length === 0 && S.jpLog.length === 0) {
            alert("記録するデータがありません");
            return;
        }
        if (window.confirm("現在のセッションを終了して保存しますか？")) {
            const arc = {
                id: Date.now(),
                date: new Date().toISOString().split("T")[0],
                time: tsNow(),
                storeName: S.storeName,
                machineName: S.machineName,
                machineNum: S.machineNum,
                investYen: S.investYen,
                recoveryYen: Math.round(S.currentMochiBalls * (S.exRate / 100)),
                mochiBalls: S.currentMochiBalls,
                rotRows: S.rotRows,
                jpLog: S.jpLog,
                sesLog: S.sesLog,
                stats: {
                    totalNetRot: S.totalNetRot,
                    totalWorkAmount: S.totalWorkAmount,
                    workAmount: S.ev.workAmount || 0,
                    totalHours: S.totalHours,
                    jpCount: S.totalJpCount,
                    avg1K: S.ev.start1K || 0,
                }
            };
            S.setArchives([arc, ...archives]);

            // Reset current session
            S.setRotRows([]);
            S.setJpLog([]);
            S.setSesLog([]);
            S.setInvestYen(0);
            S.setCurrentMochiBalls(0);
            S.setStartRot("");
            alert("保存しました");
        }
    };

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            <Card style={{ padding: 16, marginBottom: 16 }}>
                <SecLabel label="セッション管理" />
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>
                    現在の稼働を終了し、結果を履歴に保存します。保存後、現在の数値はリセットされます。
                </div>
                <Btn label="現在の稼働を保存して終了" onClick={handleFinishSession} primary />
            </Card>

            <SecLabel label="月別サマリー" />
            <div style={{ display: "flex", overflowX: "auto", gap: 10, paddingBottom: 12, marginBottom: 12, paddingLeft: 4 }}>
                {monthlyStats.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.sub, padding: "20px 0" }}>データがありません</div>
                ) : (
                    monthlyStats.map(([month, st]) => (
                        <div key={month} style={{ flexShrink: 0, width: 140, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: C.text, marginBottom: 8, borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>{month}</div>
                            <div style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 8, color: C.sub }}>収支</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(st.balance), fontFamily: mono }}>{f(st.balance)}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 8, color: C.sub }}>仕事量</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(st.work), fontFamily: mono }}>{f(st.work)}</div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 8, color: C.sub }}>{st.count}日</span>
                                <span style={{ fontSize: 8, color: C.sub }}>{f(st.hours, 1)}h</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <SecLabel label="過去の稼働ログ" />
            {archives.length === 0 ? (
                <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>まだログがありません</div>
            ) : (
                archives.map((a, i) => (
                    <button key={a.id || i} className="b" onClick={() => openArchive(a)} style={{
                        width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                        border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px", display: "flex",
                        justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left"
                    }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>{a.date} <span style={{ fontSize: 10, color: C.sub, fontWeight: 500 }}>{a.time}</span></div>
                            <div style={{ fontSize: 10, color: C.sub }}>{a.storeName || "不明な店舗"} / {a.machineName || "不明な機種"}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: sc((a.recoveryYen || 0) - (a.investYen || 0)), fontFamily: mono }}>{f((a.recoveryYen || 0) - (a.investYen || 0))}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>仕事量: {f(Math.round(a.stats?.workAmount || 0))}</div>
                        </div>
                    </button>
                ))
            )}

            {selectedArchive && ReactDOM.createPortal(
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, zIndex: 1000, display: "flex", flexDirection: "column", animation: "slideUp 0.3s ease" }}>
                    <div style={{ padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surfaceHi }}>
                        <button className="b" onClick={() => setSelectedArchive(null)} style={{ background: "transparent", border: "none", color: C.blue, fontSize: 15, fontWeight: 600 }}>戻る</button>
                        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>稼働詳細</span>
                        <div style={{ width: 40 }} />
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 40px" }}>
                        <Card style={{ padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 4 }}>{selectedArchive.date}</div>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 16 }}>{selectedArchive.storeName} | {selectedArchive.machineName}</div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>最終収支</div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: sc((selectedArchive.recoveryYen || 0) - (selectedArchive.investYen || 0)), fontFamily: mono }}>{f((selectedArchive.recoveryYen || 0) - (selectedArchive.investYen || 0))}<span style={{ fontSize: 10, marginLeft: 2 }}>円</span></div>
                                </div>
                                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12 }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>仕事量</div>
                                    <div style={{ fontSize: 20, fontWeight: 900, color: sc(selectedArchive.stats?.workAmount || 0), fontFamily: mono }}>{f(Math.round(selectedArchive.stats?.workAmount || 0))}<span style={{ fontSize: 10, marginLeft: 2 }}>円</span></div>
                                </div>
                            </div>
                        </Card>

                        <SecLabel label="統計データ" />
                        <Card style={{ padding: "8px 16px", marginBottom: 16 }}>
                            {[
                                ["投資額", f(selectedArchive.investYen), "円"],
                                ["回収額", f(selectedArchive.recoveryYen), "円"],
                                ["総回転数", f(selectedArchive.stats?.totalNetRot), "回"],
                                ["初当たり", f(selectedArchive.stats?.jpCount), "回"],
                                ["1Kスタート", f(selectedArchive.stats?.avg1K, 1), "回/K"],
                                ["稼働時間", f(selectedArchive.stats?.totalHours, 1), "h"],
                            ].map(([l, v, u], idx) => (
                                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: idx < 5 ? `1px solid ${C.border}` : "none" }}>
                                    <span style={{ fontSize: 12, color: C.sub }}>{l}</span>
                                    <div><span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: mono }}>{v}</span><span style={{ fontSize: 9, color: C.sub, marginLeft: 2 }}>{u}</span></div>
                                </div>
                            ))}
                        </Card>

                        {selectedArchive.jpLog && selectedArchive.jpLog.length > 0 && (
                            <>
                                <SecLabel label="大当たり履歴" />
                                {selectedArchive.jpLog.map((chain, ci) => (
                                    <Card key={ci} style={{ padding: 12, marginBottom: 8, background: "rgba(255,255,255,0.01)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{chain.hits.length}連チャン</span>
                                            <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub }}>
                                            初当回転: {f(chain.hitRot)} (通常:{f(chain.hitThisRot)}) | 出玉: {f(chain.summary?.netGain)}玉
                                        </div>
                                    </Card>
                                ))}
                            </>
                        )}

                        <div style={{ marginTop: 20 }}>
                            <Btn label="このログを削除" onClick={() => deleteArchive(selectedArchive.id)} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
