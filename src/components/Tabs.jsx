import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, sp, tsNow, font, mono } from "../constants";
import { NI, Card, MiniStat, Btn, SecLabel, KV, ModeToggle, ModeBadge } from "./Atoms";
import { machineDB, searchMachines } from "../machineDB";

/* ================================================================
   Simple SVG Line Chart component
================================================================ */
function LineChart({ data, width = 320, height = 140, color = "#3b82f6", showZero = true }) {
    if (!data || data.length < 2) return null;
    const pad = { top: 10, right: 10, bottom: 20, left: 45 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const vals = data.map(d => d.value);
    const minV = Math.min(...vals, showZero ? 0 : Infinity);
    const maxV = Math.max(...vals, showZero ? 0 : -Infinity);
    const range = maxV - minV || 1;

    const points = data.map((d, i) => {
        const x = pad.left + (i / (data.length - 1)) * w;
        const y = pad.top + h - ((d.value - minV) / range) * h;
        return { x, y, ...d };
    });

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

    // Zero line
    const zeroY = pad.top + h - ((0 - minV) / range) * h;

    // Y-axis labels
    const yLabels = [maxV, Math.round((maxV + minV) / 2), minV].map(v => ({
        v, y: pad.top + h - ((v - minV) / range) * h
    }));

    return (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
            {/* Grid lines */}
            {yLabels.map((l, i) => (
                <g key={i}>
                    <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
                    <text x={pad.left - 4} y={l.y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize={8} fontFamily="monospace">
                        {l.v >= 1000 || l.v <= -1000 ? (l.v / 1000).toFixed(0) + "k" : l.v.toLocaleString()}
                    </text>
                </g>
            ))}
            {/* Zero line */}
            {showZero && minV < 0 && maxV > 0 && (
                <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,3" />
            )}
            {/* Area fill */}
            <path d={`${pathD} L ${points[points.length - 1].x} ${pad.top + h} L ${points[0].x} ${pad.top + h} Z`}
                fill={`url(#grad-${color.replace("#", "")})`} />
            <defs>
                <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {/* Line */}
            <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {/* Dots */}
            {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth={1} />
            ))}
            {/* X-axis labels (show first, middle, last) */}
            {[0, Math.floor(data.length / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
                <text key={i} x={points[i].x} y={height - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8}>
                    {data[i].label}
                </text>
            ))}
        </svg>
    );
}

