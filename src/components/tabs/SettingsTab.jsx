import React, { useState, useMemo, useEffect } from "react";
import { C, f, sc, sp, tsNow, font, mono } from "../../constants";
import { Card, Btn, SecLabel, NI } from "../Atoms";
import { searchMachines } from "../../machineDB";

export function SettingsTab({ s, onReset }) {
    const [confirming, setConfirming] = useState(false);

    // --- 機種検索・登録のステート ---
    const [showMachineSearch, setShowMachineSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [showMachineForm, setShowMachineForm] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);

    const emptyMachine = {
        name: "", maker: "", type: "ミドル", prob: "", synthProb: "",
        spec1R: "", specAvgTotalRounds: "", specSapo: "0",
        roundDist: "", rushDist: "", isCustom: true
    };
    const [formData, setFormData] = useState(emptyMachine);

    // --- 店舗検索・登録のステート ---
    const [showStoreSearch, setShowStoreSearch] = useState(false);
    const [storeQuery, setStoreQuery] = useState("");
    const [storeSelected, setStoreSelected] = useState(null);
    const [showStoreForm, setShowStoreForm] = useState(false);
    const [editingStore, setEditingStore] = useState(null);
    const emptyStore = {
        name: "", area: "", rentBalls: 250, exRate: 250, chodama: 0, isCustom: true
    };
    const [storeFormData, setStoreFormData] = useState(emptyStore);

    // --- 期待値計算のローカルステート ---
    const calcBorder = useMemo(() => {
        const s1R = Number(s.spec1R) || 0;
        const sAvgR = Number(s.specAvgRounds) || 0;
        const sSapo = Number(s.specSapo) || 0;
        const sSynth = Number(s.synthDenom) || 0;
        const sEx = Number(s.exRate) || 0;

        if (!s1R || !sAvgR || !sSynth || !sEx) return 0;

        const payoutPerHit = s1R * sAvgR + sSapo;
        const border = (250 * sSynth * (sEx / 100)) / (payoutPerHit * (sEx / 100));
        return border;
    }, [s.spec1R, s.specAvgRounds, s.specSapo, s.synthDenom, s.exRate]);

    const exRateLabel = useMemo(() => {
        const balls = Math.round((s.exRate || 250) / 10);
        const yen = (100 / balls).toFixed(2);
        return `${yen}円 (${balls}玉/100円)`;
    }, [s.exRate]);

    // Machine search logic
    const results = useMemo(() => {
        let list = searchMachines(query);
        const customs = (s.customMachines || []).filter(m =>
            m.name.toLowerCase().includes(query.toLowerCase()) ||
            (m.maker && m.maker.toLowerCase().includes(query.toLowerCase()))
        );
        return [...customs, ...list];
    }, [query, s.customMachines]);

    const applyMachine = (m) => {
        if (m.synthProb) s.setSynthDenom(m.synthProb);
        if (m.spec1R) s.setSpec1R(m.spec1R);
        if (m.specAvgTotalRounds) s.setSpecAvgRounds(m.specAvgTotalRounds);
        if (m.specSapo !== undefined) s.setSpecSapo(m.specSapo);
        s.setMachineName(m.name);
        setShowMachineSearch(false);
        setSelected(null);
        alert(`${m.name} のスペックを反映しました`);
    };

    const openMachineForm = (m = null) => {
        if (m) {
            setEditingMachine(m);
            setFormData({ ...m });
        } else {
            setEditingMachine(null);
            setFormData(emptyMachine);
        }
        setShowMachineForm(true);
    };

    const saveMachine = () => {
        if (!formData.name.trim()) return;
        const newList = editingMachine
            ? s.customMachines.map(m => m.id === editingMachine.id ? { ...formData } : m)
            : [...(s.customMachines || []), { ...formData, id: Date.now(), isCustom: true }];
        s.setCustomMachines(newList);
        setShowMachineForm(false);
        setEditingMachine(null);
        setFormData(emptyMachine);
    };

    const deleteMachine = (m) => {
        if (window.confirm("この機種を削除しますか？")) {
            s.setCustomMachines(s.customMachines.filter(x => x.id !== m.id));
            setSelected(null);
        }
    };

    const exportMachinesCSV = () => {
        const headers = ["name", "maker", "type", "prob", "synthProb", "spec1R", "specAvgTotalRounds", "specSapo", "roundDist", "rushDist", "isCustom"];
        const rows = (s.customMachines || []).map(m => headers.map(h => `"${m[h] || ""}"`).join(","));
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `custom_machines_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const importMachinesCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const lines = text.split("\n");
                const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
                const imported = lines.slice(1).filter(l => l.trim()).map(l => {
                    const values = l.split(",").map(v => v.replace(/"/g, "").trim());
                    const m = {};
                    headers.forEach((h, i) => {
                        let val = values[i];
                        if (["synthProb", "spec1R", "specAvgTotalRounds", "specSapo"].includes(h)) val = Number(val) || 0;
                        if (h === "isCustom") val = val === "true";
                        m[h] = val;
                    });
                    if (!m.id) m.id = Date.now() + Math.random();
                    return m;
                });
                s.setCustomMachines([...(s.customMachines || []), ...imported]);
                alert(`${imported.length}件の機種をインポートしました`);
            } catch (err) {
                alert("CSVのパースに失敗しました");
            }
        };
        reader.readAsText(file);
    };

    // Store logic
    const storeResults = useMemo(() => {
        const list = s.stores || [];
        if (!storeQuery) return list;
        return list.filter(st => {
            const name = typeof st === "object" ? st.name : st;
            return name.toLowerCase().includes(storeQuery.toLowerCase());
        });
    }, [storeQuery, s.stores]);

    const openStoreForm = (st = null) => {
        if (st) {
            setEditingStore(st);
            setStoreFormData({ ...st });
        } else {
            setEditingStore(null);
            setStoreFormData(emptyStore);
        }
        setShowStoreForm(true);
    };

    const saveStore = () => {
        if (!storeFormData.name.trim()) return;
        const newList = editingStore
            ? s.stores.map(st => st.id === editingStore.id ? { ...storeFormData } : st)
            : [...(s.stores || []), { ...storeFormData, id: Date.now(), isCustom: true }];
        s.setStores(newList);
        setShowStoreForm(false);
        setEditingStore(null);
        setStoreFormData(emptyStore);
    };

    const deleteStore = (st) => {
        if (window.confirm("この店舗を削除しますか？")) {
            s.setStores(s.stores.filter(x => x.id !== st.id));
            setStoreSelected(null);
        }
    };

    const applyStore = (st) => {
        if (st.name) s.setStoreName(st.name);
        if (st.rentBalls) s.setRentBalls(st.rentBalls);
        if (st.exRate) s.setExRate(st.exRate);
        setShowStoreSearch(false);
        setStoreSelected(null);
        alert(`${st.name} を設定しました`);
    };

    // Sub-views
    if (storeSelected) {
        const st = storeSelected;
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setStoreSelected(null)} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12 }}>← 戻る</button>
                <Card style={{ padding: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 4 }}>{st.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 16 }}>{st.area || "地域未設定"}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>貸玉レート</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{(100 / (st.rentBalls / 10)).toFixed(2)}円</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>交換レート</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>{(100 / (st.exRate / 10)).toFixed(2)}円</div>
                        </div>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>現在の貯玉</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(st.chodama || 0)}玉</div>
                        </div>
                    </div>

                    <Btn label="この店舗を設定に反映" onClick={() => applyStore(st)} primary />
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn label="編集" onClick={() => { setStoreSelected(null); openStoreForm(st); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        <Btn label="削除" onClick={() => deleteStore(st)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                    </div>
                </Card>
            </div>
        );
    }

    if (showStoreForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowStoreForm(false); setEditingStore(null); setStoreFormData(emptyStore); }} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12 }}>← 戻る</button>
                <Card style={{ padding: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>{editingStore ? "店舗を編集" : "新規店舗登録"}</div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店舗名 *</div>
                        <input type="text" value={storeFormData.name} onChange={e => setStoreFormData({ ...storeFormData, name: e.target.value })} style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貸玉100円 (玉)</div>
                        <NI v={Math.round(storeFormData.rentBalls / 10)} set={v => setStoreFormData({ ...storeFormData, rentBalls: v * 10 })} w="100%" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換100円 (玉)</div>
                        <NI v={Math.round(storeFormData.exRate / 10)} set={v => setStoreFormData({ ...storeFormData, exRate: v * 10 })} w="100%" />
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉 (玉)</div>
                        <NI v={storeFormData.chodama} set={v => setStoreFormData({ ...storeFormData, chodama: v })} w="100%" />
                    </div>
                    <Btn label={editingStore ? "更新" : "登録"} onClick={saveStore} primary disabled={!storeFormData.name.trim()} />
                </Card>
            </div>
        );
    }

    if (showStoreSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowStoreSearch(false); setStoreQuery(""); }} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600 }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openStoreForm()} style={{ background: C.blue, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700 }}>+ 店舗を登録</button>
                </div>
                <input type="text" value={storeQuery} onChange={e => setStoreQuery(e.target.value)} placeholder="店舗名で検索..." style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font, outline: "none", marginBottom: 12 }} />
                {storeResults.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>店舗が登録されていません</div>
                ) : (
                    storeResults.map((st, i) => (
                        <button key={i} className="b" onClick={() => setStoreSelected(st)} style={{ width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{st.name}</div>
                                <div style={{ fontSize: 10, color: C.sub }}>{st.area || "-"} / {(100 / (st.exRate / 10)).toFixed(2)}円</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(st.chodama || 0)}玉</div>
                                <div style={{ fontSize: 9, color: C.sub }}>貯玉</div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        );
    }

    if (selected) {
        const borderKeys = selected.border ? Object.keys(selected.border) : [];
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelected(null)} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12 }}>← 戻る</button>
                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 4 }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 16 }}>{selected.maker} / {selected.type} / {selected.prob}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>合成確率</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>1/{selected.synthProb}</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{f(selected.spec1R)}</div>
                        </div>
                    </div>
                </Card>
                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} primary />
                {selected.isCustom && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn label="編集" onClick={() => { setSelected(null); openMachineForm(selected); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        <Btn label="削除" onClick={() => deleteMachine(selected)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                    </div>
                )}
            </div>
        );
    }

    if (showMachineForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineForm(false); setEditingMachine(null); setFormData(emptyMachine); }} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12 }}>← 戻る</button>
                <Card style={{ padding: 16 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>{editingMachine ? "機種を編集" : "新規機種登録"}</div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>機種名 *</div>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>合成確率分母</div>
                        <NI v={formData.synthProb} set={v => setFormData({ ...formData, synthProb: v })} w="100%" />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                        <NI v={formData.spec1R} set={v => setFormData({ ...formData, spec1R: v })} w="100%" />
                    </div>
                    <Btn label={editingMachine ? "更新" : "登録"} onClick={saveMachine} primary disabled={!formData.name.trim()} />
                </Card>
            </div>
        );
    }

    if (showMachineSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowMachineSearch(false); setQuery(""); }} style={{ background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600 }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openMachineForm()} style={{ background: C.blue, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700 }}>+ 機種を登録</button>
                </div>
                <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="機種名・メーカーで検索..." style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font, outline: "none", marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportMachinesCSV} style={{ flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600 }}>CSVエクスポート</button>
                    <label style={{ flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8, color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600, textAlign: "center", cursor: "pointer" }}>CSVインポート<input type="file" accept=".csv" onChange={importMachinesCSV} style={{ display: "none" }} /></label>
                </div>
                {results.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>該当する機種がありません</div>
                ) : (
                    results.map((m, i) => (
                        <button key={i} className="b" onClick={() => setSelected(m)} style={{ width: "100%", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{m.name} {m.isCustom && <span style={{ fontSize: 9, background: C.teal, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>カスタム</span>}</div>
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

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            <Card style={{ padding: 16 }}>
                <SecLabel label="テーマ設定" />
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button className="b" onClick={() => s.setTheme("dark")} style={{ flex: 1, padding: "16px 12px", borderRadius: 12, border: s.theme === "dark" ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: s.theme === "dark" ? "linear-gradient(135deg, #1a1a24, #252532)" : C.surface, cursor: "pointer" }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🌙</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.theme === "dark" ? C.blue : C.text }}>ダーク</div>
                    </button>
                    <button className="b" onClick={() => s.setTheme("light")} style={{ flex: 1, padding: "16px 12px", borderRadius: 12, border: s.theme === "light" ? `2px solid ${C.blue}` : `1px solid ${C.border}`, background: s.theme === "light" ? "linear-gradient(135deg, #e8f0fe, #f5f7fa)" : C.surface, cursor: "pointer" }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>☀️</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: s.theme === "light" ? C.blue : C.text }}>ホワイト</div>
                    </button>
                </div>
            </Card>

            <Card style={{ padding: 16 }}>
                <SecLabel label="機種検索・登録" />
                <div style={{ display: "flex", gap: 10 }}><Btn label="機種を検索" onClick={() => setShowMachineSearch(true)} primary small /><Btn label="+ 機種を登録" onClick={() => openMachineForm()} bg={C.teal} fg="#fff" bd="none" small /></div>
            </Card>

            <Card style={{ padding: 16 }}>
                <SecLabel label="店舗検索・登録" />
                <div style={{ display: "flex", gap: 10 }}><Btn label="店舗を検索" onClick={() => setShowStoreSearch(true)} primary small /><Btn label="+ 店舗を登録" onClick={() => openStoreForm()} bg={C.teal} fg="#fff" bd="none" small /></div>
            </Card>

            <Card style={{ padding: 16 }}>
                <SecLabel label="貯玉設定" color={C.purple} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
                    <div><div style={{ fontSize: 13, color: C.text }}>貯玉を収支に含める</div></div>
                    <button className="b" onClick={() => s.setIncludeChodamaInBalance(!s.includeChodamaInBalance)} style={{ width: 52, height: 28, borderRadius: 14, background: s.includeChodamaInBalance ? C.purple : "rgba(255,255,255,0.1)", position: "relative" }}><div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: s.includeChodamaInBalance ? 27 : 3, transition: "left 0.2s" }} /></button>
                </div>
            </Card>

            <Card>
                <SecLabel label="基本設定" />
                <div style={{ padding: "0 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 13 }}>貸玉 (玉/100円)</span>
                        <NI v={Math.round(s.rentBalls / 10)} set={v => s.setRentBalls(v * 10)} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
                        <span style={{ fontSize: 13 }}>交換 (玉/100円)</span>
                        <NI v={Math.round(s.exRate / 10)} set={v => s.setExRate(v * 10)} />
                    </div>
                </div>
            </Card>

            <Card>
                <SecLabel label="機種スペック" />
                <div style={{ padding: "0 16px" }}>
                    {[
                        { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom },
                        { lbl: "1R出玉", v: s.spec1R, set: s.setSpec1R },
                        { lbl: "平均総R", v: s.specAvgRounds, set: s.setSpecAvgRounds },
                        { lbl: "サポ増減", v: s.specSapo, set: s.setSpecSapo },
                    ].map(x => (
                        <div key={x.lbl} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 13 }}>{x.lbl}</span>
                            <NI v={x.v} set={x.set} />
                        </div>
                    ))}
                    <div style={{ padding: "12px 0", textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: C.sub }}>理論ボーダー: {exRateLabel}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>{calcBorder > 0 ? f(calcBorder, 1) : "—"} <span style={{ fontSize: 10 }}>回/K</span></div>
                    </div>
                </div>
            </Card>

            <div style={{ marginTop: 20 }}>
                {!confirming ? (
                    <Btn label="データをリセット" onClick={() => setConfirming(true)} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                ) : (
                    <div style={{ display: "flex", gap: 10 }}>
                        <Btn label="本当にリセット？" onClick={() => { onReset(); setConfirming(false); }} bg={C.red} fg="#fff" />
                        <Btn label="キャンセル" onClick={() => setConfirming(false)} />
                    </div>
                )}
            </div>
        </div>
    );
}
