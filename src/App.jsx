import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLS, calcPreciseEV } from "./logic";
import { useUndoStack } from "./history";
import { C, font, tsNow } from "./constants";
import { RotTab, SettingsTab } from "./components/Tabs";
import ModeTabBar from "./components/ModeTabBar";
import AnalysisDashboard from "./components/analysis/AnalysisDashboard";
import ScoutDashboard from "./components/scout/ScoutDashboard";
import SelectDashboard from "./components/select/SelectDashboard";
import HomeDashboard from "./components/home/HomeDashboard";
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
import {
  addNotification as appendNotification,
  makeNotification,
  markAsRead as markNotifAsRead,
  markAllAsRead as markAllNotifAsRead,
  clearAll as clearNotifAll,
  NOTIF_LEVEL_UP,
  NOTIF_STREAK,
  NOTIF_BADGE_UNLOCKED,
  NOTIF_VERDICT_CHANGE,
} from "./notifications";
import { takeSnapshot, takeSnapshotImmediate, getLatest as getLatestSnapshot } from "./snapshot";

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
  continue_strong: "続行",
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
  // 現在のモード: "home" | "scout" | "select" | "record" | "analysis" | "settings"
  // 新規ユーザーはホーム画面から始まる。既存ユーザーは保存済みの値を維持。
  const [currentMode, setCurrentMode] = useLS("pt_currentMode", "home");

  // 分析モード内の期間サブタブ
  // "month" | "year" | "all" | "calendar"
  const [analysisTab, setAnalysisTab] = useLS("pt_analysisTab", "month");

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

  // 下部タブから「記録」モードへ遷移した際は、必ず実戦サブタブを最初に表示する。
  // sessionSubTab が "history" のまま残っていると、初当たり入力モーダルが
  // 自動で開く挙動になっていたため（Tabs.jsx の auto-open useEffect 参照）。
  const handleModeChange = useCallback((nextMode) => {
    if (nextMode === "record") {
      setSessionSubTab("rot");
    }
    setCurrentMode(nextMode);
  }, [setCurrentMode]);

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

  // レベルアップトースト表示状態（永続化しない）
  const [levelUpToast, setLevelUpToast] = useState({ show: false, level: 1 });

  // 通知パネル開閉
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  // 通知ログを追加するヘルパー
  const pushNotification = useCallback((notif) => {
    if (!notif) return;
    setNotificationLog((prev) => appendNotification(prev, notif));
  }, [setNotificationLog]);

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

  const resetAll = () => {
    // セッション終了直前の atomic スナップショット（reset 前に確保）
    try { takeSnapshotImmediate("session:end", getUndoSnapshot()); } catch { /* ignore */ }
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
    // Phase 6 XPトリガー用カウンタもセッション一緒にリセット（次のセッションは 0 から数え直す）
    setHunterCounters((prev) => ({
      countedHits: 0,
      countedRotKilo: 0,
      lastDate: prev?.lastDate || "",
      streakDays: Math.max(0, Math.floor(Number(prev?.streakDays) || 0)),
    }));
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
        initialChodama: initialChodama || 0,
        finalChodama: currentChodama || 0,
        chodamaNetBalls: (currentChodama || 0) - (initialChodama || 0),
        chodamaYen: Math.round((ev?.chodamaKCount || 0) * 1000 * (exRate || 250) / (rentBalls || 250)),
        isMoveArchive: true,
      };
      setArchives((prev) => [...prev, archive]);
      // ハンターランク: 実戦アーカイブ確定で XP 加算（Phase 6：レベルアップ検出付き）
      grantXp(XP_SESSION_COMPLETE, "セッション完了");
    }
    resetAll();
    setCurrentMode("record");
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
    // Undo/Redo
    pushSnapshot, undo, redo, canUndo, canRedo,
    // ハンターランク（Phase 6）
    hunterRank: hunterRankDisplay,
    hunterCounters,
    // 通知（Phase 6）
    notificationLog,
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
        {currentMode === "select" && (
          <SelectDashboard
            S={S}
            onStart={(machine) => {
              setMachineNum(String(machine.machineNumber || ""));
              setMachineName(machine.machineName || "");
              if (!sessionStarted) {
                setStartRot(0);
                setCurrentMochiBalls(0);
                setInitialChodama(currentChodama || 0);
                setSessionStarted(true);
                setRotRows((prev) => (
                  prev.length > 0
                    ? prev
                    : [{ type: "start", cumRot: 0, mode: playMode, mochiBalls: 0, chodamaBalls: currentChodama || 0 }]
                ));
                setSesLog((prev) => [...prev, { type: "スタート", time: tsNow(), rot: 0 }]);
              }
              setCurrentMode("record");
            }}
          />
        )}
        {currentMode === "record" && <RotTab border={border} rows={rotRows} setRows={setRotRows} S={S} ev={ev} />}
        {currentMode === "analysis" && (
          <AnalysisDashboard
            S={S}
            onReset={resetAll}
            periodTab={analysisTab}
            onChangePeriodTab={setAnalysisTab}
          />
        )}
        {currentMode === "settings" && <SettingsTab s={S} onReset={resetAll} />}
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