/* ================================================================
   機種設定タブ用の小さなインラインSVGアイコン群
================================================================ */
function InfoIcon({ size = 14, color }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke={color || C.blue} strokeWidth="2" fill={color ? `color-mix(in srgb, ${color} 18%, transparent)` : `color-mix(in srgb, ${C.blue} 18%, transparent)`} />
            <line x1="12" y1="11" x2="12" y2="17" stroke={color || C.blue} strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="12" cy="7.5" r="1.3" fill={color || C.blue} />
        </svg>
    );
}
function PencilIcon({ size = 16, color = "currentColor" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M14.06 4.94l4 4M3 21l4.5-1L19 8.5l-3.5-3.5L4 16.5 3 21z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function LightbulbIcon({ size = 20, color = C.yellow }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.5 1 2.5h6c0-1 .3-1.7 1-2.5A6 6 0 0 0 12 3z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill={`color-mix(in srgb, ${color} 14%, transparent)`} />
        </svg>
    );
}
function CoinIcon({ size = 18, color = "#fff" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="2" />
            <circle cx="12" cy="12" r="4.5" stroke={color} strokeWidth="1.6" opacity="0.7" />
        </svg>
    );
}
function SwapIcon({ size = 18, color = "#fff" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M4 8h13l-3-3M20 16H7l3 3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function StoreIcon({ size = 18, color = "#fff" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M4 9l1-4h14l1 4M5 9v10h14V9M9 14h6v5H9z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
function HashIcon({ size = 18, color = "#fff" }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

/* ヒーローセクションのプレースホルダ機種アイコン (グラデーション + P) */
function MachinePlaceholder({ active }) {
    const grad = active
        ? `linear-gradient(135deg, ${C.blue} 0%, ${C.purple} 100%)`
        : "linear-gradient(135deg, #3a3f4a 0%, #22262e 100%)";
    return (
        <div style={{
            width: 80, height: 80, borderRadius: 16, background: grad,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            boxShadow: active ? "0 6px 18px rgba(47, 111, 237, 0.35)" : "none",
        }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: "#fff", fontFamily: font, letterSpacing: 1 }}>P</span>
        </div>
    );
}

/* セクションヘッダー (ラベル + ⓘ) */
function SectionHeader({ label }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px 8px" }}>
            <span style={{ fontSize: 11, letterSpacing: 0.5, color: C.sub, fontFamily: font, fontWeight: 600 }}>{label}</span>
            <InfoIcon size={14} />
        </div>
    );
}

/* ピル型サブカード (グラデーション円アイコン + ラベル + 値) */
function SettingPill({ gradient, icon, label, value, mono: useMono }) {
    return (
        <div style={{
            background: "var(--surface-hi)",
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            minHeight: 64,
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: "50%", background: gradient,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
                {icon}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.sub, marginBottom: 2 }}>{label}</span>
                <span style={{
                    fontSize: 15, fontWeight: 700, color: C.text,
                    fontFamily: useMono ? mono : font,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{value}</span>
            </div>
        </div>
    );
}

/* ================================================================
   共通ヘルパ（C-4 表示／C-2 Undo）
================================================================ */
// rotRows に "data" 行が 1 件以上あるか
const hasRotDataRows = (rotRows) => (rotRows || []).some((r) => r.type === "data");

// カード冒頭に出すデータ未入力サブテキスト
function EmptySub({ msg }) {
    return (
        <div style={{ fontSize: 11, color: C.sub, padding: "8px 16px 0", lineHeight: 1.4 }}>
            {msg}
        </div>
    );
}

// Undo / Redo の丸ボタン群（長押し0.4秒で発火、即タップ無効）
function UndoControls({ S }) {
    const longPressRef = useRef(null);
    const firedRef = useRef(false);

    const startLongPress = (action) => {
        firedRef.current = false;
        longPressRef.current = setTimeout(() => {
            firedRef.current = true;
            longPressRef.current = null;
            action();
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(40);
        }, 400);
    };
    const cancelLongPress = () => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    };

    const btn = (label, onAction, enabled, key) => (
        <button
            key={key}
            onPointerDown={() => enabled && startLongPress(onAction)}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onPointerCancel={cancelLongPress}
            onClick={(e) => {
                if (!firedRef.current) e.preventDefault();
            }}
            disabled={!enabled}
            style={{
                width: 44, height: 44, borderRadius: 22,
                border: "none",
                background: enabled ? C.surfaceHi : "transparent",
                color: enabled ? C.text : C.sub,
                fontSize: 20,
                fontWeight: 700,
                margin: "0 2px",
                touchAction: "manipulation",
                cursor: enabled ? "pointer" : "default",
                opacity: enabled ? 1 : 0.35,
                fontFamily: font,
            }}
            aria-label={label === "↶" ? "元に戻す（長押し）" : "やり直し（長押し）"}
        >{label}</button>
    );

    return (
        <div style={{ display: "flex" }}>
            {btn("↶", S.undo, S.canUndo, "undo")}
            {btn("↷", S.redo, S.canRedo, "redo")}
        </div>
    );
}

/* ================================================================
   DataTab — 全データ一覧表示 + グラフ
================================================================ */
export function DataTab({ ev, jpLog, S }) {
    const stat = (label, val, unit, col) => (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: col, fontFamily: mono }}>{val}</span>
                <span style={{ fontSize: 10, color: C.sub }}>{unit}</span>
            </div>
        </div>
    );

    // Build cumulative EV graph data from archives + current session
    const archives = S.archives || [];
    const evGraphData = useMemo(() => {
        const points = [];
        let cumEV = 0;
        archives.forEach((a) => {
            const w = a.stats?.workAmount || 0;
            cumEV += w;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumEV) });
        });
        // Add current session
        if (ev.workAmount !== 0) {
            cumEV += ev.workAmount;
            points.push({ label: "今日", value: Math.round(cumEV) });
        }
        return points;
    }, [archives, ev.workAmount]);

    // Build cumulative profit/loss graph from archives (actual results based)
    const plGraphData = useMemo(() => {
        const points = [];
        let cumPL = 0;
        archives.forEach((a) => {
            const st = a.stats || {};
            // Use workAmount as proxy for daily result
            const daily = st.workAmount || 0;
            cumPL += daily;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumPL) });
        });
        if (ev.workAmount !== 0) {
            cumPL += ev.workAmount;
            points.push({ label: "今日", value: Math.round(cumPL) });
        }
        return points;
    }, [archives, ev.workAmount]);

    const hasRot = hasRotDataRows(S.rotRows);
    const hasJp = (jpLog || []).length > 0;

    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* 回転率・ボーダー */}
            <Card style={{ marginTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 8 }}>
                    <SecLabel label="回転率・ボーダー" />
                    <UndoControls S={S} />
                </div>
                {!hasRot && <EmptySub msg="回転データなし（入力するとここに表示されます）" />}
                {stat("1Kスタート", hasRot ? f(ev.start1K, 1) : "—", "回/K", sc(ev.bDiff))}
                {stat("理論ボーダー", ev.theoreticalBorder > 0 ? f(ev.theoreticalBorder, 1) : "—", "回/K", C.subHi)}
                {stat("ボーダー差", hasRot ? sp(ev.bDiff, 1) : "—", "回/K", sc(ev.bDiff))}
            </Card>

            {/* 期待値・収支 */}
            <Card>
                <SecLabel label={ev.evSource === "spec" ? "期待値・収支（スペック基準）" : ev.evSource === "measured" ? "期待値・収支（実測）" : "期待値・収支"} />
                {!hasRot && <EmptySub msg="回転データなし" />}
                {stat("期待値/K", hasRot ? sp(ev.ev1K, 0) : "—", "円", sc(ev.ev1K))}
                {stat("単価", hasRot ? sp(ev.evPerRot, 2) : "—", "円/回", sc(ev.evPerRot))}
                {stat("仕事量", hasRot ? sp(ev.workAmount, 0) : "—", "円", sc(ev.workAmount))}
                {stat("時給", hasRot ? sp(ev.wage, 0) : "—", "円/h", sc(ev.wage))}
            </Card>

            {/* 期待値グラフ */}
            {evGraphData.length >= 2 && (
                <Card style={{ padding: "12px 8px" }}>
                    <SecLabel label="累計期待値（仕事量）推移" />
                    <LineChart data={evGraphData} color="#3b82f6" />
                </Card>
            )}

            {/* 出玉データ */}
            <Card>
                <SecLabel label="出玉データ" />
                {!hasJp && <EmptySub msg="大当たり履歴なし" />}
                {stat("平均1R出玉", ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", "玉", C.teal)}
                {stat("平均R数/初当たり", ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", "R", C.blue)}
                {stat("サポ増減/回転", ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", "玉/回転", sc(ev.sapoPerRot))}
                {stat("平均純増/初当たり", ev.avgNetGainPerJP > 0 ? f(ev.avgNetGainPerJP, 0) : "—", "玉", C.green)}
            </Card>

            {/* 稼働データ */}
            <Card>
                <SecLabel label="稼働データ" />
                {!hasRot && <EmptySub msg="投資・回転データなし" />}
                {stat("初当たり回数", jpLog.length > 0 ? jpLog.length.toString() : "0", "回", C.green)}
                {stat("総回転数", hasRot ? f(ev.netRot) : "—", "回", C.subHi)}
                {stat("総投資額", hasRot ? f(ev.rawInvest) : "—", "円", C.red)}
                {ev.trayBallsYen > 0 && stat("上皿補正", "-" + f(ev.trayBallsYen), "円", C.teal)}
                {ev.correctedInvestYen > 0 && ev.trayBallsYen > 0 && stat("実質投資", f(Math.round(ev.correctedInvestYen)), "円", C.yellow)}
                {stat("持ち玉比率", ev.mochiRatio > 0 ? Math.round(ev.mochiRatio * 100).toString() : "0", "%", C.orange)}
            </Card>
        </div>
    );
}

/* ================================================================
   RotTab — 回転数入力 + リアルタイム実測統計パネル（刷新版）
================================================================ */
export function RotTab({ border: displayBorder, rows, setRows, S, ev }) {
    // 回転色判定にはEVで使用しているボーダーを優先
    const border = ev.useBorder > 0 ? ev.useBorder : displayBorder;
    const [input, setInput] = useState("");
    const [inputError, setInputError] = useState("");
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showStoreDD, setShowStoreDD] = useState(false);
    const [showMachineDD, setShowMachineDD] = useState(false);
    const [machineQuery, setMachineQuery] = useState("");
    const [summaryCollapsed, setSummaryCollapsed] = useState(true);
    const [showInvestSettings, setShowInvestSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const tableRef = useRef(null);

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

    // 初当たりウィザード用state
    const [hitWizardOpen, setHitWizardOpen] = useState(false);
    const [hitWizardStep, setHitWizardStep] = useState(0);
    const [hitWizardData, setHitWizardData] = useState({
        trayBalls: "", rounds: 0, displayBalls: "", actualBalls: "",
        hitType: "", // "単発" or "確変"
        jitanSpins: "", // 時短回数
        finalBallsAfterJitan: "" // 時短終了後最終出玉
    });
    const [activeKeypadField, setActiveKeypadField] = useState(null); // "trayBalls" | "displayBalls" | "actualBalls" | "jitanSpins" | "finalBalls"

    // 機種からラウンド情報を取得（初当たり用 - roundDist使用）
    const getMachineRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine || !machine.roundDist) return [3, 4, 5, 6, 7, 8, 9, 10]; // デフォルト
        // roundDist例: "4R:50%, 10R:50%" → [4, 10]
        const matches = machine.roundDist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRounds = useMemo(getMachineRounds, [S.machineName, S.customMachines]);

    // 機種から確変中のラウンド情報を取得（連チャン用 - rushDist使用、なければroundDistにフォールバック）
    const getMachineRushRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        const defaultOpts = [3,4,5,6,7,8,9,10].map(r => ({ rounds: r, mult: 1 }));
        if (!machine) return defaultOpts;
        const dist = machine.rushDist || machine.roundDist;
        if (!dist) return defaultOpts;
        const re = /(\d+)R(?:×(\d+))?/g;
        const found = [];
        const seen = new Set();
        let m;
        while ((m = re.exec(dist)) !== null) {
            const rounds = parseInt(m[1]);
            const mult = m[2] ? parseInt(m[2]) : 1;
            const key = `${rounds}-${mult}`;
            if (!seen.has(key)) { seen.add(key); found.push({ rounds, mult }); }
        }
        if (found.length === 0) return defaultOpts;
        return found.sort((a, b) => a.rounds - b.rounds || a.mult - b.mult);
    };
    const machineRushRounds = useMemo(getMachineRushRounds, [S.machineName, S.customMachines]);

    // ========== 大当たり履歴タブ用state（HistoryTabから移植） ==========
    const [historySub, setHistorySub] = useState("jp"); // "jp" or "ses"

    // 長押し削除用state
    const longPressTimerRef = useRef(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState(null);

    // 連打ロック（同フレームの二度押し抑止）
    const endLockRef = useRef(false);
    const submitLockRef = useRef(false);

    // 大当たり履歴 編集モーダル用state（古いデータの修正用）
    const [editChainOpen, setEditChainOpen] = useState(false);
    const [editChainId, setEditChainId] = useState(null);
    const [editChainHits, setEditChainHits] = useState([]);

    // 連チャン追加ウィザード state
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true);
    const [chainWizardData, setChainWizardData] = useState({
        rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "",
        hitType: "", jitanSpins: "", finalBallsAfterJitan: ""
    });

    // 直接単発終了モーダル state
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0);
    const [directSingleEndData, setDirectSingleEndData] = useState({ jitanSpins: "", finalBallsAfterJitan: "" });

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
        setChainWizardData({ rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
    };

    // 連チャン追加ウィザードを開始
    const openChainWizard = () => {
        const prevEndBalls = getPrevEndBalls();
        setChainWizardData({
            rounds: 0, displayBalls: "", lastOutBalls: String(prevEndBalls),
            nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: ""
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardOpen(true);
    };

    // mult (×N) 対応: 1エントリーを 1 hit として保存（液晶演出上1連 = データ上も1 hit）
    // rounds / displayBalls は全連合算、mult / rawRounds は表示用
    const buildSingleHit = (hitNumber, { rnd, mult, disp, lastOut, nextTiming, elecRot }) => {
        const multN = Math.max(1, Number(mult) || 1);
        const totalRounds = rnd * multN;
        const totalDisp = disp * multN;
        const sapoChange = nextTiming - lastOut - totalDisp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;
        return {
            hitNumber,
            mult: multN,
            rawRounds: rnd,
            rounds: totalRounds,
            displayBalls: totalDisp,
            lastOutBalls: lastOut,
            nextTimingBalls: nextTiming,
            elecSapoRot: elecRot,
            sapoChange,
            sapoPerRot,
            actualBalls: 0,
            time: tsNow(),
        };
    };

    // 連チャン追加ウィザード完了（継続 or 最終）
    const handleChainWizardComplete = (isFinal = false) => {
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

    // 直接単発終了を開く
    const openDirectSingleEnd = () => {
        if (!isChainActive || lastChain.hits.length === 0) return;
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

    // 大当り終了
    const handleChainEnd = () => {
        if (endLockRef.current) return;
        if (!isChainActive) return;
        const currentHitsCount = lastChain.hits.length;
        if (currentHitsCount === 0) return; // ヒットがない場合は終了できない
        S.pushSnapshot();
        endLockRef.current = true;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || h.sapoRot || 0), 0);
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
            updated[updated.length - 1] = chain;
            return updated;
        });
        const finalBallsToAdd = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
        S.pushLog({ type: "連チャン終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setSessionSubTab("rot");
        S.setShowStartPrompt(true);
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
        setEditChainId(chainId);
        setEditChainHits(editable);
        setEditChainOpen(true);
    };

    const handleEditChainSave = () => {
        if (!editChainId) { setEditChainOpen(false); return; }
        let oldFinalBalls = 0;
        let newFinalBalls = 0;
        S.setJpLog((prev) => {
            const updated = [...prev];
            const idx = updated.findIndex(c => c.chainId === editChainId);
            if (idx < 0) return prev;
            const chain = { ...updated[idx] };
            oldFinalBalls = chain.finalBalls || 0;
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
            chain.summary = {
                totalRounds, totalDisplayBalls, totalSapoRot, totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
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
        setEditChainOpen(false);
        setEditChainId(null);
        setEditChainHits([]);
    };
    // ========== 大当たり履歴タブ用state ここまで ==========

    // セットアップ用の一時state
    const [setupStore, setSetupStore] = useState("");
    const [setupMachineNum, setSetupMachineNum] = useState("");
    const [setupMachineName, setSetupMachineName] = useState("");
    const [setupStartRot, setSetupStartRot] = useState("");
    const [setupInitialBalls, setSetupInitialBalls] = useState("");

    // 機種検索結果
    const machineResults = useMemo(() => {
        if (!machineQuery.trim()) return [];
        return searchMachines(machineQuery, S.customMachines).slice(0, 8);
    }, [machineQuery, S.customMachines]);

    // 機種設定 編集モーダル用の検索結果
    const editMachineResults = useMemo(() => {
        if (!editMachineQuery.trim()) return [];
        return searchMachines(editMachineQuery, S.customMachines).slice(0, 8);
    }, [editMachineQuery, S.customMachines]);

    // 現在の機種からタイプ(ミドル/甘デジ等)を解決
    const currentMachineType = useMemo(() => {
        if (!S.machineName) return "";
        const all = [...machineDB, ...(S.customMachines || [])];
        const hit = all.find(m => m && m.name === S.machineName);
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

    const rotCol = (v) => {
        if (v == null || isNaN(v)) return C.text;
        if (v >= border + 3) return C.green;
        if (v >= border) return "#86efac";
        if (v >= border - 3) return C.yellow;
        return C.red;
    };

    // 行背景色（ボーダー超えでも帯は表示しない）
    const rowBg = (v, isEven) => {
        return isEven ? "transparent" : "transparent";
    };

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

    const decide = () => {
        if (submitLockRef.current) return;
        const val = validateInput();
        if (val === null) return;

        // 前回の累計回転数: 全ての行（data, start, hit）で最後の行を見る
        const lastRow = rows[rows.length - 1];
        const prevCumRot = lastRow ? lastRow.cumRot : S.startRot;

        // 逆行ガード: 前回累計以下の値は誤入力か台リセットの可能性が高い
        let resetInsert = false;
        if (val <= prevCumRot) {
            const ok = window.confirm(
                `前回累計回転(${prevCumRot})以下の値です。\n台がリセットされましたか？\n\nOK: リセット記録を作成して回転を記録\nキャンセル: 入力をやり直す`
            );
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

        let newInvest = prevInvest;
        let ballsConsumed = 0;

        if (S.playMode === "cash") {
            // 現金モード：投資額を増加
            newInvest = prevInvest + investPace;
        } else if (S.playMode === "mochi") {
            // 持ち玉モード：投資は増えない、持ち玉を減らす
            ballsConsumed = rentBalls * (investPace / 1000); // 1Kあたりの玉数
            S.setCurrentMochiBalls((prev) => Math.max(0, prev - ballsConsumed));
        } else if (S.playMode === "chodama") {
            // 貯玉モード：貯玉を消費（現金投資には反映しない）
            ballsConsumed = rentBalls * (investPace / 1000);
            S.setCurrentChodama((prev) => Math.max(0, prev - ballsConsumed));
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
        if (S.playMode === "mochi") {
            mochiK += ballsConsumed / rentBalls;
        } else if (S.playMode === "chodama") {
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
                ? [...r, { type: "start", cumRot: 0, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true }]
                : r;

            // 逆行ガード後・最新 r ベースで thisRot を再計算
            const liveThisRot = resetInsert ? val : Math.max(0, val - livePrevCumRot);

            // 投資額: 現金=増、貯玉/持ち玉=据え置き（A-4）
            const liveNewInvest = (S.playMode === "cash") ? livePrevInvest + investPace : livePrevInvest;

            return [...baseRows, {
                type: "data",
                thisRot: liveThisRot,
                cumRot: val,
                avgRot: newAvg,
                invest: liveNewInvest,
                mode: S.playMode,
                ballsConsumed,
                mochiBalls: S.playMode === "mochi" ? Math.max(0, S.currentMochiBalls - ballsConsumed) : S.currentMochiBalls,
                chodamaBalls: S.playMode === "chodama" ? Math.max(0, S.currentChodama - ballsConsumed) : S.currentChodama
            }];
        });

        const logType = S.playMode === "mochi"
            ? `持ち玉${ballsConsumed}玉消費`
            : S.playMode === "chodama"
            ? `貯玉${ballsConsumed}玉消費`
            : `${investPace >= 1000 ? investPace/1000 + "K" : investPace + "円"}決定`;
        S.pushLog({ type: logType, time: tsNow(), rot: thisRot, cash: S.playMode === "mochi" ? 0 : investPace, mode: S.playMode });
        setInput("");
        setInputError("");
        setTimeout(() => { submitLockRef.current = false; }, 0);
    };

    // 新規稼働開始
    const handleStartSession = () => {
        const val = Number(setupStartRot) || 0;

        // 店舗・機種設定を適用
        if (setupStore) S.setStoreName(setupStore);
        if (setupMachineNum) S.setMachineNum(setupMachineNum);
        if (setupMachineName) S.setMachineName(setupMachineName);
        // 新規稼働開始時は貯玉を設定（未入力なら0でリセット）
        const initialChodama = Number(setupInitialBalls) || 0;
        S.setCurrentChodama(initialChodama);
        S.setInitialChodama(initialChodama);
        // 持ち玉は0にリセット（移動時に設定する）
        S.setCurrentMochiBalls(0);

        // セッション開始
        S.setStartRot(val);
        S.setSessionStarted(true);
        setRows((r) => [...r, { type: "start", cumRot: val, mode: S.playMode, mochiBalls: 0, chodamaBalls: initialChodama }]);
        S.pushLog({ type: "スタート", time: tsNow(), rot: val });

        // モーダルを閉じてリセット
        setShowSetupModal(false);
        setSetupStore("");
        setSetupMachineNum("");
        setSetupMachineName("");
        setSetupStartRot("");
        setSetupInitialBalls("");
    };

    // 初当たりボタン → ウィザード開始
    const handleStartChain = () => {
        const val = Number(input);
        const prevCumRot = last ? last.cumRot : S.startRot;
        const hitRot = val > 0 ? val : (prevCumRot || 0);
        const hitThisRot = val > 0 ? val - prevCumRot : 0;
        const chainId = Date.now();

        // 回転数テーブルに初当たりマーカー行を追加（chainIdで大当たり履歴と紐付け）
        if (val > 0) {
            setRows(r => [...r, { type: "hit", chainId, cumRot: val, thisRot: hitThisRot, invest: last ? last.invest : 0, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama }]);
        }

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
        });
        S.pushLog({ type: "初当たり", time: tsNow(), rot: hitRot });
        setInput("");
        // ウィザードを開始
        setHitWizardData({ trayBalls: "", rounds: 3, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setHitWizardStep(0);
        setHitWizardOpen(true);
    };

    // ウィザード完了時の処理
    // ウィザード完了: 単発の場合はチェーン完了、確変の場合はHistoryTabへ
    // overrideHitType: 確変ボタンから直接呼ばれる場合に使用（setStateが非同期のため）
    const handleWizardComplete = (overrideHitType) => {
        if (endLockRef.current) return;
        const { trayBalls, rounds, displayBalls, actualBalls, hitType: stateHitType, jitanSpins, finalBallsAfterJitan } = hitWizardData;
        const hitType = overrideHitType || stateHitType;
        const rnd = Number(rounds) || 0;
        const tray = Number(trayBalls) || 0;
        const disp = Number(displayBalls) || 0;
        const actual = Number(actualBalls) || 0;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        if (rnd <= 0) {
            setHitWizardOpen(false);
            return;
        }
        S.pushSnapshot();
        endLockRef.current = true;

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
                rounds: rnd,
                displayBalls: disp,
                actualBalls: actual,
                time: tsNow(),
            }];

            // 単発の場合: チェーンを完了させる
            if (hitType === "単発") {
                chain.hitType = "単発";
                chain.jitanSpins = jitan;
                chain.finalBallsAfterJitan = finalBalls;
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

        S.pushLog({ type: hitType === "単発" ? "単発終了" : "初当たり記録", time: tsNow(), rounds: rnd });
        setHitWizardOpen(false);
        setHitWizardData({ trayBalls: "", rounds: 3, displayBalls: "", actualBalls: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });

        // 確変の場合: HistoryTabで連チャン記録継続
        if (hitType === "確変") {
            S.setSessionSubTab("history");
        } else {
            // 単発の場合: 持ち玉モードに切替 & 出玉を持ち玉に加算 & 回転タブへ
            const addBalls = finalBalls > 0 ? finalBalls : (tray + disp);
            S.setCurrentMochiBalls((prev) => prev + addBalls);
            S.setPlayMode("mochi");
            S.setTab("rot");
            // 時短終了後のスタート入力プロンプトを表示
            S.setShowStartPrompt(true);
        }
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // セッション内サブタブのスワイプ処理
    const sessionSubTabs = ["data", "rot", "history", "settings"];
    const sessionSubTabLabels = { data: "データ", rot: "回転入力", history: "大当たり", settings: "機種設定" };
    const swipeAreaRef = useRef(null);
    const swipeState = useRef({ startX: null, startY: null, dir: null, offset: 0 });
    const [headerSwipeOffset, setHeaderSwipeOffset] = useState(0);
    const [headerIsAnimating, setHeaderIsAnimating] = useState(false);

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

            const currentIndex = sessionSubTabs.indexOf(S.sessionSubTab);
            const isAtStart = currentIndex === 0 && diffX > 0;
            const isAtEnd = currentIndex === sessionSubTabs.length - 1 && diffX < 0;
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
            const currentIndex = sessionSubTabs.indexOf(S.sessionSubTab);

            if (Math.abs(state.offset) > threshold) {
                if (state.offset > 0 && currentIndex > 0) {
                    setHeaderIsAnimating(true);
                    S.setSessionSubTab(sessionSubTabs[currentIndex - 1]);
                    setHeaderSwipeOffset(0);
                    setTimeout(() => setHeaderIsAnimating(false), 180);
                } else if (state.offset < 0 && currentIndex < sessionSubTabs.length - 1) {
                    setHeaderIsAnimating(true);
                    S.setSessionSubTab(sessionSubTabs[currentIndex + 1]);
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
    }, [headerIsAnimating, S.sessionSubTab]);

    // セッション未開始：新規稼働ボタンを中央に表示
    if (!sessionActive) {
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", alignItems: "center", padding: 24 }}>
                {/* 中央の新規稼働ボタン - プレミアムデザイン */}
                <button
                    className="b"
                    onClick={() => setShowSetupModal(true)}
                    style={{
                        width: 140,
                        height: 140,
                        borderRadius: "50%",
                        background: C.blue,
                        border: "none",
                        boxShadow: "0 6px 18px rgba(47,111,237,0.22)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        cursor: "pointer",
                        transition: "transform 0.25s ease, box-shadow 0.25s ease",
                    }}
                >
                    <span style={{ fontSize: 56, color: "#fff", fontWeight: 300, lineHeight: 1 }}>+</span>
                    <span style={{ fontSize: 12, color: "#fff", fontWeight: 700, letterSpacing: 0.5 }}>新規稼働</span>
                </button>

                <p style={{ marginTop: 28, fontSize: 14, color: C.sub, textAlign: "center", lineHeight: 1.7 }}>
                    タップして稼働を開始
                </p>

                {/* 貯玉残高表示 - カード化 */}
                {currentStoreData?.chodama > 0 && (
                    <div className="summary-card" style={{ marginTop: 24, padding: "16px 32px", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>{currentStoreData.name} 貯玉残高</div>
                        <div style={{ fontSize: 28, fontWeight: 900, color: C.purple, fontFamily: mono }}>{f(currentStoreData.chodama)}</div>
                    </div>
                )}

                {/* セットアップモーダル - プレミアムデザイン */}
                {showSetupModal && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
                        <div className="card-premium" style={{ width: "100%", maxWidth: 360, maxHeight: "85vh", overflowY: "auto" }}>
                            <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.border}` }}>
                                <h2 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 6 }}>稼働開始</h2>
                                <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.5 }}>台の情報を入力してください</p>
                            </div>

                            <div style={{ padding: 18 }}>
                                {/* 店舗選択 */}
                                <div style={{ marginBottom: 16, position: "relative" }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>店舗</div>
                                    <div style={{ position: "relative" }}>
                                        <input
                                            type="text"
                                            value={setupStore}
                                            onChange={e => setSetupStore(e.target.value)}
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
                                                        setSetupStore(name);
                                                        if (typeof st === "object") {
                                                            if (st.rentBalls) S.setRentBalls(st.rentBalls);
                                                            if (st.exRate) S.setExRate(st.exRate);
                                                            if (st.chodama) S.setCurrentChodama(st.chodama);
                                                            // 貯玉入力欄を店舗の残高で自動セット
                                                            if (st.chodama) setSetupInitialBalls(String(st.chodama));
                                                            S.setSelectedStoreId(st.id);
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

                                {/* 機種選択 */}
                                <div style={{ marginBottom: 12, position: "relative" }}>
                                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, fontWeight: 600 }}>機種</div>
                                    <input
                                        type="text"
                                        value={setupMachineName}
                                        onChange={e => { setSetupMachineName(e.target.value); setMachineQuery(e.target.value); setShowMachineDD(true); }}
                                        onFocus={() => setShowMachineDD(true)}
                                        placeholder="機種名を検索..."
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "12px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }}
                                    />
                                    {showMachineDD && machineResults.length > 0 && (
                                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, zIndex: 20, maxHeight: 200, overflowY: "auto", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                                            {machineResults.map((m, i) => (
                                                <button key={m.id || i} className="b" onClick={() => {
                                                    setSetupMachineName(m.name);
                                                    S.setSynthDenom(m.synthProb);
                                                    if (m.spec1R) S.setSpec1R(m.spec1R);
                                                    if (m.specAvgTotalRounds) S.setSpecAvgRounds(m.specAvgTotalRounds);
                                                    if (m.specSapo != null) S.setSpecSapo(m.specSapo);
                                                    setShowMachineDD(false);
                                                    setMachineQuery("");
                                                }} style={{
                                                    width: "100%", background: i % 2 === 0 ? "transparent" : "transparent", border: "none", borderBottom: `1px solid ${C.border}`,
                                                    padding: "12px 14px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center"
                                                }}>
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.name}</div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>{m.maker || ""}</div>
                                                    </div>
                                                    <div style={{ fontSize: 14, fontWeight: 700, color: C.yellow, fontFamily: mono }}>{m.prob || `1/${m.synthProb}`}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 台番号・開始回転数 */}
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

                                {/* 貯玉 */}
                                <div style={{ marginBottom: 24 }}>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700, letterSpacing: 0.5 }}>貯玉（任意）</div>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={setupInitialBalls}
                                        onChange={e => setSetupInitialBalls(e.target.value)}
                                        placeholder="0"
                                        style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                    />
                                </div>

                                {/* ボタン - プレミアムデザイン */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <button className="b" onClick={() => setShowSetupModal(false)} style={{
                                        background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`, borderRadius: 14, color: C.text, fontSize: 15, fontWeight: 700, padding: "16px 0", fontFamily: font
                                    }}>キャンセル</button>
                                    <button className="b btn-premium btn-secondary" onClick={handleStartSession}>
                                        稼働開始
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 貯玉使用時の投資額計算（等価4円: 250玉 = 1000円）
    const getChodamaInvestYen = (balls) => {
        const ballValue = 4; // 等価4円
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
    const pressClear = () => { setInputError(""); setInput(""); };
    const pressQuickAdd = (n) => { setInputError(""); setInput(String((Number(input) || 0) + n)); };

    // セッション開始後：データ表示とコントロール
    return (
        <div
            ref={swipeAreaRef}
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
            {/* セッションヘッダー：スワイプ可能なタブ */}
            <div
                style={{
                    flexShrink: 0,
                    borderBottom: `1px solid ${C.border}`,
                    background: "rgba(15,15,20,0.98)"
                }}
            >
                {/* 機種・店舗情報 */}
                <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button className="b" onClick={() => setSummaryCollapsed(!summaryCollapsed)} style={{
                        flex: 1, background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 6
                    }}>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{S.machineName || "機種未設定"}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>{S.storeName} {S.machineNum && `#${S.machineNum}`}</div>
                        </div>
                        <span style={{ fontSize: 8, color: C.sub }}>{summaryCollapsed ? "▼" : "▲"}</span>
                    </button>
                    <button className="b" onClick={() => setShowInvestSettings(true)} style={{
                        background: "var(--surface-hi)", border: `1px solid ${C.border}`, borderRadius: 6,
                        padding: "5px 8px", display: "flex", alignItems: "center", gap: 4
                    }}>
                        <span style={{ fontSize: 11 }}>⚙️</span>
                        <span style={{ fontSize: 10, color: C.subHi, fontWeight: 600 }}>{investPace >= 1000 ? `${investPace/1000}K` : `${investPace}円`}</span>
                    </button>
                </div>

                {/* サマリーカード群（折りたたみ） */}
                {!summaryCollapsed && (
                    <div className="summary-card" style={{ padding: 6, margin: "0 12px 6px", borderRadius: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>回転率</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.bDiff), fontFamily: mono, lineHeight: 1 }}>{ev.start1K > 0 ? f(ev.start1K, 1) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>EV/K</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.ev1K), fontFamily: mono, lineHeight: 1 }}>{ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>仕事量</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: sc(ev.workAmount), fontFamily: mono, lineHeight: 1 }}>{ev.workAmount !== 0 ? sp(ev.workAmount, 0) : "—"}</div>
                            </div>
                            <div className="stat-mini">
                                <div style={{ fontSize: 8, color: C.sub, fontWeight: 600, marginBottom: 2 }}>初当</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: mono, lineHeight: 1 }}>{ev.jpCount || 0}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* スワイプ可能タブバー */}
                <div
                    style={{
                        display: "flex",
                        overflow: "hidden",
                        transform: `translateX(${headerSwipeOffset}px)`,
                        transition: headerIsAnimating ? "transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none"
                    }}
                >
                    {sessionSubTabs.map((tabId) => {
                        const isActive = S.sessionSubTab === tabId;
                        const col = isActive ? C.blue : C.sub;
                        const tabIcon = {
                            data: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round"><path d="M4 20h16" /><rect x="6" y="11" width="3" height="9" rx="0.5" /><rect x="11" y="7" width="3" height="13" rx="0.5" /><rect x="16" y="13" width="3" height="7" rx="0.5" /></svg>
                            ),
                            rot: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
                            ),
                            history: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.9z" /></svg>
                            ),
                            settings: (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
                            ),
                        }[tabId];
                        return (
                            <button
                                key={tabId}
                                className="b"
                                onClick={() => S.setSessionSubTab(tabId)}
                                style={{
                                    flex: 1,
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: isActive ? `3px solid ${C.blue}` : "3px solid transparent",
                                    padding: "10px 4px 8px",
                                    fontSize: 12,
                                    fontWeight: isActive ? 700 : 500,
                                    color: col,
                                    fontFamily: font,
                                    transition: "all 0.2s",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                                }}
                            >
                                {tabIcon}
                                {sessionSubTabLabels[tabId]}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 回転入力タブ — 刷新版 */}
            {S.sessionSubTab === "rot" && (() => {
                const currentRot = Number(input) || (rows.length > 0 ? rows[rows.length - 1].cumRot : 0);
                const totalRotVal = ev.netRot > 0 ? f(ev.netRot) : "0";
                const totalInvVal = ev.rawInvest > 0 ? f(ev.rawInvest) : "0";
                const summaryCards = [
                    { label: "現在の回転数", val: f(currentRot), unit: "回", col: C.blue },
                    { label: "総回転数", val: totalRotVal, unit: "回", col: C.blue },
                    { label: "総投資", val: totalInvVal, unit: "円", col: C.green },
                ];
                const ballsLabel = S.playMode === "chodama" ? "貯玉" : "持ち玉";
                const ballsVal = S.playMode === "chodama" ? (S.currentChodama || 0) : (S.currentMochiBalls || 0);
                const measuredDenom = (ev.jpCount > 0 && ev.netRot > 0)
                    ? "1/" + (ev.netRot / ev.jpCount).toFixed(1)
                    : "—";

                return (
                    <div style={{
                        flex: 1, overflowY: "auto", overscrollBehavior: "contain",
                        padding: "10px 12px",
                        paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
                        display: "flex", flexDirection: "column", gap: 12,
                    }}>
                        {/* A. 上段サマリーカード（3列） */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {summaryCards.map((c) => (
                                <div key={c.label} className="neon-card" style={{ "--neon": c.col }}>
                                    <div className="neon-card__label">{c.label}</div>
                                    <div className="neon-card__row">
                                        <span className="neon-card__num">{c.val}</span>
                                        <span className="neon-card__unit">{c.unit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* B. 回転数を入力 + テンキー + 右側アクション */}
                        <div style={{
                            background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 8,
                            boxShadow: "var(--card-shadow)",
                        }}>
                            {/* ヘッダー：回転数を入力 + ModeToggle */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: C.text, fontFamily: font }}>
                                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: C.blue, boxShadow: `0 0 0 3px color-mix(in srgb, ${C.blue} 25%, transparent)` }} />
                                    回転数を入力
                                </div>
                                <ModeToggle mode={S.playMode} setMode={(m) => { if (m !== S.playMode) S.pushSnapshot(); S.setPlayMode(m); }} showChodama={true} compact={true} />
                            </div>

                            {/* 入力エリア（左：表示+テンキー / 右：アクション縦並び） */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 84px", gap: 6 }}>
                                {/* 左カラム */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                    {/* 入力値ディスプレイ（タップでクリア） */}
                                    <button
                                        className="b"
                                        type="button"
                                        onClick={pressClear}
                                        aria-label="入力をクリア"
                                        style={{
                                            width: "100%", minHeight: 48, borderRadius: 12,
                                            background: `color-mix(in srgb, ${C.blue} 6%, transparent)`,
                                            border: `1px solid color-mix(in srgb, ${C.blue} 30%, transparent)`,
                                            color: input ? C.text : C.sub,
                                            fontFamily: mono, fontSize: 28, fontWeight: 800, lineHeight: 1,
                                            textAlign: "right", padding: "6px 14px",
                                        }}>
                                        {input || "0"}
                                    </button>
                                    {inputError && (
                                        <div className="error-msg" style={{ fontSize: 11, marginTop: 0 }}>{inputError}</div>
                                    )}
                                    {/* 3列テンキー */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                                        {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((d) => (
                                            <button key={d} className="b key-btn" type="button" onClick={() => pressDigit(d)}>{d}</button>
                                        ))}
                                        <button className="b key-btn" type="button" style={{ gridColumn: "1 / span 3" }} onClick={() => pressDigit("0")}>0</button>
                                    </div>
                                </div>

                                {/* 右カラム：削除 / クリア / 記録する / 初当たり */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                    <button className="b key-btn" type="button" aria-label="一文字削除" onClick={pressBackspace} style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" /><line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" /></svg>
                                        <span style={{ fontSize: 11 }}>削除</span>
                                    </button>
                                    <button className="b key-btn" type="button" onClick={pressClear} style={{ fontSize: 12, fontWeight: 700 }}>クリア</button>
                                    <button
                                        className="b btn-premium btn-primary"
                                        type="button"
                                        onClick={decide}
                                        style={{ minHeight: 52, fontSize: 12, fontWeight: 800, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 4px" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>
                                        記録する
                                    </button>
                                    <button
                                        className="b"
                                        type="button"
                                        onClick={handleStartChain}
                                        style={{
                                            minHeight: 52, borderRadius: 10,
                                            background: `color-mix(in srgb, ${C.orange} 18%, transparent)`,
                                            border: `1px solid color-mix(in srgb, ${C.orange} 50%, transparent)`,
                                            color: C.orange, fontSize: 12, fontWeight: 800,
                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 4px",
                                        }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                        初当たり
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* C. クイック追加 */}
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: C.sub, fontFamily: font, marginBottom: 4, letterSpacing: 0.3 }}>クイック追加</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 5 }}>
                                {[1, 5, 10, 25].map((n) => (
                                    <button key={n} className="b quick-add-btn" type="button" onClick={() => pressQuickAdd(n)}>+{n}回転</button>
                                ))}
                            </div>
                        </div>

                        {/* D. 情報カード3枚 */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                            <div className="neon-card" style={{ "--neon": C.green }}>
                                <div className="neon-card__label">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20" /></svg>
                                    現金
                                </div>
                                <div className="neon-card__row">
                                    <span className="neon-card__num">{f(S.investYen || 0)}</span>
                                    <span className="neon-card__unit">円</span>
                                </div>
                                <span className="auto-badge">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                                    自動更新中
                                </span>
                            </div>
                            <div className="neon-card" style={{ "--neon": C.purple }}>
                                <div className="neon-card__label">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>
                                    {ballsLabel}
                                </div>
                                <div className="neon-card__row">
                                    <span className="neon-card__num">{f(ballsVal)}</span>
                                    <span className="neon-card__unit">玉</span>
                                </div>
                                <span className="auto-badge">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                                    自動更新中
                                </span>
                            </div>
                            <div className="neon-card" style={{ "--neon": C.teal }}>
                                <div className="neon-card__label">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></svg>
                                    期待値（1Kあたり）
                                </div>
                                <div className="neon-card__row">
                                    <span className="neon-card__num" style={{ color: sc(ev.ev1K) }}>{ev.ev1K !== 0 ? sp(ev.ev1K, 0) : "—"}</span>
                                    <span className="neon-card__unit">円/K</span>
                                </div>
                            </div>
                        </div>

                        {/* E. サブ情報バー */}
                        <div style={{
                            display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6,
                            background: C.surfaceHi, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "6px 10px", alignItems: "center",
                        }}>
                            <div>
                                <div className="subinfo-label">回転率</div>
                                <div className="subinfo-val">{ev.start1K > 0 ? f(ev.start1K, 1) : "—"} <span style={{ fontSize: 9, color: C.sub, fontWeight: 500 }}>回/K</span></div>
                            </div>
                            <div>
                                <div className="subinfo-label">ボーダー差</div>
                                <div className="subinfo-val" style={{ color: sc(ev.bDiff) }}>{ev.start1K > 0 ? sp(ev.bDiff, 1) : "—"} <span style={{ fontSize: 9, color: C.sub, fontWeight: 500 }}>回/K</span></div>
                            </div>
                            <div>
                                <div className="subinfo-label">合成確率（予測）</div>
                                <div className="subinfo-val">{measuredDenom}</div>
                            </div>
                            <button className="b" type="button" onClick={() => S.setSessionSubTab("data")}
                                style={{ background: "transparent", border: "none", color: C.blue, fontSize: 11, fontWeight: 700, padding: "6px 6px", textAlign: "right", lineHeight: 1.2 }}>
                                詳細を<br />見る ›
                            </button>
                        </div>

                        {/* F. 履歴アコーディオン */}
                        <div>
                            <button
                                className="b"
                                type="button"
                                aria-expanded={showHistory}
                                onClick={() => setShowHistory((v) => !v)}
                                style={{
                                    width: "100%", minHeight: 40, borderRadius: 10,
                                    background: C.surfaceHi, border: `1px solid ${C.border}`,
                                    color: C.text, fontSize: 12, fontWeight: 700, fontFamily: font,
                                    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px",
                                }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                                    履歴 <span style={{ fontSize: 10, color: C.sub, fontWeight: 500 }}>（直近の記録を表示）</span>
                                </span>
                                <span style={{ fontSize: 10, color: C.sub }}>{showHistory ? "▲" : "▼"}</span>
                            </button>
                            <div className={`history-acc${showHistory ? " open" : ""}`}>
                                <div style={{ paddingTop: 8 }}>
                                    {/* テーブルヘッダー */}
                                    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 56px 56px", background: C.surfaceHi, padding: "8px 4px", borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 4 }}>
                                        {["種別", "総回転", "今回", "当たり", "投資", "持ち玉"].map((h) => (
                                            <div key={h} style={{ textAlign: "center", fontSize: 9, fontWeight: 600, color: C.subHi, fontFamily: font, letterSpacing: 0.3 }}>{h}</div>
                                        ))}
                                    </div>
                                    {/* データ行（旧コードを逐語コピー：計算ドリフト防止） */}
                                    <div ref={tableRef} style={{ maxHeight: 320, overflowY: "auto", overscrollBehavior: "contain" }}>
                                        {rows.length === 0 ? (
                                            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: C.sub, fontFamily: font }}>記録はまだありません</div>
                                        ) : rows.map((row, i) => {
                                            const investDisplay = (row.mode === "mochi" || row.mode === "chodama")
                                                ? (row.ballsConsumed ? f(row.ballsConsumed * (1000 / rentBalls)) : "—")
                                                : f(row.invest || 0);
                                            const ballsDisplay = f(row.mode === "chodama" ? (row.chodamaBalls || 0) : (row.mochiBalls || 0));

                                            if (row.type === "start") return (
                                                <div key={i} className="fin row-start" style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 56px 56px", padding: "10px 4px", marginBottom: 3, borderRadius: 8, alignItems: "center" }}>
                                                    <div style={{ textAlign: "center" }}><ModeBadge mode={row.mode || "cash"} /></div>
                                                    <div style={{ textAlign: "center", fontSize: 14, color: C.blue, fontFamily: mono, fontWeight: 600 }}>{f(row.cumRot)}</div>
                                                    <div style={{ textAlign: "center", fontSize: 11, color: C.sub }}>—</div>
                                                    <div style={{ display: "flex", justifyContent: "center" }}>
                                                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: C.blue, padding: "5px 10px", borderRadius: 6, letterSpacing: 0.5 }}>START</span>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{row.invest ? f(row.invest) : "—"}</div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{ballsDisplay}</div>
                                                </div>
                                            );
                                            if (row.type === "hit") return (
                                                <div key={i} className="fin row-hit" style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 56px 56px", padding: "10px 4px", marginBottom: 3, borderRadius: 8, alignItems: "center" }}>
                                                    <div style={{ textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: C.orange, borderRadius: 5, padding: "3px 6px" }}>当</span></div>
                                                    <div style={{ textAlign: "center", fontSize: 14, color: C.orange, fontFamily: mono, fontWeight: 700 }}>{f(row.cumRot)}</div>
                                                    <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: C.orange, fontFamily: mono }}>{row.thisRot}</div>
                                                    <div style={{ display: "flex", justifyContent: "center" }}>
                                                        <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: C.orange, padding: "5px 8px", borderRadius: 6 }}>当G数</span>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: C.sub, fontFamily: mono }}>{investDisplay}</div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : C.orange, fontFamily: mono }}>{ballsDisplay}</div>
                                                </div>
                                            );
                                            const isAboveBorder = row.avgRot >= border;
                                            const pillCol = rotCol(row.thisRot);
                                            return (
                                                <div key={i} className={`fin ${i % 2 === 0 ? "" : "row-data"}`} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 1fr 56px 56px", padding: "10px 4px", marginBottom: 2, borderRadius: 6, alignItems: "center", background: rowBg(row.avgRot, i % 2 === 0) }}>
                                                    <div style={{ textAlign: "center" }}><ModeBadge mode={row.mode || "cash"} /></div>
                                                    <div style={{ textAlign: "center", fontSize: 13, color: isAboveBorder ? C.green : C.subHi, fontFamily: mono, fontWeight: 500 }}>{f(row.cumRot)}</div>
                                                    <div style={{ textAlign: "center", fontSize: 20, fontWeight: 800, color: pillCol, fontFamily: mono }}>{row.thisRot}</div>
                                                    <div style={{ display: "flex", justifyContent: "center" }}>
                                                        <span style={{
                                                            fontSize: 12, fontWeight: 800, color: "#fff",
                                                            background: pillCol,
                                                            padding: "5px 10px", borderRadius: 6,
                                                            fontFamily: mono, minWidth: 36, textAlign: "center"
                                                        }}>{row.thisRot}</span>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: isAboveBorder ? C.green : C.sub, fontFamily: mono }}>{investDisplay}</div>
                                                    <div style={{ textAlign: "center", fontSize: 10, color: row.mode === "chodama" ? C.purple : (isAboveBorder ? C.green : C.orange), fontFamily: mono }}>{ballsDisplay}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 大当たりタブ - HistoryTabから完全移植 */}
            {S.sessionSubTab === "history" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Sub Tab */}
                    <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", padding: "4px", margin: "12px 14px", borderRadius: 12, flexShrink: 0 }}>
                        {[["jp", "大当たり履歴"], ["ses", "稼働ログ"]].map(([id, lbl]) => (
                            <button key={id} className="b" onClick={() => setHistorySub(id)} style={{
                                flex: 1, background: historySub === id ? C.surfaceHi : "transparent", border: "none",
                                borderRadius: 8, color: historySub === id ? C.text : C.sub, fontSize: 13, fontWeight: historySub === id ? 700 : 500,
                                padding: "10px 0", fontFamily: font, boxShadow: historySub === id ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                            }}>{lbl}</button>
                        ))}
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
                        {historySub === "jp" ? (
                            <div>
                                {/* 連チャン中バナー */}
                                {isChainActive && (
                                    <div style={{ background: `linear-gradient(135deg, ${C.orange}20, ${C.red}10)`, border: `1px solid ${C.orange}40`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                                        <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, marginBottom: 4 }}>
                                            {lastChain.hits.length === 0 ? "初当たり — 1連目を入力してください" : `連チャン中 — ${lastChain.hits.length}連目まで記録済み`}
                                        </div>
                                        <div style={{ fontSize: 10, color: C.sub }}>
                                            {lastChain.hits.length > 0 && `上皿玉: ${f(lastChain.trayBalls)}玉 | `}{lastChain.time}
                                        </div>
                                    </div>
                                )}

                                {/* アクションボタン */}
                                {isChainActive ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                        <button className="b" onClick={openChainWizard} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: "#16a34a", border: "none", color: "#fff",
                                            boxShadow: "none"
                                        }}>連チャン追加</button>
                                        <button className="b" onClick={openDirectSingleEnd} disabled={lastChain.hits.length === 0} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: lastChain.hits.length === 0 ? "rgba(99,102,241,0.3)" : "#4f46e5",
                                            border: "none", color: "#fff",
                                            boxShadow: lastChain.hits.length === 0 ? "none" : "0 4px 16px rgba(99,102,241,0.4)",
                                            opacity: lastChain.hits.length === 0 ? 0.5 : 1
                                        }}>単発終了</button>
                                        <button className="b" onClick={handleChainEnd} style={{
                                            padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                            background: "#ea580c", border: "none", color: "#fff",
                                            boxShadow: "none"
                                        }}>大当り終了</button>
                                    </div>
                                ) : (
                                    <Card style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                                            回転数タブの「初当たり」ボタンから<br />チェーンを開始してください
                                        </div>
                                    </Card>
                                )}

                                {/* 実測サマリー */}
                                <div style={{ margin: "0 0 16px", background: "rgba(0,0,0,0.2)", border: `1px solid ${C.teal}30`, borderRadius: 12, overflow: "hidden" }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                                        {[
                                            { label: "平均1R出玉", val: ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", unit: "玉", col: C.teal },
                                            { label: "サポ増減/回転", val: ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", unit: "玉/回転", col: sc(ev.sapoPerRot) },
                                            { label: "平均R数", val: ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", unit: "R", col: C.blue },
                                            { label: "初当たり", val: jpLog.length > 0 ? jpLog.length.toString() : "0", unit: "回", col: C.green },
                                        ].map(({ label, val, unit, col }, idx) => (
                                            <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 3 ? `1px solid ${C.border}` : "none" }}>
                                                <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                                <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* History — Chain Cards */}
                                {jpLog.length === 0 ? (
                                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                                ) : (
                                    [...jpLog].reverse().map((chain, ci) => (
                                        <Card
                                            key={chain.chainId || ci}
                                            style={{
                                                padding: "12px 16px", marginBottom: 12,
                                                background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "transparent"
                                            }}
                                            onTouchStart={() => handleLongPressStart(chain.chainId)}
                                            onTouchEnd={handleLongPressEnd}
                                            onTouchMove={handleLongPressEnd}
                                        >
                                            {/* Chain Header */}
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>
                                                    {!chain.completed ? "連チャン中" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}
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
                                                                <div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}回</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>サポ増減</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: sc(change), fontFamily: mono }}>{change >= 0 ? "+" : ""}{change}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: 7, color: C.sub }}>サポ/回転</div>
                                                                <div style={{ fontSize: 12, fontWeight: 600, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* Chain Summary */}
                                            {chain.completed && chain.summary && (
                                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>1R出玉</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}</div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>サポ増減/回転</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoPerRot || 0), fontFamily: mono }}>
                                                                {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>サポ総増減</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}</div>
                                                        </div>
                                                        <div style={{ textAlign: "center" }}>
                                                            <div style={{ fontSize: 7, color: C.sub }}>純増出玉</div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}</div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                        {f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}{f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = {f(Math.round(chain.summary.netGain))}
                                                    </div>
                                                </div>
                                            )}
                                            {!chain.completed && chain.hits.length === 0 && (
                                                <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                            )}
                                        </Card>
                                    ))
                                )}
                                <Btn label="最新履歴を削除" onClick={() => {
                                    S.setJpLog((p) => {
                                        if (p.length === 0) return p;
                                        const lastChain = p[p.length - 1];
                                        // 回転入力ページ側の hit 行も同期削除（双方向カスケード）
                                        if (lastChain.chainId) {
                                            S.setRotRows((pr) => pr.filter(r => !(r.type === "hit" && r.chainId === lastChain.chainId)));
                                        }
                                        return p.slice(0, -1);
                                    });
                                }} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                            </div>
                        ) : (
                            <div>
                                {sesLog.length === 0 ? (
                                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>ログがありません</div>
                                ) : (
                                    sesLog.map((e, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{e.type}</div>
                                                <div style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{e.time}</div>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                {e.rot != null && <div style={{ fontSize: 12, color: C.blue, fontFamily: mono }}>{f(e.rot)}回</div>}
                                                {e.cash != null && <div style={{ fontSize: 12, color: C.red, fontFamily: mono }}>-{f(e.cash)}円</div>}
                                                {e.tray != null && <div style={{ fontSize: 10, color: C.teal }}>上皿:{f(e.tray)}玉</div>}
                                                {e.netGain != null && <div style={{ fontSize: 10, color: C.green }}>純増:{f(e.netGain)}玉</div>}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <Btn label="最新ログを削除" onClick={() => { S.setSesLog((p) => p.slice(0, -1)); }} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                            </div>
                        )}
                    </div>

                    {/* 削除確認モーダル */}
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

                    {/* 大当たり履歴 編集モーダル（古いデータの修正用） */}
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
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                    <Btn label="キャンセル" onClick={() => { setEditChainOpen(false); setEditChainId(null); setEditChainHits([]); }} />
                                    <Btn label="保存" onClick={handleEditChainSave} bg={C.blue} fg="#fff" bd="none" />
                                </div>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* データタブ - セッション統計（モック刷新版） */}
            {S.sessionSubTab === "data" && (() => {
                const hasData = ev.start1K > 0;
                const bDiff = Number(ev.bDiff) || 0;
                const barClamp = Math.max(-5, Math.min(5, bDiff));
                const barPct = ((barClamp + 5) / 10) * 100;
                const barColor = bDiff > 0 ? C.green : bDiff < 0 ? C.red : C.subHi;

                // シンプルSVGアイコン（アプリ共通スタイル: ストローク1.7）
                const sw = 1.7;
                const IcPlus = ({ c, s = 14 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>);
                const IcTarget = ({ c, s = 16 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1.2" fill={c} stroke="none" /></svg>);
                const IcYen = ({ c, s = 16 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 8l3.5 5 3.5-5" /><path d="M8.5 13h7M8.5 15.5h7" /><path d="M12 13v5" /></svg>);
                const IcCalendar = ({ c, s = 16 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></svg>);
                const IcClock = ({ c, s = 16 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.5 2" /></svg>);
                const IcMoneyBag = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l-1.5 2c-2.5 3-3 8 1 10.5 2 1.2 5 1.2 7 0 4-2.5 3.5-7.5 1-10.5L15 6" /><path d="M9 6h6" /><path d="M12 11v5M10.2 13h3.6M10.2 15h3.6" /></svg>);
                const IcMoon = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.5 6.5 0 0 0 11 11z" /></svg>);
                const IcBulb = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c1 .8 1.5 1.8 1.5 3V17h5v-.5c0-1.2.5-2.2 1.5-3A6 6 0 0 0 12 3z" /></svg>);
                const IcLineChart = ({ c, s = 20 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16" /><path d="M4 15l5-5 4 3 6-7" /></svg>);
                const IcBarChart = ({ c, s = 20 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round"><path d="M4 20h16" /><rect x="6" y="11" width="3" height="9" rx="0.5" /><rect x="11" y="7" width="3" height="13" rx="0.5" /><rect x="16" y="13" width="3" height="7" rx="0.5" /></svg>);
                const IcPencil = ({ c, s = 20 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L18 10l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>);
                const IcSmile = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9 14c.8 1 2 1.5 3 1.5s2.2-.5 3-1.5" /><circle cx="9" cy="10" r="0.9" fill={c} stroke="none" /><circle cx="15" cy="10" r="0.9" fill={c} stroke="none" /></svg>);
                const IcFrown = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9 15.5c.8-1 2-1.5 3-1.5s2.2.5 3 1.5" /><circle cx="9" cy="10" r="0.9" fill={c} stroke="none" /><circle cx="15" cy="10" r="0.9" fill={c} stroke="none" /></svg>);
                const IcMeh = ({ c, s = 18 }) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9 14.5h6" /><circle cx="9" cy="10" r="0.9" fill={c} stroke="none" /><circle cx="15" cy="10" r="0.9" fill={c} stroke="none" /></svg>);
                const IcBallsTray = ({ c, s = 48 }) => (<svg width={s} height={s} viewBox="0 0 48 48" fill="none" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 30h34l-2 9H9z" /><circle cx="17" cy="24" r="3" /><circle cx="24" cy="22" r="3" /><circle cx="31" cy="24" r="3" /><circle cx="20" cy="28" r="3" /><circle cx="28" cy="28" r="3" /></svg>);

                const FaceIcon = !hasData ? IcMeh : bDiff > 0 ? IcSmile : bDiff < 0 ? IcFrown : IcMeh;

                const borderMsg = !hasData
                    ? "データ入力待ち"
                    : bDiff > 0
                        ? <>ボーダーを <span style={{ color: C.green, fontWeight: 700 }}>{sp(bDiff, 1)}回</span> 上回っています</>
                        : bDiff < 0
                            ? <>ボーダーを <span style={{ color: C.red, fontWeight: 700 }}>{sp(bDiff, 1)}回</span> 下回っています</>
                            : "ボーダーぴったりで推移しています";

                const evRows = [
                    { key: "ev1K", label: "期待値/K", Icon: IcTarget, val: ev.ev1K, unit: "円", fmt: (n) => sp(n, 0) },
                    { key: "evPerRot", label: "単価", Icon: IcYen, val: ev.evPerRot, unit: "円/回", fmt: (n) => sp(n, 2) },
                    { key: "workAmount", label: "仕事量", Icon: IcCalendar, val: ev.workAmount, unit: "円", fmt: (n) => sp(n, 0) },
                    { key: "wage", label: "時給", Icon: IcClock, val: ev.wage, unit: "円/h", fmt: (n) => sp(n, 0) },
                ];

                const onePointText = (() => {
                    if (!hasData) return "回転数を入力すると分析が始まります。";
                    const evPlus = ev.ev1K > 0;
                    const borderPlus = bDiff > 0;
                    if (borderPlus && evPlus) return "ボーダーを上回っており、期待値もプラスです。この調子で続けていきましょう！";
                    if (borderPlus && !evPlus) return "ボーダーは上回っていますが期待値はマイナスです。打ち方やサポ区間を見直しましょう。";
                    if (!borderPlus && evPlus) return "ボーダーは下回っていますが、大当たり状況により期待値はプラスです。";
                    return "ボーダーも期待値もマイナスです。撤退を検討してください。";
                })();

                return (
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
                    {/* 回転率・ボーダー */}
                    <Card style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 8px 6px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{
                                    width: 26, height: 26, borderRadius: "50%",
                                    background: `color-mix(in srgb, ${C.blue} 14%, transparent)`,
                                    border: `1.2px solid ${C.blue}`,
                                    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                }}><IcPlus c={C.blue} s={14} /></span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font }}>回転率・ボーダー</span>
                            </div>
                            <UndoControls S={S} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "4px 4px 14px" }}>
                            <div style={{ textAlign: "center", padding: "6px 4px" }}>
                                <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>1Kスタート</div>
                                <div style={{ fontSize: 32, fontWeight: 800, color: sc(ev.bDiff), fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                    {hasData ? f(ev.start1K, 1) : "—"}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub, marginTop: 5 }}>回/K</div>
                            </div>
                            <div style={{ textAlign: "center", padding: "6px 4px", borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>理論ボーダー</div>
                                <div style={{ fontSize: 32, fontWeight: 800, color: C.subHi, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                    {ev.theoreticalBorder > 0 ? f(ev.theoreticalBorder, 1) : "—"}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub, marginTop: 5 }}>回/K</div>
                            </div>
                            <div style={{ textAlign: "center", padding: "6px 4px" }}>
                                <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>ボーダー差</div>
                                <div style={{ fontSize: 32, fontWeight: 800, color: sc(ev.bDiff), fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                    {hasData ? sp(ev.bDiff, 1) : "—"}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub, marginTop: 5 }}>回/K</div>
                            </div>
                        </div>
                        {/* 進捗バー */}
                        <div style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 12px",
                            margin: "0 12px 14px",
                            background: C.surfaceHi,
                            border: `1px solid ${C.border}`,
                            borderRadius: 10,
                        }}>
                            <span style={{ flexShrink: 0, display: "inline-flex" }}><FaceIcon c={barColor} s={20} /></span>
                            <span style={{ flex: 1, fontSize: 12, color: C.subHi, fontFamily: font, fontWeight: 500, lineHeight: 1.4 }}>{borderMsg}</span>
                            <div style={{ width: 80, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 999, position: "relative", overflow: "hidden" }}>
                                    <div style={{
                                        position: "absolute", left: 0, top: 0, bottom: 0,
                                        width: `${barPct}%`,
                                        background: barColor,
                                        borderRadius: 999,
                                        transition: "width 0.2s ease"
                                    }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: barColor, fontFamily: mono, minWidth: 28, textAlign: "right" }}>
                                    {hasData ? sp(bDiff, 1) : "—"}
                                </span>
                            </div>
                        </div>
                    </Card>

                    {/* 期待値・収支 */}
                    <Card>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 8px" }}>
                            <IcMoneyBag c={C.blue} s={18} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font }}>期待値・収支</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 12px" }}>
                            {evRows.map((r) => (
                                <div key={r.key} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "10px 14px",
                                    background: C.surfaceHi,
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 10,
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <span style={{
                                            width: 30, height: 30, borderRadius: "50%",
                                            background: `color-mix(in srgb, ${C.blue} 12%, transparent)`,
                                            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                                        }}><r.Icon c={C.blue} s={16} /></span>
                                        <span style={{ fontSize: 14, color: C.text, fontFamily: font, fontWeight: 500 }}>{r.label}</span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                                        <span style={{ fontSize: 20, fontWeight: 800, color: sc(r.val), fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
                                            {r.val !== 0 ? r.fmt(r.val) : "—"}
                                        </span>
                                        <span style={{ fontSize: 11, color: C.sub }}>{r.unit}</span>
                                        <span style={{ fontSize: 18, color: C.sub, marginLeft: 4, lineHeight: 1, pointerEvents: "none", fontWeight: 300 }}>›</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    {/* 出玉データ */}
                    <Card>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 6px" }}>
                            <IcMoon c={C.teal} s={18} />
                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font }}>出玉データ</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", padding: "2px 16px 14px", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>平均1R出玉</div>
                                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                                    <span style={{ fontSize: 38, fontWeight: 800, color: C.teal, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                                        {ev.avg1R > 0 ? f(ev.avg1R, 1) : "—"}
                                    </span>
                                    <span style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>玉</span>
                                </div>
                            </div>
                            <IcBallsTray c={C.teal} s={52} />
                        </div>
                        {/* ミニ併記：稼働データ */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "0 12px 12px" }}>
                            <MiniStat label="初当たり" val={`${S.jpLog.length || 0}回`} col={C.green} />
                            <MiniStat label="総回転" val={ev.netRot > 0 ? f(ev.netRot) : "—"} col={C.subHi} />
                            <MiniStat label="総投資" val={ev.rawInvest > 0 ? f(ev.rawInvest) : "—"} col={C.red} />
                        </div>
                    </Card>

                    {/* ワンポイント */}
                    <Card style={{
                        background: `color-mix(in srgb, ${C.yellow} 8%, ${C.surface})`,
                        borderColor: `color-mix(in srgb, ${C.yellow} 40%, ${C.border})`,
                    }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px" }}>
                            <span style={{ flexShrink: 0, marginTop: 1 }}><IcBulb c={C.yellow} s={20} /></span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.yellow, marginBottom: 4, fontFamily: font }}>ワンポイント</div>
                                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55, fontFamily: font }}>{onePointText}</div>
                            </div>
                        </div>
                    </Card>

                    {/* 下部3ボタン */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4, marginBottom: 12 }}>
                        {[
                            { label: "グラフで確認", Icon: IcLineChart, col: C.purple, onClick: () => setShowGraphModal(true), disabled: false },
                            { label: "データ履歴", Icon: IcBarChart, col: C.teal, onClick: () => S.setTab("calendar"), disabled: false },
                            { label: "メモを追加", Icon: IcPencil, col: C.blue, onClick: null, disabled: true },
                        ].map((b) => (
                            <button
                                key={b.label}
                                className="b"
                                onClick={b.disabled ? undefined : b.onClick}
                                style={{
                                    background: `color-mix(in srgb, ${b.col} 10%, transparent)`,
                                    border: `1px solid color-mix(in srgb, ${b.col} 28%, transparent)`,
                                    borderRadius: 12,
                                    color: b.col,
                                    padding: "14px 4px",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    fontFamily: font,
                                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                                    cursor: b.disabled ? "default" : "pointer",
                                    opacity: b.disabled ? 0.75 : 1,
                                }}
                            >
                                <b.Icon c={b.col} s={22} />
                                <span>{b.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                );
            })()}

            {/* 機種設定タブ */}
            {S.sessionSubTab === "settings" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "12px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
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
                                    onChange={e => { setEditMachineName(e.target.value); setEditMachineQuery(e.target.value); setEditMachineDD(true); }}
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

                            {/* 貸玉数・交換率 */}
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
                                    S.setStoreName((editStore || "").trim());
                                    S.setMachineNum((editMachineNum || "").trim());
                                    S.setMachineName((editMachineName || "").trim());
                                    S.setSynthDenom(synth);
                                    S.setSpec1R(r1);
                                    S.setRentBalls(rb);
                                    S.setExRate(ex);
                                    const picked = editPickedMachineRef.current;
                                    if (picked) {
                                        if (picked.specAvgRounds != null) S.setSpecAvgRounds(picked.specAvgRounds);
                                        if (picked.specSapo != null) S.setSpecSapo(picked.specSapo);
                                    }
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
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="台移動" />
                        <div style={{ fontSize: 13, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                            現在のデータを保存して新しい台へ移動します
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <Btn label="キャンセル" onClick={() => setShowMoveModal(false)} />
                            <Btn label="移動する" onClick={() => { setShowMoveModal(false); S.handleMoveTable(); }} bg={C.purple} fg="#fff" bd="none" />
                        </div>
                    </Card>
                </div>
            )}

            {/* 投資ペース設定モーダル */}
            {showInvestSettings && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
                        <SecLabel label="投資金額ペース" />
                        <div style={{ fontSize: 12, color: C.sub, marginBottom: 16, lineHeight: 1.6 }}>
                            1回の記録で加算する投資金額を選択
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                            {[500, 1000, 2000].map(pace => (
                                <button key={pace} className="b" onClick={() => { S.setInvestPace(pace); setShowInvestSettings(false); }} style={{
                                    padding: "14px 0", borderRadius: 10, fontWeight: 700, fontFamily: mono, fontSize: 15,
                                    background: investPace === pace ? "#2f6fed" : "var(--surface-hi)",
                                    border: investPace === pace ? "none" : `1px solid ${C.border}`,
                                    color: investPace === pace ? "#fff" : C.text,
                                    boxShadow: investPace === pace ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none"
                                }}>
                                    {pace >= 1000 ? `${pace/1000}K` : `${pace}円`}
                                </button>
                            ))}
                        </div>
                        <button className="b" onClick={() => setShowInvestSettings(false)} style={{
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
                    const w = a.stats?.workAmount || 0;
                    cum += w;
                    points.push({ label: a.date?.slice(5) || "", value: Math.round(cum) });
                });
                if (ev.workAmount !== 0) {
                    cum += ev.workAmount;
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

            {/* 初当たりウィザードモーダル - フルスクリーン */}
            {hitWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    height: "100dvh",
                    width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setHitWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>大当たり記録</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: 上皿の残り玉数 */}
                        {hitWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.blue, marginBottom: 16 }}>上皿の残り玉数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.trayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 1: ラウンド数 */}
                        {hitWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRounds.map(r => (
                                        <button
                                            key={r}
                                            className="b"
                                            onClick={() => { setHitWizardData(d => ({ ...d, rounds: r })); setHitWizardStep(2); }}
                                            style={{
                                                width: 80, height: 80, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: 26,
                                                background: "#ea580c", border: "none", color: "#fff",
                                                boxShadow: "none"
                                            }}
                                        >
                                            {r}R
                                        </button>
                                    ))}
                                </div>
                                <button className="b" onClick={() => setHitWizardStep(0)} style={{ marginTop: 24, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 2: 液晶表示玉数 */}
                        {hitWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{hitWizardData.rounds}R選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 実玉数 */}
                        {hitWizardStep === 3 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.green, marginBottom: 16 }}>実玉数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.actualBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 4: 単発/確変選択 */}
                        {hitWizardStep === 4 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>当たり種別</div>
                                <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                                    <button className="b" onClick={() => { setHitWizardData(d => ({ ...d, hitType: "単発" })); setHitWizardStep(5); }}
                                        style={{ width: 130, height: 90, borderRadius: 16, fontWeight: 800, fontSize: 22, background: "#4f46e5", border: "none", color: "#fff", boxShadow: "none" }}>
                                        単発
                                    </button>
                                    <button className="b" onClick={() => handleWizardComplete("確変")}
                                        style={{ width: 130, height: 90, borderRadius: 16, fontWeight: 800, fontSize: 22, background: "#ea580c", border: "none", color: "#fff", boxShadow: "none" }}>
                                        確変
                                    </button>
                                </div>
                                <button className="b" onClick={() => setHitWizardStep(3)} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 5: 時短回数 */}
                        {hitWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {hitWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 6: 時短終了後最終出玉 */}
                        {hitWizardStep === 6 && (() => {
                            const estimated = (Number(hitWizardData.trayBalls) || 0) + (Number(hitWizardData.displayBalls) || 0);
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 8 }}>時短終了後の出玉</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>実際の持ち玉（カード＋上皿）</div>
                                    {estimated > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>推定: {f(estimated)}玉（自動プリセット済み）</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {hitWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(hitWizardData.finalBallsAfterJitan) || 0; setHitWizardData(d => ({ ...d, finalBallsAfterJitan: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* テンキー（Step 1と4以外で表示） */}
                    {hitWizardStep !== 1 && hitWizardStep !== 4 && (
                        <div style={{
                            padding: "8px 12px",
                            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                            background: "rgba(20,20,25,1)",
                            borderTop: `1px solid ${C.border}`,
                            flexShrink: 0
                        }}>
                            {/* 戻る/次へボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => {
                                    if (hitWizardStep === 0) setHitWizardOpen(false);
                                    else if (hitWizardStep === 2) setHitWizardStep(1);
                                    else if (hitWizardStep === 5) setHitWizardStep(4);
                                    else setHitWizardStep(s => s - 1);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>
                                    {hitWizardStep === 0 ? "キャンセル" : "戻る"}
                                </button>
                                {hitWizardStep === 6 ? (
                                    <button className="b" onClick={handleWizardComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>
                                        記録完了
                                    </button>
                                ) : (
                                    <button className="b" onClick={() => {
                                        // Step 5 → 6 に進む時に時短終了後出玉を自動プリセット（上皿玉 + 液晶表示玉）
                                        if (hitWizardStep === 5 && !hitWizardData.finalBallsAfterJitan) {
                                            const estimated = (Number(hitWizardData.trayBalls) || 0) + (Number(hitWizardData.displayBalls) || 0);
                                            if (estimated > 0) {
                                                setHitWizardData(d => ({ ...d, finalBallsAfterJitan: String(estimated) }));
                                            }
                                        }
                                        setHitWizardStep(s => s + 1);
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#2f6fed", border: "none", color: "#fff" }}>
                                        次へ
                                    </button>
                                )}
                            </div>
                            {/* テンキー - 大きくして精度向上 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setHitWizardData(d => {
                                            const current = d[field] || "";
                                            // 先頭が0のみの場合は置き換え
                                            const newVal = current === "0" ? String(n) : current + n;
                                            return { ...d, [field]: newVal };
                                        });
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                        {n}
                                    </button>
                                ))}
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => ({ ...d, [field]: "" }));
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                    AC
                                </button>
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => {
                                        const current = d[field] || "";
                                        // 空の場合は0を入れない（表示上は0が見えている）
                                        if (current === "") return d;
                                        return { ...d, [field]: current + "0" };
                                    });
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                    0
                                </button>
                                <button className="b" onClick={() => {
                                    const field = hitWizardStep === 0 ? "trayBalls" : hitWizardStep === 2 ? "displayBalls" : hitWizardStep === 3 ? "actualBalls" : hitWizardStep === 5 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setHitWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "var(--surface-hi)", border: "none", color: C.sub, minHeight: 56 }}>
                                    ←
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
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
                                const val = Number(input);
                                if (val > 0) {
                                    S.setStartRot(val);
                                    setRows((r) => [...r, { type: "start", cumRot: val, mode: S.playMode, mochiBalls: S.currentMochiBalls, chodamaBalls: S.currentChodama, isPostJackpotStart: true }]);
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

            {/* 連チャン追加ウィザードモーダル */}
            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "#000", zIndex: 9999, display: "flex", flexDirection: "column", height: "100dvh", width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000"
                    }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: ラウンド数選択 */}
                        {chainWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRushRounds.map(({ rounds, mult }) => (
                                        <button key={`${rounds}-${mult}`} className="b" onClick={() => { setChainWizardData(d => ({ ...d, rounds, mult })); setChainWizardStep(1); setChainWizardFirstKey(true); }}
                                            style={{ minWidth: 80, height: 80, padding: mult > 1 ? "0 12px" : 0, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: mult > 1 ? 20 : 26, background: "#ea580c", border: "none", color: "#fff", boxShadow: "none" }}>
                                            {mult > 1 ? `${rounds}R×${mult}` : `${rounds}R`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 1: 液晶表示玉数 */}
                        {chainWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数{chainWizardData.mult > 1 ? "（1連分）" : ""}</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R{chainWizardData.mult > 1 ? `×${chainWizardData.mult}` : ""}選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 2: 電サポ回転数 */}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>サポ増減 ①</div>
                                <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 大当たり直前 */}
                        {chainWizardStep === 3 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当たり直前</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevEndBalls > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回終了時: {f(prevEndBalls)}玉（自動プリセット済み）</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.lastOutBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.lastOutBalls) || 0; setChainWizardData(d => ({ ...d, lastOutBalls: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {prevEndBalls > 0 && current > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: C.sub }}>電サポ中の増減: <span style={{ fontWeight: 700, color: sc(diff), fontFamily: mono }}>{diff >= 0 ? "+" : ""}{diff}</span></span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 4: ラウンド終了 */}
                        {chainWizardStep === 4 && (() => {
                            const prevBalls = Number(chainWizardData.lastOutBalls) || 0;
                            const currentBalls = Number(chainWizardData.nextTimingBalls) || 0;
                            const dispBalls = Number(chainWizardData.displayBalls) || 0;
                            const multN = Math.max(1, Number(chainWizardData.mult) || 1);
                            const sapoChange = currentBalls - prevBalls - dispBalls * multN;
                            const rot = Number(chainWizardData.elecSapoRot) || 0;
                            const perRot = rot > 0 ? sapoChange / rot : 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevBalls > 0 && <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当たり直前: {f(prevBalls)}玉</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.nextTimingBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.nextTimingBalls) || 0; setChainWizardData(d => ({ ...d, nextTimingBalls: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {currentBalls > 0 && (
                                        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderRadius: 12 }}>
                                            <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontSize: 10, color: C.sub }}>電サポ増減</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>{sapoChange >= 0 ? "+" : ""}{sapoChange}</div>
                                                </div>
                                                {rot > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>1回転あたり</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>{perRot >= 0 ? "+" : ""}{perRot.toFixed(2)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 5: 継続/最終/単発選択 */}
                        {chainWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>この大当たりは？</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                                    <button className="b" onClick={() => handleChainWizardComplete(false)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#16a34a", border: "none", color: "#fff", boxShadow: "none" }}>連チャン継続</button>
                                    <button className="b" onClick={() => { setChainWizardStep(6); setChainWizardFirstKey(true); }}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#4f46e5", border: "none", color: "#fff", boxShadow: "none" }}>単発終了</button>
                                    <button className="b" onClick={() => handleChainWizardComplete(true)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#ea580c", border: "none", color: "#fff", boxShadow: "none" }}>最終大当たり</button>
                                </div>
                                <button className="b" onClick={() => { setChainWizardStep(4); setChainWizardFirstKey(true); }} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 6: 時短回数 */}
                        {chainWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 7: 時短終了後出玉 */}
                        {chainWizardStep === 7 && (() => {
                            const estimated = Number(chainWizardData.nextTimingBalls) || 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 8 }}>時短終了後の出玉</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>実際の持ち玉（カード＋上皿）</div>
                                    {estimated > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>ラウンド終了時: {f(estimated)}玉（自動プリセット済み）</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.finalBallsAfterJitan) || 0; setChainWizardData(d => ({ ...d, finalBallsAfterJitan: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* テンキー */}
                    {chainWizardStep !== 0 && chainWizardStep !== 5 && (
                        <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => { if (chainWizardStep === 1) setChainWizardStep(0); else if (chainWizardStep === 6) setChainWizardStep(5); else setChainWizardStep(s => s - 1); setChainWizardFirstKey(true); }}
                                    style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>戻る</button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>記録完了</button>
                                ) : (
                                    <button className="b" onClick={() => {
                                        if (chainWizardStep === 3 && !chainWizardData.nextTimingBalls) {
                                            const lastOut = Number(chainWizardData.lastOutBalls) || 0;
                                            const disp = Number(chainWizardData.displayBalls) || 0;
                                            setChainWizardData(d => ({ ...d, nextTimingBalls: String(lastOut + disp) }));
                                        }
                                        // Step 6 → 7 に進む時に時短終了後出玉を自動プリセット（ラウンド終了時の持ち玉）
                                        if (chainWizardStep === 6 && !chainWizardData.finalBallsAfterJitan) {
                                            const estimated = Number(chainWizardData.nextTimingBalls) || 0;
                                            if (estimated > 0) {
                                                setChainWizardData(d => ({ ...d, finalBallsAfterJitan: String(estimated) }));
                                            }
                                        }
                                        setChainWizardStep(s => s + 1); setChainWizardFirstKey(true);
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#2f6fed", border: "none", color: "#fff" }}>次へ</button>
                                )}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setChainWizardData(d => chainWizardFirstKey ? { ...d, [field]: String(n) } : { ...d, [field]: (d[field] === "0" ? String(n) : (d[field] || "") + n) });
                                        setChainWizardFirstKey(false);
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>{n}</button>
                                ))}
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: "" })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => chainWizardFirstKey ? { ...d, [field]: "0" } : (d[field] === "" ? d : { ...d, [field]: d[field] + "0" })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>0</button>
                                <button className="b" onClick={() => { const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan"; setChainWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) })); setChainWizardFirstKey(false); }}
                                    style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "var(--surface-hi)", border: "none", color: C.sub, minHeight: 56 }}>←</button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* 直接単発終了モーダル */}
            {directSingleEndOpen && ReactDOM.createPortal(
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 9999, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 16px", paddingTop: "max(12px, env(safe-area-inset-top))", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "#000" }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>単発終了</span>
                        <div style={{ width: 70 }} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
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
                    <div style={{ padding: "8px 12px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: "rgba(20,20,25,1)", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => { if (directSingleEndStep === 0) setDirectSingleEndOpen(false); else setDirectSingleEndStep(0); }}
                                style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>{directSingleEndStep === 0 ? "キャンセル" : "戻る"}</button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>記録完了</button>
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
                                style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>AC</button>
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

/* ================================================================
   HistoryTab — 大当たり履歴（チェーンベース連チャン記録）
================================================================ */
export function HistoryTab({ jpLog, sesLog, pushJP, delJPLast, delSesLast, S, ev }) {
    const [sub, setSub] = useState("jp");

    // スワイプ削除用state（横スワイプのみ反応）
    const [swipingId, setSwipingId] = useState(null);
    const [swipeX, setSwipeX] = useState(0);
    const [swipeDirection, setSwipeDirection] = useState(null); // "horizontal" | "vertical" | null
    const swipeStartX = useRef(0);
    const swipeStartY = useRef(0);

    // 連打ロック（同フレームの二度押し抑止）
    const endLockRef = useRef(false);

    const handleSwipeStart = (e, chainId) => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
        setSwipingId(chainId);
        setSwipeDirection(null);
    };

    const handleSwipeMove = (e) => {
        if (swipingId === null) return;
        const diffX = swipeStartX.current - e.touches[0].clientX;
        const diffY = Math.abs(e.touches[0].clientY - swipeStartY.current);

        // 方向が未確定の場合、10px以上動いたら判定
        if (swipeDirection === null && (Math.abs(diffX) > 10 || diffY > 10)) {
            if (diffY > Math.abs(diffX)) {
                setSwipeDirection("vertical");
                return;
            } else {
                setSwipeDirection("horizontal");
            }
        }

        // 横スワイプの場合のみ処理
        if (swipeDirection === "horizontal") {
            e.stopPropagation(); // 画面切り替えスワイプを防止
            setSwipeX(Math.max(0, Math.min(diffX, 80)));
        }
    };

    const handleSwipeEnd = (chainId) => {
        if (swipeDirection === "horizontal" && swipeX > 50) {
            if (confirm("このデータを削除しますか？")) {
                S.pushSnapshot();
                // updater 外で対象 chain を取得（StrictMode の updater 二度実行による副作用重複を防ぐ）
                const chainToDelete = (S.jpLog || []).find(c => c.chainId === chainId);

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

                S.setJpLog((prev) => prev.filter(c => c.chainId !== chainId));
                // 回転入力ページ側の hit 行も同期削除（双方向カスケード）
                S.setRotRows((prev) => prev.filter(r => !(r.type === "hit" && r.chainId === chainId)));
            }
        }
        setSwipeX(0);
        setSwipingId(null);
        setSwipeDirection(null);
    };

    // 連チャン入力 state
    const [iTrayBalls, setITrayBalls] = useState("");         // 上皿玉（1連目のみ）
    const [iLastOutBalls, setILastOutBalls] = useState("");   // 直前の実出玉
    const [iNextTimingBalls, setINextTimingBalls] = useState(""); // 次のタイミングの出玉
    const [iElecSapoRot, setIElecSapoRot] = useState("");    // 電サポ回転数
    const [iRounds, setIRounds] = useState("");
    const [iDisplayBalls, setIDisplayBalls] = useState("");
    const [iActualBalls, setIActualBalls] = useState("");     // 実玉数

    // 連チャン追加ウィザード state
    const [chainWizardOpen, setChainWizardOpen] = useState(false);
    const [chainWizardStep, setChainWizardStep] = useState(0);
    const [chainWizardFirstKey, setChainWizardFirstKey] = useState(true); // 各ステップの最初のキー入力を追跡
    const [chainWizardData, setChainWizardData] = useState({
        rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "",
        hitType: "", // "継続" or "最終" or "単発"
        jitanSpins: "", // 時短回数（単発終了用）
        finalBallsAfterJitan: "" // 時短終了後出玉（単発終了用）
    });

    // 直接単発終了モーダル state（ヒットが既にある場合用）
    const [directSingleEndOpen, setDirectSingleEndOpen] = useState(false);
    const [directSingleEndStep, setDirectSingleEndStep] = useState(0); // 0: 時短回数, 1: 時短終了後出玉
    const [directSingleEndData, setDirectSingleEndData] = useState({ jitanSpins: "", finalBallsAfterJitan: "" });

    // 機種からラウンド情報を取得（初当たり用）
    const getMachineRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        if (!machine || !machine.roundDist) return [3, 4, 5, 6, 7, 8, 9, 10];
        const matches = machine.roundDist.match(/(\d+)R/g);
        if (!matches) return [3, 4, 5, 6, 7, 8, 9, 10];
        return [...new Set(matches.map(m => parseInt(m)))].sort((a, b) => a - b);
    };
    const machineRounds = useMemo(getMachineRounds, [S.machineName, S.customMachines]);

    // 確変中のラウンド情報を取得（連チャン用 - rushDistを優先、×N表記対応）
    const getMachineRushRounds = () => {
        const machine = searchMachines(S.machineName, S.customMachines)[0];
        const defaultOpts = [3,4,5,6,7,8,9,10].map(r => ({ rounds: r, mult: 1 }));
        if (!machine) return defaultOpts;
        const dist = machine.rushDist || machine.roundDist;
        if (!dist) return defaultOpts;
        const re = /(\d+)R(?:×(\d+))?/g;
        const found = [];
        const seen = new Set();
        let m;
        while ((m = re.exec(dist)) !== null) {
            const rounds = parseInt(m[1]);
            const mult = m[2] ? parseInt(m[2]) : 1;
            const key = `${rounds}-${mult}`;
            if (!seen.has(key)) { seen.add(key); found.push({ rounds, mult }); }
        }
        if (found.length === 0) return defaultOpts;
        return found.sort((a, b) => a.rounds - b.rounds || a.mult - b.mult);
    };
    const machineRushRounds = useMemo(getMachineRushRounds, [S.machineName, S.customMachines]);

    // 最新の未完了チェーンがあるか
    const lastChain = jpLog.length > 0 ? jpLog[jpLog.length - 1] : null;
    const isChainActive = lastChain && !lastChain.completed;

    const clearInputs = () => {
        setITrayBalls("");
        setILastOutBalls("");
        setINextTimingBalls("");
        setIElecSapoRot("");
        setIRounds("");
        setIDisplayBalls("");
        setIActualBalls("");
    };

    const clearChainWizard = () => {
        setChainWizardData({ rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
    };

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

    // 連チャン追加ウィザードを開始
    const openChainWizard = () => {
        const prevEndBalls = getPrevEndBalls();
        setChainWizardData({
            rounds: 0,
            displayBalls: "",
            lastOutBalls: String(prevEndBalls), // 前回の値を初期値として設定
            nextTimingBalls: "",
            elecSapoRot: "",
            hitType: "",
            jitanSpins: "",
            finalBallsAfterJitan: ""
        });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardOpen(true);
    };

    // 連チャン追加: チェーンにヒットを追加（旧版 - フォールバック用）
    const addHitToChain = () => {
        const rounds = Number(iRounds) || 0;
        if (rounds <= 0) return;
        S.pushSnapshot();

        const lastOut = Number(iLastOutBalls) || 0;
        const nextTiming = Number(iNextTimingBalls) || 0;
        const elecRot = Number(iElecSapoRot) || 0;
        const disp = Number(iDisplayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const sapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;
        const isFirstHit = lastChain && lastChain.hits.length === 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            // 1連目の場合: 上皿玉を保存
            if (isFirstHit) {
                const tray = Number(iTrayBalls) || 0;
                chain.trayBalls = tray;
                S.setTotalTrayBalls((p) => p + tray);
            }
            chain.hits = [...chain.hits, {
                hitNumber: chain.hits.length + 1,
                lastOutBalls: lastOut,
                nextTimingBalls: nextTiming,
                elecSapoRot: elecRot,
                sapoChange,
                sapoPerRot,
                rounds,
                displayBalls: Number(iDisplayBalls) || 0,
                actualBalls: Number(iActualBalls) || 0,
                time: tsNow(),
            }];
            updated[updated.length - 1] = chain;
            return updated;
        });
        S.pushLog({ type: isFirstHit ? "初当たり記録" : "連チャン追加", time: tsNow(), rounds: Number(iRounds) || 0 });
        clearInputs();
    };

    // 連チャン追加ウィザード完了（継続 or 最終）
    // mult (×N) 分の hits を分割生成（1連分入力 → N 個の均等割 hits）
    const buildSplitHits = (startHitNumber, { rnd, mult, disp, lastOut, nextTiming, elecRot }) => {
        const n = Math.max(1, Number(mult) || 1);
        const ballDelta = (nextTiming - lastOut) / n;
        const perRotBase = Math.floor(elecRot / n);
        const perRotRem = elecRot - perRotBase * n;
        const hits = [];
        for (let i = 0; i < n; i++) {
            const isLast = i === n - 1;
            const hitLastOut = Math.round(lastOut + i * ballDelta);
            const hitNextTiming = isLast ? nextTiming : Math.round(lastOut + (i + 1) * ballDelta);
            const hitElecRot = perRotBase + (isLast ? perRotRem : 0);
            const hitSapoChange = hitNextTiming - hitLastOut - disp;
            const hitSapoPerRot = hitElecRot > 0 ? hitSapoChange / hitElecRot : 0;
            hits.push({
                hitNumber: startHitNumber + i,
                lastOutBalls: hitLastOut,
                nextTimingBalls: hitNextTiming,
                elecSapoRot: hitElecRot,
                sapoChange: hitSapoChange,
                sapoPerRot: hitSapoPerRot,
                rounds: rnd,
                displayBalls: disp,
                actualBalls: 0,
                time: tsNow(),
            });
        }
        return hits;
    };

    const handleChainWizardComplete = (isFinal = false) => {
        if (isFinal && endLockRef.current) return;
        const { rounds, mult, displayBalls, lastOutBalls, nextTimingBalls, elecSapoRot } = chainWizardData;
        const rnd = Number(rounds) || 0;
        if (rnd <= 0) {
            setChainWizardOpen(false);
            return;
        }
        S.pushSnapshot();

        const lastOut = Number(lastOutBalls) || 0;
        const nextTiming = Number(nextTimingBalls) || 0;
        const elecRot = Number(elecSapoRot) || 0;
        const disp = Number(displayBalls) || 0;
        const multN = Math.max(1, Number(mult) || 1);

        if (isFinal) {
            endLockRef.current = true;
            // 最終大当たり - チェーンを完了させる
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                const newHits = buildSplitHits(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
                chain.hits = [...chain.hits, ...newHits];
                // サマリー計算
                const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
                const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
                const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
                const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
                chain.completed = true;
                chain.summary = {
                    totalRounds,
                    totalDisplayBalls,
                    totalSapoRot,
                    totalSapoChange,
                    avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                    sapoDelta: totalSapoChange,
                    sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                    netGain: totalDisplayBalls + totalSapoChange,
                };
                chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
                updated[updated.length - 1] = chain;
                return updated;
            });
            // 出玉を持ち玉に加算
            const lastChainCopy = jpLog[jpLog.length - 1];
            const existingTotal = (lastChainCopy.trayBalls || 0) +
                lastChainCopy.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
            const finalBallsToAdd = existingTotal + disp * multN + (nextTiming - lastOut - disp * multN);
            S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);
            S.pushLog({ type: "連チャン終了", time: tsNow() });
            S.setPlayMode("mochi");
            S.setTab("rot");
            S.setShowStartPrompt(true);
            setTimeout(() => { endLockRef.current = false; }, 0);
        } else {
            // 連チャン継続
            S.setJpLog((prev) => {
                const updated = [...prev];
                const chain = { ...updated[updated.length - 1] };
                const newHits = buildSplitHits(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
                chain.hits = [...chain.hits, ...newHits];
                updated[updated.length - 1] = chain;
                return updated;
            });
            S.pushLog({ type: "連チャン追加", time: tsNow(), rounds: rnd });
        }

        setChainWizardOpen(false);
        clearChainWizard();
    };

    // 単発終了ウィザード完了（時短データ含む）
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
        // 最終1hitだけ使うサポ増減（持ち玉加算に必要）
        const sapoChange = nextTiming - lastOut - disp * multN;
        const jitan = Number(jitanSpins) || 0;
        const finalBalls = Number(finalBallsAfterJitan) || 0;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            const newHits = buildSplitHits(chain.hits.length + 1, { rnd, mult: multN, disp, lastOut, nextTiming, elecRot });
            chain.hits = [...chain.hits, ...newHits];
            // 単発終了として完了
            chain.hitType = "単発";
            chain.jitanSpins = jitan;
            chain.finalBallsAfterJitan = finalBalls;
            chain.completed = true;
            // サマリー計算
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 出玉を持ち玉に加算（既存のヒット + 最後のヒット + 上皿玉）
        const currentChain = jpLog[jpLog.length - 1];
        const existingTotal = (currentChain?.trayBalls || 0) +
            (currentChain?.hits || []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal + disp * multN + sapoChange;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow(), rounds: rnd });
        S.setPlayMode("mochi");
        S.setTab("rot");
        // 時短終了後のスタート入力プロンプトを表示
        S.setShowStartPrompt(true);

        setChainWizardOpen(false);
        clearChainWizard();
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // 直接単発終了を開く（ヒットが既にある場合のみ）
    const openDirectSingleEnd = () => {
        if (!isChainActive || lastChain.hits.length === 0) return;
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
            // サマリー計算
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: finalBalls > 0 ? finalBalls : totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = finalBalls > 0 ? finalBalls : (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 出玉を持ち玉に加算
        const existingTotal = (lastChain.trayBalls || 0) +
            lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
        const addBalls = finalBalls > 0 ? finalBalls : existingTotal;
        S.setCurrentMochiBalls((prev) => prev + addBalls);
        S.pushLog({ type: "単発終了", time: tsNow() });
        S.setPlayMode("mochi");
        S.setTab("rot");
        S.setShowStartPrompt(true);

        setDirectSingleEndOpen(false);
        setDirectSingleEndData({ jitanSpins: "", finalBallsAfterJitan: "" });
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    // 最終大当たり終了: 最後のヒットを追加してチェーン完了
    const handleChainEnd = () => {
        if (endLockRef.current) return;
        if (!isChainActive) return;

        const rounds = Number(iRounds) || 0;
        const currentHitsCount = lastChain.hits.length;

        // ヒットが0かつ新規入力もない場合は終了できない
        if (currentHitsCount === 0 && rounds <= 0) return;
        S.pushSnapshot();
        endLockRef.current = true;

        const lastOut = Number(iLastOutBalls) || 0;
        const nextTiming = Number(iNextTimingBalls) || 0;
        const elecRot = Number(iElecSapoRot) || 0;
        const disp = Number(iDisplayBalls) || 0;
        // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
        const sapoChange = nextTiming - lastOut - disp;
        const hitSapoPerRot = elecRot > 0 ? sapoChange / elecRot : 0;

        const isFirstHit = lastChain.hits.length === 0;
        const trayForFirstHit = isFirstHit ? (Number(iTrayBalls) || 0) : 0;

        // 持ち玉計算を先に行う（setJpLog前の状態から計算）
        // 既存のヒットの出玉合計 + 今回追加するヒットの出玉（rounds > 0の場合のみ）
        const existingDisplayBalls = lastChain.hits.reduce((s, h) => s + (h.displayBalls || 0), 0);
        const existingSapoChange = lastChain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);
        const existingTrayBalls = lastChain.trayBalls || 0;
        // 1連目の場合は今回入力するtrayBallsを使用、そうでなければ既存のtrayBallsを使用
        const trayBalls = isFirstHit ? trayForFirstHit : existingTrayBalls;
        const newHitBalls = rounds > 0 ? (disp + sapoChange) : 0;
        const finalBallsToAdd = trayBalls + existingDisplayBalls + existingSapoChange + newHitBalls;

        S.setJpLog((prev) => {
            const updated = [...prev];
            const chain = { ...updated[updated.length - 1] };
            // 1連目の場合: 上皿玉を保存
            if (isFirstHit) {
                chain.trayBalls = trayForFirstHit;
                S.setTotalTrayBalls((p) => p + trayForFirstHit);
            }
            // ラウンド入力がある場合は最後のヒットを追加
            if (rounds > 0) {
                chain.hits = [...chain.hits, {
                    hitNumber: chain.hits.length + 1,
                    lastOutBalls: lastOut,
                    nextTimingBalls: nextTiming,
                    elecSapoRot: elecRot,
                    sapoChange,
                    sapoPerRot: hitSapoPerRot,
                    rounds,
                    displayBalls: disp,
                    actualBalls: Number(iActualBalls) || 0,
                    time: tsNow(),
                }];
            }
            // サマリー計算（新しいサポ増減定義）
            const totalRounds = chain.hits.reduce((s, h) => s + h.rounds, 0);
            const totalDisplayBalls = chain.hits.reduce((s, h) => s + h.displayBalls, 0);
            const totalSapoRot = chain.hits.reduce((s, h) => s + (h.elecSapoRot || h.sapoRot || 0), 0);
            const totalSapoChange = chain.hits.reduce((s, h) => s + (h.sapoChange || 0), 0);

            chain.completed = true;
            chain.summary = {
                totalRounds,
                totalDisplayBalls,
                totalSapoRot,
                totalSapoChange,
                avg1R: totalRounds > 0 ? totalDisplayBalls / totalRounds : 0,
                sapoDelta: totalSapoChange,
                sapoPerRot: totalSapoRot > 0 ? totalSapoChange / totalSapoRot : 0,
                netGain: totalDisplayBalls + totalSapoChange,
            };
            chain.finalBalls = (chain.trayBalls || 0) + totalDisplayBalls + totalSapoChange;
            updated[updated.length - 1] = chain;
            return updated;
        });

        // 連チャン終了後の出玉を持ち玉に加算
        S.setCurrentMochiBalls((prev) => prev + finalBallsToAdd);

        S.pushLog({ type: "連チャン終了", time: tsNow() });
        clearInputs();
        // 持ち玉モードに自動切替
        S.setPlayMode("mochi");
        S.setTab("rot");
        // 大当たり終了後のスタート入力プロンプトを表示
        S.setShowStartPrompt(true);
        setTimeout(() => { endLockRef.current = false; }, 0);
    };

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Sub Tab */}
            <div style={{ display: "flex", background: "rgba(0,0,0,0.2)", padding: "4px", margin: "12px 14px", borderRadius: 12, flexShrink: 0 }}>
                {[["jp", "大当たり履歴"], ["ses", "稼働ログ"]].map(([id, lbl]) => (
                    <button key={id} className="b" onClick={() => setSub(id)} style={{
                        flex: 1, background: sub === id ? C.surfaceHi : "transparent", border: "none",
                        borderRadius: 8, color: sub === id ? C.text : C.sub, fontSize: 13, fontWeight: sub === id ? 700 : 500,
                        padding: "10px 0", fontFamily: font, boxShadow: sub === id ? "0 2px 8px rgba(0,0,0,0.2)" : "none"
                    }}>{lbl}</button>
                ))}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(80px + env(safe-area-inset-bottom))" }}>
                {sub === "jp" ? (
                    <div>
                        {/* 連チャン中バナー */}
                        {isChainActive && (
                            <div style={{ background: `linear-gradient(135deg, ${C.orange}20, ${C.red}10)`, border: `1px solid ${C.orange}40`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: C.orange, marginBottom: 4 }}>
                                    {lastChain.hits.length === 0 ? "初当たり — 1連目を入力してください" : `連チャン中 — ${lastChain.hits.length}連目まで記録済み`}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub }}>
                                    {lastChain.hits.length > 0 && `上皿玉: ${f(lastChain.trayBalls)}玉 | `}{lastChain.time}
                                </div>
                            </div>
                        )}

                        {/* アクションボタン — 連チャン中のみ表示 */}
                        {isChainActive ? (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                                <button className="b" onClick={openChainWizard} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: "#16a34a", border: "none", color: "#fff",
                                    boxShadow: "none"
                                }}>
                                    連チャン追加
                                </button>
                                <button className="b" onClick={openDirectSingleEnd} disabled={lastChain.hits.length === 0} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: lastChain.hits.length === 0 ? "rgba(99,102,241,0.3)" : "#4f46e5",
                                    border: "none", color: "#fff",
                                    boxShadow: lastChain.hits.length === 0 ? "none" : "0 4px 16px rgba(99,102,241,0.4)",
                                    opacity: lastChain.hits.length === 0 ? 0.5 : 1
                                }}>
                                    単発終了
                                </button>
                                <button className="b" onClick={handleChainEnd} style={{
                                    padding: "16px 0", borderRadius: 14, fontWeight: 800, fontSize: 14,
                                    background: "#ea580c", border: "none", color: "#fff",
                                    boxShadow: "none"
                                }}>
                                    大当り終了
                                </button>
                            </div>
                        ) : (
                            <Card style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                                    回転数タブの「初当たり」ボタンから<br />チェーンを開始してください
                                </div>
                            </Card>
                        )}

                        {/* 実測サマリー */}
                        <div style={{ margin: "0 0 16px", background: "rgba(0,0,0,0.2)", border: `1px solid ${C.teal}30`, borderRadius: 12, overflow: "hidden" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
                                {[
                                    { label: "平均1R出玉", val: ev.avg1R > 0 ? f(ev.avg1R, 1) : "—", unit: "玉", col: C.teal },
                                    { label: "サポ増減/回転", val: ev.totalSapoRot > 0 ? sp(ev.sapoPerRot, 2) : "—", unit: "玉/回転", col: sc(ev.sapoPerRot) },
                                    { label: "平均R数", val: ev.avgRpJ > 0 ? f(ev.avgRpJ, 1) : "—", unit: "R", col: C.blue },
                                    { label: "初当たり", val: jpLog.length > 0 ? jpLog.length.toString() : "0", unit: "回", col: C.green },
                                ].map(({ label, val, unit, col }, idx) => (
                                    <div key={label} style={{ textAlign: "center", padding: "10px 2px", borderRight: idx < 3 ? `1px solid ${C.border}` : "none" }}>
                                        <div style={{ fontSize: 8, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: col, fontFamily: mono, lineHeight: 1 }}>{val}</div>
                                        <div style={{ fontSize: 8, color: C.sub, marginTop: 2 }}>{unit}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* History — Chain Cards */}
                        {jpLog.length === 0 ? (
                            <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>履歴がありません</div>
                        ) : (
                            [...jpLog].reverse().map((chain, ci) => (
                                <div
                                    key={chain.chainId || ci}
                                    style={{ position: "relative", overflow: "hidden", marginBottom: 12 }}
                                    onTouchStart={(e) => handleSwipeStart(e, chain.chainId)}
                                    onTouchMove={handleSwipeMove}
                                    onTouchEnd={() => handleSwipeEnd(chain.chainId)}
                                >
                                    {/* 削除ボタン（スワイプ時のみ表示） */}
                                    {swipingId === chain.chainId && swipeDirection === "horizontal" && swipeX > 0 && (
                                        <div style={{
                                            position: "absolute",
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: 80,
                                            background: "#ef4444",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#fff",
                                            fontWeight: 700,
                                            fontSize: 12,
                                            borderRadius: "0 12px 12px 0"
                                        }}>
                                            削除
                                        </div>
                                    )}
                                    <Card style={{
                                        padding: "12px 16px",
                                        background: !chain.completed ? "rgba(249, 115, 22, 0.05)" : "transparent",
                                        transform: swipingId === chain.chainId ? `translateX(-${swipeX}px)` : "translateX(0)",
                                        transition: swipingId === chain.chainId ? "none" : "transform 0.2s ease"
                                    }}>
                                    {/* Chain Header */}
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: !chain.completed ? C.orange : C.blue }}>
                                            {!chain.completed ? "連チャン中" : `${jpLog.length - ci}回目データ ${chain.hits.length <= 1 ? "単発" : chain.hits.length + "連チャン"}`}
                                        </span>
                                        <span style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{chain.time}</span>
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
                                                <span style={{ fontSize: 10, fontWeight: 700, color: C.yellow }}>{hit.hitNumber}連目</span>
                                                <span style={{ fontSize: 9, color: C.sub, fontFamily: mono }}>{hit.time}</span>
                                            </div>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>出玉(液晶)</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{f(hit.displayBalls)}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>電サポ回転</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.subHi, fontFamily: mono }}>{hit.elecSapoRot || hit.sapoRot || 0}回</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ増減</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: sc(change), fontFamily: mono }}>{change >= 0 ? "+" : ""}{change}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ/回転</div>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: sc(perRot), fontFamily: mono }}>{perRot !== 0 ? (perRot >= 0 ? "+" : "") + perRot.toFixed(2) : "—"}</div>
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}

                                    {/* Chain Summary (completed only) */}
                                    {chain.completed && chain.summary && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>1R出玉</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.teal, fontFamily: mono }}>{f(chain.summary.avg1R, 1)}</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ増減/回転</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoPerRot || 0), fontFamily: mono }}>
                                                        {chain.summary.totalSapoRot > 0 ? sp(chain.summary.sapoPerRot, 2) : "—"}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>サポ総増減</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: sc(chain.summary.sapoDelta), fontFamily: mono }}>{sp(chain.summary.sapoDelta, 0)}</div>
                                                </div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 7, color: C.sub }}>純増出玉</div>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: mono }}>{f(chain.summary.netGain)}</div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "center", fontSize: 9, color: C.sub, fontFamily: mono }}>
                                                {f(chain.summary.avg1R, 1)} × {chain.summary.totalRounds}R {(chain.summary.totalSapoChange || chain.summary.sapoDelta) >= 0 ? "+" : ""}{f(chain.summary.totalSapoChange || chain.summary.sapoDelta)} = {f(Math.round(chain.summary.netGain))}
                                            </div>
                                        </div>
                                    )}

                                    {!chain.completed && chain.hits.length === 0 && (
                                        <div style={{ fontSize: 11, color: C.sub }}>上皿: {f(chain.trayBalls)}玉 — 大当たり中…</div>
                                    )}
                                </Card>
                                </div>
                            ))
                        )}
                        <Btn label="最新履歴を削除" onClick={delJPLast} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                    </div>
                ) : (
                    <div>
                        {sesLog.length === 0 ? (
                            <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>ログがありません</div>
                        ) : (
                            sesLog.map((e, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{e.type}</div>
                                        <div style={{ fontSize: 10, color: C.sub, fontFamily: mono }}>{e.time}</div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        {e.rot != null && <div style={{ fontSize: 12, color: C.blue, fontFamily: mono }}>{f(e.rot)}回</div>}
                                        {e.cash != null && <div style={{ fontSize: 12, color: C.red, fontFamily: mono }}>-{f(e.cash)}円</div>}
                                        {e.tray != null && <div style={{ fontSize: 10, color: C.teal }}>上皿:{f(e.tray)}玉</div>}
                                        {e.netGain != null && <div style={{ fontSize: 10, color: C.green }}>純増:{f(e.netGain)}玉</div>}
                                    </div>
                                </div>
                            ))
                        )}
                        <Btn label="最新ログを削除" onClick={delSesLast} bg="rgba(239, 68, 68, 0.1)" fg={C.red} bd={C.red + "30"} />
                    </div>
                )}
            </div>

            {/* 連チャン追加ウィザードモーダル */}
            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    height: "100dvh",
                    width: "100vw"
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: ラウンド数選択（確変中振り分けを使用） */}
                        {chainWizardStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 24 }}>ラウンド数</div>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                                    {machineRushRounds.map(({ rounds, mult }) => (
                                        <button
                                            key={`${rounds}-${mult}`}
                                            className="b"
                                            onClick={() => { setChainWizardData(d => ({ ...d, rounds, mult })); setChainWizardStep(1); setChainWizardFirstKey(true); }}
                                            style={{
                                                minWidth: 80, height: 80, padding: mult > 1 ? "0 12px" : 0, borderRadius: 16, fontWeight: 800, fontFamily: mono, fontSize: mult > 1 ? 20 : 26,
                                                background: "#ea580c", border: "none", color: "#fff",
                                                boxShadow: "none"
                                            }}
                                        >
                                            {mult > 1 ? `${rounds}R×${mult}` : `${rounds}R`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 1: 液晶表示玉数 */}
                        {chainWizardStep === 1 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶表示玉数{chainWizardData.mult > 1 ? "（1連分）" : ""}</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R{chainWizardData.mult > 1 ? `×${chainWizardData.mult}` : ""}選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 2: サポ増減 - 電サポ回転数 */}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>サポ増減 ①</div>
                                <div style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 大当たり直前の総持ち玉 */}
                        {chainWizardStep === 3 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            const isWarning = prevEndBalls > 0 && Math.abs(diff) > 500;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当たり直前</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevEndBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>前回終了時: {f(prevEndBalls)}玉（自動プリセット済み）</div>
                                    )}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.lastOutBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    {/* 微調整ボタン */}
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => {
                                                const cur = Number(chainWizardData.lastOutBalls) || 0;
                                                setChainWizardData(d => ({ ...d, lastOutBalls: String(Math.max(0, cur + delta)) }));
                                            }} style={{
                                                padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                                                background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                                border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                                                color: delta > 0 ? C.green : C.red, fontFamily: mono
                                            }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {/* 差分表示・警告 */}
                                    {prevEndBalls > 0 && current > 0 && (
                                        <div style={{ marginTop: 12 }}>
                                            <span style={{ fontSize: 12, color: isWarning ? C.orange : C.sub }}>
                                                電サポ中の増減: <span style={{ fontWeight: 700, color: sc(diff), fontFamily: mono }}>{diff >= 0 ? "+" : ""}{diff}</span>
                                            </span>
                                            {isWarning && (
                                                <div style={{ fontSize: 11, color: C.orange, marginTop: 4 }}>極端な変動です。入力値をご確認ください</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 4: ラウンド終了時の総持ち玉 */}
                        {chainWizardStep === 4 && (() => {
                            const prevBalls = Number(chainWizardData.lastOutBalls) || 0;
                            const currentBalls = Number(chainWizardData.nextTimingBalls) || 0;
                            const dispBalls = Number(chainWizardData.displayBalls) || 0;
                            // サポ増減 = ラウンド終了時の玉 - 大当り直前の玉 - 出玉（出玉を除いた純粋な電サポ中の増減）
                            const sapoChange = currentBalls - prevBalls - dispBalls;
                            const rot = Number(chainWizardData.elecSapoRot) || 0;
                            const perRot = rot > 0 ? sapoChange / rot : 0;
                            const isWarning = Math.abs(perRot) > 3; // 1回転あたり±3を超えたら警告
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>現在の総持ち玉（上皿＋カード内）</div>
                                    {prevBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当たり直前: {f(prevBalls)}玉</div>
                                    )}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.nextTimingBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    {/* 微調整ボタン */}
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => {
                                                const cur = Number(chainWizardData.nextTimingBalls) || 0;
                                                setChainWizardData(d => ({ ...d, nextTimingBalls: String(Math.max(0, cur + delta)) }));
                                            }} style={{
                                                padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13,
                                                background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                                border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`,
                                                color: delta > 0 ? C.green : C.red, fontFamily: mono
                                            }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                    {/* 計算結果表示 */}
                                    {currentBalls > 0 && (
                                        <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(0,0,0,0.3)", borderRadius: 12 }}>
                                            <div style={{ display: "flex", gap: 24, justifyContent: "center", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontSize: 10, color: C.sub }}>電サポ増減</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: sc(sapoChange), fontFamily: mono }}>
                                                        {sapoChange >= 0 ? "+" : ""}{sapoChange}
                                                    </div>
                                                </div>
                                                {rot > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: C.sub }}>1回転あたり</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: sc(perRot), fontFamily: mono }}>
                                                            {perRot >= 0 ? "+" : ""}{perRot.toFixed(2)}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {isWarning && (
                                                <div style={{ fontSize: 11, color: C.orange, marginTop: 8 }}>極端な増減です。入力値をご確認ください</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Step 5: 継続/最終/単発選択 */}
                        {chainWizardStep === 5 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 28 }}>この大当たりは？</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
                                    <button className="b" onClick={() => handleChainWizardComplete(false)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#16a34a", border: "none", color: "#fff", boxShadow: "none" }}>
                                        連チャン継続
                                    </button>
                                    <button className="b" onClick={() => { setChainWizardStep(6); setChainWizardFirstKey(true); }}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#4f46e5", border: "none", color: "#fff", boxShadow: "none" }}>
                                        単発終了
                                    </button>
                                    <button className="b" onClick={() => handleChainWizardComplete(true)}
                                        style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#ea580c", border: "none", color: "#fff", boxShadow: "none" }}>
                                        最終大当たり
                                    </button>
                                </div>
                                <button className="b" onClick={() => { setChainWizardStep(4); setChainWizardFirstKey(true); }} style={{ marginTop: 28, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 32px", color: C.sub, fontSize: 14 }}>戻る</button>
                            </div>
                        )}

                        {/* Step 6: 時短回数（単発終了用） */}
                        {chainWizardStep === 6 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 7: 時短終了後最終出玉（単発終了用） */}
                        {chainWizardStep === 7 && (() => {
                            const estimated = Number(chainWizardData.nextTimingBalls) || 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 8 }}>時短終了後の出玉</div>
                                    <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>実際の持ち玉（カード＋上皿）</div>
                                    {estimated > 0 && <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>ラウンド終了時: {f(estimated)}玉（自動プリセット済み）</div>}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {chainWizardData.finalBallsAfterJitan || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.finalBallsAfterJitan) || 0; setChainWizardData(d => ({ ...d, finalBallsAfterJitan: String(Math.max(0, cur + delta)) })); }}
                                                style={{ padding: "8px 14px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: delta > 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", border: `1px solid ${delta > 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, color: delta > 0 ? C.green : C.red, fontFamily: mono }}>
                                                {delta > 0 ? "+" : ""}{delta}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    {/* テンキー（Step 0と5以外で表示） */}
                    {chainWizardStep !== 0 && chainWizardStep !== 5 && (
                        <div style={{
                            padding: "8px 12px",
                            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                            background: "rgba(20,20,25,1)",
                            borderTop: `1px solid ${C.border}`,
                            flexShrink: 0
                        }}>
                            {/* 戻る/次へボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => {
                                    if (chainWizardStep === 1) setChainWizardStep(0);
                                    else if (chainWizardStep === 6) setChainWizardStep(5);
                                    else setChainWizardStep(s => s - 1);
                                    setChainWizardFirstKey(true);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>
                                    戻る
                                </button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>
                                        記録完了
                                    </button>
                                ) : (
                                    <button className="b" onClick={() => {
                                        // Step 3→4の遷移時、nextTimingBallsを自動計算（直前出玉+液晶表示玉数）
                                        if (chainWizardStep === 3) {
                                            const lastOut = Number(chainWizardData.lastOutBalls) || 0;
                                            const disp = Number(chainWizardData.displayBalls) || 0;
                                            const suggested = lastOut + disp;
                                            // nextTimingBallsが未入力の場合のみ自動設定
                                            if (!chainWizardData.nextTimingBalls) {
                                                setChainWizardData(d => ({ ...d, nextTimingBalls: String(suggested) }));
                                            }
                                        }
                                        // Step 6 → 7 に進む時に時短終了後出玉を自動プリセット（ラウンド終了時の持ち玉）
                                        if (chainWizardStep === 6 && !chainWizardData.finalBallsAfterJitan) {
                                            const estimated = Number(chainWizardData.nextTimingBalls) || 0;
                                            if (estimated > 0) {
                                                setChainWizardData(d => ({ ...d, finalBallsAfterJitan: String(estimated) }));
                                            }
                                        }
                                        setChainWizardStep(s => s + 1);
                                        setChainWizardFirstKey(true);
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#2f6fed", border: "none", color: "#fff" }}>
                                        次へ
                                    </button>
                                )}
                            </div>
                            {/* テンキー - 大きくして精度向上 */}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                                {[1,2,3,4,5,6,7,8,9].map(n => (
                                    <button key={n} className="b" onClick={() => {
                                        const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                        setChainWizardData(d => {
                                            // 最初のキー入力なら既存値をクリアして新しい値を設定
                                            if (chainWizardFirstKey) {
                                                return { ...d, [field]: String(n) };
                                            }
                                            const current = d[field] || "";
                                            // 先頭が0のみの場合は置き換え
                                            const newVal = current === "0" ? String(n) : current + n;
                                            return { ...d, [field]: newVal };
                                        });
                                        setChainWizardFirstKey(false);
                                    }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                        {n}
                                    </button>
                                ))}
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => ({ ...d, [field]: "" }));
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                    AC
                                </button>
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => {
                                        // 最初のキー入力なら既存値をクリアして0を設定
                                        if (chainWizardFirstKey) {
                                            return { ...d, [field]: "0" };
                                        }
                                        const current = d[field] || "";
                                        // 空の場合は0を入れない（表示上は0が見えている）
                                        if (current === "") return d;
                                        return { ...d, [field]: current + "0" };
                                    });
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                    0
                                </button>
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "displayBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "lastOutBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setChainWizardData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "var(--surface-hi)", border: "none", color: C.sub, minHeight: 56 }}>
                                    ←
                                </button>
                            </div>
                        </div>
                    )}
                </div>,
                document.body
            )}

            {/* 直接単発終了モーダル */}
            {directSingleEndOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "#000",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                }}>
                    {/* ヘッダー */}
                    <div style={{
                        padding: "12px 16px",
                        paddingTop: "max(12px, env(safe-area-inset-top))",
                        borderBottom: `1px solid ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexShrink: 0,
                        background: "#000"
                    }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>単発終了</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "#000" }}>
                        {/* Step 0: 時短回数 */}
                        {directSingleEndStep === 0 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.purple, marginBottom: 16 }}>時短回数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {directSingleEndData.jitanSpins || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 1: 時短終了後出玉 */}
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

                    {/* テンキー */}
                    <div style={{
                        padding: "8px 12px",
                        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                        background: "rgba(20,20,25,1)",
                        borderTop: `1px solid ${C.border}`,
                        flexShrink: 0
                    }}>
                        {/* 戻る/次へボタン */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <button className="b" onClick={() => {
                                if (directSingleEndStep === 0) setDirectSingleEndOpen(false);
                                else setDirectSingleEndStep(0);
                            }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>
                                {directSingleEndStep === 0 ? "キャンセル" : "戻る"}
                            </button>
                            {directSingleEndStep === 1 ? (
                                <button className="b" onClick={handleDirectSingleEndComplete} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>
                                    記録完了
                                </button>
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
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#2f6fed", border: "none", color: "#fff" }}>
                                    次へ
                                </button>
                            )}
                        </div>
                        {/* テンキー */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <button key={n} className="b" onClick={() => {
                                    const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                    setDirectSingleEndData(d => {
                                        const current = d[field] || "";
                                        // 先頭が0のみの場合は置き換え
                                        const newVal = current === "0" ? String(n) : current + n;
                                        return { ...d, [field]: newVal };
                                    });
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                    {n}
                                </button>
                            ))}
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => ({ ...d, [field]: "" }));
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                AC
                            </button>
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => {
                                    const current = d[field] || "";
                                    // 空の場合は0を入れない（表示上は0が見えている）
                                    if (current === "") return d;
                                    return { ...d, [field]: current + "0" };
                                });
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 24, fontFamily: mono, background: "var(--surface-hi)", border: "none", color: C.text, minHeight: 56 }}>
                                0
                            </button>
                            <button className="b" onClick={() => {
                                const field = directSingleEndStep === 0 ? "jitanSpins" : "finalBallsAfterJitan";
                                setDirectSingleEndData(d => ({ ...d, [field]: (d[field] || "").slice(0, -1) }));
                            }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 20, background: "var(--surface-hi)", border: "none", color: C.sub, minHeight: 56 }}>
                                ←
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/* ================================================================
   CalendarTab — カレンダー式記録 + 詳細表示
================================================================ */
export function CalendarTab({ S, onReset }) {
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedArchiveId, setSelectedArchiveId] = useState(null);
    const [viewMonth, setViewMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [delConfirm, setDelConfirm] = useState(null);
    const [expandedRot, setExpandedRot] = useState(null);
    // Edit form state (always declared — not conditional)
    const [editStore, setEditStore] = useState("");
    const [editMachineNum, setEditMachineNum] = useState("");
    const [editInvest, setEditInvest] = useState("");
    const [editRecovery, setEditRecovery] = useState("");
    const [showEditStoreDD, setShowEditStoreDD] = useState(false);
    // Swipe delete state
    const [swipedId, setSwipedId] = useState(null);
    const swipeRef = useRef({ startX: 0, id: null });

    const archives = S.archives || [];

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
                ev += (a.stats?.workAmount || 0);
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

    // Monthly total
    const monthKey = `${viewMonth.year}-${String(viewMonth.month + 1).padStart(2, "0")}`;
    const monthTotal = useMemo(() => {
        let actual = 0, ev = 0;
        let hasActual = false;
        Object.entries(dailyTotals).forEach(([date, v]) => {
            if (date.startsWith(monthKey)) {
                actual += v.actual || 0;
                ev += v.ev || 0;
                if (v.hasActual) hasActual = true;
            }
        });
        return { actual, ev, hasActual };
    }, [dailyTotals, monthKey]);

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

    // Helper: create archive object (all values must be JSON-serializable)
    const makeArchive = () => {
        const autoInvest = S.ev?.rawInvest || 0;
        const now = new Date();
        // Extract only numeric stats to avoid serialization issues
        const safeStats = S.ev ? Object.fromEntries(
            Object.entries(S.ev).filter(([, v]) => typeof v === "number" || typeof v === "string")
        ) : {};
        return {
            id: now.getTime(),
            date: now.toISOString().slice(0, 10),
            time: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
            rotRows: JSON.parse(JSON.stringify(S.rotRows || [])),
            jpLog: JSON.parse(JSON.stringify(S.jpLog || [])),
            sesLog: JSON.parse(JSON.stringify(S.sesLog || [])),
            settings: { rentBalls: S.rentBalls, exRate: S.exRate, synthDenom: S.synthDenom, rotPerHour: S.rotPerHour, border: S.border, ballVal: S.ballVal },
            stats: safeStats,
            totalTrayBalls: S.totalTrayBalls || 0,
            startRot: S.startRot || 0,
            storeName: String(S.storeName || ""),
            machineNum: String(S.machineNum || ""),
            investYen: Number(S.investYen) || autoInvest || 0,
            recoveryYen: Number(S.recoveryYen) || 0,
            machineName: String(S.machineName || `1/${S.synthDenom}`),
            initialChodama: S.initialChodama || 0,
            finalChodama: S.currentChodama || 0,
            chodamaNetBalls: (S.currentChodama || 0) - (S.initialChodama || 0),
            chodamaYen: Math.round((S.ev?.chodamaKCount || 0) * 1000 * (S.exRate || 250) / (S.rentBalls || 250)),
        };
    };

    const textInput = (val, set, placeholder, opts = {}) => (
        <input type={opts.type || "text"} inputMode={opts.inputMode || undefined} pattern={opts.pattern || undefined}
            value={val || ""} onChange={e => set(e.target.value)} placeholder={placeholder}
            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 16, color: C.text, fontFamily: font, outline: "none" }} />
    );

    const storeList = S.stores || [];
    const [showStoreDropdown, setShowStoreDropdown] = useState(false);
    const autoInvest = S.ev?.rawInvest || 0;

    // ── Inline summary card for an archive entry (reference app style) ──
    const SummaryCard = ({ a, onClick }) => {
        const st = a.stats || {};
        const invest = a.investYen || 0;
        const recovery = a.recoveryYen || 0;
        const pl = (invest > 0 || recovery > 0) ? recovery - invest : null;
        const displayPL = pl != null ? pl : (st.workAmount || 0);
        const rph = a.settings?.rotPerHour || S.rotPerHour || 200;
        const hours = st.netRot > 0 && rph > 0
            ? (st.netRot / rph).toFixed(1)
            : null;
        const hourlyWage = hours && Number(hours) > 0 && displayPL !== 0
            ? Math.round(displayPL / Number(hours))
            : null;
        const displayName = a.machineName && a.machineName !== `1/${a.settings?.synthDenom}`
            ? a.machineName
            : (a.machineName || `1/${a.settings?.synthDenom || "—"}`);

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
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>4パチ</span>
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
                                            : "rgba(255, 255, 255, 0.06)",
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
                            {(a.chodamaYen || 0) > 0 && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    padding: "3px 8px",
                                    fontSize: 10, fontWeight: 700,
                                    borderRadius: 999,
                                    background: "rgba(192, 132, 252, 0.12)",
                                    color: C.purple,
                                    border: "1px solid rgba(192, 132, 252, 0.25)",
                                }}>
                                    💎 貯玉 ¥{f(a.chodamaYen)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right — labeled big P&L */}
                    <div style={{ textAlign: "right", marginLeft: 10, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.4px", marginBottom: 3 }}>収支</div>
                        <div style={{
                            fontSize: 24, fontWeight: 800,
                            color: sc(displayPL), fontFamily: font,
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1, letterSpacing: "-0.3px",
                        }}>
                            {sp(displayPL)}<span className="unit">円</span>
                        </div>
                    </div>
                </div>

                {/* Soft horizontal divider */}
                <div style={{
                    height: 1,
                    background: C.border,
                    margin: "12px 0 10px",
                }} />

                {/* Row 2: 3-column detail grid with directional icons */}
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
                            <span style={{ color: C.green, fontSize: 11, opacity: 0.75, lineHeight: 1 }}>●</span>
                            <span>回収</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>
                            {f(recovery)}<span className="unit">円</span>
                        </div>
                    </div>
                    <div style={{ textAlign: "center", padding: "0 4px", borderLeft: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, letterSpacing: "0.3px", marginBottom: 3 }}>
                            期待値
                        </div>
                        <div style={{
                            fontSize: 14, fontWeight: 700,
                            color: st.workAmount != null && st.workAmount !== 0 ? sc(st.workAmount) : C.sub,
                            fontFamily: font, fontVariantNumeric: "tabular-nums",
                            opacity: st.workAmount != null && st.workAmount !== 0 ? 0.92 : 0.5,
                        }}>
                            {st.workAmount != null && st.workAmount !== 0 ? sp(Math.round(st.workAmount)) : "—"}<span className="unit">円</span>
                        </div>
                    </div>
                </div>

                {/* Subtle tap indicator — bottom right */}
                <div style={{ position: "absolute", right: 12, bottom: 6, fontSize: 10, color: C.sub, opacity: 0.35 }}>▶</div>
            </button>
        );
    };

    // Initialize edit form when archive selection changes
    const prevSelectedRef = useRef(null);
    if (selectedArchiveId && selectedArchiveId !== prevSelectedRef.current) {
        const target = archives.find(ar => ar.id === selectedArchiveId);
        if (target) {
            prevSelectedRef.current = selectedArchiveId;
            // Defer state updates to avoid render-during-render
            setTimeout(() => {
                setEditStore(String(target.storeName || ""));
                setEditMachineNum(String(target.machineNum || ""));
                setEditInvest(target.investYen || "");
                setEditRecovery(target.recoveryYen || "");
                setShowEditStoreDD(false);
            }, 0);
        }
    } else if (!selectedArchiveId && prevSelectedRef.current) {
        prevSelectedRef.current = null;
    }

    // ── Detail View for a specific archive ──
    if (selectedArchiveId) {
        const a = archives.find(ar => ar.id === selectedArchiveId);
        if (!a) { setSelectedArchiveId(null); return null; }
        const st = a.stats || {};
        const pl = (a.investYen > 0 || a.recoveryYen > 0) ? (a.recoveryYen || 0) - (a.investYen || 0) : null;
        const aggKey = `${a.settings?.synthDenom || ""}|${a.machineNum}`;
        const agg = a.machineNum ? machineAggregates[aggKey] : null;

        const updateArchive = (doReset) => {
            S.setArchives(prev => prev.map(ar => ar.id !== a.id ? ar : {
                ...ar,
                storeName: editStore,
                machineNum: editMachineNum,
                investYen: Number(editInvest) || 0,
                recoveryYen: Number(editRecovery) || 0,
            }));
            if (doReset) onReset();
            // 保存後は詳細ビューを閉じてカレンダー一覧に戻す（視覚的フィードバック）
            setSelectedArchiveId(null);
            setExpandedRot(null);
            setDelConfirm(null);
        };

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
                                ) : st.workAmount != null && st.workAmount !== 0 ? (
                                    <div style={{ fontSize: 28, fontWeight: 900, color: sc(st.workAmount), fontFamily: mono, lineHeight: 1.1 }}>
                                        {f(st.workAmount)}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
                            {[
                                { label: "投資", val: f(a.investYen || 0), col: C.red },
                                { label: "回収", val: f(a.recoveryYen || 0), col: C.green },
                                { label: "収支", val: pl != null ? f(pl) : "0", col: pl != null ? sc(pl) : C.subHi },
                                { label: "仕事量", val: st.workAmount != null && st.workAmount !== 0 ? f(Math.round(st.workAmount)) : "—", col: st.workAmount ? sc(st.workAmount) : C.subHi },
                            ].map(({ label, val, col }) => (
                                <div key={label} style={{ textAlign: "center", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 2px" }}>
                                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 3, fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: col, fontFamily: mono }}>{val}</div>
                                </div>
                            ))}
                        </div>
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

                    {/* Edit form */}
                    <Card style={{ padding: 14, marginBottom: 8 }}>
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
                            </div>
                            <div>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 }}>回収額</div>
                                <NI v={editRecovery} set={setEditRecovery} w="100%" center ph="0" />
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <Btn label="保存" onClick={() => updateArchive(false)} primary fs={13} />
                            <Btn label="保存してリセット" onClick={() => updateArchive(true)} bg={C.orange} fg="#fff" bd="none" fs={13} />
                        </div>
                    </Card>

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

                    {/* Rotation data */}
                    {a.rotRows && a.rotRows.length > 0 && (
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
                                    </div>
                                );
                            })}
                        </Card>
                    )}

                    {/* Jackpot history */}
                    {a.jpLog && a.jpLog.length > 0 && (
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
                                            <div style={{ fontSize: 10, color: C.yellow, fontFamily: mono }}>液晶{f(hit.displayBalls)}</div>
                                            <div style={{ fontSize: 10, color: C.green, fontFamily: mono }}>実{f(hit.actualBalls)}</div>
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
                    )}

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

    // Compact 万 formatting for calendar cell (-50000 -> -5万, +12000 -> +1.2万)
    const compactYen = (n) => {
        if (!isFinite(n) || n === 0) return "";
        const sign = n < 0 ? "-" : "+";
        const abs = Math.abs(n);
        if (abs >= 10000) {
            const man = abs / 10000;
            const shown = man >= 10 ? Math.round(man).toString() : (Math.round(man * 10) / 10).toString();
            return `${sign}${shown}万`;
        }
        if (abs >= 1000) return `${sign}${Math.round(abs / 1000)}k`;
        return `${sign}${abs}`;
    };

    // ── Calendar View ──
    return (
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px calc(80px + env(safe-area-inset-bottom))" }}>
            {/* Title row — 収支 + 期間セグメント */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 2px 10px" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-0.5px" }}>収支</div>
                <div className="segmented">
                    <button className="active">月別</button>
                </div>
            </div>

            {/* Month navigator */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 2px 14px" }}>
                <button className="b" onClick={prevMonth} style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: C.surface, border: `1px solid ${C.border}`,
                    color: C.subHi, fontSize: 18, fontWeight: 500, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "var(--card-shadow)",
                }}>‹</button>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{viewMonth.year}年{viewMonth.month + 1}月</div>
                <button className="b" onClick={nextMonth} style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: C.surface, border: `1px solid ${C.border}`,
                    color: C.subHi, fontSize: 18, fontWeight: 500, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "var(--card-shadow)",
                }}>›</button>
            </div>

            {/* Calendar card */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 12px 10px", marginBottom: 14, boxShadow: "var(--card-shadow)" }}>
                {/* Month total header */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 4px 10px" }}>
                    <span style={{ fontSize: 11, color: C.sub, fontWeight: 600 }}>月計</span>
                    <span style={{
                        fontSize: 16, fontWeight: 800,
                        color: monthTotal.hasActual ? sc(monthTotal.actual) : C.sub,
                        fontFamily: font, fontVariantNumeric: "tabular-nums",
                    }}>
                        {monthTotal.hasActual ? <>{sp(Math.round(monthTotal.actual))} <span style={{ fontSize: 12, fontWeight: 600 }}>円</span></> : "—"}
                    </span>
                </div>

                {/* Day of week header */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "2px 0 4px" }}>
                    {["月", "火", "水", "木", "金", "土", "日"].map((d, i) => (
                        <div key={d} style={{
                            textAlign: "center", fontSize: 11, fontWeight: 600,
                            color: i === 5 ? C.blue : i === 6 ? C.red : C.sub,
                            padding: "4px 0",
                        }}>{d}</div>
                    ))}
                </div>

                {/* Calendar grid — iOS風ミニマル */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
                    {calendarDays.map((day, idx) => {
                        if (day === null) return <div key={`e-${idx}`} style={{ minHeight: 52 }} />;
                        const ds = dateStr(day);
                        const total = dailyTotals[ds];
                        const hasActualData = total != null && total.hasActual;
                        const isSel = selectedDate === ds;
                        const isTdy = isToday(day);
                        const dow = idx % 7;
                        const dayColor = dow === 5 ? C.blue : dow === 6 ? C.red : C.text;

                        return (
                            <button key={day} className="b" onClick={() => setSelectedDate(isSel ? null : ds)} style={{
                                background: isSel ? `color-mix(in srgb, ${C.blue} 8%, transparent)` : "transparent",
                                border: "none",
                                borderRadius: 10,
                                padding: "6px 0",
                                textAlign: "center",
                                minHeight: 52,
                                cursor: "pointer",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 2,
                            }}>
                                <div style={{
                                    fontSize: 15,
                                    fontWeight: isTdy ? 700 : 500,
                                    color: isTdy ? C.blue : dayColor,
                                    lineHeight: 1,
                                    fontVariantNumeric: "tabular-nums",
                                    marginTop: 2,
                                }}>{day}</div>
                                {hasActualData ? (
                                    <>
                                        <div style={{
                                            fontSize: 10, fontWeight: 700,
                                            color: sc(total.actual),
                                            fontFamily: font,
                                            fontVariantNumeric: "tabular-nums",
                                            lineHeight: 1,
                                        }}>
                                            {compactYen(Math.round(total.actual))}
                                        </div>
                                        <div style={{
                                            width: 4, height: 4, borderRadius: "50%",
                                            background: sc(total.actual),
                                            marginTop: 1,
                                        }} />
                                    </>
                                ) : (
                                    <div style={{ height: 13 }} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 月間収支サマリーカード */}
            {(() => {
                const monthArchives = Object.entries(byDate)
                    .filter(([d]) => d.startsWith(monthKey))
                    .flatMap(([, arr]) => arr);
                const playCount = monthArchives.length;
                const winCount = monthArchives.filter(a => ((a.recoveryYen || 0) - (a.investYen || 0)) > 0).length;
                const winRate = playCount > 0 ? Math.round((winCount / playCount) * 100) : 0;
                const totalInvest = monthArchives.reduce((s, a) => s + (a.investYen || 0), 0);
                const totalRecovery = monthArchives.reduce((s, a) => s + (a.recoveryYen || 0), 0);
                const totalPL = totalRecovery - totalInvest;
                return (
                    <>
                        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", marginBottom: 10, boxShadow: "var(--card-shadow)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                    <div style={{ fontSize: 12, color: C.sub, fontWeight: 600, marginBottom: 6 }}>月間収支</div>
                                    <div style={{ fontSize: 30, fontWeight: 800, color: totalPL !== 0 ? sc(totalPL) : C.sub, fontFamily: font, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.8px", lineHeight: 1 }}>
                                        {totalPL !== 0 ? sp(totalPL) : "0"}<span style={{ fontSize: 16, fontWeight: 700, marginLeft: 2 }}>円</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{playCount}回プレイ</div>
                                    <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>勝率 {winRate}% ({winCount}/{playCount})</div>
                                </div>
                            </div>
                            {totalPL < 0 && (
                                <div style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>厳しい期間でも、データは着実に蓄積中</div>
                            )}
                        </div>

                        {/* 投資/回収 2-column */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--card-shadow)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block" }} />
                                    <span style={{ fontSize: 13, color: C.subHi, fontWeight: 600 }}>投資</span>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>{f(totalInvest)}<span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>円</span></span>
                            </div>
                            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--card-shadow)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, display: "inline-block" }} />
                                    <span style={{ fontSize: 13, color: C.subHi, fontWeight: 600 }}>回収</span>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 700, color: totalRecovery > 0 ? C.green : C.text, fontFamily: font, fontVariantNumeric: "tabular-nums" }}>{f(totalRecovery)}<span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>円</span></span>
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* ── Inline data strip when date is selected ── */}
            {selectedDate && (() => {
                const dateArchives = byDate[selectedDate] || [];
                const dayTotal = dailyTotals[selectedDate];
                const hasCurrentSession = S.rotRows && S.rotRows.length > 0;
                return (
                    <div style={{ marginTop: 10 }}>
                        {/* Selected date header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 2px" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selectedDate}</div>
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

                        {/* Save current session as new entry (compact) */}
                        {hasCurrentSession && (
                            <div style={{ marginBottom: 10, padding: "10px 12px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "var(--card-shadow)" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: C.blue, marginBottom: 6 }}>現在のセッションを保存</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                    <Btn label="保存" onClick={() => {
                                        const a = makeArchive();
                                        a.date = selectedDate;
                                        S.setArchives(prev => [...prev, a]);
                                    }} primary fs={12} />
                                    <Btn label="保存+リセット" onClick={() => {
                                        const a = makeArchive();
                                        a.date = selectedDate;
                                        S.setArchives(prev => [...prev, a]);
                                        onReset();
                                    }} bg={C.orange} fg="#fff" bd="none" fs={12} />
                                </div>
                            </div>
                        )}

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
                            <div style={{ textAlign: "center", color: C.sub, fontSize: 12, padding: "20px 0" }}>
                                この日のデータはありません
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* CSV Import/Export */}
            <Card style={{ padding: 14, marginTop: 12 }}>
                <SecLabel label="データ管理" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Btn label="CSVエクスポート" onClick={() => {
                        if (archives.length === 0) {
                            alert("エクスポートするデータがありません");
                            return;
                        }
                        const headers = [
                            "日付", "時刻", "店舗名", "台番号", "機種名",
                            "投資", "回収", "収支", "確率分母", "貸玉数", "換金率",
                            "時間回転数", "ボーダー", "玉単価", "仕事量", "期待値/K", "1Kスタート", "総回転"
                        ];
                        const rows = archives.map(a => {
                            const st = a.stats || {};
                            const invest = a.investYen || 0;
                            const recovery = a.recoveryYen || 0;
                            return [
                                a.date || "",
                                a.time || "",
                                (a.storeName || "").replace(/,/g, "，"),
                                a.machineNum || "",
                                (a.machineName || "").replace(/,/g, "，"),
                                invest,
                                recovery,
                                recovery - invest,
                                a.settings?.synthDenom || "",
                                a.settings?.rentBalls || "",
                                a.settings?.exRate || "",
                                a.settings?.rotPerHour || "",
                                a.settings?.border || "",
                                a.settings?.ballVal || "",
                                Math.round(st.workAmount || 0),
                                Math.round(st.ev1K || 0),
                                st.start1K ? st.start1K.toFixed(2) : "",
                                Math.round(st.netRot || 0)
                            ].join(",");
                        });
                        const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `pachi-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
                        link.click();
                        URL.revokeObjectURL(url);
                    }} fs={12} />
                    <label style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "#2f6fed", border: "none", borderRadius: 12,
                        color: "#fff", fontSize: 12, fontWeight: 700, padding: "12px 16px", cursor: "pointer",
                        fontFamily: font, textAlign: "center"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                                try {
                                    let text = ev.target?.result;
                                    if (typeof text !== "string") return;
                                    // BOM除去
                                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                                    if (lines.length < 2) {
                                        alert("有効なデータがありません");
                                        return;
                                    }
                                    const headerLine = lines[0];
                                    const headers = headerLine.split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
                                    // カラム名の柔軟なマッチング
                                    const colIdx = (names) => {
                                        const arr = Array.isArray(names) ? names : [names];
                                        for (const name of arr) {
                                            const idx = headers.indexOf(name);
                                            if (idx !== -1) return idx;
                                        }
                                        return -1;
                                    };
                                    const getCol = (cols, names, def = "") => {
                                        const idx = colIdx(names);
                                        return idx >= 0 && cols[idx] ? cols[idx] : def;
                                    };
                                    const newArchives = [];
                                    for (let i = 1; i < lines.length; i++) {
                                        const cols = lines[i].split(",").map(c => c.trim());
                                        if (cols.length < 3) continue;
                                        // 日付フォーマット変換 (2026/03/13 → 2026-03-13)
                                        let date = getCol(cols, ["日付", "date"]);
                                        if (date.includes("/")) date = date.replace(/\//g, "-");
                                        if (!date) continue;
                                        const time = getCol(cols, ["時刻", "time"]);
                                        const invest = parseFloat(getCol(cols, ["投資額", "投資", "invest"], "0")) || 0;
                                        const recovery = parseFloat(getCol(cols, ["回収額", "回収", "recovery"], "0")) || 0;
                                        const synthDenom = parseFloat(getCol(cols, ["確率分母"], "319.6")) || 319.6;
                                        const rentBalls = parseFloat(getCol(cols, ["貸玉数"], "250")) || 250;
                                        const exRate = parseFloat(getCol(cols, ["換金率"], "250")) || 250;
                                        const rotPerHour = parseFloat(getCol(cols, ["時間回転数"], "250")) || 250;
                                        const border = parseFloat(getCol(cols, ["ボーダー"], "20")) || 20;
                                        const ballVal = parseFloat(getCol(cols, ["玉単価"], "4")) || 4;
                                        const workAmount = parseFloat(getCol(cols, ["仕事量", "期待値"], "0")) || 0;
                                        const ev1K = parseFloat(getCol(cols, ["期待値/K"], "0")) || 0;
                                        const start1K = parseFloat(getCol(cols, ["1Kスタート"], "0")) || 0;
                                        const netRot = parseFloat(getCol(cols, ["総回転"], "0")) || 0;
                                        const hours = parseFloat(getCol(cols, ["稼働時間"], "0")) || 0;
                                        const hourlyWage = parseFloat(getCol(cols, ["時給"], "0")) || 0;
                                        newArchives.push({
                                            id: Date.now() + i + Math.random(),
                                            date,
                                            time,
                                            storeName: getCol(cols, ["店舗名", "店舗"]).replace(/，/g, ","),
                                            machineNum: getCol(cols, ["台番号"]),
                                            machineName: getCol(cols, ["機種名", "機種"]).replace(/，/g, ","),
                                            investYen: invest,
                                            recoveryYen: recovery,
                                            settings: { synthDenom, rentBalls, exRate, rotPerHour, border, ballVal },
                                            stats: { workAmount, ev1K, start1K, netRot },
                                            rotRows: [],
                                            jpLog: [],
                                            sesLog: [],
                                            totalTrayBalls: 0,
                                            startRot: 0,
                                        });
                                    }
                                    if (newArchives.length === 0) {
                                        alert("インポートできるデータがありませんでした");
                                        return;
                                    }
                                    // デバッグ: 最初のエントリの日付を表示
                                    console.log("Import debug:", newArchives.map(a => ({ date: a.date, invest: a.investYen, recovery: a.recoveryYen, work: a.stats?.workAmount })));
                                    // 重複チェック用のキー生成関数
                                    const getKey = (a) => `${a.date}|${a.storeName || ""}|${a.machineNum || ""}|${a.machineName || ""}|${a.investYen || 0}|${a.recoveryYen || 0}`;
                                    // CSVインポートしたデータにはisImportedフラグを付ける
                                    const importedArchives = newArchives.map(a => ({ ...a, isImported: true }));
                                    S.setArchives(prev => {
                                        // 既存のインポートデータを除外
                                        const nonImported = prev.filter(a => !a.isImported);
                                        // 既存データのキーセットを作成
                                        const existingKeys = new Set(nonImported.map(getKey));
                                        // 重複を除外した新しいインポートデータ
                                        const uniqueImported = importedArchives.filter(a => !existingKeys.has(getKey(a)));
                                        // インポートデータ内での重複も除外
                                        const seenKeys = new Set();
                                        const dedupedImported = uniqueImported.filter(a => {
                                            const key = getKey(a);
                                            if (seenKeys.has(key)) return false;
                                            seenKeys.add(key);
                                            return true;
                                        });
                                        const updated = [...nonImported, ...dedupedImported];
                                        console.log("Archives after import:", updated.length, "(non-imported:", nonImported.length, ", imported:", dedupedImported.length, ", skipped duplicates:", importedArchives.length - dedupedImported.length, ")");
                                        return updated;
                                    });
                                    alert(`${newArchives.length}件のデータをインポートしました（重複データは自動的にスキップされました）\n日付例: ${newArchives[0]?.date}`);
                                } catch (err) {
                                    alert("CSVの読み込みに失敗しました: " + err.message);
                                }
                            };
                            reader.readAsText(file, "UTF-8");
                            e.target.value = "";
                        }} />
                    </label>
                </div>
            </Card>

            {/* 重複データ削除・インポートデータ管理 */}
            <Card style={{ padding: 14, marginTop: 12 }}>
                <SecLabel label="データ整理" />
                {/* 重複データ削除ボタン */}
                {(() => {
                    const getKey = (a) => `${a.date}|${a.storeName || ""}|${a.machineNum || ""}|${a.machineName || ""}|${a.investYen || 0}|${a.recoveryYen || 0}`;
                    const keyCount = {};
                    archives.forEach(a => {
                        const key = getKey(a);
                        keyCount[key] = (keyCount[key] || 0) + 1;
                    });
                    const duplicateCount = Object.values(keyCount).reduce((sum, c) => sum + (c > 1 ? c - 1 : 0), 0);
                    return duplicateCount > 0 ? (
                        <>
                            <p style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>
                                重複データ: {duplicateCount}件検出
                            </p>
                            <button
                                className="b"
                                onClick={() => {
                                    if (window.confirm(`${duplicateCount}件の重複データを削除しますか？\n（各データは1件だけ残ります）`)) {
                                        S.setArchives(prev => {
                                            const seen = new Set();
                                            return prev.filter(a => {
                                                const key = getKey(a);
                                                if (seen.has(key)) return false;
                                                seen.add(key);
                                                return true;
                                            });
                                        });
                                        alert("重複データを削除しました");
                                    }
                                }}
                                style={{
                                    width: "100%",
                                    background: "#d97706",
                                    border: "none",
                                    borderRadius: 12,
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 700,
                                    padding: "14px 16px",
                                    cursor: "pointer",
                                    fontFamily: font,
                                    marginBottom: 10,
                                }}
                            >
                                重複データを削除
                            </button>
                        </>
                    ) : (
                        <p style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>
                            重複データはありません
                        </p>
                    );
                })()}
                {/* CSVインポートデータ削除 */}
                {archives.some(a => a.isImported) && (
                    <>
                        <p style={{ fontSize: 11, color: C.sub, marginBottom: 10, marginTop: 10 }}>
                            CSVからインポートしたデータ: {archives.filter(a => a.isImported).length}件
                        </p>
                        <button
                            className="b"
                            onClick={() => {
                                if (window.confirm("CSVでインポートしたデータをすべて削除しますか？\n（手動で記録したデータは残ります）")) {
                                    S.setArchives(prev => prev.filter(a => !a.isImported));
                                    alert("インポートデータを削除しました");
                                }
                            }}
                            style={{
                                width: "100%",
                                background: "#dc2626",
                                border: "none",
                                borderRadius: 12,
                                color: "#fff",
                                fontSize: 13,
                                fontWeight: 700,
                                padding: "14px 16px",
                                cursor: "pointer",
                                fontFamily: font,
                            }}
                        >
                            CSVインポートデータを削除
                        </button>
                    </>
                )}
            </Card>
        </div>
    );
}

