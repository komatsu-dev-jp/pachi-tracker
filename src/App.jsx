import React, { useState, useEffect } from "react";
import { useLS, calcPreciseEV } from "./logic";
import { C, f, font, mono, sc, sp } from "./constants";
import { DataTab, RotTab, HistoryTab, SettingsTab, CalendarTab } from "./components/Tabs";

export default function App() {
  const [tab, setTab] = useState("rot");

  // Settings
  const [rentBalls, setRentBalls] = useLS("pt_rentBalls", 250);
  const [exRate, setExRate] = useLS("pt_exRate", 250);
  const [synthDenom, setSynthDenom] = useLS("pt_synthDenom", 319.6);
  const [rotPerHour, setRotPerHour] = useLS("pt_rotPerHour", 250);
  const [border, setBorder] = useLS("pt_border", 20);
  const [ballVal, setBallVal] = useLS("pt_ballVal", 4);
  // 機種スペック（P tools互換）
  const [spec1R, setSpec1R] = useLS("pt_spec1R", 140);
  const [specAvgRounds, setSpecAvgRounds] = useLS("pt_specAvgRounds", 34.17);
  const [specSapo, setSpecSapo] = useLS("pt_specSapo", 0);

  // Logs
  const [jpLog, setJpLog] = useLS("pt_jpLog3", []);    // v3: chain-based structure
  const [sesLog, setSesLog] = useLS("pt_sesLog", []);
  const [rotRows, setRotRows] = useLS("pt_rotRows", []);
  const [startRot, setStartRot] = useLS("pt_startRot", 0);
  const [totalTrayBalls, setTotalTrayBalls] = useLS("pt_totalTrayBalls", 0);
  const [playMode, setPlayMode] = useLS("pt_playMode", "cash");

  // Session info (店舗・台番号・投資・回収)
  const [storeName, setStoreName] = useLS("pt_storeName", "");
  const [machineNum, setMachineNum] = useLS("pt_machineNum", "");
  const [investYen, setInvestYen] = useLS("pt_investYen", 0);
  const [recoveryYen, setRecoveryYen] = useLS("pt_recoveryYen", 0);

  // Archives
  const [archives, setArchives] = useLS("pt_archives", []);

  const pushJP = (j) => setJpLog((p) => [...p, j]);
  const delJPLast = () => setJpLog((p) => p.slice(0, -1));
  const pushLog = (e) => setSesLog((p) => [...p, e]);
  const delSesLast = () => setSesLog((p) => p.slice(0, -1));

  // ── 高精度期待値エンジン ──
  const ev = calcPreciseEV({
    rotRows, startRot, jpLog,
    rentBalls, exRate, synthDenom, rotPerHour,
    totalTrayBalls, border,
    spec1R, specAvgRounds, specSapo,
  });

  const resetAll = () => {
    setJpLog([]);
    setSesLog([]);
    setRotRows([]);
    setStartRot(0);
    setTotalTrayBalls(0);
    setPlayMode("cash");
    setStoreName("");
    setMachineNum("");
    setInvestYen(0);
    setRecoveryYen(0);
  };

  // 台移動: 現在のデータを自動保存して新台へ
  const handleMoveTable = () => {
    // データがある場合のみ保存
    if (rotRows.length > 0 || jpLog.length > 0) {
      const archive = {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        rotRows, jpLog, sesLog,
        settings: { rentBalls, exRate, synthDenom, rotPerHour, border, ballVal },
        stats: ev ? { ...ev } : {},
        totalTrayBalls, startRot,
        storeName, machineNum, investYen, recoveryYen,
        machineName: `1/${synthDenom}`,
        isMoveArchive: true,
      };
      setArchives((prev) => [...prev, archive]);
    }
    resetAll();
    setTab("rot");
  };

  const S = {
    rentBalls, setRentBalls, exRate, setExRate, synthDenom, setSynthDenom,
    rotPerHour, setRotPerHour, border, setBorder, ballVal, setBallVal,
    spec1R, setSpec1R, specAvgRounds, setSpecAvgRounds, specSapo, setSpecSapo,
    rotRows, setRotRows,
    jpLog, setJpLog, pushJP,
    sesLog, setSesLog,
    pushLog, startRot, setStartRot, setTab,
    totalTrayBalls, setTotalTrayBalls,
    playMode, setPlayMode,
    storeName, setStoreName, machineNum, setMachineNum,
    investYen, setInvestYen, recoveryYen, setRecoveryYen,
    archives, setArchives,
    ev, handleMoveTable,
  };

  const nav = [
    { id: "data", label: "データ", icon: "📈" },
    { id: "rot", label: "回転数", icon: "📊" },
    { id: "history", label: "大当たり", icon: "📋" },
    { id: "calendar", label: "記録", icon: "📅" },
    { id: "settings", label: "設定", icon: "⚙️" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", color: C.text, position: "relative" }}>

      {/* Header */}
      <header style={{ background: "rgba(17, 17, 22, 0.8)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, padding: "14px 16px 12px", zIndex: 100 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, color: "#fff", lineHeight: 1.1 }}>PACHI TRACKER</h1>
            <p style={{ fontSize: 9, color: C.sub, letterSpacing: 3, textTransform: "uppercase", marginTop: 4, fontWeight: 700 }}>Pro EV Engine</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "4px 10px", textAlign: "center", minWidth: 70 }}>
              <div style={{ fontSize: 7, color: C.sub, marginBottom: 1, fontWeight: 600 }}>期待値/K</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: sc(ev.ev1K), fontFamily: mono }}>{ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "4px 10px", textAlign: "center", minWidth: 70 }}>
              <div style={{ fontSize: 7, color: C.sub, marginBottom: 1, fontWeight: 600 }}>仕事量</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: sc(ev.workAmount), fontFamily: mono }}>{ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "data" && <DataTab ev={ev} jpLog={jpLog} S={S} />}
        {tab === "rot" && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
        {tab === "history" && <HistoryTab jpLog={jpLog} sesLog={sesLog} pushJP={pushJP} delJPLast={delJPLast} delSesLast={delSesLast} S={S} ev={ev} />}
        {tab === "calendar" && <CalendarTab S={S} onReset={resetAll} />}
        {tab === "settings" && <SettingsTab s={S} onReset={resetAll} />}
      </main>

      {/* Navigation */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "rgba(17, 17, 22, 0.95)", backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", zIndex: 100 }}>
        {nav.map(({ id, label, icon }) => (
          <button key={id} className="b" onClick={() => setTab(id)} style={{
            flex: 1, background: "transparent", border: "none",
            borderTop: tab === id ? `3px solid ${C.blue}` : "3px solid transparent",
            padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.2s ease"
          }}>
            <span style={{ fontSize: 20, filter: tab === id ? "none" : "grayscale(1) opacity(0.5)" }}>{icon}</span>
            <span style={{ fontSize: 10, fontWeight: tab === id ? 800 : 500, color: tab === id ? C.blue : C.sub, fontFamily: font, letterSpacing: 0.5 }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
