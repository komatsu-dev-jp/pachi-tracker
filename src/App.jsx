import React, { useState, useEffect } from "react";
import { useLS, calcPreciseEV } from "./logic";
import { C, font } from "./constants";
import { RotTab, SettingsTab, CalendarTab } from "./components/Tabs";

export const COLOR_THEMES = [
  { id: "purple",   gradient: "linear-gradient(135deg,#667eea,#764ba2)", primary: "#667eea" },
  { id: "teal",     gradient: "linear-gradient(135deg,#0093E9,#80D0C7)", primary: "#0093E9" },
  { id: "green",    gradient: "linear-gradient(135deg,#11998e,#38ef7d)", primary: "#11998e" },
  { id: "orange",   gradient: "linear-gradient(135deg,#f7971e,#ffd200)", primary: "#f7971e" },
  { id: "red",      gradient: "linear-gradient(135deg,#cb2d3e,#ef473a)", primary: "#ef473a" },
  { id: "pink",     gradient: "linear-gradient(135deg,#ee0979,#ff6a00)", primary: "#ee0979" },
  { id: "lavender", gradient: "linear-gradient(135deg,#a18cd1,#fbc2eb)", primary: "#a18cd1" },
  { id: "emerald",  gradient: "linear-gradient(135deg,#0cebeb,#20e3b2)", primary: "#20e3b2" },
  { id: "cyan",     gradient: "linear-gradient(135deg,#43cea2,#185a9d)", primary: "#43cea2" },
  { id: "yellow",   gradient: "linear-gradient(135deg,#f6d365,#fda085)", primary: "#f6d365" },
];

