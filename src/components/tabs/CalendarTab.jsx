import React, { useState, useEffect, useRef, useMemo } from "react";
import { C, f, sc, sp, font, mono, localDateStr } from "../../constants";
import { archiveWorkMinutes, getEvAmount, getEvBreakdown } from "../analysis/analysisSelectors";
import { NI, Card, Btn, SecLabel } from "../Atoms";
import { createArchiveRecordId } from "../../csv";
import { formatPachinkoRateLabel } from "../../rateSettings";
import DataQualityFeedbackCard from "../quality/DataQualityFeedbackCard";
import { recordArchiveCorrections } from "../../sessionDataQuality";
import { TMONO, twSc, SectionLabel, MultiLineChart, WageRankCard } from "./TabsShared";
import RotationModeEditor from "./RotationModeEditor";
import { applyArchiveRotationCorrection, correctRotationMode, createArchiveCorrectionFingerprint, createRotationModeFingerprint, isEditableRotationModeRow, matchesArchiveCorrectionFingerprint } from "../../rotationModeCorrection";
import { applyEconomicEV, deriveUsageFromRows } from "../../economics";

const ECONOMIC_DERIVED_KEYS = new Set([
    "cashKCount", "mochiKCount", "chodamaKCount", "totalKCount", "cashRatio", "mochiRatio", "chodamaRatio", "nonCashRatio", "heldBallCostPerK",
    "cashCostYen", "mochiCostYen", "chodamaCostYen", "trayCorrection", "trayBallsYen", "economicTrayCreditYen", "correctedInvestYen", "economicCostYen",
    "economicKCount", "economicStart1K", "economicEV1K", "economicBDiff", "economicEvPerRot", "economicWorkAmount", "economicWage", "effectiveStart1K",
    "effectiveEV1K", "effectiveBDiff", "effectiveEvPerRot", "effectiveWorkAmount", "effectiveWage", "calculationVersion", "economicStatus", "legacyCorrectedInvestYen",
    "legacyEffectiveStart1K", "legacyEffectiveEV1K", "legacyEffectiveWorkAmount",
]);

