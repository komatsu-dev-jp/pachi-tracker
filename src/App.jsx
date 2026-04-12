import React, { useState, useEffect } from "react";
import { useLS, calcPreciseEV } from "./logic";
import { C, font } from "./constants";
import { RotTab, HistoryTab, SettingsTab, CalendarTab } from "./components/Tabs";

export default function App() {
  const [tab, setTab] = useState("rot");

  // Theme management
  const [theme, setTheme] = useLS("pt_theme", "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);


  // Settings
  const [rentBalls, setRentBalls] = useLS("pt_rentBalls", 250);
  const [exRate, setExRate] = useLS("pt_exRate", 250);
  const [synthDenom, setSynthDenom] = useLS("pt_synthDenom", 319.6);
  const [rotPerHour, setRotPerHour] = useLS("pt_rotPerHour", 250);
  const [border, setBorder] = useLS("pt_border", 20);
  const [investPace, setInvestPace] = useLS("pt_investPace", 1000); // 投資金額ペース: 500, 1000円
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

  // セッション内サブタブ（稼働中のヘッダーナビゲーション用）
  const [sessionSubTab, setSessionSubTab] = useState("rot");

  // Session info (店舗・台番号・投資・回収・機種名)
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

  // 一時的なデータクリーンアップ: 3/23のデータのみ残す
  useEffect(() => {
    const cleaned = localStorage.getItem("pt_archives_cleaned_0323");
    if (!cleaned && archives.length > 0) {
      const filtered = archives.filter(a => a.date === "2026-03-23");
      if (filtered.length !== archives.length) {
        setArchives(filtered);
        localStorage.setItem("pt_archives_cleaned_0323", "true");
        console.log(`Archives cleaned: ${archives.length} -> ${filtered.length} (kept only 3/23)`);
      }
    }
  }, []);

  // 日付変更時に貯玉使用量をリセット
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (chodamaLastDate !== today) {
      setChodamaUsedToday(0);
      setChodamaLastDate(today);
    }
  }, [chodamaLastDate]);

  const pushJP = (j) => setJpLog((p) => [...p, j]);
  const delJPLast = () => {
    setJpLog((p) => {
      if (p.length === 0) return p;
      const lastChain = p[p.length - 1];
      // 削除するチェーンが完了している場合、持ち玉と上皿玉を減算
      if (lastChain.completed) {
        const trayToRemove = lastChain.trayBalls || 0;
        setTotalTrayBalls((prev) => Math.max(0, prev - trayToRemove));

        // rotRowsから対応するhit行と後続のすべての行を削除
        setRotRows((rows) => {
          // 最後のhit行のインデックスを探す
          let lastHitIndex = -1;
          for (let i = rows.length - 1; i >= 0; i--) {
            if (rows[i].type === "hit") {
              lastHitIndex = i;
              break;
            }
          }
          if (lastHitIndex === -1) return rows;

          // hit行の時点の持ち玉に戻す（大当たり開始時点）
          const hitRow = rows[lastHitIndex];
          setCurrentMochiBalls(hitRow.mochiBalls || 0);

          // 最初のstart行のcumRotをstartRotに復元
          const firstStartRow = rows.find(r => r.type === "start");
          if (firstStartRow) {
            setStartRot(firstStartRow.cumRot || 0);
          }

          // hit行とそれ以降のすべての行を削除
          return rows.slice(0, lastHitIndex);
        });

        // プレイモードを現金に戻す
        setPlayMode("cash");
      }
      return p.slice(0, -1);
    });
  };
  const pushLog = (e) => setSesLog((p) => [...p, e]);
  const delSesLast = () => setSesLog((p) => p.slice(0, -1));

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
    // セッション関連リセット
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
    // データがある場合のみ保存
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

  // カスタムアイコン: 黄色の＋（空白の○の中）
  const PlusCircleIcon = ({ active }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ filter: active ? "none" : "grayscale(1) opacity(0.5)" }}>
      <circle cx="12" cy="12" r="10" stroke="#facc15" strokeWidth="2" fill="none" />
      <path d="M12 7v10M7 12h10" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const nav = [
    { id: "rot", label: "新規稼働", icon: "plus" },
    { id: "history", label: "大当たり", icon: "📋" },
    { id: "calendar", label: "記録", icon: "📅" },
    { id: "settings", label: "設定", icon: "⚙️" },
  ];

  // Dynamic styles based on theme
  const navBg = theme === "light" ? "var(--nav-bg)" : "rgba(17, 17, 22, 0.95)";

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
          paddingBottom: "calc(70px + env(safe-area-inset-bottom))",
        }}
      >
        {tab === "rot" && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
        {tab === "history" && <HistoryTab jpLog={jpLog} sesLog={sesLog} pushJP={pushJP} delJPLast={delJPLast} delSesLast={delSesLast} S={S} ev={ev} />}
        {tab === "calendar" && <CalendarTab S={S} onReset={resetAll} />}
        {tab === "settings" && <SettingsTab s={S} onReset={resetAll} />}
      </main>

      {/* Navigation */}
      <nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: navBg, backdropFilter: "blur(20px)", borderTop: `1px solid ${C.border}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom)", zIndex: 100 }}>
        {nav.map(({ id, label, icon }) => (
          <button key={id} className="b" onClick={() => setTab(id)} style={{
            flex: 1, background: "transparent", border: "none",
            borderTop: tab === id ? `3px solid ${C.blue}` : "3px solid transparent",
            padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transition: "all 0.2s ease"
          }}>
            {icon === "plus" ? (
              <PlusCircleIcon active={tab === id} />
            ) : (
              <span style={{ fontSize: 20, filter: tab === id ? "none" : "grayscale(1) opacity(0.5)" }}>{icon}</span>
            )}
            <span style={{ fontSize: 10, fontWeight: tab === id ? 800 : 500, color: tab === id ? C.blue : C.sub, fontFamily: font, letterSpacing: 0.5 }}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
