import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLS, calcPreciseEV } from "./logic";
import { useUndoStack } from "./history";
import { C, font, tsNow } from "./constants";
import { searchMachines } from "./machineDB";
import { RotTab, SettingsTab } from "./components/Tabs";
import ModeTabBar from "./components/ModeTabBar";
import HomeDashboard from "./components/home/HomeDashboard";
import AnalysisDashboard from "./components/analysis/AnalysisDashboard";
import ScoutDashboard from "./components/scout/ScoutDashboard";
import StrategyMapDashboard from "./components/strategy/StrategyMapDashboard";
import StoreDetail from "./pages/StoreDetail";
import DeltaAnalyzer from "./components/delta/DeltaAnalyzer";
import DeltaMapView from "./components/delta/DeltaMapView";
import { getStoreIslands } from "./components/select/hallMapSelectors";
import {
  addXpWithLevelUp,
  applyDailyStreak,
  computeMigratedRank,
  deriveRankFromTotalXp,
  initialRank,
  XP_JP_HIT,
  XP_ROT_1000,
  XP_SESSION_COMPLETE,
} from "./components/hunter/hunterRank";
import LevelUpToast from "./components/hunter/LevelUpToast";
import NotificationPanel from "./components/NotificationPanel";
import {
  computeBadgeMetrics,
  evaluateBadgeUnlocks,
  unlockBadges,
} from "./components/hunter/badges";
import { evDecision } from "./components/decision/evDecision";
import { runEvidence } from "./evidence";
import { machineDB } from "./machineDB";
import {
  buildDeltaEvidence,
  collectDeltaRows,
  findMachineSpec,
} from "./components/delta/deltaEvidence";
import {
  addNotification as appendNotification,
  makeNotification,
  markAsRead as markNotifAsRead,
  markAllAsRead as markAllNotifAsRead,
  clearAll as clearNotifAll,
  normalizeNotificationPrefs,
  isNotificationEnabled,
  NOTIF_LEVEL_UP,
  NOTIF_STREAK,
  NOTIF_BADGE_UNLOCKED,
  NOTIF_VERDICT_CHANGE,
} from "./notifications";
import { takeSnapshot, takeSnapshotImmediate, getLatest as getLatestSnapshot } from "./snapshot";
import { setupGlobalHaptics } from "./haptics";
import EHIME_STORES from "./data/ehimeStores";
import {
  mergeBuiltinStores,
  normalizeAutoLockMinutes,
  shouldAutoLock,
  updateStoresForSessionReset,
} from "./settingsUtils";
import {
  calculateYutimeEV,
  deriveCurrentLowProbabilitySpins,
  deriveNormalExpectedNetBalls,
} from "./components/yutime/yutimeCalculator";

// 旧タブ名 → 新モード名 のマッピング
// Tabs.jsx 内から S.setTab("rot" | "calendar" | "settings") が呼ばれるため、
// 後方互換のためマッピングを保持する。
const LEGACY_TAB_TO_MODE = {
  rot: "record",
  calendar: "analysis",
  settings: "settings",
};

// verdict ID を日本語ラベルに変換（通知本文用）
const VERDICT_LABELS = {
  continue_strong: "続行（強）",
  continue: "続行",
  hold: "様子見",
  stop: "ヤメ",
};
function verdictLabel(v) {
  return VERDICT_LABELS[v] || String(v || "");
}
function verdictBodyText(decision) {
  if (!decision) return "";
  const ev = Number(decision.evAdjusted);
  const conf = Number(decision.confidence);
  const parts = [];
  if (Number.isFinite(ev)) parts.push(`EV/K ${ev >= 0 ? "+" : ""}${Math.round(ev)}円`);
  if (Number.isFinite(conf)) parts.push(`信頼度 ${Math.round(conf * 100)}%`);
  return parts.join(" / ");
}

const COLOR_THEMES = [
  { id: "purple", label: "パープル", gradient: "linear-gradient(135deg,#667eea,#764ba2)", primary: "#667eea" },
  { id: "teal", label: "ブルー", gradient: "linear-gradient(135deg,#0093E9,#80D0C7)", primary: "#0093E9" },
  { id: "green", label: "グリーン", gradient: "linear-gradient(135deg,#11998e,#38ef7d)", primary: "#11998e" },
  { id: "orange", label: "オレンジ", gradient: "linear-gradient(135deg,#f7971e,#ffd200)", primary: "#f7971e" },
  { id: "red", label: "レッド", gradient: "linear-gradient(135deg,#cb2d3e,#ef473a)", primary: "#ef473a" },
  { id: "pink", label: "ピンク", gradient: "linear-gradient(135deg,#ee0979,#ff6a00)", primary: "#ee0979" },
  { id: "lavender", label: "ラベンダー", gradient: "linear-gradient(135deg,#a18cd1,#fbc2eb)", primary: "#a18cd1" },
  { id: "emerald", label: "エメラルド", gradient: "linear-gradient(135deg,#0cebeb,#20e3b2)", primary: "#20e3b2" },
  { id: "cyan", label: "シアン", gradient: "linear-gradient(135deg,#43cea2,#185a9d)", primary: "#43cea2" },
  { id: "yellow", label: "イエロー", gradient: "linear-gradient(135deg,#f6d365,#fda085)", primary: "#f6d365" },
];

