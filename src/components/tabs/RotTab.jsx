import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, sp, tsNow, font, mono, localDateStr } from "../../constants";
import { NI, Card, Btn, SecLabel } from "../Atoms";
import { searchMachines, deriveSpecForMachine, findEffectiveMachineByName } from "../../machineDB";
import { MACHINE_SORT_OPTIONS, sortMachines } from "../../machineSort";
import { calcPreciseEV } from "../../logic";
import { applyEconomicEV } from "../../economics";
import { calculateLiveActualBalance, deadlineFromTime, estimateHourlyWorkFromStart1K, projectWorkToDeadline, timeValueFromDate, validateSessionSchedule } from "../../sessionProjection";
import { reconcileSegmentConsumption, clearPushCorrections, estimateSegmentGross, hasPushCorrections } from "../../ballConsumption";
import { PACHINKO_RATE_PRESETS, ballsForInvestment, formatBallQuantity, formatPachinkoRateLabel, getPushCorrectionAmounts, rentalYenPerBall } from "../../rateSettings";
import { evDecision } from "../decision/evDecision";
import { confidenceAccuracyLabel } from "../decision/confidenceLabels";
import { DECISION_TERMS } from "../decision/decisionVocabulary";
import { LiveDecisionNavigator } from "../decision/LiveDecisionNavigator";
import { DecisionSummaryCard } from "../decision/DecisionSummaryCard";
import { getEvAmount, getYutimeEvAmount } from "../analysis/analysisSelectors";
import { KeyMetrics } from "../decision/KeyMetrics";
import { RecentEventList } from "../decision/RecentEventList";
import { buildMultiRoundHit, getMachineRoundLoop, getMachineRoundOptions } from "../record/machineRoundOptions";
import RoundMultiplierControl from "../record/RoundMultiplierControl";
import { calculateYutimeEV, createYutimeSessionFromMachine, deriveCurrentLowProbabilitySpins, deriveNormalExpectedNetBalls, isYutimeTargetingSession } from "../yutime/yutimeCalculator";
import { addYutimeSupportCash, completeYutimeRun, createYutimeRun, getYutimeEventMode, shouldAutoShowYutimeCard } from "../yutime/yutimeFlow";
import YutimeCalculatorSheet from "../yutime/YutimeCalculatorSheet";
import { LineChart, InfoIcon, PencilIcon, LightbulbIcon, CoinIcon, SwapIcon, StoreIcon, HashIcon, MachinePlaceholder, SectionHeader, SettingPill, UndoControls, effectiveEv, YutimeEvCard, dataCardStyle, sessionScheduleErrorMessage, cardHeaderStyle, cardNumDot, cardTitleStyle, subCardStyle, subCardLabel } from "./TabsShared";
import MachinePickerSheet from "./MachinePickerSheet";
import SessionScheduleEditor from "./SessionScheduleEditor";
import CashLimitGuide, { useLiveCashLimitGuide } from "./CashLimitGuide";
import { createOneTimeStartGuard, createSameDayResumeStart, matchSameDayResumeCandidate } from "../../sameDayResume";
import { normalizeChodamaBalls, resolveRecordStartChodama, resolveRecordStartSpecSapo, setupInitialChodamaFromDraft } from "../../recordStartFlow";
import { getHitWizardPresentation } from "./hitWizardPresentation";
import SameDayResumePrompt, { CashCorrectionPrompt } from "./SameDayResumePrompt";
import RotationModeEditor from "./RotationModeEditor";
import { correctRotationMode, createRotationModeFingerprint, isEditableRotationModeRow, resolveNextPlayMode } from "../../rotationModeCorrection";
import { createMoveTableActionGuard } from "./moveTableActionGuard";
import { createMoveTableDestination } from "./moveTableDestination";


