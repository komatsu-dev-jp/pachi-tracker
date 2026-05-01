import React, { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
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
  const [theme, setTheme] = useLS("pt_theme", "light");

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

  // 起動時セッション整合性チェック（電池切れ・強制終了で片肺になった LS を検出）
  // 自動修復はせず、ユーザーに確認を求めるだけ
  const [integrityIssues, setIntegrityIssues] = useState(null);
  const integrityCheckedRef = useRef(false);
  useEffect(() => {
    if (integrityCheckedRef.current) return;
    if (isLocked) return; // 解錠後にチェック
    integrityCheckedRef.current = true;
    const issues = [];
    // (1) 未完了チェーンが jpLog 末尾にあるのに rotRows 側に対応 hit が 0 件
    const lastChain = jpLog && jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    if (lastChain && lastChain.completed === false && lastChain.chainId) {
      const hasHits = (rotRows || []).some(r => r.type === "hit" && r.chainId === lastChain.chainId);
      if (!hasHits && (lastChain.hits || []).length > 0) {
        issues.push({
          key: "chain-rotrow-mismatch",
          msg: "未完了の連チャンと回転データの整合が取れていません",
        });
      }
    }
    // (2) 選択中店舗の貯玉と currentChodama の乖離（差分 > 1 玉）
    if (selectedStoreId) {
      const st = (stores || []).find(s => typeof s === "object" && s.id === selectedStoreId);
      if (st && Math.abs((st.chodama || 0) - (currentChodama || 0)) > 1) {
        issues.push({
          key: "chodama-mismatch",
          msg: `店舗貯玉(${st.chodama || 0})とセッション貯玉(${currentChodama || 0})が一致しません`,
        });
      }
    }
    if (issues.length > 0) setIntegrityIssues(issues);
    // 依存は意図的に空。マウント＋解錠遷移後に 1 回だけ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

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
    // セッション終了前に選択中の店舗の貯玉残高を自動更新
    if (selectedStoreId) {
      setStores(prev => prev.map(st =>
        typeof st === "object" && st.id === selectedStoreId
          ? { ...st, chodama: currentChodama }
          : st
      ));
    }
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
  // archive 書き込みを flushSync で確定させてから reset に進み、
  // pt_archives と reset 系の間に唯一の atomic 境界を作る（途中クラッシュで
  // 「reset だけ走って archive が無い」事故を防ぐ）。
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
        initialChodama: initialChodama || 0,
        finalChodama: currentChodama || 0,
        chodamaNetBalls: (currentChodama || 0) - (initialChodama || 0),
        chodamaYen: Math.round((ev?.chodamaKCount || 0) * 1000 * (exRate || 250) / (rentBalls || 250)),
        isMoveArchive: true,
      };
      // archive 書き込みを同期 flush（useLS 内の localStorage.setItem まで完走）
      flushSync(() => {
        setArchives((prev) => [...prev, archive]);
      });
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

  // iOS風 細線アイコン
  const CalendarIcon = ({ active }) => {
    const col = active ? C.blue : C.sub;
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 9.5h17" />
        <path d="M8 3v4M16 3v4" />
      </svg>
    );
  };

  const PlusCircleIcon = ({ active }) => {
    const col = active ? C.blue : C.sub;
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M12 7.5v9M7.5 12h9" />
      </svg>
    );
  };

  const GearIcon = ({ active }) => {
    const col = active ? C.blue : C.sub;
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    );
  };

  const nav = [
    { id: "calendar", label: "記録",     IconC: CalendarIcon },
    { id: "rot",      label: "新規稼働", IconC: PlusCircleIcon },
    { id: "settings", label: "設定",     IconC: GearIcon },
  ];

  const navBg = "var(--nav-bg)";

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
      <div style={{ background: C.bg, height: "100dvh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4, fontFamily: font }}>パチトラッカー</div>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 32, fontFamily: font }}>PINを入力してください</div>

        {/* ドット表示 */}
        <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: 14, height: 14, borderRadius: "50%",
              background: i < pinInput.length ? C.blue : "transparent",
              border: `1.5px solid ${pinError ? C.red : (i < pinInput.length ? C.blue : C.borderHi)}`,
              transition: "background 0.15s ease, border-color 0.15s ease",
            }} />
          ))}
        </div>
        {pinError && <div style={{ fontSize: 12, color: C.red, marginBottom: 8, fontFamily: font }}>PINが違います</div>}
        <div style={{ marginBottom: 32, height: 16 }} />

        {/* テンキー */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: 12 }}>
          {["1","2","3","4","5","6","7","8","9","","0","del"].map((k, i) => (
            k === "" ? <div key={i} /> :
            <button key={i} className="b" onClick={() => handlePinKey(k)} style={{
              height: 72, borderRadius: 36,
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text, fontSize: k === "del" ? 18 : 24, fontWeight: 600,
              fontFamily: font, cursor: "pointer",
              boxShadow: "var(--card-shadow)",
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

      {/* 起動時整合性チェック: 電池切れ・強制終了で片肺になった可能性を通知 */}
      {integrityIssues && integrityIssues.length > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
        }}>
          <div style={{
            background: C.surface, color: C.text, borderRadius: 16,
            maxWidth: 420, width: "100%", padding: 20,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            fontFamily: font,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>セッション整合性の警告</div>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.5 }}>
              強制終了などで保存が片肺になった可能性があります。データを確認してください（自動修復はしません）。
            </div>
            <ul style={{ margin: "0 0 16px 0", paddingLeft: 20, fontSize: 13, color: C.text, lineHeight: 1.6 }}>
              {integrityIssues.map(iss => <li key={iss.key}>{iss.msg}</li>)}
            </ul>
            <button className="b" onClick={() => setIntegrityIssues(null)} style={{
              width: "100%", padding: "12px 0", borderRadius: 12,
              background: C.blue, border: "none", color: "#fff",
              fontSize: 15, fontWeight: 700, fontFamily: font,
            }}>
              確認しました
            </button>
          </div>
        </div>
      )}

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
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: navBg, backdropFilter: "saturate(180%) blur(20px)", borderTop: `1px solid ${C.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", zIndex: 100 }}>
        {nav.map((item) => {
          const Icon = item.IconC;
          return (
            <button key={item.id} className="b" onClick={() => setTab(item.id)} style={{
              flex: 1, background: "transparent", border: "none",
              padding: "10px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.2s ease"
            }}>
              <Icon active={tab === item.id} />
              <span style={{ fontSize: 10, fontWeight: tab === item.id ? 700 : 500, color: tab === item.id ? C.blue : C.sub, fontFamily: font, letterSpacing: 0.2 }}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