/* ================================================================
   SettingsTab — 設定 + 機種検索（統合）
================================================================ */
export function SettingsTab({ s, onReset }) {
    const [confirming, setConfirming] = useState(false);
    const [showMachineSearch, setShowMachineSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [editingMachine, setEditingMachine] = useState(null);
    const [showMachineForm, setShowMachineForm] = useState(false);
    const results = searchMachines(query, s.customMachines);

    // 店舗管理用のstate
    const [showStoreSearch, setShowStoreSearch] = useState(false);
    const [storeQuery, setStoreQuery] = useState("");
    const [selectedStore, setSelectedStore] = useState(null);
    const [editingStore, setEditingStore] = useState(null);
    const [showStoreForm, setShowStoreForm] = useState(false);

    // サブ画面ナビゲーション
    const [showAppearanceView, setShowAppearanceView] = useState(false);
    const [showGameSettingsView, setShowGameSettingsView] = useState(false);
    const [showMachineSpecView, setShowMachineSpecView] = useState(false);
    const [showChodamaView, setShowChodamaView] = useState(false);
    const [showBackupView, setShowBackupView] = useState(false);

    // 削除確認
    const [confirmingDeleteMachine, setConfirmingDeleteMachine] = useState(null);
    const [confirmingDeleteStore, setConfirmingDeleteStore] = useState(null);

    // セキュリ: PIN設定UI
    const [pinSetStep, setPinSetStep] = useState("idle"); // idle | enter | confirm
    const [pinDraft, setPinDraft] = useState("");
    const [pinConfirm, setPinConfirm] = useState("");
    const [pinSetError, setPinSetError] = useState(false);

    // トースト通知
    const [toasts, setToasts] = useState([]);
    const showToast = (msg, type = "success") => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
    };

    const ToastPortal = () => ReactDOM.createPortal(
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className="toast-item" style={{
                    background: t.type === "error" ? "var(--red)" : t.type === "warn" ? "var(--yellow)" : "var(--green)",
                }}>
                    {t.msg}
                </div>
            ))}
        </div>,
        document.body
    );

    // 機種フォームの初期値
    const emptyMachine = {
        name: "", maker: "", type: "ミドル", prob: "1/319.6", synthProb: 319.6,
        spec1R: 140, specAvgTotalRounds: 30, specSapo: 0, roundDist: "", rushDist: "",
        border: { "4.00": 0, "3.57": 0, "3.33": 0, "3.03": 0 }
    };
    const [formData, setFormData] = useState(emptyMachine);

    // 店舗フォームの初期値（rentBalls/exRateはフォーム内では面値=玉/100円で扱う）
    const emptyStore = { name: "", address: "", rentBalls: 25, exRate: 25, memo: "", chodama: 0 };
    const [storeFormData, setStoreFormData] = useState(emptyStore);

    // 店舗データの正規化（旧形式の文字列配列を新形式のオブジェクト配列に変換）+ chodamaフィールドの追加
    const normalizedStores = (s.stores || []).map(st =>
        typeof st === "string"
            ? { id: Date.now() + Math.random(), name: st, address: "", rentBalls: 250, exRate: 250, memo: "", chodama: 0 }
            : { ...st, chodama: st.chodama || 0 }
    );

    // 店舗検索
    const storeResults = storeQuery.trim()
        ? normalizedStores.filter(st =>
            st.name.toLowerCase().includes(storeQuery.toLowerCase()) ||
            (st.address && st.address.toLowerCase().includes(storeQuery.toLowerCase()))
        )
        : normalizedStores;

    // 機種登録フォームを開く
    const openMachineForm = (machine = null) => {
        if (machine) {
            setEditingMachine(machine);
            setFormData({ ...emptyMachine, ...machine });
        } else {
            setEditingMachine(null);
            setFormData(emptyMachine);
        }
        setShowMachineForm(true);
    };

    // 機種を保存
    const saveMachine = () => {
        if (!formData.name.trim()) return;
        const machineData = {
            ...formData,
            id: editingMachine?.id || Date.now(),
            synthProb: parseFloat(formData.synthProb) || 319.6,
            spec1R: parseFloat(formData.spec1R) || 140,
            specAvgTotalRounds: parseFloat(formData.specAvgTotalRounds) || 30,
            specSapo: parseFloat(formData.specSapo) || 0,
        };
        if (editingMachine) {
            // 編集
            s.setCustomMachines(prev => prev.map(m => m.id === editingMachine.id ? machineData : m));
        } else {
            // 新規登録
            s.setCustomMachines(prev => [...prev, machineData]);
        }
        setShowMachineForm(false);
        setEditingMachine(null);
        setFormData(emptyMachine);
    };

    // 機種を削除
    const deleteMachine = (machine) => {
        s.setCustomMachines(prev => prev.filter(m => m.id !== machine.id));
        setSelected(null);
        setConfirmingDeleteMachine(null);
        showToast(`「${machine.name}」を削除しました`);
    };

    // 店舗登録フォームを開く
    const openStoreForm = (store = null) => {
        if (store) {
            setEditingStore(store);
            // 内部値（×10）をフォーム用の面値（÷10）に変換してセット
            setStoreFormData({
                ...emptyStore, ...store,
                rentBalls: Math.round((store.rentBalls || 250) / 10),
                exRate: Math.round((store.exRate || 250) / 10),
            });
        } else {
            setEditingStore(null);
            setStoreFormData(emptyStore);
        }
        setShowStoreForm(true);
    };

    // 店舗を保存（フォームの面値を内部値×10に変換）
    const saveStore = () => {
        if (!storeFormData.name.trim()) return;
        const storeData = {
            ...storeFormData,
            id: editingStore?.id || Date.now(),
            rentBalls: Math.round((parseFloat(storeFormData.rentBalls) || 25) * 10),
            exRate: Math.round((parseFloat(storeFormData.exRate) || 25) * 10),
            chodama: parseInt(storeFormData.chodama) || 0,
        };
        if (editingStore) {
            s.setStores(prev => prev.map(st => (typeof st === "object" && st.id === editingStore.id) ? storeData : st));
        } else {
            s.setStores(prev => [...prev.filter(st => typeof st === "object"), storeData]);
        }
        setShowStoreForm(false);
        setEditingStore(null);
        setStoreFormData(emptyStore);
    };

    // 店舗を削除
    const deleteStore = (store) => {
        s.setStores(prev => prev.filter(st => typeof st === "object" ? st.id !== store.id : st !== store.name));
        setSelectedStore(null);
        setConfirmingDeleteStore(null);
        showToast(`「${store.name}」を削除しました`);
    };

    // 店舗の設定を反映
    const applyStore = (store) => {
        s.setStoreName(store.name);
        if (store.rentBalls) s.setRentBalls(store.rentBalls);
        if (store.exRate) s.setExRate(store.exRate);
        setSelectedStore(null);
        setShowStoreSearch(false);
    };

    // === CSV機能 ===
    // スプレッドシート形式のヘッダー定義（インポート/エクスポート共通）
    const csvHeadersJp = [
        "機種名", "大当り確率", "ボーダー(1k)", "賞球数", "回転単価",
        "1大当たり平均出玉（削り込み）", "標準偏差", "初期確率", "ムラ係数",
        "空間感応度", "レジーム感応度", "ヘソ平均出玉(自動)", "RUSH平均出玉",
        "RUSH突入率", "RUSH継続率", "手動入力値(優先)",
        "【ヘソ1】出玉", "【ヘソ1】比率", "【ヘソ2】出玉", "【ヘソ2】比率",
        "【ヘソ3】出玉", "【ヘソ3】比率", "MC期待日当", "MC勝率",
        "ラウンド振り分け", "確変中ラウンド振り分け",
        "ボーダー(4.00)", "ボーダー(3.57)", "ボーダー(3.33)", "ボーダー(3.03)"
    ];

    // 機種データをCSVエクスポート（スプレッドシート形式）
    const exportMachinesCSV = () => {
        const machines = s.customMachines || [];
        if (machines.length === 0) {
            showToast("エクスポートするカスタム機種がありません", "warn");
            return;
        }
        const csvContent = [
            csvHeadersJp.join(","),
            ...machines.map(m => {
                const hesoDist = m.hesoDist || [];
                const border = m.border || {};
                const formatPercent = (val) => val != null ? `${val}%` : "";
                const row = [
                    m.name || "",
                    m.synthProb || "",
                    m.border1K || "",
                    m.prize || "",
                    m.unitCost || "",
                    m.avgPayoutPerHit || "",
                    m.stdDev || "",
                    m.initialProb || "",
                    m.muraCoef || "",
                    m.spatialSens || "",
                    m.regimeSens || "",
                    m.hesoAvgPayout || "",
                    m.rushAvgPayout || "",
                    formatPercent(m.rushEntryRate),
                    formatPercent(m.rushContinueRate),
                    m.manualHesoValue || "",
                    hesoDist[0]?.payout || "",
                    formatPercent(hesoDist[0]?.rate),
                    hesoDist[1]?.payout || "",
                    formatPercent(hesoDist[1]?.rate),
                    hesoDist[2]?.payout || "",
                    formatPercent(hesoDist[2]?.rate),
                    m.mcExpectedDaily || "",
                    formatPercent(m.mcWinRate),
                    m.roundDist || "",
                    m.rushDist || "",
                    border["4.00"] || "",
                    border["3.57"] || "",
                    border["3.33"] || "",
                    border["3.03"] || ""
                ];
                return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
            })
        ].join("\n");
        downloadCSV(csvContent, "machines.csv");
    };

    // 店舗データをCSVエクスポート
    const exportStoresCSV = () => {
        if (normalizedStores.length === 0) {
            showToast("エクスポートする店舗がありません", "warn");
            return;
        }
        // 日本語ヘッダー・表示値（貸玉/交換は100円あたり玉数の面値）でエクスポート
        const rows = normalizedStores.map(st => [
            `"${String(st.name || "").replace(/"/g, '""')}"`,
            `"${String(st.address || "").replace(/"/g, '""')}"`,
            Math.round((st.rentBalls || 250) / 10),
            Math.round((st.exRate || 250) / 10),
            `"${String(st.memo || "").replace(/"/g, '""')}"`,
            st.chodama || 0,
        ].join(","));
        const csvContent = ["店舗名,住所,貸玉,交換,メモ,貯玉", ...rows].join("\n");
        downloadCSV(csvContent, "stores.csv");
    };

    // CSVダウンロード共通関数
    const downloadCSV = (content, filename) => {
        const bom = "\uFEFF";
        const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // CSVパース関数
    const parseCSV = (text) => {
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return [];
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
        return lines.slice(1).map(line => {
            const values = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === "," && !inQuotes) {
                    values.push(current.trim());
                    current = "";
                } else {
                    current += char;
                }
            }
            values.push(current.trim());
            const obj = {};
            headers.forEach((h, i) => { obj[h] = values[i] || ""; });
            return obj;
        });
    };

    // 日本語ヘッダーから内部フィールド名へのマッピング
    const jpHeaderToField = {
        "機種名": "name",
        "大当り確率": "synthProb",
        "ボーダー(1k)": "border1K",
        "賞球数": "prize",
        "回転単価": "unitCost",
        "1大当たり平均出玉（削り込み）": "avgPayoutPerHit",
        "標準偏差": "stdDev",
        "初期確率": "initialProb",
        "ムラ係数": "muraCoef",
        "空間感応度": "spatialSens",
        "レジーム感応度": "regimeSens",
        "ヘソ平均出玉(自動)": "hesoAvgPayout",
        "RUSH平均出玉": "rushAvgPayout",
        "RUSH突入率": "rushEntryRate",
        "RUSH継続率": "rushContinueRate",
        "手動入力値(優先)": "manualHesoValue",
        "【ヘソ1】出玉": "heso1Payout",
        "【ヘソ1】比率": "heso1Rate",
        "【ヘソ2】出玉": "heso2Payout",
        "【ヘソ2】比率": "heso2Rate",
        "【ヘソ3】出玉": "heso3Payout",
        "【ヘソ3】比率": "heso3Rate",
        "MC期待日当": "mcExpectedDaily",
        "MC勝率": "mcWinRate",
        "ラウンド振り分け": "roundDist",
        "確変中ラウンド振り分け": "rushDist",
        "ボーダー(4.00)": "border400",
        "ボーダー(3.57)": "border357",
        "ボーダー(3.33)": "border333",
        "ボーダー(3.03)": "border303"
    };

    // パーセント文字列から数値に変換
    const parsePercent = (val) => {
        if (val == null || val === "") return null;
        const str = String(val).replace(/[%％]/g, "").replace(/,/g, "").trim();
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    };

    // 数値パース（カンマ除去対応）
    const parseNum = (val) => {
        if (val == null || val === "") return null;
        const str = String(val).replace(/,/g, "").trim();
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    };

    // 機種CSVインポート（スプレッドシート形式対応）
    const importMachinesCSV = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const inputEl = e.target;
        let text = "";
        try {
            const url = URL.createObjectURL(file);
            try {
                const resp = await fetch(url);
                text = await resp.text();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            inputEl.value = "";
            showToast("ファイルの読み込みに失敗しました", "error");
            return;
        }
        inputEl.value = "";
        try {
            const data = parseCSV(text.replace(/^\uFEFF/, ""));
            if (data.length === 0) {
                showToast("インポートできるデータがありません", "error");
                return;
            }
            // ヘッダーをチェックして日本語形式か旧形式かを判定
            const firstRow = data[0];
            const isJpFormat = "機種名" in firstRow || firstRow.name === undefined;

            const newMachines = data.filter(d => (isJpFormat ? d["機種名"] : d.name)).map(d => {
                // 日本語ヘッダーからフィールドを取得
                const get = (jpKey, engKey) => isJpFormat ? d[jpKey] : d[engKey];

                // ヘソ分布を構築
                const hesoDist = [];
                const h1p = parseNum(get("【ヘソ1】出玉", "heso1Payout"));
                const h1r = parsePercent(get("【ヘソ1】比率", "heso1Rate"));
                if (h1p != null) hesoDist.push({ payout: h1p, rate: h1r || 100 });
                const h2p = parseNum(get("【ヘソ2】出玉", "heso2Payout"));
                const h2r = parsePercent(get("【ヘソ2】比率", "heso2Rate"));
                if (h2p != null) hesoDist.push({ payout: h2p, rate: h2r || 0 });
                const h3p = parseNum(get("【ヘソ3】出玉", "heso3Payout"));
                const h3r = parsePercent(get("【ヘソ3】比率", "heso3Rate"));
                if (h3p != null) hesoDist.push({ payout: h3p, rate: h3r || 0 });

                const synthProb = parseNum(get("大当り確率", "synthProb")) || 319.6;

                return {
                    id: Date.now() + Math.random(),
                    name: get("機種名", "name") || "",
                    maker: d.maker || "",
                    type: d.type || "ミドル",
                    prob: `1/${synthProb}`,
                    synthProb: synthProb,
                    border1K: parseNum(get("ボーダー(1k)", "border1K")),
                    prize: parseNum(get("賞球数", "prize")) || 3,
                    unitCost: parseNum(get("回転単価", "unitCost")),
                    avgPayoutPerHit: parseNum(get("1大当たり平均出玉（削り込み）", "avgPayoutPerHit")),
                    stdDev: parseNum(get("標準偏差", "stdDev")),
                    initialProb: parseNum(get("初期確率", "initialProb")),
                    muraCoef: parseNum(get("ムラ係数", "muraCoef")),
                    spatialSens: parseNum(get("空間感応度", "spatialSens")),
                    regimeSens: parseNum(get("レジーム感応度", "regimeSens")),
                    hesoAvgPayout: parseNum(get("ヘソ平均出玉(自動)", "hesoAvgPayout")),
                    rushAvgPayout: parseNum(get("RUSH平均出玉", "rushAvgPayout")),
                    rushEntryRate: parsePercent(get("RUSH突入率", "rushEntryRate")),
                    rushContinueRate: parsePercent(get("RUSH継続率", "rushContinueRate")),
                    manualHesoValue: parseNum(get("手動入力値(優先)", "manualHesoValue")),
                    hesoDist: hesoDist.length > 0 ? hesoDist : undefined,
                    mcExpectedDaily: parseNum(get("MC期待日当", "mcExpectedDaily")),
                    mcWinRate: parsePercent(get("MC勝率", "mcWinRate")),
                    // ラウンド振り分け
                    roundDist: get("ラウンド振り分け", "roundDist") || d.roundDist || "",
                    rushDist: get("確変中ラウンド振り分け", "rushDist") || d.rushDist || "",
                    // ボーダー（交換率別）
                    border: {
                        "4.00": parseNum(get("ボーダー(4.00)", "border400")) || 0,
                        "3.57": parseNum(get("ボーダー(3.57)", "border357")) || 0,
                        "3.33": parseNum(get("ボーダー(3.33)", "border333")) || 0,
                        "3.03": parseNum(get("ボーダー(3.03)", "border303")) || 0,
                    },
                    // 既存フィールドとの互換性
                    spec1R: parseNum(d.spec1R) || 140,
                    specAvgTotalRounds: parseNum(d.specAvgTotalRounds) || 30,
                    specSapo: parseNum(d.specSapo) || 0,
                };
            });
            if (newMachines.length > 0) {
                s.setCustomMachines(prev => [...prev, ...newMachines]);
                showToast(`${newMachines.length}件の機種をインポートしました`);
            } else {
                showToast("インポートできる機種が見つかりませんでした", "error");
            }
        } catch {
            showToast("ファイルの読み込みに失敗しました", "error");
        }
    };

    // 店舗CSVインポート（日本語・英語ヘッダー両対応）
    const importStoresCSV = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const inputEl = e.target;
        let text = "";
        try {
            const url = URL.createObjectURL(file);
            try {
                const resp = await fetch(url);
                text = await resp.text();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            inputEl.value = "";
            showToast("ファイルの読み込みに失敗しました", "error");
            return;
        }
        inputEl.value = "";
        try {
            const data = parseCSV(text.replace(/^\uFEFF/, ""));
            if (data.length === 0) {
                showToast("インポートできる店舗が見つかりませんでした", "error");
                return;
            }
            // 日本語ヘッダー（店舗名, 住所, 貸玉, 交換）と英語ヘッダー（name, address, rentBalls, exRate）の両方に対応
            const firstRow = data[0];
            const isJp = "店舗名" in firstRow;
            const getName = d => isJp ? d["店舗名"] : d["name"];
            // 日本語形式: 貸玉/交換は表示値（25玉）→ 内部値（250）に変換
            // 英語形式: 既に内部値（250）のまま
            const getRentBalls = d => isJp ? (parseInt(d["貸玉"]) || 25) * 10 : (parseInt(d["rentBalls"]) || 250);
            const getExRate   = d => isJp ? (parseInt(d["交換"])  || 25) * 10 : (parseInt(d["exRate"])    || 250);
            const getChodama  = d => isJp ? (parseInt(d["貯玉"]) || 0) : (parseInt(d["chodama"]) || 0);
            const newStores = data.filter(d => getName(d)).map(d => ({
                id: Date.now() + Math.random(),
                name: getName(d) || "",
                address: (isJp ? d["住所"] : d["address"]) || "",
                rentBalls: getRentBalls(d),
                exRate: getExRate(d),
                memo: (isJp ? d["メモ"] : d["memo"]) || "",
                chodama: getChodama(d),
            }));
            if (newStores.length > 0) {
                s.setStores(prev => [...prev.filter(st => typeof st === "object"), ...newStores]);
                showToast(`${newStores.length}件の店舗をインポートしました`);
            } else {
                showToast("インポートできる店舗が見つかりませんでした", "error");
            }
        } catch {
            showToast("ファイルの読み込みに失敗しました", "error");
        }
    };

    const applyMachine = (m) => {
        s.setSynthDenom(m.synthProb);
        if (m.spec1R) s.setSpec1R(m.spec1R);
        if (m.specAvgTotalRounds) s.setSpecAvgRounds(m.specAvgTotalRounds);
        if (m.specSapo != null) s.setSpecSapo(m.specSapo);
        if (m.name) s.setMachineName(m.name);
        setSelected(null);
        setShowMachineSearch(false);
    };

    // === 全データバックアップ/リストア ===
    const backupAllData = () => {
        const keys = ["pt_rentBalls","pt_exRate","pt_synthDenom","pt_rotPerHour","pt_border","pt_investPace","pt_ballVal",
            "pt_spec1R","pt_specAvgRounds","pt_specSapo","pt_jpLog3","pt_sesLog","pt_rotRows","pt_startRot",
            "pt_totalTrayBalls","pt_playMode","pt_includeChodamaInBalance","pt_chodamaReplayLimit",
            "pt_chodamaUsedToday","pt_chodamaLastDate","pt_currentMochiBalls","pt_currentChodama",
            "pt_sessionStarted","pt_startGameCount","pt_initialMochiBalls","pt_initialChodama",
            "pt_selectedStoreId","pt_storeName","pt_machineNum","pt_machineName","pt_investYen","pt_recoveryYen",
            "pt_stores","pt_customMachines","pt_archives","pt_theme","pt_accentColor","pt_highContrast",
            "pt_colorBlind","pt_appLock","pt_appPin"];
        const data = {};
        keys.forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) data[k] = v;
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pachi-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("バックアップファイルをダウンロードしました");
    };

    const restoreAllData = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const inputEl = e.target;
        let text = "";
        try {
            const url = URL.createObjectURL(file);
            try { const resp = await fetch(url); text = await resp.text(); }
            finally { URL.revokeObjectURL(url); }
        } catch {
            inputEl.value = "";
            showToast("ファイルの読み込みに失敗しました", "error");
            return;
        }
        inputEl.value = "";
        try {
            const data = JSON.parse(text);
            // 正しいバリデーション: !の位置が間違っていたバグを修正
            if (typeof data !== "object" || data === null || data["pt_archives"] === undefined) {
                showToast("バックアップファイルの形式が正しくありません", "error");
                return;
            }
            Object.entries(data).forEach(([k, v]) => {
                if (k.startsWith("pt_")) {
                    // オブジェクト/配列はJSON.stringify必須（直接setItemするとデータ破損）
                    localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
                }
            });
            showToast("データを復元しました。ページを再読み込みします");
            setTimeout(() => window.location.reload(), 1500);
        } catch {
            showToast("バックアップファイルの読み込みに失敗しました", "error");
        }
    };

    // 交換レート（円/玉）を計算
    const yenPerBall = 100 / ((s.exRate || 250) / 10);
    // 交換レートキーを特定（4.00, 3.57, 3.33, 3.03に近い値）
    const getExRateKey = () => {
        if (Math.abs(yenPerBall - 4.00) < 0.1) return "4.00";
        if (Math.abs(yenPerBall - 3.57) < 0.1) return "3.57";
        if (Math.abs(yenPerBall - 3.33) < 0.1) return "3.33";
        if (Math.abs(yenPerBall - 3.03) < 0.1) return "3.03";
        return null; // カスタムレート
    };
    const exRateKey = getExRateKey();
    const exRateLabel = exRateKey ? `${exRateKey}円交換` : `${yenPerBall.toFixed(2)}円交換`;

    // 理論ボーダーのリアルタイム計算
    const exchP = 1000 / (s.exRate || 1);
    const avgNetGainSpec = (s.spec1R || 0) * (s.specAvgRounds || 0) + (s.specSapo || 0);
    const specNetGainYen = avgNetGainSpec * exchP;
    const formulaBorder = specNetGainYen > 0 ? ((s.synthDenom || 1) * 1000) / specNetGainYen : 0;

    // 機種DB（標準＋カスタム）から現在設定中の機種を引き当て、DB実戦値ボーダーを優先
    const allMachinesForBorder = [...(s.customMachines || []), ...machineDB];
    const matchedMachine = s.machineName
        ? allMachinesForBorder.find(m => m.name === s.machineName)
        : null;
    const dbBorderForKey = matchedMachine && exRateKey && matchedMachine.border?.[exRateKey];
    const calcBorder = dbBorderForKey != null ? Number(dbBorderForKey) : formulaBorder;
    const borderSource = dbBorderForKey != null ? "db" : "formula";

    // Store detail view
    if (selectedStore) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelectedStore(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 一覧に戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selectedStore.name}</div>
                    {selectedStore.address && <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{selectedStore.address}</div>}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>貸玉</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{Math.round((selectedStore.rentBalls || 250) / 10)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉/100円</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>交換</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{Math.round((selectedStore.exRate || 250) / 10)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉/100円</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>貯玉残高</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(selectedStore.chodama || 0)}</div>
                            <div style={{ fontSize: 9, color: C.sub }}>玉</div>
                        </div>
                    </div>

                    {selectedStore.memo && (
                        <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>メモ</div>
                            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{selectedStore.memo}</div>
                        </div>
                    )}
                </Card>

                <Btn label="この店舗の設定を反映" onClick={() => applyStore(selectedStore)} bg={C.blue} fg="#fff" bd="none" />

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <Btn label="編集" onClick={() => { setSelectedStore(null); openStoreForm(selectedStore); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    {confirmingDeleteStore === selectedStore.id ? (
                        <>
                            <Btn label="本当に削除" onClick={() => deleteStore(selectedStore)} bg={C.red} fg="#fff" bd="none" />
                            <Btn label="キャンセル" onClick={() => setConfirmingDeleteStore(null)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        </>
                    ) : (
                        <Btn label="削除" onClick={() => setConfirmingDeleteStore(selectedStore.id)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                    )}
                </div>
            </div>
        );
    }

    // Store form view
    if (showStoreForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowStoreForm(false); setEditingStore(null); setStoreFormData(emptyStore); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingStore ? "店舗を編集" : "新規店舗登録"}
                    </div>

                    {/* 店舗名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店舗名 *</div>
                        <input type="text" value={storeFormData.name} onChange={e => setStoreFormData({ ...storeFormData, name: e.target.value })}
                            placeholder="例: パチンコXX店"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 住所 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>住所</div>
                        <input type="text" value={storeFormData.address} onChange={e => setStoreFormData({ ...storeFormData, address: e.target.value })}
                            placeholder="例: 東京都渋谷区..."
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 貸玉100円 */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貸玉（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                value={storeFormData.rentBalls}
                                onChange={e => setStoreFormData({ ...storeFormData, rentBalls: e.target.value })}
                                onBlur={() => setStoreFormData(p => ({ ...p, rentBalls: parseFloat(p.rentBalls) || 25 }))}
                                placeholder="25"
                                style={{ flex: 1, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.rentBalls) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        {/* プリセット */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {[{l:"等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33}].map(({l,v}) => {
                                const active = String(storeFormData.rentBalls) === String(v);
                                return <button key={v} className="b" onClick={() => setStoreFormData(p => ({...p, rentBalls: v}))} style={{ fontSize: 10, padding: "5px 10px", borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                            })}
                        </div>
                    </div>

                    {/* 交換100円 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                value={storeFormData.exRate}
                                onChange={e => setStoreFormData({ ...storeFormData, exRate: e.target.value })}
                                onBlur={() => setStoreFormData(p => ({ ...p, exRate: parseFloat(p.exRate) || 25 }))}
                                placeholder="25"
                                style={{ flex: 1, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.exRate) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        {/* プリセット */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {[{l:"等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33}].map(({l,v}) => {
                                const active = String(storeFormData.exRate) === String(v);
                                return <button key={v} className="b" onClick={() => setStoreFormData(p => ({...p, exRate: v}))} style={{ fontSize: 10, padding: "5px 10px", borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                            })}
                        </div>
                    </div>

                    {/* 貯玉残高 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉残高（玉）</div>
                        <input type="text" inputMode="numeric" pattern="[0-9]*"
                            value={storeFormData.chodama === "" ? "" : String(storeFormData.chodama || 0)}
                            onChange={e => setStoreFormData({ ...storeFormData, chodama: e.target.value })}
                            onBlur={() => setStoreFormData(p => ({ ...p, chodama: parseInt(p.chodama) || 0 }))}
                            placeholder="0"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* メモ */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メモ</div>
                        <textarea value={storeFormData.memo} onChange={e => setStoreFormData({ ...storeFormData, memo: e.target.value })}
                            placeholder="営業時間など..."
                            rows={3}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none", resize: "vertical" }} />
                    </div>

                    <Btn label={editingStore ? "更新" : "登録"} onClick={saveStore} bg={C.blue} fg="#fff" bd="none" disabled={!storeFormData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Store search view
    if (showStoreSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowStoreSearch(false); setStoreQuery(""); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openStoreForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700
                    }}>+ 店舗を登録</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <input
                        type="text"
                        value={storeQuery}
                        onChange={e => setStoreQuery(e.target.value)}
                        placeholder="店舗名・住所で検索..."
                        style={{
                            width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font,
                            outline: "none",
                        }}
                    />
                </div>

                {/* CSV インポート/エクスポート */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportStoresCSV} style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600
                    }}>CSVエクスポート</button>
                    <label style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600,
                        textAlign: "center", cursor: "pointer"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={importStoresCSV} style={{ display: "none" }} />
                    </label>
                </div>

                {storeResults.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>登録された店舗がありません</div>
                ) : (
                    storeResults.map((st, i) => (
                        <button key={st.id || i} className="b" onClick={() => setSelectedStore(st)} style={{
                            width: "100%", background: i % 2 === 0 ? "transparent" : "transparent",
                            border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
                            display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                            textAlign: "left",
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3 }}>{st.name}</div>
                                {st.address && <div style={{ fontSize: 10, color: C.sub }}>{st.address}</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{Math.round(st.rentBalls || 250) / 10}玉</div>
                                <div style={{ fontSize: 9, color: C.sub }}>交換 {Math.round(st.exRate || 250) / 10}玉{(st.chodama || 0) > 0 ? ` 💎${f(st.chodama)}` : ""}</div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        );
    }

    // Machine detail view
    if (selected) {
        const borderKeys = selected.border ? Object.keys(selected.border).filter(k => selected.border[k] > 0).sort((a, b) => Number(b) - Number(a)) : [];
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelected(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 一覧に戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 12 }}>{selected.maker} | {selected.type}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>大当たり確率</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.yellow, fontFamily: mono }}>{selected.prob}</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.teal, fontFamily: mono }}>{f(selected.spec1R)}</div>
                        </div>
                    </div>

                    {selected.chargeProb && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>チャージ確率</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.purple, fontFamily: mono }}>1/{selected.chargeProb}</div>
                            </div>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>合算確率</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>1/{selected.synthProb}</div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: mono }}>{selected.specAvgTotalRounds}R</div>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                            <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.subHi, lineHeight: 1.5 }}>{selected.roundDist || "未設定"}</div>
                        </div>
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    {selected.rushDist && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
                            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.orange, lineHeight: 1.5 }}>{selected.rushDist}</div>
                            </div>
                        </div>
                    )}

                    {/* 追加スペック情報（データがある場合のみ表示） */}
                    {(selected.avgPayoutPerHit || selected.rushEntryRate || selected.prize) && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                {selected.avgPayoutPerHit > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>平均出玉/当</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.avgPayoutPerHit)}</div>
                                    </div>
                                )}
                                {selected.prize > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>賞球数</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.prize}</div>
                                    </div>
                                )}
                                {selected.unitCost > 0 && (
                                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>回転単価</div>
                                        <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{selected.unitCost}</div>
                                    </div>
                                )}
                            </div>
                            {(selected.rushEntryRate || selected.rushContinueRate) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                    {selected.rushEntryRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH突入率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushEntryRate}%</div>
                                        </div>
                                    )}
                                    {selected.rushContinueRate > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH継続率</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.orange, fontFamily: mono }}>{selected.rushContinueRate}%</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {(selected.rushAvgPayout || selected.stdDev) && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    {selected.rushAvgPayout > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>RUSH平均出玉</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono }}>{f(selected.rushAvgPayout)}</div>
                                        </div>
                                    )}
                                    {selected.stdDev > 0 && (
                                        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 10, textAlign: "center" }}>
                                            <div style={{ fontSize: 8, color: C.sub, marginBottom: 3 }}>標準偏差</div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: C.subHi, fontFamily: mono }}>{f(selected.stdDev)}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ボーダー表（データがある場合のみ） */}
                {borderKeys.length > 0 && (
                    <Card style={{ overflow: "hidden", marginBottom: 12 }}>
                        <SecLabel label="交換率別ボーダー" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 16px 6px", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700 }}>交換率</span>
                            <span style={{ fontSize: 11, color: C.sub, fontWeight: 700, textAlign: "right" }}>ボーダー (回/K)</span>
                        </div>
                        {borderKeys.map(key => (
                            <div key={key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: 13, color: C.text }}>{key}円</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: C.green, fontFamily: mono, textAlign: "right" }}>{selected.border[key]}</span>
                            </div>
                        ))}
                    </Card>
                )}

                <Btn label="この機種の確率を設定に反映" onClick={() => applyMachine(selected)} bg={C.blue} fg="#fff" bd="none" />

                {/* カスタム機種の場合は編集・削除ボタンを表示 */}
                {selected.isCustom && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <Btn label="編集" onClick={() => { setSelected(null); openMachineForm(selected); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        {confirmingDeleteMachine === selected.id ? (
                            <>
                                <Btn label="本当に削除" onClick={() => deleteMachine(selected)} bg={C.red} fg="#fff" bd="none" />
                                <Btn label="キャンセル" onClick={() => setConfirmingDeleteMachine(null)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                            </>
                        ) : (
                            <Btn label="削除" onClick={() => setConfirmingDeleteMachine(selected.id)} bg="rgba(180,60,60,0.2)" fg={C.red} bd={C.red + "40"} />
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Machine form view (新規登録/編集)
    if (showMachineForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineForm(false); setEditingMachine(null); setFormData(emptyMachine); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600, marginBottom: 12
                }}>← 戻る</button>

                <Card style={{ padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                        {editingMachine ? "機種を編集" : "新規機種登録"}
                    </div>

                    {/* 機種名 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>機種名 *</div>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例: 大海物語5"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* メーカー */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>メーカー</div>
                        <input type="text" value={formData.maker} onChange={e => setFormData({ ...formData, maker: e.target.value })}
                            placeholder="例: 三洋"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* タイプ */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>タイプ</div>
                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }}>
                            <option value="ミドル">ミドル</option>
                            <option value="ハイミドル">ハイミドル</option>
                            <option value="ライトミドル">ライトミドル</option>
                            <option value="甘デジ">甘デジ</option>
                            <option value="遊パチ">遊パチ</option>
                        </select>
                    </div>

                    {/* 確率表記 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>大当たり確率（表記用）</div>
                        <input type="text" value={formData.prob} onChange={e => setFormData({ ...formData, prob: e.target.value })}
                            placeholder="例: 1/319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確率分母 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>合成確率分母</div>
                        <input type="text" inputMode="decimal" value={formData.synthProb} onChange={e => setFormData({ ...formData, synthProb: e.target.value })}
                            placeholder="319.6"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 1R出玉 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>1R出玉（実出玉）</div>
                        <input type="text" inputMode="numeric" pattern="[0-9]*" value={formData.spec1R} onChange={e => setFormData({ ...formData, spec1R: e.target.value })}
                            placeholder="140"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 平均総R */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>平均総R/初当たり</div>
                        <input type="text" inputMode="decimal" value={formData.specAvgTotalRounds} onChange={e => setFormData({ ...formData, specAvgTotalRounds: e.target.value })}
                            placeholder="30"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* サポ増減 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>サポ増減/初当たり</div>
                        <input type="text" inputMode="numeric" pattern="[0-9-]*" value={formData.specSapo} onChange={e => setFormData({ ...formData, specSapo: e.target.value })}
                            placeholder="0"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* ラウンド振り分け */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>ラウンド振り分け（初当たり）</div>
                        <input type="text" value={formData.roundDist} onChange={e => setFormData({ ...formData, roundDist: e.target.value })}
                            placeholder="例: 4R:50%, 10R:50%"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 確変中ラウンド振り分け */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>確変中ラウンド振り分け（連チャン用）</div>
                        <input type="text" value={formData.rushDist || ""} onChange={e => setFormData({ ...formData, rushDist: e.target.value })}
                            placeholder="例: 10R:100%（未設定時は初当たり振り分けを使用）"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    <Btn label={editingMachine ? "更新" : "登録"} onClick={saveMachine} bg={C.blue} fg="#fff" bd="none" disabled={!formData.name.trim()} />
                </Card>
            </div>
        );
    }

    // Machine search view
    if (showMachineSearch) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={() => { setShowMachineSearch(false); setQuery(""); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openMachineForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", fontFamily: font, fontWeight: 700
                    }}>+ 機種を登録</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="機種名・メーカーで検索..."
                        style={{
                            width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 10, padding: "12px 14px", fontSize: 14, color: C.text, fontFamily: font,
                            outline: "none",
                        }}
                    />
                </div>

                {/* CSV インポート/エクスポート */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button className="b" onClick={exportMachinesCSV} style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600
                    }}>CSVエクスポート</button>
                    <label style={{
                        flex: 1, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                        color: C.text, fontSize: 11, padding: "8px 12px", fontFamily: font, fontWeight: 600,
                        textAlign: "center", cursor: "pointer"
                    }}>
                        CSVインポート
                        <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={importMachinesCSV} style={{ display: "none" }} />
                    </label>
                </div>

                {results.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.sub, padding: "40px 16px", fontSize: 12 }}>該当する機種がありません</div>
                ) : (
                    results.map((m, i) => (
                        <button key={m.isCustom ? `custom-${m.id}` : `db-${i}`} className="b" onClick={() => setSelected(m)} style={{
                            width: "100%", background: i % 2 === 0 ? "transparent" : "transparent",
                            border: "none", borderBottom: `1px solid ${C.border}`, padding: "14px 16px",
                            display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                            textAlign: "left",
                        }}>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                                    {m.name}
                                    {m.isCustom && <span style={{ fontSize: 9, background: C.teal, color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>カスタム</span>}
                                </div>
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

    // ── 細線 SVG アイコン群（SF Symbols 風） ──
    const svgProps = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
    const IconPaint = () => (<svg {...svgProps}><circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-2a2 2 0 0 0-1 3.7 2 2 0 0 1-3 3.3z"/></svg>);
    const IconGear = () => (<svg {...svgProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    const IconTarget = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>);
    const IconDiamond = () => (<svg {...svgProps}><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M11 3 8 9h8l-3-6"/><path d="M2 9h20"/></svg>);
    const IconMagnifier = () => (<svg {...svgProps}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    const IconStore = () => (<svg {...svgProps}><path d="M3 9 4.5 4h15L21 9"/><path d="M3 9v11h18V9"/><path d="M3 9c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3"/><path d="M9 20v-6h6v6"/></svg>);
    const IconLock = () => (<svg {...svgProps}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>);
    const IconKey = () => (<svg {...svgProps}><circle cx="7.5" cy="15.5" r="3.5"/><path d="m10 13 10-10"/><path d="m17 6 3 3"/><path d="m14 9 3 3"/></svg>);
    const IconCloud = () => (<svg {...svgProps}><path d="M17.5 19a4.5 4.5 0 1 0-1.2-8.84A6 6 0 0 0 5.1 13.5 4 4 0 0 0 6 19z"/><path d="M12 12v6"/><path d="m9 15 3-3 3 3"/></svg>);
    const IconTrash = () => (<svg {...svgProps}><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>);
    const IconChat = () => (<svg {...svgProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
    const IconStar = () => (<svg {...svgProps}><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8l-6.2 3.2L7 14.2 2 9.3l6.9-1z"/></svg>);
    const IconDoc = () => (<svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>);
    const IconShield = () => (<svg {...svgProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    const IconContrast = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>);
    const IconEye = () => (<svg {...svgProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>);

    // ── サブ画面共通ヘッダー ──
    const SubHeader = ({ title, onBack }) => (
        <div style={{
            background: C.surface,
            padding: "14px 12px 16px",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            borderBottom: `1px solid ${C.border}`,
        }}>
            <button className="b" onClick={onBack} style={{
                background: "transparent", border: "none",
                color: C.blue, fontSize: 26, width: 36, height: 36,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, fontWeight: 400, lineHeight: 1,
            }}>‹</button>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.4 }}>{title}</div>
        </div>
    );

    // ── 共通UIヘルパー ──
    const Toggle = ({ value, onChange, color }) => (
        <button className="b" onClick={() => onChange(!value)} style={{
            width: 51, height: 31, borderRadius: 16, border: "none", flexShrink: 0,
            background: value ? (color || C.blue) : "rgba(120,120,128,0.16)",
            position: "relative", transition: "background 0.25s ease", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
        }}>
            <div style={{
                width: 27, height: 27, borderRadius: 14, background: "#fff",
                position: "absolute", top: 2,
                left: value ? 22 : 2, transition: "left 0.25s ease",
                boxShadow: "0 1px 1px rgba(0,0,0,0.04), 0 3px 8px rgba(0,0,0,0.12)",
            }} />
        </button>
    );

    // 汎用リスト行（onPressなしはdivでレンダリング → Toggle等の子要素がiOSでも押せる）
    const Row = ({ icon, IconComp, iconColor, label, sub, right, onPress, danger }) => {
        const Tag = onPress ? "button" : "div";
        const clr = iconColor || (danger ? C.red : C.subHi);
        return (
            <Tag className="b settings-row settings-list-row" onClick={onPress || undefined} style={{
                width: "100%", background: "transparent", border: "none",
                borderBottom: `1px solid ${C.border}`, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                cursor: onPress ? "pointer" : "default", textAlign: "left",
                WebkitTapHighlightColor: "transparent",
            }}>
                {(IconComp || icon) && (
                    <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: IconComp
                            ? `color-mix(in srgb, ${clr} 14%, transparent)`
                            : (danger ? "rgba(255,59,48,0.12)" : "rgba(128,128,128,0.1)"),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, color: clr,
                    }}>{IconComp ? <IconComp /> : icon}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: danger ? C.red : C.text, fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
                    {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
                </div>
                {right !== undefined ? right : (onPress ? <span style={{ fontSize: 15, color: C.sub, flexShrink: 0, fontWeight: 500 }}>›</span> : null)}
            </Tag>
        );
    };

    // セクションラベル
    const SectionLabel = ({ label }) => (
        <div style={{
            padding: "24px 16px 8px",
            fontSize: 13, fontWeight: 500, color: C.sub,
            letterSpacing: 0, textTransform: "none",
        }}>{label}</div>
    );

    // セクションカード（角丸まとめ）— last-childのborderBottomはCSS側で除去
    const Section = ({ children, danger }) => (
        <div style={{
            background: danger ? "color-mix(in srgb, var(--red) 4%, transparent)" : C.surface,
            borderRadius: 12,
            border: `1px solid ${danger ? "color-mix(in srgb, var(--red) 18%, transparent)" : C.border}`,
            overflow: "hidden",
        }}>{children}</div>
    );

    // ── 外観サブビュー ──
    if (showAppearanceView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="外観" onBack={() => setShowAppearanceView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="テーマモード" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", gap: 8 }}>
                                {[
                                    { id: "system", label: "システム", icon: "📱" },
                                    { id: "light",  label: "ライト",   icon: "☀️" },
                                    { id: "dark",   label: "ダーク",   icon: "🌙" },
                                ].map(({ id, label, icon }) => {
                                    const active = s.theme === id;
                                    return (
                                        <button key={id} className="b" onClick={() => s.setTheme(id)} style={{
                                            flex: 1, padding: "12px 6px", borderRadius: 12,
                                            border: active ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                                            background: active ? `${C.blue}22` : C.surfaceHi,
                                            cursor: "pointer", transition: "all 0.2s ease",
                                        }}>
                                            <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                                            <div style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? C.blue : C.text }}>{label}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="カラーテーマ" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                                {(s.colorThemes || []).map(ct => {
                                    const active = s.accentColor === ct.id;
                                    return (
                                        <button key={ct.id} className="b" onClick={() => s.setAccentColor(ct.id)} style={{
                                            aspectRatio: "1", borderRadius: 14,
                                            background: ct.primary,
                                            border: active ? "3px solid #fff" : "3px solid transparent",
                                            boxShadow: active ? `0 0 0 2px ${ct.primary}` : "none",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            cursor: "pointer", transition: "all 0.2s ease",
                                        }}>
                                            {active && <span style={{ fontSize: 16, color: "#fff" }}>✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="アクセシビリティ" />
                    <Section>
                        <Row IconComp={IconContrast} iconColor={C.subHi} label="ハイコントラストモード" sub="視認性を向上させます"
                            right={<Toggle value={s.highContrast} onChange={s.setHighContrast} />} />
                        <Row IconComp={IconEye} iconColor={C.subHi} label="色覚サポート" sub="色の識別をサポート"
                            right={<Toggle value={s.colorBlind} onChange={s.setColorBlind} />} />
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 基本設定サブビュー ──
    if (showGameSettingsView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="基本設定" onBack={() => setShowGameSettingsView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="貸玉・交換率" />
                    <Section>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>貸玉100円</div>
                                <div style={{ fontSize: 11, color: C.sub }}>{(100 / ((s.rentBalls || 250) / 10)).toFixed(2)}円/玉</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI v={Math.round(s.rentBalls || 250) / 10} set={(v) => s.setRentBalls(Math.round(parseFloat(v) * 10))} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>玉/100円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>交換100円</div>
                                <div style={{ fontSize: 11, color: C.sub }}>{(100 / ((s.exRate || 250) / 10)).toFixed(2)}円/玉</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI v={Math.round(s.exRate || 250) / 10} set={(v) => s.setExRate(Math.round(parseFloat(v) * 10))} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>玉/100円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, padding: "12px 16px", flexWrap: "wrap" }}>
                            {[
                                { label: "等価", balls: 25, yen: "4.00" },
                                { label: "3.57円", balls: 28, yen: "3.57" },
                                { label: "3.33円", balls: 30, yen: "3.33" },
                                { label: "3.03円", balls: 33, yen: "3.03" },
                            ].map(({ label, balls, yen }) => {
                                const isActive = Math.round((s.exRate || 250) / 10) === balls;
                                return (
                                    <button key={yen} className="b" onClick={() => s.setExRate(balls * 10)} style={{
                                        background: isActive ? C.blue : C.surfaceHi,
                                        border: isActive ? "none" : `1px solid ${C.border}`,
                                        borderRadius: 999, color: isActive ? "#fff" : C.subHi,
                                        fontSize: 13, padding: "8px 14px", fontFamily: font, fontWeight: 600,
                                    }}>{label}</button>
                                );
                            })}
                        </div>
                    </Section>

                    <SectionLabel label="その他" />
                    <Section>
                        {[
                            { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom, unit: "1/x" },
                            { lbl: "1h消化回転数", v: s.rotPerHour, set: s.setRotPerHour, unit: "回/h" },
                        ].map(({ lbl, v, set, unit }, i, arr) => (
                            <div key={lbl} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 機種スペックサブビュー ──
    if (showMachineSpecView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="機種スペック設定" onBack={() => setShowMachineSpecView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="期待値算出用スペック" />
                    <Section>
                        {[
                            { lbl: "1R出玉（実出玉）", v: s.spec1R, set: s.setSpec1R, unit: "玉/R" },
                            { lbl: "平均総R/初当たり", v: s.specAvgRounds, set: s.setSpecAvgRounds, unit: "R" },
                            { lbl: "サポ増減/初当たり", v: s.specSapo, set: s.setSpecSapo, unit: "玉" },
                        ].map(({ lbl, v, set, unit }) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(0,0,0,0.1)" }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{borderSource === "db" ? "DB標準ボーダー" : "理論ボーダー"}</div>
                                <div style={{ fontSize: 11, color: C.teal }}>{exRateLabel}</div>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.green, fontFamily: mono }}>
                                {calcBorder > 0 ? f(calcBorder, 1) : "—"}<span style={{ fontSize: 10, color: C.sub, marginLeft: 4 }}>回/K</span>
                            </div>
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 貯玉設定サブビュー ──
    if (showChodamaView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="貯玉設定" onBack={() => setShowChodamaView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="貯玉オプション" />
                    <Section>
                        <Row IconComp={IconDiamond} iconColor={C.teal} label="貯玉を収支に含める" sub="OFFの場合、貯玉使用分は投資額0円として計算"
                            right={<Toggle value={s.includeChodamaInBalance} onChange={s.setIncludeChodamaInBalance} color={C.purple} />} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>1日の再プレイ上限</div>
                                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>上限到達時に警告を表示します</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI v={s.chodamaReplayLimit} set={s.setChodamaReplayLimit} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 20 }}>玉</span>
                            </div>
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── バックアップサブビュー ──
    if (showBackupView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="バックアップ・復元" onBack={() => setShowBackupView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="全データバックアップ" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                全データ（記録・設定・機種・店舗）をJSON形式で保存します。機種変更時に使用してください。
                            </div>
                            <Btn label="全データをバックアップ" onClick={backupAllData} bg={C.green} fg="#fff" bd="none" />
                        </div>
                    </Section>

                    <SectionLabel label="バックアップから復元" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                バックアップファイル（.json）を読み込んで全データを復元します。現在のデータは上書きされます。
                            </div>
                            <label style={{
                                display: "block", width: "100%", boxSizing: "border-box",
                                background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                color: C.text, fontSize: 14, padding: "12px 16px", fontFamily: font, fontWeight: 600,
                                textAlign: "center", cursor: "pointer",
                            }}>
                                バックアップから復元
                                <input type="file" accept=".json" onChange={restoreAllData} style={{ display: "none" }} />
                            </label>
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── メイン設定（フラットリスト）──
    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* CSS: Sectionの最終行ボーダーを除去 */}
            <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>

            {/* ヘッダー */}
            <div style={{
                background: C.surface,
                padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 18px",
                flexShrink: 0,
                borderBottom: `1px solid ${C.border}`,
            }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.5 }}>設定</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2, fontFamily: font }}>
                    貸玉 {Math.round((s.rentBalls || 250) / 10)}玉 / 交換 {Math.round((s.exRate || 250) / 10)}玉 / ボーダー {calcBorder > 0 ? f(calcBorder, 1) : "—"}回/K
                </div>
            </div>

            {/* ── スクロールコンテンツ ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>

                {/* 外観 */}
                <SectionLabel label="外観" />
                <Section>
                    <Row IconComp={IconPaint} iconColor={C.purple} label="外観" sub="テーマ・カラー・アクセシビリティ" onPress={() => setShowAppearanceView(true)} />
                </Section>

                {/* ゲーム設定 */}
                <SectionLabel label="ゲーム設定" />
                <Section>
                    <Row IconComp={IconGear} iconColor={C.blue} label="基本設定" sub={`貸玉 ${Math.round((s.rentBalls || 250) / 10)}玉 / 交換 ${Math.round((s.exRate || 250) / 10)}玉`} onPress={() => setShowGameSettingsView(true)} />
                    <Row IconComp={IconTarget} iconColor={C.red} label="機種スペック" sub={`確率分母: ${s.synthDenom || 319.6} / ボーダー: ${calcBorder > 0 ? f(calcBorder, 1) : "—"}回/K`} onPress={() => setShowMachineSpecView(true)} />
                    <Row IconComp={IconDiamond} iconColor={C.teal} label="貯玉設定" sub={s.includeChodamaInBalance ? "収支に含める" : "収支に含めない"} onPress={() => setShowChodamaView(true)} />
                    <Row IconComp={IconMagnifier} iconColor={C.subHi} label="機種検索・登録" sub={`カスタム機種: ${(s.customMachines || []).length}件`} onPress={() => setShowMachineSearch(true)} />
                    <Row IconComp={IconStore} iconColor={C.green} label="店舗検索・登録" sub={`登録店舗: ${(s.stores || []).length}件`} onPress={() => setShowStoreSearch(true)} />
                </Section>

                {/* セキュリティ */}
                <SectionLabel label="セキュリティ" />
                <Section>
                    <Row IconComp={IconLock} iconColor={C.subHi} label="アプリロック" sub={s.appLock ? (s.appPin ? "PIN設定済み" : "PIN未設定") : "オフ"}
                        right={<Toggle value={s.appLock} onChange={(v) => {
                            if (!v) { s.setAppLock(false); s.setAppPin(""); setPinSetStep("idle"); }
                            else if (!s.appPin) { s.setAppLock(true); setPinSetStep("enter"); setPinDraft(""); }
                            else s.setAppLock(true);
                        }} color={C.red} />} />
                    {s.appLock && s.appPin && pinSetStep === "idle" && (
                        <Row IconComp={IconKey} iconColor={C.orange} label="PINを変更" onPress={() => { setPinSetStep("enter"); setPinDraft(""); setPinSetError(false); }} />
                    )}
                    {pinSetStep !== "idle" && (
                        <div style={{ padding: "16px 16px 14px", borderTop: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                                {pinSetStep === "enter" ? "新しいPINを入力（4桁）" : "PINを再入力して確認"}
                            </div>
                            {/* PINドットインジケーター */}
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 14 }}>
                                {[0,1,2,3].map(i => {
                                    const val = pinSetStep === "enter" ? pinDraft : pinConfirm;
                                    return (
                                        <div key={i} style={{
                                            width: 14, height: 14, borderRadius: 7,
                                            background: val.length > i ? (pinSetError ? C.red : C.blue) : "rgba(128,128,128,0.3)",
                                            transition: "background 0.15s ease",
                                        }} />
                                    );
                                })}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={4}
                                    value={pinSetStep === "enter" ? pinDraft : pinConfirm}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                        if (pinSetStep === "enter") setPinDraft(v);
                                        else setPinConfirm(v);
                                        setPinSetError(false);
                                    }}
                                    placeholder="••••"
                                    style={{
                                        flex: 1, background: C.bg,
                                        border: `1.5px solid ${pinSetError ? C.red : C.borderHi}`,
                                        borderRadius: 10, padding: "11px 12px", fontSize: 22, color: C.text,
                                        fontFamily: mono, outline: "none", letterSpacing: 10, textAlign: "center",
                                        transition: "border-color 0.2s",
                                    }}
                                />
                                <button className="b" onClick={() => {
                                    const val = pinSetStep === "enter" ? pinDraft : pinConfirm;
                                    if (val.length !== 4 || !/^\d{4}$/.test(val)) { setPinSetError(true); return; }
                                    if (pinSetStep === "enter") {
                                        setPinSetStep("confirm");
                                        setPinConfirm("");
                                        setPinSetError(false);
                                    } else {
                                        if (pinConfirm !== pinDraft) { setPinSetError(true); return; }
                                        s.setAppPin(pinConfirm);
                                        s.setAppLock(true);
                                        s.setIsLocked(false);
                                        setPinSetStep("idle");
                                        setPinDraft(""); setPinConfirm("");
                                        showToast("PINを設定しました");
                                    }
                                }} style={{
                                    background: C.blue, border: "none", borderRadius: 10,
                                    color: "#fff", fontSize: 13, padding: "11px 18px",
                                    fontFamily: font, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                                }}>
                                    {pinSetStep === "enter" ? "次へ" : "確定"}
                                </button>
                                <button className="b" onClick={() => {
                                    setPinSetStep("idle"); setPinDraft(""); setPinConfirm(""); setPinSetError(false);
                                    if (!s.appPin) s.setAppLock(false);
                                }} style={{
                                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                    color: C.text, fontSize: 13, padding: "11px 14px",
                                    fontFamily: font, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                                }}>キャンセル</button>
                            </div>
                            {pinSetError && (
                                <div style={{ fontSize: 12, color: C.red, marginTop: 8, textAlign: "center" }}>
                                    {pinSetStep === "enter" ? "4桁の数字を入力してください" : "PINが一致しません。もう一度入力してください"}
                                </div>
                            )}
                        </div>
                    )}
                </Section>
                {s.appLock && (
                    <div style={{ padding: "6px 4px 0", fontSize: 12, color: C.sub, lineHeight: 1.7 }}>
                        PINを忘れた場合はデータリセットが必要になります。
                    </div>
                )}

                {/* データ */}
                <SectionLabel label="データ" />
                <Section>
                    <Row IconComp={IconCloud} iconColor={C.blue} label="バックアップ・復元" sub="全データのエクスポート・インポート" onPress={() => setShowBackupView(true)} />
                </Section>

                {/* 危険な操作 */}
                <SectionLabel label="危険な操作" />
                <Section danger>
                    {!confirming ? (
                        <Row IconComp={IconTrash} iconColor={C.red} label="データをリセット" sub="セッションデータ・履歴を消去します" danger onPress={() => setConfirming(true)} />
                    ) : (
                        <div style={{ padding: "16px" }}>
                            <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>本当にリセットしますか？</div>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                回転数・獲得出玉・履歴などのセッションデータがすべて消去されます。設定値は保持されます。この操作は元に戻せません。
                            </div>
                            <div style={{ display: "flex", gap: 10 }}>
                                <Btn label="本当にリセット" onClick={() => { onReset(); setConfirming(false); }} bg={C.red} fg="#fff" bd="none" />
                                <Btn label="キャンセル" onClick={() => setConfirming(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                            </div>
                        </div>
                    )}
                </Section>

                {/* アプリ情報 */}
                <SectionLabel label="アプリ情報" />
                {/* アプリアイコン風ヘッダー */}
                <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "20px 16px 16px", marginBottom: 8,
                }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: 16,
                        background: C.blue,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 32, marginBottom: 10,
                    }}>🎰</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: font }}>パチトラッカー</div>
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>バージョン 1.0.0 (2025.7.1)</div>
                </div>
                <Section>
                    <Row IconComp={IconChat} iconColor={C.sub} label="お問い合わせ" onPress={() => showToast("サポートページは準備中です", "warn")} />
                    <Row IconComp={IconStar} iconColor={C.sub} label="アプリを評価" onPress={() => showToast("ストアページは準備中です", "warn")} />
                    <Row IconComp={IconDoc} iconColor={C.sub} label="利用規約" onPress={() => showToast("利用規約ページは準備中です", "warn")} />
                    <Row IconComp={IconShield} iconColor={C.sub} label="プライバシーポリシー" onPress={() => showToast("プライバシーポリシーは準備中です", "warn")} />
                </Section>

                <div style={{ height: 24 }} />
            </div>

            <ToastPortal />
        </div>
    );
}