export function CalendarTab({ S, onReset, initialDate = null, focusMode = false, initialArchiveId = null, onDone = null }) {
    // initialDate（"YYYY-MM-DD" 任意）で初期選択日と表示月を指定できる。
    // 分析タブの月別「記録を編集」導線から該当日を開くために使用。省略時は従来通り未選択・当月表示。
    // focusMode: 分析からの編集導線専用。カレンダー・KPI等の重複表示を出さず、
    //            該当日の編集/追加シートのみ描画する（2026-07 統合。非 focusMode の挙動は完全従来通り）。
    // initialArchiveId: focusMode で最初から開く記録の id（分析の記録カードタップで指定）。
    // onDone: focusMode で保存/追加が完了したときに呼ぶ（分析画面へ自動復帰する導線）。
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const [selectedArchiveId, setSelectedArchiveId] = useState(initialArchiveId);
    const [viewMonth, setViewMonth] = useState(() => {
        if (initialDate) {
            const [y, m] = initialDate.split("-").map(Number);
            return { year: y, month: m - 1 };
        }
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [delConfirm, setDelConfirm] = useState(null);
    const [, setExpandedRot] = useState(null);
    // Edit form state (always declared — not conditional)
    const [editStore, setEditStore] = useState("");
    const [editGameType, setEditGameType] = useState("pachinko");
    const [editMachineName, setEditMachineName] = useState("");
    const [editMachineNum, setEditMachineNum] = useState("");
    const [editInvest, setEditInvest] = useState("");
    const [editRecovery, setEditRecovery] = useState("");
    const [editMochi, setEditMochi] = useState("");
    const [editChodama, setEditChodama] = useState(""); // 貯玉残高（店舗の現在残高を編集）
    const [editPlayHours, setEditPlayHours] = useState(""); // 遊技時間（時間・手入力。実践記録が無い記録の稼働時間/時給に使用）
    const [editSlotRate, setEditSlotRate] = useState("20");
    const [editSlotGames, setEditSlotGames] = useState("");
    const [editSlotBB, setEditSlotBB] = useState("");
    const [editSlotRB, setEditSlotRB] = useState("");
    const [editSlotAT, setEditSlotAT] = useState("");
    const [showEditStoreDD, setShowEditStoreDD] = useState(false);
    // Swipe delete state
    const [swipedId, setSwipedId] = useState(null);
    const swipeRef = useRef({ startX: 0, id: null });
    // ランキング・履歴の「すべて見る」展開状態
    const [showAllMachines, setShowAllMachines] = useState(false);
    const [showAllStores, setShowAllStores] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);
    // 過去日への手動記録追加フォーム（記録がない日を選択したときに使用）
    const [addFormOpen, setAddFormOpen] = useState(false);
    const [addGameType, setAddGameType] = useState("pachinko");
    const [addStore, setAddStore] = useState("");
    const [addMachineName, setAddMachineName] = useState("");
    const [addMachineNum, setAddMachineNum] = useState("");
    const [addInvest, setAddInvest] = useState("");
    const [addRecovery, setAddRecovery] = useState("");
    const [addChodama, setAddChodama] = useState("");   // 貯玉残高（店舗へ登録・同期）
    const [addPlayHours, setAddPlayHours] = useState(""); // 遊技時間（時間・手入力）
    const [addSlotRate, setAddSlotRate] = useState("20");
    const [addSlotGames, setAddSlotGames] = useState("");
    const [addSlotBB, setAddSlotBB] = useState("");
    const [addSlotRB, setAddSlotRB] = useState("");
    const [addSlotAT, setAddSlotAT] = useState("");
    const [showAddStoreDD, setShowAddStoreDD] = useState(false);
    const [rotationCorrection, setRotationCorrection] = useState(null);
    const [rotationCorrectionError, setRotationCorrectionError] = useState("");

    const saveArchiveRotationCorrection = (mode) => {
        const selected = archives.find((archive) => archive.id === selectedArchiveId);
        if (!matchesArchiveCorrectionFingerprint(selected, rotationCorrection?.archiveFingerprint)) { setRotationCorrectionError("アーカイブが変更されています。もう一度開き直してください。"); return; }
        const rentBalls = Number(selected?.settings?.rentBalls);
        const correction = correctRotationMode({ rows: selected?.rotRows, fingerprint: rotationCorrection?.fingerprint, mode, rentBalls });
        if (!correction.ok) { setRotationCorrectionError(correction.reason); return; }
        const applied = applyArchiveRotationCorrection(selected, correction);
        if (!applied.ok) { setRotationCorrectionError(applied.reason); return; }
        const totalK = (usage) => usage.cashKCount + usage.mochiKCount + usage.chodamaKCount;
        const oldK = totalK(deriveUsageFromRows(selected.rotRows, rentBalls));
        const newK = totalK(deriveUsageFromRows(applied.archive.rotRows, rentBalls));
        if (!Number.isFinite(oldK) || !Number.isFinite(newK) || Math.abs(oldK - newK) > 1e-9) { setRotationCorrectionError("総消費量が一致しないため変更できません。"); return; }
        const settings = selected.settings || {};
        const baseStats = Object.fromEntries(Object.entries(selected.stats || {}).filter(([key]) => !ECONOMIC_DERIVED_KEYS.has(key)));
        const nextStats = applyEconomicEV(baseStats, { rotRows: applied.archive.rotRows, jpLog: selected.jpLog || [], totalTrayBalls: Number(selected.totalTrayBalls) || 0, rentBalls, exRate: Number(settings.exRate), rotPerHour: Number(settings.rotPerHour) });
        if (!Number.isFinite(nextStats.chodamaCostYen) || nextStats.chodamaCostYen < 0) { setRotationCorrectionError("貯玉コストを再計算できません。"); return; }
        const nextArchive = { ...applied.archive, chodamaYen: Math.round(nextStats.chodamaCostYen), stats: { ...nextStats, rawInvest: applied.archive.stats.rawInvest } };
        S.setArchives((previous) => previous.map((archive) => archive.id === selectedArchiveId ? nextArchive : archive));
        setEditInvest(String(nextArchive.investYen));
        setRotationCorrection(null);
        setRotationCorrectionError("");
    };

    // 日付を切り替えたら追加フォームを閉じる（入力途中の値は日付間で持ち越さない）
    useEffect(() => {
        setAddFormOpen(false);
        setShowAddStoreDD(false);
    }, [selectedDate]);

    const archives = useMemo(() => S.archives || [], [S.archives]);

    // Group archives by date
    const byDate = useMemo(() => {
        const map = {};
        archives.forEach(a => {
            const d = a.date || "";
            if (!map[d]) map[d] = [];
            map[d].push(a);
        });
        return map;
    }, [archives]);

    // Calculate daily totals — 実収支 (actual) と 期待値 (ev) を独立に集計
    const dailyTotals = useMemo(() => {
        const totals = {};
        Object.entries(byDate).forEach(([date, items]) => {
            let actual = 0;
            let ev = 0;
            let hasActual = false;
            items.forEach(a => {
                if (a.investYen != null && a.recoveryYen != null && (a.investYen > 0 || a.recoveryYen > 0)) {
                    actual += (a.recoveryYen || 0) - (a.investYen || 0);
                    hasActual = true;
                }
                ev += getEvAmount(a);
            });
            totals[date] = { actual, ev, hasActual };
        });
        return totals;
    }, [byDate]);

    // Machine number aggregate stats
    const machineAggregates = useMemo(() => {
        const agg = {};
        archives.forEach(a => {
            if (!a.machineNum) return;
            const key = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
            if (!agg[key]) agg[key] = { machineNum: a.machineNum, denom: a.settings?.synthDenom, count: 0, totalRot: 0, totalK: 0, storeName: a.storeName || "" };
            agg[key].count += 1;
            const st = a.stats || {};
            agg[key].totalRot += (st.netRot || 0);
            agg[key].totalK += (st.correctedInvestYen ? st.correctedInvestYen / 1000 : (st.rawInvest ? st.rawInvest / 1000 : 0));
            if (a.storeName) agg[key].storeName = a.storeName;
        });
        return agg;
    }, [archives]);

    // Monthly key（月内集計のフィルタに使用）
    const monthKey = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;

    // ── 月内アーカイブ（KPI・ヒートマップ・チャート・ランキング・履歴の共通ソース） ──
    //   既にメモ化済みの byDate から導出（archives を直接参照しない）
    const monthArchives = useMemo(() => {
        const out = [];
        Object.entries(byDate).forEach(([d, arr]) => {
            if (d.startsWith(monthKey)) out.push(...arr);
        });
        return out;
    }, [byDate, monthKey]);

    // KPI 集計（月間収支 / EV / ROI / 稼働時間 / 時給 / 勝率）
    const monthKpi = useMemo(() => {
        let invest = 0, recovery = 0, ev = 0, workMin = 0, winCount = 0, realCount = 0;
        monthArchives.forEach(a => {
            const inv = Number(a.investYen) || 0;
            const rec = Number(a.recoveryYen) || 0;
            if (inv > 0 || rec > 0) {
                invest += inv; recovery += rec; realCount += 1;
                if (rec - inv > 0) winCount += 1;
            }
            ev += getEvAmount(a);
            // 稼働時間: 実践記録は netRot/rotPerHour、手動記録は遊技時間（playMinutes）
            workMin += archiveWorkMinutes(a);
        });
        const pl = recovery - invest;
        const hours = workMin / 60;
        return {
            pl, ev, invest, recovery,
            roi: invest > 0 ? (recovery / invest) * 100 : null,
            hours,
            wage: hours > 0 && realCount > 0 ? Math.round(pl / hours) : null,
            winRate: realCount > 0 ? (winCount / realCount) * 100 : null,
            winCount, realCount,
            hasActual: realCount > 0,
        };
    }, [monthArchives]);

    // 日別集計（昇順）: 収支・EV・差（収支-EV）
    const monthDays = useMemo(() => {
        const map = {};
        monthArchives.forEach(a => {
            const d = a.date;
            if (!map[d]) map[d] = { date: d, actual: 0, ev: 0, sessions: 0, hasActual: false };
            const inv = Number(a.investYen) || 0;
            const rec = Number(a.recoveryYen) || 0;
            if (inv > 0 || rec > 0) { map[d].actual += rec - inv; map[d].hasActual = true; }
            map[d].ev += getEvAmount(a);
            map[d].sessions += 1;
        });
        return Object.values(map)
            .map(v => ({ ...v, diff: v.actual - v.ev }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [monthArchives]);

    // 収支推移チャート用（累計: 実収支 / EV / 差）
    const trendPoints = useMemo(() => {
        const out = [];
        let ca = 0, ce = 0;
        for (const d of monthDays) {
            ca += d.actual;
            ce += d.ev;
            out.push({
                label: `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))}`,
                actual: ca, ev: ce, diff: ca - ce,
            });
        }
        return out;
    }, [monthDays]);

    // 時給ランキング（機種別・店舗別）— 月内集計、時給降順
    const { machineWageRank, storeWageRank } = useMemo(() => {
        const build = (keyOf) => {
            const map = {};
            monthArchives.forEach(a => {
                const key = keyOf(a);
                if (!key) return;
                if (!map[key]) map[key] = { name: key, pl: 0, workMin: 0, sessions: 0, hasActual: false };
                const inv = Number(a.investYen) || 0;
                const rec = Number(a.recoveryYen) || 0;
                if (inv > 0 || rec > 0) { map[key].pl += rec - inv; map[key].hasActual = true; }
                map[key].workMin += archiveWorkMinutes(a);
                map[key].sessions += 1;
            });
            return Object.values(map)
                .map(r => ({ ...r, hours: r.workMin / 60, wage: r.workMin > 0 ? Math.round(r.pl / (r.workMin / 60)) : null }))
                .filter(r => r.wage != null)
                .sort((a, b) => b.wage - a.wage);
        };
        const nameOf = (a) => {
            const denom = a?.settings?.synthDenom;
            return a?.machineName && a.machineName !== `1/${denom}`
                ? a.machineName
                : (a?.machineName || `1/${denom || "—"}`);
        };
        return {
            machineWageRank: build(nameOf),
            storeWageRank: build(a => String(a.storeName || "").trim()),
        };
    }, [monthArchives]);

    // Calendar grid（月曜始まり）
    const calendarDays = useMemo(() => {
        const first = new Date(viewMonth.year, viewMonth.month, 1);
        const lastDay = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
        const startDow = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
        const days = [];
        for (let i = 0; i < startDow; i++) days.push(null);
        for (let d = 1; d <= lastDay; d++) days.push(d);
        return days;
    }, [viewMonth]);

    const prevMonth = () => setViewMonth(p => {
        const m = p.month - 1;
        return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
    });
    const nextMonth = () => setViewMonth(p => {
        const m = p.month + 1;
        return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
    });

    const today = new Date();
    const isToday = (day) => day && today.getFullYear() === viewMonth.year && today.getMonth() === viewMonth.month && today.getDate() === day;
    const dateStr = (day) => `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const deleteArchive = (id) => {
        S.setArchives((prev) => prev.filter(a => a.id !== id));
        setDelConfirm(null);
    };

    const textInput = (val, set, placeholder, opts = {}) => (
        <input type={opts.type || "text"} inputMode={opts.inputMode || undefined} pattern={opts.pattern || undefined}
            value={val || ""} onChange={e => set(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }} />
    );

    const storeList = S.stores || [];
    const hasYutimeSettlement = (archive) => Boolean(
        archive?.yutimeDecision
        || archive?.yutimeContext
        || (Array.isArray(archive?.yutimeRuns) && archive.yutimeRuns.length > 0)
    );
    const updateEditMochi = (value, archive) => {
        setEditMochi(value);
        if (String(value).trim() === "") return;
        const store = storeList.find((item) => item && typeof item === "object" && (
            (archive?.storeId != null && String(item.id) === String(archive.storeId))
            || item.name === editStore
        ));
        const exchangeBalls = Number(store?.exRate || archive?.settings?.exRate);
        if (Number(value) >= 0 && exchangeBalls > 0) {
            setEditRecovery(String(Math.round(Number(value) * (1000 / exchangeBalls))));
        }
    };

    // 手動記録の保存: 記録がない過去日に最小スキーマのアーカイブを追加する。
    // CSVインポート（isImported）と同型の「後から追加される収支記録」で、
    // 分析集計は investYen / recoveryYen ベースのため自動で反映される。
    // rotRows / logic.js の計算フローには一切関与しない。
    // 遊技時間（時間・小数可）→ 分（整数）。空欄や不正値は 0。
    const playHoursToMinutes = (v) => {
        const h = Number(v);
        return v !== "" && isFinite(h) && h > 0 ? Math.round(h * 60) : 0;
    };

    // 貯玉残高を店舗へ登録・同期する共通処理。未登録の店舗名なら新規店舗として登録する。
    //   差分があれば chodamaLog に調整履歴を追記。反映先店舗の id を返す（保存できなければ既存 storeId）。
    //   貯玉は店舗単位の現在残高（＝すべての日で共有）。この設計は既存の店舗編集と同一。
    const syncChodamaToStore = ({ storeId, storeName, chodamaStr }) => {
        if (chodamaStr === "" || chodamaStr == null) return storeId ?? null;
        const name = (storeName || "").trim();
        const newBal = Math.max(0, Math.round(Number(chodamaStr) || 0));
        let store = (S.stores || []).find(st => typeof st === "object" &&
            (st.id === storeId || st.name === name));
        if (!store) {
            if (!name) return storeId ?? null; // 店舗名が無いと貯玉の保存先が定まらない
            // 未登録の店舗を新規登録（既定値はアプリ設定の貸玉/交換率を踏襲）。
            const newId = Date.now() + Math.random();
            store = {
                id: newId, name, address: "",
                rentBalls: Number(S.rentBalls) || 250, exRate: Number(S.exRate) || 250,
                memo: "", chodama: newBal, chodamaMax: 0, lastVisit: "",
                replayBalls: 0, todaySettle: 0,
                memberCard: { created: false, number: "", deposit: 0 },
            };
            S.setStores(prev => [...(prev || []).filter(st => typeof st === "object"), store]);
            S.setChodamaLog(prev => [{
                id: Date.now() + Math.random(), date: localDateStr(),
                storeId: newId, storeName: name, type: "adjust",
                balls: newBal, balanceBefore: 0, balanceAfter: newBal, memo: "記録から店舗を新規登録",
            }, ...(prev || [])]);
            return newId;
        }
        const oldBal = Math.round(Number(store.chodama) || 0);
        if (newBal !== oldBal) {
            S.setStores(prev => prev.map(st =>
                (typeof st === "object" && st.id === store.id) ? { ...st, chodama: newBal } : st));
            S.setChodamaLog(prev => [{
                id: Date.now() + Math.random(), date: localDateStr(),
                storeId: store.id, storeName: store.name || "", type: "adjust",
                balls: newBal - oldBal, balanceBefore: oldBal, balanceAfter: newBal, memo: "記録編集から残高調整",
            }, ...(prev || [])]);
        }
        return store.id;
    };

    const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));
    const makeSlotStats = ({ rate, games, bb, rb, at }) => ({
        rateYen: Math.max(0, Number(rate) || 20),
        totalGames: nonNegativeInt(games),
        bbCount: nonNegativeInt(bb),
        rbCount: nonNegativeInt(rb),
        atCount: nonNegativeInt(at),
    });

    const saveManualArchive = () => {
        const inv = Math.max(0, Math.round(Number(addInvest) || 0));
        const rec = Math.max(0, Math.round(Number(addRecovery) || 0));
        if (!selectedDate || (inv <= 0 && rec <= 0)) return;
        const gameType = addGameType === "slot" ? "slot" : "pachinko";
        const storeName = (addStore || "").trim();
        const storeObj = storeList.find(st => typeof st === "object" && st.name === storeName);
        const archiveId = Date.now() + Math.random();
        const recordId = createArchiveRecordId();
        // 貯玉残高を店舗へ登録・同期し、反映先の店舗 id を記録に紐付ける。
        const resolvedStoreId = syncChodamaToStore({
            storeId: storeObj?.id ?? null, storeName, chodamaStr: gameType === "slot" ? "" : addChodama,
        });
        S.setArchives(prev => [...prev, {
            id: archiveId,
            recordId,
            gameType,
            date: selectedDate,
            time: "",
            storeName,
            storeId: resolvedStoreId,
            machineNum: (addMachineNum || "").trim(),
            machineName: (addMachineName || "").trim(),
            investYen: inv,
            recoveryYen: rec,
            playMinutes: playHoursToMinutes(addPlayHours), // 遊技時間（分）。稼働時間/時給の集計に使用
            ...(gameType === "slot" ? { slotStats: makeSlotStats({ rate: addSlotRate, games: addSlotGames, bb: addSlotBB, rb: addSlotRB, at: addSlotAT }) } : {}),
            settings: {},
            stats: {},
            rotRows: [],
            jpLog: [],
            sesLog: [],
            totalTrayBalls: 0,
            startRot: 0,
            isManual: true,
        }]);
        setSelectedArchiveId(archiveId);
        setAddFormOpen(false);
        setAddGameType("pachinko");
        setShowAddStoreDD(false);
        setAddStore("");
        setAddMachineName("");
        setAddMachineNum("");
        setAddInvest("");
        setAddRecovery("");
        setAddChodama("");
        setAddPlayHours("");
        setAddSlotRate("20");
        setAddSlotGames("");
        setAddSlotBB("");
        setAddSlotRB("");
        setAddSlotAT("");
    };

    // ── 記録編集の保存（ArchiveDetail と focusMode 編集シートの共通処理） ──
    //   旧 ArchiveDetail 内 updateArchive を CalendarTab スコープへ持ち上げたもの（処理内容は不変）
    const applyArchiveEdits = (a, doReset) => {
        const gameType = a.isManual
            ? (editGameType === "slot" ? "slot" : "pachinko")
            : (a.gameType === "slot" ? "slot" : "pachinko");
        // パチンコからスロットへ変更した記録に、回転・大当り・期待値・遊タイム等を残さない。
        // 古いCSV由来などで値が入っていても、種別変更時にまとめて安全な初期値へ戻す。
        const slotOnlyArchive = gameType === "slot" ? {
            settings: {},
            stats: {},
            rotRows: [],
            jpLog: [],
            sesLog: [],
            totalTrayBalls: 0,
            startRot: 0,
            carriedInYen: 0,
            initialChodama: 0,
            finalChodama: 0,
            chodamaYen: 0,
            chodamaNetBalls: 0,
            yutimeDecision: null,
            decisionSnapshots: [],
            riskSnapshot: null,
            isMoveArchive: false,
            sessionStartedAt: "",
            sessionTargetEndAt: "",
            sessionClosingTime: "",
            sessionPlannedStart1K: 0,
        } : {};
        // 貯玉残高を店舗へ登録・同期（未登録の店舗名なら新規登録）。反映先の店舗 id を記録へ紐付ける。
        const resolvedStoreId = syncChodamaToStore({
            storeId: a.storeId ?? null,
            storeName: editStore || a.storeName,
            chodamaStr: gameType === "slot" ? "" : editChodama,
        });
        S.setArchives(prev => prev.map(ar => {
            if (ar.id !== a.id) return ar;
            const finalMochiBalls = gameType === "slot" ? 0 : Math.max(0, Number(editMochi) || 0);
            const next = {
                ...ar,
                gameType,
                storeName: editStore,
                storeId: resolvedStoreId,
                machineName: editMachineName.trim(),
                machineNum: editMachineNum,
                investYen: Number(editInvest) || 0,
                recoveryYen: Number(editRecovery) || 0,
                finalMochiBalls,
                playMinutes: playHoursToMinutes(editPlayHours), // 遊技時間（分）。稼働時間/時給に使用
                slotStats: gameType === "slot"
                    ? makeSlotStats({ rate: editSlotRate, games: editSlotGames, bb: editSlotBB, rb: editSlotRB, at: editSlotAT })
                    : null,
                ...(hasYutimeSettlement(ar) ? {
                    settlementMethod: finalMochiBalls > 0 ? "exchange" : ar.settlementMethod,
                    yutimeContext: {
                        ...(ar.yutimeContext || {}),
                        storeId: resolvedStoreId,
                        storeName: editStore,
                        finalMochiBalls,
                        updatedAt: new Date().toISOString(),
                    },
                } : {}),
                ...slotOnlyArchive,
            };
            return recordArchiveCorrections(ar, next, {}, { archives: prev, stores: storeList });
        }));
        if (doReset) onReset();
        // 保存後は詳細ビューを閉じてカレンダー一覧に戻す（視覚的フィードバック）
        setSelectedArchiveId(null);
        setExpandedRot(null);
        setDelConfirm(null);
    };

    // ── Inline summary card for an archive entry (reference app style) ──
    const SummaryCard = ({ a, onClick }) => {
        const isSlot = a.gameType === "slot";
        const invest = a.investYen || 0;
        const recovery = a.recoveryYen || 0;
        // 貯玉消費（確定時に保存済み）: 円換算額と消費玉数。実収支では投資と同じくコストとして差し引く
        //   （analysisSelectors の getActualPL + getChodamaPL と同一の式。保存構造・logic.js は不変）
        const chodamaYen = isSlot ? 0 : (a.chodamaYen || 0);
        const chodamaConsumedBalls = !isSlot && a.chodamaNetBalls < 0 ? -a.chodamaNetBalls : 0;
        // 実収支 =（回収 − 投資）− 貯玉消費分。現金 or 貯玉いずれかの実データがある時のみ確定
        const hasActual = invest > 0 || recovery > 0 || chodamaYen > 0;
        const realPL = (recovery - invest) - chodamaYen;
        const workBreakdown = getEvBreakdown(a);
        const workAmount = workBreakdown.total;
        // 実データが無い場合のみ期待値（仕事量）へフォールバック
        const displayPL = hasActual ? realPL : workAmount;
        // 稼働時間: 実践記録は netRot/rotPerHour、手動記録は遊技時間（playMinutes）
        const workMin = archiveWorkMinutes(a);
        const hours = workMin > 0 ? (workMin / 60).toFixed(1) : null;
        const hourlyWage = hours && Number(hours) > 0 && displayPL !== 0
            ? Math.round(displayPL / Number(hours))
            : null;
        const displayName = a.machineName && a.machineName !== `1/${a.settings?.synthDenom}`
            ? a.machineName
            : (a.machineName || (isSlot ? "機種未入力" : `1/${a.settings?.synthDenom || "—"}`));

        return (
            <button className="b" onClick={onClick} style={{
                width: "100%",
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "14px 14px 12px",
                marginBottom: 10,
                cursor: "pointer",
                textAlign: "left",
                display: "block",
                position: "relative",
                boxShadow: "var(--card-shadow)",
            }}>
                {/* Store name — tiny top label */}
                {a.storeName && (
                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 6, fontWeight: 600, letterSpacing: "0.8px", opacity: 0.7, textTransform: "uppercase" }}>
                        {a.storeName}
                    </div>
                )}

                {/* Row 1: Machine spec (left) + Total P&L (right) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1.2, letterSpacing: "-0.3px" }}>
                            {displayName}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 8, flexWrap: "wrap" }}>
                            {a.machineNum && (
                                <>
                                    <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>{a.machineNum}番台</span>
                                    <span style={{ fontSize: 10, color: C.sub, opacity: 0.4 }}>·</span>
                                </>
                            )}
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>
                                {isSlot ? `${Number(a.slotStats?.rateYen) || 20}円スロット` : "4パチ"}
                            </span>
                            {hours && (
                                <>
                                    <span style={{ fontSize: 10, color: C.sub, opacity: 0.4 }}>·</span>
                                    <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                                        {hours}<span className="unit">h</span>
                                    </span>
                                </>
                            )}
                        </div>
                        {/* Badges row: hourly wage + chodama */}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {hourlyWage != null && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 4,
                                    padding: "3px 10px",
                                    fontSize: 11, fontWeight: 700,
                                    borderRadius: 999,
                                    background: hourlyWage > 0
                                        ? "rgba(52, 211, 153, 0.14)"
                                        : hourlyWage < 0
                                            ? "rgba(251, 113, 133, 0.14)"
                                            : "var(--surface-hi)",
                                    color: sc(hourlyWage),
                                    border: `1px solid ${hourlyWage > 0
                                        ? "rgba(52,211,153,0.3)"
                                        : hourlyWage < 0
                                            ? "rgba(251,113,133,0.3)"
                                            : "var(--surface-hi)"}`,
                                    fontFamily: font,
                                    fontVariantNumeric: "tabular-nums",
                                    letterSpacing: "-0.2px",
                                }}>
                                    時給 {f(hourlyWage)}<span className="unit" style={{ marginLeft: 1, opacity: 0.75 }}>/h</span>
                                </span>
                            )}
                            {chodamaConsumedBalls > 0 && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    padding: "3px 8px",
                                    fontSize: 10, fontWeight: 700,
                                    borderRadius: 999,
                                    background: "rgba(192, 132, 252, 0.12)",
                                    color: C.purple,
                                    border: "1px solid rgba(192, 132, 252, 0.25)",
                                }}>
                                    💎 貯玉 {f(chodamaConsumedBalls)}玉
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right — labeled big P&L */}
                    {/* 実データ（現金 or 貯玉消費）が無い場合は仕事量＝期待値へフォールバックするため、
                        ラベルを「実収支」ではなく「期待値」に切り替えて両者を明確に区別する */}
                    <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: hasActual ? C.subHi : C.yellow, fontWeight: 700, letterSpacing: "0.4px", marginBottom: 3 }}>
                            {hasActual ? "実収支" : "期待値"}
                        </div>
                        <div style={{
                            fontSize: 24, fontWeight: 800,
                            color: sc(displayPL), fontFamily: font,
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1, letterSpacing: "-0.3px",
                        }}>
                            {sp(displayPL)}<span className="unit">円</span>
                        </div>
                        {hasActual && chodamaYen > 0 && (
                            <div style={{ fontSize: 9, color: C.purple, fontWeight: 700, marginTop: 2 }}>貯玉込み</div>
                        )}
                    </div>
                </div>

                {/* Soft horizontal divider */}
                <div style={{
                    height: 1,
                    background: C.border,
                    margin: "12px 0 10px",
                }} />

                {/* Row 2: 実際のお金の動き 3列（投資 / 貯玉 / 回収）。貯玉は消費玉数（玉）で表示し金額との混同を防ぐ */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <div style={{ textAlign: "center", padding: "0 4px" }}>
                        <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                            <span style={{ color: C.red, fontSize: 11, opacity: 0.75, lineHeight: 1 }}>●</span>
                            <span>投資</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            {f(invest)}<span className="unit">円</span>
                        </div>
                    </div>
                    <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                            <span style={{ color: C.purple, fontSize: 11, opacity: 0.75, lineHeight: 1 }}>◆</span>
                            <span>貯玉</span>
                        </div>
                        <div style={{
                            fontSize: 14, fontWeight: 700,
                            color: chodamaConsumedBalls > 0 ? C.purple : C.sub,
                            fontFamily: font, fontVariantNumeric: "tabular-nums",
                            opacity: chodamaConsumedBalls > 0 ? 1 : 0.5,
                        }}>
                            {chodamaConsumedBalls > 0 ? `-${f(chodamaConsumedBalls)}` : "—"}<span className="unit">玉</span>
                        </div>
                    </div>
                    <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 3, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                            <span style={{ color: C.green, fontSize: 11, opacity: 0.75, lineHeight: 1 }}>●</span>
                            <span>回収</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            {f(recovery)}<span className="unit">円</span>
                        </div>
                    </div>
                </div>

                {/* 期待値（理論値）— 実収支を表示している時のみ、別枠の黄色帯で「これは理論値」と明示して混同を防ぐ */}
                {hasActual && workAmount !== 0 && (
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginTop: 10, padding: "6px 12px", borderRadius: 9,
                        background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.22)",
                    }}>
                        <span style={{ fontSize: 11, color: C.yellow, fontWeight: 700 }}>
                            {workBreakdown.yutime !== 0 ? "合計期待値" : "期待値（理論値）"}
                            {workBreakdown.yutime !== 0 && (
                                <small style={{ display: "block", marginTop: 2, color: C.sub }}>
                                    通常 {sp(Math.round(workBreakdown.normal))}円 ＋ 遊タイム {sp(Math.round(workBreakdown.yutime))}円
                                </small>
                            )}
                        </span>
                        <span style={{ fontSize: 13, color: C.yellow, fontWeight: 800, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            {sp(Math.round(workAmount))}<span className="unit">円</span>
                        </span>
                    </div>
                )}

                {/* Subtle tap indicator — bottom right */}
                <div style={{ position: "absolute", right: 12, bottom: 6, fontSize: 10, color: C.sub, opacity: 0.35 }}>▶</div>
            </button>
        );
    };

    // Initialize edit form when archive selection changes
    const prevSelectedRef = useRef(null);
    useEffect(() => {
        if (selectedArchiveId && selectedArchiveId !== prevSelectedRef.current) {
            const target = archives.find(ar => ar.id === selectedArchiveId);
            if (target) {
                const timer = setTimeout(() => {
                    // prevSelectedRef の更新は実際に seed した時点で行う。
                    // timer 発火前に effect が再実行（クリーンアップ）されても未 seed 扱いになり、
                    // initialArchiveId でマウント時から選択済みのケース（focusMode）でも確実に初期化される。
                    prevSelectedRef.current = selectedArchiveId;
                    const targetGameType = target.gameType === "slot" ? "slot" : "pachinko";
                    const targetSlotStats = target.slotStats || {};
                    setEditGameType(targetGameType);
                    setEditStore(String(target.storeName || ""));
                    setEditMachineName(String(target.machineName || ""));
                    setEditMachineNum(String(target.machineNum || ""));
                    // 投資額は実践記録（回転数データ）から算出した値を初期表示する。
                    // makeArchive が保存した stats.rawInvest = deriveFromRows の現金投資累計。
                    // 台移動で持ち込んだ持ち玉コスト（carriedInYen）は投資の内数なので加算する。
                    // 算出値が無い古いアーカイブは従来の保存値 investYen をフォールバック表示。
                    const carriedIn = Math.round(target.carriedInYen || 0);
                    const yutimeSupportCash = (Array.isArray(target.yutimeRuns) ? target.yutimeRuns : []).reduce((sum, run) => sum + Math.max(0, Number(run?.supportCashYen) || 0), 0);
                    const derivedInvest = Math.round(target.stats?.rawInvest || 0) + carriedIn + Math.round(yutimeSupportCash);
                    setEditInvest(targetGameType === "slot" ? (target.investYen || "") : (derivedInvest > 0 ? derivedInvest : (target.investYen || "")));
                    setEditRecovery(target.recoveryYen || "");
                    setEditMochi(String(target.finalMochiBalls ?? target.yutimeContext?.finalMochiBalls ?? ""));
                    // 貯玉残高はその店舗の現在残高を初期表示（店舗が特定できる場合のみ）
                    const tStore = (S.stores || []).find(st => typeof st === "object" &&
                        (st.id === target.storeId || st.name === target.storeName));
                    setEditChodama(tStore ? String(Math.round(Number(tStore.chodama) || 0)) : "");
                    // 遊技時間: 保存済み playMinutes（分）を時間表記で初期表示（1桁小数、整数はそのまま）
                    const pm = Number(target.playMinutes) || 0;
                    setEditPlayHours(pm > 0 ? String(Math.round((pm / 60) * 10) / 10) : "");
                    setEditSlotRate(String(Number(targetSlotStats.rateYen) || 20));
                    setEditSlotGames(targetSlotStats.totalGames || "");
                    setEditSlotBB(targetSlotStats.bbCount || "");
                    setEditSlotRB(targetSlotStats.rbCount || "");
                    setEditSlotAT(targetSlotStats.atCount || "");
                    setShowEditStoreDD(false);
                }, 0);
                return () => clearTimeout(timer);
            }
        } else if (!selectedArchiveId && prevSelectedRef.current) {
            prevSelectedRef.current = null;
        }
        return undefined;
        // S.stores はフォーム初期化時点の最新貯玉残高を取得するためのスナップショット参照。
        // selectedArchiveId 変更時のみ初期化したいため、依存配列には含めない（prevSelectedRef で再初期化を防止済み）。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [archives, selectedArchiveId]);

    // focusMode: 対象日の記録に選択を追従させる（削除で消えたら次の記録へ、0件なら追加フォーム表示へ）
    useEffect(() => {
        if (!focusMode) return;
        const list = byDate[initialDate] || [];
        if (list.length === 0) {
            if (selectedArchiveId !== null) setSelectedArchiveId(null);
        } else if (!list.some(ar => ar.id === selectedArchiveId)) {
            setSelectedArchiveId(list[0].id);
        }
    }, [focusMode, byDate, initialDate, selectedArchiveId]);

    // ── 回転数データ / 大当たり履歴（ArchiveDetail と focusMode 編集シートの共通表示。JSXは移設のみ） ──
    const renderRotHistory = (a) => (a.gameType !== "slot" && a.rotRows && a.rotRows.length > 0) ? (
        <>
        <Card style={{ overflow: "hidden", marginBottom: 8 }}>
            <SecLabel label={`回転数データ (${a.rotRows.filter(r => r.type === "data").length}K)`} />
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 48px 48px", background: "rgba(249,115,22,0.12)", padding: "5px 4px" }}>
                {["種別", "総回転", "今回", "平均", "投資", "持ち玉"].map(h => (
                    <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.sub }}>{h}</div>
                ))}
            </div>
            {a.rotRows.map((row, i) => {
                const isMochi = row.mode === "mochi";
                const badgeCol = isMochi ? C.orange : row.mode === "chodama" ? C.purple : C.blue;
                const badge = isMochi ? "持" : row.mode === "chodama" ? "貯" : "現";
                return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 1fr 1fr 48px 48px", padding: "5px 4px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ textAlign: "center" }}>
                            <span style={{ fontSize: 8, fontWeight: 700, color: badgeCol, background: badgeCol + "20", borderRadius: 4, padding: "1px 4px" }}>{badge}</span>
                        </div>
                        <div style={{ textAlign: "center", fontSize: 11, color: C.subHi, fontFamily: mono }}>{f(row.cumRot)}</div>
                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.type === "start" ? "START" : row.thisRot}</div>
                        <div style={{ textAlign: "center", fontSize: 11, color: C.text, fontFamily: mono }}>{row.avgRot || "—"}</div>
                        <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{row.mode === "mochi" ? "—" : (row.invest ? f(row.invest) : "—")}</div>
                        <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0))}</div>
                        {isEditableRotationModeRow(row) && <button type="button" className="b" aria-label={`遊技方法を修正 ${i + 1}`} onClick={() => { setRotationCorrection({ row, fingerprint: createRotationModeFingerprint(row, i), archiveFingerprint: createArchiveCorrectionFingerprint(a) }); setRotationCorrectionError(""); }} style={{ gridColumn: "1 / -1", minHeight: 44, marginTop: 4, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surfaceHi, color: C.text }}>遊技方法を修正</button>}
                    </div>
                );
            })}
        </Card>
        <RotationModeEditor key={rotationCorrection?.fingerprint?.index ?? "closed"} row={rotationCorrection?.row} open={Boolean(rotationCorrection)} error={rotationCorrectionError} onClose={() => { setRotationCorrection(null); setRotationCorrectionError(""); }} onSave={saveArchiveRotationCorrection} />
        </>
    ) : null;
    const renderJpHistory = (a) => (a.jpLog && a.jpLog.length > 0) ? (
        <Card style={{ overflow: "hidden", marginBottom: 8 }}>
            <SecLabel label={`大当たり履歴 (${a.jpLog.length}回)`} />
            {a.jpLog.map((chain, ci) => (
                <div key={chain.chainId || ci} style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.blue }}>{ci + 1}回目データ {(chain.hits?.length || 0) <= 1 ? "単発" : (chain.hits?.length || 0) + "連チャン"}</span>
                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                    </div>
                    {chain.hits?.map((hit, hi) => (
                        <div key={hi} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: "3px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                            <div style={{ fontSize: 10, color: C.sub }}>{hit.hitNumber}連: {hit.rounds}R</div>
                            {/* 旧データは液晶出玉、簡易フローのデータはサポ回転を表示 */}
                            <div style={{ fontSize: 10, color: C.yellow, fontFamily: mono }}>{(hit.displayBalls || 0) > 0 ? `液晶${f(hit.displayBalls)}` : ((hit.elecSapoRot || 0) > 0 ? `サポ${f(hit.elecSapoRot)}回` : "—")}</div>
                            <div style={{ fontSize: 10, color: C.green, fontFamily: mono }}>{(hit.actualBalls || 0) > 0 ? `実${f(hit.actualBalls)}` : "—"}</div>
                        </div>
                    ))}
                    {chain.summary && (
                        <div style={{ display: "flex", gap: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 10, color: C.teal }}>1R: {f(chain.summary.avg1R, 1)}発</span>
                            <span style={{ fontSize: 10, color: sc(chain.summary.sapoPerRot || 0) }}>
                                サポ/回転: {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                            </span>
                        </div>
                    )}
                </div>
            ))}
        </Card>
    ) : null;

    // ── focusMode: 分析からの編集/追加シート（承認モック準拠・カレンダー等の重複表示なし） ──
    //   対象日の記録は byDate から毎レンダー導出するため、削除後も表示が自動で追従する。
    if (focusMode) {
        const dateArchives = byDate[initialDate] || [];
        const sel = dateArchives.find(ar => ar.id === selectedArchiveId) || dateArchives[0] || null;
        const cardCls = "rounded-[14px] border border-[var(--at-ln-md)] bg-[image:var(--at-card-grad)] shadow-[var(--at-card-shadow2)]";
        const labelCls = "text-[10px] font-bold tracking-[.05em] text-[var(--at-mut)]";
        const inputCls = "mt-1.5 h-12 w-full rounded-[11px] border border-[var(--at-ln-hi)] bg-[var(--at-panel2)] px-3 text-[16px] font-bold text-[var(--at-strong)] outline-none placeholder:text-[var(--at-faint)] focus:border-[var(--at-cyan)] focus:shadow-[0_0_0_1px_var(--at-cyan)]";
        const numProps = { type: "tel", inputMode: "numeric", pattern: "[0-9]*" };
        // 遊技時間は小数（例 3.5 時間）を許容するため decimal 入力にする
        const decProps = { type: "text", inputMode: "decimal" };
        const canAdd = (Number(addInvest) || 0) > 0 || (Number(addRecovery) || 0) > 0;
        const selHasChodamaStore = sel != null && (S.stores || []).some(st => typeof st === "object" && (st.id === sel.storeId || st.name === sel.storeName));
        const sst = sel?.stats || {};
        const storeDD = (open, setOpen, setValue) => (open && storeList.length > 0) ? (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-[150px] overflow-y-auto rounded-[10px] border border-[var(--at-ln-hi)] bg-[var(--at-panel)] shadow-[var(--at-menu-shadow)]">
                {storeList.map((stItem, i) => {
                    const nm = typeof stItem === "object" ? stItem.name : stItem;
                    return (
                        <button key={stItem.id || i} type="button" onClick={() => { setValue(nm); setOpen(false); }}
                            className="block w-full border-b border-[var(--at-ln)] px-3 py-2.5 text-left text-[13px] font-bold text-[var(--at-strong)] last:border-b-0">{nm}</button>
                    );
                })}
            </div>
        ) : null;
        const gameTypeSelector = (value, setValue, disabled = false) => (
            <div className="col-span-2">
                <div className={labelCls}>遊技種別</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {[["pachinko", "パチンコ"], ["slot", "パチスロ"]].map(([type, text]) => {
                        const active = value === type;
                        return (
                            <button key={type} type="button" disabled={disabled} onClick={() => setValue(type)} aria-pressed={active}
                                className={`h-12 rounded-[11px] border text-[14px] font-black transition disabled:opacity-70 ${active
                                    ? "border-[var(--at-cyan)] bg-[var(--at-cyan)]/12 text-[var(--at-cyan)]"
                                    : "border-[var(--at-ln-hi)] bg-[var(--at-panel2)] text-[var(--at-mut)]"}`}>
                                {text}
                            </button>
                        );
                    })}
                </div>
                {disabled && <div className="mt-1 text-[9px] text-[var(--at-mut)]">実戦中に記録したデータはパチンコとして保存されます</div>}
            </div>
        );
        const slotFields = ({ rate, setRate, games, setGames, bb, setBB, rb, setRB, at, setAT }) => (
            <>
                <div>
                    <div className={labelCls}>貸メダル（円）</div>
                    <select value={rate} onChange={e => setRate(e.target.value)} className={inputCls}>
                        {[20, 10, 5, 2, 1].map(v => <option key={v} value={v}>{v}円スロット</option>)}
                    </select>
                </div>
                <div>
                    <div className={labelCls}>総ゲーム数</div>
                    <input {...numProps} value={games} onChange={e => setGames(e.target.value)} placeholder="任意" className={inputCls} />
                </div>
                <div>
                    <div className={labelCls}>BB回数</div>
                    <input {...numProps} value={bb} onChange={e => setBB(e.target.value)} placeholder="任意" className={inputCls} />
                </div>
                <div>
                    <div className={labelCls}>RB回数</div>
                    <input {...numProps} value={rb} onChange={e => setRB(e.target.value)} placeholder="任意" className={inputCls} />
                </div>
                <div>
                    <div className={labelCls}>AT・ART回数</div>
                    <input {...numProps} value={at} onChange={e => setAT(e.target.value)} placeholder="任意" className={inputCls} />
                </div>
            </>
        );
        return (
            <div className="mx-auto w-full max-w-[430px] px-5 pt-3">
                {sel && !addFormOpen ? (
                    <div className="space-y-3">
                        {/* 編集フォーム（項目は既存の記録エディタと同一） */}
                        <div className={`${cardCls} p-4`}>
                            <div className="flex items-center gap-2 text-[12px] font-black text-[var(--at-subtle-hi)]">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--at-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                記録の編集
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
                                {gameTypeSelector(editGameType, setEditGameType, !sel.isManual)}
                                <div className="col-span-2">
                                    <div className={labelCls}>店舗</div>
                                    <div className="relative">
                                        <input value={editStore} onChange={e => setEditStore(e.target.value)} placeholder="店舗名" className={inputCls} />
                                        {storeList.length > 0 && (
                                            <button type="button" onClick={() => setShowEditStoreDD(v => !v)}
                                                className="absolute right-0 top-1/2 -translate-y-1/2 px-3 py-3 text-[12px] text-[var(--at-faint)]">▼</button>
                                        )}
                                        {storeDD(showEditStoreDD, setShowEditStoreDD, setEditStore)}
                                    </div>
                                </div>
                                <div>
                                    <div className={labelCls}>機種名</div>
                                    <input value={editMachineName} onChange={e => setEditMachineName(e.target.value)} placeholder="任意" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>台番号</div>
                                    <input {...numProps} value={editMachineNum} onChange={e => setEditMachineNum(e.target.value)} placeholder="台番号" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>投資額（円）</div>
                                    <input {...numProps} value={editInvest} onChange={e => setEditInvest(e.target.value)} placeholder="10000" className={inputCls} />
                                    {editGameType !== "slot" && (Math.round(sel.carriedInYen || 0) > 0 ? (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">引き継ぎ玉 ¥{Math.round(sel.carriedInYen || 0).toLocaleString()} を含む</div>
                                    ) : Math.round(sel.stats?.rawInvest || 0) > 0 && (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">実践記録から自動反映</div>
                                    ))}
                                </div>
                                <div>
                                    <div className={labelCls}>回収額（円）</div>
                                    <input {...numProps} value={editRecovery} onChange={e => setEditRecovery(e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                                {editGameType !== "slot" && hasYutimeSettlement(sel) && (
                                    <div>
                                        <div className={labelCls}>遊タイム終了時の持ち玉（玉）</div>
                                        <input {...numProps} value={editMochi} onChange={e => updateEditMochi(e.target.value, sel)} placeholder="0" className={inputCls} />
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">交換率から回収額を自動換算します</div>
                                    </div>
                                )}
                                <div>
                                    <div className={labelCls}>遊技時間（時間）</div>
                                    <input {...decProps} value={editPlayHours} onChange={e => setEditPlayHours(e.target.value)} placeholder="例 3.5" className={inputCls} />
                                    {editGameType !== "slot" && (Number(sel.stats?.netRot) || 0) > 0 && (Number(sel.settings?.rotPerHour) || 0) > 0 && (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">実践記録の回転数から自動算出中</div>
                                    )}
                                </div>
                                {editGameType === "slot"
                                    ? slotFields({ rate: editSlotRate, setRate: setEditSlotRate, games: editSlotGames, setGames: setEditSlotGames, bb: editSlotBB, setBB: setEditSlotBB, rb: editSlotRB, setRB: setEditSlotRB, at: editSlotAT, setAT: setEditSlotAT })
                                    : (
                                        <div>
                                            <div className={labelCls}>貯玉残高（玉）</div>
                                            <input {...numProps} value={editChodama} onChange={e => setEditChodama(e.target.value)} placeholder="0" className={inputCls} />
                                        </div>
                                    )}
                            </div>
                            {editGameType !== "slot" && <div className="mt-2 text-[9px] text-[var(--at-mut)]">
                                貯玉残高は{selHasChodamaStore ? `「${sel.storeName || ""}」の現在残高に同期されます` : "店舗の現在残高として登録されます（未登録の店舗は自動で追加）"}
                            </div>}
                        </div>

                        <DataQualityFeedbackCard
                            archive={sel}
                            archives={archives}
                            stores={storeList}
                            onUpdate={(next) => S.setArchives(prev => prev.map(item => item.id === next.id ? next : item))}
                        />

                        {/* EV詳細（既存 ArchiveDetail と同じ値の表示） */}
                        {editGameType !== "slot" && (sst.start1K > 0 || sst.ev1K || sst.wage) ? (
                            <div className={`${cardCls} grid grid-cols-3 p-3 text-center`}>
                                {[
                                    { l: "1Kスタート", v: sst.start1K > 0 ? `${f(sst.start1K, 1)}回/K` : "—" },
                                    { l: "期待値/K", v: sst.ev1K ? `${sp(Math.round(sst.ev1K), 0)}円` : "—" },
                                    { l: "時給", v: sst.wage ? `${f(Math.round(sst.wage))}円/h` : "—" },
                                ].map(x => (
                                    <div key={x.l} className="min-w-0">
                                        <div className="truncate text-[9px] font-bold text-[var(--at-mut)]">{x.l}</div>
                                        <div className="mt-1 truncate font-mono text-[13px] font-black tabular-nums text-[var(--at-subtle-hi)]">{x.v}</div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {/* 回転数データ・大当たり履歴 */}
                        {editGameType !== "slot" && (
                            <div>
                                {renderRotHistory(sel)}
                                {renderJpHistory(sel)}
                            </div>
                        )}

                        {/* 削除（確認付き。削除後もシートに留まり、0件になれば追加フォームへ） */}
                        <div className={`${cardCls} flex items-center justify-between gap-3 p-3.5`}>
                            <div className="text-[11px] leading-relaxed text-[var(--at-mut)]">
                                {delConfirm === sel.id ? "本当に削除しますか？（元に戻せません）" : "この記録を削除します。タップ後に確認が入ります。"}
                            </div>
                            {delConfirm === sel.id ? (
                                <button type="button" onClick={() => { deleteArchive(sel.id); setDelConfirm(null); }}
                                    className="h-11 shrink-0 rounded-[11px] bg-[var(--at-neg)] px-4 text-[12.5px] font-black text-white">削除確定</button>
                            ) : (
                                <button type="button" onClick={() => setDelConfirm(sel.id)}
                                    className="h-11 shrink-0 rounded-[11px] border border-[var(--at-heat-m-bd)] bg-[var(--at-heat-m)] px-4 text-[12.5px] font-black text-[var(--at-neg)]">記録を削除</button>
                            )}
                        </div>

                        {/* 下部固定の保存CTA（保存で分析へ自動復帰） */}
                        <div className="sticky bottom-0 -mx-1 bg-[linear-gradient(180deg,transparent,var(--at-page)_38%)] px-1 pb-16 pt-5">
                            <button type="button" onClick={() => { applyArchiveEdits(sel, false); if (onDone) onDone(); }}
                                className="h-[52px] w-full rounded-[13px] bg-[linear-gradient(135deg,var(--at-cyan),var(--at-accent))] text-[15px] font-black tracking-[.04em] text-[var(--at-page)] shadow-[0_10px_30px_rgba(22,200,255,.25)]">
                                保存する
                            </button>
                            <div className="mt-2 text-center text-[10px] font-bold text-[var(--at-mut)]">保存するとカレンダーに戻り、数値が反映されます</div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* 記録なしの日: 追加フォームを最初から展開して表示（押し直し不要） */}
                        <div className={`${cardCls} p-4 text-center`}>
                            <div className="text-[12px] font-bold text-[var(--at-mut)]">{dateArchives.length > 0 ? "別の遊技記録を追加" : "この日のデータはありません"}</div>
                            <div className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--at-faint2)]">パチンコ・パチスロを同じ日に複数件記録できます</div>
                            {dateArchives.length > 0 && (
                                <button type="button" onClick={() => setAddFormOpen(false)} className="mt-3 text-[11px] font-black text-[var(--at-cyan)]">編集へ戻る</button>
                            )}
                        </div>
                        <div className={`${cardCls} p-4`}>
                            <div className="flex items-center gap-2 text-[12px] font-black text-[var(--at-subtle-hi)]">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--at-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                この日の記録を追加
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
                                {gameTypeSelector(addGameType, setAddGameType)}
                                <div className="col-span-2">
                                    <div className={labelCls}>店舗</div>
                                    <div className="relative">
                                        <input value={addStore} onChange={e => setAddStore(e.target.value)} placeholder="店舗名" className={inputCls} />
                                        {storeList.length > 0 && (
                                            <button type="button" onClick={() => setShowAddStoreDD(v => !v)}
                                                className="absolute right-0 top-1/2 -translate-y-1/2 px-3 py-3 text-[12px] text-[var(--at-faint)]">▼</button>
                                        )}
                                        {storeDD(showAddStoreDD, setShowAddStoreDD, setAddStore)}
                                    </div>
                                </div>
                                <div>
                                    <div className={labelCls}>機種名</div>
                                    <input value={addMachineName} onChange={e => setAddMachineName(e.target.value)} placeholder="任意" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>台番号</div>
                                    <input {...numProps} value={addMachineNum} onChange={e => setAddMachineNum(e.target.value)} placeholder="任意" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>投資額（円）</div>
                                    <input {...numProps} value={addInvest} onChange={e => setAddInvest(e.target.value)} placeholder="10000" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>回収額（円）</div>
                                    <input {...numProps} value={addRecovery} onChange={e => setAddRecovery(e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>遊技時間（時間）</div>
                                    <input {...decProps} value={addPlayHours} onChange={e => setAddPlayHours(e.target.value)} placeholder="例 3.5" className={inputCls} />
                                </div>
                                {addGameType === "slot"
                                    ? slotFields({ rate: addSlotRate, setRate: setAddSlotRate, games: addSlotGames, setGames: setAddSlotGames, bb: addSlotBB, setBB: setAddSlotBB, rb: addSlotRB, setRB: setAddSlotRB, at: addSlotAT, setAT: setAddSlotAT })
                                    : (
                                        <div>
                                            <div className={labelCls}>貯玉残高（玉）</div>
                                            <input {...numProps} value={addChodama} onChange={e => setAddChodama(e.target.value)} placeholder="0" className={inputCls} />
                                        </div>
                                    )}
                            </div>
                            <div className="mt-2 text-[9px] text-[var(--at-mut)]">
                                投資・回収のどちらかを入力すると追加できます。{addGameType === "slot" ? "ゲーム数やボーナス回数は任意です。" : "貯玉残高は店舗の現在残高として登録されます。"}
                            </div>
                        </div>
                        <div className="sticky bottom-0 -mx-1 bg-[linear-gradient(180deg,transparent,var(--at-page)_38%)] px-1 pb-16 pt-5">
                            <button type="button" disabled={!canAdd} onClick={() => { saveManualArchive(); if (onDone) onDone(); }}
                                className={`h-[52px] w-full rounded-[13px] text-[15px] font-black tracking-[.04em] ${canAdd
                                    ? "bg-[linear-gradient(135deg,var(--at-cyan),var(--at-accent))] text-[var(--at-page)] shadow-[0_10px_30px_rgba(22,200,255,.25)]"
                                    : "border border-[var(--at-ln-md)] bg-[var(--at-panel2)] text-[var(--at-faint)]"}`}>
                                追加する
                            </button>
                            <div className="mt-2 text-center text-[10px] font-bold text-[var(--at-mut)]">追加するとカレンダーに戻り、その日のセルに反映されます</div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Detail View for a specific archive ──
    if (selectedArchiveId) {
        const a = archives.find(ar => ar.id === selectedArchiveId);
        if (!a) { setSelectedArchiveId(null); return null; }
        const st = a.stats || {};
        const evBreakdown = getEvBreakdown(a);
        const stWork = evBreakdown.total;
        const pl = (a.investYen > 0 || a.recoveryYen > 0) ? (a.recoveryYen || 0) - (a.investYen || 0) : null;
        const aggKey = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
        const agg = a.machineNum ? machineAggregates[aggKey] : null;

        // 保存処理は CalendarTab スコープの applyArchiveEdits に共通化（focusMode 編集シートと共用）
        const updateArchive = (doReset) => applyArchiveEdits(a, doReset);

        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="b" onClick={() => { setSelectedArchiveId(null); setExpandedRot(null); setDelConfirm(null); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 戻る</button>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{a.date}</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>

                    {/* Header with P&L */}
                    <Card style={{ padding: 16, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                            <div>
                                {a.storeName && <div style={{ fontSize: 12, color: C.sub }}>{a.storeName}</div>}
                                <div style={{ fontSize: 18, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>
                                    {a.machineName && a.machineName !== `1/${a.settings?.synthDenom}`
                                        ? a.machineName
                                        : (a.machineName || `1/${a.settings?.synthDenom || "—"}`)}
                                </div>
                                <div style={{ fontSize: 12, color: C.sub }}>
                                    {a.machineNum ? a.machineNum + "番台" : ""}{a.settings?.synthDenom ? `, 1/${a.settings.synthDenom}` : ""}{a.isMoveArchive ? " (台移動)" : ""}
                                </div>
                                {a.time && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>時間: {a.time}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                {pl != null ? (
                                    <div style={{ fontSize: 28, fontWeight: 900, color: sc(pl), fontFamily: mono, lineHeight: 1.1 }}>
                                        {f(pl)}
                                    </div>
                                ) : stWork != null && stWork !== 0 ? (
                                    <div style={{ fontSize: 28, fontWeight: 900, color: sc(stWork), fontFamily: mono, lineHeight: 1.1 }}>
                                        {f(stWork)}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                            {[
                                { label: "投資", val: f(a.investYen || 0), col: C.red },
                                { label: "回収", val: f(a.recoveryYen || 0), col: C.green },
                                { label: "収支", val: pl != null ? f(pl) : "0", col: pl != null ? sc(pl) : C.subHi },
                                { label: "合計期待値", val: stWork != null && stWork !== 0 ? f(Math.round(stWork)) : "—", col: stWork ? sc(stWork) : C.subHi },
                            ].map(({ label, val, col }) => (
                                <div key={label} style={{ textAlign: "center", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 2px" }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: mono }}>{val}</div>
                                </div>
                            ))}
                        </div>
                        {evBreakdown.yutime !== 0 && (
                            <div style={{ marginTop: 8, textAlign: "right", fontSize: 10, color: C.sub }}>
                                通常期待値 {sp(Math.round(evBreakdown.normal))}円 ＋ 遊タイム期待値 {sp(Math.round(evBreakdown.yutime))}円
                            </div>
                        )}
                        {/* 貯玉換算表示 */}
                        {(a.chodamaYen || 0) > 0 && (
                            <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(168,85,247,0.1)", borderRadius: 10, border: `1px solid rgba(168,85,247,0.25)` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <span style={{ fontSize: 13 }}>💎</span>
                                        <span style={{ fontSize: 12, color: C.purple, fontWeight: 600 }}>貯玉換算</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                        <span style={{ fontSize: 11, color: C.sub }}>
                                            {a.chodamaNetBalls < 0
                                                ? `${f(Math.abs(a.chodamaNetBalls))}玉消費`
                                                : `${f(a.chodamaNetBalls || 0)}玉増加`}
                                        </span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: C.purple, fontFamily: mono }}>¥{f(a.chodamaYen)}</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: C.sub }}>
                                    <span>開始: {f(a.initialChodama || 0)}玉</span>
                                    <span>→</span>
                                    <span>終了: {f(a.finalChodama || 0)}玉</span>
                                    <span>合計投資: ¥{f((a.investYen || 0) + (a.chodamaYen || 0))}</span>
                                </div>
                            </div>
                        )}
                    </Card>

                    {a.yutimeDecision && (
                        <Card style={{ padding: 14, marginBottom: 8, borderColor: `${C.blue}66` }}>
                            <SecLabel label="遊タイム判断（累計期待値へ加算）" />
                            {a.yutimeDecision.result?.valid ? (
                                <>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                        {[
                                            ["期待値", `${Math.round(a.yutimeDecision.result.selectedEV || 0) >= 0 ? "+" : ""}${Math.round(a.yutimeDecision.result.selectedEV || 0).toLocaleString()}円`],
                                            ["残り回転", `${Math.round(a.yutimeDecision.result.remainingSpins || 0).toLocaleString()}回`],
                                            ["到達率", `${(Number(a.yutimeDecision.result.reachProbability || 0) * 100).toFixed(1)}%`],
                                            ["平均投資", `${Math.round(a.yutimeDecision.result.selectedInvestment || 0).toLocaleString()}円`],
                                            ["到達必要資金", a.yutimeDecision.result.selectedArrivalInvestment == null ? "—" : `${Math.ceil(a.yutimeDecision.result.selectedArrivalInvestment).toLocaleString()}円`],
                                        ].map(([label, value]) => (
                                            <div key={label} style={{ background: "var(--surface-hi)", borderRadius: 9, padding: 9 }}>
                                                <div style={{ fontSize: 9, color: C.sub }}>{label}</div>
                                                <div style={{ marginTop: 3, color: C.text, fontSize: 14, fontWeight: 800, fontFamily: mono }}>{value}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 10, color: C.sub, lineHeight: 1.6 }}>
                                        開始 {a.yutimeDecision.currentLowSpins ?? "—"}回 ・ 想定1K {a.yutimeDecision.assumedStart1K ?? "—"}回/K ・ {a.yutimeDecision.pachinkoRateLabel || formatPachinkoRateLabel(a.yutimeDecision.rentBalls || a.settings?.rentBalls)}パチンコ ・ {a.yutimeDecision.spec?.source === "master" ? "自動機種データ" : "手動設定"}
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: C.sub }}>期待出玉などの入力が不足していたため、開始時の条件だけを保存しています。</div>
                            )}
                        </Card>
                    )}

                    {Array.isArray(a.yutimeRuns) && a.yutimeRuns.length > 0 && (
                        <Card style={{ padding: 13, marginBottom: 8, border: "1px solid rgba(245,158,11,.55)" }}>
                            <SecLabel label="遊タイム実績（通常期待値とは別記録）" />
                            {a.yutimeRuns.map((run, index) => (
                                <div key={run.id || index} style={{ padding: "10px 0", borderTop: index ? `1px solid ${C.border}` : "none" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, fontWeight: 800 }}>
                                        <span>{run.status === "active" ? "記録中" : run.outcome === "hit" ? "遊タイム中に当たり" : "スルー・終了"}</span>
                                        <span style={{ color: C.yellow }}>{Number(run.supportSpins || 0).toLocaleString()}回</span>
                                    </div>
                                    <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, fontSize: 10, color: C.sub }}>
                                        <span>開始 {Number(run.startBalls || 0).toLocaleString()}玉</span>
                                        <span>終了 {run.endBalls == null ? "—" : `${Number(run.endBalls).toLocaleString()}玉`}</span>
                                        <span>追加 {Number(run.supportCashYen || 0).toLocaleString()}円</span>
                                    </div>
                                </div>
                            ))}
                        </Card>
                    )}

                    {/* Edit form */}
                    {/* 店舗ドロップダウン（position:absolute）がカード境界でクリップされ
                        下のカードと重なって見える不具合を防ぐため overflow を visible にする */}
                    <Card style={{ padding: 14, marginBottom: 8, overflow: "visible" }}>
                        <SecLabel label="データ編集" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>店舗</div>
                                <div style={{ position: "relative" }}>
                                    {textInput(editStore, setEditStore, "店舗名")}
                                    {storeList.length > 0 && (
                                        <button className="b" onClick={() => setShowEditStoreDD(!showEditStoreDD)} style={{
                                            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                                            background: "transparent", border: "none", color: C.sub, fontSize: 14, padding: "4px 6px", cursor: "pointer"
                                        }}>▼</button>
                                    )}
                                    {showEditStoreDD && storeList.length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, zIndex: 10, maxHeight: 150, overflowY: "auto", marginTop: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                                            {storeList.map((st, i) => {
                                                const storeName = typeof st === "object" ? st.name : st;
                                                return (
                                                    <button key={st.id || i} className="b" onClick={() => { setEditStore(storeName); setShowEditStoreDD(false); }} style={{
                                                        width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                        color: C.text, fontSize: 13, padding: "10px 12px", textAlign: "left", fontFamily: font, cursor: "pointer"
                                                    }}>{storeName}</button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>台番号</div>
                                {textInput(editMachineNum, setEditMachineNum, "台番号", { type: "tel", inputMode: "numeric", pattern: "[0-9]*" })}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>投資額</div>
                                <NI v={editInvest} set={setEditInvest} w="100%" center ph="10000" />
                                {Math.round(a.carriedInYen || 0) > 0 ? (
                                    <div style={{ fontSize: 9, color: C.sub, marginTop: 4 }}>引き継ぎ玉 ¥{(Math.round(a.carriedInYen || 0)).toLocaleString()} を含む</div>
                                ) : Math.round(a.stats?.rawInvest || 0) > 0 && (
                                    <div style={{ fontSize: 9, color: C.sub, marginTop: 4 }}>実践記録から自動反映</div>
                                )}
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>回収額</div>
                                <NI v={editRecovery} set={setEditRecovery} w="100%" center ph="0" />
                            </div>
                        </div>
                        {editGameType !== "slot" && hasYutimeSettlement(a) && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>遊タイム終了時の持ち玉（玉）</div>
                                <NI v={editMochi} set={(value) => updateEditMochi(value, a)} w="100%" center ph="0" />
                                <div style={{ fontSize: 9, color: C.sub, marginTop: 4 }}>交換率から回収額を自動換算します</div>
                            </div>
                        )}
                        {/* 貯玉残高：この店舗の現在残高を編集（保存で店舗残高に同期） */}
                        {(S.stores || []).some(st => typeof st === "object" && (st.id === a.storeId || st.name === a.storeName)) && (
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>貯玉残高（玉）</div>
                                <NI v={editChodama} set={setEditChodama} w="100%" center ph="0" />
                                <div style={{ fontSize: 9, color: C.sub, marginTop: 4 }}>「{a.storeName || ""}」の現在残高に同期されます</div>
                            </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <Btn label="保存" onClick={() => updateArchive(false)} primary fs={13} />
                            <Btn label="保存してリセット" onClick={() => updateArchive(true)} bg={C.orange} fg="#fff" bd="none" fs={13} />
                        </div>
                    </Card>

                    <DataQualityFeedbackCard
                        archive={a}
                        archives={archives}
                        stores={storeList}
                        onUpdate={(next) => S.setArchives(prev => prev.map(item => item.id === next.id ? next : item))}
                    />

                    {/* EV stats */}
                    <Card style={{ overflow: "hidden", marginBottom: 8 }}>
                        <SecLabel label="EV詳細" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                            {[
                                { label: "1Kスタート", val: st.start1K > 0 ? f(st.start1K, 1) : "—", unit: "回/K" },
                                { label: "期待値/K", val: st.ev1K != null && st.ev1K !== 0 ? sp(Math.round(st.ev1K), 0) : "—", unit: "円" },
                                { label: "時給", val: st.wage ? f(Math.round(st.wage)) : "—", unit: "円/h" },
                            ].map(({ label, val, unit }) => (
                                <div key={label} style={{ textAlign: "center", padding: "10px 4px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: C.subHi, fontFamily: mono }}>{val}</div>
                                    <div style={{ fontSize: 9, color: C.sub, marginTop: 1 }}>{unit}</div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* Machine aggregate */}
                    {agg && agg.count > 1 && (
                        <Card style={{ padding: 12, marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 6 }}>台番号 {agg.machineNum} トータル</div>
                            <div style={{ display: "flex", gap: 12 }}>
                                <span style={{ fontSize: 12, color: C.subHi }}>座り{agg.count}回</span>
                                <span style={{ fontSize: 12, color: C.subHi }}>1K: {agg.totalK > 0 ? f(agg.totalRot / agg.totalK, 1) : "—"}回</span>
                                <span style={{ fontSize: 12, color: C.subHi }}>総{f(agg.totalRot)}回転</span>
                            </div>
                        </Card>
                    )}

                    {/* Rotation data / Jackpot history（focusMode 編集シートと共通レンダラー） */}
                    {renderRotHistory(a)}
                    {renderJpHistory(a)}

                    {/* Delete button */}
                    <div style={{ textAlign: "center", marginTop: 8, marginBottom: 16 }}>
                        {delConfirm === a.id ? (
                            <button className="b" onClick={() => { deleteArchive(a.id); setSelectedArchiveId(null); }} style={{
                                background: C.red, border: "none", borderRadius: 8,
                                color: "#fff", fontSize: 13, padding: "10px 24px", fontWeight: 700, fontFamily: font
                            }}>削除確定</button>
                        ) : (
                            <button className="b" onClick={() => setDelConfirm(a.id)} style={{
                                background: "rgba(239,68,68,0.1)", border: `1px solid ${C.red}40`, borderRadius: 8,
                                color: C.red, fontSize: 13, padding: "10px 24px", fontWeight: 700, fontFamily: font
                            }}>このデータを削除</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ヒートマップ6段階の色分け（証券端末風トークン。閾値 HEAT_BIG は不変）
    const HEAT_BIG = 20000; // 「大きく」の閾値（円）
    // 凡例・セル背景で参照する代表色（端末風）
    const HEAT = {
        bigPlus: "var(--heat-plus-big)",   // 大きくプラス
        plus: "var(--heat-plus)",          // プラス
        zero: "var(--heat-zero)",          // ±0 / 稼働なし
        minus: "var(--heat-minus)",        // マイナス
        bigMinus: "var(--heat-minus-big)", // 大きくマイナス
        none: "var(--heat-zero)",          // 稼働なし
    };
    const heatBg = (actual, hasActualData) => {
        if (!hasActualData) return HEAT.none;
        if (actual >= HEAT_BIG) return HEAT.bigPlus;
        if (actual > 0) return HEAT.plus;
        if (actual === 0) return HEAT.zero;
        if (actual > -HEAT_BIG) return HEAT.minus;
        return HEAT.bigMinus;
    };
    const heatFg = (actual, hasActualData) => {
        if (!hasActualData) return "var(--dim)";
        if (actual >= HEAT_BIG) return "var(--plus)";
        if (actual > 0) return "var(--plus)";
        if (actual === 0) return "var(--dim)";
        if (actual > -HEAT_BIG) return "var(--minus)";
        return "var(--minus)";
    };
    // 「大きく」域は太字（>= +20000 / <= -20000）
    const heatBold = (actual, hasActualData) => hasActualData && Math.abs(actual) >= HEAT_BIG;
    // KPI数値を画面幅に収めるための圧縮フォーマット（±1.5万 / ±8,000）
    const cpK = (n) => {
        if (n == null || !isFinite(n) || isNaN(n)) return "—";
        const abs = Math.abs(n);
        const sign = n > 0 ? "+" : n < 0 ? "-" : "";
        if (abs >= 100000) return sign + f(abs / 10000, 0) + "万";
        if (abs >= 10000) return sign + f(abs / 10000, 1) + "万";
        return sp(n);
    };

    // ── Calendar View ── （証券端末風。.cal-terminal でトークンをスコープ限定・テーマ対応）
    // overflowX: hidden 必須 — overflowY のみだと横方向が auto になり、幅超過要素で画面が左へパンしたまま固定される
    return (
        <div className="cal-terminal" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 月ナビゲーター（端末風・タップ領域44px） */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px 12px" }}>
                <button className="b" onClick={prevMonth} style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: "var(--bg-panel)", border: "1px solid var(--tw-border)",
                    color: "var(--muted)", fontSize: 18, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>‹</button>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--txt)", fontFamily: TMONO, letterSpacing: ".02em" }}>{viewMonth.year}年{viewMonth.month + 1}月</div>
                <button className="b" onClick={nextMonth} style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: "var(--bg-panel)", border: "1px solid var(--tw-border)",
                    color: "var(--muted)", fontSize: 18, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>›</button>
            </div>

            {/* ① KPIカード（PNL・6指標を2行×3列グリッド） */}
            <SectionLabel code="PNL" label="月間サマリー" right={`${monthKpi.realCount}件 / ${f(monthKpi.hours, 1)}h`} />
            <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                background: "var(--bg-panel)", border: "1px solid var(--tw-border)", borderRadius: 8,
                marginBottom: 10, overflow: "hidden",
            }}>
                {[
                    { label: "月収支", val: monthKpi.hasActual ? cpK(Math.round(monthKpi.pl)) : "—", unit: monthKpi.hasActual ? "円" : "", col: monthKpi.hasActual ? twSc(monthKpi.pl) : "var(--dim)" },
                    { label: "EV", val: monthKpi.ev !== 0 ? cpK(Math.round(monthKpi.ev)) : "—", unit: monthKpi.ev !== 0 ? "円" : "", col: monthKpi.ev !== 0 ? "var(--ev)" : "var(--dim)" },
                    { label: "差（収支−EV）", val: monthKpi.hasActual ? cpK(Math.round(monthKpi.pl - monthKpi.ev)) : "—", unit: monthKpi.hasActual ? "円" : "", col: monthKpi.hasActual ? twSc(monthKpi.pl - monthKpi.ev) : "var(--dim)" },
                    { label: "ROI", val: monthKpi.roi != null ? f(monthKpi.roi, 0) : "—", unit: monthKpi.roi != null ? "%" : "", col: monthKpi.roi == null ? "var(--dim)" : monthKpi.roi >= 100 ? "var(--plus)" : "var(--minus)" },
                    { label: "時給", val: monthKpi.wage != null ? cpK(monthKpi.wage) : "—", unit: monthKpi.wage != null ? "円/h" : "", col: monthKpi.wage != null ? twSc(monthKpi.wage) : "var(--dim)" },
                    { label: "勝率", val: monthKpi.winRate != null ? f(monthKpi.winRate, 0) : "—", unit: monthKpi.winRate != null ? "%" : "", col: "var(--txt)", sub: monthKpi.realCount > 0 ? `(${monthKpi.winCount}/${monthKpi.realCount})` : "" },
                ].map((k, i) => (
                    <div key={k.label} style={{
                        padding: "10px 4px 9px", textAlign: "center",
                        borderLeft: i % 3 === 0 ? "none" : "1px solid var(--tw-border)",
                        borderTop: i >= 3 ? "1px solid var(--tw-border)" : "none",
                    }}>
                        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>{k.label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 1 }}>
                            <span style={{ fontSize: 17, fontWeight: 600, color: k.col, fontFamily: TMONO, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{k.val}</span>
                            {k.unit && <span style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600 }}>{k.unit}</span>}
                        </div>
                        {k.sub && <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600, marginTop: 2, fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>{k.sub}</div>}
                    </div>
                ))}
            </div>

            {/* ② 日別ヒートマップ（CAL・証券端末風） */}
            <SectionLabel code="CAL" label="日別ヒートマップ" right={`${viewMonth.year}年${viewMonth.month + 1}月`} />
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--tw-border)", borderRadius: 8, padding: "10px 10px 10px", marginBottom: 10 }}>
                {/* 曜日ヘッダー */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "0 0 4px" }}>
                    {["月", "火", "水", "木", "金", "土", "日"].map((d, i) => (
                        <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: i === 5 ? "var(--ev)" : i === 6 ? "var(--minus)" : "var(--dim)", padding: "2px 0" }}>{d}</div>
                    ))}
                </div>

                {/* ヒートマップグリッド */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                    {calendarDays.map((day, idx) => {
                        if (day === null) return <div key={`e-${idx}`} />;
                        const ds = dateStr(day);
                        const total = dailyTotals[ds];
                        const hasActualData = total != null && total.hasActual;
                        const actual = hasActualData ? total.actual : 0;
                        const isSel = selectedDate === ds;
                        const isTdy = isToday(day);
                        const bg = heatBg(actual, hasActualData);
                        const bold = heatBold(actual, hasActualData);
                        // 文字色: 今日=アンバー、それ以外はヒート色
                        const fg = isTdy ? "var(--accent-amber)" : heatFg(actual, hasActualData);
                        return (
                            <button key={day} className="b" onClick={() => setSelectedDate(isSel ? null : ds)} style={{
                                aspectRatio: "1 / 1", minHeight: 40,
                                background: bg,
                                border: isTdy ? "1.5px solid var(--accent-amber)" : isSel ? "1.5px solid var(--ev)" : "1px solid var(--tw-border)",
                                borderRadius: 4,
                                cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                padding: 0,
                            }}>
                                <span style={{ fontSize: 13, fontWeight: bold ? 700 : (isTdy ? 700 : 500), color: fg, fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>{day}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ③ 選択日詳細アコーディオン（タップした日付の直下に縦展開） */}
                {selectedDate && (() => {
                    const arr = byDate[selectedDate] || [];
                    let inv = 0, rec = 0, ev = 0, workMin = 0, hasActual = false;
                    arr.forEach(a => {
                        const i2 = Number(a.investYen) || 0;
                        const r2 = Number(a.recoveryYen) || 0;
                        if (i2 > 0 || r2 > 0) { inv += i2; rec += r2; hasActual = true; }
                        ev += getEvAmount(a);
                        const nr = Number(a.stats?.netRot) || 0;
                        const rph = Number(a.settings?.rotPerHour) || 0;
                        if (nr > 0 && rph > 0) workMin += (nr / rph) * 60;
                    });
                    const actual = rec - inv;
                    const diff = actual - ev;
                    const hours = workMin / 60;
                    const wage = hours > 0 && hasActual ? Math.round(actual / hours) : null;
                    // MM/DD (曜) 形式の日付ラベル
                    const dow = ["日", "月", "火", "水", "木", "金", "土"][new Date(`${selectedDate}T00:00:00`).getDay()];
                    const dateLabel = `${selectedDate.slice(5, 7)}/${selectedDate.slice(8, 10)} (${dow})`;
                    // 1行=ラベル＋値（複合値も可）の行定義
                    const rows = [
                        { label: "収支", parts: [{ v: hasActual ? sp(Math.round(actual)) : "—", col: hasActual ? twSc(actual) : "var(--dim)" }], unit: "円" },
                        { label: "EV（期待値）", parts: [{ v: ev !== 0 ? sp(Math.round(ev)) : "—", col: ev !== 0 ? "var(--ev)" : "var(--dim)" }], unit: "円" },
                        { label: "差（収支−EV）", parts: [{ v: hasActual ? sp(Math.round(diff)) : "—", col: hasActual ? twSc(diff) : "var(--dim)" }], unit: "円" },
                        { label: "投資 / 回収", parts: [{ v: f(inv), col: "var(--txt)" }, { v: f(rec), col: "var(--txt)", sep: " / " }], unit: "円" },
                        { label: "稼働 / 時給", parts: [{ v: hours > 0 ? f(hours, 1) + "h" : "—", col: "var(--txt)" }, { v: wage != null ? sp(wage) : "—", col: wage != null ? twSc(wage) : "var(--dim)", sep: " / " }], unit: "円/h" },
                    ];
                    return (
                        <div style={{
                            marginTop: 10, padding: "10px 12px 4px",
                            background: "var(--bg-panel2)", borderLeft: "2px solid var(--ev)", borderRadius: 8,
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--txt)", fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>{dateLabel}</span>
                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {arr.length > 0 && (
                                        <button className="b" onClick={() => setSelectedArchiveId(arr[0].id)} style={{
                                            minHeight: 44, display: "inline-flex", alignItems: "center",
                                            background: "transparent", border: "none", color: "var(--ev)", fontSize: 12, fontWeight: 700,
                                            fontFamily: TMONO, cursor: "pointer", padding: "2px 4px",
                                        }}>セッション詳細 →</button>
                                    )}
                                    <button className="b" onClick={() => setSelectedDate(null)} style={{
                                        minHeight: 44, display: "inline-flex", alignItems: "center",
                                        background: "transparent", border: "none", color: "var(--dim)", fontSize: 12, fontWeight: 700,
                                        fontFamily: TMONO, cursor: "pointer", padding: "2px 4px",
                                    }}>▲ 閉じる</button>
                                </span>
                            </div>
                            {rows.map((r, i) => (
                                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: i === rows.length - 1 ? "none" : "1px dashed var(--tw-border)" }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{r.label}</span>
                                    <span style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                                        {r.parts.map((p, pi) => (
                                            <React.Fragment key={pi}>
                                                {p.sep && <span style={{ fontSize: 13, color: "var(--dim)", fontFamily: TMONO }}>{p.sep}</span>}
                                                <span style={{ fontSize: 15, fontWeight: 600, color: p.col, fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>{p.v}</span>
                                            </React.Fragment>
                                        ))}
                                        <span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600 }}>{r.unit}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    );
                })()}

                {/* 凡例（6段階・端末風色） */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 10px", padding: "10px 2px 0" }}>
                    {[
                        { c: HEAT.bigPlus, t: "大きくプラス" },
                        { c: HEAT.plus, t: "プラス" },
                        { c: HEAT.zero, t: "±0" },
                        { c: HEAT.minus, t: "マイナス" },
                        { c: HEAT.bigMinus, t: "大きくマイナス" },
                        { c: HEAT.none, t: "稼働なし" },
                    ].map(l => (
                        <div key={l.t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.c, border: "1px solid var(--tw-border)" }} />
                            <span style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600 }}>{l.t}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ④ 収支推移チャート（TRD・実収支 / EV / 差 の3系列） */}
            <SectionLabel code="TRD" label="収支推移" right={`${viewMonth.year}年${viewMonth.month + 1}月（累計）`} />
            <div style={{ background: "var(--bg-panel)", border: "1px solid var(--tw-border)", borderRadius: 8, padding: "10px 8px 10px", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 14, padding: "0 6px 6px" }}>
                    {[
                        { c: "var(--plus)", t: "実収支", dash: false },
                        { c: "var(--ev)", t: "EV", dash: false },
                        { c: "var(--dim)", t: "差", dash: true },
                    ].map(l => (
                        <div key={l.t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 16, height: 2, display: "inline-block", background: l.dash ? `repeating-linear-gradient(90deg, ${l.c} 0 3px, transparent 3px 6px)` : l.c }} />
                            <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{l.t}</span>
                        </div>
                    ))}
                </div>
                <MultiLineChart points={trendPoints} />
            </div>

            {/* ⑤ 機種別・店舗別ランキング（RNK・時給順） */}
            {(machineWageRank.length > 0 || storeWageRank.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <WageRankCard title="機種別（時給順）" rows={machineWageRank} expanded={showAllMachines} onToggle={() => setShowAllMachines(v => !v)} />
                    <WageRankCard title="店舗別（時給順）" rows={storeWageRank} expanded={showAllStores} onToggle={() => setShowAllStores(v => !v)} />
                </div>
            )}

            {/* ⑥ 日別履歴テーブル（LOG・日付 / 収支 / EV / 差） */}
            {monthDays.length > 0 && (
                <>
                    <SectionLabel code="LOG" label="日別履歴" right={`${monthDays.length}日`} />
                    <div style={{ background: "var(--bg-panel)", border: "1px solid var(--tw-border)", borderRadius: 8, padding: "8px 0 4px", marginBottom: 10 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "0 14px 6px", borderBottom: "1px solid var(--tw-border)" }}>
                            {["日付", "収支", "EV", "差"].map((h, i) => (
                                <div key={h} style={{ fontSize: 9, color: "var(--dim)", fontWeight: 700, letterSpacing: ".08em", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
                            ))}
                        </div>
                        {[...monthDays].reverse().slice(0, showAllHistory ? undefined : 4).map((d) => (
                            <button key={d.date} className="b" onClick={() => setSelectedDate(selectedDate === d.date ? null : d.date)} style={{
                                width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
                                padding: "10px 14px",
                                background: selectedDate === d.date ? "rgba(77,163,255,0.08)" : "transparent",
                                border: "none", borderBottom: "1px solid var(--tw-border)",
                                cursor: "pointer", alignItems: "center",
                            }}>
                                <span style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, textAlign: "left", fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>
                                    {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: d.hasActual ? twSc(d.actual) : "var(--dim)", textAlign: "right", fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>
                                    {d.hasActual ? sp(Math.round(d.actual)) : "—"}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: d.ev !== 0 ? twSc(d.ev) : "var(--dim)", textAlign: "right", fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>
                                    {d.ev !== 0 ? sp(Math.round(d.ev)) : "—"}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: d.hasActual ? twSc(d.diff) : "var(--dim)", textAlign: "right", fontFamily: TMONO, fontVariantNumeric: "tabular-nums" }}>
                                    {d.hasActual ? sp(Math.round(d.diff)) : "—"}
                                </span>
                            </button>
                        ))}
                        {monthDays.length > 4 && (
                            <button className="b" onClick={() => setShowAllHistory(v => !v)} style={{
                                width: "100%", minHeight: 44, background: "transparent", border: "none",
                                color: "var(--ev)", fontSize: 12, fontWeight: 700, fontFamily: TMONO, cursor: "pointer",
                            }}>{showAllHistory ? "閉じる" : "すべて見る →"}</button>
                        )}
                    </div>
                </>
            )}

            {/* ── Inline data strip when date is selected ── */}
            {selectedDate && (() => {
                const dateArchives = byDate[selectedDate] || [];
                const dayTotal = dailyTotals[selectedDate];
                const hasCurrentSession = S.rotRows && S.rotRows.length > 0;
                return (
                    <div style={{ marginTop: 10 }}>
                        {/* Selected date header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, letterSpacing: 0.4 }}>この日のセッション</div>
                            {dayTotal != null && (dayTotal.hasActual || dayTotal.ev !== 0) && (
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                    {dayTotal.hasActual && (
                                        <div style={{ fontSize: 14, fontWeight: 700, color: sc(dayTotal.actual), fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginRight: 3 }}>実</span>
                                            {f(Math.round(dayTotal.actual))}<span className="unit">円</span>
                                        </div>
                                    )}
                                    {dayTotal.ev !== 0 && (
                                        <div style={{ fontSize: 13, fontWeight: 600, color: sc(dayTotal.ev), opacity: 0.85, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                                            <span style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginRight: 3 }}>期</span>
                                            {f(Math.round(dayTotal.ev))}<span className="unit">円</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>


                        {/* Archive entries — swipeable summary cards */}
                        {dateArchives.length > 0 ? dateArchives.map(a => (
                            <div key={a.id} style={{ position: "relative", overflow: "hidden", borderRadius: 12, marginBottom: 8 }}>
                                {/* Delete button behind card — only visible when swiped */}
                                {swipedId === a.id && (
                                    <div style={{
                                        position: "absolute", right: 0, top: 0, bottom: 0, width: 80,
                                        background: C.red, display: "flex", alignItems: "center", justifyContent: "center",
                                        borderRadius: "0 12px 12px 0", zIndex: 0,
                                    }}>
                                        <button className="b" onClick={(e) => { e.stopPropagation(); deleteArchive(a.id); setSwipedId(null); }} style={{
                                            background: "transparent", border: "none", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: font, padding: "8px 12px",
                                        }}>削除</button>
                                    </div>
                                )}
                                {/* Swipeable card */}
                                <div
                                    style={{
                                        transform: swipedId === a.id ? "translateX(-80px)" : "translateX(0)",
                                        transition: "transform 0.25s ease",
                                        position: "relative", zIndex: 1,
                                    }}
                                    onTouchStart={(e) => {
                                        swipeRef.current = { startX: e.touches[0].clientX, id: a.id };
                                    }}
                                    onTouchEnd={(e) => {
                                        const dx = e.changedTouches[0].clientX - swipeRef.current.startX;
                                        if (swipeRef.current.id === a.id) {
                                            if (dx < -50) setSwipedId(a.id);
                                            else if (dx > 30) setSwipedId(null);
                                        }
                                    }}
                                    onClick={() => { if (swipedId === a.id) { setSwipedId(null); } }}
                                >
                                    <SummaryCard a={a} onClick={() => { if (swipedId !== a.id) setSelectedArchiveId(a.id); }} />
                                </div>
                            </div>
                        )) : !hasCurrentSession && (
                            <div>
                                <div style={{ textAlign: "center", color: C.sub, fontSize: 12, padding: "14px 0 10px" }}>
                                    この日のデータはありません
                                </div>
                                {!addFormOpen ? (
                                    /* 記録がない日も後から収支を追加できる入口（分析カレンダーの「記録を追加」導線の受け皿） */
                                    <button className="b" onClick={() => setAddFormOpen(true)} style={{
                                        width: "100%", minHeight: 48, borderRadius: 12,
                                        background: C.surface, border: `1px dashed ${C.borderHi}`,
                                        color: C.blue, fontSize: 14, fontWeight: 700, fontFamily: font, cursor: "pointer",
                                    }}>＋ この日に記録を追加</button>
                                ) : (
                                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, overflow: "visible" }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 10 }}>この日の記録を追加</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>店舗</div>
                                                <div style={{ position: "relative" }}>
                                                    {textInput(addStore, setAddStore, "店舗名")}
                                                    {storeList.length > 0 && (
                                                        <button className="b" onClick={() => setShowAddStoreDD(!showAddStoreDD)} style={{
                                                            position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                                                            background: "transparent", border: "none", color: C.sub, fontSize: 14, padding: "4px 6px", cursor: "pointer"
                                                        }}>▼</button>
                                                    )}
                                                    {showAddStoreDD && storeList.length > 0 && (
                                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 8, zIndex: 10, maxHeight: 150, overflowY: "auto", marginTop: 2, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
                                                            {storeList.map((st, i) => {
                                                                const stName = typeof st === "object" ? st.name : st;
                                                                return (
                                                                    <button key={st.id || i} className="b" onClick={() => { setAddStore(stName); setShowAddStoreDD(false); }} style={{
                                                                        width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                                        color: C.text, fontSize: 13, padding: "10px 12px", textAlign: "left", fontFamily: font, cursor: "pointer"
                                                                    }}>{stName}</button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>台番号</div>
                                                {textInput(addMachineNum, setAddMachineNum, "台番号", { type: "tel", inputMode: "numeric", pattern: "[0-9]*" })}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>機種名（任意）</div>
                                            {textInput(addMachineName, setAddMachineName, "機種名")}
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>投資額</div>
                                                <NI v={addInvest} set={setAddInvest} w="100%" center ph="10000" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>回収額</div>
                                                <NI v={addRecovery} set={setAddRecovery} w="100%" center ph="0" />
                                            </div>
                                        </div>
                                        {(() => {
                                            const canSave = (Math.round(Number(addInvest) || 0) > 0) || (Math.round(Number(addRecovery) || 0) > 0);
                                            return (
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                    <button className="b" onClick={() => { setAddFormOpen(false); setShowAddStoreDD(false); }} style={{
                                                        minHeight: 44, borderRadius: 10, background: "transparent",
                                                        border: `1px solid ${C.border}`, color: C.sub,
                                                        fontSize: 13, fontWeight: 700, fontFamily: font, cursor: "pointer",
                                                    }}>キャンセル</button>
                                                    <button className="b" onClick={saveManualArchive} disabled={!canSave} style={{
                                                        minHeight: 44, borderRadius: 10,
                                                        background: canSave ? C.blue : C.surfaceHi, border: "none",
                                                        color: canSave ? "#fff" : C.sub, opacity: canSave ? 1 : 0.6,
                                                        fontSize: 13, fontWeight: 700, fontFamily: font, cursor: canSave ? "pointer" : "default",
                                                    }}>保存</button>
                                                </div>
                                            );
                                        })()}
                                        <div style={{ fontSize: 9, color: C.sub, marginTop: 8, lineHeight: 1.5 }}>
                                            投資額か回収額のどちらかを入力すると保存できます
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

        </div>
    );
}