export function RotTab({ rows, setRows, S, ev, border }) {
    const [input, setInput] = useState("");
    const [inputError, setInputError] = useState("");
    const [showInputSheet, setShowInputSheet] = useState(false);
    const [rotationCorrection, setRotationCorrection] = useState(null);
    const [rotationCorrectionError, setRotationCorrectionError] = useState("");
    // 旧UIの "jackpot" mode は撤去済み。bottom sheet は常に通常回転入力（count モード）として使用
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [moveMochiBalls, setMoveMochiBalls] = useState("");
    const [moveEntryProcessing, setMoveEntryProcessing] = useState(false);
    const [moveSubmitState, setMoveSubmitState] = useState("idle");
    const [moveSubmitError, setMoveSubmitError] = useState("");
    const moveEntryGuardRef = useRef(createMoveTableActionGuard());
    const moveSubmitGuardRef = useRef(createMoveTableActionGuard());
    // 台移動モーダル：移動先の機種情報の入力state（機種名は稼働開始と同じ機種選択画面で選ぶ）
    const [moveMachineName, setMoveMachineName] = useState("");
    const [moveMachineNum, setMoveMachineNum] = useState("");
    // 移動先の開始回転数（新台の台データ表示値。稼働開始時の「開始回転数」と同じ意味）
    const [moveStartRot, setMoveStartRot] = useState("");
    const [moveYutimeTarget, setMoveYutimeTarget] = useState(null);
    const [showMoveYutimeCalculator, setShowMoveYutimeCalculator] = useState(false);
    const movePickedMachineRef = useRef(null);
    const clearMoveYutimeTarget = () => {
        setMoveYutimeTarget(null);
        const picked = movePickedMachineRef.current;
        if (picked?.yutimeSession?.targetingEnabled) {
            movePickedMachineRef.current = {
                ...picked,
                yutimeSession: { ...picked.yutimeSession, targetingEnabled: false },
            };
        }
    };
    const openMoveFlow = async () => {
        if (!moveEntryGuardRef.current.claim()) return;
        setMoveEntryProcessing(true);
        try {
            if ((S.jpLog || []).some((chain) => chain && chain.completed === false)) {
                const confirmed = await S.requestConfirmation?.({
                    title: "入力途中の大当たり記録があります",
                    message: "未完了の内容は出玉統計へ反映されない可能性があります。このまま台移動へ進みますか？",
                    confirmLabel: "台移動へ進む",
                });
                if (!confirmed) return;
            }
            setShowEventMenu(false);
            setMoveMochiBalls(String(S.currentMochiBalls || 0));
            setMoveMachineName("");
            setMoveMachineNum("");
            setMoveStartRot("");
            setMoveYutimeTarget(null);
            setShowMoveYutimeCalculator(false);
            movePickedMachineRef.current = null;
            moveSubmitGuardRef.current = createMoveTableActionGuard();
            setMoveSubmitState("idle");
            setMoveSubmitError("");
            setShowMoveModal(true);
        } finally {
            setMoveEntryProcessing(false);
            moveEntryGuardRef.current.release();
        }
    };
    const closeMoveModal = () => {
        setShowMoveModal(false);
        setMoveYutimeTarget(null);
    };
    const handleMoveConfirm = async () => {
        if (!moveSubmitGuardRef.current.claim()) return;
        setMoveSubmitState("processing");
        setMoveSubmitError("");
        let moveTableDestination;
        try {
            moveTableDestination = createMoveTableDestination({
                moveMochiBalls, moveMachineName, moveMachineNum, moveStartRot, moveYutimeTarget,
                picked: movePickedMachineRef.current, S,
                calculateYutimeEV, deriveNormalExpectedNetBalls, isYutimeTargetingSession,
            });
        } catch {
            moveSubmitGuardRef.current.release();
            setMoveSubmitState("idle");
            setMoveSubmitError("移動内容を作成できませんでした。入力を確認して、もう一度お試しください。");
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        try {
            S.handleMoveTable(moveTableDestination.mochi, moveTableDestination.dest);
        } catch {
            setMoveSubmitState("needsAttention");
            setMoveSubmitError("台移動の保存で問題が発生しました。内容を確認してから、閉じるボタンで終了してください。");
            return;
        }
        closeMoveModal();
    };
    useEffect(() => {
        if (S.sessionFlowRequest?.type !== "move") return;
        S.clearSessionFlowRequest?.();
        openMoveFlow();
        // requestIdが変わった時だけ外部要求を消費する。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [S.sessionFlowRequest?.requestId]);
    // 記録モード イベントメニュー（FAB から開く）
    const [showEventMenu, setShowEventMenu] = useState(false);
    // テンキーの直近入力履歴（表示専用・店内での再入力ヒント）
    const [inputHistory, setInputHistory] = useState([]);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [sameDayResumeMode] = useState("cash");
    const startSessionLockRef = useRef(createOneTimeStartGuard());
    useEffect(() => { if (showSetupModal) startSessionLockRef.current = createOneTimeStartGuard(); }, [showSetupModal]);
    const [showStoreDD, setShowStoreDD] = useState(false);
    const [machineQuery, setMachineQuery] = useState("");
    const [showMachinePicker, setShowMachinePicker] = useState(false);
    const [pickerFilter, setPickerFilter] = useState("all");
    const [pickerSort, setPickerSort] = useState("default");
    // 機種選択ボトムシートの適用先（"setup"=稼働開始モーダル / "move"=台移動モーダル）
    const [machinePickerFor, setMachinePickerFor] = useState("setup");
    const [summaryCollapsed, setSummaryCollapsed] = useState(true);
    const [showInvestSettings, setShowInvestSettings] = useState(false);
    const [showYutimeCalculator, setShowYutimeCalculator] = useState(false);
    const [customInvestPace, setCustomInvestPace] = useState("");
    const [customInvestPaceError, setCustomInvestPaceError] = useState("");
    const tableRef = useRef(null);
    const evEff = effectiveEv(ev);
    const [projectionNow, setProjectionNow] = useState(() => Date.now());
    const [showScheduleEditor, setShowScheduleEditor] = useState(false);
    const [scheduleTargetTime, setScheduleTargetTime] = useState("");
    const [scheduleClosingTime, setScheduleClosingTime] = useState("");
    const [scheduleEditorError, setScheduleEditorError] = useState("");
    const { guide: liveCashLimitGuide, preAlert: liveCashPreAlert } = useLiveCashLimitGuide(S, ev);

    useEffect(() => {
        const timer = setInterval(() => setProjectionNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    // 遊タイム用の低確率回転数。開始時カウントに、着席後の通常回転を足す。
    const currentHamari = useMemo(
        () => deriveCurrentLowProbabilitySpins(S.rotRows || []),
        [S.rotRows],
    );

    // 各data行までの実測値で、ボーダー差・信頼度の推移を再計算する。
    const trendSeries = useMemo(() => {
        const rowsAll = S.rotRows || [];
        const jpAll = S.jpLog || [];
        const points = [];
        for (let i = 0; i < rowsAll.length; i++) {
            if (rowsAll[i].type !== "data") continue;
            const cum = rowsAll[i].cumRot || 0;
            const prefixRows = rowsAll.slice(0, i + 1);
            // その時点までに発生した大当たりチェーンのみ（hitRot = 発生時の cumRot）
            const prefixJp = jpAll.filter((c) => c?.origin !== "yutime" && (Number(c?.hitRot) || 0) <= cum);
            const prefixTrayBalls = prefixJp.reduce((sum, chain) => sum + (Number(chain?.trayBalls) || 0), 0);
            const baseEvI = calcPreciseEV({
                rotRows: prefixRows,
                startRot: S.startRot,
                jpLog: prefixJp,
                rentBalls: S.rentBalls,
                exRate: S.exRate,
                synthDenom: S.synthDenom,
                rotPerHour: S.rotPerHour,
                totalTrayBalls: prefixTrayBalls,
                border,
                spec1R: S.spec1R,
                specAvgRounds: S.specAvgRounds,
                specSapo: S.specSapo,
                chodamaSettings: { includeChodamaInBalance: S.includeChodamaInBalance },
            });
            const evI = applyEconomicEV(baseEvI, {
                rotRows: prefixRows,
                jpLog: prefixJp,
                totalTrayBalls: prefixTrayBalls,
                rentBalls: S.rentBalls,
                exRate: S.exRate,
                rotPerHour: S.rotPerHour,
            });
            const bd = evI.bDiff;
            const conf = evDecision(evI).confidence;
            points.push({
                x: cum,
                bDiff: Number.isFinite(bd) ? bd : 0,
                confidence: Number.isFinite(conf) ? conf : 0,
            });
        }
        return points;
    }, [S.rotRows, S.jpLog, S.startRot, S.rentBalls, S.exRate, S.synthDenom, S.rotPerHour, border, S.spec1R, S.specAvgRounds, S.specSapo, S.includeChodamaInBalance]);

    // 機種設定 編集モーダル用state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editStore, setEditStore] = useState("");
    const [editMachineNum, setEditMachineNum] = useState("");
    const [editMachineName, setEditMachineName] = useState("");
    const [editSynthDenom, setEditSynthDenom] = useState("");
    const [editSpec1R, setEditSpec1R] = useState("");
    const [editRentBalls, setEditRentBalls] = useState("");
    const [editExRate, setEditExRate] = useState("");
    const [editStoreDD, setEditStoreDD] = useState(false);
    const [editMachineDD, setEditMachineDD] = useState(false);
    const [editMachineQuery, setEditMachineQuery] = useState("");
    const [editError, setEditError] = useState("");
    const editPickedMachineRef = useRef(null);

    // 初当たり入力（画面 A）state
    // 仕様書 docs/input-flow-design.md §3.1 画面 A に準拠、`rotCount` を 5 項目目として追加
    const [hitWizardOpen, setHitWizardOpen] = useState(false);
    const [hitWizardData, setHitWizardData] = useState({
        pushAmount: 0,
        rotCount: "", // 画面 A 1.回転数（ゲーム数）
        trayBalls: "", rounds: 0, mult: 1, displayBalls: "", actualBalls: "",
        hitType: "", // "単発" or "確変"
        jitanSpins: "", // 時短回数
        finalBallsAfterJitan: "" // 時短終了後最終出玉
    });
    // 画面 A 補助 state
    const [hitInputFocus, setHitInputFocus] = useState("pushAmount"); // 現在入力中のステップ
    const [hitInputError, setHitInputError] = useState("");
    const [hitInputSingleEndOpen, setHitInputSingleEndOpen] = useState(false); // 単発時の時短/最終持ち玉モーダル

    // 入力確定でフォーカスが移ったら、対応する行を可視領域へスクロール
    useEffect(() => {
        if (!hitInputFocus || !hitWizardOpen) return;
        const el = document.querySelector(`[data-row-id="${hitInputFocus}"]`);
        if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [hitInputFocus, hitWizardOpen]);
    const selectedMachine = searchMachines(S.machineName, S.customMachines)[0];
    // 詳細振分も読むため、10R×2・10R×4のような複数セットを選択できる。
    const machineRounds = getMachineRoundOptions(selectedMachine, "heso");
    const machineRushRounds = getMachineRoundOptions(selectedMachine, "rush");

    // 長押し削除用state
    const longPressTimerRef = useRef(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    // 大当たり履歴タブ: 詳細履歴の展開トグル（既定は折り畳み＝モックの簡易表示）
    const [showAllHistory, setShowAllHistory] = useState(false);

    // 連打ロック（同フレームの二度押し抑止）
    const endLockRef = useRef(false);
    const submitLockRef = useRef(false);

    // 大当たり履歴 編集モーダル用state（古いデータの修正用）
    const [editChainOpen, setEditChainOpen] = useState(false);
    const [editChainId, setEditChainId] = useState(null);
    const [editChainHits, setEditChainHits] = useState([]);
    // チェーン単位の終了データ（時短回数・最終出玉）編集用
    const [editChainMeta, setEditChainMeta] = useState({ jitanSpins: "", finalBallsAfterJitan: "", segStartBalls: "", trayRemaining: "", segMode: "cash", hasPush: false, clearPush: false });

    // 連チャン追加（画面 B / 画面 C）state
    // 仕様書 §3.1 画面 B・C に準拠。`chainWizardStep` は新UIでは `8`（画面 C = 最終実測持ち玉入力）のみ意味を持つ。
    // 0〜7 は旧UI互換のため残置（後続クリーンアップで削除予定）。
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true);
    const [chainWizardData, setChainWizardData] = useState({
        rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "",
        hitType: "", jitanSpins: "", finalBallsAfterJitan: "", finalRealBalls: ""
    });
    const [chainWizardInitialFinalBalls, setChainWizardInitialFinalBalls] = useState(0);
    // 画面 B 補助 state（テンキーで編集中の行）
    const [chainInputFocus, setChainInputFocus] = useState("elecSapoRot");
    const [chainInputError, setChainInputError] = useState("");
    // 画面 B から単発終了サブモーダル
    const [chainInputSingleEndOpen, setChainInputSingleEndOpen] = useState(false);

    // 直接終了モーダル state（単発終了 / RUSH終了 共用。mode で分岐）
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0);
    const [directSingleEndData, setDirectSingleEndData] = useState({ jitanSpins: "", finalBallsAfterJitan: "" });
    const [directSingleEndMode, setDirectSingleEndMode] = useState("single"); // "single" | "rush"

    // データサブタブ - グラフモーダル state
    const [showGraphModal, setShowGraphModal] = useState(false);

    // 最新の未完了チェーン
    const jpLog = S.jpLog || [];
    const sesLog = S.sesLog || [];
    const lastChain = jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    const isChainActive = lastChain && !lastChain.completed;

    // 前回のラウンド終了時の総持ち玉を取得
    // 直前 hit に nextTimingBalls が記録されていればそれを採用、
    // 未記録 (0) の場合は 上皿玉 + 累積 (出玉 + サポ増減) で算出
    const getPrevEndBalls = () => {
        if (!lastChain) return 0;
        const lastHit = lastChain.hits[lastChain.hits.length - 1];
        if (lastHit && lastHit.nextTimingBalls > 0) return lastHit.nextTimingBalls;
        const tray = Number(lastChain.trayBalls) || 0;
        const accum = (lastChain.hits || []).reduce(
            (s, h) => s + (Number(h.displayBalls) || 0) + (Number(h.sapoChange) || 0),
            0
        );
        return tray + accum;
    };

    const clearChainWizard = () => {
        setChainWizardData({ rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "", finalRealBalls: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardInitialFinalBalls(0);
    };

    // 連チャン追加ウィザードを開始（画面 B）
    const openChainWizard = () => {
        const prevEndBalls = getPrevEndBalls();
        setChainWizardData({
            rounds: 0, mult: 1, displayBalls: "", lastOutBalls: String(prevEndBalls),
            nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "", finalRealBalls: ""
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainInputFocus("elecSapoRot");
        setChainInputError("");
        setChainInputSingleEndOpen(false);
        setChainWizardOpen(true);
    };

    // mult (×N) 対応: 1エントリーを 1 hit として保存（液晶演出上1連 = データ上も1 hit）
    // rounds / displayBalls は全連合算、mult / rawRounds は表示用
    const buildSingleHit = (hitNumber, { rnd, mult, disp, lastOut, nextTiming, elecRot }) => buildMultiRoundHit(hitNumber, {
        rounds: rnd,
        mult,
        displayBalls: disp,
        lastOutBalls: lastOut,
        nextTimingBalls: nextTiming,
        elecSapoRot: elecRot,
        time: tsNow(),
    });

    // 連チャン追加ウィザード完了（継続 or 最終）
    const handleChainWizardComplete = (isFinal = false, finalRealOpts = null) => {
        if (isFinal && endLockRef.current) return;
        const { rounds, mult, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) { setChainWizardOpen(false); return; }
        S.pushSnapshot();

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        const multN = Math.max(1, Number(mult) || 1);

        if (isFinal) {
            endLockRef.current = true;
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                const newHit = buildSingleHit(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
                chain.hits = [...chain.hits, newHit];
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
                chain.completed = true;
                chain.summary = {
                    totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: totalSapoChange,
                    sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                    netGain: totalDisplayBalls + totalSapoChange,
                };
                chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
                if (finalRealOpts) {
                    chain.finalRealBalls = finalRealOpts.value;
                    chain.finalRealBallsEdited = finalRealOpts.edited;
                }
                updated[updated.length - 1] = chain;
                return updated;
            });
            const lastChainCopy = jpLog[jpLog.length - 1];
            const existingTotal = (lastChainCopy.trayBalls || 0) +
                lastChainCopy.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
            const finalBallsToAdd = existingTotal + disp * multN + (nextTiming - lastOut - disp * multN);
            S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
            S.pushLog({ type: "連チャン終了", time: tsNow() });
            S.setPlayMode("mochi");
            S.setSessionSubTab("rot");
            S.setShowStartPrompt(true);
            setTimeout(() => { endLockRef.current = false; }, 0);
        } else {
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                const newHit = buildSingleHit(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
                chain.hits = [...chain.hits, newHit];
                updated[updated.length - 1] = chain;
                return updated;
            });
            S.pushLog({ type: "連チャン追加", time: tsNow(), rounds: rnd });
        }
        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 単発終了ウィザード完了
    const handleChainWizardSingleEnd = () => {
        if (endLockRef.current) return;
        const { rounds, mult, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot, jitanSpins, finalBallsAfterJitan } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) {
            setChainWizardOpen(false);
            return;
        }
        S.pushSnapshot();
        endLockRef.current = true;

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        const multN = Math.max(1, Number(mult) || 1);
        const sapoChange = nextTiming - lastOut - disp * multN;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            const newHit = buildSingleHit(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
            chain.hits = [...chain.hits, newHit];
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const currentChain = jpLog[jpLog.length - 1];
        const existingTotal = (currentChain?.trayBalls || 0) +
            (currentChain?.hits || []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal + disp * multN + sapoChange;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow(), rounds: rnd });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
        setChainWizardOpen(false);
        clearChainWizard();
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // 直接終了モーダルを開く（mode="single": 単発終了 / mode="rush": RUSH終了）
    const openDirectSingleEnd = (mode = "single") => {
        if (!isChainActive || lastChain.hits.length === 0) return;
        setDirectSingleEndMode(mode);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setDirectSingleEndStep(0);
        setDirectSingleEndOpen(true);
    };

    // 直接単発終了完了
    const handleDirectSingleEndComplete = () => {
        if (endLockRef.current) return;
        if (!isChainActive) return;
        S.pushSnapshot();
        endLockRef.current = true;
        const jitan = Number(directSingleEndData.jitanSpins) || 0;
        const finalBalls = Number(directSingleEndData.finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
        setDirectSingleEndOpen(false);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    const handleRushEndComplete = () => {
        if (endLockRef.current) return;
        if (!isChainActive) return;
        const currentHitsCount = lastChain.hits.length;
        if (currentHitsCount === 0) return; // ヒットがない場合は終了できない
        S.pushSnapshot();
        endLockRef.current = true;
        const jitan = Number(directSingleEndData.jitanSpins) || 0;
        const finalBalls = Number(directSingleEndData.finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || h.sapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.completed = true;
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            // 最終出玉を実測した場合は実測持ち玉として記録（logic.js が実測ベース純増に採用）
            if (finalBalls > 0) chain.finalRealBalls = finalBalls;
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });
        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "連チャン終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
        setDirectSingleEndOpen(false);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // 長押し削除ハンドラー
    const handleLongPressStart = (chainId) => {
        longPressTimerRef.current = setTimeout(() => {
            setDeleteTargetId(chainId);
            setDeleteConfirmOpen(true);
        }, 500);
    };

    const handleLongPressEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handleDeleteConfirm = () => {
        if (deleteTargetId) {
            S.pushSnapshot();
            // updater 外で対象 chain を取得（StrictMode の updater 二度実行による副作用重複を防ぐ）
            const chainToDelete = (S.jpLog || []).find(c => c.chainId === deleteTargetId);

            // 持ち玉差し戻しは completed 限定（finalBalls は完了時にしか確定しない）
            if (chainToDelete && chainToDelete.completed) {
                const ballsToRemove = chainToDelete.finalBalls || 0;
                S.setCurrentMochiBalls((p) => Math.max(0, p - ballsToRemove));
            }
            // 上皿補正は completed 無関係に常時逆算（未完了でも 1 連目入力時に加算済みのため）
            if (chainToDelete && (chainToDelete.trayBalls || 0) > 0) {
                const trayToRemove = chainToDelete.trayBalls || 0;
                S.setTotalTrayBalls((p) => Math.max(0, p - trayToRemove));
            }

            S.setJpLog((prev) => prev.filter(c => c.chainId !== deleteTargetId));
            // 回転入力ページ側の hit 行も同期削除（双方向カスケード）
            S.setRotRows((prev) => prev.filter(r => !(r.type === "hit" && r.chainId === deleteTargetId)));
        }
        setDeleteConfirmOpen(false);
        setDeleteTargetId(null);
    };

    // 編集モーダルを開く（指定chainIdのhitsをコピーして編集state化）
    const handleEditChainOpen = (chainId) => {
        const target = (S.jpLog || []).find(c => c.chainId === chainId);
        if (!target || !target.hits) return;
        // 各 hit を編集可能な形式に変換（数値は string に）
        const editable = target.hits.map(h => ({
            hitNumber: h.hitNumber,
            time: h.time,
            rounds: String(h.rounds ?? 0),
            displayBalls: String(h.displayBalls ?? 0),
            elecSapoRot: String(h.elecSapoRot ?? h.sapoRot ?? 0),
            lastOutBalls: String(h.lastOutBalls ?? 0),
            nextTimingBalls: String(h.nextTimingBalls ?? 0),
            mult: h.mult ?? 1,
            rawRounds: h.rawRounds ?? h.rounds ?? 0,
        }));
        // チェーン単位の終了データ（時短回数・最終出玉）を編集stateへ
        // 最終出玉は finalBallsAfterJitan → finalRealBalls → finalBalls の優先で復元
        const finalRestore = target.finalBallsAfterJitan ?? target.finalRealBalls ?? target.finalBalls ?? 0;
        // 通常時の玉消費（回転率）修正用の既定値を算出する。
        // この当たり区間のモードは rotRows の hit 行から判定する。
        const rotRows = S.rotRows || [];
        const hitRow = rotRows.find(r => r.type === "hit" && r.chainId === chainId);
        const segMode = (hitRow && (hitRow.mode === "chodama" || hitRow.mode === "mochi")) ? hitRow.mode : "cash";
        const rb = S.rentBalls || 250;
        const gross = segMode !== "cash" ? estimateSegmentGross(rotRows, { playMode: segMode, chainId, rentBalls: rb }) : 0;
        const hasPush = hasPushCorrections(rotRows, { chainId });
        setEditChainMeta({
            jitanSpins: String(target.jitanSpins ?? 0),
            finalBallsAfterJitan: String(finalRestore),
            segMode,
            segStartBalls: segMode !== "cash" && gross > 0 ? String(Math.round(gross)) : "",
            trayRemaining: String(Math.round(Number(target.trayBalls) || 0)),
            hasPush,
            clearPush: false,
        });
        setEditChainId(chainId);
        setEditChainHits(editable);
        setEditChainOpen(true);
    };

    const handleEditChainSave = () => {
        if (!editChainId) { setEditChainOpen(false); return; }
        let oldFinalBalls = 0;
        let newFinalBalls = 0;
        let oldTray = 0;
        // 通常時の玉消費（回転率）修正の入力値（貯玉/持ち玉区間のみ）
        const segMode = editChainMeta.segMode;
        const isBallSeg = segMode === "chodama" || segMode === "mochi";
        const newTray = isBallSeg && editChainMeta.trayRemaining !== ""
            ? Math.max(0, Number(editChainMeta.trayRemaining) || 0) : null;
        const newSegStart = isBallSeg && editChainMeta.segStartBalls !== ""
            ? Math.max(0, Number(editChainMeta.segStartBalls) || 0) : null;
        S.setJpLog((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex(c => c.chainId === editChainId);
            if (idx < 0) return prev;
            const chain = { ...updated[idx] };
            oldFinalBalls = chain.finalBalls || 0;
            oldTray = Number(chain.trayBalls) || 0;
            // 上皿残玉（開始上皿玉数）を更新（補正後＝実消費の差し引きに使われる）
            if (newTray != null) chain.trayBalls = newTray;
            // 各 hit を再計算（サポ増減 = 次タイミング玉 - 前回終了玉 - 液晶出玉）
            // displayBalls は既に全連合算済み（buildSingleHit 由来）なので mult を再乗算しない
            const newHits = editChainHits.map(e => {
                const rounds = Math.max(0, Number(e.rounds) || 0);
                const displayBalls = Math.max(0, Number(e.displayBalls) || 0);
                const elecSapoRot = Math.max(0, Number(e.elecSapoRot) || 0);
                const lastOutBalls = Number(e.lastOutBalls) || 0;
                const nextTimingBalls = Number(e.nextTimingBalls) || 0;
                const sapoChange = nextTimingBalls - lastOutBalls - displayBalls;
                const sapoPerRot = elecSapoRot > 0 ? sapoChange / elecSapoRot : 0;
                const mult = Math.max(1, Number(e.mult) || 1);
                const rawRounds = Math.max(0, Number(e.rawRounds) || 0) || rounds;
                return {
                    hitNumber: e.hitNumber,
                    time: e.time,
                    rounds, displayBalls, elecSapoRot,
                    lastOutBalls, nextTimingBalls,
                    sapoChange, sapoPerRot,
                    mult, rawRounds,
                };
            });
            chain.hits = newHits;
            const totalRounds = newHits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = newHits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = newHits.reduce((s, h) => s + h.elecSapoRot, 0);
            const totalSapoChange = newHits.reduce((s, h) => s + h.sapoChange, 0);
            // チェーン単位の終了データ（時短回数・最終出玉）
            const jitan = Math.max(0, Number(editChainMeta.jitanSpins) || 0);
            const finalAfter = Math.max(0, Number(editChainMeta.finalBallsAfterJitan) || 0);
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalAfter;
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalAfter > 0 ? finalAfter : totalDisplayBalls + totalSapoChange,
            };
            // 最終出玉を入力した場合は実測持ち玉として採用（集計・持ち玉ともに実測ベース）
            if (finalAfter > 0) {
                chain.finalRealBalls = finalAfter;
                chain.finalBalls = finalAfter;
            } else {
                chain.finalRealBalls = undefined; // 未入力なら液晶ベースに戻す
                chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            }
            newFinalBalls = chain.finalBalls;
            updated[idx] = chain;
            return updated;
        });
        // 完了済みチェーンの場合、持ち玉の差分を調整
        const target = (S.jpLog || []).find(c => c.chainId === editChainId);
        if (target && target.completed) {
            const diff = newFinalBalls - oldFinalBalls;
            if (diff !== 0) {
                S.setCurrentMochiBalls((p) => Math.max(0, p + diff));
            }
        }

        // 通常時の玉消費（回転率）の修正: 上皿総玉の同期 + rotRows のグロス書き戻し + プッシュ補正除去
        if (isBallSeg) {
            if (newTray != null && newTray !== oldTray) {
                S.setTotalTrayBalls((p) => Math.max(0, p + (newTray - oldTray)));
            }
            S.setRotRows((prev) => {
                let next = prev;
                if (newSegStart != null) {
                    next = reconcileSegmentConsumption(next, {
                        playMode: segMode,
                        segmentStartBalls: newSegStart,
                        chainId: editChainId,
                    });
                }
                if (editChainMeta.clearPush) {
                    next = clearPushCorrections(next, { chainId: editChainId });
                }
                return next;
            });
        }

        setEditChainOpen(false);
        setEditChainId(null);
        setEditChainHits([]);
        setEditChainMeta({ jitanSpins: "", finalBallsAfterJitan: "", segStartBalls: "", trayRemaining: "", segMode: "cash", hasPush: false, clearPush: false });
    };
    // ========== 大当たり履歴タブ用state ここまで ==========

    // セットアップ用の一時state
    const [setupStore, setSetupStore] = useState("");
    const [setupMachineNum, setSetupMachineNum] = useState("");
    const [setupMachineName, setSetupMachineName] = useState("");
    const [setupStartRot, setSetupStartRot] = useState("");
    const [setupInitialBalls, setSetupInitialBalls] = useState(null);
    // 未登録機種用の任意スペック入力（合成確率 / ボーダー1k・4円等価）。
    // 入力時のみ deriveSpecForMachine で spec を逆算して適用する（未入力なら既定スペックのまま記録可能）。
    const [setupSynthDenom, setSetupSynthDenom] = useState("");
    const [setupBorder1k, setSetupBorder1k] = useState("");
    const [setupYutimeLowSpins, setSetupYutimeLowSpins] = useState("");
    const [setupYutimeStart1K, setSetupYutimeStart1K] = useState("");
    const [setupEndTime, setSetupEndTime] = useState("");
    const [setupClosingTime, setSetupClosingTime] = useState("");
    const [setupPlannedStart1K, setSetupPlannedStart1K] = useState("");
    const [setupError, setSetupError] = useState("");
    const [showSetupSpec, setShowSetupSpec] = useState(false);
    const [setupHandoffSource, setSetupHandoffSource] = useState("");
    const setupHandoffRestoreRef = useRef(null);

    // 台選びから来た場合だけ、選択済みの店舗・機種・台番号を確認画面へ自動反映する。
    // 稼働開始前の一時値なので、キャンセルや別の台を選んでも既存記録は上書きしない。
    useEffect(() => {
        const draft = S.recordStartDraft;
        if (!draft?.id || S.sessionStarted) return;
        const defaultEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
        setProjectionNow(Date.now());
        setSetupStore(String(draft.storeName || ""));
        setSetupMachineNum(String(draft.machineNum || ""));
        setSetupMachineName(String(draft.machineName || ""));
        setSetupStartRot(String(draft.startRot || ""));
        setSetupInitialBalls(setupInitialChodamaFromDraft(draft));
        setSetupClosingTime(String(draft.closingTime || ""));
        setSetupPlannedStart1K(Number(draft.plannedStart1K) > 0 ? String(draft.plannedStart1K) : "");
        setSetupEndTime(timeValueFromDate(defaultEnd));
        setSetupError("");
        setSetupHandoffSource(draft.source || "selection");
        setupHandoffRestoreRef.current = {
            selectedStoreId: S.selectedStoreId,
            rentBalls: S.rentBalls,
            exRate: S.exRate,
            investPace: S.investPace,
            ballVal: S.ballVal,
            synthDenom: S.synthDenom,
            spec1R: S.spec1R,
            specAvgRounds: S.specAvgRounds,
            specSapo: S.specSapo,
            yutimeSession: S.yutimeSession,
            yutimeDecision: S.yutimeDecision,
        };
        if (draft.storeId != null) S.setSelectedStoreId(draft.storeId);
        if (Number(draft.rentBalls) > 0) S.setRentBalls(Number(draft.rentBalls));
        if (Number(draft.exRate) > 0) {
            S.setExRate(Number(draft.exRate));
            S.setBallVal(1000 / Number(draft.exRate));
        }

        if (Number(draft.investPace) > 0) S.setInvestPace(Number(draft.investPace));
        if (Number(draft.synthDenom) > 0) S.setSynthDenom(Number(draft.synthDenom));
        if (Number(draft.spec1R) > 0) S.setSpec1R(Number(draft.spec1R));
        if (Number(draft.specAvgRounds) > 0) S.setSpecAvgRounds(Number(draft.specAvgRounds));
        const draftMachine = findEffectiveMachineByName(draft.machineName, S.customMachines);
        const draftMachineSpec = draftMachine ? deriveSpecForMachine(draftMachine) : null;
        S.setSpecSapo(resolveRecordStartSpecSapo({ draft, machineSpecSapo: draftMachineSpec?.specSapo }));
        if (draft.yutimeSession) {
            S.setYutimeSession(draft.yutimeSession);
            S.setYutimeDecision(null);
            setSetupYutimeLowSpins(String(draft.yutimeLowSpins || ""));
            setSetupYutimeStart1K(Number(draft.yutimeStart1K) > 0 ? String(draft.yutimeStart1K) : "");
        }

        const machine = draftMachine;
        if (machine && !draft.yutimeSession) {
            const spec = deriveSpecForMachine(machine);
            const yutime = createYutimeSessionFromMachine(machine, {
                assumedStart1K: machine.border1K || S.border,
            });
            S.setSynthDenom(machine.synthProb);
            if (spec.spec1R != null) S.setSpec1R(spec.spec1R);
            if (spec.specAvgRounds != null) S.setSpecAvgRounds(spec.specAvgRounds);
            if (spec.specSapo != null) S.setSpecSapo(spec.specSapo);
            S.setYutimeSession(yutime);
            S.setYutimeDecision(null);
            setSetupYutimeStart1K(yutime?.assumedStart1K ? String(yutime.assumedStart1K) : "");
        }
        setShowSetupModal(true);
        S.setRecordStartDraft?.(null);
        // draft.id が変わった時だけ消費する。各 setter は S の最新値を使用する。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [S.recordStartDraft?.id]);

    const restoreHandoffGlobals = () => {
        const previous = setupHandoffRestoreRef.current;
        if (!previous) return;
        S.setSelectedStoreId(previous.selectedStoreId);
        S.setRentBalls(previous.rentBalls);
        S.setExRate(previous.exRate);
        S.setInvestPace(previous.investPace);
        S.setBallVal(previous.ballVal);
        S.setSynthDenom(previous.synthDenom);
        S.setSpec1R(previous.spec1R);
        S.setSpecAvgRounds(previous.specAvgRounds);
        S.setSpecSapo(previous.specSapo);
        S.setYutimeSession(previous.yutimeSession);
        S.setYutimeDecision(previous.yutimeDecision);
        setupHandoffRestoreRef.current = null;
    };
    const clearSetupDraftFields = () => {
        setSetupStore("");
        setSetupMachineNum("");
        setSetupMachineName("");
        setSetupStartRot("");
        setSetupInitialBalls(null);
        setSetupSynthDenom("");
        setSetupBorder1k("");
        setSetupYutimeLowSpins("");
        setSetupYutimeStart1K("");
        setSetupEndTime("");
        setSetupClosingTime("");
        setSetupPlannedStart1K("");
        setSetupError("");
        setShowSetupSpec(false);
        setSetupHandoffSource("");
    };
    const cancelSetupModal = () => {
        restoreHandoffGlobals();
        clearSetupDraftFields();
        setShowSetupModal(false);
    };

    const openSetupModal = () => {
        restoreHandoffGlobals();
        clearSetupDraftFields();
        const defaultEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
        setProjectionNow(Date.now());
        setSetupEndTime(timeValueFromDate(defaultEnd));
        setSetupError("");
        setShowSetupModal(true);
    };

    const setupPlayMode = Number(setupInitialBalls) > 0 ? "chodama" : "cash";
    const setupHourlyEstimate = estimateHourlyWorkFromStart1K({
        start1K: setupPlannedStart1K,
        synthDenom: Number(setupSynthDenom) || S.synthDenom,
        spec1R: S.spec1R,
        specAvgRounds: S.specAvgRounds,
        specSapo: S.specSapo,
        exRate: S.exRate,
        rentBalls: S.rentBalls,
        rotPerHour: S.rotPerHour,
        playMode: setupPlayMode,
    });
    const setupDeadline = deadlineFromTime(projectionNow, setupEndTime);
    const setupClosingDeadline = deadlineFromTime(projectionNow, setupClosingTime, { allowNextDay: true });
    const setupTargetAfterClosing = Boolean(setupDeadline && setupClosingDeadline && setupDeadline > setupClosingDeadline);
    const setupProjection = setupHourlyEstimate && setupDeadline
        ? projectWorkToDeadline({ currentWork: 0, hourlyWork: setupHourlyEstimate.hourlyWork, nowAt: projectionNow, deadlineAt: setupDeadline })
        : null;
    const setupCloseProjection = setupHourlyEstimate && setupClosingDeadline
        ? projectWorkToDeadline({ currentWork: 0, hourlyWork: setupHourlyEstimate.hourlyWork, nowAt: projectionNow, deadlineAt: setupClosingDeadline })
        : null;

    // 機種ピッカー: 検索 ∩ タイプフィルター
    const filteredMachines = useMemo(() => {
        const all = searchMachines(machineQuery, S.customMachines);
        const filtered = pickerFilter === "all" ? all : all.filter(m => m.type === pickerFilter);
        return sortMachines(filtered, pickerSort);
    }, [machineQuery, pickerFilter, pickerSort, S.customMachines]);

    // 機種設定 編集モーダル用の検索結果
    const editMachineResults = useMemo(() => {
        if (!editMachineQuery.trim()) return [];
        return searchMachines(editMachineQuery, S.customMachines).slice(0, 8);
    }, [editMachineQuery, S.customMachines]);

    // 現在の機種からタイプ(ミドル/甘デジ等)を解決
    const currentMachineType = useMemo(() => {
        if (!S.machineName) return "";
        const hit = findEffectiveMachineByName(S.machineName, S.customMachines);
        return hit?.type || "パチンコ";
    }, [S.machineName, S.customMachines]);

    // 店舗の貯玉残高を取得
    const currentStoreData = useMemo(() => {
        const stores = S.stores || [];
        return stores.find(st => typeof st === "object" && st.name === S.storeName);
    }, [S.stores, S.storeName]);

    // セッションが開始されているか
    const sessionActive = rows.some(r => r.type === "start");

    useEffect(() => {
        // 新しいデータが追加された時に自動スクロールで最新を表示
        if (tableRef.current && rows.length > 0) {
            // より確実にDOMの更新を待つ
            const scrollToBottom = () => {
                if (tableRef.current) {
                    const element = tableRef.current;
                    // scrollHeightがcontentの全高、scrollTopを最大にして最下部へ
                    element.scrollTop = element.scrollHeight;
                }
            };
            // 複数のタイミングでスクロールを試行（遅延を増やして確実に）
            requestAnimationFrame(() => {
                scrollToBottom();
                // 追加のタイミングで再度スクロール（遅延レンダリング対策）
                setTimeout(scrollToBottom, 50);
                setTimeout(scrollToBottom, 150);
                setTimeout(scrollToBottom, 300);
            });
        }
    }, [rows.length]);

    const dataRows = rows.filter((r) => r.type === "data");
    const last = dataRows[dataRows.length - 1];

    // バリデーション付き記録関数
    const validateInput = () => {
        const trimmed = input.trim();
        if (!trimmed) {
            setInputError("回転数を入力してください");
            return null;
        }
        const val = Number(trimmed);
        if (isNaN(val)) {
            setInputError("数値を入力してください");
            return null;
        }
        if (val <= 0) {
            setInputError("0より大きい値を入力してください");
            return null;
        }
        setInputError("");
        return val;
    };

    const investPace = S.investPace || 1000;
    const rentBalls = S.rentBalls || 250; // 貸玉数（デフォルト250玉/1K）
    const ballsPerRecord = ballsForInvestment(investPace, rentBalls);
    const rentalRateYen = rentalYenPerBall(rentBalls);

    const applyRatePreset = (preset) => {
        if (S.requestSessionContextChange?.(["貸玉", "交換率"])) return;
        S.setRentBalls(preset.rentBalls);
        S.setExRate(preset.rentBalls);
        S.setBallVal(1000 / preset.rentBalls);
        S.setInvestPace(preset.recommendedInvestPace);
    };

    const applyCustomInvestPace = () => {
        const pace = Number(customInvestPace);
        if (!Number.isInteger(pace) || pace <= 0) {
            setCustomInvestPaceError("1円以上の整数で入力してください");
            return;
        }
        if (S.requestSessionContextChange?.("投資記録単位")) return;
        S.setInvestPace(pace);
        setCustomInvestPaceError("");
        setShowInvestSettings(false);
    };

    const decide = async () => {
        if (submitLockRef.current) return;
        const val = validateInput();
        if (val === null) return;

        // 前回の累計回転数: 全ての行（data, start, hit）で最後の行を見る
        const lastRow = rows[rows.length - 1];
        const prevCumRot = lastRow ? lastRow.cumRot : S.startRot;

        // 逆行ガード: 前回累計以下の値は誤入力か台リセットの可能性が高い
        let resetInsert = false;
        if (val <= prevCumRot) {
            const ok = await S.requestConfirmation?.({
                title: "台の回転数が戻っています",
                message: `前回累計は${prevCumRot}回です。台がリセットされた場合だけ、新しい起点として記録してください。`,
                confirmLabel: "リセットとして記録",
            });
            if (!ok) {
                setInputError(`前回(${prevCumRot})以下の値です。リセット時はOKを押してください`);
                return;
            }
            resetInsert = true;
        }

        S.pushSnapshot();
        submitLockRef.current = true;

        // リセット時は thisRot=val（cumRot 起点 0 から val 回転）、通常時は val-prevCumRot
        const thisRot = resetInsert ? val : val - prevCumRot;
        const prevInvest = last ? last.invest : 0;

        // 1Kあたりに必要な玉数（持ち玉/貯玉モードでの消費量）
        const ballsNeeded = rentBalls * (investPace / 1000);

        // 貯玉/持ち玉モードの消費判定:
        // - 残玉が1Kぶん(ballsNeeded)に満たなくても、1玉以上あれば今回の入力で端数を使い切る
        //   （旧実装は即現金切替で端数が残高に取り残され、以降ずっと消化されないバグがあった）
        // - 残玉0なら現金投資へ自動切替する（「タダ回し」記録の防止）
        // 端数を使い切った入力の後は playMode を現金へ戻し、以降の入力は現金投資として扱う。
        let effMode = S.playMode;
        const startBalance = effMode === "chodama" ? (S.currentChodama || 0)
            : effMode === "mochi" ? (S.currentMochiBalls || 0)
            : 0;
        if ((effMode === "chodama" || effMode === "mochi") && startBalance <= 0) {
            effMode = resolveNextPlayMode({ playMode: effMode, currentMochiBalls: S.currentMochiBalls, currentChodama: S.currentChodama });
        }

        let newInvest = prevInvest;
        let ballsConsumed = 0;

        if (effMode === "cash") {
            // 現金モード：投資額を増加
            newInvest = prevInvest + investPace;
        } else if (effMode === "mochi") {
            // 持ち玉モード：投資は増えない、持ち玉を減らす（残玉が1K未満なら全量＝使い切り）
            ballsConsumed = Math.min(startBalance, ballsNeeded);
            S.setCurrentMochiBalls((prev) => Math.max(0, prev - ballsConsumed));
        } else if (effMode === "chodama") {
            // 貯玉モード：貯玉を消費（現金投資には反映しない。残玉が1K未満なら全量＝使い切り）
            ballsConsumed = Math.min(startBalance, ballsNeeded);
            S.setCurrentChodama((prev) => Math.max(0, prev - ballsConsumed));
        }

        // 自動切替（残玉0）が発生したら playMode を現金へ更新し、以降の入力・UI表示にも反映する。
        // 今回の入力で残玉を使い切った場合も、次の入力からは現金投資に戻す。
        if (effMode !== S.playMode) {
            S.setPlayMode(effMode);
        } else if (effMode !== "cash" && startBalance - ballsConsumed <= 0) {
            S.setPlayMode(resolveNextPlayMode({ playMode: effMode, currentMochiBalls: effMode === "mochi" ? 0 : S.currentMochiBalls, currentChodama: effMode === "chodama" ? 0 : S.currentChodama }));
        }

        // 平均回転数計算 - セッション全体の累積平均（データページの1Kスタートと整合）
        // deriveFromRows と同じ集計方式: 現金K=投資差分、持ち玉/貯玉K=消費玉数/貸玉
        const allDataRows = rows.filter(r => r.type === "data");
        let totalThisRot = thisRot; // 今回の回転数
        let cashK = 0, mochiK = 0, chodamaK = 0;
        let prevInv = 0;
        allDataRows.forEach(r => {
            totalThisRot += r.thisRot || 0;
            const invDiff = (r.invest || 0) - prevInv;
            prevInv = r.invest || 0;
            if (r.mode === "mochi") {
                const consumed = r.ballsConsumed !== undefined && r.ballsConsumed !== null
                    ? r.ballsConsumed
                    : rentBalls * ((S.investPace || 1000) / 1000);
                mochiK += consumed / rentBalls;
            } else if (r.mode === "chodama") {
                const consumed = r.ballsConsumed !== undefined && r.ballsConsumed !== null
                    ? r.ballsConsumed
                    : rentBalls * ((S.investPace || 1000) / 1000);
                chodamaK += consumed / rentBalls;
            } else {
                cashK += invDiff / 1000;
            }
        });
        // 今回の行を追加
        if (effMode === "mochi") {
            mochiK += ballsConsumed / rentBalls;
        } else if (effMode === "chodama") {
            chodamaK += ballsConsumed / rentBalls;
        } else {
            cashK += (newInvest - prevInv) / 1000;
        }
        const totalKUsed = cashK + mochiK + chodamaK;

        const newAvg = totalKUsed > 0
            ? parseFloat((totalThisRot / totalKUsed).toFixed(1))
            : (totalThisRot > 0 ? totalThisRot : 0); // 投資0でも回転数があれば回転数を表示

        // setRows updater 内で最新 r から prevCumRot/prevInvest を再計算する（連打耐性）
        setRows((r) => {
            const lastR = r[r.length - 1];
            const livePrevCumRot = lastR ? lastR.cumRot : S.startRot;
            const liveLast = [...r].reverse().find(x => x.type === "data");
            const livePrevInvest = liveLast ? liveLast.invest : 0;

            // リセット時のみ追加 start 行を挿入（連打時も冪等）
            const baseRows = resetInsert
                ? [...r, { type: "start", cumRot: 0, yutimeLowSpins: 0, mode: effMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true }]
                : r;

            // 逆行ガード後・最新 r ベースで thisRot を再計算
            const liveThisRot = resetInsert ? val : Math.max(0, val - livePrevCumRot);

            // 投資額: 現金=増、貯玉/持ち玉=据え置き（A-4）
            const liveNewInvest = (effMode === "cash") ? livePrevInvest + investPace : livePrevInvest;

            return [...baseRows, {
                type: "data",
                thisRot: liveThisRot,
                cumRot: val,
                avgRot: newAvg,
                invest: liveNewInvest,
                mode: effMode,
                ballsConsumed,
                mochiBalls: effMode === "mochi" ? Math.max(0, S.currentMochiBalls - ballsConsumed) : S.currentMochiBalls,
                chodamaBalls: effMode === "chodama" ? Math.max(0, S.currentChodama - ballsConsumed) : S.currentChodama
            }];
        });

        const logType = effMode === "mochi"
            ? `持ち玉${ballsConsumed}玉消費`
            : effMode === "chodama"
            ? `貯玉${ballsConsumed}玉消費`
            : `${investPace >= 1000 ? investPace/1000 + "K" : investPace + "円"}決定`;
        S.pushLog({ type: logType, time: tsNow(), rot: thisRot, cash: effMode === "cash" ? investPace : 0, mode: effMode });
        setInputHistory((h) => [thisRot, ...h].slice(0, 4));
        setInput("");
        setInputError("");
        setShowInputSheet(false);
        setTimeout(() => { submitLockRef.current = false; }, 0);
    };

    // 新規稼働開始
    const handleStartSession = (modeOverride = null) => {
        if (S.requestSessionContextChange?.(["店舗", "機種", "貸玉", "交換率"])) return;
        const now = new Date();
        const schedule = validateSessionSchedule({
            nowAt: now,
            sessionStartedAt: now,
            targetTime: setupEndTime,
            closingTime: setupClosingTime,
        });
        const { targetDeadline } = schedule;
        if (!setupStore.trim()) {
            setSetupError("店舗を入力してください。閉店時刻と正しく結び付けるために必要です。");
            return;
        }
        if (!setupMachineName.trim()) {
            setSetupError("機種を選択してください。想定金額の計算に機種スペックが必要です。");
            return;
        }
        if (!schedule.ok) {
            setSetupError(sessionScheduleErrorMessage(schedule.error));
            return;
        }
        if (!(Number(setupPlannedStart1K) > 0) || !setupHourlyEstimate) {
            setSetupError("開始前の想定1Kスタートを入力し、機種スペックと回転設定を確認してください。");
            return;
        }
        if (!startSessionLockRef.current.claim()) return;
        const val = Number(setupStartRot) || 0;
        const yutimeLowSpins = setupYutimeLowSpins === "" ? val : Math.max(0, Math.round(Number(setupYutimeLowSpins) || 0));
        const sameDayMatch = matchSameDayResumeCandidate(S.sameDayResumeCandidate, {
            businessDate: localDateStr(), storeId: S.selectedStoreId, machineName: setupMachineName, machineNum: setupMachineNum,
        });
        const existingChodamaBalls = resolveRecordStartChodama(S.stores, S.selectedStoreId, setupInitialBalls);
        const sameDayStart = sameDayMatch.matched
            ? createSameDayResumeStart({ candidate: sameDayMatch.candidate, mode: modeOverride || sameDayResumeMode, startRot: val, yutimeLowSpins, existingChodamaBalls })
            : null;
        S.setSameDayResumeCandidate(null);

        // 店舗・機種設定を適用
        if (setupStore) S.setStoreName(setupStore);
        if (setupMachineNum) S.setMachineNum(setupMachineNum);
        if (setupMachineName) S.setMachineName(setupMachineName);
        if (!findEffectiveMachineByName(setupMachineName, S.customMachines)) S.setSpecSapo(0);
        // 未登録機種で任意スペックを入力した場合のみ、合成確率＋ボーダーから記録用スペックを逆算して適用。
        // （DB機種を選んだ場合はボトムシート選択時に適用済みのためここはスキップ）
        {
            const synthNum = Number(String(setupSynthDenom).replace(",", ".").trim());
            const borderNum = Number(String(setupBorder1k).replace(",", ".").trim());
            if (Number.isFinite(synthNum) && synthNum > 0) {
                S.setSynthDenom(synthNum);
                if (Number.isFinite(borderNum) && borderNum > 0) {
                    const spec = deriveSpecForMachine({ synthProb: synthNum, border1K: borderNum });
                    if (spec.spec1R != null) S.setSpec1R(spec.spec1R);
                    if (spec.specAvgRounds != null) S.setSpecAvgRounds(spec.specAvgRounds);
                    if (spec.specSapo != null) S.setSpecSapo(spec.specSapo);
                }
            }
        }
        // 新規稼働開始時は貯玉を設定（未入力なら0でリセット）
        const initialChodama = sameDayStart?.initialChodama ?? existingChodamaBalls;
        const startPlayMode = sameDayStart?.playMode || (initialChodama > 0 ? "chodama" : "cash");
        S.setCurrentChodama(sameDayStart?.currentChodama ?? initialChodama);
        S.setInitialChodama(sameDayStart?.initialChodama ?? initialChodama);
        S.setInitialMochiBalls(sameDayStart?.initialMochiBalls ?? 0);
        S.setCurrentMochiBalls(sameDayStart?.currentMochiBalls ?? 0);
        S.setCarriedInYen(sameDayStart?.carriedInYen ?? 0);
        S.setPlayMode(startPlayMode);
        // 持ち玉は0にリセット（移動時に設定する）
        if (!sameDayStart) S.setCurrentMochiBalls(0);

        // 着席時点の遊タイム判断を固定保存する。以後の実測更新とは別物として扱う。
        if (isYutimeTargetingSession(S.yutimeSession)) {
            const assumedStart1K = Number(setupYutimeStart1K)
                || Number(S.yutimeSession.assumedStart1K)
                || Number(setupBorder1k)
                || Number(S.border)
                || 0;
            const nextYutimeSession = { ...S.yutimeSession, assumedStart1K };
            S.setYutimeSession(nextYutimeSession);
            const result = calculateYutimeEV({
                probabilityDenom: Number(setupSynthDenom) || S.synthDenom,
                triggerLowSpins: nextYutimeSession.triggerLowSpins,
                currentLowSpins: yutimeLowSpins,
                start1K: assumedStart1K,
                normalExpectedNetBalls: deriveNormalExpectedNetBalls({
                    spec1R: S.spec1R,
                    specAvgRounds: S.specAvgRounds,
                    specSapo: S.specSapo,
                }),
                yutimeExpectedNetBalls: nextYutimeSession.expectedNetBalls,
                rentBalls: S.rentBalls,
                exRate: S.exRate,
                playMode: startPlayMode,
            });
            S.setYutimeDecision({
                version: 2,
                createdAt: new Date().toISOString(),
                machineName: setupMachineName || S.machineName || "",
                currentLowSpins: yutimeLowSpins,
                assumedStart1K,
                rateSource: "assumed",
                playMode: startPlayMode,
                spec: nextYutimeSession,
                result,
            });
        } else {
            S.setYutimeDecision(null);
        }

        // セッション開始
        S.setStartRot(val);
        S.setSessionStarted(true);
        S.setSessionStartDate(localDateStr());
        S.setSessionStartedAt(now.toISOString());
        S.setSessionTargetEndAt(targetDeadline.toISOString());
        S.setSessionClosingTime(setupClosingTime);
        S.setSessionPlannedStart1K(Number(setupPlannedStart1K));
        setRows((r) => [...r, sameDayStart?.startRow || {
            type: "start",
            cumRot: val,
            ...(isYutimeTargetingSession(S.yutimeSession) ? { yutimeLowSpins } : {}),
            mode: startPlayMode,
            mochiBalls: 0,
            chodamaBalls: initialChodama,
        }]);
        S.pushLog({ type: "スタート", time: tsNow(), rot: val });

        // モーダルを閉じてリセット
        setupHandoffRestoreRef.current = null;
        setShowSetupModal(false);
        setSetupStore("");
        setSetupMachineNum("");
        setSetupMachineName("");
        setSetupStartRot("");
        setSetupInitialBalls(null);
        setSetupSynthDenom("");
        setSetupBorder1k("");
        setSetupYutimeLowSpins("");
        setSetupYutimeStart1K("");
        setSetupEndTime("");
        setSetupClosingTime("");
        setSetupPlannedStart1K("");
        setSetupError("");
        setShowSetupSpec(false);
        setSetupHandoffSource("");
    };

    // 初当たりボタン → ウィザード開始
    // 新UI: 画面 A の「連チャン継続」/「単発終了」押下時に rotCountArg を渡して呼ぶ
    //       （旧UIのテンキー bottom sheet jackpot モードは廃止、引数なし呼び出しは下位互換用）
    const beginYutimeRun = async () => {
        const spec = S.activeYutimeSession;
        if (getYutimeEventMode({ spec, activeRun: S.activeYutimeRun }) !== "entry") return;
        const remaining = Number.isFinite(S.yutimeLive?.remainingSpins)
            ? Math.max(0, Math.round(S.yutimeLive.remainingSpins))
            : Math.max(0, Math.round(Number(spec.triggerLowSpins || 0) - Number(S.currentYutimeLowSpins || 0)));
        const remainingWarning = remaining > 0
            ? `アプリ上では到達まで残り${remaining.toLocaleString()}回です。\n実機が遊タイムへ突入した場合だけ記録してください。\n\n`
            : "";
        const confirmed = await S.requestConfirmation?.({
            title: "遊タイム突入を記録しますか？",
            message: `${remainingWarning}通常回転率の集計をここで止め、遊タイム中を独立した記録へ切り替えます。`,
            confirmLabel: "突入を記録",
        });
        if (!confirmed) return;
        S.pushSnapshot();
        const lastRow = rows[rows.length - 1];
        const cumRot = Number(lastRow?.cumRot) || 0;
        const startBalls = S.playMode === "chodama" ? Number(S.currentChodama || 0) : Number(S.currentMochiBalls || 0);
        const run = createYutimeRun({ id: `yutime-${Date.now()}`, machineName: S.machineName, triggerLowSpins: spec.triggerLowSpins, durationSpins: spec.durationSpins, entryLowSpins: S.currentYutimeLowSpins, entryCumRot: cumRot, startBalls, playMode: S.playMode, enteredAt: new Date().toISOString() });
        S.setYutimeRuns((prev) => [...(Array.isArray(prev) ? prev : []), run]);
        setRows((prev) => [...prev, { type: "yutime_start", runId: run.id, cumRot, lowSpins: run.entryLowSpins, startBalls, mode: S.playMode, time: tsNow() }]);
        S.pushLog({ type: "遊タイム突入", time: tsNow(), rot: cumRot });
        S.setYutimeDecision((prev) => prev || { recordedAt: new Date().toISOString(), decisionMode: "auto-approach", currentLowSpins: S.currentYutimeLowSpins, assumedStart1K: S.yutimeRateSource === "measured" ? null : spec.assumedStart1K, rateSource: S.yutimeRateSource, playMode: S.playMode, spec: { ...spec }, result: S.yutimeLive ? { ...S.yutimeLive } : null });
    };

    const addYutimeCash = () => {
        const run = S.activeYutimeRun;
        if (!run) return;
        const raw = window.prompt("遊タイム中に追加した貸玉金額を入力してください（円）", String(S.investPace || 1000));
        if (raw == null) return;
        const amount = Math.max(0, Math.round(Number(raw) || 0));
        if (!amount) return;
        S.pushSnapshot();
        S.setYutimeRuns((prev) => addYutimeSupportCash(prev, run.id, amount));
        S.pushLog({ type: "遊タイム追加投資", time: tsNow(), amount });
    };

    const finishYutimeThrough = () => {
        const run = S.activeYutimeRun;
        if (!run) return;
        const spinsRaw = window.prompt("遊タイムで消化した回転数を入力してください", String(run.durationSpins || 0));
        if (spinsRaw == null) return;
        const ballsDefault = S.playMode === "chodama" ? S.currentChodama : S.currentMochiBalls;
        const ballsRaw = window.prompt("終了時の持ち玉を入力してください", String(Math.max(0, Math.round(Number(ballsDefault) || 0))));
        if (ballsRaw == null) return;
        const supportSpins = Math.max(0, Math.round(Number(spinsRaw) || 0));
        const endBalls = Math.max(0, Math.round(Number(ballsRaw) || 0));
        S.pushSnapshot();
        S.setYutimeRuns((prev) => completeYutimeRun(prev, run.id, { outcome: "through", supportSpins, endBalls }));
        S.setYutimeSession((prev) => prev ? { ...prev, targetingEnabled: false, consumed: true } : prev);
        const cumRot = Number(rows[rows.length - 1]?.cumRot) || 0;
        setRows((prev) => [...prev, { type: "yutime_end", runId: run.id, outcome: "through", supportSpins, endBalls, cumRot, time: tsNow() }]);
        if (S.playMode === "chodama") S.setCurrentChodama(endBalls);
        else S.setCurrentMochiBalls(endBalls);
        S.pushLog({ type: "遊タイムスルー", time: tsNow(), rot: cumRot });
    };

    const openYutimeHitWizard = () => {
        const run = S.activeYutimeRun;
        if (!run) return;
        const balls = S.playMode === "chodama" ? S.currentChodama : S.currentMochiBalls;
        setHitWizardData({ pushAmount: 0, rotCount: "", trayBalls: String(Math.max(0, Math.round(Number(balls) || 0))), rounds: 0, mult: 1, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "", yutimeRunId: run.id });
        setHitInputError("");
        setHitInputFocus("rotCount");
        setHitWizardOpen(true);
    };

    const handleStartYutimeChain = (runId, supportSpinsArg, trayBallsArg) => {
        const run = (S.yutimeRuns || []).find((item) => item?.id === runId && item.status === "active");
        if (!run) {
            setHitInputError("遊タイム記録が見つかりません。画面を閉じてやり直してください。");
            return false;
        }
        const supportSpins = Math.max(0, Math.round(Number(supportSpinsArg) || 0));
        if (supportSpins <= 0) {
            setHitInputError("遊タイムで消化した回転数を入力してください。");
            return false;
        }
        S.pushSnapshot();
        const chainId = Date.now();
        const cumRot = Number(rows[rows.length - 1]?.cumRot) || 0;
        const endBalls = Math.max(0, Math.round(Number(trayBallsArg) || 0));
        setRows((prev) => [...prev, { type: "yutime_end", runId, outcome: "hit", supportSpins, endBalls, linkedChainId: chainId, cumRot, time: tsNow() }, { type: "hit", chainId, origin: "yutime", yutimeRunId: runId, cumRot, thisRot: 0, invest: 0, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, time: tsNow() }]);
        S.pushJP({ chainId, origin: "yutime", yutimeRunId: runId, yutimeSupportSpins: supportSpins, trayBalls: 0, hits: [], hitRot: cumRot, hitThisRot: 0, finalBalls: null, summary: null, completed: false, time: tsNow(), finalRealBalls: undefined });
        S.setYutimeRuns((prev) => completeYutimeRun(prev, runId, { outcome: "hit", supportSpins, endBalls, linkedChainId: chainId }));
        S.setYutimeSession((prev) => prev ? { ...prev, targetingEnabled: false, consumed: true } : prev);
        S.pushLog({ type: "遊タイム当たり", time: tsNow(), rot: cumRot });
        return true;
    };

    const handleStartChain = (rotCountArg) => {
        // 1. 入力欄が空文字なら警告して処理を中断
        const inputTrimmed = (rotCountArg != null ? String(rotCountArg) : (input || "")).toString().trim();
        const setErr = rotCountArg != null ? setHitInputError : setInputError;
        if (inputTrimmed === "") {
            setErr("総回転数を入力してください。");
            return false;
        }

        const val = Number(inputTrimmed);

        // 2. 数値変換できない or 0 以下なら警告
        if (!Number.isFinite(val) || val <= 0) {
            setErr("総回転数を入力してください。");
            return false;
        }

        // 前回の累計回転数: data 行だけでなく全行（start/hit 含む）の最後を基準にする。
        // 大当たり終了後の「スタート回転数を入力」で追加される start 行
        // （isPostJackpotStart）を取り込むことで、再スタート後の2回目以降の初当たりが
        // 直前の大当たりの古い cumRot を引きずって弾かれる問題を防ぐ。
        // 通常の回転数入力（decide）と同じ基準に揃える。
        const lastAnyRow = rows[rows.length - 1];
        const prevCumRot = lastAnyRow ? (lastAnyRow.cumRot || 0) : (S.startRot || 0);

        // 3. 逆行チェック（直前の累計回転数以下は不正）
        if (val <= prevCumRot) {
            setErr(`直前の記録（${prevCumRot}回転）以下です。正しい値を入力してください。`);
            return false;
        }

        const hitRot = val;
        const hitThisRot = val - prevCumRot;
        const chainId = Date.now();
        const lastInvest = last ? (last.invest || 0) : 0;

        // 4. 回転数テーブルに data 行 + hit 行を追加
        //    data 行で netRot を正しく反映、hit 行で chainId と大当たり履歴を紐付け
        setRows(r => [
            ...r,
            { type: "data", mode: S.playMode, cumRot: val, thisRot: hitThisRot, invest: lastInvest, time: tsNow() },
            { type: "hit", chainId, cumRot: val, thisRot: hitThisRot, invest: lastInvest, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, time: tsNow() }
        ]);

        S.pushJP({
            chainId,
            trayBalls: 0,
            hits: [],
            hitRot,
            hitThisRot,
            finalBalls: null,
            summary: null,
            completed: false,
            time: tsNow(),
            finalRealBalls: undefined, // ラッシュ終了時の最終実測持ち玉（サブステップ3で入力UI追加予定）
        });
        S.pushLog({ type: "初当たり", time: tsNow(), rot: hitRot });
        setInput("");
        setInputError("");
        setShowInputSheet(false);
        if (rotCountArg != null) {
            // 新UI（画面 A）から呼ばれた場合: チェーン作成のみで終了
            // 画面 A の hitWizardData は既にユーザーが入力済みなので、リセット・再オープンしない
            return true;
        }
        // 旧UI互換フォールバック: 画面 A を開く（実際には呼ばれない経路）
        setHitWizardData({ pushAmount: 0, rotCount: "", trayBalls: "", rounds: 3, mult: 1, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setHitWizardOpen(true);
        return true;
    };

    // ウィザード完了時の処理
    // ウィザード完了: 単発の場合はチェーン完了、確変の場合はHistoryTabへ
    // overrideHitType: 確変ボタンから直接呼ばれる場合に使用（setStateが非同期のため）
    const handleWizardComplete = (overrideHitType) => {
        if (endLockRef.current) return;
        const { pushAmount, trayBalls, rounds, mult, displayBalls, actualBalls, hitType: stateHitType, jitanSpins, finalBallsAfterJitan } = hitWizardData;
        const isYutimeOrigin = Boolean(hitWizardData.yutimeRunId);
        const hitType = overrideHitType || stateHitType;
        const rnd = Number(rounds) || 0;
        const multN = Math.max(1, Number(mult) || 1);
        const totalRounds = rnd * multN;
        const tray = Number(trayBalls) || 0;
        const disp = Number(displayBalls) || 0;
        const totalDisp = disp * multN;
        const actual = Number(actualBalls) || 0;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        if (rnd <= 0) {
            setHitWizardOpen(false);
            return;
        }
        if (!isYutimeOrigin) S.pushSnapshot();
        endLockRef.current = true;

        if (!isYutimeOrigin && pushAmount > 0) {
            S.setRotRows((prev) => {
                const lastDataRow = [...prev].reverse().find(r => r.type === "data");
                const prevInvest = lastDataRow ? lastDataRow.invest : 0;
                const newInvest = prevInvest + pushAmount;
                const lastRow = prev[prev.length - 1];
                const cumRot = lastRow ? (lastRow.cumRot || 0) : 0;
                // プッシュ補正額は「玉貸し（現金投入）の補正」なので、
                // 現在の playMode（貯玉/持ち玉）に関わらず必ず現金行として記録する。
                // mode を playMode のままにすると、貯玉/持ち玉行では invest 差分が
                // 無視され、deriveFromRows 側の ballsConsumed 未指定フォールバックで
                // 1K 分の幻の玉消費が計上されてしまい、回転率を大きく狂わせる。
                return [...prev, {
                    type: "data",
                    mode: "cash",
                    cumRot: cumRot,
                    thisRot: 0,
                    invest: newInvest,
                    ballsConsumed: 0,
                    time: tsNow()
                }];
            });
        }

        // 貯玉/持ち玉プレーの消費玉を実測（区間開始玉＝グロス）で確定する。
        // 打鍵中は 250玉/1K の暫定値で計上しているが、区間開始玉（残高 + 暫定消費の
        // 累計で復元）を各行に書き戻す。上皿残玉の差し引き（実消費化）は
        // calcPreciseEV 側の trayCorrection（chain.trayBalls）が行うため、ここでは
        // グロスを入れて二重控除を避ける。logic.js は不変。
        // rentBalls を渡すことで、持ち越し玉（RUSH 出玉など）を丸ごと消費計上して
        // 実質投資が膨張するのを回転数ベースの上限で防ぐ（reconcileSegmentConsumption 内ガード）。
        if (!isYutimeOrigin && (S.playMode === "chodama" || S.playMode === "mochi")) {
            const currentBalance = S.playMode === "chodama"
                ? (S.currentChodama || 0)
                : (S.currentMochiBalls || 0);
            S.setRotRows((prev) => reconcileSegmentConsumption(prev, {
                playMode: S.playMode,
                currentBalance,
                rentBalls: S.rentBalls || 250,
                // 瞬間当たり区間（回転入力なしで当たった区間）のグロス推定用:
                // 上皿残玉と想定回転率（理論ボーダー優先、無ければ手動ボーダー）を渡し、
                // 「実勢レートでの消費 + 上皿残玉」を上限に推定させる（幻の数百玉消費の防止）。
                trayBalls: tray,
                expectedRate: (ev && ev.theoreticalBorder > 0) ? ev.theoreticalBorder : (Number(border) > 0 ? Number(border) : 0),
            }));
        }

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            chain.trayBalls = tray;
            S.setTotalTrayBalls((p) => p + tray);
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                lastOutBalls: 0,
                nextTimingBalls: 0,
                elecSapoRot: 0,
                sapoChange: 0,
                sapoPerRot: 0,
                mult: multN,
                rawRounds: rnd,
                rounds: totalRounds,
                displayBalls: totalDisp,
                actualBalls: actual,
                time: tsNow(),
            }];

            // 単発の場合: チェーンを完了させる
            if (hitType === "単発") {
                chain.hitType = "単発";
                chain.jitanSpins = jitan;
                chain.finalBallsAfterJitan = finalBalls;
                // 差分ベース: 最終玉数を実測持ち玉として記録（開始前の玉数との差が純増になる）
                if (finalBalls > 0) chain.finalRealBalls = finalBalls;
                chain.completed = true;
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                chain.summary = {
                    totalRounds,
                    totalDisplayBalls,
                    totalSapoRot: 0,
                    totalSapoChange: 0,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: 0,
                    sapoPerRot: 0,
                    netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls,
                };
                chain.finalBalls = finalBalls > 0 ? finalBalls : (tray + totalDisplayBalls);
            }

            updated[updated.length - 1] = chain;
            return updated;
        });

        S.pushLog({ type: hitType === "単発" ? "単発終了" : "初当たり記録", time: tsNow(), rounds: totalRounds });
        setHitWizardOpen(false);
        setHitInputError("");
        setHitInputFocus("");
        setHitWizardData({ pushAmount: 0, rotCount: "", trayBalls: "", rounds: 3, mult: 1, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });

        // 確変の場合: HistoryTabで連チャン記録継続
        if (hitType === "確変") {
            S.setSessionSubTab("history");
        } else {
            // 単発の場合: 持ち玉モードに切替 & 出玉を持ち玉に加算 & 回転タブへ
            const addBalls = finalBalls > 0 ? finalBalls : (tray + totalDisp);
            S.setCurrentMochiBalls((prev) => prev + addBalls);
            S.setPlayMode("mochi");
            S.setTab("rot");
            // 時短終了後のスタート入力プロンプトを表示
            S.setShowStartPrompt(true);
        }
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // セッション内サブタブのスワイプ処理
    const sessionSubTabs = useMemo(() => ["rot", "data", "history", "settings"], []);
    const sessionSubTabLabels = { data: "詳細データ", rot: "記録", history: "大当たり履歴", settings: "機種設定" };
    // 旧 "decision" タブ選択中だった場合は実戦タブにマイグレート
    const setSessionSubTab = S.setSessionSubTab;
    const currentSubTab = S.sessionSubTab;
    useEffect(() => {
        if (!sessionSubTabs.includes(currentSubTab)) {
            setSessionSubTab("rot");
        }
    }, [currentSubTab, sessionSubTabs, setSessionSubTab]);

    // 大当たり履歴タブに入った時点では履歴画面を表示する。
    // 入力は FAB の「初当たりを記録」/連チャン中バナーの「当たりを追加」/カード内の「データを追加」から明示的に開く。
    const swipeAreaRef = useRef(null);
    const swipeState = useRef({ startX: null, startY: null, dir: null, offset: 0 });
    const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
    const [headerIsAnimating, setHeaderIsAnimating] = useState(false);

    // ヘッダー圧縮（iOS のラージタイトル相当）。
    // 各サブタブが独自のスクロール領域を持つため、ルートでキャプチャして拾う。
    // スクロールすると日付・タイトル・店舗情報を畳み、データ表示領域を約110px広げる。
    const [headerCondensed, setHeaderCondensed] = useState(false);
    useEffect(() => {
        const el = swipeAreaRef.current;
        if (!el) return;
        // 上下でしきい値を分ける（ヒステリシス）。境界でのちらつきを防ぐ。
        const CONDENSE_AT = 28;
        const EXPAND_AT = 6;
        const onScroll = (e) => {
            // サブタブ本体のスクロールだけを見る。
            // モーダル内リストや候補ドロップダウンのスクロールでヘッダーを畳まない。
            const target = e.target;
            if (!target?.classList?.contains("rec-ios-scroll")) return;
            const top = Number(target.scrollTop);
            if (!Number.isFinite(top)) return;
            setHeaderCondensed((prev) => (prev ? top > EXPAND_AT : top > CONDENSE_AT));
        };
        el.addEventListener("scroll", onScroll, true);
        return () => el.removeEventListener("scroll", onScroll, true);
    }, []);

    // サブタブを切り替えると新しいスクロール領域は先頭に戻るため、圧縮も解除する。
    useEffect(() => { setHeaderCondensed(false); }, [S.sessionSubTab]);

    // スワイプハンドラが参照する最新値を保持するref（古いクロージャ参照を防ぐ）。
    // 毎レンダー代入することで、リスナーを再登録せずに最新のS/sessionSubTabsを参照できる。
    const swipeDepsRef = useRef({ S, sessionSubTabs });
    swipeDepsRef.current = { S, sessionSubTabs };

    // useEffectでタッチイベントを{ passive: false }で登録
    useEffect(() => {
        const el = swipeAreaRef.current;
        if (!el) return;

        const handleTouchStart = (e) => {
            if (headerIsAnimating) return;
            swipeState.current = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                dir: null,
                offset: 0
            };
        };

        const handleTouchMove = (e) => {
            const state = swipeState.current;
            if (state.startX === null || headerIsAnimating) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - state.startX;
            const diffY = currentY - state.startY;

            // 方向が未確定の場合、10px以上動いたら判定
            if (state.dir === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
                if (Math.abs(diffY) > Math.abs(diffX)) {
                    state.dir = "vertical";
                    return;
                } else {
                    state.dir = "horizontal";
                }
            }

            if (state.dir !== "horizontal") return;

            // 水平スワイプ時はブラウザのデフォルト動作を防止
            e.preventDefault();
            e.stopPropagation();

            const { S: latestS, sessionSubTabs: latestSubTabs } = swipeDepsRef.current;
            const currentIndex = latestSubTabs.indexOf(latestS.sessionSubTab);
            const isAtStart = currentIndex === 0 && diffX > 0;
            const isAtEnd = currentIndex === latestSubTabs.length - 1 && diffX < 0;
            // 1:1追従。端では抵抗をかける
            const resistance = (isAtStart || isAtEnd) ? 0.3 : 1.0;
            state.offset = diffX * resistance;
            setHeaderSwipeOffset(state.offset);
        };

        const handleTouchEnd = () => {
            const state = swipeState.current;
            if (state.startX === null || headerIsAnimating || state.dir !== "horizontal") {
                swipeState.current = { startX: null, startY: null, dir: null, offset: 0 };
                setHeaderSwipeOffset(0);
                return;
            }

            const threshold = 50; // 50px以上スワイプで切り替え
            const { S: latestS, sessionSubTabs: latestSubTabs } = swipeDepsRef.current;
            const currentIndex = latestSubTabs.indexOf(latestS.sessionSubTab);

            if (Math.abs(state.offset) > threshold) {
                if (state.offset > 0 && currentIndex > 0) {
                    setHeaderIsAnimating(true);
                    latestS.setSessionSubTab(latestSubTabs[currentIndex - 1]);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 180);
                } else if (state.offset < 0 && currentIndex < latestSubTabs.length - 1) {
                    setHeaderIsAnimating(true);
                    latestS.setSessionSubTab(latestSubTabs[currentIndex + 1]);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 180);
                } else {
                    setHeaderIsAnimating(true);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 150);
                }
            } else {
                setHeaderIsAnimating(true);
                setHeaderSwipeOffset(0);
                setTimeout(() => setHeaderIsAnimating(false), 150);
            }

            swipeState.current = { startX: null, startY: null, dir: null, offset: 0 };
        };

        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });

        return () => {
            el.removeEventListener("touchstart", handleTouchStart);
            el.removeEventListener("touchmove", handleTouchMove);
            el.removeEventListener("touchend", handleTouchEnd);
        };
        // S / sessionSubTabs はswipeDepsRef経由で最新値を参照するためdeps不要。
        // headerIsAnimating はハンドラ内で直接参照するためdepsに残す。
    }, [headerIsAnimating]);

    // 機種選択ボトムシート（稼働開始モーダル・台移動モーダルで共用）。
    // machinePickerFor で適用先を切り替える（"setup"=稼働開始 / "move"=台移動）。
    const machinePickerProps = {
        showMachinePicker,
        setShowMachinePicker,
        C,
        font,
        filteredMachines,
        pickerFilter,
        setPickerFilter,
        pickerSort,
        setPickerSort,
        MACHINE_SORT_OPTIONS,
        deriveSpecForMachine,
        createYutimeSessionFromMachine,
        S,
        machinePickerFor,
        setMoveMachineName,
        setMoveYutimeTarget,
        movePickedMachineRef,
        moveStartRot,
        setSetupMachineName,
        setSetupYutimeLowSpins,
        setSetupYutimeStart1K,
        setMachineQuery,
        machineQuery,
        setShowSetupSpec,
    };
    const renderMachinePicker = () => <MachinePickerSheet {...machinePickerProps} />;

    // セッション未開始：空状態 + 下部ピル形ボタン
    if (!sessionActive) {
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "24px 20px 20px" }}>
                {/* 空状態：中央 */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    {/* 円形アイコン背景 */}
                    <div style={{
                        width: 96, height: 96, borderRadius: "50%",
                        background: "var(--surface-hi)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                        </svg>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>稼働はまだありません</div>
                    <p style={{ fontSize: 13, color: C.sub, textAlign: "center", lineHeight: 1.7, margin: 0 }}>
                        店舗・機種を選択して<br />
                        新規稼働を開始しましょう
                    </p>

                    {/* 貯玉残高表示（既存ロジック維持） */}
                    {currentStoreData?.chodama > 0 && (
                        <div className="summary-card" style={{ marginTop: 12, padding: "14px 28px", textAlign: "center" }}>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>{currentStoreData.name} 貯玉残高</div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: C.purple, fontFamily: mono }}>{f(currentStoreData.chodama)}</div>
                        </div>
                    )}

                    {/* 新規稼働ボタン（説明文の直下に配置） */}
                    <button
                        className="b"
                        onClick={openSetupModal}
                        style={{
                            width: "100%",
                            height: 60,
                            borderRadius: 30,
                            background: C.blue,
                            color: "#fff",
                            fontSize: 17,
                            fontWeight: 700,
                            fontFamily: font,
                            border: "none",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            boxShadow: "0 8px 24px rgba(47,111,237,0.25)",
                            cursor: "pointer",
                            marginTop: 8,
                        }}
                    >
                        <span style={{ fontSize: 22, fontWeight: 400, lineHeight: 1 }}>+</span>
                        新規稼働
                    </button>
                </div>

                {showSetupModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                        <div className="card-premium" style={{ width: "100%", maxWidth: 360, maxHeight: "85vh", overflowY: "auto" }}>
                            <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
                                <h2 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>稼働開始</h2>
                                <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>台の情報を入力してください</p>
                            </div>

                            <div style={{ padding: 18 }}>
                                {setupHandoffSource && (
                                    <div role="status" style={{
                                        marginBottom: 14,
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        border: `1px solid ${C.blue}66`,
                                        background: `${C.blue}12`,
                                        color: C.blue,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        lineHeight: 1.55,
                                    }}>
                                        台選びの情報を引き継ぎました。店舗・機種・台番号を確認し、必要なら変更できます。
                                    </div>
                                )}
                                {/* 店舗選択 */}
                                <div style={{ marginBottom: 16, position: "relative" }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>店舗</div>
                                    <div style={{ position: "relative" }}>
                                        <input
                                            type="text"
                                            value={setupStore}
                                            onChange={e => {
                                                setSetupStore(e.target.value);
                                                S.setSelectedStoreId(null);
                                                setSetupInitialBalls(null);
                                                setSetupClosingTime("");
                                                setSetupError("");
                                            }}
                                            placeholder="店舗名を入力"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px 40px 14px 14px", fontSize: 16, color: C.text, fontFamily: font, outline: "none", transition: "border-color 0.2s" }}
                                        />
                                        {(S.stores || []).length > 0 && (
                                            <button className="b" onClick={() => setShowStoreDD(!showStoreDD)} style={{
                                                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                                background: "var(--surface-hi)", border: "none", color: C.sub, fontSize: 12, padding: "6px 8px", borderRadius: 6
                                            }}>▼</button>
                                        )}
                                    </div>
                                    {showStoreDD && (S.stores || []).length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 150, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                            {(S.stores || []).map((st, i) => {
                                                const name = typeof st === "object" ? st.name : st;
                                                const chodama = typeof st === "object" ? st.chodama : 0;
                                                return (
                                                    <button key={st.id || i} className="b" onClick={() => {
                                                        if (S.requestSessionContextChange?.(["店舗", "貸玉", "交換率"])) return;
                                                        setSetupStore(name);
                                                        if (typeof st === "object") {
                                                            if (st.rentBalls) {
                                                                S.setRentBalls(st.rentBalls);
                                                                const ratePreset = PACHINKO_RATE_PRESETS.find((preset) => preset.rentBalls === Number(st.rentBalls));
                                                                if (ratePreset) S.setInvestPace(ratePreset.recommendedInvestPace);
                                                            }
                                                            if (st.exRate) {
                                                                S.setExRate(st.exRate);
                                                                // 複数交換率対応: 玉単価も exRate から同期
                                                                S.setBallVal(1000 / st.exRate);
                                                            }
                                                            setSetupInitialBalls(String(normalizeChodamaBalls(st.chodama)));
                                                            S.setSelectedStoreId(st.id);
                                                            setSetupClosingTime(st.closingTime || "");
                                                        }
                                                        setShowStoreDD(false);
                                                    }} style={{
                                                        width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                        color: C.text, fontSize: 14, padding: "12px 14px", textAlign: "left", fontFamily: font, display: "flex", justifyContent: "space-between", alignItems: "center"
                                                    }}>
                                                        <span>{name}</span>
                                                        {chodama > 0 && <span style={{ fontSize: 11, color: C.purple, fontFamily: mono }}>貯玉: {f(chodama)}</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貸玉レート</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                                        {PACHINKO_RATE_PRESETS.map((preset) => {
                                            const active = Number(S.rentBalls) === preset.rentBalls;
                                            return (
                                                <button
                                                    key={preset.rentBalls}
                                                    type="button"
                                                    className="b"
                                                    aria-pressed={active}
                                                    onClick={() => applyRatePreset(preset)}
                                                    style={{
                                                        minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 800,
                                                        background: active ? C.blue : C.surfaceHi,
                                                        color: active ? "#fff" : C.text,
                                                        border: active ? "none" : `1px solid ${C.borderHi}`,
                                                        fontFamily: font,
                                                    }}
                                                >
                                                    {preset.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div style={{ fontSize: 10, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
                                        現在 {rentalRateYen.toFixed(2)}円/玉 ・ 1回の記録 {Number(investPace).toLocaleString()}円（{formatBallQuantity(ballsPerRecord)}玉）
                                    </div>
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, fontWeight: 600 }}>機種</div>
                                    <button
                                        className="b"
                                        onClick={() => { setMachineQuery(""); setPickerFilter("all"); setPickerSort("default"); setMachinePickerFor("setup"); setShowMachinePicker(true); }}
                                        style={{
                                            width: "100%", boxSizing: "border-box",
                                            background: C.bg, border: `1px solid ${C.borderHi}`,
                                            borderRadius: 10, padding: "12px",
                                            fontSize: 16, color: setupMachineName ? C.text : C.sub,
                                            fontFamily: font, textAlign: "left",
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span>{setupMachineName || "機種を選択..."}</span>
                                        <span style={{ color: C.sub, fontSize: 14 }}>›</span>
                                    </button>

                                    {/* スペック（任意）: 未登録機種でも合成確率＋ボーダーを入れれば期待値が即正確になる。
                                        未入力なら既定スペックのまま記録のみ成立。折りたたみで通常フローのタップ数は据え置き。 */}
                                    <button
                                        className="b"
                                        onClick={() => setShowSetupSpec(v => !v)}
                                        style={{
                                            marginTop: 8, minHeight: 44,
                                            background: "transparent", border: "none",
                                            color: C.sub, fontSize: 12, fontWeight: 700, fontFamily: font,
                                            display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "4px 2px",
                                        }}
                                    >
                                        <span style={{ fontSize: 11 }}>{showSetupSpec ? "▼" : "▶"}</span>
                                        スペック（任意・未登録機種向け）
                                    </button>
                                    {showSetupSpec && (
                                        <div style={{ marginTop: 6 }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                                <div>
                                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>合成確率 (1/?)</div>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={setupSynthDenom}
                                                        onChange={e => setSetupSynthDenom(e.target.value)}
                                                        placeholder="319.6"
                                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.yellow, fontFamily: mono, outline: "none", textAlign: "center" }}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>ボーダー(1k・4円)</div>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={setupBorder1k}
                                                        onChange={e => setSetupBorder1k(e.target.value)}
                                                        placeholder="16.7"
                                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.teal, fontFamily: mono, outline: "none", textAlign: "center" }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                                                未入力でも記録は可能です（期待値は概算）。後から機種設定でも変更できます。
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>台番号</div>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            value={setupMachineNum}
                                            onChange={e => setSetupMachineNum(e.target.value)}
                                            placeholder="例: 123"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>開始回転数</div>
                                        <input
                                            type="tel"
                                            inputMode="numeric"
                                            value={setupStartRot}
                                            onChange={e => setSetupStartRot(e.target.value)}
                                            placeholder="0"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                        />
                                    </div>
                                </div>

                                {isYutimeTargetingSession(S.yutimeSession) && (
                                    <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: "rgba(47,111,237,.08)", border: `1px solid ${C.blue}55` }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: C.blue, marginBottom: 8 }}>遊タイム（任意）</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                            <div>
                                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>現在の低確率カウント</div>
                                                <input
                                                    aria-label="現在の遊タイムカウント"
                                                    type="number"
                                                    min="0"
                                                    inputMode="numeric"
                                                    value={setupYutimeLowSpins}
                                                    onChange={e => setSetupYutimeLowSpins(e.target.value)}
                                                    placeholder={setupStartRot || "0"}
                                                    style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px", color: C.text, fontSize: 16, fontFamily: mono }}
                                                />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>想定1K回転率</div>
                                                <input
                                                    aria-label="想定1K回転率"
                                                    type="number"
                                                    min="0"
                                                    step="0.1"
                                                    inputMode="decimal"
                                                    value={setupYutimeStart1K}
                                                    onChange={e => setSetupYutimeStart1K(e.target.value)}
                                                    placeholder={String(S.yutimeSession.assumedStart1K || S.border || "")}
                                                    style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px", color: C.text, fontSize: 16, fontFamily: mono }}
                                                />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 7, lineHeight: 1.5 }}>
                                            発動 {S.yutimeSession.triggerLowSpins}回 / 遊タイム {S.yutimeSession.durationSpins || "—"}回
                                            {S.yutimeSession.expectedNetBalls == null ? " ・ 期待出玉の入力が必要" : ` ・ 平均純増 ${Number(S.yutimeSession.expectedNetBalls).toLocaleString()}玉`}
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginBottom: 18, padding: 12, borderRadius: 12, background: "var(--surface-hi)", border: `1px solid ${C.borderHi}` }}>
                                    <div style={{ fontSize: 12, color: C.text, marginBottom: 10, fontWeight: 800 }}>稼働計画</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                                        <label style={{ display: "block" }}>
                                            <span style={{ display: "block", fontSize: 10, color: C.sub, marginBottom: 5 }}>終了予定時刻 *</span>
                                            <input
                                                aria-label="終了予定時刻"
                                                type="time"
                                                value={setupEndTime}
                                                onChange={(e) => { setSetupEndTime(e.target.value); setSetupError(""); }}
                                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px", color: C.text, fontSize: 16, fontFamily: mono }}
                                            />
                                        </label>
                                        <label style={{ display: "block" }}>
                                            <span style={{ display: "block", fontSize: 10, color: C.sub, marginBottom: 5 }}>店舗の閉店時刻 *</span>
                                            <input
                                                aria-label="店舗の閉店時刻"
                                                type="time"
                                                value={setupClosingTime}
                                                onChange={(e) => { setSetupClosingTime(e.target.value); setSetupError(""); }}
                                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px", color: C.text, fontSize: 16, fontFamily: mono }}
                                            />
                                        </label>
                                    </div>
                                    <label style={{ display: "block", marginBottom: 10 }}>
                                        <span style={{ display: "block", fontSize: 10, color: C.sub, marginBottom: 5 }}>開始前の想定1Kスタート *</span>
                                        <input
                                            aria-label="開始前の想定1Kスタート"
                                            type="number"
                                            min="0.1"
                                            step="0.1"
                                            inputMode="decimal"
                                            value={setupPlannedStart1K}
                                            onChange={(e) => { setSetupPlannedStart1K(e.target.value); setSetupError(""); }}
                                            placeholder="例: 20.0"
                                            style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 16, fontFamily: mono }}
                                        />
                                    </label>
                                    <div style={{ fontSize: 10, color: C.sub, lineHeight: 1.55, marginBottom: setupProjection ? 10 : 0 }}>
                                        開始 {timeValueFromDate(projectionNow)} ・ 1時間 {f(S.rotPerHour)}回転で計算します。
                                    </div>
                                    {setupProjection && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            <div style={{ background: C.bg, borderRadius: 9, padding: 9 }}>
                                                <div style={{ fontSize: 9, color: C.sub }}>予定終了まで</div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: sc(setupProjection.totalWork), fontFamily: mono }}>{sp(Math.round(setupProjection.totalWork))}円</div>
                                            </div>
                                            <div style={{ background: C.bg, borderRadius: 9, padding: 9 }}>
                                                <div style={{ fontSize: 9, color: C.sub }}>閉店まで</div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: setupCloseProjection ? sc(setupCloseProjection.totalWork) : C.sub, fontFamily: mono }}>
                                                    {setupCloseProjection ? `${sp(Math.round(setupCloseProjection.totalWork))}円` : "—"}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {setupTargetAfterClosing && (
                                        <div role="alert" style={{ marginTop: 8, fontSize: 10, color: C.red }}>終了予定時刻は閉店時刻と同じか、それより前に設定してください。</div>
                                    )}
                                </div>

                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貯玉（任意）</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={setupInitialBalls ?? ""}
                                        onChange={e => setSetupInitialBalls(e.target.value)}
                                        placeholder="0"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>

                                <SameDayResumePrompt resume={matchSameDayResumeCandidate(S.sameDayResumeCandidate, { businessDate: localDateStr(), storeId: S.selectedStoreId, machineName: setupMachineName, machineNum: setupMachineNum })} mode={sameDayResumeMode} onChange={handleStartSession} C={C} f={f} />
                                {setupError && !setupTargetAfterClosing && <div role="alert" style={{ color: C.red, fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>{setupError}</div>}

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <button className="b" onClick={cancelSetupModal} style={{
                                        background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`, borderRadius: 14, color: C.text, fontSize: 15, fontWeight: 700, padding: "16px 0", fontFamily: font
                                    }}>キャンセル</button>
                                    {!matchSameDayResumeCandidate(S.sameDayResumeCandidate, { businessDate: localDateStr(), storeId: S.selectedStoreId, machineName: setupMachineName, machineNum: setupMachineNum }).matched && <button className="b btn-premium btn-secondary" onClick={handleStartSession}>
                                        稼働開始
                                    </button>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 機種選択ボトムシート（稼働開始・台移動で共用） */}
                {renderMachinePicker()}
            </div>
        );
    }

    // 貯玉使用時の投資額計算（複数交換率対応: ballVal=円/玉を S から取得）
    const _getChodamaInvestYen = (balls) => {
        const ballValue = Number(S.ballVal) > 0 ? Number(S.ballVal) : 4;
        return Math.floor(balls / (1000 / ballValue / S.rentBalls)) * 1000;
    };

    // テンキー用ハンドラ（input文字列を編集するだけ。decide/handleStartChainは現行のまま使う）
    const MAX_INPUT_LEN = 6;
    const pressDigit = (d) => {
        setInputError("");
        setInput(prev => {
            if (prev === "0") return d;
            if (prev.length >= MAX_INPUT_LEN) return prev;
            return prev + d;
        });
    };
    const pressBackspace = () => { setInputError(""); setInput(p => p.slice(0, -1)); };

    // 直前の data 行を 1 件削除（誤入力即時取消）。Undo スナップショットに積むので S.undo() で復旧可能。
    const handleDeleteLastData = () => {
        const lastDataIdx = rows.findLastIndex(r => r.type === "data");
        if (lastDataIdx < 0) return;
        S.pushSnapshot();
        const target = rows[lastDataIdx];
        // 貯玉消費行の場合：消費した貯玉を残高に差し戻す
        if (target && target.mode === "chodama" && (target.ballsConsumed || 0) > 0) {
            S.setCurrentChodama((p) => Math.max(0, p + (target.ballsConsumed || 0)));
        }
        // 持ち玉消費行の場合：消費した持ち玉を残高に差し戻す
        if (target && target.mode === "mochi" && (target.ballsConsumed || 0) > 0) {
            S.setCurrentMochiBalls((p) => Math.max(0, p + (target.ballsConsumed || 0)));
        }
        // 対応する sesLog エントリ（最後の回転入力イベント）を削除して行動ログと同期
        S.setSesLog((prev) => {
            const isRotEntry = (type) => type && (/決定$/.test(type) || /消費$/.test(type));
            for (let i = prev.length - 1; i >= 0; i--) {
                if (isRotEntry(prev[i]?.type)) {
                    return prev.filter((_, idx) => idx !== i);
                }
            }
            return prev;
        });
        setRows(r => r.filter((_, i) => i !== lastDataIdx));
        setInputError("");
    };
    const hasDataRow = rows.some(r => r.type === "data");
    const lastDataRow = hasDataRow ? [...rows].reverse().find(r => r.type === "data") : null;
    const saveRotationCorrection = (mode) => {
        const result = correctRotationMode({ rows, fingerprint: rotationCorrection?.fingerprint, mode, rentBalls: Number(S.rentBalls) });
        if (!result.ok) { setRotationCorrectionError(result.reason); return; }
        const nextMochi = Number(S.currentMochiBalls) + result.balanceDelta.mochi;
        const nextChodama = Number(S.currentChodama) + result.balanceDelta.chodama;
        const finalData = [...result.rows].reverse().find((row) => row.type === "data");
        const finalInvest = finalData?.invest;
        if (!Number.isFinite(nextMochi) || !Number.isFinite(nextChodama) || nextMochi < 0 || nextChodama < 0 || !Number.isFinite(finalInvest) || finalInvest < 0) { setRotationCorrectionError("残玉または投資額の証拠が不足しています。"); return; }
        S.pushSnapshot();
        setRows(result.rows);
        S.setCurrentMochiBalls(nextMochi);
        S.setCurrentChodama(nextChodama);
        S.setInvestYen?.(finalInvest);
        S.setPlayMode(resolveNextPlayMode({ playMode: S.playMode, currentMochiBalls: nextMochi, currentChodama: nextChodama }));
        setRotationCorrection(null);
        setRotationCorrectionError("");
    };

    // セッション開始後：データ表示とコントロール
    // ヘッダーは docs/design-review/pachi-ios-redesign.html の
    // app-bar / page-intro / machine-card 構成に合わせて再構成している（表示のみ・機能は据え置き）。
    const recordDateLabel = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
    const headerCashInvest = Math.max(0, Number(ev.cashCostYen ?? ev.rawInvest) || 0);
    return (
        <div
            ref={swipeAreaRef}
            className="rec-ios"
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
            <div
                className={`rec-ios-header${headerCondensed ? " is-condensed" : ""}`}
                style={{
                    flexShrink: 0,
                    borderBottom: `1px solid ${C.border}`,
                    background: "var(--header-bg)"
                }}
            >
                <div className="rec-ios-appbar">
                    <div className="rec-ios-appbar__title" style={{ fontFamily: font }}>
                        <small>{recordDateLabel}</small>
                        <strong>今日の実戦</strong>
                    </div>
                    <button
                        className="b rec-ios-round"
                        type="button"
                        aria-label="通知を開く"
                        onClick={() => {
                            if (typeof S.openNotificationPanel === "function") {
                                S.openNotificationPanel();
                            } else {
                                const el = document.getElementById("record-recent-events");
                                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }
                        }}
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                        </svg>
                        {(() => {
                            const log = S.notificationLog;
                            const unread = Array.isArray(log)
                                ? log.reduce((n, it) => n + (it && it.read === false ? 1 : 0), 0)
                                : 0;
                            if (unread <= 0) return null;
                            const label = unread > 99 ? "99+" : String(unread);
                            return (
                                <span className="rec-ios-round__badge" aria-label={`未読 ${unread} 件`}>
                                    {label}
                                </span>
                            );
                        })()}
                    </button>
                    <button
                        className="b rec-ios-round"
                        type="button"
                        aria-label="設定モードへ"
                        onClick={() => { if (S.setTab) S.setTab("settings"); }}
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                        </svg>
                    </button>
                </div>

                <div className="rec-ios-intro" style={{ fontFamily: font }}>
                    <div style={{ minWidth: 0 }}>
                        <h2>{S.storeName || "店舗未設定"}</h2>
                        <p>{S.machineNum ? `台番号 ${S.machineNum} ・ 稼働中` : "台番号未設定 ・ 稼働中"}</p>
                    </div>
                    <button
                        className="b rec-ios-pill"
                        type="button"
                        onClick={() => { setCustomInvestPace(String(investPace)); setCustomInvestPaceError(""); setShowInvestSettings(true); }}
                        aria-label="投資ペース設定"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="6" width="20" height="13" rx="2" />
                            <path d="M2 10h20" />
                        </svg>
                        <span style={{ fontFamily: mono }}>
                            {investPace >= 1000 ? `${investPace/1000}K` : `${investPace}円`}・{formatBallQuantity(ballsPerRecord)}玉
                        </span>
                    </button>
                </div>

                <button
                    className="b rec-ios-machine"
                    type="button"
                    onClick={() => setSummaryCollapsed(!summaryCollapsed)}
                    aria-expanded={!summaryCollapsed}
                    aria-label={summaryCollapsed ? "実戦サマリーを開く" : "実戦サマリーを閉じる"}
                    style={{ fontFamily: font }}
                >
                    <span className="rec-ios-machine__icon" aria-hidden="true">P</span>
                    <span className="rec-ios-machine__copy">
                        <strong>{S.machineName || "機種未設定"}</strong>
                        <span>現金投資 ・ {headerCashInvest > 0 ? `${f(headerCashInvest)}円` : "—"} ・ {ev.netRot > 0 ? `${f(ev.netRot)}回転` : "—"}</span>
                    </span>
                    <span className="rec-ios-live">実戦中</span>
                    <span className="rec-ios-machine__chev" aria-hidden="true">{summaryCollapsed ? "▼" : "▲"}</span>
                </button>

                {!summaryCollapsed && (
                    <div className="summary-card" style={{ padding: 6, margin: "0 16px 8px", borderRadius: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>総回転</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{ev.netRot > 0 ? f(ev.netRot) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>現在ハマり</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{currentHamari > 0 ? f(currentHamari) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>時給</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(evEff.wage), fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{evEff.wage !== 0 ? sp(evEff.wage, 0) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>初当</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{ev.normalFirstHitCount ?? ev.jpCount ?? 0}</div>
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className="rec-ios-segmented-wrap"
                    style={{
                        transform: `translateX(${headerSwipeOffset}px)`,
                        transition: headerIsAnimating ? "transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none"
                    }}
                >
                    <div className="rec-ios-segmented" role="tablist" aria-label="実戦画面の切り替え">
                        {sessionSubTabs.map((tabId) => {
                            const isActive = S.sessionSubTab === tabId;
                            return (
                                <button
                                    key={tabId}
                                    className="b"
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => S.setSessionSubTab(tabId)}
                                    style={{ fontFamily: font }}
                                >
                                    {sessionSubTabLabels[tabId]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {S.sessionSubTab === "rot" && (() => {
                const ballsLabel = S.playMode === "chodama" ? "貯玉" : "持ち玉";
                const ballsVal = S.playMode === "chodama" ? (S.currentChodama || 0) : (S.currentMochiBalls || 0);
                const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
                const currentCumRot = lastRow ? (lastRow.cumRot || 0) : 0;
                const lastInputRot = inputHistory.length > 0 ? inputHistory[0] : null;
                const showYutimeDecision = shouldAutoShowYutimeCard({ spec: S.activeYutimeSession, result: S.yutimeLive, activeRun: S.activeYutimeRun });
                const yutimeEventMode = getYutimeEventMode({ spec: S.activeYutimeSession, activeRun: S.activeYutimeRun });
                const yutimeEventRemaining = Number.isFinite(S.yutimeLive?.remainingSpins)
                    ? Math.max(0, Math.round(S.yutimeLive.remainingSpins))
                    : Math.max(0, Math.round(Number(S.activeYutimeSession?.triggerLowSpins || 0) - Number(S.currentYutimeLowSpins || 0)));

                return (
                    <>
                    <div className="rec-ios-scroll" style={{
                        flex: 1, overflowY: "auto", overscrollBehavior: "contain",
                        padding: "12px 16px",
                        paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
                        display: "flex", flexDirection: "column", gap: 12,
                    }}>
                        {!showYutimeDecision && <LiveDecisionNavigator decision={ev.liveDecision} />}
                        <DecisionSummaryCard ev={ev} />
                        {!showYutimeDecision && (
                            <CashLimitGuide guide={liveCashLimitGuide} preAlert={liveCashPreAlert} />
                        )}

                        <YutimeEvCard
                            result={S.yutimeLive}
                            spec={{ ...S.activeYutimeSession, investPace: S.investPace }}
                            activeRun={S.activeYutimeRun}
                            normalEv={evEff}
                            currentLowSpins={S.currentYutimeLowSpins}
                            rateSource={S.yutimeRateSource}
                            playMode={S.playMode}
                            onOpen={() => setShowYutimeCalculator(true)}
                        />
                        {showYutimeCalculator && (
                            <YutimeCalculatorSheet
                                S={S}
                                initialMachineName={S.machineName || ""}
                                initialSession={S.activeYutimeSession}
                                initialCurrentLowSpins={S.yutimeLive?.currentLowSpins || 0}
                                initialStart1K={S.yutimeLive?.valid && S.yutimeLive.cashCostPerSpin > 0 ? 1000 / S.yutimeLive.cashCostPerSpin : null}
                                onClose={() => setShowYutimeCalculator(false)}
                            />
                        )}

                        <KeyMetrics
                            ev={ev}
                            currentMochiBalls={S.currentMochiBalls || 0}
                            currentChodama={S.currentChodama || 0}
                        />

                        <RecentEventList
                            jpLog={jpLog}
                            sesLog={sesLog}
                            anchorId="record-recent-events"
                        />

                        {hasDataRow && <div style={{ display: "grid", gap: 6 }}>
                            {rows.map((row, index) => isEditableRotationModeRow(row) && <button key={`mode-correction-${index}`} type="button" className="b" onClick={() => { setRotationCorrection({ row, fingerprint: createRotationModeFingerprint(row, index) }); setRotationCorrectionError(""); }} style={{ minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surfaceHi, color: C.text, textAlign: "left", padding: "0 12px" }}>遊技方法を修正（+{row.thisRot}回転・{row.mode === "mochi" ? "持ち玉" : row.mode === "chodama" ? "貯玉" : "現金"}）</button>)}
                        </div>}

                        {hasDataRow && (
                            <button
                                className="b"
                                type="button"
                                onClick={handleDeleteLastData}
                                style={{
                                    width: "100%", minHeight: 44, borderRadius: 10,
                                    background: `color-mix(in srgb, ${C.red} 8%, transparent)`,
                                    border: `1px solid color-mix(in srgb, ${C.red} 25%, transparent)`,
                                    color: C.red, fontSize: 13, fontWeight: 600, fontFamily: font,
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                    <path d="M9 6V4h6v2" />
                                </svg>
                                直前の入力を削除{lastDataRow?.thisRot != null ? `（+${lastDataRow.thisRot}回転）` : ""}
                            </button>
                        )}

                    </div>
                    <RotationModeEditor key={rotationCorrection?.fingerprint?.index ?? "closed"} row={rotationCorrection?.row} open={Boolean(rotationCorrection)} error={rotationCorrectionError} onClose={() => { setRotationCorrection(null); setRotationCorrectionError(""); }} onSave={saveRotationCorrection} />

                    <div className="record-cta-bar">
                        <button
                            className={`b record-cta-input${yutimeEventMode === "active" ? " record-cta-input--yutime" : ""}`}
                            type="button"
                            onClick={() => {
                                if (yutimeEventMode === "active") {
                                    setShowEventMenu(true);
                                    return;
                                }
                                setInputError("");
                                setShowInputSheet(true);
                            }}
                            aria-label={yutimeEventMode === "active" ? "遊タイム中のイベントを記録する" : "回転数を入力する"}
                        >
                            {yutimeEventMode === "active" ? <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="9" />
                                    <path d="M12 8v8M8 12h8" />
                                </svg>
                                <span>
                                    遊タイム中の記録
                                    <span className="record-cta-input__sub">＋イベントから結果・貸玉を記録</span>
                                </span>
                            </> : <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="3" y="6" width="18" height="14" rx="2" />
                                    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
                                </svg>
                                <span>
                                    回転数を入力する
                                    <span className="record-cta-input__sub">タップしてテンキーを開く</span>
                                </span>
                            </>}
                        </button>
                        <button
                            className="b record-fab"
                            type="button"
                            onClick={() => setShowEventMenu(true)}
                            aria-label="イベントメニューを開く"
                        >
                            <span className="record-fab__plus">＋</span>
                            <span className="record-fab__label">イベント</span>
                        </button>
                    </div>

                    {showEventMenu && (
                        <div
                            className="event-menu__backdrop"
                            onClick={() => setShowEventMenu(false)}
                            role="presentation"
                        >
                            <div
                                className="event-menu__panel"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-label="イベントメニュー"
                            >
                                <div className="input-sheet__handle" />
                                <div className="event-menu__title" style={{ fontFamily: font }}>イベントメニュー</div>
                                <div className="event-menu__sub" style={{ fontFamily: font }}>
                                    {yutimeEventMode === "active" ? "遊タイム中の記録" : yutimeEventMode === "entry" ? "通常記録・遊タイム突入" : "戦略・実践イベント"}
                                </div>

                                {yutimeEventMode === "entry" && (
                                    <button
                                        className="b event-menu__item event-menu__item--yutime"
                                        type="button"
                                        onClick={() => {
                                            setShowEventMenu(false);
                                            beginYutimeRun();
                                        }}
                                    >
                                        <span className="event-menu__item-icon" style={{ "--em-color": C.yellow }}>
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M13 2 5 13h6l-1 9 8-12h-6z" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="event-menu__item-title" style={{ fontFamily: font }}>遊タイム突入を記録</span>
                                            <span className="event-menu__item-sub" style={{ fontFamily: font }}>
                                                {yutimeEventRemaining > 0 ? `アプリ上は残り${yutimeEventRemaining.toLocaleString()}回・実機突入時に記録` : "通常回転の集計を止め、独立記録へ切り替えます"}
                                            </span>
                                        </span>
                                        <span className="event-menu__item-chev">›</span>
                                    </button>
                                )}

                                {yutimeEventMode === "active" && (<>
                                    <button
                                        className="b event-menu__item event-menu__item--yutime"
                                        type="button"
                                        onClick={() => {
                                            setShowEventMenu(false);
                                            openYutimeHitWizard();
                                        }}
                                    >
                                        <span className="event-menu__item-icon" style={{ "--em-color": C.yellow }}>
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" />
                                                <path d="M8 12h8M12 8v8" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="event-menu__item-title" style={{ fontFamily: font }}>遊タイム中に当たった</span>
                                            <span className="event-menu__item-sub" style={{ fontFamily: font }}>消化回転数と実際の大当たりを記録します</span>
                                        </span>
                                        <span className="event-menu__item-chev">›</span>
                                    </button>

                                    <button
                                        className="b event-menu__item"
                                        type="button"
                                        onClick={() => {
                                            setShowEventMenu(false);
                                            finishYutimeThrough();
                                        }}
                                    >
                                        <span className="event-menu__item-icon" style={{ "--em-color": C.orange }}>
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" />
                                                <path d="m9 9 6 6m0-6-6 6" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="event-menu__item-title" style={{ fontFamily: font }}>スルー・終了を記録</span>
                                            <span className="event-menu__item-sub" style={{ fontFamily: font }}>消化回転数と終了時の玉数を保存します</span>
                                        </span>
                                        <span className="event-menu__item-chev">›</span>
                                    </button>

                                    <button
                                        className="b event-menu__item"
                                        type="button"
                                        onClick={() => {
                                            setShowEventMenu(false);
                                            addYutimeCash();
                                        }}
                                    >
                                        <span className="event-menu__item-icon" style={{ "--em-color": C.green }}>
                                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <circle cx="12" cy="12" r="9" />
                                                <path d="M12 7v10M8 12h8" />
                                            </svg>
                                        </span>
                                        <span>
                                            <span className="event-menu__item-title" style={{ fontFamily: font }}>遊タイム中の貸玉を追加</span>
                                            <span className="event-menu__item-sub" style={{ fontFamily: font }}>突入後に追加した現金投資だけを記録します</span>
                                        </span>
                                        <span className="event-menu__item-chev">›</span>
                                    </button>
                                </>)}

                                {/* 遊タイム中は通常初当たりへ誤登録させない */}
                                {yutimeEventMode !== "active" && <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        setHitInputError("");
                                        setHitInputFocus("pushAmount");
                                        setHitWizardData({ pushAmount: 0, rotCount: "", trayBalls: "", rounds: 0, mult: 1, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
                                        setHitWizardOpen(true);
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.orange }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="9" />
                                            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>初当たりを記録</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>大当たりを記録します</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>}

                                {/* 台移動を記録 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={openMoveFlow}
                                    disabled={moveEntryProcessing}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.blue }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="12" x2="18" y2="12" />
                                            <polyline points="14 7 19 12 14 17" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>{moveEntryProcessing ? "確認中…" : "台移動を記録"}</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>{moveEntryProcessing ? "入力途中の記録を確認しています" : "別の台へ移動したことを記録"}</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>

                                {/* 継続判断を記録 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        const opt = window.prompt("継続判断を入力（継続 / 様子見 / 打ち切り）", "様子見");
                                        if (opt && opt.trim()) {
                                            S.pushLog({ type: `継続判断: ${opt.trim()}`, time: tsNow() });
                                        }
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.green }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 4v16l4-3h12V4z" />
                                            <line x1="9" y1="10" x2="15" y2="10" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>継続判断を記録</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>継続・様子見・打ち切りなど</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>

                                {/* メモを追加 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        const note = window.prompt("メモ内容", "");
                                        if (note && note.trim()) {
                                            S.pushLog({ type: `メモ: ${note.trim()}`, time: tsNow() });
                                        }
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.purple }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>メモを追加</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>台の状況や気づきをメモ</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>

                                {/* 記録を一時保存 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        S.pushSnapshot();
                                        S.pushLog({ type: "一時保存", time: tsNow() });
                                        window.alert("現在の記録を一時保存しました。アプリを閉じても続きから再開できます。");
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.yellow }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                                            <polyline points="17 21 17 13 7 13 7 21" />
                                            <polyline points="7 3 7 8 15 8" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>記録を一時保存</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>途中でアプリを閉じるときに</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>

                                {/* 実戦終了 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        S.handleEndSession();
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.red }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="9" />
                                            <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>実戦終了</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>この台の記録を終了する</span>
                                    </span>
                                    <span className="event-menu__item-chev">›</span>
                                </button>

                                <div className="event-menu__footer" style={{ fontFamily: font }}>
                                    長押しでよく使うイベントを設定
                                </div>
                            </div>
                        </div>
                    )}

                    {showInputSheet && (
                        <div
                            className="input-sheet__backdrop"
                            onClick={() => { setShowInputSheet(false); setInputError(""); }}
                            role="presentation"
                        >
                            <div
                                className="numpad-modal__panel"
                                onClick={(e) => e.stopPropagation()}
                                role="dialog"
                                aria-label="回転数の入力"
                            >
                                <div className="input-sheet__handle" />
                                <div className="numpad-modal__head">
                                    <div className="numpad-modal__title" style={{ fontFamily: font }}>回転数を入力</div>
                                    <button
                                        className="b numpad-modal__close"
                                        type="button"
                                        onClick={() => { setShowInputSheet(false); setInputError(""); }}
                                        aria-label="閉じる"
                                    >×</button>
                                </div>

                                <div className="numpad-modal__chips" style={{ fontFamily: font }}>
                                    <div className="numpad-modal__chip">
                                        <span className="numpad-modal__chip-label">{ballsLabel}</span>
                                        <span className="numpad-modal__chip-val numpad-modal__chip-val--accent" style={{ fontFamily: mono }}>
                                            {ballsVal > 0 ? `${f(ballsVal)}玉` : "—"}
                                        </span>
                                    </div>
                                    <div className="numpad-modal__chip">
                                        <span className="numpad-modal__chip-label">現在回転数</span>
                                        <span className="numpad-modal__chip-val" style={{ fontFamily: mono }}>
                                            {currentCumRot > 0 ? `${f(currentCumRot)}回` : "—"}
                                        </span>
                                    </div>
                                    <div className="numpad-modal__chip">
                                        <span className="numpad-modal__chip-label">前回入力</span>
                                        <span className="numpad-modal__chip-val numpad-modal__chip-val--blue" style={{ fontFamily: mono }}>
                                            {lastInputRot != null ? `${lastInputRot}回` : "—"}
                                        </span>
                                    </div>
                                </div>

                                {/* 端数玉の入力方法ガイド（持ち玉/貯玉モードのみ表示）:
                                    「玉が半端に残っている時、いつ・どう入力すればいいか」で迷わないための固定表示。
                                    操作ステップは増やさず、判断に必要な文言のみを常時表示する。 */}
                                {(S.playMode === "mochi" || S.playMode === "chodama") && (
                                    <div className="numpad-modal__hint" style={{ fontFamily: font }}>
                                        💡 {ballsLabel}が尽きたら、その時点でそのまま回転数を入力してください。端数玉は自動で計算され、次の入力から現金投資に切り替わります。
                                    </div>
                                )}

                                <div className="numpad-modal__display">
                                    <div>
                                        <span
                                            className={`numpad-modal__display-num${input ? "" : " numpad-modal__display-num--empty"}`}
                                            style={{ fontFamily: mono }}
                                        >
                                            {input || "0"}
                                        </span>
                                        <span className="numpad-modal__display-unit" style={{ fontFamily: font }}>回転</span>
                                    </div>
                                    <button
                                        className="b numpad-modal__display-del"
                                        type="button"
                                        onClick={pressBackspace}
                                        aria-label="一文字削除"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                                            <line x1="18" y1="9" x2="12" y2="15" />
                                            <line x1="12" y1="9" x2="18" y2="15" />
                                        </svg>
                                    </button>
                                </div>

                                {inputError && (
                                    <div className="error-msg" style={{ fontSize: 11, marginBottom: 10, fontFamily: font }}>{inputError}</div>
                                )}

                                <div className="numpad-modal__keys">
                                    {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
                                        <button
                                            key={d}
                                            className="b numpad-modal__key"
                                            type="button"
                                            onClick={() => pressDigit(d)}
                                            style={{ fontFamily: font }}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                    <button
                                        className="b numpad-modal__key numpad-modal__key--zero"
                                        type="button"
                                        onClick={() => pressDigit("0")}
                                        style={{ fontFamily: font }}
                                    >
                                        0
                                    </button>
                                    <button
                                        className="b numpad-modal__key"
                                        type="button"
                                        onClick={() => { pressDigit("0"); pressDigit("0"); }}
                                        aria-label="00"
                                        style={{ fontFamily: font, fontSize: 20 }}
                                    >
                                        00
                                    </button>
                                    <button
                                        className="b numpad-modal__key numpad-modal__key--back"
                                        type="button"
                                        onClick={pressBackspace}
                                        aria-label="1文字削除"
                                    >
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                                            <line x1="18" y1="9" x2="12" y2="15" />
                                            <line x1="12" y1="9" x2="18" y2="15" />
                                        </svg>
                                    </button>
                                </div>

                                <button
                                    className="b numpad-modal__submit"
                                    type="button"
                                    onClick={decide}
                                    style={{ fontFamily: font }}
                                >
                                    この回転数を追加
                                </button>

                                {inputHistory.length > 0 && (
                                    <div className="numpad-modal__history">
                                        <div className="numpad-modal__history-label" style={{ fontFamily: font }}>入力履歴</div>
                                        <div className="numpad-modal__history-row">
                                            {inputHistory.slice(0, 4).map((n, i) => (
                                                <span key={i} className="numpad-modal__history-chip">+{n}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    </>
                );
            })()}

            {S.sessionSubTab === "history" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div className="rec-ios-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                        <div>
                                {(() => {
                                    const heroEvNet = ev && Number.isFinite(ev.totalNetGain) ? ev.totalNetGain : 0;
                                    // 1Rあたり実測平均 = 実測純増(最終持ち玉 − 開始上皿玉) ÷ 総R数。
                                    // 最終持ち玉を入力済みのチェーンを対象とし、無ければ従来の液晶ベース ev.avg1R にフォールバック。
                                    const measuredChains = (S.jpLog || []).filter(c => c.completed && c.finalRealBalls !== undefined && c.finalRealBalls !== null);
                                    const measuredRealNet = measuredChains.reduce((s, c) => s + ((Number(c.finalRealBalls) || 0) - (Number(c.trayBalls) || 0)), 0);
                                    const measuredRounds = measuredChains.reduce((s, c) => s + (c.summary?.totalRounds || 0), 0);
                                    const heroAvg1R = measuredRounds > 0 ? measuredRealNet / measuredRounds : (ev && Number.isFinite(ev.avg1R) ? ev.avg1R : 0);
                                    const hasAvg1R = measuredRounds > 0 || heroAvg1R > 0;
                                    const heroMochi = S.currentMochiBalls || 0;
                                    const totalHits = ev && Number.isFinite(ev.totalHits) ? ev.totalHits : 0;
                                    const totalRoundsAll = ev && Number.isFinite(ev.totalRounds) ? ev.totalRounds : 0;
                                    const totalRotAll = ev && Number.isFinite(ev.netRot) ? ev.netRot : 0;
                                    const avgRpHit = ev && Number.isFinite(ev.avgRoundsPerHit) ? ev.avgRoundsPerHit : 0;
                                    const firstHitCount = jpLog.length;
                                    // 評価ラベル（プロトタイプ用マッピング・既存しきい値を踏襲）
                                    const verdictCfg = heroEvNet > 1500
                                        ? { label: "圧倒", color: C.green }
                                        : heroEvNet > 300
                                            ? { label: "優勢", color: C.green }
                                            : heroEvNet > -300
                                                ? { label: "互角", color: C.yellow }
                                                : { label: "不利", color: C.red };
                                    const statCells = [
                                        { label: "累計大当たり", val: f(totalHits), unit: "回", col: C.text },
                                        { label: "総R数", val: f(totalRoundsAll), unit: "回", col: C.text },
                                        { label: "平均出玉/R", val: hasAvg1R ? f(Math.round(heroAvg1R)) : "—", unit: "玉/R", col: C.orange },
                                        { label: "総回転", val: f(totalRotAll), unit: "回", col: C.orange },
                                        { label: "総R数/回", val: avgRpHit > 0 ? f(avgRpHit, 2) : "—", unit: "回", col: C.text },
                                        { label: "初当たり", val: f(firstHitCount), unit: "回", col: C.purple },
                                    ];
                                    return (
                                        <>
                                            {/* HUDストリップ */}
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
                                                <div style={{ textAlign: "center", padding: "2px 4px" }}>
                                                    <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>持玉</div>
                                                    <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: mono, lineHeight: 1.2, marginTop: 2 }}>
                                                        {f(heroMochi)}<span style={{ fontSize: 11, marginLeft: 1, fontFamily: font, color: C.green, opacity: 0.85 }}>玉</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "center", padding: "2px 4px", borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                                                    <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>評価</div>
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 }}>
                                                        <span style={{ fontSize: 20, fontWeight: 900, color: verdictCfg.color, fontFamily: font, lineHeight: 1.2 }}>{verdictCfg.label}</span>
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={verdictCfg.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 17 9 11 13 15 21 7" />
                                                            <polyline points="14 7 21 7 21 14" />
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "center", padding: "2px 4px" }}>
                                                    <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>1Rあたり</div>
                                                    <div style={{ fontSize: 20, fontWeight: 900, color: C.orange, fontFamily: mono, lineHeight: 1.2, marginTop: 2 }}>
                                                        {hasAvg1R ? f(Math.round(heroAvg1R)) : "—"}<span style={{ fontSize: 11, marginLeft: 1, fontFamily: font, color: C.orange, opacity: 0.85 }}>玉</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* RUSH継続中バナー */}
                                            {isChainActive && (
                                                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 12px" }}>
                                                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${C.green} 70%, transparent))` }} />
                                                    <span style={{ fontSize: 13, fontWeight: 900, color: C.green, letterSpacing: 2, fontFamily: font, textShadow: `0 0 12px color-mix(in srgb, ${C.green} 50%, transparent)` }}>RUSH継続中</span>
                                                    <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, color-mix(in srgb, ${C.green} 70%, transparent), transparent)` }} />
                                                </div>
                                            )}

                                            {/* スタッツグリッド（3×2） */}
                                            <div style={{
                                                background: `linear-gradient(160deg, color-mix(in srgb, ${C.green} 8%, var(--surface)) 0%, var(--surface) 100%)`,
                                                border: `1px solid color-mix(in srgb, ${C.green} 26%, ${C.border})`,
                                                borderRadius: 16, padding: "14px 6px", marginBottom: 12,
                                                boxShadow: `0 0 18px color-mix(in srgb, ${C.green} 12%, transparent)`,
                                            }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", rowGap: 14 }}>
                                                    {statCells.map((c, i) => (
                                                        <div key={c.label} style={{ textAlign: "center", padding: "0 2px", borderRight: (i % 3 !== 2) ? `1px solid ${C.border}` : "none" }}>
                                                            <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, fontFamily: font, marginBottom: 4 }}>{c.label}</div>
                                                            <div style={{ fontSize: 17, fontWeight: 900, color: c.col, fontFamily: mono, lineHeight: 1 }}>
                                                                {c.val}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>{c.unit}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}

                                {isChainActive && (
                                    <div style={{ marginBottom: 14 }}>
                                        <button className="b" onClick={openChainWizard} style={{
                                            width: "100%", minHeight: 58, marginBottom: 8,
                                            borderRadius: 16, fontWeight: 900, fontSize: 17, fontFamily: font,
                                            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", border: "none", color: "#fff",
                                            boxShadow: "0 6px 22px rgba(59,130,246,0.42)",
                                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                        }}>
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                                                <line x1="12" y1="5" x2="12" y2="19" />
                                                <line x1="5" y1="12" x2="19" y2="12" />
                                            </svg>
                                            当たりを追加
                                        </button>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            <button className="b" onClick={() => openDirectSingleEnd("single")} disabled={lastChain.hits.length === 0} style={{
                                                minHeight: 50, borderRadius: 14, fontWeight: 800, fontSize: 14, fontFamily: font,
                                                background: "var(--surface-hi)", border: `1px solid ${C.border}`, color: C.text,
                                                opacity: lastChain.hits.length === 0 ? 0.45 : 1,
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                                                    <line x1="4" y1="22" x2="4" y2="15" />
                                                </svg>
                                                単発完了
                                            </button>
                                            <button className="b" onClick={() => openDirectSingleEnd("rush")} disabled={lastChain.hits.length === 0} style={{
                                                minHeight: 50, borderRadius: 14, fontWeight: 800, fontSize: 14, fontFamily: font,
                                                background: "linear-gradient(135deg, #ea580c, #f59e0b)", border: "none", color: "#fff",
                                                boxShadow: "0 4px 16px rgba(245,158,11,0.34)",
                                                opacity: lastChain.hits.length === 0 ? 0.45 : 1,
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                                    <line x1="6" y1="6" x2="18" y2="18" />
                                                    <line x1="18" y1="6" x2="6" y2="18" />
                                                </svg>
                                                RUSH終了
                                            </button>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
                                            時短が切れたら → 当たり1回だけなら「単発完了」／連チャンしたら「RUSH終了」
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2, marginBottom: 10 }}>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: font }}>
                                        大当たり履歴 <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>(最新20件)</span>
                                    </span>
                                    <button type="button" className="b" onClick={() => setShowAllHistory(v => !v)} style={{
                                        background: "transparent", border: "none", color: C.blue,
                                        fontSize: 12, fontWeight: 700, fontFamily: font, padding: "4px 2px",
                                        display: "flex", alignItems: "center", gap: 3, cursor: "pointer",
                                    }}>
                                        履歴をすべて見る
                                        <span style={{ fontSize: 13 }}>{showAllHistory ? "▾" : "›"}</span>
                                    </button>
                                </div>

                                {(() => {
                                    const allHits = jpLog.flatMap(ch => (ch.hits || []).map(h => ({
                                        rounds: h.rounds || 0, time: h.time, mult: h.mult || 1, rawRounds: h.rawRounds,
                                    })));
                                    const timelineHits = allHits.slice(-20);
                                    if (timelineHits.length === 0) {
                                        return (
                                            <div style={{ textAlign: "center", color: C.sub, padding: "22px 16px", fontSize: 12, fontFamily: font, marginBottom: 14 }}>
                                                まだ大当たりがありません
                                            </div>
                                        );
                                    }
                                    return (
                                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 6, marginBottom: 14, padding: "4px 0" }}>
                                            {timelineHits.map((h, i) => (
                                                <React.Fragment key={i}>
                                                    {i > 0 && (
                                                        <span style={{ alignSelf: "center", width: 8, height: 2, borderRadius: 2, background: C.border, marginTop: -8 }} />
                                                    )}
                                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                                                        <div style={{
                                                            minWidth: 38, padding: "6px 9px", borderRadius: 999,
                                                            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                                                            color: "#fff", fontWeight: 900, fontSize: 13, fontFamily: mono,
                                                            textAlign: "center", boxShadow: "0 2px 8px rgba(59,130,246,0.32)",
                                                        }}>
                                                            {h.rounds}<span style={{ fontSize: 9, fontFamily: font, opacity: 0.9 }}>R</span>
                                                        </div>
                                                        {h.time && <span style={{ fontSize: 8, color: C.sub, fontFamily: mono }}>{h.time}</span>}
                                                    </div>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    );
                                })()}

                                <div style={{ margin: "0 0 16px", background: `linear-gradient(135deg, var(--surface), var(--surface-alt))`, border: `1px solid color-mix(in srgb, ${C.teal} 32%, ${C.border})`, borderRadius: 18, overflow: "hidden", boxShadow: `0 0 22px color-mix(in srgb, ${C.teal} 14%, transparent)` }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                                        {[
                                            { label: "総R数", val: ev.totalRounds > 0 ? f(ev.totalRounds) : "0", unit: "回", col: C.orange },
                                            { label: "平均R数", val: ev.avgRoundsPerHit > 0 ? f(ev.avgRoundsPerHit, 2) : "—", unit: "回", col: C.blue },
                                            { label: "大当たり", val: ev.totalHits > 0 ? String(ev.totalHits) : "0", unit: "回", col: C.purple },
                                            { label: "初当たり", val: jpLog.length > 0 ? jpLog.length.toString() : "0", unit: "回", col: C.green },
                                        ].map(({ label, val, unit, col }, idx) => (
                                            <div key={label} style={{ textAlign: "center", padding: "12px 2px", borderRight: idx < 3 ? `1px solid ${C.border}` : "none" }}>
                                                <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                                <div style={{ fontSize: 17, fontWeight: 900, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                                <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {showAllHistory && (<>
                                {/* History — Chain Cards */}
                                {jpLog.length === 0 ? (
                                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                                ) : (
                                    [...jpLog].reverse().map((chain, ci) => {
                                        // 実測モード: 最終持ち玉を入力済みのチェーンは、各連の個別サポ増減（簡易フローでは未測定のノイズ）を
                                        // 表示せず、チェーン全体の実測残差に統一する。1R出玉・純増も実測純増ベースで表示する。
                                        const realFinal = (chain.finalRealBalls !== undefined && chain.finalRealBalls !== null) ? (Number(chain.finalRealBalls) || 0) : null;
                                        const chainTray = Number(chain.trayBalls) || 0;
                                        const sumRounds = chain.summary ? (chain.summary.totalRounds || 0) : 0;
                                        const sumSapoRot = chain.summary ? (chain.summary.totalSapoRot || 0) : 0;
                                        const isMeasured = realFinal !== null && sumRounds > 0;
                                        const realNet = isMeasured ? realFinal - chainTray : 0;        // 実測純増
                                        const measAvg1R = isMeasured ? realNet / sumRounds : 0;        // 1Rあたり実測平均
                                        const residualSapo = isMeasured ? Math.round(realNet - sumRounds * (Number(S.spec1R) || 140)) : 0;  // サポ増減(実測残差)
                                        const residualSapoPerRot = isMeasured && sumSapoRot > 0 ? residualSapo / sumSapoRot : 0;
                                        return (
                                        <Card
                                            key={chain.chainId || ci}
                                            style={{
                                                padding: "14px 16px", marginBottom: 12,
                                                background: !chain.completed
                                                    ? `linear-gradient(135deg, color-mix(in srgb, ${C.green} 14%, var(--surface)), var(--surface-alt))`
                                                    : `linear-gradient(135deg, color-mix(in srgb, ${C.blue} 10%, var(--surface)), var(--surface-alt))`,
                                                border: !chain.completed
                                                    ? `1px solid color-mix(in srgb, ${C.green} 34%, ${C.border})`
                                                    : `1px solid color-mix(in srgb, ${C.blue} 22%, ${C.border})`,
                                                borderRadius: 18,
                                                boxShadow: !chain.completed
                                                    ? `0 0 20px color-mix(in srgb, ${C.green} 15%, transparent)`
                                                    : `0 0 18px color-mix(in srgb, ${C.blue} 10%, transparent)`
                                            }}
                                            onTouchStart={() => handleLongPressStart(chain.chainId)}
                                            onTouchEnd={handleLongPressEnd}
                                            onTouchMove={handleLongPressEnd}
                                        >
                                            {/* Chain Header */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 12, fontWeight: 900, color: !chain.completed ? C.green : C.blue }}>
                                                    {!chain.completed ? "現在のチェーン" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}
                                                </span>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
                                                    {chain.completed && chain.hits.length > 0 && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleEditChainOpen(chain.chainId); }}
                                                            onTouchStart={(e) => e.stopPropagation()}
                                                            style={{ background: "rgba(59,130,246,0.12)", border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 6, color: C.blue, fontSize: 10, padding: "4px 8px", fontFamily: font, fontWeight: 700, cursor: "pointer" }}
                                                        >編集</button>
                                                    )}
                                                </div>
                                            </div>
                                            {/* 初当たり回転数 */}
                                            {chain.hitRot > 0 && (
                                                <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                                    <span style={{ fontSize: 10, color: C.sub }}>総回転: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitRot)}</span></span>
                                                    {chain.hitThisRot > 0 && <span style={{ fontSize: 10, color: C.sub }}>ハマり: <span style={{ fontWeight: 700, color: C.orange, fontFamily: mono }}>{f(chain.hitThisRot)}</span></span>}
                                                </div>
                                            )}
                                            {/* Individual Hits */}
                                            {chain.hits.map((hit, hi) => {
                                                const change = hit.sapoChange != null ? hit.sapoChange : 0;
                                                const perRot = hit.sapoPerRot != null ? hit.sapoPerRot : 0;
                                                return (
                                                    <div key={hi} style={{ padding: "6px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                            <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow }}>
                                                                {hit.hitNumber}連目
                                                                {hit.mult > 1 ? ` (${hit.rawRounds}R×${hit.mult})` : ""}
                                                            </span>
                                                            <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{hit.time}</span>
                                                        </div>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                                            <div>
                                                                <div style={{ fontSize: 8, color: C.sub }}>ラウンド</div>
                                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.purple, fontFamily: mono }}>
                                                                    {hit.rounds || 0}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>R</span>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 8, color: C.sub }}>電サポ回転</div>
                                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>回</span></div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 8, color: C.sub }}>サポ増減</div>
                                                                {isMeasured ? (
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, fontFamily: mono }}>—</div>
                                                                ) : (
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(change), fontFamily: mono }}>
                                                                        {change >= 0 ? "+" : ""}{change}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>玉</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 8, color: C.sub }}>サポ/回転</div>
                                                                {isMeasured ? (
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, fontFamily: mono }}>—</div>
                                                                ) : (
                                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* Chain Summary */}
                                            {chain.completed && chain.summary && (
                                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                        <div style={{ textAlign: "left" }}>
                                                            <div style={{ fontSize: 8, color: C.sub }}>1R出玉</div>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: C.teal, fontFamily: mono }}>
                                                                {f(isMeasured ? measAvg1R : chain.summary.avg1R, 1)}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>玉</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "left" }}>
                                                            <div style={{ fontSize: 8, color: C.sub }}>サポ増減/回転</div>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: sc(isMeasured ? residualSapoPerRot : (chain.summary.sapoPerRot || 0)), fontFamily: mono }}>
                                                                {sumSapoRot > 0 ? sp(isMeasured ? residualSapoPerRot : chain.summary.sapoPerRot, 2) : "—"}
                                                                {sumSapoRot > 0 && <span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>玉/回転</span>}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "left" }}>
                                                            <div style={{ fontSize: 8, color: C.sub }}>サポ総増減</div>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: sc(isMeasured ? residualSapo : chain.summary.sapoDelta), fontFamily: mono }}>
                                                                {sp(isMeasured ? residualSapo : chain.summary.sapoDelta, 0)}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>玉</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "left" }}>
                                                            <div style={{ fontSize: 8, color: C.sub }}>純増出玉</div>
                                                            <div style={{ fontSize: 14, fontWeight: 800, color: C.green, fontFamily: mono }}>
                                                                {f(isMeasured ? realNet : chain.summary.netGain)}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>玉</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                        {isMeasured
                                                            ? `実測純増 ${f(realNet)}玉 ÷ ${sumRounds}R = ${f(measAvg1R, 1)}玉/R`
                                                            : `${f(chain.summary.avg1R, 1)} × ${chain.summary.totalRounds}R ${(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}${f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = ${f(Math.round(chain.summary.netGain))}`}
                                                    </div>
                                                </div>
                                            )}
                                            {!chain.completed && chain.hits.length === 0 && (
                                                <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                            )}
                                            {/* + データを追加 ボタン（チェーン直下インライン版）
                                                将来連携予定: 連チャン継続時のみ表示し当たり追加ウィザードを開く想定 */}
                                            {ci === 0 && !chain.completed && (
                                                <button
                                                    type="button"
                                                    className="b"
                                                    onClick={openChainWizard}
                                                    style={{
                                                        width: "100%", marginTop: 10, minHeight: 44,
                                                        background: "transparent",
                                                        border: `1px dashed color-mix(in srgb, ${C.blue} 50%, ${C.border})`,
                                                        borderRadius: 12, color: C.blue,
                                                        fontSize: 13, fontWeight: 700, fontFamily: font,
                                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                                    }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                                        <line x1="12" y1="5" x2="12" y2="19" />
                                                        <line x1="5" y1="12" x2="19" y2="12" />
                                                    </svg>
                                                    データを追加
                                                </button>
                                            )}
                                        </Card>
                                        );
                                    })
                                )}
                                {jpLog.length > 0 && (() => {
                                    const summaryChain = lastChain || jpLog[jpLog.length - 1];
                                    if (!summaryChain) return null;
                                    const sumRot = summaryChain.hitRot || 0;
                                    const sumTray = summaryChain.trayBalls || 0;
                                    const sumRounds = (summaryChain.hits || []).reduce((s, h) => s + (h.rounds || 0), 0);
                                    const sumSapoRot = (summaryChain.hits || []).reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                                    // 最終玉数（ラッシュ終了時に入力された実測持ち玉）と実測純増（最終玉 − 開始前の玉）
                                    const sumFinal = (summaryChain.finalRealBalls !== undefined && summaryChain.finalRealBalls !== null)
                                        ? Number(summaryChain.finalRealBalls) || 0 : 0;
                                    const sumMeasured = sumFinal > 0
                                        ? sumFinal - sumTray
                                        : (summaryChain.completed && summaryChain.summary ? Math.round(summaryChain.summary.netGain || 0) : 0);
                                    const rows = [
                                        { label: "当たった回転数", val: sumRot > 0 ? f(sumRot) : "—", unit: sumRot > 0 ? "回転" : "" },
                                        { label: "開始前の玉数", val: sumTray > 0 ? f(sumTray) : "—", unit: "玉" },
                                        { label: "ラウンド数(計)", val: sumRounds > 0 ? f(sumRounds) : "—", unit: "R" },
                                        { label: "電サポ回転(計)", val: sumSapoRot > 0 ? f(sumSapoRot) : "—", unit: "回転" },
                                        { label: "最終玉数", val: sumFinal > 0 ? f(sumFinal) : "—", unit: "玉" },
                                        { label: "実測純増", val: sumMeasured !== 0 ? f(sumMeasured) : "—", unit: "玉" },
                                    ];
                                    return (
                                        <details open style={{ marginTop: 4, marginBottom: 12, background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
                                            <summary style={{
                                                listStyle: "none", cursor: "pointer",
                                                fontSize: 12, fontWeight: 800, color: C.blue, fontFamily: font,
                                                display: "flex", alignItems: "center", gap: 6,
                                            }}>
                                                <span style={{ fontSize: 9 }}>▼</span>
                                                今回の入力まとめ（未確定）
                                            </summary>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px 10px", marginTop: 10 }}>
                                                {rows.map(r => (
                                                    <div key={r.label}>
                                                        <div style={{ fontSize: 9, color: C.sub, fontFamily: font }}>{r.label}</div>
                                                        <div style={{ fontSize: 13, fontWeight: 800, color: r.val === "—" ? C.sub : C.text, fontFamily: mono }}>
                                                            {r.val}<span style={{ fontSize: 9, color: C.sub, marginLeft: 1, fontFamily: font }}>{r.unit}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    );
                                })()}
                                <button
                                    type="button"
                                    className="b"
                                    onClick={() => {
                                        const lastChain = (S.jpLog || []).length > 0 ? (S.jpLog || [])[S.jpLog.length - 1] : null;
                                        if (!lastChain) return;
                                        S.pushSnapshot();
                                        if (lastChain.completed) {
                                            S.setCurrentMochiBalls((p) => Math.max(0, p - (lastChain.finalBalls || 0)));
                                        }
                                        if ((lastChain.trayBalls || 0) > 0) {
                                            S.setTotalTrayBalls((p) => Math.max(0, p - lastChain.trayBalls));
                                        }
                                        S.setJpLog((prev) => prev.slice(0, -1));
                                        if (lastChain.chainId) {
                                            S.setRotRows((prev) => prev.filter(r => !(r.type === "hit" && r.chainId === lastChain.chainId)));
                                        }
                                    }}
                                    style={{
                                        width: "100%", minHeight: 48,
                                        background: "rgba(239, 68, 68, 0.10)",
                                        border: `1px solid ${C.red}30`,
                                        borderRadius: 12, color: C.red,
                                        fontSize: 14, fontWeight: 800, fontFamily: font,
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                    }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                                        <path d="M10 11v6" />
                                        <path d="M14 11v6" />
                                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                                    </svg>
                                    最新履歴を削除
                                </button>
                                </>)}
                        </div>
                    </div>

                    {deleteConfirmOpen && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                            <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                                <SecLabel label="削除確認" />
                                <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                                    このデータを削除しますか？
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    <Btn label="キャンセル" onClick={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }} />
                                    <Btn label="削除" onClick={handleDeleteConfirm} bg={C.red} fg="#fff" bd="none" />
                                </div>
                            </Card>
                        </div>
                    )}

                    {editChainOpen && (
                        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                            <Card style={{ width: "100%", maxWidth: 380, maxHeight: "90vh", padding: 16, display: "flex", flexDirection: "column" }}>
                                <SecLabel label="大当たりデータを編集" />
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>
                                    誤入力したデータを修正できます。保存すると集計と持ち玉が再計算されます。
                                </div>
                                <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
                                    {editChainHits.map((h, hi) => (
                                        <div key={hi} style={{ padding: "10px 0", borderTop: hi > 0 ? `1px solid ${C.border}` : "none" }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>{h.hitNumber}連目</div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    ラウンド数
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={h.rounds}
                                                        onChange={e => setEditChainHits(p => p.map((x, i) => i === hi ? { ...x, rounds: e.target.value } : x))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    液晶出玉
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={h.displayBalls}
                                                        onChange={e => setEditChainHits(p => p.map((x, i) => i === hi ? { ...x, displayBalls: e.target.value } : x))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    電サポ回転数
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={h.elecSapoRot}
                                                        onChange={e => setEditChainHits(p => p.map((x, i) => i === hi ? { ...x, elecSapoRot: e.target.value } : x))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    前回終了玉
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={h.lastOutBalls}
                                                        onChange={e => setEditChainHits(p => p.map((x, i) => i === hi ? { ...x, lastOutBalls: e.target.value } : x))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                                <label style={{ fontSize: 10, color: C.sub, gridColumn: "1 / span 2" }}>
                                                    次タイミング玉
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={h.nextTimingBalls}
                                                        onChange={e => setEditChainHits(p => p.map((x, i) => i === hi ? { ...x, nextTimingBalls: e.target.value } : x))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ padding: "10px 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 6 }}>連チャン終了データ</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                            <label style={{ fontSize: 10, color: C.sub }}>
                                                時短回数
                                                <input
                                                    type="tel" inputMode="numeric"
                                                    value={editChainMeta.jitanSpins}
                                                    onChange={e => setEditChainMeta(m => ({ ...m, jitanSpins: e.target.value.replace(/[^0-9]/g, "") }))}
                                                    className="input-premium"
                                                    style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                />
                                            </label>
                                            <label style={{ fontSize: 10, color: C.sub }}>
                                                最終出玉
                                                <input
                                                    type="tel" inputMode="numeric"
                                                    value={editChainMeta.finalBallsAfterJitan}
                                                    onChange={e => setEditChainMeta(m => ({ ...m, finalBallsAfterJitan: e.target.value.replace(/[^0-9]/g, "") }))}
                                                    className="input-premium"
                                                    style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                />
                                            </label>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                                            最終出玉を入力すると実測持ち玉として集計・持ち玉に反映されます。0なら液晶出玉ベースで計算します。
                                        </div>
                                    </div>
                                    {(editChainMeta.segMode === "chodama" || editChainMeta.segMode === "mochi") && (
                                        <div style={{ padding: "10px 0", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 6 }}>
                                                通常時の玉消費（回転率の修正）
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    打ち始めの玉数
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={editChainMeta.segStartBalls}
                                                        onChange={e => setEditChainMeta(m => ({ ...m, segStartBalls: e.target.value.replace(/[^0-9]/g, "") }))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                                <label style={{ fontSize: 10, color: C.sub }}>
                                                    上皿残玉（当たり時）
                                                    <input
                                                        type="tel" inputMode="numeric"
                                                        value={editChainMeta.trayRemaining}
                                                        onChange={e => setEditChainMeta(m => ({ ...m, trayRemaining: e.target.value.replace(/[^0-9]/g, "") }))}
                                                        className="input-premium"
                                                        style={{ width: "100%", boxSizing: "border-box", fontFamily: mono, padding: "8px 10px", fontSize: 14, marginTop: 4 }}
                                                    />
                                                </label>
                                            </div>
                                            <div style={{ fontSize: 10, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
                                                打ち始めの玉数 − 上皿残玉 = 実際に使った玉。これで回転率を正確に計算し直します。
                                            </div>
                                            {editChainMeta.hasPush && (
                                                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12, color: C.text, minHeight: 44 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={editChainMeta.clearPush}
                                                        onChange={e => setEditChainMeta(m => ({ ...m, clearPush: e.target.checked }))}
                                                        style={{ width: 20, height: 20 }}
                                                    />
                                                    誤って押したプッシュ補正（現金）を取り消す
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    <Btn label="キャンセル" onClick={() => { setEditChainOpen(false); setEditChainId(null); setEditChainHits([]); setEditChainMeta({ jitanSpins: "", finalBallsAfterJitan: "", segStartBalls: "", trayRemaining: "", segMode: "cash", hasPush: false, clearPush: false }); }} />
                                    <Btn label="保存" onClick={handleEditChainSave} bg={C.blue} fg="#fff" bd="none" />
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* データタブ - 分析OS風ダークUI（折りたたみ型）*/}
            {S.sessionSubTab === "data" && (() => {
                const evEff = effectiveEv(ev);
                const decision = evDecision(ev);
                const liveDecision = ev.liveDecision;
                const nextDecisionText = liveDecision?.nextCheckpointK
                    ? `${liveDecision.nextCheckpointK}Kまであと${liveDecision.remainingK.toFixed(1)}K（約${liveDecision.remainingBalls}玉）`
                    : "20K確認済み";
                const sessionStartReference = S.sessionStartedAt || projectionNow;
                const storedTargetDeadline = S.sessionTargetEndAt ? new Date(S.sessionTargetEndAt) : null;
                const targetDeadline = storedTargetDeadline && Number.isFinite(storedTargetDeadline.getTime())
                    ? storedTargetDeadline
                    : null;
                const closingDeadline = S.sessionClosingTime
                    ? deadlineFromTime(sessionStartReference, S.sessionClosingTime, { allowNextDay: true })
                    : null;
                const plannedEstimate = estimateHourlyWorkFromStart1K({
                    start1K: S.sessionPlannedStart1K,
                    synthDenom: S.synthDenom,
                    spec1R: S.spec1R,
                    specAvgRounds: S.specAvgRounds,
                    specSapo: S.specSapo,
                    exRate: S.exRate,
                    rentBalls: S.rentBalls,
                    rotPerHour: S.rotPerHour,
                    playMode: Number(S.initialChodama) > 0 ? "chodama" : "cash",
                });
                const openScheduleEditor = () => {
                    const defaultTarget = new Date(Number(projectionNow) + 2 * 60 * 60 * 1000);
                    setScheduleTargetTime(targetDeadline ? timeValueFromDate(targetDeadline) : timeValueFromDate(defaultTarget));
                    setScheduleClosingTime(S.sessionClosingTime || "");
                    setScheduleEditorError("");
                    setShowScheduleEditor(true);
                };
                const saveScheduleEditor = () => {
                    const schedule = validateSessionSchedule({
                        nowAt: projectionNow,
                        sessionStartedAt: sessionStartReference,
                        targetTime: scheduleTargetTime,
                        closingTime: scheduleClosingTime,
                    });
                    if (!schedule.ok) {
                        setScheduleEditorError(sessionScheduleErrorMessage(schedule.error));
                        return;
                    }
                    S.setSessionTargetEndAt(schedule.targetDeadline.toISOString());
                    S.setSessionClosingTime(scheduleClosingTime);
                    setScheduleEditorError("");
                    setShowScheduleEditor(false);
                };
                const scheduleEditorButton = (
                    <button
                        type="button"
                        aria-label="予定時間を変更"
                        onClick={openScheduleEditor}
                        style={{
                            width: "100%",
                            minHeight: 48,
                            boxSizing: "border-box",
                            border: `1px solid ${C.blue}`,
                            borderRadius: 11,
                            background: "rgba(10,132,255,0.09)",
                            color: C.text,
                            padding: "9px 12px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            fontFamily: font,
                            cursor: "pointer",
                        }}
                    >
                        <span style={{ textAlign: "left" }}>
                            <span style={{ display: "block", fontSize: 11, fontWeight: 800 }}>予定時間を変更</span>
                            <span style={{ display: "block", marginTop: 3, fontSize: 9.5, color: C.sub }}>
                                終了 {targetDeadline ? timeValueFromDate(targetDeadline) : "未設定"} ・ 閉店 {S.sessionClosingTime || "未設定"}
                            </span>
                        </span>
                        <span aria-hidden="true" style={{ color: C.blue, fontSize: 20, lineHeight: 1 }}>›</span>
                    </button>
                );
                const scheduleEditorProps = {
                    showScheduleEditor,
                    ReactDOM,
                    setShowScheduleEditor,
                    C,
                    scheduleTargetTime,
                    setScheduleTargetTime,
                    setScheduleEditorError,
                    mono,
                    scheduleClosingTime,
                    setScheduleClosingTime,
                    scheduleEditorError,
                    font,
                    saveScheduleEditor,
                };
                const scheduleEditorModal = <SessionScheduleEditor {...scheduleEditorProps} />;
                const hasData = (ev.netRot || 0) > 0;
                if (!hasData) {
                    const plannedTarget = plannedEstimate && targetDeadline
                        ? projectWorkToDeadline({ currentWork: 0, hourlyWork: plannedEstimate.hourlyWork, nowAt: projectionNow, deadlineAt: targetDeadline })
                        : null;
                    const plannedClose = plannedEstimate && closingDeadline
                        ? projectWorkToDeadline({ currentWork: 0, hourlyWork: plannedEstimate.hourlyWork, nowAt: projectionNow, deadlineAt: closingDeadline })
                        : null;
                    return (
                        <div style={{ padding: 14 }}>
                            <Card style={{ padding: "18px 16px", marginBottom: 10 }}>
                                <div style={{ fontSize: 13, color: C.text, fontWeight: 800, marginBottom: 12 }}>開始前の仕事量見込み</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div style={{ background: C.surfaceHi, borderRadius: 10, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: C.sub }}>予定終了 {targetDeadline ? timeValueFromDate(targetDeadline) : "未設定"}</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: plannedTarget ? sc(plannedTarget.totalWork) : C.sub, fontFamily: mono }}>
                                            {plannedTarget ? `${sp(Math.round(plannedTarget.totalWork))}円` : "—"}
                                        </div>
                                    </div>
                                    <div style={{ background: C.surfaceHi, borderRadius: 10, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: C.sub }}>閉店 {S.sessionClosingTime || "未設定"}</div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: plannedClose ? sc(plannedClose.totalWork) : C.sub, fontFamily: mono }}>
                                            {plannedClose ? `${sp(Math.round(plannedClose.totalWork))}円` : "—"}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ marginTop: 9, fontSize: 10, color: C.sub, lineHeight: 1.5 }}>想定1Kスタート {Number(S.sessionPlannedStart1K) > 0 ? `${f(S.sessionPlannedStart1K, 1)}回/K` : "未設定"}。回転入力後は実測値で更新します。</div>
                                <div style={{ marginTop: 12 }}>{scheduleEditorButton}</div>
                            </Card>
                            <Card style={{ padding: "22px 16px", textAlign: "center" }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 800, marginBottom: 8 }}>
                                    詳細データはまだありません
                                </div>
                                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                                    回転数や大当たりを記録すると、実データに基づく分析を表示します。
                                </div>
                            </Card>
                            {scheduleEditorModal}
                        </div>
                    );
                }

                const start1K = ev.start1K > 0 ? ev.start1K : evEff.start1K;
                const theoreticalBorder = ev.theoreticalBorder > 0 ? ev.theoreticalBorder : 0;
                const bDiff = Number.isFinite(ev.bDiff) ? ev.bDiff : evEff.bDiff;
                const wage = evEff.wage;
                const confidence = decision.confidence;
                const expectedWork = evEff.workAmount;
                // 交換率（円/玉）：ballVal を優先、未設定なら exRate を 1000/exRate で換算
                const ballValYenPerBall = Number(S.ballVal) > 0 ? Number(S.ballVal) :
                    (Number(S.exRate) > 0 ? 1000 / Number(S.exRate) : 4);
                const exRate = ballValYenPerBall;
                const currentMochi = Number(S.currentMochiBalls) || 0;
                const totalInvestActual = ev.rawInvest > 0 ? ev.rawInvest : 0;
                // 実収支は、現金だけでなく開始からの貯玉増減と台移動の持込価値も含める。
                const actualBalance = calculateLiveActualBalance({
                    currentMochiBalls: currentMochi,
                    currentChodama: S.currentChodama,
                    initialChodama: S.initialChodama,
                    rawInvest: totalInvestActual,
                    carriedInYen: S.carriedInYen,
                    ballValueYen: ballValYenPerBall,
                });
                // 差分表示用：差 = 期待値 − 実収支。正＝欠損（実収支が期待値を下回る）／負＝余剰（上回る）
                const diffExpVsAct = expectedWork - actualBalance;
                const currentBalls = currentMochi;
                const jpCount = ev.normalFirstHitCount ?? ev.jpCount ?? 0;
                const totalHits = ev.totalHits || 0;
                const netRot = ev.netRot || 0;
                const avg1R = ev.avg1R > 0 ? ev.avg1R : 0;
                const evPerRot = Number.isFinite(evEff.evPerRot) ? evEff.evPerRot : 0;
                const mochiRatio = ev.mochiRatio > 0 ? ev.mochiRatio : 0;
                const chodamaRatio = ev.chodamaRatio > 0 ? ev.chodamaRatio : 0;
                const nonCashRatio = ev.nonCashRatio > 0 ? ev.nonCashRatio : (mochiRatio + chodamaRatio);
                const firstHitRateLabel = jpCount > 0 && netRot > 0 ? `1/${f(netRot / jpCount, 1)}` : "—";
                const replayLimitLabel = Number(S.chodamaReplayLimit) > 0 ? `${f(Number(S.chodamaReplayLimit))} 玉` : "—";
                const targetProjection = targetDeadline
                    ? projectWorkToDeadline({ currentWork: expectedWork, hourlyWork: wage, nowAt: projectionNow, deadlineAt: targetDeadline })
                    : null;
                const closeProjection = closingDeadline
                    ? projectWorkToDeadline({ currentWork: expectedWork, hourlyWork: wage, nowAt: projectionNow, deadlineAt: closingDeadline })
                    : null;
                const formatRemaining = (minutes) => {
                    const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
                    const hours = Math.floor(safeMinutes / 60);
                    const mins = safeMinutes % 60;
                    return hours > 0 ? `${hours}時間${mins > 0 ? `${mins}分` : ""}` : `${mins}分`;
                };
                // 信頼度ランク
                const accuracyLabel = confidenceAccuracyLabel(confidence);
                const accuracyFill = Math.min(1, Math.max(0.08, confidence));
                const wageConfLabel = accuracyLabel === "高い" ? "高" : accuracyLabel;

                // SVG アイコン群
                const IcAi = ({ s = 36 }) => (
                    <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
                        <defs>
                            <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="var(--blue)" />
                                <stop offset="100%" stopColor="var(--blue)" />
                            </linearGradient>
                        </defs>
                        <circle cx="24" cy="24" r="20" fill="none" stroke="url(#aiGrad)" strokeWidth="1.4" opacity="0.65" />
                        <circle cx="24" cy="24" r="15" fill="none" stroke="url(#aiGrad)" strokeWidth="1.2" opacity="0.35" />
                        <path d="M24 11c-3.2 0-6 2-7.2 5-2.6.7-4.5 3-4.5 5.8 0 1.5.5 2.8 1.3 3.9-.4.9-.6 1.8-.6 2.8 0 3.8 3 6.8 6.8 6.8.6 0 1.1-.1 1.7-.2 1.1 1.4 2.8 2.3 4.7 2.3 3.3 0 6-2.7 6-6 0-.2 0-.4 0-.7 2.1-.9 3.5-2.9 3.5-5.3 0-2.6-1.7-4.8-4.1-5.5C30.6 14 27.6 11 24 11z"
                            fill="none" stroke="url(#aiGrad)" strokeWidth="1.6" />
                        <text x="24" y="28" textAnchor="middle" fontSize="9" fontWeight="800" fill="url(#aiGrad)" fontFamily={font}>AI</text>
                    </svg>
                );
                const IcGauge = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 18 0" /><path d="M12 12l4-3" /><circle cx="12" cy="12" r="1.2" fill={c} stroke="none" /></svg>);
                const IcShield = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.5-8 9-4.6-.5-8-4.5-8-9V6l8-3z" /></svg>);
                const IcCross = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>);
                const IcArrowFwd = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>);
                const IcClock = ({ c, s = 12 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>);
                const IcInfo = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
                const IcChevron = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>);
                // 詳細スタッツ用
                const IcCircleDot = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" fill={c} stroke="none" /></svg>);
                const IcMochi = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="9" cy="9" r="3.5" /><circle cx="15" cy="13" r="3.5" /><circle cx="10" cy="15" r="3" /></svg>);
                const IcBalls = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16h14l-1 4H6z" /><circle cx="9" cy="11" r="2" /><circle cx="13" cy="10" r="2" /><circle cx="15" cy="13" r="2" /></svg>);
                const IcLight = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
                const IcRot = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>);
                const IcFlame = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1 4 5 4 5 9a5 5 0 0 1-10 0c0-3 2-4 2-7 1 2 3 2 3-2z" /></svg>);
                const IcPercent = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M5 19L19 5" /></svg>);
                const IcDice = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill={c} stroke="none" /><circle cx="15" cy="9" r="1" fill={c} stroke="none" /><circle cx="9" cy="15" r="1" fill={c} stroke="none" /><circle cx="15" cy="15" r="1" fill={c} stroke="none" /></svg>);
                const IcCoin = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /><path d="M9 9h4a2 2 0 0 1 0 4H9zM9 17h6M9 9v8" /></svg>);
                const IcInv = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16v12H4z" /><path d="M4 10h16M8 7V4h8v3" /></svg>);
                const IcSwap = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h12l-3-3M20 16H8l3 3" /></svg>);

                // 分析サマリーのチェックリスト（瞬間理解UI）
                const aiChecklist = [
                    {
                        kind: bDiff >= 0 ? "ok" : "ng",
                        text: <>ボーダーを <strong style={{ color: bDiff >= 0 ? "var(--green)" : "var(--red)", fontWeight: 800 }}>{sp(bDiff, 1)}回</strong> {bDiff >= 0 ? "上回っています" : "下回っています"}</>,
                    },
                    {
                        kind: evEff.ev1K > 0 ? "ok" : "ng",
                        text: evEff.ev1K > 0 ? "現状はプラス期待値です" : "現状はマイナス期待値です",
                    },
                    confidence < 0.3
                        ? { kind: "warn", text: "まだ初期判定（試行浅）" }
                        : { kind: "ok", text: `信頼度 ${Math.round(confidence * 100)}% で判定継続中` },
                    { kind: "target", text: nextDecisionText },
                ];


                // チェック / 警告 / 注視 / ターゲット 用アイコン
                const IcOk = ({ s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>);
                const IcNg = ({ s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18" /></svg>);
                const IcWarn = ({ s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l10 17H2z" /><path d="M12 10v5M12 18.5v.5" /></svg>);
                const IcTarget = ({ s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="var(--blue)" stroke="none" /></svg>);

                // 数値はすべて常時表示し、説明だけを必要に応じて別画面で確認できる構成にする。
                const CollapseRow = ({ num, title }) => (
                    <div style={{
                        width: "100%",
                        padding: "12px 14px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        minHeight: 42,
                    }}>
                        <span style={cardNumDot()}>{num}</span>
                        <span style={{ ...cardTitleStyle(), fontSize: 12.5 }}>{title}</span>
                    </div>
                );

                return (
                    <>
                    <div className="rec-ios-scroll" style={{
                        flex: 1, overflowY: "auto",
                        padding: "10px 12px",
                        // ModeTabBar とセーフエリア分だけ確保する（画面を覆う固定カードは置かない）。
                        paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
                        background: "var(--bg)",
                    }}>
                        {/* ============================ */}
                        {/* 常時表示エリア（1〜4）       */}
                        {/* ============================ */}

                        {/* 1. 分析サマリー — チェックリスト型 */}
                        <div className="data-card" style={dataCardStyle()}>
                            <div style={{ ...cardHeaderStyle(), paddingBottom: 4 }}>
                                <span style={cardNumDot()}>1</span>
                                <span style={cardTitleStyle()}>分析サマリー</span>
                            </div>
                            {(
                                <div className="data-collapse-body">
                                    <div style={{ display: "flex", gap: 12, padding: "0 14px 12px", alignItems: "flex-start" }}>
                                        <div style={{
                                            flexShrink: 0, width: 56, height: 56, borderRadius: 14,
                                            background: "radial-gradient(circle at 30% 30%, rgba(10,132,255,0.22), rgba(10,132,255,0.04) 70%)",
                                            border: "1px solid rgba(10,132,255,0.45)",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            boxShadow: "0 0 14px rgba(10,132,255,0.16)",
                                        }}>
                                            <IcAi s={36} />
                                        </div>
                                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                                            {aiChecklist.map((item, i) => (
                                                <div key={i} style={{
                                                    display: "flex", alignItems: "center", gap: 8,
                                                    fontSize: 12, lineHeight: 1.4,
                                                    color: C.text,
                                                    fontFamily: font,
                                                    minHeight: 22,
                                                }}>
                                                    <span style={{
                                                        flexShrink: 0,
                                                        width: 18, height: 18, borderRadius: "50%",
                                                        background:
                                                            item.kind === "ok" ? "rgba(33,217,155,0.16)" :
                                                                item.kind === "ng" ? "rgba(255,90,95,0.16)" :
                                                                    item.kind === "warn" ? "rgba(255,176,32,0.18)" :
                                                                        "rgba(10,132,255,0.16)",
                                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                                    }}>
                                                        {item.kind === "ok" && <IcOk s={11} />}
                                                        {item.kind === "ng" && <IcNg s={11} />}
                                                        {item.kind === "warn" && <IcWarn s={11} />}
                                                        {item.kind === "target" && <IcTarget s={11} />}
                                                    </span>
                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, padding: "0 14px 14px" }}>
                                        {/* 信頼度ランク */}
                                        <div style={subCardStyle()}>
                                            <div style={subCardLabel()}>{DECISION_TERMS.confidenceLevel}</div>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--yellow)", fontFamily: font, marginBottom: 4 }}>{accuracyLabel}</div>
                                            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                                                {[0, 1, 2, 3, 4].map((i) => (
                                                    <span key={i} style={{
                                                        flex: 1, height: 3, borderRadius: 2,
                                                        background: i < Math.max(1, Math.round(accuracyFill * 5)) ? "var(--yellow)" : "var(--surface-alt)",
                                                    }} />
                                                ))}
                                            </div>
                                        </div>
                                        {/* 信頼度 */}
                                        <div style={subCardStyle()}>
                                            <div style={subCardLabel()}>信頼度</div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                <span style={{
                                                    width: 14, height: 14, borderRadius: "50%",
                                                    background: "radial-gradient(circle, #c084fc 0%, #7c3aed 70%)",
                                                    boxShadow: "0 0 6px rgba(192,132,252,0.6)",
                                                    flexShrink: 0,
                                                }} />
                                                <span style={{ fontSize: 15, fontWeight: 800, color: "var(--purple)", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                                                    {Math.round(confidence * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                        {/* 次の判断ライン */}
                                        <div style={subCardStyle()}>
                                            <div style={subCardLabel()}>
                                                <IcCross c="var(--blue)" s={11} />
                                                <span style={{ marginLeft: 3 }}>次の判断ライン</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: C.subHi, fontFamily: font, fontWeight: 600, lineHeight: 1.35 }}>
                                                {nextDecisionText}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2 + 3. 1Kスタート / 想定時給 */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            {/* 2. 1Kスタート */}
                            <div style={dataCardStyle()}>
                                <div style={cardHeaderStyle()}>
                                    <span style={cardNumDot()}>2</span>
                                    <span style={{ ...cardTitleStyle(), fontSize: 12.5 }}>1Kスタート</span>
                                    <span style={{ marginLeft: "auto", fontSize: 9.5, color: C.sub, fontWeight: 500 }}>（回転率）</span>
                                </div>
                                <div style={{ padding: "0 14px 8px" }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                        <span style={{ fontSize: 34, fontWeight: 800, color: sc(bDiff), fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{f(start1K, 1)}</span>
                                        <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>回/K</span>
                                    </div>
                                    <div style={{ marginTop: 8, fontSize: 10.5, color: C.subHi, fontFamily: font }}>
                                        理論ボーダー：<span style={{ color: C.text, fontWeight: 600 }}>{theoreticalBorder > 0 ? `${f(theoreticalBorder, 1)} 回/K` : "未設定"}</span>
                                    </div>
                                </div>
                                <div style={{
                                    margin: "0 10px 10px", padding: "8px 10px",
                                    background: bDiff >= 0 ? "rgba(33,217,155,0.08)" : "rgba(255,90,95,0.08)",
                                    border: `1px solid ${bDiff >= 0 ? "rgba(33,217,155,0.25)" : "rgba(255,90,95,0.25)"}`,
                                    borderRadius: 10,
                                    display: "flex", alignItems: "center", gap: 6,
                                    fontSize: 10.5, fontFamily: font, color: C.subHi,
                                }}>
                                    <span style={{
                                        width: 16, height: 16, borderRadius: "50%",
                                        background: bDiff >= 0 ? "rgba(33,217,155,0.18)" : "rgba(255,90,95,0.18)",
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                        <IcOk s={9} />
                                    </span>
                                    <span style={{ flex: 1 }}>
                                        ボーダーを <strong style={{ color: bDiff >= 0 ? "var(--green)" : "var(--red)" }}>{sp(bDiff, 1)}回</strong> {bDiff >= 0 ? "上回って" : "下回って"}います
                                    </span>
                                    <IcChevron c={C.sub} s={10} />
                                </div>
                            </div>
                            {/* 3. 想定時給（参考値・低めを強調） */}
                            <div style={dataCardStyle()}>
                                <div style={cardHeaderStyle()}>
                                    <span style={{ ...cardTitleStyle(), fontSize: 12.5 }}>想定時給</span>
                                    <span style={{ marginLeft: 4, fontSize: 9.5, color: C.sub, fontWeight: 500 }}>（参考値）</span>
                                    <span style={{
                                        marginLeft: "auto",
                                        padding: "2px 8px",
                                        background: wageConfLabel === "低" ? "rgba(255,176,32,0.22)" :
                                            wageConfLabel === "中" ? "rgba(10,132,255,0.22)" :
                                                "rgba(33,217,155,0.22)",
                                        border: `1px solid ${wageConfLabel === "低" ? "rgba(255,176,32,0.55)" :
                                            wageConfLabel === "中" ? "rgba(10,132,255,0.55)" :
                                                "rgba(33,217,155,0.55)"}`,
                                        color: wageConfLabel === "低" ? "var(--yellow)" :
                                            wageConfLabel === "中" ? "var(--blue)" : "var(--green)",
                                        borderRadius: 5,
                                        fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
                                    }}>{wageConfLabel}</span>
                                </div>
                                <div style={{ padding: "0 14px 6px" }}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                        <span style={{
                                            fontSize: wageConfLabel === "低" ? 22 : 28,
                                            fontWeight: 800,
                                            color: wage >= 0 ? "var(--green)" : "var(--red)",
                                            fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums",
                                            opacity: wageConfLabel === "低" ? 0.85 : 1,
                                        }}>{sp(wage, 0)}</span>
                                        <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>円/h</span>
                                    </div>
                                </div>
                                <div style={{ padding: "0 12px 10px", fontSize: 9.5, color: C.sub, lineHeight: 1.4 }}>
                                    実測1Kスタートと1時間の通常回転数から算出
                                </div>
                            </div>
                        </div>

                        {/* 4. 時刻に連動する想定仕事量 */}
                        <div style={dataCardStyle()}>
                            <div style={cardHeaderStyle()}>
                                <span style={cardNumDot()}>3</span>
                                <span style={cardTitleStyle()}>時間別の想定仕事量</span>
                                <IcClock c={C.subHi} s={13} />
                            </div>
                            <div style={{ padding: "0 12px 12px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7 }}>
                                {[
                                    { label: "現在まで", time: `${f(netRot)}回転`, value: expectedWork },
                                    {
                                        label: "予定終了まで",
                                        time: targetProjection ? `${timeValueFromDate(targetDeadline)}・残り${formatRemaining(targetProjection.remainingMinutes)}` : "時刻を再設定",
                                        value: targetProjection?.totalWork,
                                    },
                                    {
                                        label: "閉店まで",
                                        time: closeProjection ? `${S.sessionClosingTime}・残り${formatRemaining(closeProjection.remainingMinutes)}` : "閉店済み／未設定",
                                        value: closeProjection?.totalWork,
                                    },
                                ].map((item) => (
                                    <div key={item.label} style={{ background: "var(--surface-hi)", border: "1px solid var(--border)", borderRadius: 11, padding: "9px 7px", minWidth: 0 }}>
                                        <div style={{ fontSize: 8.5, color: C.sub, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
                                        <div style={{ fontSize: 15, color: item.value == null ? C.sub : sc(item.value), fontWeight: 800, fontFamily: mono, whiteSpace: "nowrap" }}>
                                            {item.value == null ? "—" : `${sp(Math.round(item.value))}円`}
                                        </div>
                                        <div style={{ fontSize: 8, color: C.sub, marginTop: 4, lineHeight: 1.35 }}>{item.time}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ padding: "0 14px 12px", fontSize: 9.5, color: C.sub, lineHeight: 1.5 }}>
                                現在までの仕事量に、想定時給 × 残り時間を加算しています。表示値は実データと残り時間のみで計算しています。
                            </div>
                            <div style={{ margin: "0 12px 12px" }}>{scheduleEditorButton}</div>
                            {scheduleEditorModal}
                        </div>

                        {/* 4. 仕事量 vs 実収支 */}
                        <div style={dataCardStyle()}>
                            <CollapseRow num="4" title="仕事量 vs 実収支" />
                            <div style={{ margin: "0 12px 9px", fontSize: 9.5, color: C.sub, lineHeight: 1.45 }}>
                                仕事量は「期待値（理論上積み上がった金額）」です。実際の勝ち負けとは別に表示します。
                            </div>
                            {(
                                <div className="data-collapse-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "0 12px 14px" }}>
                                    {[
                                        { label: "期待値（理論値）", val: expectedWork, color: "var(--green)" },
                                        { label: "実収支（資産増減）", val: actualBalance, color: "var(--blue)" },
                                        { label: "差（期待値 − 実収支）", val: diffExpVsAct, color: diffExpVsAct > 0 ? "var(--red)" : diffExpVsAct < 0 ? "var(--green)" : "var(--sub)", badge: diffExpVsAct > 0 ? "欠損" : diffExpVsAct < 0 ? "余剰" : "想定通り" },
                                    ].map((m, idx) => {
                                        return (
                                            <div key={idx} style={{
                                                background: "var(--surface-hi)",
                                                border: "1px solid var(--border)",
                                                borderRadius: 12,
                                                padding: "10px 8px 6px",
                                                display: "flex", flexDirection: "column",
                                            }}>
                                                <div style={{ fontSize: 9, color: C.sub, fontWeight: 600, fontFamily: font, lineHeight: 1.2, minHeight: 22 }}>{m.label}</div>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 4 }}>
                                                    <span style={{ fontSize: 16, fontWeight: 800, color: m.color, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{sp(m.val, 0)}</span>
                                                    <span style={{ fontSize: 9, color: C.sub, fontWeight: 600 }}>円</span>
                                                </div>
                                                {m.badge && (
                                                    <div style={{
                                                        alignSelf: "flex-start", marginTop: 4,
                                                        padding: "1px 8px", borderRadius: 999,
                                                        background: diffExpVsAct > 0 ? "rgba(255,69,58,0.18)" : diffExpVsAct < 0 ? "rgba(33,217,155,0.18)" : "rgba(107,114,128,0.18)",
                                                        fontSize: 9,
                                                        color: diffExpVsAct > 0 ? "var(--red)" : diffExpVsAct < 0 ? "var(--green)" : "var(--sub)",
                                                        fontWeight: 700, fontFamily: font,
                                                    }}>{m.badge}</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 5. ボーダー差・信頼度の推移 */}
                        <div style={dataCardStyle()}>
                            <CollapseRow num="5" title="ボーダー差・信頼度の推移" />
                            {(
                                <div className="data-collapse-body">
                                    {/* レジェンド */}
                                    <div style={{ display: "flex", gap: 14, padding: "0 14px 6px", fontSize: 10, color: C.subHi, fontFamily: font }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ width: 14, height: 2, background: "var(--green)", borderRadius: 1 }} />
                                            ボーダー差（回/K）
                                        </span>
                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                            <span style={{ width: 14, height: 2, background: "transparent", borderTop: "2px dashed #C084FC", borderRadius: 1 }} />
                                            信頼度（%）
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", padding: "0 8px 8px", gap: 6, alignItems: "stretch" }}>
                                        {/* グラフ本体 — 実データ（trendSeries）から描画。2点未満ならフォールバック案内のみ */}
                                        <div style={{ flex: 1, position: "relative" }}>
                                            {trendSeries.length < 2 ? (
                                                <div style={{
                                                    minHeight: 140,
                                                    display: "flex", flexDirection: "column",
                                                    alignItems: "center", justifyContent: "center",
                                                    textAlign: "center", gap: 6, padding: "20px 12px",
                                                }}>
                                                    <div style={{ fontSize: 12, color: C.text, fontWeight: 800, fontFamily: font }}>データ蓄積中</div>
                                                    <div style={{ fontSize: 11, color: C.sub, fontFamily: font, lineHeight: 1.6 }}>回転を入力すると推移が表示されます</div>
                                                </div>
                                            ) : (() => {
                                                // 横軸＝累計回転数。x 範囲は [最初の点の回転数, 最後の点の回転数]。
                                                const xs = trendSeries.map((p) => p.x);
                                                const xMin = Math.min(...xs);
                                                const xMax = Math.max(...xs);
                                                const xSpan = xMax - xMin;
                                                const xFor = (cum) => xSpan > 0 ? 22 + ((cum - xMin) / xSpan) * 254 : 22 + 254 / 2;
                                                // 左軸：ボーダー差 ±20 回/K（クランプして描画）
                                                const yForB = (v) => 58 - (Math.max(-20, Math.min(20, v)) / 20) * 48;
                                                // 右軸：信頼度 0〜100%
                                                const yForC = (v) => 106 - (Math.max(0, Math.min(100, v)) / 100) * 96;
                                                const lastIdx = trendSeries.length - 1;
                                                const bPath = trendSeries.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.x)},${yForB(p.bDiff)}`).join(" ");
                                                const cPath = trendSeries.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.x)},${yForC(p.confidence * 100)}`).join(" ");
                                                const bLastX = xFor(trendSeries[lastIdx].x);
                                                const bLastY = yForB(trendSeries[lastIdx].bDiff);
                                                const cLastX = xFor(trendSeries[lastIdx].x);
                                                const cLastY = yForC(trendSeries[lastIdx].confidence * 100);
                                                // 回転数の目盛り（最小・中央・最大）
                                                const xTicks = xSpan > 0
                                                    ? [xMin, Math.round((xMin + xMax) / 2), xMax]
                                                    : [xMin];
                                                return (
                                                    <svg viewBox="0 0 280 120" preserveAspectRatio="none" width="100%" height="140" style={{ display: "block" }}>
                                                        {/* グリッド */}
                                                        {[0, 1, 2, 3, 4].map((i) => (
                                                            <line key={i} x1="22" y1={10 + i * 24} x2="278" y2={10 + i * 24} stroke="var(--border)" strokeWidth="1" />
                                                        ))}
                                                        {/* 左軸（ボーダー差 回/K） */}
                                                        {[20, 10, 0, -10, -20].map((v, i) => (
                                                            <text key={v} x="20" y={14 + i * 24} fontSize="7" fill="var(--sub)" textAnchor="end" fontFamily="Inter">{(v > 0 ? "+" : "") + v}</text>
                                                        ))}
                                                        {/* 右軸（信頼度 %） */}
                                                        {[100, 75, 50, 25, 0].map((v, i) => (
                                                            <text key={v} x="280" y={14 + i * 24} fontSize="7" fill="rgba(192,132,252,0.6)" textAnchor="start" fontFamily="Inter">{v}%</text>
                                                        ))}
                                                        {/* ボーダー差ライン（緑実線） */}
                                                        <g>
                                                            <path d={bPath} stroke="var(--green)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                                            {trendSeries.slice(0, -1).map((p, i) => (
                                                                <circle key={i} cx={xFor(p.x)} cy={yForB(p.bDiff)} r="1.8" fill="var(--green)" />
                                                            ))}
                                                            {/* 現在点 — パルス + 発光 */}
                                                            <circle cx={bLastX} cy={bLastY} r="4" fill="var(--green)" opacity="0.35" className="data-pulse-ring" />
                                                            <circle cx={bLastX} cy={bLastY} r="3" fill="var(--green)" stroke="#fff" strokeWidth="1" />
                                                        </g>
                                                        {/* 信頼度ライン（紫点線） */}
                                                        <g>
                                                            <path d={cPath} stroke="var(--purple)" strokeWidth="1.6" fill="none" strokeDasharray="3 2" strokeLinecap="round" strokeLinejoin="round" />
                                                            {trendSeries.slice(0, -1).map((p, i) => (
                                                                <circle key={i} cx={xFor(p.x)} cy={yForC(p.confidence * 100)} r="1.6" fill="var(--purple)" />
                                                            ))}
                                                            {/* 現在点 — パルス */}
                                                            <circle cx={cLastX} cy={cLastY} r="3.5" fill="var(--purple)" opacity="0.35" className="data-pulse-ring" />
                                                            <circle cx={cLastX} cy={cLastY} r="2.6" fill="var(--purple)" stroke="#fff" strokeWidth="0.8" />
                                                        </g>
                                                        {/* 横軸（回転数目盛り） */}
                                                        {xTicks.map((t, i) => (
                                                            <text key={i} x={xFor(t)} y="118" fontSize="7" fill={i === xTicks.length - 1 ? "var(--text)" : "var(--sub)"} fontWeight={i === xTicks.length - 1 ? "700" : "400"} textAnchor="middle" fontFamily="Inter">{f(t)}回転</text>
                                                        ))}
                                                    </svg>
                                                );
                                            })()}
                                        </div>
                                        {/* 右側現在値 */}
                                        <div style={{
                                            flex: "0 0 auto", width: 86,
                                            display: "flex", flexDirection: "column", justifyContent: "center", gap: 10,
                                            padding: "0 4px",
                                        }}>
                                            <div style={{ fontSize: 9, color: C.sub, fontFamily: font, fontWeight: 700, letterSpacing: 0.4 }}>現在値</div>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, fontFamily: font }}>ボーダー差</div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--green)", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{sp(bDiff, 1)}<span style={{ fontSize: 9, color: C.sub, marginLeft: 2 }}>回/K</span></div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 9, color: C.sub, fontFamily: font }}>信頼度</div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--purple)", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{Math.round(confidence * 100)}<span style={{ fontSize: 9, color: C.sub, marginLeft: 2 }}>%</span></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 6. 詳細スタッツ — 優先度別レイアウト */}
                        <div style={dataCardStyle()}>
                            <CollapseRow num="6" title="詳細スタッツ" />
                            {(
                                <div className="data-collapse-body" style={{ padding: "0 12px 12px" }}>
                                    {/* 優先度高 - 大きめ 3カード */}
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                                        {[
                                            { Icon: IcCircleDot, color: "var(--green)", label: "単価", val: `${sp(evPerRot, 2)}`, unit: "円/回" },
                                            { Icon: IcMochi, color: "var(--yellow)", label: "非現金比率", val: `${Math.round(nonCashRatio * 1000) / 10}`, unit: "%" },
                                            { Icon: IcBalls, color: "var(--purple)", label: "1R平均出玉", val: f(avg1R, 0), unit: "玉" },
                                        ].map((m, i) => (
                                            <div key={i} style={{
                                                background: "var(--surface-hi)",
                                                border: "1px solid var(--border)",
                                                borderRadius: 12,
                                                padding: "10px 10px 8px",
                                                display: "flex", flexDirection: "column", gap: 4,
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 5, color: C.sub, fontSize: 9.5, fontWeight: 600, fontFamily: font }}>
                                                    <m.Icon c={m.color} s={12} />
                                                    <span>{m.label}</span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 2, marginTop: 2 }}>
                                                    <span style={{ fontSize: 17, fontWeight: 800, color: m.color, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{m.val}</span>
                                                    <span style={{ fontSize: 9.5, color: C.sub, fontWeight: 600 }}>{m.unit}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* 優先度低 - 小さめ行リスト */}
                                    <div style={{ display: "flex", flexDirection: "column", background: "var(--surface-hi)", borderRadius: 10, padding: "2px 8px" }}>
                                        {[
                                            { Icon: IcLight, color: "var(--sub)", label: "初当たり確率（実測）", val: firstHitRateLabel, unit: "" },
                                            { Icon: IcRot, color: "var(--sub)", label: "通常回転数", val: f(netRot), unit: "回" },
                                            { Icon: IcPercent, color: "var(--sub)", label: "初当たり回数", val: `${jpCount}`, unit: "回" },
                                            { Icon: IcFlame, color: "var(--sub)", label: "総大当たり回数", val: `${totalHits}`, unit: "回" },
                                        ].map((r, i, arr) => (
                                            <div key={i} style={{
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                padding: "7px 2px",
                                                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
                                                    <r.Icon c={r.color} s={12} />
                                                    <span style={{ fontSize: 10.5, color: C.subHi, fontFamily: font, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "baseline", gap: 2, flexShrink: 0 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{r.val}</span>
                                                    {r.unit && <span style={{ fontSize: 9, color: C.sub }}>{r.unit}</span>}
                                                    <IcChevron c={C.sub} s={10} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 7. 計算根拠 */}
                        <div style={dataCardStyle()}>
                            <CollapseRow num="7" title="計算根拠" />
                            {(
                                <div className="data-collapse-body">
                                    <div style={{ fontSize: 9.5, color: C.sub, fontFamily: font, margin: "0 14px 4px" }}>常に表示しています</div>
                                    <div style={{ display: "flex", flexDirection: "column", padding: "0 8px 4px" }}>
                                        {[
                                            { Icon: IcDice, color: "var(--green)", label: "初当たり確率（実測）", val: firstHitRateLabel },
                                            { Icon: IcBalls, color: "var(--blue)", label: "1R平均表記出玉", val: `${f(avg1R, 0)} 玉` },
                                            { Icon: IcMochi, color: "var(--blue)", label: "持ち玉（現在）", val: `${f(currentBalls)} 玉` },
                                            { Icon: IcCoin, color: "var(--green)", label: "現金投資", val: `${f(totalInvestActual)} 円` },
                                            { Icon: IcMochi, color: "var(--purple)", label: "貯玉増減", val: `${sp((Number(S.currentChodama) || 0) - (Number(S.initialChodama) || 0))} 玉` },
                                            ...(Number(S.carriedInYen) > 0 ? [{ Icon: IcCoin, color: "var(--yellow)", label: "持込玉コスト", val: `${f(S.carriedInYen)} 円` }] : []),
                                            { Icon: IcSwap, color: "var(--blue)", label: "交換率", val: `${f(exRate, 2)} 円/玉` },
                                            { Icon: IcInv, color: "var(--red)", label: "再プレイ上限", val: replayLimitLabel },
                                        ].map((r, i, arr) => (
                                            <div key={i} style={{
                                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                                padding: "8px 6px",
                                                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
                                                    <r.Icon c={r.color} s={13} />
                                                    <span style={{ fontSize: 11, color: C.subHi, fontFamily: font, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                                                </div>
                                                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{r.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="b" style={{
                                        margin: "6px 10px 10px", padding: "10px",
                                        background: "rgba(10,132,255,0.08)",
                                        border: "1px solid rgba(10,132,255,0.28)",
                                        borderRadius: 10,
                                        color: "var(--blue)", fontSize: 11.5, fontWeight: 700, fontFamily: font,
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                        cursor: "pointer", width: "calc(100% - 20px)",
                                    }} onClick={() => setShowGraphModal(true)}>
                                        すべての計算根拠を見る
                                        <IcArrowFwd c="var(--blue)" s={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Undo controls inline at the bottom */}
                        <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
                            <UndoControls S={S} />
                        </div>
                    </div>

                    </>
                );
            })()}

            {/* 機種設定タブ */}
            {S.sessionSubTab === "settings" && (
                <div className="rec-ios-scroll" style={{ flex: 1, overflowY: "auto", padding: "12px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
                    {/* 機種情報カード */}
                    <Card>
                        <SectionHeader label="機種情報" />
                        <div style={{ display: "flex", gap: 14, padding: "0 16px 14px", alignItems: "center" }}>
                            <MachinePlaceholder active={!!S.machineName} />
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 6 }}>
                                <div style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>機種名</div>
                                <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {S.machineName || "未設定"}
                                </div>
                                {S.machineName && (
                                    <span style={{
                                        display: "inline-block", alignSelf: "flex-start",
                                        fontSize: 11, fontWeight: 700, fontFamily: font,
                                        padding: "4px 10px", borderRadius: 999,
                                        background: `color-mix(in srgb, ${C.purple} 14%, transparent)`,
                                        color: C.purple,
                                        border: `1px solid color-mix(in srgb, ${C.purple} 28%, transparent)`,
                                    }}>
                                        {currentMachineType || "パチンコ"}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "12px 16px 14px", borderTop: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                    合成確率<InfoIcon size={12} color={C.sub} />
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>1/{S.synthDenom}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                    1Rあたり出玉<InfoIcon size={12} color={C.sub} />
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{S.spec1R}玉</div>
                            </div>
                        </div>
                    </Card>

                    {/* 交換率・貸玉カード */}
                    <Card>
                        <SectionHeader label="交換率・貸玉" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "4px 12px 14px" }}>
                            <SettingPill
                                gradient={`linear-gradient(135deg, ${C.purple} 0%, #6c4ff5 100%)`}
                                icon={<CoinIcon />}
                                label="貸玉数"
                                value={`${S.rentBalls}玉/K`}
                                mono
                            />
                            <SettingPill
                                gradient={`linear-gradient(135deg, ${C.teal} 0%, ${C.green} 100%)`}
                                icon={<SwapIcon />}
                                label="交換率"
                                value={`${S.exRate}玉/K`}
                                mono
                            />
                        </div>
                    </Card>

                    {/* 店舗・台番号カード */}
                    <Card>
                        <SectionHeader label="店舗・台番号" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "4px 12px 14px" }}>
                            <SettingPill
                                gradient={`linear-gradient(135deg, ${C.blue} 0%, #1d4fd0 100%)`}
                                icon={<StoreIcon />}
                                label="店舗"
                                value={S.storeName || "未設定"}
                            />
                            <SettingPill
                                gradient={`linear-gradient(135deg, ${C.blue} 0%, #1d4fd0 100%)`}
                                icon={<HashIcon />}
                                label="台番号"
                                value={S.machineNum || "未設定"}
                            />
                        </div>
                    </Card>

                    {/* 編集ボタン */}
                    <button
                        className="b"
                        onClick={() => {
                            setEditStore(S.storeName || "");
                            setEditMachineNum(S.machineNum || "");
                            setEditMachineName(S.machineName || "");
                            setEditSynthDenom(S.synthDenom != null ? String(S.synthDenom) : "");
                            setEditSpec1R(S.spec1R != null ? String(S.spec1R) : "");
                            setEditRentBalls(S.rentBalls != null ? String(S.rentBalls) : "");
                            setEditExRate(S.exRate != null ? String(S.exRate) : "");
                            setEditMachineQuery("");
                            setEditError("");
                            editPickedMachineRef.current = null;
                            setShowEditModal(true);
                        }}
                        style={{
                            width: "100%", padding: "16px", borderRadius: 14,
                            background: "transparent", border: `1px solid ${C.blue}`,
                            color: C.blue, fontSize: 14, fontWeight: 700, fontFamily: font,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                            minHeight: 48, marginBottom: 12,
                        }}
                    >
                        <PencilIcon size={16} color={C.blue} />
                        <span>機種設定を編集する</span>
                    </button>

                    {/* 設定のポイント注釈カード */}
                    <Card style={{
                        background: `color-mix(in srgb, ${C.yellow} 8%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${C.yellow} 22%, transparent)`,
                        padding: 14,
                        marginBottom: 0,
                    }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                            <LightbulbIcon size={20} color={C.yellow} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 4 }}>設定のポイント</div>
                                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                                    機種設定を正しく行うことで、回転率や期待値の精度が向上します。不明な項目は後から変更できます。
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* 機種設定 編集モーダル */}
            {showEditModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                    <div className="card-premium" style={{ width: "100%", maxWidth: 360, maxHeight: "85vh", overflowY: "auto" }}>
                        <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
                            <h2 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>機種設定を編集</h2>
                            <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>項目を更新して保存してください</p>
                        </div>

                        <div style={{ padding: 18 }}>
                            {/* 店舗 */}
                            <div style={{ marginBottom: 14, position: "relative" }}>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>店舗</div>
                                <div style={{ position: "relative" }}>
                                    <input
                                        type="text"
                                        value={editStore}
                                        onChange={e => setEditStore(e.target.value)}
                                        placeholder="店舗名を入力"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px 40px 14px 14px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }}
                                    />
                                    {(S.stores || []).length > 0 && (
                                        <button className="b" onClick={() => setEditStoreDD(!editStoreDD)} style={{
                                            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                            background: "var(--surface-hi)", border: "none", color: C.sub, fontSize: 12, padding: "6px 8px", borderRadius: 6
                                        }}>▼</button>
                                    )}
                                </div>
                                {editStoreDD && (S.stores || []).length > 0 && (
                                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 150, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                        {(S.stores || []).map((st, i) => {
                                            const name = typeof st === "object" ? st.name : st;
                                            return (
                                                <button key={(st && st.id) || i} className="b" onClick={() => {
                                                    setEditStore(name);
                                                    if (typeof st === "object") {
                                                        if (st.rentBalls) setEditRentBalls(String(st.rentBalls));
                                                        if (st.exRate) setEditExRate(String(st.exRate));
                                                    }
                                                    setEditStoreDD(false);
                                                }} style={{
                                                    width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                    color: C.text, fontSize: 14, padding: "12px 14px", textAlign: "left", fontFamily: font
                                                }}>
                                                    {name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* 機種 */}
                            <div style={{ marginBottom: 12, position: "relative" }}>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>機種</div>
                                <input
                                    type="text"
                                    value={editMachineName}
                                    onChange={e => { setEditMachineName(e.target.value); setEditMachineQuery(e.target.value); editPickedMachineRef.current = null; setEditMachineDD(true); }}
                                    onFocus={() => setEditMachineDD(true)}
                                    placeholder="機種名を検索 / 入力"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }}
                                />
                                {editMachineDD && editMachineResults.length > 0 && (
                                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                        {editMachineResults.map((m, i) => (
                                            <button key={m.id || i} className="b" onClick={() => {
                                                setEditMachineName(m.name);
                                                if (m.synthProb != null) setEditSynthDenom(String(m.synthProb));
                                                if (m.spec1R != null) setEditSpec1R(String(m.spec1R));
                                                editPickedMachineRef.current = {
                                                    specAvgRounds: m.specAvgTotalRounds,
                                                    specSapo: m.specSapo,
                                                    yutimeSession: createYutimeSessionFromMachine(m, { assumedStart1K: m.border1K || S.border }),
                                                };
                                                setEditMachineDD(false);
                                                setEditMachineQuery("");
                                            }} style={{
                                                width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                padding: "12px 14px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center"
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.name}</div>
                                                    <div style={{ fontSize: 10, color: C.sub }}>{m.maker || ""} {m.type ? `| ${m.type}` : ""}</div>
                                                </div>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow, fontFamily: mono }}>{m.prob || `1/${m.synthProb}`}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 台番号・合成確率 */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>台番号</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={editMachineNum}
                                        onChange={e => setEditMachineNum(e.target.value)}
                                        placeholder="例: 123"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>合成確率 (1/?)</div>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editSynthDenom}
                                        onChange={e => setEditSynthDenom(e.target.value)}
                                        placeholder="319.6"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.yellow, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>
                            </div>

                            {/* 1Rあたり出玉 */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>1Rあたり出玉 (玉)</div>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={editSpec1R}
                                    onChange={e => setEditSpec1R(e.target.value)}
                                    placeholder="140"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.teal, fontFamily: mono, outline: "none", textAlign: "center" }}
                                />
                            </div>

                            {/* 貸玉レート・交換率プリセット
                                4円 / 2円 / 1円 / 0.5円 対応。プリセットをタップすると貸玉数と交換率（等価既定）を一括更新。
                                個別の数値入力は下に従来どおり残し、カスタム交換率もそのまま入力可能。 */}
                            {(() => {
                                const RENT_PRESETS = PACHINKO_RATE_PRESETS.map((preset) => ({
                                    label: preset.label,
                                    rb: preset.rentBalls,
                                }));
                                const EX_PRESETS_BY_RB = {
                                    250: [
                                        { label: "等価", v: 250 },
                                        { label: "3.57円", v: 280 },
                                        { label: "3.3円", v: 303 },
                                        { label: "2.5円", v: 400 },
                                    ],
                                    500: [
                                        { label: "等価", v: 500 },
                                        { label: "1.8円", v: 556 },
                                        { label: "1.6円", v: 625 },
                                    ],
                                    1000: [
                                        { label: "等価", v: 1000 },
                                        { label: "0.9円", v: 1111 },
                                        { label: "0.8円", v: 1250 },
                                    ],
                                    2000: [
                                        { label: "等価", v: 2000 },
                                        { label: "0.45円", v: 2222 },
                                    ],
                                };
                                const rbNum = Number(String(editRentBalls).replace(",", ".").trim());
                                const exPresets = EX_PRESETS_BY_RB[rbNum] || EX_PRESETS_BY_RB[250];
                                const chipStyle = (active) => ({
                                    flexShrink: 0,
                                    background: active ? C.blue : "var(--surface-hi)",
                                    color: active ? "#fff" : C.text,
                                    border: "none",
                                    borderRadius: 999,
                                    padding: "8px 14px",
                                    fontSize: 12, fontWeight: 700,
                                    fontFamily: font,
                                    minHeight: 36,
                                    whiteSpace: "nowrap",
                                });
                                return (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貸玉レート</div>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                            {RENT_PRESETS.map(p => {
                                                const active = rbNum === p.rb;
                                                return (
                                                    <button
                                                        key={p.rb}
                                                        className="b"
                                                        onClick={() => {
                                                             setEditRentBalls(String(p.rb));
                                                             // 貸玉レート変更時は等価交換率を既定としてセット（その後ユーザが交換率チップで上書き可能）
                                                             setEditExRate(String(p.rb));
                                                        }}
                                                        style={chipStyle(active)}
                                                    >
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>交換率プリセット</div>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                                            {exPresets.map(p => {
                                                const active = Number(String(editExRate).replace(",", ".").trim()) === p.v;
                                                return (
                                                    <button
                                                        key={p.v}
                                                        className="b"
                                                        onClick={() => setEditExRate(String(p.v))}
                                                        style={chipStyle(active)}
                                                    >
                                                        {p.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* 貸玉数・交換率（数値入力 — カスタム値や微調整用） */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貸玉数 (玉/K)</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={editRentBalls}
                                        onChange={e => setEditRentBalls(e.target.value)}
                                        placeholder="250"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>交換率 (玉/K)</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={editExRate}
                                        onChange={e => setEditExRate(e.target.value)}
                                        placeholder="250"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>
                            </div>

                            {editError && (
                                <div className="error-msg" style={{ marginBottom: 12 }}>{editError}</div>
                            )}

                            {/* ボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <button className="b" onClick={() => setShowEditModal(false)} style={{
                                    background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`, borderRadius: 14, color: C.text, fontSize: 15, fontWeight: 700, padding: "16px 0", fontFamily: font
                                }}>キャンセル</button>
                                 <button className="b btn-premium btn-secondary" onClick={() => {
                                    const parseNum = v => Number(String(v).replace(",", ".").trim());
                                    const synth = parseNum(editSynthDenom);
                                    const r1 = parseNum(editSpec1R);
                                    const rb = parseNum(editRentBalls);
                                    const ex = parseNum(editExRate);
                                     if (!Number.isFinite(synth) || synth <= 0 ||
                                        !Number.isFinite(r1) || r1 <= 0 ||
                                        !Number.isFinite(rb) || rb <= 0 ||
                                        !Number.isFinite(ex) || ex <= 0) {
                                        setEditError("合成確率・1R出玉・貸玉数・交換率を正しく入力してください");
                                         return;
                                     }
                                     if (S.requestSessionContextChange?.(["店舗", "機種", "機種スペック", "貸玉", "交換率"])) return;
                                     S.setStoreName((editStore || "").trim());
                                    S.setMachineNum((editMachineNum || "").trim());
                                    S.setMachineName((editMachineName || "").trim());
                                    S.setSynthDenom(synth);
                                    S.setSpec1R(r1);
                                    S.setRentBalls(rb);
                                    S.setExRate(ex);
                                    // 玉単価（円/玉）は交換率から導出して同期する。
                                    // 1円・0.5円パチンコでも YutimeEvCard / 詳細データの「交換率」表示が
                                    // 正しい値になるように、ballVal を exRate と整合させる。
                                    S.setBallVal(1000 / ex);
                                    const picked = editPickedMachineRef.current;
                                    if (picked) {
                                        if (picked.specAvgRounds != null) S.setSpecAvgRounds(picked.specAvgRounds);
                                        if (picked.specSapo != null) S.setSpecSapo(picked.specSapo);
                                    }
                                    S.setYutimeSession(picked?.yutimeSession || null);
                                    S.setYutimeDecision(null);
                                    setEditError("");
                                    setShowEditModal(false);
                                }}>
                                    保存
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Move Modal */}
            {showMoveModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, maxHeight: "calc(100dvh - 40px)", overflowY: "auto", padding: 20 }}>
                        <SecLabel label="台移動" />
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
                            現在のデータを保存して新しい台へ移動します。<br />
                            移動先の機種・持ち玉を入力してください。
                        </div>
                        {/* 移動先の機種名（稼働開始と同じ機種選択画面で選ぶ。同じ機種なら空のままでOK） */}
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>移動先の機種名</div>
                            <button
                                className="b"
                                onClick={() => { setMachineQuery(""); setPickerFilter("all"); setPickerSort("default"); setMachinePickerFor("move"); setShowMachinePicker(true); }}
                                style={{
                                    width: "100%", boxSizing: "border-box",
                                    background: C.bg, border: `2px solid ${C.borderHi}`,
                                    borderRadius: 12, padding: "12px 14px",
                                    fontSize: 16, color: moveMachineName ? C.text : C.sub,
                                    fontFamily: font, textAlign: "left",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                    cursor: "pointer",
                                }}
                            >
                                <span>{moveMachineName || "機種を選択..."}</span>
                                <span style={{ color: C.sub, fontSize: 14 }}>›</span>
                            </button>
                        </div>
                        {/* 移動先の台番号・開始回転数 */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>移動先の台番号</div>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={moveMachineNum}
                                    onChange={e => setMoveMachineNum(e.target.value)}
                                    placeholder="例: 123"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                />
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>開始回転数</div>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={moveStartRot}
                                    onChange={e => {
                                        setMoveStartRot(e.target.value);
                                        clearMoveYutimeTarget();
                                    }}
                                    placeholder="0"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: moveYutimeTarget ? `${C.blue}14` : C.surfaceHi, border: `1px solid ${moveYutimeTarget ? `${C.blue}66` : C.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: moveYutimeTarget ? C.blue : C.text, fontWeight: 800 }}>遊タイム狙い（任意）</div>
                                    <div style={{ marginTop: 2, fontSize: 9, color: C.sub }}>狙う場合だけ計算条件を設定します</div>
                                </div>
                                {moveYutimeTarget && (
                                    <button type="button" className="b" onClick={clearMoveYutimeTarget} style={{ minHeight: 36, padding: "6px 10px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg, color: C.sub, fontSize: 10, fontWeight: 700 }}>
                                        解除
                                    </button>
                                )}
                            </div>
                            {moveYutimeTarget && (
                                <div style={{ marginBottom: 8, color: C.sub, fontSize: 10, lineHeight: 1.55 }}>
                                    開始 {moveYutimeTarget.currentLowSpins.toLocaleString()}回 ・ 想定1K {moveYutimeTarget.assumedStart1K || "—"}回/K ・ {moveYutimeTarget.pachinkoRateLabel || "4円"}パチンコ
                                    <br />発動 {moveYutimeTarget.session.triggerLowSpins.toLocaleString()}回 ・ {moveYutimeTarget.decision?.result?.valid ? `期待値 ${Math.round(moveYutimeTarget.decision.result.selectedEV).toLocaleString()}円` : "期待出玉などの確認が必要"}
                                </div>
                            )}
                            <button
                                type="button"
                                className="b"
                                disabled={!moveMachineName.trim()}
                                onClick={() => setShowMoveYutimeCalculator(true)}
                                style={{ width: "100%", minHeight: 44, borderRadius: 10, border: `1px solid ${C.blue}`, background: moveMachineName.trim() ? `${C.blue}1f` : C.bg, color: moveMachineName.trim() ? C.blue : C.sub, fontSize: 12, fontWeight: 800, opacity: moveMachineName.trim() ? 1 : 0.55 }}
                            >
                                {moveYutimeTarget ? "遊タイム条件を変更" : "遊タイム狙いを設定"}
                            </button>
                            {!moveMachineName.trim() && <div style={{ marginTop: 6, color: C.sub, fontSize: 9 }}>先に移動先の機種を選択してください</div>}
                        </div>
                        <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>移動前の持ち玉（玉）</div>
                            <NI v={moveMochiBalls} set={setMoveMochiBalls} w="100%" center ph="0" />
                        </div>
                        {/* 貯玉遊技中は残りの貯玉を次台へ自動で引き継ぐ旨を明示（入力不要・確認のみ） */}
                        {Number(S.currentChodama) > 0 && (
                            <div style={{ marginBottom: 14, padding: "10px 12px", background: C.surfaceHi, borderRadius: 10, border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 11, color: C.purple, fontWeight: 700, lineHeight: 1.5 }}>
                                    貯玉 {f(S.currentChodama)}玉は次の台へ自動で引き継がれます
                                </div>
                            </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <Btn label={moveSubmitState === "needsAttention" ? "閉じる" : "キャンセル"} onClick={closeMoveModal} disabled={moveSubmitState === "processing"} />
                            <Btn label={moveSubmitState === "processing" ? "移動中…" : moveSubmitState === "needsAttention" ? "確認が必要です" : "移動する"} onClick={handleMoveConfirm} disabled={moveSubmitState !== "idle"} bg={C.purple} fg="#fff" bd="none" />
                        </div>
                        {moveSubmitError && <div role="alert" style={{ color: C.red, fontSize: 11, lineHeight: 1.5, marginTop: 10 }}>{moveSubmitError}</div>}
                    </Card>
                </div>
            )}

            {showMoveYutimeCalculator && (
                <YutimeCalculatorSheet
                    S={S}
                    initialMachineName={moveYutimeTarget?.machineName || moveMachineName}
                    initialSession={moveYutimeTarget?.session || movePickedMachineRef.current?.yutimeSession || null}
                    initialCurrentLowSpins={moveYutimeTarget?.currentLowSpins ?? Math.max(0, Math.round(Number(moveStartRot) || 0))}
                    initialStart1K={moveYutimeTarget?.assumedStart1K || movePickedMachineRef.current?.yutimeSession?.assumedStart1K || null}
                    confirmLabel="この条件を台移動に設定"
                    onConfirm={(confirmation) => {
                        const selected = confirmation.selectedMachine;
                        const selectedSpec = confirmation.machineSpec;
                        setMoveMachineName(confirmation.machineName);
                        setMoveStartRot(String(confirmation.currentLowSpins));
                        movePickedMachineRef.current = {
                            ...(movePickedMachineRef.current || {}),
                            ...(selected?.synthProb > 0 ? { synthDenom: selected.synthProb } : {}),
                            ...(selectedSpec?.spec1R != null ? { spec1R: selectedSpec.spec1R } : {}),
                            ...(selectedSpec?.specAvgRounds != null ? { specAvgRounds: selectedSpec.specAvgRounds } : {}),
                            ...(selectedSpec?.specSapo != null ? { specSapo: selectedSpec.specSapo } : {}),
                            rentBalls: confirmation.rentBalls,
                            exRate: confirmation.exRate,
                            investPace: confirmation.investPace,
                            yutimeSession: confirmation.session,
                            yutimeLowSpins: confirmation.currentLowSpins,
                        };
                        setMoveYutimeTarget(confirmation);
                        setShowMoveYutimeCalculator(false);
                    }}
                    onClose={() => setShowMoveYutimeCalculator(false)}
                />
            )}

            {/* 機種選択ボトムシート（台移動モーダルから開く。稼働開始と同じUIを共用） */}
            {renderMachinePicker()}

            {/* 投資ペース設定モーダル */}
            {showInvestSettings && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="1回の記録単位" />
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
                            回転数を記録するたびに使った金額を選びます。現在は1玉 {rentalRateYen.toFixed(2)}円です。
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                            {[100, 200, 500, 1000, 2000].map(pace => {
                                const active = Number(investPace) === pace;
                                return (
                                    <button key={pace} className="b" onClick={() => { S.setInvestPace(pace); setCustomInvestPaceError(""); setShowInvestSettings(false); }} style={{
                                        padding: "11px 4px", borderRadius: 10, fontWeight: 700, fontFamily: mono, fontSize: 14,
                                        background: active ? "#2f6fed" : "var(--surface-hi)",
                                        border: active ? "none" : `1px solid ${C.border}`,
                                        color: active ? "#fff" : C.text,
                                        boxShadow: active ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none"
                                    }}>
                                        <span style={{ display: "block" }}>{pace >= 1000 ? `${pace/1000}K` : `${pace}円`}</span>
                                        <span style={{ display: "block", marginTop: 3, fontSize: 10, opacity: 0.8 }}>{formatBallQuantity(ballsForInvestment(pace, rentBalls))}玉</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ padding: 10, marginBottom: 14, borderRadius: 10, background: C.surfaceHi, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700 }}>その他の金額</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <input
                                    aria-label="1回の記録金額"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={customInvestPace}
                                    onChange={(e) => { setCustomInvestPace(e.target.value.replace(/[^0-9]/g, "")); setCustomInvestPaceError(""); }}
                                    onKeyDown={(e) => { if (e.key === "Enter") applyCustomInvestPace(); }}
                                    placeholder="例: 200"
                                    style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 9, background: C.bg, border: `1px solid ${customInvestPaceError ? C.red : C.borderHi}`, color: C.text, fontSize: 16, fontFamily: mono }}
                                />
                                <button type="button" className="b" onClick={applyCustomInvestPace} style={{ padding: "0 14px", borderRadius: 9, border: "none", background: C.blue, color: "#fff", fontWeight: 800 }}>適用</button>
                            </div>
                            {customInvestPaceError && <div style={{ marginTop: 6, color: C.red, fontSize: 11 }}>{customInvestPaceError}</div>}
                            {Number(customInvestPace) > 0 && (
                                <div style={{ marginTop: 6, color: C.sub, fontSize: 10 }}>
                                    {Number(customInvestPace).toLocaleString()}円 ＝ {formatBallQuantity(ballsForInvestment(customInvestPace, rentBalls))}玉
                                </div>
                            )}
                        </div>
                        <button className="b" onClick={() => { setCustomInvestPaceError(""); setShowInvestSettings(false); }} style={{
                            width: "100%", padding: "12px", background: "var(--surface-hi)", border: `1px solid ${C.border}`,
                            borderRadius: 10, color: C.text, fontSize: 14, fontWeight: 600, fontFamily: font
                        }}>閉じる</button>
                    </Card>
                </div>
            )}

            {/* 累計仕事量グラフモーダル */}
            {showGraphModal && (() => {
                const archives = S.archives || [];
                const points = [];
                let cum = 0;
                archives.forEach((a) => {
                    const w = getEvAmount(a);
                    cum += w;
                    points.push({ label: a.date?.slice(5) || "", value: Math.round(cum) });
                });
                const currentWork = (ev.effectiveWorkAmount ?? ev.workAmount ?? 0)
                    + getYutimeEvAmount({ yutimeDecision: S.yutimeDecision });
                if (currentWork !== 0) {
                    cum += currentWork;
                    points.push({ label: "今日", value: Math.round(cum) });
                }
                return (
                    <div
                        onClick={() => setShowGraphModal(false)}
                        style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
                    >
                        <Card onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, padding: 16 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                                <span style={{ fontSize: 16 }}>📈</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: C.subHi, fontFamily: font }}>累計仕事量の推移</span>
                            </div>
                            {points.length >= 2 ? (
                                <LineChart data={points} color="#a855f7" />
                            ) : (
                                <div style={{ padding: "28px 8px", textAlign: "center", color: C.sub, fontSize: 13, lineHeight: 1.6 }}>
                                    グラフ表示にはデータが2日分以上必要です。<br />セッションを保存すると履歴が蓄積されます。
                                </div>
                            )}
                            <button className="b" onClick={() => setShowGraphModal(false)} style={{
                                width: "100%", marginTop: 12, padding: "12px", background: "var(--surface-hi)",
                                border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14, fontWeight: 600, fontFamily: font
                            }}>閉じる</button>
                        </Card>
                    </div>
                );
            })()}

            {hitWizardOpen && ReactDOM.createPortal(
                (() => {
                    const D = hitWizardData;
                    const isYutimeOrigin = Boolean(D.yutimeRunId);
                    const hitWizardPresentation = getHitWizardPresentation({ playMode: S.playMode, isYutimeOrigin });
                    const focus = hitInputFocus || (isYutimeOrigin ? "rotCount" : "pushAmount");
                    const setFocus = (k) => setHitInputFocus(k);
                    const updField = (key, val) => setHitWizardData(d => ({ ...d, [key]: val }));

                    const numOr0 = (k) => Number(D[k]) || 0;
                    const trayN = numOr0("trayBalls");
                    const rotN = numOr0("rotCount");
                    const dispN = numOr0("displayBalls");
                    const actualN = numOr0("actualBalls");
                    const rndN = numOr0("rounds");
                    const multN = Math.max(1, numOr0("mult") || 1);
                    const roundLabel = rndN > 0 ? (multN > 1 ? `${rndN}R×${multN}` : `${rndN}R`) : "";

                    const requiredOk = rotN > 0 && (isYutimeOrigin || trayN > 0) && rndN > 0;

                    const chainLen = lastChain && !lastChain.completed ? (lastChain.hits || []).length : 0;

                    const evNet = ev && Number.isFinite(ev.totalNetGain) ? ev.totalNetGain : 0;
                    const startG1K = ev && Number.isFinite(ev.start1K) ? ev.start1K : 0;
                    const avg1R = ev && Number.isFinite(ev.avg1R) ? ev.avg1R : 0;
                    const currentRateLabel = formatPachinkoRateLabel(S.rentBalls || 250);

                    const STEPS = [
                        { id: "pushAmount",   num: 1, label: "プッシュ補正額",  sub: `（任意・${currentRateLabel}パチの投資補正）`, short: "補正", color: C.yellow, icon: "coin", summaryUnit: "円" },
                        { id: "rotCount",     num: 2, label: "当たった回転数",  sub: "（はまり・ゲーム数）",      short: "回転数",   color: C.blue,   icon: "rotate", summaryUnit: "回転" },
                        { id: "trayBalls",    num: 3, label: "開始前の玉数",    sub: "（当たり直前の持ち玉・上皿）", short: "開始玉",   color: C.yellow, icon: "coin",   summaryUnit: "玉",  required: true },
                        { id: "rounds",       num: 4, label: "ラウンド数",      sub: "（当たったラウンド 10R・5Rなど）", short: "R数",  color: C.purple, icon: "r",      summaryUnit: "R" },
                        { id: "result",       num: 5, label: "結果を選択",      sub: "（連チャン継続 or 単発終了）", short: "結果",  color: C.orange, icon: "flag",   summaryUnit: "" },
                    ].filter((step) => hitWizardPresentation.showPushStep || step.id !== "pushAmount").map((step, index) => (
                        isYutimeOrigin && step.id === "rotCount"
                            ? { ...step, num: index + 1, label: "遊タイム消化回転数", sub: "遊タイム突入から当たるまでの回転数" }
                            : { ...step, num: index + 1 }
                    ));
                    const stepIdx = Math.max(0, STEPS.findIndex(s => s.id === focus));
                    const curStep = STEPS[stepIdx];
                    const nxtStep = STEPS[stepIdx + 1] || null;
                    const totalSteps = STEPS.length;

                    const stepDisplayValue = (id) => {
                        switch (id) {
                            case "pushAmount": return (D.pushAmount || 0) > 0 ? `+${(D.pushAmount).toLocaleString()}` : "なし";
                            case "rotCount":   return rotN > 0 ? f(rotN) : "";
                            case "trayBalls":  return trayN > 0 ? f(trayN) : "";
                            case "rounds":     return roundLabel;
                            case "displayBalls": return dispN > 0 ? f(dispN) : "";
                            case "actualBalls":  return actualN > 0 ? f(actualN) : "";
                            default: return "";
                        }
                    };
                    const isFilled = (id) => {
                        if (id === "pushAmount") return true; // 0 = なし も入力済み扱い
                        const val = stepDisplayValue(id);
                        return val !== "" && val !== "--";
                    };
                    const filledChips = STEPS.slice(0, stepIdx).filter(s => s.id !== "result" && isFilled(s.id));

                    const keypadField = (curStep.id === "rounds" || curStep.id === "pushAmount" || curStep.id === "result") ? null : curStep.id;

                    const keypadAppend = (n) => {
                        if (!keypadField) return;
                        setHitWizardData(d => {
                            const cur = (d[keypadField] != null ? String(d[keypadField]) : "");
                            const next = cur === "0" || cur === "" ? String(n) : cur + n;
                            return { ...d, [keypadField]: next };
                        });
                    };
                    const keypadClear = () => {
                        if (!keypadField) return;
                        setHitWizardData(d => ({ ...d, [keypadField]: "" }));
                    };
                    const keypadBackspace = () => {
                        if (!keypadField) return;
                        setHitWizardData(d => {
                            const cur = (d[keypadField] != null ? String(d[keypadField]) : "");
                            return { ...d, [keypadField]: cur.slice(0, -1) };
                        });
                    };

                    const onClose = () => {
                        setHitWizardOpen(false);
                        setHitInputError("");
                        setHitInputFocus("pushAmount");
                    };

                    const hasHitInput = (D.pushAmount || 0) > 0 || D.rotCount !== "" || D.trayBalls !== "" || rndN > 0;
                    const onCancel = async () => {
                        if (hasHitInput) {
                            const confirmed = await S.requestConfirmation?.({
                                title: "入力中の内容を破棄しますか？",
                                message: "まだ確定していない大当たり入力は保存されません。",
                                confirmLabel: "破棄して閉じる",
                                tone: "danger",
                            });
                            if (!confirmed) return;
                        }
                        onClose();
                    };

                    const onBack = () => {
                        if (stepIdx > 0) setFocus(STEPS[stepIdx - 1].id);
                    };

                    // 確変=ラッシュ継続
                    const onContinue = () => {
                        if (endLockRef.current) return;
                        if (!requiredOk) {
                            const missing = [];
                            if (rotN <= 0) missing.push("当たった回転数");
                            if (trayN <= 0) missing.push("開始前の玉数");
                            if (rndN <= 0) missing.push("ラウンド数");
                            setHitInputError(`${missing.join("・")}を入力してください`);
                            return;
                        }
                        setHitInputError("");
                        const ok = isYutimeOrigin
                            ? handleStartYutimeChain(D.yutimeRunId, rotN, trayN)
                            : handleStartChain(rotN);
                        if (!ok) return;
                        // チェーン作成成功 → 確変として hit を追加（既存 handleWizardComplete を再利用）
                        handleWizardComplete("確変");
                    };

                    const onSingleEndStart = () => {
                        if (!requiredOk) {
                            const missing = [];
                            if (rotN <= 0) missing.push("当たった回転数");
                            if (trayN <= 0) missing.push("開始前の玉数");
                            if (rndN <= 0) missing.push("ラウンド数");
                            setHitInputError(`${missing.join("・")}を入力してください`);
                            return;
                        }
                        setHitInputError("");
                        // 最終持ち玉のプリセット（簡易フローでは液晶出玉が無いため開始玉を初期値とし、ユーザーが実測を入力）
                        const estimated = trayN;
                        setHitWizardData(d => ({
                            ...d,
                            jitanSpins: d.jitanSpins || "",
                            finalBallsAfterJitan: d.finalBallsAfterJitan || (estimated > 0 ? String(estimated) : "")
                        }));
                        setHitInputSingleEndOpen(true);
                    };

                    // 単発終了モーダルから記録完了
                    const onSingleEndConfirm = () => {
                        if (endLockRef.current) return;
                        const ok = isYutimeOrigin
                            ? handleStartYutimeChain(D.yutimeRunId, rotN, trayN)
                            : handleStartChain(rotN);
                        if (!ok) return;
                        handleWizardComplete("単発");
                        setHitInputSingleEndOpen(false);
                    };

                    // 確定ボタン: 次のステップへ進む。最終ステップ（result）は無効（結果はアクションボタンで選ぶ）
                    const onConfirm = () => {
                        if (stepIdx < STEPS.length - 1) {
                            setFocus(STEPS[stepIdx + 1].id);
                        }
                    };

                    // 「結果」ステップに進むためのバリデーション（必須項目チェック）
                    const canEnterResult = requiredOk;

                    const summaryRows = [
                        { label: "プッシュ補正額", value: (D.pushAmount || 0) > 0 ? `+${(D.pushAmount).toLocaleString()}` : "0", unit: "円" },
                        { label: "当たった回転数", value: rotN > 0 ? f(rotN) : "--",   unit: "回転" },
                        { label: "開始前の玉数",   value: trayN > 0 ? f(trayN) : "--", unit: "玉" },
                        { label: "ラウンド数",     value: roundLabel || "--", unit: multN > 1 ? `（合計${rndN * multN}R）` : "" },
                    ];

                    const pushCorrectionAmounts = getPushCorrectionAmounts(S.rentBalls, S.investPace);
                    const pushPresets = [
                        { label: "なし", onClick: () => updField("pushAmount", 0), active: !D.pushAmount },
                        ...pushCorrectionAmounts.map((amount) => ({
                            label: `+${amount.toLocaleString("ja-JP")}`,
                            onClick: () => updField("pushAmount", amount),
                            active: D.pushAmount === amount,
                        })),
                        { label: "クリア", onClick: () => updField("pushAmount", 0),     active: false },
                    ];

                    const roundPresets = machineRounds.slice(0, 6).map(({ rounds: r, mult: m }) => ({
                        label: m > 1 ? `${r}R×${m}` : `${r}R`,
                        active: rndN === r && multN === m,
                        onClick: () => setHitWizardData(d => ({ ...d, rounds: r, mult: m })),
                    }));
                    const roundLoop = getMachineRoundLoop(selectedMachine, "heso", rndN);

                    const bigValueText = (() => {
                        switch (curStep.id) {
                            case "pushAmount":   return (D.pushAmount || 0) > 0 ? `+${(D.pushAmount).toLocaleString()}` : "0";
                            case "rotCount":     return rotN > 0 ? f(rotN) : "0";
                            case "trayBalls":    return trayN > 0 ? f(trayN) : "0";
                            case "rounds":       return rndN > 0 ? (multN > 1 ? `${rndN}R×${multN}` : `${rndN}`) : "0";
                            case "displayBalls": return dispN > 0 ? f(dispN) : "0";
                            case "actualBalls":  return actualN > 0 ? f(actualN) : "0";
                            default: return "";
                        }
                    })();
                    const bigValueUnit = curStep.id === "pushAmount" ? "円"
                        : curStep.id === "rotCount" ? "回転"
                        : curStep.id === "rounds" ? (multN > 1 ? "" : "R")
                        : curStep.id === "result" ? "" : "玉";

                    const themeColor = C.blue;

                    return (
                        <div className="jp-proto-screen" style={{
                            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: 9999, display: "flex", flexDirection: "column",
                            height: "100dvh", width: "100vw", background: C.bg
                        }}>
                            <div style={{
                                padding: "8px 12px",
                                paddingTop: "max(8px, env(safe-area-inset-top))",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                flexShrink: 0, gap: 8,
                                borderBottom: `1px solid ${C.border}`,
                            }}>
                                {stepIdx > 0 ? (
                                    <button className="b" type="button" onClick={onBack} style={{
                                        background: "transparent", border: "none",
                                        color: C.text, fontSize: 14, fontWeight: 700, fontFamily: font,
                                        padding: "6px 8px", minHeight: 44, minWidth: 44,
                                        display: "flex", alignItems: "center", gap: 4,
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                        戻る
                                    </button>
                                ) : (
                                    <button className="b" type="button" onClick={onCancel} style={{
                                        background: "transparent", border: "none",
                                        color: C.red, fontSize: 14, fontWeight: 700, fontFamily: font,
                                        padding: "6px 8px", minHeight: 44, minWidth: 44,
                                        display: "flex", alignItems: "center", gap: 4,
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        キャンセル
                                    </button>
                                )}
                                <span style={{
                                    fontSize: 16, fontWeight: 800,
                                    color: chainLen > 0 ? C.yellow : C.text, fontFamily: font,
                                    display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    {chainLen > 0 && <svg width="16" height="16" viewBox="0 0 24 24" fill={C.yellow}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>}
                                    {chainLen > 0 ? `RUSH中 ${chainLen}連` : "初当たり入力"}
                                </span>
                                <button className="b" onClick={() => { onClose(); S.setSessionSubTab("history"); }} style={{
                                    background: "transparent", border: "none",
                                    color: C.text, fontSize: 13, fontWeight: 700, fontFamily: font,
                                    padding: "6px 8px", minHeight: 36,
                                    display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    履歴
                                </button>
                            </div>

                            {/* スクロール領域（テンキー・確定ボタンは下部固定で除外） */}
                            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

                                {/* 上部HUD: 3項目（現在持玉 / 期待差玉 / 1Rあたりの出球） */}
                                <div style={{
                                    background: "var(--surface)",
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 12,
                                    padding: "8px 4px",
                                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                                }}>
                                    <div style={{ textAlign: "center", padding: "0 4px" }}>
                                        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>現在持玉</div>
                                        <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                            {f(S.currentMochiBalls || 0)}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: mono }}>
                                            ({sp(Math.round(evNet))}玉)
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                                        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>期待差玉</div>
                                        <div style={{ fontSize: 20, fontWeight: 900, color: sc(evNet), fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                            {sp(Math.round(evNet))}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>
                                            回転率 <span style={{ fontFamily: mono }}>{startG1K > 0 ? f(startG1K, 1) : "—"}</span>G/千円
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                                        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>1Rあたりの出球</div>
                                        <div style={{ fontSize: 20, fontWeight: 900, color: C.yellow, fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                            {avg1R > 0 ? `約${f(Math.round(avg1R))}` : "—"}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>（実測ベース）</div>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 2px" }}>
                                        <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>入力ステップ</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                            <span style={{ color: themeColor }}>{curStep.num}</span>
                                            <span style={{ color: C.sub }}>/{totalSteps}</span>
                                        </span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalSteps}, 1fr)`, gap: 4, marginTop: 4 }}>
                                        {STEPS.map((s) => {
                                            const isCur = s.num === curStep.num;
                                            const isDone = s.num < curStep.num;
                                            return (
                                                <button key={s.id} className="b" type="button"
                                                    onClick={() => setFocus(s.id)}
                                                    style={{
                                                        background: "transparent", border: "none",
                                                        padding: "2px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                                    }}>
                                                    <div style={{
                                                        width: 22, height: 22, borderRadius: "50%",
                                                        background: isCur ? themeColor : (isDone ? `color-mix(in srgb, ${themeColor} 28%, var(--surface))` : "var(--surface)"),
                                                        border: `1px solid ${isCur ? themeColor : (isDone ? `color-mix(in srgb, ${themeColor} 50%, transparent)` : C.border)}`,
                                                        color: isCur ? "#fff" : (isDone ? themeColor : C.sub),
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        fontSize: 11, fontWeight: 800, fontFamily: mono,
                                                    }}>{s.num}</div>
                                                    <span style={{ fontSize: 8, color: isCur ? themeColor : C.sub, fontWeight: 700, fontFamily: font, whiteSpace: "nowrap" }}>{s.short}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* 現在のステップカード（大表示） */}
                                {curStep.id !== "result" ? (
                                    <div style={{
                                        background: "var(--surface)",
                                        border: `1.5px solid ${curStep.color}`,
                                        borderRadius: 14,
                                        padding: "10px 14px",
                                        boxShadow: `0 0 0 3px color-mix(in srgb, ${curStep.color} 14%, transparent)`,
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 9, fontWeight: 800, color: curStep.color, background: `color-mix(in srgb, ${curStep.color} 18%, transparent)`, padding: "2px 6px", borderRadius: 4, fontFamily: mono }}>STEP {curStep.num}</span>
                                            {curStep.required && <span style={{ fontSize: 9, fontWeight: 800, color: "#000", background: C.yellow, padding: "2px 5px", borderRadius: 4, fontFamily: font }}>必須</span>}
                                        </div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 4, fontFamily: font }}>{curStep.label}</div>
                                        {curStep.sub && <div style={{ fontSize: 11, color: C.sub, marginTop: 1, fontFamily: font }}>{curStep.sub}</div>}

                                        <div style={{
                                            display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 4,
                                            padding: "10px 0 6px",
                                        }}>
                                            <span style={{ fontSize: 44, fontWeight: 800, color: bigValueText === "0" || bigValueText === "" ? C.sub : curStep.color, fontFamily: mono, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                                                {bigValueText === "" ? "0" : bigValueText}
                                            </span>
                                            {bigValueUnit && <span style={{ fontSize: 14, color: C.sub, fontWeight: 700, fontFamily: font }}>{bigValueUnit}</span>}
                                        </div>

                                        {/* ステップ別プリセット */}
                                        {curStep.id === "pushAmount" && (
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                                                {pushPresets.map(p => (
                                                    <button key={p.label} className="b" type="button" onClick={p.onClick}
                                                        style={{
                                                            minHeight: 44, borderRadius: 10, padding: "0 6px",
                                                            background: p.active ? `color-mix(in srgb, ${curStep.color} 28%, transparent)` : "var(--surface-hi)",
                                                            border: `1px solid ${p.active ? curStep.color : C.border}`,
                                                            color: p.active ? curStep.color : C.text,
                                                            fontSize: 13, fontWeight: 700, fontFamily: mono,
                                                        }}>
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {curStep.id === "rotCount" && hitWizardPresentation.showPushCorrectionInRotation && <CashCorrectionPrompt presets={pushPresets} C={C} />}
                                        {curStep.id === "rounds" && (
                                            <>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                                                    {roundPresets.map(p => (
                                                        <button key={p.label} className="b" type="button" onClick={p.onClick}
                                                            style={{
                                                                minHeight: 44, borderRadius: 10, padding: "0 6px",
                                                                background: p.active ? `color-mix(in srgb, ${curStep.color} 28%, transparent)` : "var(--surface-hi)",
                                                                border: `1px solid ${p.active ? curStep.color : C.border}`,
                                                                color: p.active ? curStep.color : C.text,
                                                                fontSize: 14, fontWeight: 700, fontFamily: mono,
                                                            }}>
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <RoundMultiplierControl rounds={rndN} mult={multN} loop={roundLoop} color={curStep.color}
                                                    onChange={(nextMult) => setHitWizardData(d => ({ ...d, mult: nextMult }))} />
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    /* STEP 7: 結果選択（連チャン継続 or 単発終了） */
                                    <div style={{
                                        background: "var(--surface)",
                                        border: `1.5px solid ${C.orange}`,
                                        borderRadius: 14,
                                        padding: "12px 14px",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 9, fontWeight: 800, color: C.orange, background: `color-mix(in srgb, ${C.orange} 18%, transparent)`, padding: "2px 6px", borderRadius: 4, fontFamily: mono }}>STEP {curStep.num}</span>
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 4, fontFamily: font }}>結果を選択</div>
                                        <div style={{ fontSize: 11, color: C.sub, marginTop: 1, fontFamily: font }}>連チャン継続 or 単発終了</div>

                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                                            <button className="b" type="button" onClick={onContinue} disabled={!canEnterResult}
                                                style={{
                                                    minHeight: 64, borderRadius: 12, padding: "8px 6px",
                                                    background: canEnterResult ? `color-mix(in srgb, ${C.green} 24%, var(--surface))` : "var(--surface)",
                                                    border: `1px solid ${canEnterResult ? C.green : C.border}`,
                                                    color: canEnterResult ? C.green : C.sub,
                                                    fontSize: 14, fontWeight: 800, fontFamily: font, opacity: canEnterResult ? 1 : 0.55,
                                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                                                }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                                    <span>連チャン継続</span>
                                                </div>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: C.sub }}>次の大当たりを入力</span>
                                            </button>
                                            <button className="b" type="button" onClick={onSingleEndStart} disabled={!canEnterResult}
                                                style={{
                                                    minHeight: 64, borderRadius: 12, padding: "8px 6px",
                                                    background: canEnterResult ? `color-mix(in srgb, ${C.red} 24%, var(--surface))` : "var(--surface)",
                                                    border: `1px solid ${canEnterResult ? C.red : C.border}`,
                                                    color: canEnterResult ? C.red : C.sub,
                                                    fontSize: 14, fontWeight: 800, fontFamily: font, opacity: canEnterResult ? 1 : 0.55,
                                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                                                }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <span style={{ width: 10, height: 10, background: "currentColor", borderRadius: 2, display: "inline-block" }} />
                                                    <span>単発終了</span>
                                                </div>
                                                <span style={{ fontSize: 10, fontWeight: 600, color: C.sub }}>通常時に戻る</span>
                                            </button>
                                        </div>
                                        {hitInputError && (
                                            <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>{hitInputError}</div>
                                        )}
                                    </div>
                                )}

                                {/* 次の入力プレビュー */}
                                {nxtStep && (
                                    <div>
                                        <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font, marginBottom: 4, padding: "0 2px" }}>次の入力</div>
                                        <button className="b" type="button" onClick={() => setFocus(nxtStep.id)}
                                            style={{
                                                width: "100%", textAlign: "left",
                                                background: "var(--surface)", border: `1px solid ${C.border}`,
                                                borderRadius: 12, padding: "8px 12px",
                                                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", minHeight: 52,
                                            }}>
                                            <span style={{
                                                width: 28, height: 28, borderRadius: "50%",
                                                background: `color-mix(in srgb, ${nxtStep.color} 18%, transparent)`,
                                                color: nxtStep.color, display: "flex", alignItems: "center", justifyContent: "center",
                                                fontSize: 12, fontWeight: 800, fontFamily: mono, flexShrink: 0,
                                            }}>{nxtStep.num}</span>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 9, color: nxtStep.color, fontWeight: 800, fontFamily: mono }}>STEP {nxtStep.num}</div>
                                                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: font, lineHeight: 1.2 }}>{nxtStep.label}</div>
                                                {nxtStep.sub && <div style={{ fontSize: 10, color: C.sub, fontFamily: font }}>{nxtStep.sub}</div>}
                                            </div>
                                            <span style={{ fontSize: 13, color: C.sub, fontFamily: mono, fontWeight: 700, whiteSpace: "nowrap" }}>
                                                <span style={{ marginRight: 4 }}>{stepDisplayValue(nxtStep.id) || "--"}</span>
                                                {nxtStep.summaryUnit && <span style={{ fontSize: 9, color: C.sub, fontFamily: font }}>{nxtStep.summaryUnit}</span>}
                                            </span>
                                        </button>
                                    </div>
                                )}

                                {/* 入力済みチップ */}
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font, marginBottom: 4, padding: "0 2px" }}>入力済み</div>
                                    {filledChips.length === 0 ? (
                                        <div style={{
                                            background: "var(--surface)", border: `1px dashed ${C.border}`, borderRadius: 12,
                                            padding: "10px 12px", display: "flex", alignItems: "center", gap: 8,
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                                            <span style={{ fontSize: 12, color: C.sub, fontFamily: font }}>未入力の項目です</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {filledChips.map(s => (
                                                <button key={s.id} className="b" type="button" onClick={() => setFocus(s.id)}
                                                    style={{
                                                        background: "var(--surface)", border: `1px solid color-mix(in srgb, ${s.color} 40%, ${C.border})`,
                                                        borderRadius: 999, padding: "6px 10px", minHeight: 30,
                                                        display: "inline-flex", alignItems: "baseline", gap: 4,
                                                        fontSize: 12, fontFamily: font,
                                                    }}>
                                                    <span style={{ color: C.sub, fontWeight: 700 }}>{s.short}</span>
                                                    <span style={{ fontFamily: mono, fontWeight: 800, color: s.color }}>{stepDisplayValue(s.id)}</span>
                                                    {s.summaryUnit && <span style={{ fontSize: 9, color: C.sub }}>{s.summaryUnit}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 今回の入力まとめ（折りたたみ） */}
                                <details style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 12px" }}>
                                    <summary style={{
                                        fontSize: 12, fontWeight: 800, color: themeColor, fontFamily: font, cursor: "pointer",
                                        listStyle: "none", display: "flex", alignItems: "center", gap: 6,
                                    }}>
                                        <span style={{ fontSize: 9 }}>▼</span>
                                        今回の入力まとめ（未確定）
                                    </summary>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
                                        {summaryRows.map(r => (
                                            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11 }}>
                                                <span style={{ color: C.sub, fontFamily: font }}>{r.label}</span>
                                                <span style={{ fontFamily: mono, fontWeight: 700, color: r.value === "--" ? C.sub : C.text }}>
                                                    {r.value}{r.unit && <span style={{ fontSize: 9, color: C.sub, marginLeft: 2, fontFamily: font }}>{r.unit}</span>}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </details>

                            </div>

                            {/* 下部固定: テンキー + 入力確定ボタン */}
                            <div style={{
                                borderTop: `1px solid ${C.border}`,
                                paddingBottom: "max(6px, env(safe-area-inset-bottom))",
                                background: "var(--surface-alt)",
                                flexShrink: 0,
                            }}>
                                {/* テンキー: 数値入力ステップのみ表示 */}
                                {keypadField && (
                                    <div style={{ padding: "6px 10px 0" }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                                <button key={n} className="b" type="button" onClick={() => keypadAppend(n)}
                                                    style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 22, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 46 }}>
                                                    {n}
                                                </button>
                                            ))}
                                            <button className="b" type="button" onClick={keypadClear}
                                                style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, background: `color-mix(in srgb, ${C.red} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${C.red} 40%, transparent)`, color: C.red, minHeight: 46, fontFamily: font }}>
                                                消去
                                            </button>
                                            <button className="b" type="button" onClick={() => keypadAppend(0)}
                                                style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 22, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 46 }}>
                                                0
                                            </button>
                                            <button className="b" type="button" onClick={keypadBackspace}
                                                style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 18, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.sub, minHeight: 46 }}>
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* 入力を確定する ボタン（次ステップへ）。結果ステップでは非表示 */}
                                {curStep.id !== "result" && (
                                    <div style={{ padding: "6px 10px 4px" }}>
                                        <button className="b" type="button" onClick={onConfirm}
                                            style={{
                                                width: "100%", minHeight: 54, borderRadius: 12,
                                                background: `linear-gradient(180deg, ${themeColor}, color-mix(in srgb, ${themeColor} 70%, var(--bg)))`,
                                                border: "none", color: "#fff",
                                                fontSize: 17, fontWeight: 800, fontFamily: font,
                                                boxShadow: `0 4px 16px color-mix(in srgb, ${themeColor} 40%, transparent)`,
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
                                                position: "relative",
                                            }}>
                                            入力を確定する
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 20 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                        </button>
                                    </div>
                                )}
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.sub, padding: "4px 12px 2px", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: font }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                                        入力はいつでも編集できます
                                    </span>
                                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: font }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill={C.green}><circle cx="12" cy="12" r="10"/></svg>
                                        データは自動保存されます
                                    </span>
                                </div>
                            </div>

                            {/* 単発終了サブモーダル（時短回数 + 最終持ち玉） */}
                            {hitInputSingleEndOpen && (
                                <div onClick={() => setHitInputSingleEndOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
                                    <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, maxWidth: 360, width: "100%" }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, marginBottom: 4 }}>単発終了</div>
                                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>時短回数と最終持ち玉を入力して記録完了</div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                            <label style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
                                                時短回数（回転）
                                                <input type="tel" inputMode="numeric" value={hitWizardData.jitanSpins} onChange={(e) => updField("jitanSpins", e.target.value.replace(/[^0-9]/g, ""))}
                                                    style={{ display: "block", marginTop: 4, width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: mono, fontSize: 18, fontWeight: 700, padding: "10px 12px", textAlign: "right" }} />
                                            </label>
                                            <label style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
                                                最終持ち玉（玉）
                                                <input type="tel" inputMode="numeric" value={hitWizardData.finalBallsAfterJitan} onChange={(e) => updField("finalBallsAfterJitan", e.target.value.replace(/[^0-9]/g, ""))}
                                                    style={{ display: "block", marginTop: 4, width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: mono, fontSize: 18, fontWeight: 700, padding: "10px 12px", textAlign: "right" }} />
                                            </label>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                                            <button className="b" type="button" onClick={() => setHitInputSingleEndOpen(false)} style={{ padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "var(--surface-hi)", border: `1px solid ${C.border}`, color: C.text }}>戻る</button>
                                            <button className="b" type="button" onClick={onSingleEndConfirm} style={{ padding: "12px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, background: "#16a34a", border: "none", color: "#fff" }}>記録完了</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })(),
                document.body
            )}

            {/* スタート入力プロンプト - 時短/大当たり終了後 */}
            {S.showStartPrompt && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(17,24,39,0.5)",
                    backdropFilter: "blur(8px)",
                    zIndex: 9998,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20
                }}>
                    <div style={{
                        width: "100%",
                        maxWidth: 340,
                        background: C.surface,
                        borderRadius: 20,
                        padding: 24,
                        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
                    }}>
                        <div style={{ textAlign: "center", marginBottom: 20 }}>
                            <div style={{ fontSize: 20, fontWeight: 800, color: C.orange, marginBottom: 8 }}>
                                スタート回転数を入力
                            </div>
                            <div style={{ fontSize: 12, color: C.sub }}>
                                時短/大当たり終了後のスタート位置を記録
                            </div>
                        </div>
                        <input
                            type="tel"
                            inputMode="numeric"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="回転数"
                            autoFocus
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                background: C.bg,
                                border: `2px solid ${C.orange}`,
                                borderRadius: 12,
                                padding: "16px",
                                fontSize: 24,
                                fontWeight: 700,
                                color: C.text,
                                fontFamily: mono,
                                textAlign: "center",
                                outline: "none",
                                marginBottom: 20
                            }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <button className="b" onClick={() => {
                                S.setShowStartPrompt(false);
                                setInput("");
                            }} style={{
                                padding: "14px 0",
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: 15,
                                background: "var(--surface-hi)",
                                border: "none",
                                color: C.sub
                            }}>
                                スキップ
                            </button>
                            <button className="b" onClick={() => {
                                const trimmed = input.trim();
                                const val = Number(trimmed);
                                // 大当たり後に台のスタート回数カウンタが0へリセットされる機種があるため、0も有効値として記録する。
                                // （旧実装は val > 0 のみ記録で、0入力が黙って破棄され、次の1K入力が
                                //   直前の大当たりの古い累計回転と比較されて「逆行」扱いになる原因だった）
                                if (trimmed !== "" && Number.isFinite(val) && val >= 0) {
                                    S.setStartRot(val);
                                    setRows((r) => [...r, { type: "start", cumRot: val, yutimeLowSpins: 0, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true }]);
                                    S.pushLog({ type: "大当たり後スタート", time: tsNow(), rot: val });
                                }
                                S.setShowStartPrompt(false);
                                setInput("");
                            }} style={{
                                padding: "14px 0",
                                borderRadius: 12,
                                fontWeight: 700,
                                fontSize: 15,
                                background: "#ea580c",
                                border: "none",
                                color: "#fff",
                                boxShadow: "0 4px 12px rgba(249,115,22,0.3)"
                            }}>
                                記録
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {chainWizardOpen && ReactDOM.createPortal(
                (() => {
                    const D = chainWizardData;
                    const focus = chainInputFocus;
                    const setFocus = (k) => setChainInputFocus(k);
                    const updField = (key, val) => setChainWizardData(d => ({ ...d, [key]: val }));

                    const numOr0 = (k) => Number(D[k]) || 0;
                    const rotN = numOr0("elecSapoRot");
                    const rndN = numOr0("rounds");
                    const multN = Math.max(1, Number(D.mult) || 1);
                    const dispN = numOr0("displayBalls");
                    const nextN = numOr0("nextTimingBalls");

                    // 連チャン追加の場合、開始上皿玉は「前回終了時の持玉」（getPrevEndBalls）を自動引き継ぎ
                    const prevEndBalls = getPrevEndBalls();
                    const lastOutN = numOr0("lastOutBalls"); // openChainWizard で prevEndBalls を初期セット済み
                    const trayCarryDisplay = lastOutN > 0 ? lastOutN : prevEndBalls;

                    // サポ増減・1回転あたり（内部導出）
                    const sapoChange = nextN > 0 ? nextN - lastOutN - dispN * multN : 0;
                    const perRot = rotN > 0 ? sapoChange / rotN : 0;

                    // チェーン集計
                    const chainHits = lastChain ? (lastChain.hits || []) : [];
                    const chainTotalRounds = chainHits.reduce((s, h) => s + (h.rounds || 0), 0);
                    const chainTotalSapoRot = chainHits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                    const chainTrayBalls = lastChain ? (lastChain.trayBalls || 0) : 0;

                    // 液晶出玉(dispN)・実測出玉は簡易フローでは入力しないため必須から除外
                    const requiredOk = rotN > 0 && rndN > 0;
                    const chainLen = chainHits.length + 1; // 入力中の連
                    const headerBadge = `RUSH中 ${chainLen}連`;

                    const keypadField = (focus === "rounds" || focus === "result") ? null : focus;

                    const keypadAppend = (n) => {
                        if (!keypadField) return;
                        setChainWizardData(d => {
                            const cur = (d[keypadField] != null ? String(d[keypadField]) : "");
                            const next = cur === "0" || cur === "" ? String(n) : cur + n;
                            return { ...d, [keypadField]: next };
                        });
                        setChainWizardFirstKey(false);
                    };
                    const keypadClear = () => {
                        if (!keypadField) return;
                        setChainWizardData(d => ({ ...d, [keypadField]: "" }));
                        setChainWizardFirstKey(false);
                    };
                    const keypadBackspace = () => {
                        if (!keypadField) return;
                        setChainWizardData(d => {
                            const cur = (d[keypadField] != null ? String(d[keypadField]) : "");
                            return { ...d, [keypadField]: cur.slice(0, -1) };
                        });
                        setChainWizardFirstKey(false);
                    };

                    const onClose = () => {
                        setChainWizardOpen(false);
                        setChainInputError("");
                        clearChainWizard();
                    };

                    // 先頭ステップ（サポ回転数）で「キャンセル」: 入力済みデータがあれば確認してから閉じる
                    const hasChainInput = D.elecSapoRot !== "" || rndN > 0 || D.displayBalls !== "" || D.nextTimingBalls !== "";
                    const onCancel = async () => {
                        if (hasChainInput) {
                            const confirmed = await S.requestConfirmation?.({
                                title: "入力中の内容を破棄しますか？",
                                message: "まだ確定していない連チャン入力は保存されません。",
                                confirmLabel: "破棄して閉じる",
                                tone: "danger",
                            });
                            if (!confirmed) return;
                        }
                        onClose();
                    };

                    const validateRequired = () => {
                        if (!requiredOk) {
                            const missing = [];
                            if (rotN <= 0) missing.push("サポ回転数");
                            if (rndN <= 0) missing.push("ラウンド数");
                            setChainInputError(`${missing.join("・")}を入力してください`);
                            return false;
                        }
                        setChainInputError("");
                        return true;
                    };

                    // 「継続」: 既存 handleChainWizardComplete(false) を呼ぶ
                    const onContinue = () => {
                        if (!validateRequired()) return;
                        // nextTimingBalls 未入力ならプリセット（lastOut + disp×mult）
                        if (nextN === 0) {
                            const presetNext = lastOutN + dispN * multN;
                            setChainWizardData(d => ({ ...d, nextTimingBalls: String(presetNext) }));
                            // 同 tick で handleChainWizardComplete を呼ぶと d 旧値を読むので、ワンクッション
                            setTimeout(() => handleChainWizardComplete(false), 0);
                            return;
                        }
                        handleChainWizardComplete(false);
                    };

                    // 「ラッシュ終了へ」: 画面 C へ遷移
                    const onRushEnd = () => {
                        if (!validateRequired()) return;
                        // nextTimingBalls 未入力ならプリセット
                        const nextResolved = nextN > 0 ? nextN : lastOutN + dispN * multN;
                        const existingTotal = chainTrayBalls + chainHits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
                        const estimated = existingTotal + (nextResolved - lastOutN);
                        setChainWizardInitialFinalBalls(estimated);
                        setChainWizardData(d => ({
                            ...d,
                            nextTimingBalls: String(nextResolved),
                            finalRealBalls: String(estimated)
                        }));
                        setChainWizardStep(8);
                        setChainWizardFirstKey(true);
                    };

                    // 「単発終了（チェーン中）」: 既存 handleChainWizardSingleEnd の Step 6,7 経由のためサブモーダルを開く
                    const onSingleEndStart = () => {
                        if (!validateRequired()) return;
                        const nextResolved = nextN > 0 ? nextN : lastOutN + dispN * multN;
                        setChainWizardData(d => ({
                            ...d,
                            nextTimingBalls: String(nextResolved),
                            jitanSpins: d.jitanSpins || "",
                            finalBallsAfterJitan: d.finalBallsAfterJitan || (nextResolved > 0 ? String(nextResolved) : ""),
                        }));
                        setChainInputSingleEndOpen(true);
                    };
                    const onSingleEndConfirm = () => {
                        handleChainWizardSingleEnd();
                        setChainInputSingleEndOpen(false);
                    };

                    // ステップ定義（簡易入力フロー 画面B、入力順: サポ回転→R→結果）
                    // 液晶出玉・実測出玉の毎回入力は廃止。サポ増減はラッシュ終了時に「最終玉−開始玉−出玉分」の残差で自動算出する。
                    const STEPS_B = [
                        { id: "elecSapoRot",     num: 1, label: "サポ回転数", sub: "（電サポ回転）",            short: "サポ回転", color: C.green,  summaryUnit: "回転" },
                        { id: "rounds",          num: 2, label: "ラウンド数",  sub: "（当たったラウンド 10R・5Rなど）", short: "R数",  color: C.purple, summaryUnit: "" },
                        { id: "result",          num: 3, label: "結果を選択",  sub: "（連チャン継続 or RUSH終了）", short: "結果",  color: C.orange, summaryUnit: "" },
                    ];
                    const stepIdx = Math.max(0, STEPS_B.findIndex(s => s.id === focus));
                    const curStep = STEPS_B[stepIdx];
                    const nxtStep = STEPS_B[stepIdx + 1] || null;
                    const totalSteps = STEPS_B.length;

                    const stepDisplayValue = (id) => {
                        switch (id) {
                            case "elecSapoRot":     return rotN > 0 ? f(rotN) : "";
                            case "rounds":          return rndN > 0 ? (multN > 1 ? `${rndN}R×${multN}` : `${rndN}R`) : "";
                            case "displayBalls":    return dispN > 0 ? f(dispN) : "";
                            case "nextTimingBalls": return nextN > 0 ? f(nextN) : "";
                            default: return "";
                        }
                    };
                    const filledChips = STEPS_B.slice(0, stepIdx).filter(s => s.id !== "result" && stepDisplayValue(s.id) !== "");

                    // ラウンド数プリセット: 機種マスタの rushDist から
                    const roundPresets = machineRushRounds.slice(0, 6).map(({ rounds: r, mult: m }) => ({
                        label: m > 1 ? `${r}R×${m}` : `${r}R`,
                        active: rndN === r && multN === m,
                        onClick: () => setChainWizardData(d => ({ ...d, rounds: r, mult: m })),
                    }));
                    const roundLoop = getMachineRoundLoop(selectedMachine, "rush", rndN);

                    // 期待差玉などの上部HUD用
                    const evNet = ev && Number.isFinite(ev.totalNetGain) ? ev.totalNetGain : 0;
                    const startG1K = ev && Number.isFinite(ev.start1K) ? ev.start1K : 0;
                    const avg1R = ev && Number.isFinite(ev.avg1R) ? ev.avg1R : 0;

                    // 現在ステップの大きな表示値
                    const bigValueText = stepDisplayValue(curStep.id) || (curStep.id === "result" ? "" : "0");
                    const bigValueUnit = curStep.id === "elecSapoRot" ? "回転"
                        : curStep.id === "rounds" ? ""
                        : curStep.id === "result" ? "" : "玉";

                    // 確定ボタン: 次ステップへ
                    const onConfirm = () => {
                        if (stepIdx < STEPS_B.length - 1) {
                            setFocus(STEPS_B[stepIdx + 1].id);
                        }
                    };

                    // 「戻る」: 1つ前のステップへ。chainWizardData は保持したまま戻る
                    // 画面 C（chainWizardStep===8）からは画面 B の先頭（サポ回転数）へ戻る
                    const onBack = () => {
                        if (chainWizardStep === 8) {
                            setChainWizardStep(0);
                            setChainWizardFirstKey(true);
                            return;
                        }
                        if (stepIdx > 0) setFocus(STEPS_B[stepIdx - 1].id);
                    };

                    // サマリー
                    const summaryRows = [
                        { label: "サポ回転数", value: rotN > 0 ? f(rotN) : "--", unit: "回転" },
                        { label: "ラウンド数", value: rndN > 0 ? (multN > 1 ? `${rndN}R×${multN}` : `${rndN}R`) : "--", unit: "" },
                    ];

                    const themeColor = C.green;

                    return (
                        <div className="jp-proto-screen" style={{
                            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: 9999, display: "flex", flexDirection: "column",
                            height: "100dvh", width: "100vw", background: C.bg
                        }}>
                            {/* ヘッダー（固定）: × 閉じる / タイトル / 履歴 */}
                            <div className="jp-proto-header" style={{
                                padding: "8px 12px",
                                paddingTop: "max(8px, env(safe-area-inset-top))",
                                borderBottom: `1px solid ${C.border}`,
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                flexShrink: 0, gap: 8,
                            }}>
                                {(chainWizardStep === 8 || stepIdx > 0) ? (
                                    <button className="b" type="button" onClick={onBack} style={{
                                        background: "transparent", border: "none",
                                        color: C.text, fontSize: 14, fontWeight: 700, fontFamily: font,
                                        padding: "6px 8px", minHeight: 44, minWidth: 44,
                                        display: "flex", alignItems: "center", gap: 4,
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                                        戻る
                                    </button>
                                ) : (
                                    <button className="b" type="button" onClick={onCancel} style={{
                                        background: "transparent", border: "none",
                                        color: C.red, fontSize: 14, fontWeight: 700, fontFamily: font,
                                        padding: "6px 8px", minHeight: 44, minWidth: 44,
                                        display: "flex", alignItems: "center", gap: 4,
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        キャンセル
                                    </button>
                                )}
                                <span style={{
                                    fontSize: 16, fontWeight: 800, color: C.yellow, fontFamily: font,
                                    display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                    {chainWizardStep === 8 ? "ラッシュ終了 — 最終確認" : (chainHits.length > 0 ? `連チャン追加入力（${headerBadge}）` : "連チャン追加入力")}
                                </span>
                                <button className="b" onClick={() => { onClose(); S.setSessionSubTab("history"); }} style={{
                                    background: "transparent", border: "none",
                                    color: C.text, fontSize: 13, fontWeight: 700, fontFamily: font,
                                    padding: "6px 8px", minHeight: 36,
                                    display: "flex", alignItems: "center", gap: 4,
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    履歴
                                </button>
                            </div>

                            {chainWizardStep !== 8 ? (
                                /* ====== 画面 B：連チャン追加入力 ====== */
                                <>
                                    <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

                                        {/* 上部HUD: 3項目（現在持玉 / 期待差玉 / 1Rあたりの出球） */}
                                        <div style={{
                                            background: "var(--surface)",
                                            border: `1px solid ${C.border}`,
                                            borderRadius: 12,
                                            padding: "8px 4px",
                                            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                                        }}>
                                            <div style={{ textAlign: "center", padding: "0 4px" }}>
                                                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>現在持玉</div>
                                                <div style={{ fontSize: 20, fontWeight: 900, color: C.green, fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                                    {f(trayCarryDisplay)}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: mono }}>
                                                    ({sp(Math.round(evNet))}玉)
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                                                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>期待差玉</div>
                                                <div style={{ fontSize: 20, fontWeight: 900, color: sc(evNet), fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                                    {sp(Math.round(evNet))}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>
                                                    回転率 <span style={{ fontFamily: mono }}>{startG1K > 0 ? f(startG1K, 1) : "—"}</span>G/千円
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                                                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>1Rあたりの出球</div>
                                                <div style={{ fontSize: 20, fontWeight: 900, color: C.yellow, fontFamily: mono, lineHeight: 1.15, marginTop: 2 }}>
                                                    {avg1R > 0 ? `約${f(Math.round(avg1R))}` : "—"}<span style={{ fontSize: 10, marginLeft: 2, fontFamily: font, color: C.sub }}>玉</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontFamily: font }}>（実測ベース）</div>
                                            </div>
                                        </div>

                                        {/* 入力ステップインジケーター */}
                                        <div>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 2px" }}>
                                                <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font }}>入力ステップ</span>
                                                <span style={{ fontSize: 12, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                                    <span style={{ color: themeColor }}>{curStep.num}</span>
                                                    <span style={{ color: C.sub }}>/{totalSteps}</span>
                                                </span>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: `repeat(${totalSteps}, 1fr)`, gap: 4, marginTop: 4 }}>
                                                {STEPS_B.map((s) => {
                                                    const isCur = s.num === curStep.num;
                                                    const isDone = s.num < curStep.num;
                                                    return (
                                                        <button key={s.id} className="b" type="button"
                                                            onClick={() => setFocus(s.id)}
                                                            style={{
                                                                background: "transparent", border: "none",
                                                                padding: "2px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                                                            }}>
                                                            <div style={{
                                                                width: 22, height: 22, borderRadius: "50%",
                                                                background: isCur ? themeColor : (isDone ? `color-mix(in srgb, ${themeColor} 28%, var(--surface))` : "var(--surface)"),
                                                                border: `1px solid ${isCur ? themeColor : (isDone ? `color-mix(in srgb, ${themeColor} 50%, transparent)` : C.border)}`,
                                                                color: isCur ? "#fff" : (isDone ? themeColor : C.sub),
                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                fontSize: 11, fontWeight: 800, fontFamily: mono,
                                                            }}>{s.num}</div>
                                                            <span style={{ fontSize: 8, color: isCur ? themeColor : C.sub, fontWeight: 700, fontFamily: font, whiteSpace: "nowrap" }}>{s.short}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* 現在のステップカード（大表示） */}
                                        {curStep.id !== "result" ? (
                                            <div style={{
                                                background: "var(--surface)",
                                                border: `1.5px solid ${curStep.color}`,
                                                borderRadius: 14,
                                                padding: "10px 14px",
                                                boxShadow: `0 0 0 3px color-mix(in srgb, ${curStep.color} 14%, transparent)`,
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: curStep.color, background: `color-mix(in srgb, ${curStep.color} 18%, transparent)`, padding: "2px 6px", borderRadius: 4, fontFamily: mono }}>STEP {curStep.num}</span>
                                                </div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 4, fontFamily: font }}>{curStep.label}</div>
                                                {curStep.sub && <div style={{ fontSize: 11, color: C.sub, marginTop: 1, fontFamily: font }}>{curStep.sub}</div>}

                                                <div style={{
                                                    display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 4,
                                                    padding: curStep.id === "elecSapoRot" ? "10px 0 10px" : "10px 0 6px",
                                                }}>
                                                    <span style={{ fontSize: 44, fontWeight: 800, color: bigValueText === "0" || bigValueText === "" ? C.sub : curStep.color, fontFamily: mono, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                                                        {bigValueText === "" ? "0" : bigValueText}
                                                    </span>
                                                    {bigValueUnit && <span style={{ fontSize: 14, color: C.sub, fontWeight: 700, fontFamily: font }}>{bigValueUnit}</span>}
                                                </div>

                                                {/* ステップ別プリセット */}
                                                {curStep.id === "rounds" && (
                                                    <>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                                                            {roundPresets.map(p => (
                                                                <button key={p.label} className="b" type="button" onClick={p.onClick}
                                                                    style={{
                                                                        minHeight: 44, borderRadius: 10, padding: "0 6px",
                                                                        background: p.active ? `color-mix(in srgb, ${curStep.color} 28%, transparent)` : "var(--surface-hi)",
                                                                        border: `1px solid ${p.active ? curStep.color : C.border}`,
                                                                        color: p.active ? curStep.color : C.text,
                                                                        fontSize: 14, fontWeight: 700, fontFamily: mono,
                                                                    }}>
                                                                    {p.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <RoundMultiplierControl rounds={rndN} mult={multN} loop={roundLoop} color={curStep.color}
                                                            onChange={(nextMult) => setChainWizardData(d => ({ ...d, mult: nextMult }))} />
                                                    </>
                                                )}
                                                {curStep.id === "displayBalls" && (
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6 }}>
                                                        {[450, 750, 1500].map(p => (
                                                            <button key={p} className="b" type="button" onClick={() => updField("displayBalls", String(p))}
                                                                style={{
                                                                    minHeight: 44, borderRadius: 10, padding: "0 6px",
                                                                    background: dispN === p ? `color-mix(in srgb, ${curStep.color} 28%, transparent)` : "var(--surface-hi)",
                                                                    border: `1px solid ${dispN === p ? curStep.color : C.border}`,
                                                                    color: dispN === p ? curStep.color : C.text,
                                                                    fontSize: 13, fontWeight: 700, fontFamily: mono,
                                                                }}>{p}玉</button>
                                                        ))}
                                                    </div>
                                                )}
                                                {curStep.id === "nextTimingBalls" && (
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                                                        <button className="b" type="button" onClick={() => updField("nextTimingBalls", String(lastOutN + dispN * multN || 0))}
                                                            style={{
                                                                minHeight: 44, borderRadius: 10, padding: "0 8px",
                                                                background: "var(--surface-hi)", border: `1px solid ${C.border}`,
                                                                color: C.text, fontSize: 12, fontWeight: 700, fontFamily: font,
                                                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1.1,
                                                            }}>
                                                            <span style={{ fontSize: 13, fontFamily: mono, color: curStep.color }}>{f(lastOutN + dispN * multN || 0)}玉</span>
                                                            <span style={{ fontSize: 9, color: C.sub }}>計算値</span>
                                                        </button>
                                                        <button className="b" type="button" onClick={() => updField("nextTimingBalls", "")}
                                                            style={{
                                                                minHeight: 44, borderRadius: 10, padding: "0 8px",
                                                                background: "var(--surface-hi)", border: `1px solid ${C.border}`,
                                                                color: C.text, fontSize: 13, fontWeight: 700, fontFamily: font,
                                                            }}>クリア</button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            /* STEP 5: 結果選択（連チャン継続 / 単発終了 / RUSH終了） */
                                            <div style={{
                                                background: "var(--surface)",
                                                border: `1.5px solid ${C.orange}`,
                                                borderRadius: 14,
                                                padding: "12px 14px",
                                            }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: C.orange, background: `color-mix(in srgb, ${C.orange} 18%, transparent)`, padding: "2px 6px", borderRadius: 4, fontFamily: mono }}>STEP {curStep.num}</span>
                                                </div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 4, fontFamily: font }}>結果を選択</div>
                                                <div style={{ fontSize: 11, color: C.sub, marginTop: 1, fontFamily: font }}>連チャン継続 / 単発終了 / RUSH終了</div>

                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
                                                    <button className="b" type="button" onClick={onContinue} disabled={!requiredOk}
                                                        style={{
                                                            minHeight: 72, borderRadius: 12, padding: "8px 4px",
                                                            background: requiredOk ? `color-mix(in srgb, ${C.green} 24%, var(--surface))` : "var(--surface)",
                                                            border: `1px solid ${requiredOk ? C.green : C.border}`,
                                                            color: requiredOk ? C.green : C.sub,
                                                            fontSize: 12, fontWeight: 800, fontFamily: font, opacity: requiredOk ? 1 : 0.55,
                                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                                                        }}>
                                                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                                            連チャン継続
                                                        </span>
                                                        <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>次の大当たりを入力</span>
                                                    </button>
                                                    <button className="b" type="button" onClick={onSingleEndStart} disabled={!requiredOk}
                                                        style={{
                                                            minHeight: 72, borderRadius: 12, padding: "8px 4px",
                                                            background: requiredOk ? `color-mix(in srgb, ${C.purple} 24%, var(--surface))` : "var(--surface)",
                                                            border: `1px solid ${requiredOk ? C.purple : C.border}`,
                                                            color: requiredOk ? C.purple : C.sub,
                                                            fontSize: 12, fontWeight: 800, fontFamily: font, opacity: requiredOk ? 1 : 0.55,
                                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                                                        }}>
                                                        <span>単発終了</span>
                                                        <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>時短後に通常へ</span>
                                                    </button>
                                                    <button className="b" type="button" onClick={onRushEnd} disabled={!requiredOk}
                                                        style={{
                                                            minHeight: 72, borderRadius: 12, padding: "8px 4px",
                                                            background: requiredOk ? `color-mix(in srgb, ${C.orange} 24%, var(--surface))` : "var(--surface)",
                                                            border: `1px solid ${requiredOk ? C.orange : C.border}`,
                                                            color: requiredOk ? C.orange : C.sub,
                                                            fontSize: 12, fontWeight: 800, fontFamily: font, opacity: requiredOk ? 1 : 0.55,
                                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                                                        }}>
                                                        <span>RUSH終了</span>
                                                        <span style={{ fontSize: 9, fontWeight: 600, color: C.sub }}>最終持ち玉を入力</span>
                                                    </button>
                                                </div>
                                                {chainInputError && (
                                                    <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 700 }}>{chainInputError}</div>
                                                )}
                                                {/* サポ増減（内部導出） */}
                                                {nextN > 0 && (
                                                    <div style={{ marginTop: 8, display: "flex", gap: 12, justifyContent: "center", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 9, color: C.sub }}>電サポ増減</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>{sp(sapoChange)}玉</div>
                                                        </div>
                                                        {rotN > 0 && (
                                                            <div style={{ textAlign: "center" }}>
                                                                <div style={{ fontSize: 9, color: C.sub }}>1回転あたり</div>
                                                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>{sp(perRot, 2)}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* 次の入力プレビュー */}
                                        {nxtStep && (
                                            <div>
                                                <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font, marginBottom: 4, padding: "0 2px" }}>次の入力</div>
                                                <button className="b" type="button" onClick={() => setFocus(nxtStep.id)}
                                                    style={{
                                                        width: "100%", textAlign: "left",
                                                        background: "var(--surface)", border: `1px solid ${C.border}`,
                                                        borderRadius: 12, padding: "8px 12px",
                                                        display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", minHeight: 52,
                                                    }}>
                                                    <span style={{
                                                        width: 28, height: 28, borderRadius: "50%",
                                                        background: `color-mix(in srgb, ${nxtStep.color} 18%, transparent)`,
                                                        color: nxtStep.color, display: "flex", alignItems: "center", justifyContent: "center",
                                                        fontSize: 12, fontWeight: 800, fontFamily: mono, flexShrink: 0,
                                                    }}>{nxtStep.num}</span>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: 9, color: nxtStep.color, fontWeight: 800, fontFamily: mono }}>STEP {nxtStep.num}</div>
                                                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: font, lineHeight: 1.2 }}>{nxtStep.label}</div>
                                                        {nxtStep.sub && <div style={{ fontSize: 10, color: C.sub, fontFamily: font }}>{nxtStep.sub}</div>}
                                                    </div>
                                                    <span style={{ fontSize: 13, color: C.sub, fontFamily: mono, fontWeight: 700, whiteSpace: "nowrap" }}>
                                                        <span style={{ marginRight: 4 }}>{stepDisplayValue(nxtStep.id) || "--"}</span>
                                                        {nxtStep.summaryUnit && <span style={{ fontSize: 9, color: C.sub, fontFamily: font }}>{nxtStep.summaryUnit}</span>}
                                                    </span>
                                                </button>
                                            </div>
                                        )}

                                        {/* 入力済みチップ */}
                                        <div>
                                            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, fontFamily: font, marginBottom: 4, padding: "0 2px" }}>入力済み</div>
                                            {filledChips.length === 0 ? (
                                                <div style={{
                                                    background: "var(--surface)", border: `1px dashed ${C.border}`, borderRadius: 12,
                                                    padding: "10px 12px", display: "flex", alignItems: "center", gap: 8,
                                                }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                                                    <span style={{ fontSize: 12, color: C.sub, fontFamily: font }}>未入力の項目です</span>
                                                </div>
                                            ) : (
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                                    {filledChips.map(s => (
                                                        <button key={s.id} className="b" type="button" onClick={() => setFocus(s.id)}
                                                            style={{
                                                                background: "var(--surface)", border: `1px solid color-mix(in srgb, ${s.color} 40%, ${C.border})`,
                                                                borderRadius: 999, padding: "6px 10px", minHeight: 30,
                                                                display: "inline-flex", alignItems: "baseline", gap: 4,
                                                                fontSize: 12, fontFamily: font,
                                                            }}>
                                                            <span style={{ color: C.sub, fontWeight: 700 }}>{s.short}</span>
                                                            <span style={{ fontFamily: mono, fontWeight: 800, color: s.color }}>{stepDisplayValue(s.id)}</span>
                                                            {s.summaryUnit && <span style={{ fontSize: 9, color: C.sub }}>{s.summaryUnit}</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* 今回の入力まとめ（折りたたみ） */}
                                        <details style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 12px" }}>
                                            <summary style={{
                                                fontSize: 12, fontWeight: 800, color: themeColor, fontFamily: font, cursor: "pointer",
                                                listStyle: "none", display: "flex", alignItems: "center", gap: 6,
                                            }}>
                                                <span style={{ fontSize: 9 }}>▼</span>
                                                今回の入力まとめ（未確定）
                                            </summary>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
                                                {summaryRows.map(r => (
                                                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11 }}>
                                                        <span style={{ color: C.sub, fontFamily: font }}>{r.label}</span>
                                                        <span style={{ fontFamily: mono, fontWeight: 700, color: r.value === "--" ? C.sub : C.text }}>
                                                            {r.value}{r.unit && <span style={{ fontSize: 9, color: C.sub, marginLeft: 2, fontFamily: font }}>{r.unit}</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                                {chainHits.length > 0 && (
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                                                        <span style={{ fontSize: 11, color: themeColor, fontWeight: 800, fontFamily: font }}>これまでの連数</span>
                                                        <span style={{ fontFamily: mono, fontWeight: 900, color: C.yellow }}>{chainHits.length}連 / {chainTotalRounds}R</span>
                                                    </div>
                                                )}
                                            </div>
                                        </details>

                                    </div>

                                    {/* 下部固定: テンキー + 入力確定ボタン */}
                                    <div style={{
                                        borderTop: `1px solid ${C.border}`,
                                        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
                                        background: "var(--surface-alt)",
                                        flexShrink: 0,
                                    }}>
                                        {keypadField && (
                                            <div style={{ padding: "6px 10px 0" }}>
                                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                                    {[1,2,3,4,5,6,7,8,9].map(n => (
                                                        <button key={n} className="b" type="button" onClick={() => keypadAppend(n)}
                                                            style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 22, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 46 }}>
                                                            {n}
                                                        </button>
                                                    ))}
                                                    <button className="b" type="button" onClick={keypadClear}
                                                        style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, background: `color-mix(in srgb, ${C.red} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${C.red} 40%, transparent)`, color: C.red, minHeight: 46, fontFamily: font }}>
                                                        消去
                                                    </button>
                                                    <button className="b" type="button" onClick={() => keypadAppend(0)}
                                                        style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 22, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 46 }}>
                                                        0
                                                    </button>
                                                    <button className="b" type="button" onClick={keypadBackspace}
                                                        style={{ padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 18, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.sub, minHeight: 46 }}>
                                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {curStep.id !== "result" && (
                                            <div style={{ padding: "6px 10px 4px" }}>
                                                <button className="b" type="button" onClick={onConfirm}
                                                    style={{
                                                        width: "100%", minHeight: 54, borderRadius: 12,
                                                        background: `linear-gradient(180deg, ${themeColor}, color-mix(in srgb, ${themeColor} 70%, var(--bg)))`,
                                                        border: "none", color: "#fff",
                                                        fontSize: 17, fontWeight: 800, fontFamily: font,
                                                        boxShadow: `0 4px 16px color-mix(in srgb, ${themeColor} 40%, transparent)`,
                                                        display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
                                                        position: "relative",
                                                    }}>
                                                    入力を確定する
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 20 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                                </button>
                                            </div>
                                        )}
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.sub, padding: "4px 12px 2px", gap: 8, flexWrap: "wrap" }}>
                                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: font }}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                                                入力はいつでも編集できます
                                            </span>
                                            <span style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: font }}>
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill={C.green}><circle cx="12" cy="12" r="10"/></svg>
                                                データは自動保存されます
                                            </span>
                                        </div>
                                    </div>

                                    {/* 単発終了サブモーダル */}
                                    {chainInputSingleEndOpen && (
                                        <div onClick={() => setChainInputSingleEndOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }}>
                                            <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, maxWidth: 360, width: "100%" }}>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: C.purple, marginBottom: 4 }}>単発終了</div>
                                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>時短回数と最終持ち玉を入力</div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                    <label style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
                                                        時短回数（回転）
                                                        <input type="tel" inputMode="numeric" value={chainWizardData.jitanSpins} onChange={(e) => updField("jitanSpins", e.target.value.replace(/[^0-9]/g, ""))}
                                                            style={{ display: "block", marginTop: 4, width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: mono, fontSize: 18, fontWeight: 700, padding: "10px 12px", textAlign: "right" }} />
                                                    </label>
                                                    <label style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>
                                                        最終持ち玉（玉）
                                                        <input type="tel" inputMode="numeric" value={chainWizardData.finalBallsAfterJitan} onChange={(e) => updField("finalBallsAfterJitan", e.target.value.replace(/[^0-9]/g, ""))}
                                                            style={{ display: "block", marginTop: 4, width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: mono, fontSize: 18, fontWeight: 700, padding: "10px 12px", textAlign: "right" }} />
                                                    </label>
                                                </div>
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
                                                    <button className="b" type="button" onClick={() => setChainInputSingleEndOpen(false)} style={{ padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "var(--surface-hi)", border: `1px solid ${C.border}`, color: C.text }}>戻る</button>
                                                    <button className="b" type="button" onClick={onSingleEndConfirm} style={{ padding: "12px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, background: "#16a34a", border: "none", color: "#fff" }}>記録完了</button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* ====== 画面 C：ラッシュ終了 - 最終実測持ち玉入力 + 集計 ====== */
                                <>
                                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{ background: "var(--surface)", border: `1px solid ${C.orange}`, borderRadius: 14, padding: "14px 16px" }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 4 }}>RUSH終了 — 最後に残った玉数</div>
                                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>玉箱・カウンターの数字を入力してください。開始前の玉数との差が今回の出玉になります。</div>
                                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, padding: "12px 0" }}>
                                                <span style={{ fontSize: 44, fontWeight: 800, color: C.green, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{f(Number(chainWizardData.finalRealBalls) || 0)}</span>
                                                <span style={{ fontSize: 14, color: C.sub, fontWeight: 700 }}>玉</span>
                                            </div>
                                            <div style={{ fontSize: 10, color: C.sub, textAlign: "center" }}>開始前の玉数 {f(chainTrayBalls)}玉 / 今回の出玉 {sp((Number(chainWizardData.finalRealBalls) || 0) - chainTrayBalls)}玉</div>
                                            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
                                                {[-100, -50, -10, +10, +50, +100].map(delta => (
                                                    <button key={delta} className="b" type="button"
                                                        onClick={() => { const cur = Number(chainWizardData.finalRealBalls) || 0; setChainWizardData(d => ({ ...d, finalRealBalls: String(Math.max(0, cur + delta)) })); }}
                                                        style={{ flex: 1, minHeight: 36, padding: "0 6px", borderRadius: 8, fontWeight: 700, fontSize: 12,
                                                            background: delta > 0 ? `color-mix(in srgb, ${C.green} 16%, transparent)` : `color-mix(in srgb, ${C.red} 16%, transparent)`,
                                                            border: `1px solid ${delta > 0 ? C.green : C.red}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                        {delta > 0 ? "+" : ""}{delta}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* 集計表示 */}
                                        <div style={{ background: "var(--surface)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
                                            <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, marginBottom: 8 }}>チェーン集計</div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>総R数</span><span style={{ fontFamily: mono, fontWeight: 700 }}>{chainTotalRounds}R</span></div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>開始前の玉数</span><span style={{ fontFamily: mono, fontWeight: 700 }}>{f(chainTrayBalls)}玉</span></div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>総サポ回転</span><span style={{ fontFamily: mono, fontWeight: 700 }}>{f(chainTotalSapoRot)}回転</span></div>
                                                {(() => {
                                                    // サポ増減（残差）= 今回の出玉（最終玉−開始玉）− 大当たり出玉分（総R×1R出玉）
                                                    const finalN = Number(chainWizardData.finalRealBalls) || 0;
                                                    const residualSapo = finalN > 0 ? Math.round((finalN - chainTrayBalls) - chainTotalRounds * (Number(S.spec1R) || 140)) : 0;
                                                    return (
                                                        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>サポ増減(残差)</span><span style={{ fontFamily: mono, fontWeight: 700, color: sc(residualSapo) }}>{finalN > 0 ? sp(residualSapo) + "玉" : "—"}</span></div>
                                                    );
                                                })()}
                                                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.sub }}>連数</span><span style={{ fontFamily: mono, fontWeight: 700, color: C.yellow }}>{chainHits.length + 1}連</span></div>
                                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                    <span style={{ color: C.sub }}>純増（実測）</span>
                                                    <span style={{ fontFamily: mono, fontWeight: 800, color: sc((Number(chainWizardData.finalRealBalls) || 0) - chainTrayBalls) }}>{sp((Number(chainWizardData.finalRealBalls) || 0) - chainTrayBalls)}玉</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* テンキー */}
                                    <div className="jp-keypad" style={{
                                        padding: "6px 10px",
                                        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
                                        background: "var(--surface-hi)",
                                        borderTop: `1px solid ${C.border}`,
                                        flexShrink: 0
                                    }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                                            <button className="b" type="button" onClick={() => { setChainWizardStep(0); setChainWizardFirstKey(true); }}
                                                style={{ padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text }}>戻る</button>
                                            <button className="b" type="button"
                                                onClick={() => {
                                                    const value = Number(chainWizardData.finalRealBalls) || 0;
                                                    const edited = value !== chainWizardInitialFinalBalls;
                                                    handleChainWizardComplete(true, { value, edited });
                                                }}
                                                style={{ padding: "12px 0", borderRadius: 10, fontWeight: 800, fontSize: 14, background: "#16a34a", border: "none", color: "#fff" }}>結果を保存</button>
                                        </div>
                                        {/* 計算値リセット — テンキー上部に独立配置 */}
                                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
                                            <button className="b" type="button" onClick={() => setChainWizardData(d => ({ ...d, finalRealBalls: String(chainWizardInitialFinalBalls || 0) }))}
                                                style={{ padding: "8px 24px", borderRadius: 10, fontWeight: 700, fontSize: 12, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.sub, minHeight: 36 }}>
                                                計算値に戻す
                                            </button>
                                        </div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                                <button key={n} className="b" type="button"
                                                    onClick={() => {
                                                        setChainWizardData(d => {
                                                            const cur = d.finalRealBalls != null ? String(d.finalRealBalls) : "";
                                                            const next = chainWizardFirstKey ? String(n) : (cur === "0" ? String(n) : cur + n);
                                                            return { ...d, finalRealBalls: next };
                                                        });
                                                        setChainWizardFirstKey(false);
                                                    }}
                                                    style={{ padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 20, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 44 }}>
                                                    {n}
                                                </button>
                                            ))}
                                            <button className="b" type="button" onClick={() => { setChainWizardData(d => ({ ...d, finalRealBalls: "" })); setChainWizardFirstKey(false); }}
                                                style={{ gridColumn: "1 / span 1", gridRow: "4 / span 1", padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, background: `color-mix(in srgb, ${C.red} 18%, transparent)`, border: `1px solid color-mix(in srgb, ${C.red} 40%, transparent)`, color: C.red, minHeight: 44 }}>
                                                消去
                                            </button>
                                            <button className="b" type="button"
                                                onClick={() => {
                                                    setChainWizardData(d => {
                                                        const cur = d.finalRealBalls != null ? String(d.finalRealBalls) : "";
                                                        return { ...d, finalRealBalls: chainWizardFirstKey ? "0" : (cur === "" ? "" : cur + "0") };
                                                    });
                                                    setChainWizardFirstKey(false);
                                                }}
                                                style={{ gridColumn: "2 / span 1", gridRow: "4 / span 1", padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 20, fontFamily: mono, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.text, minHeight: 44 }}>
                                                0
                                            </button>
                                            <button className="b" type="button"
                                                onClick={() => {
                                                    setChainWizardData(d => {
                                                        const cur = d.finalRealBalls != null ? String(d.finalRealBalls) : "";
                                                        return { ...d, finalRealBalls: cur.slice(0, -1) };
                                                    });
                                                    setChainWizardFirstKey(false);
                                                }}
                                                style={{ gridColumn: "3 / span 1", gridRow: "4 / span 1", padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 18, background: "var(--surface)", border: `1px solid ${C.border}`, color: C.sub, minHeight: 44 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })(),
                document.body
            )}

            {/* 直接単発終了モーダル */}
            {directSingleEndOpen && ReactDOM.createPortal(
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 9999, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "var(--bg)" }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{directSingleEndMode === "rush" ? "RUSH終了" : "単発終了"}</span>
                        <div style={{ width: 70 }} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "var(--bg)" }}>
                        {directSingleEndStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}
                        {directSingleEndStep === 1 && (() => {
                            const lastHit = lastChain && lastChain.hits.length > 0 ? lastChain.hits[lastChain.hits.length - 1] : null;
                            const estimated = lastHit ? (Number(lastHit.nextTimingBalls) || 0) : 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 8 }}>時短終了後の出玉</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>実際の持ち玉（カード＋上皿）</div>
                                    {estimated > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回ラウンド終了時: {f(estimated)}玉（自動プリセット済み）</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {directSingleEndData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(directSingleEndData.finalBallsAfterJitan) || 0; setDirectSingleEndData(d => ({ ...d, finalBallsAfterJitan: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                    <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "var(--bg)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => { if (directSingleEndStep === 0) setDirectSingleEndOpen(false); else setDirectSingleEndStep(0); }}
                                style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>{directSingleEndStep === 0 ? "キャンセル" : "戻る"}</button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={directSingleEndMode === "rush" ? handleRushEndComplete : handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>記録完了</button>
                            ) : (
                                <button className="b" onClick={() => {
                                    // Step 0 → 1 に進む時に時短終了後出玉を自動プリセット（前ヒットのラウンド終了時持ち玉）
                                    if (!directSingleEndData.finalBallsAfterJitan) {
                                        const lastHit = lastChain && lastChain.hits.length > 0 ? lastChain.hits[lastChain.hits.length - 1] : null;
                                        const estimated = lastHit ? (Number(lastHit.nextTimingBalls) || 0) : 0;
                                        if (estimated > 0) {
                                            setDirectSingleEndData(d => ({ ...d, finalBallsAfterJitan: String(estimated) }));
                                        }
                                    }
                                    setDirectSingleEndStep(1);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#2f6fed", border: "none", color: "#fff" }}>次へ</button>
                            )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <button key={n} className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: (d[field] === "0" ? String(n) : (d[field] || "") + n) })); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                            ))}
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: "" })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>消去</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => (d[field] === "" ? d : { ...d, [field]: d[field] + "0" })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                            <button className="b" onClick={() => { const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan"; setDirectSingleEndData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); }}
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "var(--surface-hi)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
