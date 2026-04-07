import React, { useState, useEffect } from "react";
import { C, f, sc, sp, tsNow, font, mono } from "../../constants";
import { NI, Card, MiniStat, Btn, SecLabel, ModeToggle, ModeBadge } from "../Atoms";

export function RotTab({ S, ev }) {
    const [iRot, setIRot] = useState("");
    const [iInvest, setIInvest] = useState("");
    const [iTray, setITray] = useState("");
    const [mode, setMode] = useState(S.playMode || "cash");
    const [showUndo, setShowUndo] = useState(false);
    const [showStoreDropdown, setShowStoreDropdown] = useState(false);

    // S.playMode同期
    useEffect(() => {
        if (S.playMode && S.playMode !== mode) setMode(S.playMode); // eslint-disable-line react-hooks/set-state-in-effect
    }, [S.playMode]);

    useEffect(() => {
        if (mode !== S.playMode) S.setPlayMode(mode);
    }, [mode]);

    const addRot = () => {
        const r = Number(iRot);
        if (!r || r <= 0) return;
        const inv = Number(iInvest) || 0;
        const tray = Number(iTray) || 0;
        const now = tsNow();

        const lastRow = S.rotRows[S.rotRows.length - 1];
        const lastRot = lastRow ? lastRow.cumRot : S.startRot || 0;
        const cumRot = lastRot + r;

        // ログ追加
        S.pushLog({ type: "回転入力", time: now, rot: r, cash: mode === "cash" ? inv : 0, tray: tray });

        // 履歴追加
        const row = {
            type: "data",
            time: now,
            thisRot: r,
            cumRot,
            invest: mode === "cash" ? inv : 0,
            mochiBalls: mode === "mochi" ? tray : 0,
            chodamaBalls: mode === "chodama" ? tray : 0,
            mode,
            id: Date.now()
        };

        S.setRotRows([...S.rotRows, row]);

        // ステート更新
        if (mode === "cash") {
            S.setInvestYen(prev => prev + inv);
        } else if (mode === "mochi") {
            S.setCurrentMochiBalls(prev => Math.max(0, prev - tray));
        } else if (mode === "chodama") {
            // 貯玉使用分を店舗データに反映
            const store = (S.stores || []).find(st => typeof st === "object" && st.name === S.storeName);
            if (store) {
                const newChodama = Math.max(0, (store.chodama || 0) - tray);
                S.setStores(prev => prev.map(st => (typeof st === "object" && st.name === S.storeName) ? { ...st, chodama: newChodama } : st));
            }
        }

        setIRot("");
        setIInvest("");
        setITray("");
        setShowUndo(true);
        setTimeout(() => setShowUndo(false), 5000);
    };

    const handleInitialHit = () => {
        S.setTab("history");
    };

    const undoLast = () => {
        if (S.rotRows.length === 0) return;
        const last = S.rotRows[S.rotRows.length - 1];
        if (last.type !== "data") return;

        S.setRotRows(S.rotRows.slice(0, -1));
        if (last.mode === "cash") S.setInvestYen(p => p - last.invest);
        else if (last.mode === "mochi") S.setCurrentMochiBalls(p => p + last.mochiBalls);
        // Chodama undo is tricky since it's in a nested store object
        S.setSesLog(S.sesLog.slice(0, -1));
        setShowUndo(false);
    };

    const storeList = S.stores || [];

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* Store & Machine Banner */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <div style={{ flex: 1, position: "relative" }}>
                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 2, fontWeight: 700 }}>店舗</div>
                    <div style={{ display: "flex", gap: 4 }}>
                        <input type="text" value={S.storeName || ""} onChange={e => S.setStoreName(e.target.value)}
                            placeholder="店舗名"
                            style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.text, fontFamily: font, outline: "none" }} />
                        {storeList.length > 0 && (
                            <button className="b" onClick={() => setShowStoreDropdown(!showStoreDropdown)} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "0 10px", color: C.sub }}>▼</button>
                        )}
                    </div>
                    {showStoreDropdown && storeList.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, zInteger: 100, maxHeight: 150, overflowY: "auto", marginTop: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                            {storeList.map((st, i) => {
                                const name = typeof st === "object" ? st.name : st;
                                return (
                                    <button key={i} className="b" onClick={() => {
                                        S.setStoreName(name);
                                        if (typeof st === "object") {
                                            if (st.rentBalls) S.setRentBalls(st.rentBalls);
                                            if (st.exRate) S.setExRate(st.exRate);
                                        }
                                        setShowStoreDropdown(false);
                                    }} style={{ width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13 }}>{name}</button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 2, fontWeight: 700 }}>機種</div>
                    <input type="text" value={S.machineName || ""} onChange={e => S.setMachineName(e.target.value)}
                        placeholder="機種名"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.text, fontFamily: font, outline: "none" }} />
                </div>
                <div style={{ width: 60 }}>
                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 2, fontWeight: 700 }}>台番</div>
                    <input type="tel" value={S.machineNum || ""} onChange={e => S.setMachineNum(e.target.value)}
                        placeholder="000"
                        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: C.text, fontFamily: font, outline: "none", textAlign: "center" }} />
                </div>
            </div>

            {/* Top Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                <MiniStat label="現在の回転数" val={f(S.currentRot)} col={C.orange} />
                <MiniStat label="1Kスタート" val={ev.start1K > 0 ? f(ev.start1K, 1) : "—"} col={C.teal} />
                <MiniStat label="仕事量" val={f(Math.round(ev.workAmount || 0))} col={sc(ev.workAmount)} />
            </div>

            {/* Input Card */}
            <Card style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <ModeToggle mode={mode} setMode={setMode} showChodama={true} />
                    {mode === "mochi" && (
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: C.sub }}>現在の手持ち</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(S.currentMochiBalls)}玉</div>
                        </div>
                    )}
                    {mode === "chodama" && (
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: C.sub }}>貯玉残高</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.purple, fontFamily: mono }}>{f((storeList.find(st => typeof st === "object" && st.name === S.storeName)?.chodama || 0))}玉</div>
                        </div>
                    )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 6, fontWeight: 700, textAlign: "center" }}>回転数</div>
                        <NI v={iRot} set={setIRot} w="100%" big center ph="0" onEnter={addRot} />
                    </div>
                    <div>
                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 6, fontWeight: 700, textAlign: "center" }}>
                            {mode === "cash" ? "投資額 (円)" : "使用玉数 (玉)"}
                        </div>
                        <NI v={iInvest === "" && mode !== "cash" ? iTray : iInvest} set={mode === "cash" ? setIInvest : setITray} w="100%" big center ph={mode === "cash" ? "1000" : "250"} onEnter={addRot} />
                    </div>
                </div>

                <Btn label="データを追加" onClick={addRot} primary />
                {showUndo && <div onClick={undoLast} style={{ textAlign: "center", fontSize: 11, color: C.blue, padding: "10px 0", cursor: "pointer" }}>取り消す</div>}
            </Card>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <Btn label="初当たり" onClick={handleInitialHit} bg="linear-gradient(135deg, #f97316, #ea580c)" fg="#fff" bd="none" />
                <Btn label="台移動 / 終了" onClick={() => S.setTab("calendar")} />
            </div>

            {/* EV Details */}
            <Card style={{ padding: "16px 0", marginBottom: 16 }}>
                <SecLabel label="期待値詳細" />
                {[
                    ["回転単価", ev.unitValue != null ? sp(ev.unitValue, 2) : "—", "玉/回", sc(ev.unitValue)],
                    ["期待収支/K", ev.ev1K != null ? f(Math.round(ev.ev1K)) : "—", "円", sc(ev.ev1K)],
                    ["時給目安", ev.wage ? f(Math.round(ev.wage)) : "—", "円/h", sc(ev.wage)],
                    ["ボーダー", S.border ? f(S.border, 1) : "—", "回/K", C.subHi],
                    ["現在の投資", f(S.investYen), "円", C.red],
                ].map(([l, v, u, c], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < 4 ? `1px solid ${C.border}` : "none" }}>
                        <span style={{ fontSize: 12, color: C.sub }}>{l}</span>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: c, fontFamily: mono }}>{v}</span>
                            <span style={{ fontSize: 9, color: C.sub }}>{u}</span>
                        </div>
                    </div>
                ))}
            </Card>

            {/* History List */}
            {S.rotRows.length > 0 && (
                <Card style={{ overflow: "hidden" }}>
                    <SecLabel label={`最近の入力 (${S.rotRows.filter(r => r.type === "data").length}件)`} />
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {[...S.rotRows].reverse().map((r, i) => r.type === "data" && (
                            <div key={r.id || i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <ModeBadge mode={r.mode} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: mono }}>{r.thisRot}回</span>
                                    <span style={{ fontSize: 10, color: C.sub }}>({f(r.cumRot)})</span>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: r.mode === "cash" ? C.red : (r.mode === "mochi" ? C.orange : C.purple), fontFamily: mono }}>
                                        {r.mode === "cash" ? `-${f(r.invest)}円` : `-${f(r.mochiBalls || r.chodamaBalls)}玉`}
                                    </div>
                                    <div style={{ fontSize: 8, color: C.sub, fontFamily: mono }}>{r.time}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
}