export default function App() {
  const [tab, setTab] = useState("rot");

  // Theme management
  const [theme, setTheme] = useLS("pt_theme", "dark");

  // Appearance
  const [accentColor, setAccentColor] = useLS("pt_accentColor", "purple");
  const [highContrast, setHighContrast] = useLS("pt_highContrast", false);
  const [colorBlind, setColorBlind] = useLS("pt_colorBlind", false);

  // Security
  const [appLock, setAppLock] = useLS("pt_appLock", false);
  const [appPin, setAppPin] = useLS("pt_appPin", "");
  const [isLocked, setIsLocked] = useState(() => appLock);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = (e) => document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
      apply(mq);
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    const preset = COLOR_THEMES.find(t => t.id === accentColor);
    if (preset) {
      document.documentElement.style.setProperty("--blue", preset.primary);
      document.documentElement.style.setProperty("--accent-grad", preset.gradient);
    }
  }, [accentColor]);

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", !!highContrast);
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle("color-blind", !!colorBlind);
  }, [colorBlind]);

  // Settings
  const [rentBalls, setRentBalls] = useLS("pt_rentBalls", 250);
  const [exRate, setExRate] = useLS("pt_exRate", 250);
  const [synthDenom, setSynthDenom] = useLS("pt_synthDenom", 319.6);
  const [rotPerHour, setRotPerHour] = useLS("pt_rotPerHour", 250);
  const [border, setBorder] = useLS("pt_border", 20);
  const [investPace, setInvestPace] = useLS("pt_investPace", 1000);
  const [ballVal, setBallVal] = useLS("pt_ballVal", 4);
  // 機種スペック（P tools互換）
  const [spec1R, setSpec1R] = useLS("pt_spec1R", 140);
  const [specAvgRounds, setSpecAvgRounds] = useLS("pt_specAvgRounds", 34.17);
  const [specSapo, setSpecSapo] = useLS("pt_specSapo", 0);

  // Logs
  const [jpLog, setJpLog] = useLS("pt_jpLog3", []);
  const [sesLog, setSesLog] = useLS("pt_sesLog", []);
  const [rotRows, setRotRows] = useLS("pt_rotRows", []);
  const [startRot, setStartRot] = useLS("pt_startRot", 0);
  const [totalTrayBalls, setTotalTrayBalls] = useLS("pt_totalTrayBalls", 0);
  const [playMode, setPlayMode] = useLS("pt_playMode", "cash");

  // 貯玉関連設定
  const [includeChodamaInBalance, setIncludeChodamaInBalance] = useLS("pt_includeChodamaInBalance", true);
  const [chodamaReplayLimit, setChodamaReplayLimit] = useLS("pt_chodamaReplayLimit", 2500);
  const [chodamaUsedToday, setChodamaUsedToday] = useLS("pt_chodamaUsedToday", 0);
  const [chodamaLastDate, setChodamaLastDate] = useLS("pt_chodamaLastDate", "");

  // セッション中のリアルタイム玉数
  const [currentMochiBalls, setCurrentMochiBalls] = useLS("pt_currentMochiBalls", 0);
  const [currentChodama, setCurrentChodama] = useLS("pt_currentChodama", 0);

  // セッション開始時の初期値
  const [sessionStarted, setSessionStarted] = useLS("pt_sessionStarted", false);
  const [startGameCount, setStartGameCount] = useLS("pt_startGameCount", 0);
  const [initialMochiBalls, setInitialMochiBalls] = useLS("pt_initialMochiBalls", 0);
  const [initialChodama, setInitialChodama] = useLS("pt_initialChodama", 0);
  const [selectedStoreId, setSelectedStoreId] = useLS("pt_selectedStoreId", null);

  // 時短/大当たり終了後のスタート入力プロンプト表示フラグ
  const [showStartPrompt, setShowStartPrompt] = useState(false);

  // セッション内サブタブ
  const [sessionSubTab, setSessionSubTab] = useState("rot");

  // Session info
  const [storeName, setStoreName] = useLS("pt_storeName", "");
  const [machineNum, setMachineNum] = useLS("pt_machineNum", "");
  const [machineName, setMachineName] = useLS("pt_machineName", "");
  const [investYen, setInvestYen] = useLS("pt_investYen", 0);
  const [recoveryYen, setRecoveryYen] = useLS("pt_recoveryYen", 0);

  // Registered stores
  const [stores, setStores] = useLS("pt_stores", []);

  // Custom machines
  const [customMachines, setCustomMachines] = useLS("pt_customMachines", []);

  // Archives
  const [archives, setArchives] = useLS("pt_archives", []);

  // 日付変更時に貯玉使用量をリセット
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (chodamaLastDate !== today) {
      setChodamaUsedToday(0);
      setChodamaLastDate(today);
    }
  }, [chodamaLastDate]);

  const pushJP = (j) => setJpLog((p) => [...p, j]);
  const pushLog = (e) => setSesLog((p) => [...p, e]);

  // ── 高精度期待値エンジン ──
  const ev = calcPreciseEV({
    rotRows, startRot, jpLog,
    rentBalls, exRate, synthDenom, rotPerHour,
    totalTrayBalls, border,
    spec1R, specAvgRounds, specSapo,
    chodamaSettings: { includeChodamaInBalance },
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
    setMachineName("");
    setInvestYen(0);
    setRecoveryYen(0);
    setSessionStarted(false);
    setStartGameCount(0);
    setInitialMochiBalls(0);
    setInitialChodama(0);
    setCurrentMochiBalls(0);
    setCurrentChodama(0);
    setSelectedStoreId(null);
  };

  // 台移動: 現在のデータを自動保存して新台へ
  const handleMoveTable = () => {
    if (rotRows.length > 0 || jpLog.length > 0) {
      const now = new Date();
      const safeStats = ev ? Object.fromEntries(
        Object.entries(ev).filter(([, v]) => typeof v === "number" || typeof v === "string")
      ) : {};
      const archive = {
        id: now.getTime(),
        date: now.toISOString().slice(0, 10),
        time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        rotRows: JSON.parse(JSON.stringify(rotRows)),
        jpLog: JSON.parse(JSON.stringify(jpLog)),
        sesLog: JSON.parse(JSON.stringify(sesLog)),
        settings: { rentBalls, exRate, synthDenom, rotPerHour, border, ballVal },
        stats: safeStats,
        totalTrayBalls: totalTrayBalls || 0,
        startRot: startRot || 0,
        storeName: String(storeName || ""),
        machineNum: String(machineNum || ""),
        investYen: Number(investYen) || 0,
        recoveryYen: Number(recoveryYen) || 0,
        machineName: String(machineName || `1/${synthDenom}`),
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
    investPace, setInvestPace,
    spec1R, setSpec1R, specAvgRounds, setSpecAvgRounds, specSapo, setSpecSapo,
    rotRows, setRotRows,
    jpLog, setJpLog, pushJP,
    sesLog, setSesLog,
    pushLog, startRot, setStartRot, setTab,
    totalTrayBalls, setTotalTrayBalls,
    playMode, setPlayMode,
    storeName, setStoreName, machineNum, setMachineNum, machineName, setMachineName,
    investYen, setInvestYen, recoveryYen, setRecoveryYen,
    stores, setStores,
    customMachines, setCustomMachines,
    archives, setArchives,
    ev, handleMoveTable,
    theme, setTheme,
    // 外観
    accentColor, setAccentColor, colorThemes: COLOR_THEMES,
    highContrast, setHighContrast,
    colorBlind, setColorBlind,
    // セキュリ
    appLock, setAppLock, appPin, setAppPin, setIsLocked,
    // 貯玉関連
    includeChodamaInBalance, setIncludeChodamaInBalance,
    chodamaReplayLimit, setChodamaReplayLimit,
    chodamaUsedToday, setChodamaUsedToday,
    // セッション関連
    sessionStarted, setSessionStarted,
    startGameCount, setStartGameCount,
    initialMochiBalls, setInitialMochiBalls,
    initialChodama, setInitialChodama,
    selectedStoreId, setSelectedStoreId,
    // リアルタイム玉数
    currentMochiBalls, setCurrentMochiBalls,
    currentChodama, setCurrentChodama,
    // スタート入力プロンプト
    showStartPrompt, setShowStartPrompt,
    // セッション内サブタブ
    sessionSubTab, setSessionSubTab,
  };

  // カスタムアイコン: 黄色の＋
  const PlusCircleIcon = ({ active }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ filter: active ? "none" : "grayscale(1) opacity(0.5)" }}>
      <circle cx="12" cy="12" r="10" stroke="#facc15" strokeWidth="2" fill="none" />
      <path d="M12 7v10M7 12h10" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const nav = [
    { id: "calendar", label: "記録", icon: "📅" },
    { id: "rot",      label: "新規稼働", icon: "plus" },
    { id: "settings", label: "設定", icon: "⚙️" },
  ];

  const navBg = theme === "light" ? "var(--nav-bg)" : "rgba(17, 17, 22, 0.95)";

  // PINロック画面
  if (isLocked && appLock && appPin) {
    const handlePinKey = (key) => {
      if (key === "del") {
        setPinInput(p => p.slice(0, -1));
        setPinError(false);
        return;
      }
      const next = pinInput + key;
      if (next.length > 4) return;
      setPinInput(next);
      if (next.length === 4) {
        if (next === appPin) {
          setIsLocked(false);
          setPinInput("");
          setPinError(false);
        } else {
          setPinError(true);
          setTimeout(() => { setPinInput(""); setPinError(false); }, 700);
        }
      }
    };

    return (
      <div style={{ background: "var(--accent-grad, linear-gradient(135deg,#667eea,#764ba2))", height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 4, fontFamily: font }}>パチトラッカー</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 32, fontFamily: font }}>PINを入力してください</div>

        {/* ドット表示 */}
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: "50%",
              background: i < pinInput.length ? "#fff" : "rgba(255,255,255,0.3)",
              transition: "background 0.15s ease",
              boxShadow: pinError ? "0 0 0 3px rgba(239,68,68,0.6)" : "none",
            }} />
          ))}
        </div>
        {pinError && <div style={{ fontSize: 12, color: "#fca5a5", marginBottom: 8, fontFamily: font }}>PINが違います</div>}
        <div style={{ marginBottom: 32, height: 16 }} />

        {/* テンキー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 12 }}>
          {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) => (
            k === "" ? <div key={i} /> :
            <button key={i} className="b" onClick={() => handlePinKey(k)} style={{
              height: 72, borderRadius: 36,
              background: k === "del" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", fontSize: k === "del" ? 18 : 24, fontWeight: 700,
              fontFamily: font, cursor: "pointer",
            }}>
              {k === "del" ? "⌫" : k}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", color: C.text, position: "relative", overflow: "hidden" }}>

      {/* Minimal safe-area spacing */}
      <div style={{ height: "env(safe-area-inset-top)", flexShrink: 0 }} />

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          overflowX: "hidden",
          paddingBottom: "calc(52px + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "rot" && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
        {tab === "calendar" && <CalendarTab S={S} onReset={resetAll} />}
        {tab === "settings" && <SettingsTab s={S} onReset={resetAll} />}
      </main>

      {/* Navigation */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: navBg, backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", zIndex: 100 }}>
        {nav.map(({ id, label, icon }) => (
          <button key={id} className="b" onClick={() => setTab(id)} style={{
            flex: 1, background: "transparent", border: "none",
            borderTop: tab === id ? `2px solid ${C.blue}` : "2px solid transparent",
            padding: "6px 0 5px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all 0.2s ease"
          }}>
            {icon === "plus" ? (
              <PlusCircleIcon active={tab === id} />
            ) : (
              <span style={{ fontSize: 18, filter: tab === id ? "none" : "grayscale(1) opacity(0.5)" }}>{icon}</span>
            )}
            <span style={{ fontSize: 9, fontWeight: tab === id ? 800 : 500, color: tab === id ? C.blue : C.sub, fontFamily: font, letterSpacing: 0.3 }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