export default function App() {
  // 現在のモード: "home" | "scout" | "select" | "record" | "analysis" | "settings"
  // 新規ユーザーはホーム画面から始まる。既存ユーザーは保存済みの値を維持。
  const [currentMode, setCurrentMode] = useLS("pt_currentMode", "home");

  // 店舗詳細画面（storeDetail モード）で表示対象の店舗ID。
  // react-router 等は導入せず、既存の currentMode 方式に合わせて state で管理する。
  // TODO: 店舗一覧・店舗検索からの遷移導線は次ステップで実装（現状は見た目優先プロトタイプ）。
  const [storeDetailId, setStoreDetailId] = useState(null);

  // 分析モード内の期間サブタブ
  // "month" | "year" | "all" | "calendar"
  const [analysisTab, setAnalysisTab] = useLS("pt_analysisTab", "month");

  // 分析モードの絞り込み条件（AND 条件で結合）
  //   storeName    : 店舗名（完全一致、"" = 全店舗）
  //   machineName  : 機種名（完全一致、"" = 全機種）
  //   dateStart    : "YYYY-MM-DD" 開始日（含む、"" = 制限なし）
  //   dateEnd      : "YYYY-MM-DD" 終了日（含む、"" = 制限なし）
  //   weekdays     : 曜日（0=日..6=土の配列、[] = 全曜日）
  const [analysisFilters, setAnalysisFilters] = useLS("pt_analysisFilters", {
    storeName: "",
    machineName: "",
    dateStart: "",
    dateEnd: "",
    weekdays: [],
  });

  // 後方互換: Tabs.jsx 内の S.setTab("rot" | "calendar" | "settings") を新モードへ変換
  // 旧 "calendar" タブはカレンダー一覧（既存 UI）を期待しているので、
  // 分析モードのカレンダー サブタブを選択した状態で遷移させる
  const setTab = useCallback((legacy) => {
    if (legacy === "calendar") {
      setCurrentMode("analysis");
      setAnalysisTab("calendar");
      return;
    }
    setCurrentMode(LEGACY_TAB_TO_MODE[legacy] ?? legacy);
  }, [setCurrentMode, setAnalysisTab]);

  // Theme management
  const [theme, setTheme] = useLS("pt_theme", "dark");

  // Appearance
  const [accentColor, setAccentColor] = useLS("pt_accentColor", "purple");
  const [highContrast, setHighContrast] = useLS("pt_highContrast", false);
  const [colorBlind, setColorBlind] = useLS("pt_colorBlind", false);
  const [hapticFeedback, setHapticFeedback] = useLS("pt_hapticFeedback", true);

  // Security
  const [appLock, setAppLock] = useLS("pt_appLock", false);
  const [appPin, setAppPin] = useLS("pt_appPin", "");
  const [autoLockMinutes, setAutoLockMinutes] = useLS("pt_autoLockMinutes", 0);
  const [isLocked, setIsLocked] = useState(() => appLock);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const hiddenAtRef = useRef(null);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (!appLock || !appPin) {
        hiddenAtRef.current = null;
        return;
      }
      const mode = normalizeAutoLockMinutes(autoLockMinutes);
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        if (mode === "background") setIsLocked(true);
        return;
      }
      if (document.visibilityState === "visible") {
        if (shouldAutoLock({ autoLockMinutes: mode, hiddenAt: hiddenAtRef.current })) {
          setIsLocked(true);
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [appLock, appPin, autoLockMinutes]);

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

  // タップ触覚フィードバック：設定ONの間だけ全ページ共通のタップ検知を張る
  useEffect(() => {
    if (!hapticFeedback) return;
    return setupGlobalHaptics();
  }, [hapticFeedback]);

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
  // 遊タイム関連設定（0 = 未設定 / 天井非搭載機種）。設定された場合のみ記録モードに分析カードを表示
  const [ceilingRot, setCeilingRot] = useLS("pt_ceilingRot", 0);
  const [yutimePayout, setYutimePayout] = useLS("pt_yutimePayout", 0);
  const [yutimeSession, setYutimeSession] = useLS("pt_yutimeSession", null);
  const [yutimeDecision, setYutimeDecision] = useLS("pt_yutimeDecision", null);
  const [yutimeMigratedV2, setYutimeMigratedV2] = useLS("pt_yutimeMigratedV2", false);

  // 旧設定は一度だけ新形式へ移す。元の pt_* は削除せず、バックアップ互換を保つ。
  useEffect(() => {
    if (yutimeMigratedV2) return;
    if (!yutimeSession && Number(ceilingRot) > 0) {
      setYutimeSession({
        machineName: "",
        triggerLowSpins: Math.round(Number(ceilingRot)),
        durationSpins: 0,
        expectedNetBalls: Number(yutimePayout) > 0 ? Number(yutimePayout) : null,
        assumedStart1K: Number(border) > 0 ? Number(border) : 0,
        sourceUrl: "",
        verifiedAt: "",
        source: "legacy",
      });
    }
    setYutimeMigratedV2(true);
  }, [yutimeMigratedV2, yutimeSession, ceilingRot, yutimePayout, border, setYutimeSession, setYutimeMigratedV2]);

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
  // 貯玉入出金履歴（手動の預入/引出/調整のジャーナル。残高の真実源は stores[].chodama）
  const [chodamaLog, setChodamaLog] = useLS("pt_chodamaLog", []);

  // セッション中のリアルタイム玉数
  const [currentMochiBalls, setCurrentMochiBalls] = useLS("pt_currentMochiBalls", 0);
  const [currentChodama, setCurrentChodama] = useLS("pt_currentChodama", 0);

  // セッション開始時の初期値
  const [sessionStarted, setSessionStarted] = useLS("pt_sessionStarted", false);
  const [startGameCount, setStartGameCount] = useLS("pt_startGameCount", 0);
  const [initialMochiBalls, setInitialMochiBalls] = useLS("pt_initialMochiBalls", 0);
  const [initialChodama, setInitialChodama] = useLS("pt_initialChodama", 0);
  const [selectedStoreId, setSelectedStoreId] = useLS("pt_selectedStoreId", null);
  // 台移動で現在の台へ持ち込んだ持ち玉の円換算額（コストベース按分の原資）。
  // 台移動時に「直前の台の持ち出し玉×玉単価」をセット、resetAll で 0 に戻す。
  const [carriedInYen, setCarriedInYen] = useLS("pt_carriedInYen", 0);
  // セッション開始日（持ち玉の日付跨ぎ検知に使用。YYYY-MM-DD。未稼働時は ""）
  const [sessionStartDate, setSessionStartDate] = useLS("pt_sessionStartDate", "");

  // 時短/大当たり終了後のスタート入力プロンプト表示フラグ
  const [showStartPrompt, setShowStartPrompt] = useState(false);

  // セッション内サブタブ
  const [sessionSubTab, setSessionSubTab] = useState("rot");

  // 下部タブから「記録」モードへ遷移した際は、必ず実戦サブタブを最初に表示する。
  // sessionSubTab が "history" のまま残っていると、初当たり入力モーダルが
  // 自動で開く挙動になっていたため（Tabs.jsx の auto-open useEffect 参照）。
  const handleModeChange = useCallback((nextMode) => {
    // 実戦中に大当たりチェーンが記録途中（completed:false）のまま
    // 記録画面から離れようとした場合のみ確認を挟む（誤タップ離脱防止）
    if (
      currentMode === "record" &&
      nextMode !== "record" &&
      sessionStarted &&
      (jpLog || []).some((c) => c && c.completed === false)
    ) {
      const ok = window.confirm("大当たり記録が入力途中です。\n記録画面から移動しますか？");
      if (!ok) return;
    }
    if (nextMode === "record") {
      setSessionSubTab("rot");
    }
    setCurrentMode(nextMode);
  }, [currentMode, sessionStarted, jpLog, setCurrentMode]);

  // Session info
  const [storeName, setStoreName] = useLS("pt_storeName", "");
  const [machineNum, setMachineNum] = useLS("pt_machineNum", "");
  const [machineName, setMachineName] = useLS("pt_machineName", "");
  const [investYen, setInvestYen] = useLS("pt_investYen", 0);
  const [recoveryYen, setRecoveryYen] = useLS("pt_recoveryYen", 0);

  // Registered stores
  const [stores, setStores] = useLS("pt_stores", []);
  // 内蔵店舗リスト（愛媛・松山/伊予エリア）の初回自動登録フラグ。
  // 一度シードしたら true にし、以降は再シードしない（ユーザーが削除しても復活させない）。
  const [storesSeeded, setStoresSeeded] = useLS("pt_storesSeeded", false);
  // 店舗リスト V2 移行フラグ: P-WORLD正式データへの全置き換えを一度だけ実行する。
  const [storesMigratedV2, setStoresMigratedV2] = useLS("pt_storesMigratedV2", false);

  // 台選び：店舗ごとのホールマップ（島配置）編集データ
  // スキーマ: { [storeId]: Island[] } / Island = { id, name, start, end, machineName }
  // 台選び専用の独立した設定データ。rotRows（回転数記録）とは無関係に保つ。
  const [hallMaps, setHallMaps] = useLS("pt_hallMaps", {});

  // 差玉解析：保存済みスキャン（出玉グラフ画像解析の結果）
  // スキーマ: Scan[] / Scan = { id, storeId, storeName, date("YYYY-MM-DD"), machineName, rows, createdAt }
  //   rows[] = { num, val, px, rank, island?, machineName?, normalSpins?, totalStarts? }
  // 台選び専用の独立データ。rotRows（回転数記録）とは無関係に保つ。
  const [deltaScans, setDeltaScans] = useLS("pt_deltaScans", []);

  // 差玉解析：AI読み取り用のAnthropic APIキー（任意設定・この端末のみに保存）
  const [aiApiKey, setAiApiKey] = useLS("pt_aiApiKey", "");

  // Custom machines
  const [customMachines, setCustomMachines] = useLS("pt_customMachines", []);

  // Archives
  const [archives, setArchives] = useLS("pt_archives", []);

  // 月間期待値目標（ホーム画面の目標カード用 / 円）
  // 既存ユーザーは保存値、未設定は 100,000 円をデフォルトとして表示する。
  const [monthlyEvTarget, setMonthlyEvTarget] = useLS("pt_monthlyEvTarget", 100000);

  // ハンターランク（Phase 6 本実装版）
  // - XP トリガー: セッション完了 +50 / 大当たり +20 / 通常回転 1000 ごと +10 / 7日連続 +100
  // - 状態は pt_hunterRank に集約。トリガー検出用のカウンタは pt_hunterCounters に分離
  const [hunterRank, setHunterRank] = useLS("pt_hunterRank", initialRank());
  const [hunterRankMigrated, setHunterRankMigrated] = useLS("pt_hunterRankMigrated", false);

  // Phase 6 トリガー検出用のカウンタ・ストリーク状態
  // - countedHits:    XP 計上済みの累計大当たり回数（jpLog の hits 合計と比較）
  // - countedRotKilo: XP 計上済みの 1000 回転マイルストーン数（ev.netRot から導出）
  // - lastDate:       最終加算日（YYYY-MM-DD）
  // - streakDays:     連続日数
  const [hunterCounters, setHunterCounters] = useLS("pt_hunterCounters", {
    countedHits: 0,
    countedRotKilo: 0,
    lastDate: "",
    streakDays: 0,
  });

  // 通知ログ（Phase 6）
  const [notificationLog, setNotificationLog] = useLS("pt_notificationLog", []);
  const [notificationPrefs, setNotificationPrefs] = useLS("pt_notificationPrefs", {
    levelUp: true,
    streak: true,
    badge: true,
    verdict: true,
  });

  // レベルアップトースト表示状態（永続化しない）
  const [levelUpToast, setLevelUpToast] = useState({ show: false, level: 1 });

  // 通知パネル開閉
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  // 通知ログを追加するヘルパー
  const pushNotification = useCallback((notif) => {
    if (!notif) return;
    if (!isNotificationEnabled(notif.type, notificationPrefs)) return;
    setNotificationLog((prev) => appendNotification(prev, notif));
  }, [notificationPrefs, setNotificationLog]);

  // レベルアップ検出付き XP 加算ヘルパー。
  // 大当たり・回転マイルストーン・セッション完了・連続日数の全トリガーで使う。
  const grantXp = useCallback((amount, reason) => {
    const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (safeAmount <= 0) return;
    setHunterRank((prev) => {
      const res = addXpWithLevelUp(prev, safeAmount);
      if (res.leveledUp) {
        setLevelUpToast({ show: true, level: res.toLevel });
        pushNotification(makeNotification(NOTIF_LEVEL_UP, {
          title: `ハンターランク LV ${res.toLevel} に到達`,
          body: reason ? `(${reason})` : "",
          payload: { fromLevel: res.fromLevel, toLevel: res.toLevel },
        }));
      }
      return res.rank;
    });
  }, [setHunterRank, pushNotification]);

  // 初回マイグレーション: 既存 archives 件数から遡及加算
  useEffect(() => {
    if (hunterRankMigrated) return;
    setHunterRank(computeMigratedRank({ archives }));
    // 既存の大当たり数・回転マイルストーン数を「既計上」として記録し、
    // Phase 6 起動時に過去ぶんが二重加算されないようにする。
    const existingHits = (jpLog || []).reduce((sum, c) => sum + ((c?.hits || []).length), 0);
    const existingKilo = Math.max(0, Math.floor((ev?.netRot || 0) / 1000));
    setHunterCounters({
      countedHits: existingHits,
      countedRotKilo: existingKilo,
      lastDate: "",
      streakDays: 0,
    });
    setHunterRankMigrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunterRankMigrated]);

  // 表示用に nextRequired を毎回再導出（保存値は level/currentXp/totalXp のみ）
  const hunterRankDisplay = (() => {
    const d = deriveRankFromTotalXp(hunterRank?.totalXp);
    return { ...hunterRank, ...d };
  })();

  // 日付変更時に貯玉使用量をリセット
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (chodamaLastDate !== today) {
      setChodamaUsedToday(0);
      setChodamaLastDate(today);
    }
  }, [chodamaLastDate, setChodamaUsedToday, setChodamaLastDate]);

  // 初回のみ: 内蔵店舗リストを登録済み店舗へ自動シード（店舗が空の新規ユーザー向け）。
  // rentBalls/exRate は内部値（面値×10）。4円・等価相当の既定値（250）を入れ、店舗ごとに編集可能。
  useEffect(() => {
    if (storesSeeded) return;
    setStoresSeeded(true);
    if (Array.isArray(stores) && stores.length > 0) return;
    setStores(mergeBuiltinStores([], EHIME_STORES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesSeeded]);

  // V2 移行: 既存の店舗・貯玉・会員カードを保持し、内蔵店舗の不足分だけ追加する。
  useEffect(() => {
    if (storesMigratedV2) return;
    setStoresMigratedV2(true);
    setStores((prev) => mergeBuiltinStores(prev, EHIME_STORES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storesMigratedV2]);

  const pushJP = (j) => setJpLog((p) => [...p, j]);
  const pushLog = (e) => setSesLog((p) => [...p, e]);

  // ── 高精度期待値エンジン ──
  const calculatedEv = calcPreciseEV({
    rotRows, startRot, jpLog,
    rentBalls, exRate, synthDenom, rotPerHour,
    totalTrayBalls, border,
    spec1R, specAvgRounds, specSapo,
    chodamaSettings: { includeChodamaInBalance },
  });
  const evidenceMachine = findMachineSpec(machineName, customMachines, machineDB);
  const savedDeltaEvidence = evidenceMachine
    ? buildDeltaEvidence(collectDeltaRows(deltaScans, {
        storeId: selectedStoreId,
        storeName: selectedStoreId == null ? storeName : "",
        machineName,
        num: machineNum,
      }), evidenceMachine)
    : null;
  // 差玉解析の回転率は250玉あたり基準なので、店の貸玉レート（rentBalls/1K）に換算して渡す。
  const evidence = runEvidence(calculatedEv, {
    priorBalls: evidenceMachine?.muraCoef,
    ballsPerK: rentBalls,
    priorRotation: savedDeltaEvidence?.hasEstimate
      ? savedDeltaEvidence.predictedRotation * ((rentBalls || 250) / 250)
      : undefined,
    priorConfidence: savedDeltaEvidence?.hasEstimate ? savedDeltaEvidence.confidence : 0,
  });
  const ev = { ...calculatedEv, evidence: { ...evidence, delta: savedDeltaEvidence } };
  const currentYutimeLowSpins = deriveCurrentLowProbabilitySpins(rotRows);
  const measuredYutimeStart1K = Number(ev?.effectiveStart1K) > 0 ? Number(ev.effectiveStart1K) : 0;
  const yutimeRateSource = measuredYutimeStart1K > 0 ? "measured" : "assumed";
  const activeYutimeSession = yutimeSession && (
    !yutimeSession.machineName || !machineName || yutimeSession.machineName === machineName
  ) ? yutimeSession : null;
  const yutimeLive = activeYutimeSession ? calculateYutimeEV({
    probabilityDenom: synthDenom,
    triggerLowSpins: activeYutimeSession.triggerLowSpins,
    currentLowSpins: currentYutimeLowSpins,
    start1K: measuredYutimeStart1K || activeYutimeSession.assumedStart1K || border,
    normalExpectedNetBalls: deriveNormalExpectedNetBalls({ spec1R, specAvgRounds, specSapo }),
    yutimeExpectedNetBalls: activeYutimeSession.expectedNetBalls,
    rentBalls,
    exRate,
    playMode,
  }) : null;

  // ── Phase 6 XPトリガー：大当たり（jpLog の hits 合計が増えたら +20/件） ──
  // マイグレーション完了後にのみ作動。
  const totalHits = (jpLog || []).reduce((sum, c) => sum + ((c?.hits || []).length), 0);
  useEffect(() => {
    if (!hunterRankMigrated) return;
    const counted = Math.max(0, Math.floor(hunterCounters?.countedHits || 0));
    if (totalHits === counted) return;
    if (totalHits < counted) {
      // hits が減った（履歴削除等）→ カウンタを揃え直すだけで XP は引かない
      setHunterCounters((prev) => ({ ...(prev || {}), countedHits: totalHits }));
      return;
    }
    const delta = totalHits - counted;
    grantXp(delta * XP_JP_HIT, `大当たり ${delta} 回`);
    setHunterCounters((prev) => ({ ...(prev || {}), countedHits: totalHits }));
  }, [totalHits, hunterRankMigrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 6 XPトリガー：通常回転1000ごと +10 ──
  const currentKilo = Math.max(0, Math.floor((ev?.netRot || 0) / 1000));
  useEffect(() => {
    if (!hunterRankMigrated) return;
    const counted = Math.max(0, Math.floor(hunterCounters?.countedRotKilo || 0));
    if (currentKilo === counted) return;
    if (currentKilo < counted) {
      // 回転がリセット（resetAll など）→ カウンタを下げ直すだけ
      setHunterCounters((prev) => ({ ...(prev || {}), countedRotKilo: currentKilo }));
      return;
    }
    const delta = currentKilo - counted;
    grantXp(delta * XP_ROT_1000, `${delta * 1000} 回転到達`);
    setHunterCounters((prev) => ({ ...(prev || {}), countedRotKilo: currentKilo }));
  }, [currentKilo, hunterRankMigrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 6 XPトリガー：連続稼働日数（1日1回判定、7日ごとにボーナス） ──
  // セッション開始時 or 大当たり1回目のいずれかでその日「稼働あり」と判定する。
  const hasActivityToday = (jpLog || []).length > 0 || (rotRows || []).length > 0;
  useEffect(() => {
    if (!hunterRankMigrated) return;
    if (!hasActivityToday) return;
    const today = new Date().toISOString().slice(0, 10);
    if (hunterCounters?.lastDate === today) return;
    const next = applyDailyStreak(hunterCounters, today);
    setHunterCounters((prev) => ({
      ...(prev || {}),
      lastDate: next.lastDate,
      streakDays: next.streakDays,
    }));
    if (next.bonusXp > 0) {
      grantXp(next.bonusXp, `${next.milestone}日連続稼働`);
      pushNotification(makeNotification(NOTIF_STREAK, {
        title: `${next.milestone}日連続稼働ボーナス`,
        body: `+${next.bonusXp} EXP`,
        payload: { streakDays: next.streakDays },
      }));
    }
  }, [hasActivityToday, hunterRankMigrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 6 バッジ解放：レベル・連続日数・累計回転/大当たり/セッション数を監視 ──
  // 各 metrics の変化時に未解放のバッジ条件を評価し、成立分を unlockedBadges に追加 + 通知。
  // 既存ユーザーのマイグレーション直後にも一斉に解放判定が走る（既存実績への遡及付与）。
  const lifetimeRotForBadge = Math.max(0, Math.floor(Number(ev?.netRot) || 0));
  useEffect(() => {
    if (!hunterRankMigrated) return;
    const metrics = computeBadgeMetrics({
      rank: hunterRank,
      hunterCounters,
      archives,
      jpLog,
      ev,
    });
    const newly = evaluateBadgeUnlocks(metrics, hunterRank?.unlockedBadges || []);
    if (newly.length === 0) return;
    setHunterRank((prev) => unlockBadges(prev, newly.map((b) => b.id)));
    for (const b of newly) {
      pushNotification(makeNotification(NOTIF_BADGE_UNLOCKED, {
        title: `バッジ獲得：${b.label}`,
        body: b.description,
        payload: { badgeId: b.id },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hunterRankMigrated,
    hunterRank?.level,
    hunterRank?.totalXp,
    hunterCounters?.streakDays,
    archives?.length,
    totalHits,
    lifetimeRotForBadge,
  ]);

  // ── Phase 6 判定変化通知：実戦タブの verdict 推移を観測し、変化時に通知 ──
  // 同じ verdict への 5 分以内の往復はノイズとして抑制する。
  // ガード:
  //   - マイグレーション未完了は無視（初回起動直後の連発を防ぐ）
  //   - セッション未開始は無視（無稼働時の "stop" 連発を防ぐ）
  //   - prev が null の初回観測は基準値登録のみで通知しない
  const decision = evDecision(ev);
  const prevVerdictRef = useRef(null);
  const lastVerdictNotifyRef = useRef({});
  const VERDICT_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;
  useEffect(() => {
    // セッション終了で基準を完全リセット（次セッションは初回観測扱い）
    if (!sessionStarted) {
      prevVerdictRef.current = null;
      lastVerdictNotifyRef.current = {};
    }
  }, [sessionStarted]);
  useEffect(() => {
    if (!hunterRankMigrated) return;
    if (!sessionStarted) return;
    const newV = decision?.verdict;
    if (!newV) return;
    const prevV = prevVerdictRef.current;
    if (prevV === newV) return;
    if (prevV === null) {
      prevVerdictRef.current = newV;
      return;
    }
    const now = Date.now();
    const lastNotifiedTs = Number(lastVerdictNotifyRef.current[newV]) || 0;
    if (now - lastNotifiedTs < VERDICT_NOTIFY_COOLDOWN_MS) {
      // 抑制対象でも prev は更新しておかないと、次の本物の変化を取りこぼす
      prevVerdictRef.current = newV;
      return;
    }
    prevVerdictRef.current = newV;
    lastVerdictNotifyRef.current = { ...lastVerdictNotifyRef.current, [newV]: now };
    pushNotification(makeNotification(NOTIF_VERDICT_CHANGE, {
      title: `判定が「${verdictLabel(prevV)}」→「${verdictLabel(newV)}」に変化`,
      body: verdictBodyText(decision),
      payload: { from: prevV, to: newV, evAdjusted: decision?.evAdjusted },
    }));
    // decision を deps に含めると毎レンダで参照変化するため verdict のみ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision?.verdict, hunterRankMigrated, sessionStarted]);

  // ── Undo/Redo（直近10操作分のセッション中スナップショット） ──
  const getUndoSnapshot = useCallback(() => ({
    rotRows, jpLog, sesLog,
    currentMochiBalls, totalTrayBalls, currentChodama,
    playMode,
    investYen, recoveryYen,
    startGameCount, startRot,
    initialMochiBalls, initialChodama,
  }), [
    rotRows, jpLog, sesLog,
    currentMochiBalls, totalTrayBalls, currentChodama,
    playMode, investYen, recoveryYen,
    startGameCount, startRot, initialMochiBalls, initialChodama,
  ]);

  const applyUndoSnapshot = useCallback((s) => {
    setRotRows(s.rotRows);
    setJpLog(s.jpLog);
    setSesLog(s.sesLog);
    setCurrentMochiBalls(s.currentMochiBalls);
    setTotalTrayBalls(s.totalTrayBalls);
    setCurrentChodama(s.currentChodama);
    setPlayMode(s.playMode);
    setInvestYen(s.investYen);
    setRecoveryYen(s.recoveryYen);
    setStartGameCount(s.startGameCount);
    setStartRot(s.startRot);
    setInitialMochiBalls(s.initialMochiBalls);
    setInitialChodama(s.initialChodama);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { pushSnapshot: pushUndoSnapshot, undo, redo, canUndo, canRedo } = useUndoStack(
    getUndoSnapshot,
    applyUndoSnapshot
  );

  // ── Phase C-3: cold snapshot（IDB に操作単位で永続化） ──
  // pushSnapshot を呼ぶ全 7 箇所（decide/addHitToChain/連チャン終了系/単発/削除）を
  // 1 ラッパで網羅する設計。Undo 用メモリ stack と cold snapshot を同時に取得。
  const pushSnapshot = useCallback(() => {
    pushUndoSnapshot();
    try {
      takeSnapshot("op", getUndoSnapshot());
    } catch (e) {
      console.error("[snapshot] takeSnapshot error:", e);
    }
  }, [pushUndoSnapshot, getUndoSnapshot]);

  // 起動時の整合性チェック → 不整合なら復旧シートを提示
  const [recoveryCandidate, setRecoveryCandidate] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await getLatestSnapshot();
      if (cancelled || !latest) return;
      const hot = getUndoSnapshot();
      const m = latest.meta || {};
      const hotJpLen = (hot.jpLog || []).length;
      const hotRotLen = (hot.rotRows || []).length;
      const hotJpTailTs = hotJpLen > 0 ? hot.jpLog[hotJpLen - 1].time || null : null;
      // 不整合の代表的パターン:
      // 1) hot の rotRows がスナップショットより少ない（消失）
      // 2) hot の jpLog tail timestamp が一致せずかつ件数も少ない（巻き戻り）
      const mismatch =
        hotRotLen < (m.rotRowsLen || 0) ||
        (m.jpLogTailTs && hotJpTailTs !== m.jpLogTailTs && hotJpLen < (m.jpLogLen || 0));
      if (mismatch) setRecoveryCandidate(latest);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 実戦終了の精算シート（投資・回収の自動算出値を編集して確定）
  const [endSheet, setEndSheet] = useState(null);

  // 起動時：前回の持ち玉が日付を跨いで残っていれば「貯玉化」を促す（持越し検知）
  const [carryOverPrompt, setCarryOverPrompt] = useState(null);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const held = Math.round(currentMochiBalls || 0);
    if (held > 0 && sessionStartDate && sessionStartDate !== today) {
      const store = (stores || []).find(st => typeof st === "object" && st.id === selectedStoreId);
      setCarryOverPrompt({ balls: held, storeId: selectedStoreId || null, storeName: store?.name || "" });
    }
    // 起動時に一度だけ判定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 持越し持ち玉を貯玉化して保存（店舗あり時）→ セッション終了
  const carryOverToChodama = () => {
    if (carryOverPrompt?.storeId && carryOverPrompt.balls > 0) {
      logMochiToChodama(carryOverPrompt.storeId, carryOverPrompt.balls, currentChodama || 0);
      resetAll(carryOverPrompt.balls);
    } else {
      resetAll();
    }
    setCarryOverPrompt(null);
  };
  // 持ち玉のまま今日のセッションとして続行（日付を今日に更新して再表示を防ぐ）
  const carryOverContinue = () => {
    setSessionStartDate(new Date().toISOString().slice(0, 10));
    setCarryOverPrompt(null);
  };
  // 持ち玉を破棄（現金精算済みとして扱い）→ セッション終了
  const carryOverDiscard = () => {
    resetAll();
    setCarryOverPrompt(null);
  };

  // ライフサイクル: バックグラウンド送り / 終了直前に最新状態を atomic 保存
  useEffect(() => {
    const onHide = () => {
      try { takeSnapshotImmediate("lifecycle:hide", getUndoSnapshot()); } catch { /* ignore */ }
    };
    const onVis = () => { if (document.hidden) onHide(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [getUndoSnapshot]);

  // セッション開始時に 1 回保存
  useEffect(() => {
    if (sessionStarted) {
      try { takeSnapshot("session:start", getUndoSnapshot()); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted]);

  const resetAll = (extraChodamaToStore = 0, { persistStoreBalance = true } = {}) => {
    // セッション終了直前の atomic スナップショット（reset 前に確保）
    try { takeSnapshotImmediate("session:end", getUndoSnapshot()); } catch { /* ignore */ }
    // セッション終了前に選択中の店舗の貯玉残高を自動更新
    // extraChodamaToStore: 終了時に「持ち玉を貯玉化」して上乗せする玉数（既定0）
    // 設定画面からのセッション初期化では店舗資産を変更しない。
    setStores((prev) => updateStoresForSessionReset(prev, {
      persistStoreBalance,
      selectedStoreId,
      currentChodama,
      extraChodama: extraChodamaToStore,
    }));
    setSessionStartDate("");
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
    setCarriedInYen(0);
    setYutimeSession(null);
    setYutimeDecision(null);
    // Phase 6 XPトリガー用カウンタもセッション一緒にリセット（次のセッションは 0 から数え直す）
    setHunterCounters((prev) => ({
      countedHits: 0,
      countedRotKilo: 0,
      lastDate: prev?.lastDate || "",
      streakDays: Math.max(0, Math.floor(Number(prev?.streakDays) || 0)),
    }));
    setSelectedStoreId(null);
  };

  // 現在のセッションをアーカイブへ保存（台移動=isMove:true / 実戦終了=isMove:false）。
  // 記録が空なら保存しない。settlement={investYen,recoveryYen} を渡すと収支を記録（実戦終了の精算）。
  const archiveCurrentSession = (isMove, settlement = null) => {
    if (rotRows.length === 0 && jpLog.length === 0) return false;
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
      storeId: selectedStoreId || null,
      machineNum: String(machineNum || ""),
      investYen: settlement ? (Number(settlement.investYen) || 0) : (Number(investYen) || 0),
      recoveryYen: settlement ? (Number(settlement.recoveryYen) || 0) : (Number(recoveryYen) || 0),
      // 台移動で持ち込んだ持ち玉の円換算（投資額に含まれる内数。アーカイブ編集の自動初期値で使用）
      carriedInYen: settlement ? (Number(settlement.carriedInYen) || 0) : 0,
      machineName: String(machineName || `1/${synthDenom}`),
      initialChodama: initialChodama || 0,
      finalChodama: currentChodama || 0,
      chodamaNetBalls: (currentChodama || 0) - (initialChodama || 0),
      chodamaYen: Math.round((ev?.chodamaKCount || 0) * 1000 * (exRate || 250) / (rentBalls || 250)),
      isMoveArchive: isMove,
      // 通常期待値とは合算せず、着席判断時点の遊タイム計算を独立保存する。
      yutimeDecision: yutimeDecision ? JSON.parse(JSON.stringify(yutimeDecision)) : null,
    };
    setArchives((prev) => [...prev, archive]);
    // ハンターランク: 実戦アーカイブ確定で XP 加算（Phase 6：レベルアップ検出付き）
    grantXp(XP_SESSION_COMPLETE, "セッション完了");
    return true;
  };

  // 持ち玉を選択店舗の貯玉へ上乗せした履歴を chodamaLog に追記（残高自体は呼び出し側で更新）。
  const logMochiToChodama = (storeId, balls, before) => {
    const amount = Math.max(0, Math.round(Number(balls) || 0));
    if (!storeId || amount <= 0) return;
    const store = (stores || []).find(st => typeof st === "object" && st.id === storeId);
    const beforeBal = Math.max(0, Math.round(Number(before) || 0));
    setChodamaLog((prev) => [{
      id: Date.now() + Math.random(),
      date: new Date().toISOString().slice(0, 10),
      storeId,
      storeName: store?.name || "",
      type: "deposit",
      balls: amount,
      balanceBefore: beforeBal,
      balanceAfter: beforeBal + amount,
      memo: "持ち玉を貯玉化",
    }, ...prev]);
  };

  // 台移動: 現在のデータを自動保存し、持ち玉・貯玉・店舗・レートを引き継いで新台へ。
  // ※同日内の台移動は玉箱を持って移動する＝持ち玉で続行できるようにする。
  // 収支按分（コストベース）: この台の投資 = 持ち込んだ持ち玉(carriedInYen) + この台の現金投資(rawInvest)、
  //   回収 = 持ち出す持ち玉の円換算。次台の carriedInYen には今回の持ち出し額をセット（相殺で合計は正確）。
  // mochiOverride: モーダルで修正した「移動前の持ち玉」（未指定なら currentMochiBalls を使用）
  // dest: 移動先の機種情報 { machineName, machineNum, synthDenom, spec1R, specAvgRounds, specSapo }（任意）
  const handleMoveTable = (mochiOverride, dest = {}) => {
    const carriedMochi = mochiOverride !== undefined ? Math.max(0, Math.round(mochiOverride)) : (currentMochiBalls || 0);
    const carriedChodama = currentChodama || 0;
    // ballYen: 選択中の店舗の換金率を優先（グローバルstateのズレを回避）
    const store = (stores || []).find(st => typeof st === "object" && st.id === selectedStoreId);
    const ballYen = store?.exRate > 0 ? 1000 / store.exRate : (exRate > 0 ? 1000 / exRate : (Number(ballVal) > 0 ? Number(ballVal) : 4));
    const carriedOutYen = Math.round(carriedMochi * ballYen); // この台の回収（持ち出し玉の価値）
    const machineInvest = Math.round(Number(carriedInYen) || 0) + Math.round(ev?.rawInvest || 0);
    // 旧台のデータを先にアーカイブ（この時点の機種名・スペックは旧台のまま保存する）。
    archiveCurrentSession(true, { investYen: machineInvest, recoveryYen: carriedOutYen, carriedInYen });
    // 玉箱を持っての移動は「持ち玉」で続行する。持ち玉が無ければ貯玉、それも無ければ現金。
    // ※直前の playMode をそのまま引き継ぐと、貯玉/現金モードのまま移動した際に
    //   移動先で入力した持ち玉が表示に反映されず「貯玉」として表示されるバグになる。
    //   持ち込んだ資産からモードを決定して記録画面の持ち玉/貯玉表示を一致させる。
    const carriedMode = carriedMochi > 0 ? "mochi" : (carriedChodama > 0 ? "chodama" : "cash");
    try { takeSnapshotImmediate("table:move", getUndoSnapshot()); } catch { /* ignore */ }
    // 移動先の開始回転数（新台の台データ表示値）。未入力なら従来どおり0。
    // startRot は回転数計算には使われない表示/基準値だが、スタート行の cumRot に
    // 反映することで最初の回転入力の差分（thisRot）が新台の実回転になる（稼働開始と同じ挙動）。
    const destStartRot = Math.max(0, Math.round(Number(dest.startRot) || 0));
    // 記録のみクリア（玉資産・店舗・レートは保持）
    setJpLog([]);
    setSesLog([{ type: "台移動", time: tsNow(), rot: destStartRot }]);
    setStartRot(destStartRot);
    setStartGameCount(destStartRot);
    setInvestYen(0);
    setRecoveryYen(0);
    setTotalTrayBalls(0);
    // 移動先の機種情報（移動モーダルで入力）を反映。
    // 入力した項目のみ上書きし、空欄は直前の台の値を保持する（同じ機種への移動を想定）。
    const destName = dest.machineName != null ? String(dest.machineName).trim() : "";
    const destNum = dest.machineNum != null ? String(dest.machineNum).trim() : "";
    if (destName) setMachineName(destName);
    if (destNum) setMachineNum(destNum);
    // 移動先で機種を選択した場合のみスペックを更新（EV計算が新台基準になるように）。
    if (dest.synthDenom != null) setSynthDenom(dest.synthDenom);
    if (dest.spec1R != null) setSpec1R(dest.spec1R);
    if (dest.specAvgRounds != null) setSpecAvgRounds(dest.specAvgRounds);
    if (dest.specSapo != null) setSpecSapo(dest.specSapo);
    setYutimeSession(dest.yutimeSession || null);
    setYutimeDecision(dest.yutimeDecision || null);
    // 引き継いだ玉数を新台の初期値として設定（収支の基準にする）
    setInitialMochiBalls(carriedMochi);
    setInitialChodama(carriedChodama);
    // 表示モードを持ち込んだ資産に合わせる（記録画面の持ち玉/貯玉表示が入力と一致するように）
    setPlayMode(carriedMode);
    // モーダルで入力した玉数を currentMochiBalls にも反映（新台のスタート値と整合）
    setCurrentMochiBalls(carriedMochi);
    // 貯玉遊技の継続: 残っている貯玉(currentChodama)を次台へ確実に引き継ぐ。
    // ※この関数は currentChodama をリセットしないが、台移動時の引き継ぎを
    //   明示するため同値で再設定する（残高は不変・二重計上は起きない）。
    setCurrentChodama(carriedChodama);
    // 次台のコストベース：今回の持ち出し額を「持ち込みコスト」として引き継ぐ
    setCarriedInYen(carriedOutYen);
    // 新台のスタート行を引き継ぎ資産で再シード（開始回転数を cumRot の基準にする）
    setRotRows([{ type: "start", cumRot: destStartRot, yutimeLowSpins: dest.yutimeLowSpins ?? destStartRot, mode: carriedMode, mochiBalls: carriedMochi, chodamaBalls: carriedChodama }]);
    setSessionStarted(true);
    setCurrentMode("record");
  };

  // 実戦終了：精算シートを開く。投資額・回収額を自動算出して初期表示する。
  // 投資額 = ev.rawInvest（実践記録の現金投資累計）、回収額 = 残り持ち玉 × 玉単価。
  const openEndSession = () => {
    // 大当たり記録が途中（completed:false）のまま実戦終了すると出玉が統計から漏れるため確認を挟む。
    // 未完了チェーンが無い通常時は確認なしで従来どおり精算シートを開く（タップ数増えず）。
    if ((jpLog || []).some((c) => c && c.completed === false)) {
      const ok = window.confirm("大当たり記録が入力途中です。\nこのまま実戦を終了しますか？");
      if (!ok) return;
    }
    const heldMochi = Math.round(currentMochiBalls || 0);
    const store = (stores || []).find(st => typeof st === "object" && st.id === selectedStoreId);
    // 店舗の換金率を優先（グローバルstateのズレを回避）
    const ballYen = store?.exRate > 0 ? 1000 / store.exRate : (exRate > 0 ? 1000 / exRate : (Number(ballVal) > 0 ? Number(ballVal) : 4));
    // 打ち始めに消費した貯玉（再プレイ分）。円換算は archiveCurrentSession と同一式で算出し保存値と一致させる。
    const chodamaBalls = Math.round((ev?.chodamaKCount || 0) * (rentBalls || 250));
    const chodamaYen = Math.round((ev?.chodamaKCount || 0) * 1000 * (exRate || 250) / (rentBalls || 250));
    setEndSheet({
      // 投資額（現金分）= この台の現金投資 + 台移動で持ち込んだ持ち玉コスト（按分）
      invest: Math.round(ev?.rawInvest || 0) + Math.round(Number(carriedInYen) || 0),
      heldMochi,
      ballYen,
      cashYen: Math.round(heldMochi * ballYen),
      chodama: Math.round(currentChodama || 0),
      // 打ち始めの残高（開始時の持ち玉・貯玉）と消費した貯玉（玉/円）。収支へは投資と同じくコストとして反映。
      startMochi: Math.round(initialMochiBalls || 0),
      startChodama: Math.round(initialChodama || 0),
      chodamaBalls,
      chodamaYen,
      storeId: selectedStoreId || null,
      storeName: store?.name || "",
      // 機種登録（次回用）判定: 機種名が DB / カスタムの名前集合に無く、スペックが揃っていれば登録候補。
      machineName: String(machineName || ""),
      synthDenom,
      spec1R,
      specAvgRounds,
      specSapo,
      isUnregistered: (() => {
        const name = String(machineName || "").trim();
        if (!name) return false;
        if (!(Number(synthDenom) > 0) || !(Number(spec1R) > 0)) return false;
        const names = new Set(searchMachines("", customMachines).map((m) => m.name));
        return !names.has(name);
      })(),
    });
  };

  // 精算シートの確定：method="cash"（現金精算）|"chodama"（貯玉化）。
  // invest/recovery は編集後の確定値（円）。貯玉化でも持ち玉の現金換算額を回収額として
  // 記録する（その日の収支は現金精算と同じ＝貯玉価値も収支に反映。後日の貯玉消費コストと相殺）。
  const confirmEndSession = ({ method, invest, recovery, registerMachine }) => {
    const investVal = Math.max(0, Math.round(Number(invest) || 0));
    const recoveryVal = Math.max(0, Math.round(Number(recovery) || 0));
    const sheet = endSheet || {};
    // 未登録機種を次回用にカスタム機種へ登録（resetAll で機種情報がクリアされる前に実行）。
    // 形式は Tabs の saveMachine / emptyMachine と同一。同名が既にあれば重複登録しない。
    if (registerMachine && sheet.isUnregistered) {
      const name = String(sheet.machineName || "").trim();
      if (name) {
        setCustomMachines((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          if (list.some((m) => String(m.name || "").trim() === name)) return list;
          return [...list, {
            id: Date.now(),
            name,
            maker: "",
            type: "",
            prob: `1/${sheet.synthDenom}`,
            synthProb: sheet.synthDenom,
            spec1R: sheet.spec1R,
            specAvgTotalRounds: sheet.specAvgRounds,
            specSapo: sheet.specSapo,
            yutime: yutimeSession?.triggerLowSpins ? {
              triggerLowSpins: yutimeSession.triggerLowSpins,
              durationSpins: yutimeSession.durationSpins || 0,
              expectedNetBalls: yutimeSession.expectedNetBalls,
              sourceUrl: yutimeSession.sourceUrl || "",
              verifiedAt: yutimeSession.verifiedAt || "",
              source: "manual",
            } : undefined,
            roundDist: "",
            rushDist: "",
            border: { "4.00": 0, "3.57": 0, "3.33": 0, "3.03": 0 },
          }];
        });
      }
    }
    let extraChodama = 0;
    if (method === "chodama" && sheet.storeId && sheet.heldMochi > 0) {
      // 持ち玉を店舗の貯玉残高へ加算（資産として保存）
      extraChodama = sheet.heldMochi;
      logMochiToChodama(sheet.storeId, sheet.heldMochi, currentChodama || 0);
    }
    archiveCurrentSession(false, { investYen: investVal, recoveryYen: recoveryVal, carriedInYen });
    resetAll(extraChodama);
    setEndSheet(null);
    setCurrentMode("record");
  };

  // 後方互換：従来の handleEndSession 名でも精算シートを開く
  const handleEndSession = openEndSession;

  // 差玉解析（ホームの「解析する」から起動）用の店舗・島データ解決。
  // 旧 SelectDashboard 内のロジックを App.jsx 側へ移設。編集対象店舗は
  // 選択中の店舗 → 無ければ登録済みの先頭店舗。島配置は pt_hallMaps から導出。
  const deltaActiveStore = (() => {
    const list = Array.isArray(stores) ? stores : [];
    const sel = list.find((st) => st && typeof st === "object" && st.id === selectedStoreId);
    if (sel) return sel;
    return list.find((st) => st && typeof st === "object") || null;
  })();
  const deltaIslands = getStoreIslands(hallMaps, deltaActiveStore?.id ?? null);
  // 差玉解析スキャンの保存（pt_deltaScans へ追加。同一 id は置換）。
  const handleSaveDeltaScan = (scan) => {
    if (typeof setDeltaScans !== "function") return;
    setDeltaScans((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const without = list.filter((s) => s && s.id !== scan.id);
      return [...without, scan];
    });
  };

  const S = {
    rentBalls, setRentBalls, exRate, setExRate, synthDenom, setSynthDenom,
    rotPerHour, setRotPerHour, border, setBorder, ballVal, setBallVal,
    investPace, setInvestPace,
    spec1R, setSpec1R, specAvgRounds, setSpecAvgRounds, specSapo, setSpecSapo,
    ceilingRot, setCeilingRot, yutimePayout, setYutimePayout,
    yutimeSession, setYutimeSession,
    activeYutimeSession,
    yutimeDecision, setYutimeDecision,
    yutimeLive, currentYutimeLowSpins, yutimeRateSource,
    rotRows, setRotRows,
    jpLog, setJpLog, pushJP,
    sesLog, setSesLog,
    pushLog, startRot, setStartRot, setTab,
    totalTrayBalls, setTotalTrayBalls,
    playMode, setPlayMode,
    storeName, setStoreName, machineNum, setMachineNum, machineName, setMachineName,
    investYen, setInvestYen, recoveryYen, setRecoveryYen,
    stores, setStores,
    hallMaps, setHallMaps,
    deltaScans, setDeltaScans,
    aiApiKey, setAiApiKey,
    customMachines, setCustomMachines,
    archives, setArchives,
    monthlyEvTarget, setMonthlyEvTarget,
    ev, handleMoveTable, handleEndSession,
    theme, setTheme,
    // 外観
    accentColor, setAccentColor, colorThemes: COLOR_THEMES,
    highContrast, setHighContrast,
    colorBlind, setColorBlind,
    hapticFeedback, setHapticFeedback,
    // セキュリ
    appLock, setAppLock, appPin, setAppPin, setIsLocked,
    autoLockMinutes, setAutoLockMinutes,
    // 貯玉関連
    includeChodamaInBalance, setIncludeChodamaInBalance,
    chodamaReplayLimit, setChodamaReplayLimit,
    chodamaUsedToday, setChodamaUsedToday,
    chodamaLog, setChodamaLog,
    // セッション関連
    sessionStarted, setSessionStarted,
    startGameCount, setStartGameCount,
    initialMochiBalls, setInitialMochiBalls,
    initialChodama, setInitialChodama,
    selectedStoreId, setSelectedStoreId,
    sessionStartDate, setSessionStartDate,
    // リアルタイム玉数
    currentMochiBalls, setCurrentMochiBalls,
    currentChodama, setCurrentChodama,
    // スタート入力プロンプト
    showStartPrompt, setShowStartPrompt,
    // セッション内サブタブ
    sessionSubTab, setSessionSubTab,
    // Undo/Redo
    pushSnapshot, undo, redo, canUndo, canRedo,
    // ハンターランク（Phase 6）
    hunterRank: hunterRankDisplay,
    hunterCounters,
    // 通知（Phase 6）
    notificationLog,
    notificationPrefs: normalizeNotificationPrefs(notificationPrefs), setNotificationPrefs,
    openNotificationPanel: () => setNotificationPanelOpen(true),
  };

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

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
          overflowX: "hidden",
          paddingBottom: "calc(44px + env(safe-area-inset-bottom))",
        }}
      >
        {currentMode === "home" && <HomeDashboard S={S} />}
        {currentMode === "scout" && <ScoutDashboard S={S} />}
        {/* 台選びタブ＝戦略マップ画面（保護対象・無改変）。
            旧 select の strategy 値で永続化された状態も同じ画面へフォールバックさせる。 */}
        {(currentMode === "select" || currentMode === "strategy") && (
          <StrategyMapDashboard S={S} onBack={() => setCurrentMode("home")} />
        )}
        {/* 差玉解析（独立タブにせず、ホームの「解析する」から起動） */}
        {currentMode === "delta" && (
          <DeltaAnalyzer
            store={deltaActiveStore}
            islands={deltaIslands}
            onClose={() => setCurrentMode("home")}
            onSaveScan={handleSaveDeltaScan}
            aiApiKey={typeof aiApiKey === "string" ? aiApiKey : ""}
            onChangeAiApiKey={setAiApiKey}
          />
        )}
        {currentMode === "deltaMap" && (
          <DeltaMapView
            store={deltaActiveStore}
            islands={deltaIslands}
            scans={Array.isArray(deltaScans) ? deltaScans : []}
            onClose={() => setCurrentMode("home")}
          />
        )}
        {currentMode === "record" && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
        {currentMode === "analysis" && (
          <AnalysisDashboard
            S={S}
            onReset={resetAll}
            periodTab={analysisTab}
            onChangePeriodTab={setAnalysisTab}
            filters={analysisFilters}
            onChangeFilters={setAnalysisFilters}
          />
        )}
        {currentMode === "settings" && (
          <SettingsTab
            s={S}
            onReset={() => resetAll(0, { persistStoreBalance: false })}
            onOpenStoreDetail={(store) => {
              setStoreDetailId(store?.id ?? null);
              setCurrentMode("storeDetail");
            }}
          />
        )}
        {/* 店舗詳細。店舗基本情報・貯玉・会員カード・交換率は S.stores から実データ解決（resolveStoreDetail）。
            分析タブ関連はまだダミーのまま（TODO: 別ステップで実装）。既存の店舗検索・登録
            （SettingsTab 内）とは独立した画面。遷移導線は
            ①設定タブの店舗一覧の各行（onOpenStoreDetail）と
            ②ホーム画面の「店舗詳細」カード（S.setTab("storeDetail")）の2箇所。 */}
        {currentMode === "storeDetail" && (
          <StoreDetail
            storeId={storeDetailId}
            S={S}
            onOpenSettings={() => {
              if (storeDetailId != null) setSelectedStoreId(storeDetailId);
              setStoreDetailId(null);
              setCurrentMode("settings");
            }}
            onBack={() => {
              setStoreDetailId(null);
              setCurrentMode("home");
            }}
          />
        )}
      </main>

      {/* Mode Navigation (5 タブ) */}
      <ModeTabBar currentMode={currentMode} onChange={handleModeChange} />

      {/* Phase 6: レベルアップトースト */}
      <LevelUpToast
        show={levelUpToast.show}
        level={levelUpToast.level}
        onClose={() => setLevelUpToast((s) => ({ ...s, show: false }))}
      />

      {/* Phase 6: 通知パネル（ベルから開く） */}
      <NotificationPanel
        open={notificationPanelOpen}
        notifications={notificationLog}
        onClose={() => setNotificationPanelOpen(false)}
        onMarkAllAsRead={() => setNotificationLog((prev) => markAllNotifAsRead(prev))}
        onMarkAsRead={(id) => setNotificationLog((prev) => markNotifAsRead(prev, id))}
        onClear={() => setNotificationLog(clearNotifAll())}
      />

      {recoveryCandidate && (
        <RecoverySheet
          snapshot={recoveryCandidate}
          onRestore={() => {
            applyUndoSnapshot(recoveryCandidate.payload);
            setRecoveryCandidate(null);
          }}
          onKeep={() => setRecoveryCandidate(null)}
          onDiscard={() => {
            resetAll();
            setRecoveryCandidate(null);
          }}
        />
      )}

      {carryOverPrompt && (
        <CarryOverSheet
          prompt={carryOverPrompt}
          onStore={carryOverToChodama}
          onContinue={carryOverContinue}
          onDiscard={carryOverDiscard}
        />
      )}

      {endSheet && (
        <EndSessionSheet
          sheet={endSheet}
          onConfirm={confirmEndSession}
          onCancel={() => setEndSheet(null)}
        />
      )}
    </div>
  );
}

// 実戦終了の精算シート：投資額・回収額（持ち玉の現金換算）を自動表示し、編集して確定する。
function EndSessionSheet({ sheet, onConfirm, onCancel }) {
  const hasStore = !!sheet.storeId;
  const [method, setMethod] = useState("cash"); // "cash" 現金精算 | "chodama" 貯玉化
  const [invest, setInvest] = useState(String(sheet.invest || 0));
  const [recovery, setRecovery] = useState(String(sheet.cashYen || 0));
  // 未登録機種を次回用に登録するか（未登録機種のときのみ表示・既定オン）
  const [registerMachine, setRegisterMachine] = useState(true);
  const investNum = Math.max(0, Math.round(Number(invest) || 0));
  // 貯玉化は持ち玉の現金換算額（cashYen）を回収額として扱う＝収支は現金精算と同じ
  const recoveryNum = method === "chodama"
    ? Math.max(0, Math.round(Number(sheet.cashYen) || 0))
    : Math.max(0, Math.round(Number(recovery) || 0));
  // 打ち始めに消費した貯玉（円）。投資と同じくコストとして収支へ反映（保存は archiveCurrentSession 側で別途記録）。
  const chodamaYen = Math.max(0, Math.round(Number(sheet.chodamaYen) || 0));
  const chodamaBalls = Math.max(0, Math.round(Number(sheet.chodamaBalls) || 0));
  // 合計投資 = 現金投資 + 貯玉消費。収支 = 回収 − 合計投資。
  const totalInvest = investNum + chodamaYen;
  const pl = recoveryNum - totalInvest;
  const fmt = (n) => (n || 0).toLocaleString();
  const inputStyle = {
    width: "100%", boxSizing: "border-box", background: C.bg, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px",
    fontSize: 17, fontWeight: 700, fontFamily: font, textAlign: "right", outline: "none",
  };
  const tab = (active) => ({
    flex: 1, height: 46, borderRadius: 10, fontSize: 13, fontWeight: 700, fontFamily: font, cursor: "pointer",
    border: `1px solid ${active ? C.blue : C.border}`,
    background: active ? C.blue : "transparent",
    color: active ? "#fff" : C.sub,
  });
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div style={{
        background: C.surface, color: C.text, fontFamily: font,
        borderTop: `1px solid ${C.border}`,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
        maxWidth: 480, margin: "0 auto", width: "100%",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>実戦終了・精算</div>
        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 16 }}>
          残った持ち玉 <b style={{ color: C.text }}>{fmt(sheet.heldMochi)}玉</b>
          （現金換算 約¥{fmt(sheet.cashYen)}）。精算方法を選んで保存します。
        </div>

        {/* 精算方法の選択（貯玉化は店舗選択時のみ） */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setMethod("cash")} style={tab(method === "cash")}>現金で精算</button>
          {hasStore && (
            <button onClick={() => setMethod("chodama")} style={tab(method === "chodama")}>貯玉として保存</button>
          )}
        </div>

        {/* 打ち始めの残高（開始時の持ち玉・貯玉）。何から打ち始めたかを明示する */}
        {(sheet.startMochi > 0 || sheet.startChodama > 0) && (
          <div style={{ marginBottom: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>打ち始めの残高</div>
            {sheet.startMochi > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sheet.startChodama > 0 ? 4 : 0 }}>
                <span style={{ fontSize: 12, color: C.sub }}>持ち玉スタート</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: font }}>{fmt(sheet.startMochi)}玉</span>
              </div>
            )}
            {sheet.startChodama > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.sub }}>貯玉スタート</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: font, color: C.purple }}>{fmt(sheet.startChodama)}玉</span>
              </div>
            )}
          </div>
        )}

        {/* 投資額（自動：実践記録から）。貯玉消費がある場合は下に内訳と合計投資を表示 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.sub, marginBottom: 5 }}>投資額（現金・円）</div>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={invest}
            onChange={(e) => setInvest(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
          {chodamaYen > 0 && (
            <div style={{ marginTop: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.purple }}>＋ 貯玉消費（投資に加算）</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: font, color: C.purple }}>{fmt(chodamaBalls)}玉 → {fmt(chodamaYen)}円</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>合計投資</span>
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: font, color: C.red }}>{fmt(totalInvest)}円</span>
              </div>
            </div>
          )}
        </div>

        {/* 回収額（現金精算時のみ・自動：持ち玉×玉単価） */}
        {method === "cash" ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 5 }}>回収額（円・持ち玉の現金化）</div>
            <input type="text" inputMode="numeric" pattern="[0-9]*" value={recovery}
              onChange={(e) => setRecovery(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
          </div>
        ) : (
          <div style={{ marginBottom: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉として保存</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>「{sheet.storeName}」へ +{fmt(sheet.heldMochi)}玉</div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>貯玉価値 約¥{fmt(sheet.cashYen)} を回収額として収支に計上</div>
          </div>
        )}

        {/* 収支プレビュー */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "12px 14px", marginBottom: 16,
        }}>
          <span style={{ fontSize: 12, color: C.sub }}>{chodamaYen > 0 ? "収支（回収 − 投資 − 貯玉）" : "収支（回収 − 投資）"}</span>
          <span style={{ fontSize: 20, fontWeight: 800, fontFamily: font, color: pl > 0 ? C.green : pl < 0 ? C.red : C.text }}>
            {pl > 0 ? "+" : ""}{fmt(pl)}円
          </span>
        </div>

        {/* 未登録機種の登録（次回からピッカー候補に出る）。未登録機種のときだけ表示 */}
        {sheet.isUnregistered && (
          <button
            onClick={() => setRegisterMachine((v) => !v)}
            style={{
              width: "100%", minHeight: 52, marginBottom: 12,
              display: "flex", alignItems: "center", gap: 12,
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: "10px 14px", cursor: "pointer", textAlign: "left", fontFamily: font,
            }}
          >
            <span style={{
              width: 24, height: 24, flexShrink: 0, borderRadius: 6,
              border: `2px solid ${registerMachine ? C.blue : C.border}`,
              background: registerMachine ? C.blue : "transparent",
              color: "#fff", fontSize: 15, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{registerMachine ? "✓" : ""}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: C.text }}>この機種を登録</span>
              <span style={{ display: "block", fontSize: 11, color: C.sub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                「{sheet.machineName}」を次回から候補に表示
              </span>
            </span>
          </button>
        )}

        <button onClick={() => onConfirm({ method, invest: investNum, recovery: recoveryNum, registerMachine: sheet.isUnregistered && registerMachine })}
          style={{ width: "100%", height: 60, borderRadius: 12, fontSize: 15, fontWeight: 700, fontFamily: font, border: "none", background: C.blue, color: "#fff", cursor: "pointer" }}>
          実戦終了して保存
        </button>
        <button onClick={onCancel}
          style={{ width: "100%", height: 52, marginTop: 8, borderRadius: 12, fontSize: 14, fontWeight: 700, fontFamily: font, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer" }}>
          キャンセル
        </button>
      </div>
    </div>
  );
}

// 起動時の持越し持ち玉プロンプト（前日以前の持ち玉が残っている場合に表示）
function CarryOverSheet({ prompt, onStore, onContinue, onDiscard }) {
  const balls = (prompt?.balls || 0).toLocaleString();
  const hasStore = !!prompt?.storeId;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div style={{
        background: C.surface, color: C.text, fontFamily: font,
        borderTop: `1px solid ${C.border}`,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
        maxWidth: 480, margin: "0 auto", width: "100%",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>前回の持ち玉が残っています</div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 16 }}>
          日付を跨いだ持ち玉 <b style={{ color: C.text }}>{balls}玉</b> が残っています。
          {hasStore
            ? <>「<b style={{ color: C.text }}>{prompt.storeName}</b>」の貯玉として保存できます。</>
            : <>店舗が選択されていないため貯玉化はできません。</>}
        </div>
        {hasStore && (
          <button onClick={onStore} style={recoveryBtnStyle("primary")}>貯玉として保存する</button>
        )}
        <button onClick={onContinue} style={recoveryBtnStyle("ghost")}>持ち玉のまま続ける</button>
        <button onClick={onDiscard} style={recoveryBtnStyle("danger")}>精算済み（持ち玉を消す）</button>
      </div>
    </div>
  );
}

function RecoverySheet({ snapshot, onRestore, onKeep, onDiscard }) {
  const ts = snapshot?.ts ? new Date(snapshot.ts) : null;
  const tsLabel = ts ? `${ts.toLocaleDateString("ja-JP")} ${ts.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "";
  const m = snapshot?.meta || {};
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
      display: "flex", flexDirection: "column", justifyContent: "flex-end",
    }}>
      <div style={{
        background: C.surface, color: C.text, fontFamily: font,
        borderTop: `1px solid ${C.border}`,
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: "20px 20px calc(20px + env(safe-area-inset-bottom))",
        maxWidth: 480, margin: "0 auto", width: "100%",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>セッション復旧</div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 16 }}>
          前回保存されたデータと現在の状態が一致しません。
          {tsLabel && <><br />スナップショット: <b>{tsLabel}</b></>}
          {(m.rotRowsLen != null || m.jpLogLen != null) && (
            <><br />回転 {m.rotRowsLen ?? 0} 件 / 大当たり {m.jpLogLen ?? 0} 件</>
          )}
        </div>
        <button onClick={onRestore} style={recoveryBtnStyle("primary")}>直前のスナップショットに戻す</button>
        <button onClick={onKeep} style={recoveryBtnStyle("ghost")}>現状のまま続ける</button>
        <button onClick={onDiscard} style={recoveryBtnStyle("danger")}>セッションを破棄する</button>
      </div>
    </div>
  );
}

function recoveryBtnStyle(kind) {
  const base = {
    width: "100%", height: 64, marginTop: 8, borderRadius: 12,
    fontSize: 15, fontWeight: 700, fontFamily: font, cursor: "pointer",
    border: `1px solid ${C.border}`,
  };
  if (kind === "primary") return { ...base, background: C.blue, color: "#fff", border: "none" };
  if (kind === "danger") return { ...base, background: "transparent", color: C.red || "#ef4444" };
  return { ...base, background: C.surface, color: C.text };
}
