import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { C, f, sc, sp, tsNow, font, mono, localDateStr } from "../constants";
import { archiveWorkMinutes } from "./analysis/analysisSelectors";
import { NI, Card, MiniStat, Btn, SecLabel, KV, ModeToggle, ModeBadge } from "./Atoms";
import { searchMachines, deriveSpecForMachine, getEffectiveMachineList } from "../machineDB";
import {
    MACHINE_PROBABILITY_FILTER_OPTIONS,
    MACHINE_SORT_OPTIONS,
    filterMachines,
    getMachineMakerKey,
    sortMachines,
} from "../machineSort";
import { calcPreciseEV } from "../logic";
import { applyEconomicEV } from "../economics";
import {
    calculateLiveActualBalance,
    deadlineFromTime,
    estimateHourlyWorkFromStart1K,
    projectWorkToDeadline,
    timeValueFromDate,
    validateSessionSchedule,
} from "../sessionProjection";
import { reconcileSegmentConsumption, clearPushCorrections, estimateSegmentGross, hasPushCorrections } from "../ballConsumption";
import { createBackup, restoreBackup } from "../persistence";
import { parseCsvRows, toCsvRow } from "../csv";
import { validateSettingNumber } from "../settingsUtils";
import {
    PACHINKO_RATE_PRESETS,
    ballsForInvestment,
    formatBallQuantity,
    rentalYenPerBall,
} from "../rateSettings";
import { evDecision } from "./decision/evDecision";
import { confidenceAccuracyLabel } from "./decision/confidenceLabels";
import { LiveDecisionNavigator } from "./decision/LiveDecisionNavigator";
import { KeyMetrics } from "./decision/KeyMetrics";
import { RecentEventList } from "./decision/RecentEventList";
import MachineSpecWorkspace from "./machines/MachineSpecWorkspace";
import IslandMapManager from "./select/IslandMapManager";
import { getStoreIslands, setStoreIslands } from "./select/hallMapSelectors";
import { buildMultiRoundHit, getMachineRoundLoop, getMachineRoundOptions } from "./record/machineRoundOptions";
import RoundMultiplierControl from "./record/RoundMultiplierControl";
import {
    calculateYutimeEV,
    createYutimeSessionFromMachine,
    deriveCurrentLowProbabilitySpins,
    deriveNormalExpectedNetBalls,
} from "./yutime/yutimeCalculator";

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
                    <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} stroke="var(--border)" strokeWidth={1} />
                    <text x={pad.left - 4} y={l.y + 3} textAnchor="end" fill="var(--sub)" fontSize={8} fontFamily="monospace">
                        {l.v >= 1000 || l.v <= -1000 ? (l.v / 1000).toFixed(0) + "k" : l.v.toLocaleString()}
                    </text>
                </g>
            ))}
            {/* Zero line */}
            {showZero && minV < 0 && maxV > 0 && (
                <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} stroke="var(--border-hi)" strokeWidth={1} strokeDasharray="4,3" />
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
                <text key={i} x={points[i].x} y={height - 4} textAnchor="middle" fill="var(--sub)" fontSize={8}>
                    {data[i].label}
                </text>
            ))}
        </svg>
    );
}

/* ================================================================
   Terminal/Bloomberg風 カレンダータブ用のデザイントークン
   （CalendarTab スコープ専用。グローバルCSS変数は変更しない）
================================================================ */
// 等幅フォント（証券端末風）
const TMONO = '"SF Mono", ui-monospace, "Roboto Mono", Menlo, monospace';
// カレンダービューのデザイントークンは index.css の .cal-terminal で定義（テーマ対応）
// プラス/マイナス色（端末風トークン基準）
const twSc = (n) => (!isFinite(n) || n === 0 ? "var(--dim)" : n > 0 ? "var(--plus)" : "var(--minus)");

/* セクションラベル（アンバー左ボーダー + コードラベル + 名称 + 右端補足） */
function SectionLabel({ code, label, right }) {
    return (
        <div style={{
            display: "flex", alignItems: "baseline", gap: 8,
            borderLeft: "2px solid var(--accent-amber)", paddingLeft: 6,
            margin: "0 2px 8px",
        }}>
            <span style={{ fontFamily: TMONO, fontSize: 10, color: "var(--accent-amber)", fontWeight: 700, letterSpacing: ".06em", flexShrink: 0 }}>{code}</span>
            <span style={{ fontSize: 12, color: "var(--txt)", fontWeight: 700, letterSpacing: ".02em", flex: 1, minWidth: 0 }}>{label}</span>
            {right != null && right !== "" && (
                <span style={{ fontFamily: TMONO, fontSize: 9, color: "var(--dim)", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{right}</span>
            )}
        </div>
    );
}

/* ================================================================
   MultiLineChart — 実収支 / EV / 差 の3系列折れ線（収支推移カレンダー用）
================================================================ */
function MultiLineChart({ points, width = 340, height = 180 }) {
    if (!points || points.length < 2) {
        return (
            <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--dim)", fontFamily: TMONO, fontSize: 12 }}>
                グラフ表示には2日分以上の記録が必要です
            </div>
        );
    }
    const pad = { top: 12, right: 12, bottom: 22, left: 34 };
    const w = width - pad.left - pad.right;
    const h = height - pad.top - pad.bottom;
    const all = points.flatMap(p => [p.actual, p.ev, p.diff]);
    const minV = Math.min(...all, 0);
    const maxV = Math.max(...all, 0);
    const range = maxV - minV || 1;
    const xOf = i => pad.left + (i / (points.length - 1)) * w;
    const yOf = v => pad.top + h - ((v - minV) / range) * h;
    const zeroY = yOf(0);
    // 系列色は端末風トークン基準（実収支=緑 / EV=青 / 差=破線グレー）。
    // SVG 属性は var() を解決できないため、色は style プロパティで指定してテーマ切替に追従させる。
    const series = [
        { key: "actual", color: "var(--plus)", width: 1.5 },
        { key: "ev", color: "var(--ev)", width: 1.5 },
        { key: "diff", color: "var(--dim)", width: 1, dash: "3 3" },
    ];
    const pathOf = key => points.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p[key])}`).join(" ");
    const yLabels = [maxV, (maxV + minV) / 2, minV].map(v => ({ v, y: yOf(v) }));
    const xIdx = Array.from(new Set([0, Math.floor(points.length / 2), points.length - 1]));
    return (
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
            {yLabels.map((l, i) => (
                <g key={i}>
                    <line x1={pad.left} y1={l.y} x2={width - pad.right} y2={l.y} style={{ stroke: "var(--chart-grid)" }} strokeWidth={1} />
                    <text x={pad.left - 4} y={l.y + 3} textAnchor="end" style={{ fill: "var(--dim)" }} fontSize={9} fontFamily={TMONO}>
                        {Math.abs(l.v) >= 1000 ? (l.v / 1000).toFixed(0) + "k" : Math.round(l.v).toLocaleString()}
                    </text>
                </g>
            ))}
            {minV < 0 && maxV > 0 && (
                <line x1={pad.left} y1={zeroY} x2={width - pad.right} y2={zeroY} style={{ stroke: "var(--chart-zero)" }} strokeWidth={1} strokeDasharray="4,3" />
            )}
            {series.map(s => (
                <path key={s.key} d={pathOf(s.key)} fill="none" style={{ stroke: s.color }} strokeWidth={s.width}
                    strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dash || undefined} />
            ))}
            {series.map(s => points.map((p, i) => (
                <circle key={`${s.key}-${i}`} cx={xOf(i)} cy={yOf(p[s.key])} r={2.5} style={{ fill: s.color }} />
            )))}
            {xIdx.map(i => (
                <text key={i} x={xOf(i)} y={height - 4} textAnchor="middle" style={{ fill: "var(--dim)" }} fontSize={9} fontFamily={TMONO}>
                    {points[i].label}
                </text>
            ))}
        </svg>
    );
}

/* ================================================================
   WageRankCard — 時給ランキング（機種別 / 店舗別）カード
================================================================ */
function WageRankCard({ title, rows, expanded, onToggle }) {
    const shown = expanded ? rows : rows.slice(0, 5);
    // 機種名にスペック値（例 1/349.9）が混入していないか検査
    const hasSpecMix = rows.some(r => /1\/\d/.test(r.name || ""));
    return (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--tw-border)", borderRadius: 8, padding: "10px 0 4px", minWidth: 0 }}>
            <div style={{
                display: "flex", alignItems: "baseline", gap: 6,
                borderLeft: "2px solid var(--accent-amber)", paddingLeft: 6, margin: "0 8px 8px",
            }}>
                <span style={{ fontFamily: TMONO, fontSize: 10, color: "var(--accent-amber)", fontWeight: 700, letterSpacing: ".06em", flexShrink: 0 }}>RNK</span>
                <span style={{ fontSize: 11, color: "var(--txt)", fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
            </div>
            {shown.length === 0 ? (
                <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "center", padding: "16px 8px" }}>記録なし</div>
            ) : shown.map((r, i) => (
                <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderTop: i === 0 ? "none" : "1px solid var(--tw-border)" }}>
                    <span style={{ width: 12, fontSize: 11, fontWeight: 700, color: "var(--accent-amber)", fontFamily: TMONO, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 600, color: "var(--txt)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: twSc(r.wage), fontFamily: TMONO, fontVariantNumeric: "tabular-nums", flexShrink: 0, textAlign: "right" }}>
                        {sp(r.wage)}<span style={{ fontSize: 8, color: "var(--dim)", marginLeft: 1 }}>/h</span>
                    </span>
                </div>
            ))}
            {hasSpecMix && (
                <div style={{
                    margin: "6px 8px 0", padding: "6px 8px", borderRadius: 4,
                    background: "rgba(255,176,46,.06)", color: "var(--accent-amber)", fontSize: 10, lineHeight: 1.4,
                }}>⚠ 機種名にスペック値が混入しています。機種マスタを確認してください。</div>
            )}
            {rows.length > 5 && (
                <button className="b" onClick={onToggle} style={{
                    width: "100%", minHeight: 44, background: "transparent", border: "none",
                    borderTop: "1px solid var(--tw-border)", color: "var(--ev)", fontSize: 11, fontWeight: 700,
                    fontFamily: TMONO, cursor: "pointer", marginTop: 2,
                }}>{expanded ? "閉じる" : "すべて見る →"}</button>
            )}
        </div>
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

const jackpotTone = {
    blue: { main: "var(--blue)", soft: "rgba(56,189,248,0.16)", glow: "rgba(56,189,248,0.34)" },
    green: { main: "#34d399", soft: "rgba(52,211,153,0.16)", glow: "rgba(52,211,153,0.34)" },
    yellow: { main: "#fbbf24", soft: "rgba(251,191,36,0.16)", glow: "rgba(251,191,36,0.32)" },
    teal: { main: "#2dd4bf", soft: "rgba(45,212,191,0.16)", glow: "rgba(45,212,191,0.32)" },
    orange: { main: "#fb923c", soft: "rgba(251,146,60,0.16)", glow: "rgba(251,146,60,0.32)" },
    red: { main: "#f87171", soft: "rgba(248,113,113,0.15)", glow: "rgba(248,113,113,0.30)" },
    purple: { main: "var(--purple)", soft: "rgba(192,132,252,0.16)", glow: "rgba(192,132,252,0.32)" },
};

function FlowValueCard({ label, value, unit, tone = "blue", hint }) {
    const t = jackpotTone[tone] || jackpotTone.blue;
    return (
        <div className="jp-value-card" style={{ "--jp-main": t.main, "--jp-soft": t.soft, "--jp-glow": t.glow }}>
            <div className="jp-value-label">{label}</div>
            {hint && <div className="jp-value-hint">{hint}</div>}
            <div className="jp-value-number">
                {value}<span>{unit}</span>
            </div>
        </div>
    );
}

function FlowChoiceButton({ children, tone = "blue", style = {}, ...props }) {
    const t = jackpotTone[tone] || jackpotTone.blue;
    return (
        <button
            className="b jp-choice-button"
            style={{ "--jp-main": t.main, "--jp-soft": t.soft, "--jp-glow": t.glow, ...style }}
            {...props}
        >
            {children}
        </button>
    );
}

function effectiveEv(ev = {}) {
    return {
        start1K: ev.effectiveStart1K ?? ev.start1KCorrected ?? ev.start1K ?? 0,
        bDiff: ev.effectiveBDiff ?? ev.bDiffCorrected ?? ev.bDiff ?? 0,
        ev1K: ev.effectiveEV1K ?? ev.ev1KCorrected ?? ev.ev1K ?? 0,
        evPerRot: ev.effectiveEvPerRot ?? ev.evPerRot ?? 0,
        workAmount: ev.effectiveWorkAmount ?? ev.workAmount ?? 0,
        wage: ev.effectiveWage ?? ev.wage ?? 0,
    };
}

// 遊タイム狙い目分析カード（記録タブ用）
// - 天井回転数（ceilingRot）が 0/未設定なら何も描画しない（=非搭載機種）
// - 残り回転数 = max(0, ceilingRot - currentHamari)
// - 到達コスト = 残り回転数 ÷ 1Kスタート × 1000（円）。1Kスタート未測定時は理論ボーダー（S.border）を仮置きで利用
// - 期待値 = 期待出玉 × ballVal − 到達コスト（円）
// - 期待値 > 0 を「狙い目」、< 0 を「割に合わない」と表示
function YutimeEvCard({ result, spec, rateSource = "assumed", playMode = "cash" }) {
    if (!spec?.triggerLowSpins) return null;
    const isHeld = playMode === "mochi" || playMode === "chodama";
    const modeLabel = playMode === "chodama" ? "貯玉" : isHeld ? "持ち玉" : "現金";
    const canCompute = Boolean(result?.valid);
    const ev = canCompute ? result.selectedEV : null;
    const missingPayout = result?.missing?.includes("yutimeExpectedNetBalls");
    const verdictLabel = !canCompute
        ? (missingPayout ? "期待出玉の入力が必要" : "入力不足")
        : result.remainingSpins === 0 ? "発動回転に到達"
        : ev >= 0 ? "期待値プラス" : "期待値マイナス";
    const verdictColor = !canCompute ? C.sub : ev >= 0 ? C.green : C.red;
    const verdictBg = !canCompute ? "rgba(148,163,184,0.12)" : ev >= 0 ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)";
    const fmtYen = (n) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString("ja-JP")}円`);
    const cell = (label, value, color) => (
        <div style={{ flex: 1, textAlign: "center", padding: "8px 4px" }}>
            <div style={{ fontSize: 10, color: C.sub, fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: color || C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
        </div>
    );

    return (
        <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 12,
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <circle cx="12" cy="12" r="5" />
                        <circle cx="12" cy="12" r="1.5" fill={C.blue} />
                    </svg>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>遊タイム期待値</div>
                </div>
                <div style={{
                    fontSize: 11, fontWeight: 800, color: verdictColor,
                    background: verdictBg, border: `1px solid ${verdictColor}`,
                    borderRadius: 999, padding: "3px 10px",
                }}>
                    {verdictLabel}
                </div>
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 7 }}>
                現在の遊技方法：<strong style={{ color: C.text, fontSize: 14 }}>{modeLabel}</strong>
                {rateSource === "assumed" && <span style={{ color: C.yellow }}> ・ 暫定</span>}
            </div>
            <div style={{ display: "flex", background: "var(--surface-hi)", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                {cell("期待値", fmtYen(ev), ev == null ? C.sub : ev >= 0 ? C.green : C.red)}
                {cell("残り回転", canCompute ? `${result.remainingSpins.toLocaleString("ja-JP")}回` : "—", C.orange)}
                {cell("到達率", canCompute ? `${(result.reachProbability * 100).toFixed(1)}%` : "—", C.blue)}
            </div>
            <div style={{ fontSize: 10, color: C.sub, marginTop: 6, lineHeight: 1.4 }}>
                {canCompute ? <>
                    当たらず遊タイムまで {Math.ceil(result.selectedArrivalInvestment).toLocaleString("ja-JP")}円<br />
                    平均投資 {Math.round(result.selectedInvestment).toLocaleString("ja-JP")}円 ・ 0円以上の開始 {result.selectedBreakEvenLowSpins ?? "—"}回<br />
                    現金 {fmtYen(result.cashEV)} / 持ち玉・貯玉 {fmtYen(result.heldEV)} ・ {rateSource === "measured" ? "実測回転率" : "想定回転率"}
                </> : missingPayout ? "遊タイム中のスルーと電サポ増減を含む平均純増玉を入力してください。" : "確率・発動回転・回転率を確認してください。"}
            </div>
        </div>
    );
}

// 詳細データタブ専用 スタイルヘルパー（分析OS風 ダークUI）
function dataCardStyle() {
    return {
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        marginBottom: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
    };
}

function sessionScheduleErrorMessage(error) {
    if (error === "closing_missing" || error === "closing_invalid") {
        return "店舗の閉店時刻を設定してください。";
    }
    if (error === "target_after_closing") {
        return "終了予定時刻は閉店時刻と同じか、それより前に設定してください。";
    }
    return "終了予定時刻は現在より後の時刻を設定してください。";
}
function cardHeaderStyle() {
    return {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px 8px",
    };
}
function cardNumDot() {
    return {
        flexShrink: 0,
        width: 18, height: 18, borderRadius: "50%",
        background: "rgba(10,132,255,0.16)",
        border: "1px solid rgba(10,132,255,0.55)",
        color: "var(--blue)",
        fontSize: 10, fontWeight: 800,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: mono,
    };
}
function cardTitleStyle() {
    return {
        fontSize: 13.5,
        fontWeight: 700,
        color: "var(--text)",
        fontFamily: font,
    };
}
function subCardStyle() {
    return {
        background: "var(--surface-hi)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "8px 8px 8px 9px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 56,
    };
}
function subCardLabel() {
    return {
        fontSize: 9,
        color: "var(--sub)",
        fontWeight: 600,
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        gap: 2,
        lineHeight: 1.1,
    };
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
    const archives = useMemo(() => S.archives || [], [S.archives]);
    const evGraphData = useMemo(() => {
        const points = [];
        let cumEV = 0;
        archives.forEach((a) => {
            const w = a.stats?.effectiveWorkAmount ?? a.stats?.workAmount ?? 0;
            cumEV += w;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumEV) });
        });
        // Add current session
        const currentWork = ev.effectiveWorkAmount ?? ev.workAmount;
        if (currentWork !== 0) {
            cumEV += currentWork;
            points.push({ label: "今日", value: Math.round(cumEV) });
        }
        return points;
    }, [archives, ev.effectiveWorkAmount, ev.workAmount]);

    // Build cumulative profit/loss graph from archives (actual results based)
    const _plGraphData = useMemo(() => {
        const points = [];
        let cumPL = 0;
        archives.forEach((a) => {
            const st = a.stats || {};
            // Use workAmount as proxy for daily result
            const daily = st.workAmount || 0;
            cumPL += daily;
            points.push({ label: a.date?.slice(5) || "", value: Math.round(cumPL) });
        });
        const currentWork = ev.effectiveWorkAmount ?? ev.workAmount;
        if (currentWork !== 0) {
            cumPL += currentWork;
            points.push({ label: "今日", value: Math.round(cumPL) });
        }
        return points;
    }, [archives, ev.effectiveWorkAmount, ev.workAmount]);

    const hasRot = hasRotDataRows(S.rotRows);
    const hasJp = (jpLog || []).length > 0;
    const evEff = effectiveEv(ev);

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
                {stat("期待値/K", hasRot ? sp(evEff.ev1K, 0) : "—", "円", sc(evEff.ev1K))}
                {stat("単価", hasRot ? sp(evEff.evPerRot, 2) : "—", "円/回", sc(evEff.evPerRot))}
                {stat("仕事量", hasRot ? sp(evEff.workAmount, 0) : "—", "円", sc(evEff.workAmount))}
                {stat("時給", hasRot ? sp(evEff.wage, 0) : "—", "円/h", sc(evEff.wage))}
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
                {stat("平均出玉/大当たり", ev.avgNetGainPerHit > 0 ? f(ev.avgNetGainPerHit, 0) : "—", "玉", C.green)}
                {stat("大当たり回数", ev.totalHits > 0 ? String(ev.totalHits) : "—", "回", C.purple)}
                {stat("平均R数/大当たり", ev.avgRoundsPerHit > 0 ? f(ev.avgRoundsPerHit, 1) : "—", "R", C.blue)}
                {stat("サポ増減(実測残差)", ev.realMeasuredChainCount > 0 ? sp(ev.estimatedSapoChange, 0) : "—", "玉", sc(ev.estimatedSapoChange))}
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
                {stat("非現金比率", ev.nonCashRatio > 0 ? Math.round(ev.nonCashRatio * 100).toString() : "0", "%", C.orange)}
                {stat("持ち玉比率", ev.mochiRatio > 0 ? Math.round(ev.mochiRatio * 100).toString() : "0", "%", C.orange)}
                {stat("貯玉比率", ev.chodamaRatio > 0 ? Math.round(ev.chodamaRatio * 100).toString() : "0", "%", C.purple)}
            </Card>
        </div>
    );
}

/* ================================================================
   RotTab — 回転数入力 + リアルタイム実測統計パネル（刷新版）
================================================================ */
export function RotTab({ rows, setRows, S, ev, border }) {
    const [input, setInput] = useState("");
    const [inputError, setInputError] = useState("");
    const [showInputSheet, setShowInputSheet] = useState(false);
    // 旧UIの "jackpot" mode は撤去済み。bottom sheet は常に通常回転入力（count モード）として使用
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [moveMochiBalls, setMoveMochiBalls] = useState("");
    // 台移動モーダル：移動先の機種情報の入力state（機種名は稼働開始と同じ機種選択画面で選ぶ）
    const [moveMachineName, setMoveMachineName] = useState("");
    const [moveMachineNum, setMoveMachineNum] = useState("");
    // 移動先の開始回転数（新台の台データ表示値。稼働開始時の「開始回転数」と同じ意味）
    const [moveStartRot, setMoveStartRot] = useState("");
    const movePickedMachineRef = useRef(null);
    // 記録モード イベントメニュー（FAB から開く）
    const [showEventMenu, setShowEventMenu] = useState(false);
    // テンキーの直近入力履歴（表示専用・店内での再入力ヒント）
    const [inputHistory, setInputHistory] = useState([]);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [showStoreDD, setShowStoreDD] = useState(false);
    const [machineQuery, setMachineQuery] = useState("");
    const [showMachinePicker, setShowMachinePicker] = useState(false);
    const [pickerFilter, setPickerFilter] = useState("all");
    const [pickerSort, setPickerSort] = useState("default");
    // 機種選択ボトムシートの適用先（"setup"=稼働開始モーダル / "move"=台移動モーダル）
    const [machinePickerFor, setMachinePickerFor] = useState("setup");
    const [summaryCollapsed, setSummaryCollapsed] = useState(true);
    const [showInvestSettings, setShowInvestSettings] = useState(false);
    const [customInvestPace, setCustomInvestPace] = useState("");
    const [customInvestPaceError, setCustomInvestPaceError] = useState("");
    const tableRef = useRef(null);
    const evEff = effectiveEv(ev);
    const [projectionNow, setProjectionNow] = useState(() => Date.now());
    const [showScheduleEditor, setShowScheduleEditor] = useState(false);
    const [scheduleTargetTime, setScheduleTargetTime] = useState("");
    const [scheduleClosingTime, setScheduleClosingTime] = useState("");
    const [scheduleEditorError, setScheduleEditorError] = useState("");

    useEffect(() => {
        const timer = setInterval(() => setProjectionNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    // 遊タイム用の低確率回転数。開始時カウントに、着席後の通常回転を足す。
    const currentHamari = useMemo(
        () => deriveCurrentLowProbabilitySpins(S.rotRows || []),
        [S.rotRows],
    );

    // ⑥「ボーダー差・信頼度の推移」用：各 "data" 行までのプレフィックスで calcPreciseEV を再計算し、
    // その時点の実ボーダー差(回/K)・信頼度(%)・累計回転数を実値で算出する（ダミー乱数は使用しない）。
    // App.jsx の calcPreciseEV({...}) 呼び出しと同一の引数で、rotRows は slice(0, i+1)、
    // jpLog はその時点の cumRot 以下に発生したチェーンのみに truncate する（jpCount の過大計上を防ぐ）。
    const trendSeries = useMemo(() => {
        const rowsAll = S.rotRows || [];
        const jpAll = S.jpLog || [];
        const points = [];
        for (let i = 0; i < rowsAll.length; i++) {
            if (rowsAll[i].type !== "data") continue;
            const cum = rowsAll[i].cumRot || 0;
            const prefixRows = rowsAll.slice(0, i + 1);
            // その時点までに発生した大当たりチェーンのみ（hitRot = 発生時の cumRot）
            const prefixJp = jpAll.filter((c) => (Number(c?.hitRot) || 0) <= cum);
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

    // RUSH終了完了（時短回数・最終出玉を入力してから連チャンを締める）
    // 旧 handleChainEnd（即時終了・時短/最終出玉入力なし）を置き換え。
    // openDirectSingleEnd("rush") → 時短回数/最終出玉入力モーダル → 本関数で確定。
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
    const [setupInitialBalls, setSetupInitialBalls] = useState("");
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

    const openSetupModal = () => {
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
        const all = getEffectiveMachineList(S.customMachines);
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
        S.setInvestPace(pace);
        setCustomInvestPaceError("");
        setShowInvestSettings(false);
    };

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
            effMode = "cash";
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
            S.setPlayMode("cash");
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
    const handleStartSession = () => {
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
        const val = Number(setupStartRot) || 0;
        const yutimeLowSpins = setupYutimeLowSpins === ""
            ? val
            : Math.max(0, Math.round(Number(setupYutimeLowSpins) || 0));

        // 店舗・機種設定を適用
        if (setupStore) S.setStoreName(setupStore);
        if (setupMachineNum) S.setMachineNum(setupMachineNum);
        if (setupMachineName) S.setMachineName(setupMachineName);
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
        const initialChodama = Number(setupInitialBalls) || 0;
        const startPlayMode = initialChodama > 0 ? "chodama" : "cash";
        S.setCurrentChodama(initialChodama);
        S.setInitialChodama(initialChodama);
        S.setPlayMode(startPlayMode);
        // 持ち玉は0にリセット（移動時に設定する）
        S.setCurrentMochiBalls(0);

        // 着席時点の遊タイム判断を固定保存する。以後の実測更新とは別物として扱う。
        if (S.yutimeSession?.triggerLowSpins) {
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
        setRows((r) => [...r, {
            type: "start",
            cumRot: val,
            ...(S.yutimeSession?.triggerLowSpins ? { yutimeLowSpins } : {}),
            mode: startPlayMode,
            mochiBalls: 0,
            chodamaBalls: initialChodama,
        }]);
        S.pushLog({ type: "スタート", time: tsNow(), rot: val });

        // モーダルを閉じてリセット
        setShowSetupModal(false);
        setSetupStore("");
        setSetupMachineNum("");
        setSetupMachineName("");
        setSetupStartRot("");
        setSetupInitialBalls("");
        setSetupSynthDenom("");
        setSetupBorder1k("");
        setSetupYutimeLowSpins("");
        setSetupYutimeStart1K("");
        setSetupEndTime("");
        setSetupClosingTime("");
        setSetupPlannedStart1K("");
        setSetupError("");
        setShowSetupSpec(false);
    };

    // 初当たりボタン → ウィザード開始
    // 新UI: 画面 A の「連チャン継続」/「単発終了」押下時に rotCountArg を渡して呼ぶ
    //       （旧UIのテンキー bottom sheet jackpot モードは廃止、引数なし呼び出しは下位互換用）
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
        S.pushSnapshot();
        endLockRef.current = true;

        if (pushAmount > 0) {
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
        if (S.playMode === "chodama" || S.playMode === "mochi") {
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
    const renderMachinePicker = () => showMachinePicker && (
        <div
            onClick={() => setShowMachinePicker(false)}
            style={{
                position: "fixed", inset: 0,
                background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)",
                zIndex: 1100,
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: C.surface,
                    borderTopLeftRadius: 16, borderTopRightRadius: 16,
                    maxHeight: "85vh",
                    display: "flex", flexDirection: "column",
                    animation: "fi 0.25s ease",
                }}
            >
                {/* ヘッダー: キャンセル | 機種を選択 | N機種 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px" }}>
                    <button className="b" onClick={() => setShowMachinePicker(false)} style={{
                        background: "var(--surface-hi)", border: "none",
                        borderRadius: 999, padding: "8px 14px",
                        fontSize: 13, fontWeight: 600, color: C.text, fontFamily: font,
                        cursor: "pointer",
                    }}>キャンセル</button>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>機種を選択</div>
                    <div style={{
                        fontSize: 11, fontWeight: 600, color: C.sub,
                        background: "var(--surface-hi)",
                        padding: "6px 12px", borderRadius: 999,
                        minWidth: 56, textAlign: "center",
                    }}>{filteredMachines.length}機種</div>
                </div>

                {/* フィルターチップ (横スクロール) */}
                <div style={{
                    display: "flex", gap: 8,
                    overflowX: "auto",
                    padding: "4px 16px 12px",
                    scrollbarWidth: "none",
                    WebkitOverflowScrolling: "touch",
                }}>
                    {[
                        { id: "all", label: "全て" },
                        { id: "スマパチ", label: "スマパチ" },
                        { id: "ハイミドル", label: "ハイミドル" },
                        { id: "ミドル", label: "ミドル" },
                        { id: "ライトミドル", label: "ライトミドル" },
                        { id: "甘デジ", label: "甘デジ" },
                    ].map(chip => {
                        const active = pickerFilter === chip.id;
                        return (
                            <button
                                key={chip.id}
                                className="b"
                                onClick={() => setPickerFilter(chip.id)}
                                style={{
                                    flexShrink: 0,
                                    background: active ? C.blue : "var(--surface-hi)",
                                    color: active ? "#fff" : C.text,
                                    border: "none",
                                    borderRadius: 999,
                                    padding: "8px 16px",
                                    fontSize: 13, fontWeight: 600,
                                    fontFamily: font,
                                    cursor: "pointer",
                                    transition: "background 0.15s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {chip.label}
                            </button>
                        );
                    })}
                </div>

                {/* 並び替え */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 12px" }}>
                    <label htmlFor="machine-picker-sort" style={{ color: C.sub, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        並び替え
                    </label>
                    <select
                        id="machine-picker-sort"
                        value={pickerSort}
                        onChange={(event) => setPickerSort(event.target.value)}
                        style={{
                            width: "100%", minHeight: 40, boxSizing: "border-box",
                            background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`,
                            borderRadius: 10, padding: "8px 36px 8px 12px",
                            color: C.text, fontSize: 13, fontWeight: 700, fontFamily: font,
                            outline: "none", cursor: "pointer",
                        }}
                    >
                        {MACHINE_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </div>

                {/* 機種リスト (スクロール) */}
                <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}>
                    {filteredMachines.map((m, i) => {
                        const typeColors = {
                            "スマパチ": "#f7971e",
                            "ハイミドル": "#ef473a",
                            "ミドル": "#2f6fed",
                            "ライトミドル": "#20e3b2",
                            "甘デジ": "#16a34a",
                        };
                        const iconColor = typeColors[m.type] || C.sub;
                        const iconLabel = (m.type || "").slice(0, 2);
                        return (
                            <button
                                key={m.id || `${m.name}-${i}`}
                                className="b"
                                onClick={() => {
                                    // 新形式（border1K のみ）の機種も border1K から等価スペックを逆算して反映する
                                    const spec = deriveSpecForMachine(m);
                                    const pickedYutime = createYutimeSessionFromMachine(m, {
                                        assumedStart1K: m.border1K || S.border,
                                    });
                                    if (machinePickerFor === "move") {
                                        // 台移動モーダル：即時にstateを書き換えず、移動確定時に反映するため ref に退避
                                        setMoveMachineName(m.name);
                                        movePickedMachineRef.current = {
                                            synthDenom: m.synthProb,
                                            spec1R: spec.spec1R,
                                            specAvgRounds: spec.specAvgRounds,
                                            specSapo: spec.specSapo,
                                            yutimeSession: pickedYutime,
                                            yutimeLowSpins: Math.max(0, Math.round(Number(moveStartRot) || 0)),
                                        };
                                    } else {
                                        setSetupMachineName(m.name);
                                        S.setYutimeSession(pickedYutime);
                                        S.setYutimeDecision(null);
                                        setSetupYutimeLowSpins("");
                                        setSetupYutimeStart1K(pickedYutime?.assumedStart1K ? String(pickedYutime.assumedStart1K) : "");
                                        S.setSynthDenom(m.synthProb);
                                        if (spec.spec1R != null) S.setSpec1R(spec.spec1R);
                                        if (spec.specAvgRounds != null) S.setSpecAvgRounds(spec.specAvgRounds);
                                        if (spec.specSapo != null) S.setSpecSapo(spec.specSapo);
                                    }
                                    setShowMachinePicker(false);
                                    setMachineQuery("");
                                }}
                                style={{
                                    width: "100%",
                                    display: "flex", alignItems: "center", gap: 14,
                                    padding: "14px 16px",
                                    background: "transparent",
                                    border: "none",
                                    borderBottom: `1px solid ${C.border}`,
                                    textAlign: "left",
                                    cursor: "pointer",
                                    fontFamily: font,
                                }}
                            >
                                <div style={{
                                    width: 44, height: 44, flexShrink: 0,
                                    borderRadius: 10,
                                    background: iconColor,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", fontSize: 13, fontWeight: 800,
                                    fontFamily: font,
                                }}>{iconLabel}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                                        {m.maker || ""}{m.maker && (m.prob || m.synthProb) ? "  " : ""}{m.prob || (m.synthProb ? `1/${m.synthProb}` : "")}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    {filteredMachines.length === 0 && (
                        <div style={{ padding: "32px 20px 16px", textAlign: "center", color: C.sub, fontSize: 13 }}>
                            該当する機種がありません
                        </div>
                    )}
                    {/* 未登録機種の行き止まり解消: 検索語があれば「そのまま使う」導線を出す。
                        機種名だけ確定し、スペックは稼働開始モーダルの任意入力／後の機種設定で補える。 */}
                    {machineQuery.trim() && (
                        <button
                            className="b"
                            onClick={() => {
                                if (machinePickerFor === "move") {
                                    // 台移動：機種名だけ確定（スペックは直前の台の値を保持）
                                    setMoveMachineName(machineQuery.trim());
                                    movePickedMachineRef.current = null;
                                } else {
                                    setSetupMachineName(machineQuery.trim());
                                    S.setYutimeSession(null);
                                    S.setYutimeDecision(null);
                                    setSetupYutimeLowSpins("");
                                    setSetupYutimeStart1K("");
                                    // 未登録機種はスペック入力を促すため任意セクションを開いておく
                                    setShowSetupSpec(true);
                                }
                                setShowMachinePicker(false);
                                setMachineQuery("");
                            }}
                            style={{
                                width: "calc(100% - 32px)", margin: "8px 16px 12px",
                                minHeight: 52, borderRadius: 12,
                                background: "var(--surface-hi)",
                                border: `1px dashed ${C.borderHi}`,
                                color: C.text, fontSize: 14, fontWeight: 700, fontFamily: font,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                cursor: "pointer",
                            }}
                        >
                            <span style={{ fontSize: 18, lineHeight: 1, color: C.blue }}>+</span>
                            「{machineQuery.trim()}」を未登録のまま使う
                        </button>
                    )}
                </div>

                {/* 検索バー (下部固定) */}
                <div style={{ padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${C.border}`, background: C.surface }}>
                    <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.sub, display: "flex" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={machineQuery}
                            onChange={e => setMachineQuery(e.target.value)}
                            placeholder="機種名・メーカーで検索"
                            style={{
                                width: "100%", boxSizing: "border-box",
                                background: "var(--surface-hi)",
                                border: "none",
                                borderRadius: 12,
                                padding: "12px 14px 12px 40px",
                                fontSize: 14,
                                color: C.text,
                                fontFamily: font,
                                outline: "none",
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );

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
                                            onChange={e => {
                                                setSetupStore(e.target.value);
                                                S.setSelectedStoreId(null);
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
                                                            if (st.chodama) S.setCurrentChodama(st.chodama);
                                                            // 貯玉入力欄を店舗の残高で自動セット
                                                            if (st.chodama) setSetupInitialBalls(String(st.chodama));
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

                                {/* 貸玉レート。低貸しでは一般的な200玉区切りも同時に設定する。 */}
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

                                {/* 機種選択 */}
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

                                {/* 遊タイム搭載機だけ表示。既定値が入るため、通常の開始操作は増えない。 */}
                                {S.yutimeSession?.triggerLowSpins > 0 && (
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

                                {/* 稼働計画。時刻だけでは金額を出せないため、開始前の想定回転率も同時に確認する。 */}
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

                                {setupError && !setupTargetAfterClosing && <div role="alert" style={{ color: C.red, fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>{setupError}</div>}

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
                    background: "var(--header-bg)"
                }}
            >
                {/* 機種・店舗情報 */}
                <div style={{ padding: "10px 12px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <button className="b" onClick={() => setSummaryCollapsed(!summaryCollapsed)} style={{
                        flex: 1, background: "transparent", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 8, minWidth: 0
                    }}>
                        <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60vw" }}>
                                    {S.machineName || "機種未設定"}
                                </span>
                                {S.machineNum && (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: C.sub, fontFamily: mono }}>#{S.machineNum}</span>
                                )}
                                <span className="session-status-badge">実戦中</span>
                            </div>
                            <div style={{ fontSize: 10, color: C.sub, marginTop: 2, fontWeight: 500 }}>{S.storeName || "店舗未設定"}</div>
                        </div>
                        <span style={{ fontSize: 9, color: C.sub, flexShrink: 0 }}>{summaryCollapsed ? "▼" : "▲"}</span>
                    </button>
                    {/* 通知ベル：通知パネル（Phase 6）を開く。未読件数を右上にバッジ表示 */}
                    <button
                        className="b"
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
                        style={{
                            position: "relative",
                            background: "var(--surface-hi)", border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "center",
                            minHeight: 32, minWidth: 32, flexShrink: 0,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.subHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                                <span
                                    aria-label={`未読 ${unread} 件`}
                                    style={{
                                        position: "absolute",
                                        top: -4, right: -4,
                                        background: C.orange,
                                        color: "#fff",
                                        fontSize: 9,
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        borderRadius: 999,
                                        padding: unread < 10 ? "3px 5px" : "3px 6px",
                                        minWidth: 14,
                                        textAlign: "center",
                                        boxShadow: `0 0 0 2px var(--surface-hi)`,
                                    }}
                                >
                                    {label}
                                </span>
                            );
                        })()}
                    </button>
                    {/* 歯車：設定モードへのショートカット */}
                    <button
                        className="b"
                        type="button"
                        aria-label="設定モードへ"
                        onClick={() => { if (S.setTab) S.setTab("settings"); }}
                        style={{
                            background: "var(--surface-hi)", border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "center",
                            minHeight: 32, minWidth: 32, flexShrink: 0,
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.subHi} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                        </svg>
                    </button>
                    <button className="b" onClick={() => { setCustomInvestPace(String(investPace)); setCustomInvestPaceError(""); setShowInvestSettings(true); }} style={{
                        background: "var(--surface-hi)", border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "6px 10px", display: "flex", alignItems: "center", gap: 4, minHeight: 32, flexShrink: 0
                    }} aria-label="投資ペース設定">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.subHi} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="2" y="6" width="20" height="13" rx="2" />
                            <path d="M2 10h20" />
                        </svg>
                        <span style={{ fontSize: 10, color: C.subHi, fontWeight: 600, fontFamily: mono }}>
                            {investPace >= 1000 ? `${investPace/1000}K` : `${investPace}円`}・{formatBallQuantity(ballsPerRecord)}玉
                        </span>
                    </button>
                </div>

                {/* サマリーカード群（折りたたみ） — 実績スナップショット */}
                {!summaryCollapsed && (
                    <div className="summary-card" style={{ padding: 6, margin: "0 12px 6px", borderRadius: 8 }}>
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
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{ev.jpCount || 0}</div>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></svg>
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

            {/* 記録タブ — モックアップ2準拠：ダーク × ネオンブルー × 戦略OS風UI */}
            {S.sessionSubTab === "rot" && (() => {
                const ballsLabel = S.playMode === "chodama" ? "貯玉" : "持ち玉";
                const ballsVal = S.playMode === "chodama" ? (S.currentChodama || 0) : (S.currentMochiBalls || 0);
                const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
                const currentCumRot = lastRow ? (lastRow.cumRot || 0) : 0;
                const lastInputRot = inputHistory.length > 0 ? inputHistory[0] : null;

                return (
                    <>
                    <div style={{
                        flex: 1, overflowY: "auto", overscrollBehavior: "contain",
                        padding: "10px 12px",
                        paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
                        display: "flex", flexDirection: "column", gap: 12,
                    }}>
                        {/* 1. 3K・5K・10K・20K固定地点で判断する見切りナビ */}
                        <LiveDecisionNavigator decision={ev.liveDecision} />

                        {/* 1.5. 遊タイム狙い目分析（天井未設定機種では非表示） */}
                        <YutimeEvCard
                            result={S.yutimeLive}
                            spec={S.activeYutimeSession}
                            rateSource={S.yutimeRateSource}
                            playMode={S.playMode}
                        />

                        {/* 2. 指標カード（3 + 4） */}
                        <KeyMetrics
                            ev={ev}
                            currentMochiBalls={S.currentMochiBalls || 0}
                            currentChodama={S.currentChodama || 0}
                        />

                        {/* 3. 直近の行動ログ（タイムライン） */}
                        <RecentEventList
                            jpLog={jpLog}
                            sesLog={sesLog}
                            anchorId="record-recent-events"
                        />

                        {/* 3.5 直前の入力を削除（誤入力取消ボタン） */}
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

                    {/* 下部固定 CTA + FAB */}
                    <div className="record-cta-bar">
                        <button
                            className="b record-cta-input"
                            type="button"
                            onClick={() => { setInputError(""); setShowInputSheet(true); }}
                            aria-label="回転数を入力する"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="6" width="18" height="14" rx="2" />
                                <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
                            </svg>
                            <span>
                                回転数を入力する
                                <span className="record-cta-input__sub">タップしてテンキーを開く</span>
                            </span>
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

                    {/* イベントメニュー（FABから開くボトムシート） */}
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
                                <div className="event-menu__sub" style={{ fontFamily: font }}>（戦略・実践イベント）</div>

                                {/* 初当たりを記録 */}
                                <button
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
                                </button>

                                {/* 台移動を記録 */}
                                <button
                                    className="b event-menu__item"
                                    type="button"
                                    onClick={() => {
                                        setShowEventMenu(false);
                                        // 大当たり記録が途中（completed:false）のまま台移動すると出玉が統計から漏れるため確認を挟む。
                                        // 未完了チェーンが無い通常時は確認なしで従来どおり台移動モーダルを開く（タップ数増えず）。
                                        if ((S.jpLog || []).some((c) => c && c.completed === false)) {
                                            if (!window.confirm("大当たり記録が入力途中です。\nこのまま台移動しますか？")) return;
                                        }
                                        setMoveMochiBalls(String(S.currentMochiBalls || 0));
                                        // 移動先の機種は未入力からスタート（同じ機種なら入力不要・空のままなら従来どおりクリア）
                                        setMoveMachineName("");
                                        setMoveMachineNum("");
                                        setMoveStartRot("");
                                        movePickedMachineRef.current = null;
                                        setShowMoveModal(true);
                                    }}
                                >
                                    <span className="event-menu__item-icon" style={{ "--em-color": C.blue }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="4" y1="12" x2="18" y2="12" />
                                            <polyline points="14 7 19 12 14 17" />
                                        </svg>
                                    </span>
                                    <span>
                                        <span className="event-menu__item-title" style={{ fontFamily: font }}>台移動を記録</span>
                                        <span className="event-menu__item-sub" style={{ fontFamily: font }}>別の台へ移動したことを記録</span>
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

                    {/* テンキーモーダル（モックアップ2準拠） */}
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

                                {/* 上部ステータスチップ：持ち玉 / 現在回転数 / 前回入力 */}
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

                                {/* 入力値ディスプレイ */}
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

                                {/* テンキー 7-9 / 4-6 / 1-3 / 0 + 削除 */}
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
                                    {/* 0は1列目、空白、削除 */}
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

                                {/* 決定ボタン */}
                                <button
                                    className="b numpad-modal__submit"
                                    type="button"
                                    onClick={decide}
                                    style={{ fontFamily: font }}
                                >
                                    この回転数を追加
                                </button>

                                {/* 入力履歴チップ */}
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

            {/* 大当たりタブ - HistoryTabから完全移植 */}
            {S.sessionSubTab === "history" && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                        <div>
                                {/* HUDストリップ（持玉 / 評価 / 1Rあたり）+ RUSH継続中バナー + スタッツグリッド */}
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

                                {/* アクションボタン（当たりを追加 / 単発完了 / RUSH終了）*/}
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

                                {/* 大当たり履歴ヘッダー + 履歴をすべて見る */}
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

                                {/* 大当たりタイムライン（最新20件・横並びチップ／折り返し対応で横スクロールなし）*/}
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

                                {/* サマリー（総R数 / 平均R数 / 大当たり / 初当たり）*/}
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

                                {/* 詳細履歴（「履歴をすべて見る」で展開）— 既存のチェーン詳細・編集・削除を温存 */}
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
                                {/* 今回の入力まとめ（未確定）— 将来連携予定: 入力中のチェーン値を集約表示 */}
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
                                {/* 最新履歴を削除（ゴミ箱アイコン付き） */}
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
                                    {/* チェーン終了データ（時短回数・最終出玉）*/}
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
                                    {/* 通常時の玉消費（回転率）修正 — 貯玉/持ち玉区間のみ表示 */}
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
                const scheduleEditorModal = showScheduleEditor && ReactDOM.createPortal(
                    <div
                        role="presentation"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) setShowScheduleEditor(false);
                        }}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 2400,
                            background: "rgba(0,0,0,0.72)",
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "center",
                        }}
                    >
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="予定時間の変更"
                            style={{
                                width: "100%",
                                maxWidth: 430,
                                boxSizing: "border-box",
                                borderRadius: "22px 22px 0 0",
                                border: `1px solid ${C.borderHi}`,
                                borderBottom: "none",
                                background: C.surface,
                                padding: "10px 16px calc(18px + env(safe-area-inset-bottom))",
                                boxShadow: "0 -18px 45px rgba(0,0,0,0.45)",
                            }}
                        >
                            <div aria-hidden="true" style={{ width: 38, height: 4, borderRadius: 99, background: C.borderHi, margin: "0 auto 14px" }} />
                            <div style={{ fontSize: 17, fontWeight: 900, color: C.text }}>予定時間を変更</div>
                            <div style={{ marginTop: 5, fontSize: 10, lineHeight: 1.55, color: C.sub }}>
                                時刻欄をタップすると、iPhoneでは端末標準のリール型時間選択が開きます。
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                                <label style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", marginBottom: 6, fontSize: 10, fontWeight: 800, color: C.subHi }}>終了予定時刻</span>
                                    <input
                                        aria-label="変更後の終了予定時刻"
                                        type="time"
                                        step="300"
                                        value={scheduleTargetTime}
                                        onChange={(e) => {
                                            setScheduleTargetTime(e.target.value);
                                            setScheduleEditorError("");
                                        }}
                                        style={{ width: "100%", minWidth: 0, minHeight: 52, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.bg, color: C.text, padding: "8px 10px", fontSize: 20, fontWeight: 800, fontFamily: mono }}
                                    />
                                </label>
                                <label style={{ minWidth: 0 }}>
                                    <span style={{ display: "block", marginBottom: 6, fontSize: 10, fontWeight: 800, color: C.subHi }}>店舗の閉店時刻</span>
                                    <input
                                        aria-label="変更後の店舗閉店時刻"
                                        type="time"
                                        step="300"
                                        value={scheduleClosingTime}
                                        onChange={(e) => {
                                            setScheduleClosingTime(e.target.value);
                                            setScheduleEditorError("");
                                        }}
                                        style={{ width: "100%", minWidth: 0, minHeight: 52, boxSizing: "border-box", borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.bg, color: C.text, padding: "8px 10px", fontSize: 20, fontWeight: 800, fontFamily: mono }}
                                    />
                                </label>
                            </div>
                            {scheduleEditorError && (
                                <div role="alert" style={{ marginTop: 10, color: C.red, fontSize: 11, lineHeight: 1.5 }}>
                                    {scheduleEditorError}
                                </div>
                            )}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                                <button type="button" onClick={() => setShowScheduleEditor(false)} style={{ minHeight: 48, borderRadius: 12, border: `1px solid ${C.borderHi}`, background: C.surfaceHi, color: C.text, fontSize: 14, fontWeight: 800, fontFamily: font }}>キャンセル</button>
                                <button type="button" onClick={saveScheduleEditor} style={{ minHeight: 48, borderRadius: 12, border: "none", background: C.blue, color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: font }}>この時刻で保存</button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                );
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
                const jpCount = ev.jpCount || 0;
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
                // データ精度ラベル
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
                    <div style={{
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
                                        {/* データ精度 */}
                                        <div style={subCardStyle()}>
                                            <div style={subCardLabel()}>データ精度</div>
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
                            {/* 3. 想定時給（参考値・LOW強調） */}
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
                    <Card style={{ width: "100%", maxWidth: 320, padding: 20 }}>
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
                                    onChange={e => setMoveStartRot(e.target.value)}
                                    placeholder="0"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: "12px 14px", fontSize: 18, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }}
                                />
                            </div>
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
                            <Btn label="キャンセル" onClick={() => setShowMoveModal(false)} />
                            <Btn label="移動する" onClick={() => {
                                const mochi = Math.max(0, Math.round(Number(moveMochiBalls) || 0));
                                const picked = movePickedMachineRef.current;
                                const dest = {
                                    machineName: (moveMachineName || "").trim(),
                                    machineNum: (moveMachineNum || "").trim(),
                                    startRot: Math.max(0, Math.round(Number(moveStartRot) || 0)),
                                    ...(picked || {}),
                                    yutimeLowSpins: Math.max(0, Math.round(Number(moveStartRot) || 0)),
                                };
                                if (dest.yutimeSession?.triggerLowSpins) {
                                    const moveResult = calculateYutimeEV({
                                        probabilityDenom: dest.synthDenom || S.synthDenom,
                                        triggerLowSpins: dest.yutimeSession.triggerLowSpins,
                                        currentLowSpins: dest.yutimeLowSpins,
                                        start1K: dest.yutimeSession.assumedStart1K || S.border,
                                        normalExpectedNetBalls: deriveNormalExpectedNetBalls({
                                            spec1R: dest.spec1R || S.spec1R,
                                            specAvgRounds: dest.specAvgRounds || S.specAvgRounds,
                                            specSapo: dest.specSapo ?? S.specSapo,
                                        }),
                                        yutimeExpectedNetBalls: dest.yutimeSession.expectedNetBalls,
                                        rentBalls: S.rentBalls,
                                        exRate: S.exRate,
                                        playMode: S.currentMochiBalls > 0 ? "mochi" : S.currentChodama > 0 ? "chodama" : "cash",
                                    });
                                    dest.yutimeDecision = {
                                        version: 2,
                                        createdAt: new Date().toISOString(),
                                        machineName: dest.machineName,
                                        currentLowSpins: dest.yutimeLowSpins,
                                        assumedStart1K: dest.yutimeSession.assumedStart1K || S.border,
                                        rateSource: "assumed",
                                        playMode: S.currentMochiBalls > 0 ? "mochi" : S.currentChodama > 0 ? "chodama" : "cash",
                                        spec: dest.yutimeSession,
                                        result: moveResult,
                                    };
                                }
                                setShowMoveModal(false);
                                S.handleMoveTable(mochi, dest);
                            }} bg={C.purple} fg="#fff" bd="none" />
                        </div>
                    </Card>
                </div>
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
                    const w = a.stats?.effectiveWorkAmount ?? a.stats?.workAmount ?? 0;
                    cum += w;
                    points.push({ label: a.date?.slice(5) || "", value: Math.round(cum) });
                });
                const currentWork = ev.effectiveWorkAmount ?? ev.workAmount;
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

            {/* ================================================================
                画面 A — 初当たり入力（仕様書 docs/input-flow-design.md §3.1 準拠）
                旧 8ステップ hitWizard を 1 画面 5 項目 + 次状態選択 に刷新
            ================================================================ */}
            {hitWizardOpen && ReactDOM.createPortal(
                (() => {
                    const D = hitWizardData;
                    const focus = hitInputFocus || "pushAmount";
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

                    // 液晶出玉(dispN)は簡易フローでは入力しないため必須から除外
                    const requiredOk = rotN > 0 && trayN > 0 && rndN > 0;

                    // ヘッダーのチェーン状態
                    const chainLen = lastChain && !lastChain.completed ? (lastChain.hits || []).length : 0;

                    // 上部ステータス：算出可能な値のみ表示、不明値は「—」
                    const evNet = ev && Number.isFinite(ev.totalNetGain) ? ev.totalNetGain : 0;
                    const startG1K = ev && Number.isFinite(ev.start1K) ? ev.start1K : 0;
                    const avg1R = ev && Number.isFinite(ev.avg1R) ? ev.avg1R : 0;

                    // ステップ定義（簡易入力フロー 画面A、入力順: プッシュ補正→当たった回転数→開始前の玉数→R→結果）
                    // 液晶出玉・実測出玉の毎回入力は廃止。出玉は「開始前の玉数」と「最終玉数（ラッシュ終了時）」の差分で算出する。
                    const STEPS = [
                        { id: "pushAmount",   num: 1, label: "プッシュ補正額",  sub: "（任意・投資補正）",        short: "補正",     color: C.yellow, icon: "coin",   summaryUnit: "円" },
                        { id: "rotCount",     num: 2, label: "当たった回転数",  sub: "（はまり・ゲーム数）",      short: "回転数",   color: C.blue,   icon: "rotate", summaryUnit: "回転" },
                        { id: "trayBalls",    num: 3, label: "開始前の玉数",    sub: "（当たり直前の持ち玉・上皿）", short: "開始玉",   color: C.yellow, icon: "coin",   summaryUnit: "玉",  required: true },
                        { id: "rounds",       num: 4, label: "ラウンド数",      sub: "（当たったラウンド 10R・5Rなど）", short: "R数",  color: C.purple, icon: "r",      summaryUnit: "R" },
                        { id: "result",       num: 5, label: "結果を選択",      sub: "（連チャン継続 or 単発終了）", short: "結果",  color: C.orange, icon: "flag",   summaryUnit: "" },
                    ];
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
                    // 入力済みチップ：すでに通過したステップで値が入っているもの
                    const filledChips = STEPS.slice(0, stepIdx).filter(s => s.id !== "result" && isFilled(s.id));

                    // テンキー対象外: rounds（プリセット）、pushAmount（カテゴリ）、result（アクション）
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

                    // 先頭ステップ（プッシュ補正額）で「キャンセル」: 入力済みデータがあれば確認してから閉じる
                    const hasHitInput = (D.pushAmount || 0) > 0 || D.rotCount !== "" || D.trayBalls !== "" || rndN > 0;
                    const onCancel = () => {
                        if (hasHitInput && !window.confirm("入力中のデータを破棄して閉じますか？")) return;
                        onClose();
                    };

                    // 「戻る」: 1つ前のステップへ。入力済み hitWizardData は保持したまま戻る
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
                        const ok = handleStartChain(rotN);
                        if (!ok) return;
                        // チェーン作成成功 → 確変として hit を追加（既存 handleWizardComplete を再利用）
                        handleWizardComplete("確変");
                    };

                    // 単発終了：時短回数/最終持ち玉モーダルを開く
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
                        const ok = handleStartChain(rotN);
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

                    // 入力済みサマリー（折りたたみ用）
                    const summaryRows = [
                        { label: "プッシュ補正額", value: (D.pushAmount || 0) > 0 ? `+${(D.pushAmount).toLocaleString()}` : "0", unit: "円" },
                        { label: "当たった回転数", value: rotN > 0 ? f(rotN) : "--",   unit: "回転" },
                        { label: "開始前の玉数",   value: trayN > 0 ? f(trayN) : "--", unit: "玉" },
                        { label: "ラウンド数",     value: roundLabel || "--", unit: multN > 1 ? `（合計${rndN * multN}R）` : "" },
                    ];

                    // プッシュ補正額のプリセット
                    const pushPresets = [
                        { label: "なし",   onClick: () => updField("pushAmount", 0),     active: !D.pushAmount },
                        { label: "+500",   onClick: () => updField("pushAmount", 500),   active: D.pushAmount === 500 },
                        { label: "+1000",  onClick: () => updField("pushAmount", 1000),  active: D.pushAmount === 1000 },
                        { label: "クリア", onClick: () => updField("pushAmount", 0),     active: false },
                    ];

                    // ラウンド数のプリセット（状態別の詳細振分を含む）
                    const roundPresets = machineRounds.slice(0, 6).map(({ rounds: r, mult: m }) => ({
                        label: m > 1 ? `${r}R×${m}` : `${r}R`,
                        active: rndN === r && multN === m,
                        onClick: () => setHitWizardData(d => ({ ...d, rounds: r, mult: m })),
                    }));
                    const roundLoop = getMachineRoundLoop(selectedMachine, "heso", rndN);

                    // 現在ステップの表示テキスト（中央の大きな値）
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
                            {/* ヘッダー（固定）: × 閉じる / タイトル / 履歴 */}
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

            {/* ================================================================
                画面 B — 連チャン追加入力（仕様書 docs/input-flow-design.md §3.1 準拠）
                旧 chainWizard Step 0-7 を 1 画面 4 項目 + 次状態選択 に刷新。
                Step 8 (画面 C = 最終実測持ち玉入力) は polished されたサブビューとして残す。
            ================================================================ */}
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
                    const onCancel = () => {
                        if (hasChainInput && !window.confirm("入力中のデータを破棄して閉じますか？")) return;
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

/* ================================================================
   HistoryTab — 大当たり履歴（チェーンベース連チャン記録）
================================================================ */
export function HistoryTab({ jpLog, delJPLast, S, ev }) {

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
        finalBallsAfterJitan: "", // 時短終了後出玉（単発終了用）
        finalRealBalls: "" // 最終実測持ち玉（ラッシュ終了用）
    });
    const [chainWizardInitialFinalBalls, setChainWizardInitialFinalBalls] = useState(0);

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
    const _machineRounds = getMachineRounds();

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
    const machineRushRounds = getMachineRushRounds();

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
        setChainWizardData({ rounds: 0, mult: 1, displayBalls: "", lastOutBalls: "", nextTimingBalls: "", elecSapoRot: "", hitType: "", jitanSpins: "", finalBallsAfterJitan: "", finalRealBalls: "" });
        setChainWizardStep(0);
        setChainWizardFirstKey(true);
        setChainWizardInitialFinalBalls(0);
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
    const _addHitToChain = () => {
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

    const handleChainWizardComplete = (isFinal = false, finalRealOpts = null) => {
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
                if (finalRealOpts) {
                    chain.finalRealBalls = finalRealOpts.value;
                    chain.finalRealBallsEdited = finalRealOpts.edited;
                }
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
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
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
            </div>

            {/* 連チャン追加ウィザードモーダル */}
            {chainWizardOpen && ReactDOM.createPortal(
                <div style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "var(--bg)",
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
                        background: "var(--bg)"
                    }}>
                        <button className="b" onClick={() => setChainWizardOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{lastChain ? `${lastChain.hits.length + 1}連目` : "連チャン"} 入力</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "var(--bg)" }}>
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

                        {/* Step 1: 大当り直前の出玉 */}
                        {chainWizardStep === 1 && (() => {
                            const prevEndBalls = getPrevEndBalls();
                            const current = Number(chainWizardData.lastOutBalls) || 0;
                            const diff = current - prevEndBalls;
                            const isWarning = prevEndBalls > 0 && Math.abs(diff) > 500;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 8 }}>大当り直前の出玉</div>
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

                        {/* Step 2: 電サポ回転数 */}
                        {chainWizardStep === 2 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, marginBottom: 16 }}>電サポ回転数</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.elecSapoRot || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>回転</span>
                                </div>
                            </div>
                        )}

                        {/* Step 3: 液晶出玉数 */}
                        {chainWizardStep === 3 && (
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>液晶出玉数{chainWizardData.mult > 1 ? "（1連分）" : ""}</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>{chainWizardData.rounds}R{chainWizardData.mult > 1 ? `×${chainWizardData.mult}` : ""}選択中</div>
                                <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                    {chainWizardData.displayBalls || "0"}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                </div>
                            </div>
                        )}

                        {/* Step 4: ラウンド終了時の出玉 */}
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
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.yellow, marginBottom: 8 }}>ラウンド終了時の出玉</div>
                                    {prevBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.teal, marginBottom: 12 }}>大当り直前: {f(prevBalls)}玉</div>
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
                                    <button className="b" onClick={() => {
                                        const lc = jpLog[jpLog.length - 1];
                                        const existingTotal = (lc ? lc.trayBalls || 0 : 0) +
                                            (lc ? lc.hits : []).reduce((s, h) => s + (h.displayBalls || 0) + (h.sapoChange || 0), 0);
                                        const lastOut = Number(chainWizardData.lastOutBalls) || 0;
                                        const nextTiming = Number(chainWizardData.nextTimingBalls) || 0;
                                        const estimated = existingTotal + (nextTiming - lastOut);
                                        setChainWizardInitialFinalBalls(estimated);
                                        setChainWizardData(d => ({ ...d, finalRealBalls: String(estimated) }));
                                        setChainWizardStep(8);
                                        setChainWizardFirstKey(true);
                                    }} style={{ width: 100, height: 80, borderRadius: 16, fontWeight: 800, fontSize: 16, background: "#ea580c", border: "none", color: "#fff", boxShadow: "none" }}>
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

                        {/* Step 8: 最終実測持ち玉入力 */}
                        {chainWizardStep === 8 && (() => {
                            const current = Number(chainWizardData.finalRealBalls) || 0;
                            return (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: C.orange, marginBottom: 8 }}>最終持ち玉（実測）</div>
                                    <div style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>実際の持ち玉（カード＋上皿）を計測してください</div>
                                    {chainWizardInitialFinalBalls > 0 && (
                                        <div style={{ fontSize: 11, color: C.yellow, marginBottom: 12 }}>計算値: {f(chainWizardInitialFinalBalls)}玉（自動プリセット済み）</div>
                                    )}
                                    <div style={{ fontSize: 52, fontWeight: 800, color: C.text, fontFamily: mono }}>
                                        {f(current)}<span style={{ fontSize: 20, color: C.sub, marginLeft: 4 }}>玉</span>
                                    </div>
                                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                                        {[-50, -10, +10, +50].map(delta => (
                                            <button key={delta} className="b" onClick={() => { const cur = Number(chainWizardData.finalRealBalls) || 0; setChainWizardData(d => ({ ...d, finalRealBalls: String(Math.max(0, cur + delta)) })); }}
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
                            background: "var(--bg)",
                            borderTop: `1px solid ${C.border}`,
                            flexShrink: 0
                        }}>
                            {/* 戻る/次へボタン */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                                <button className="b" onClick={() => {
                                    if (chainWizardStep === 1) setChainWizardStep(0);
                                    else if (chainWizardStep === 6) setChainWizardStep(5);
                                    else if (chainWizardStep === 8) setChainWizardStep(5);
                                    else setChainWizardStep(s => s - 1);
                                    setChainWizardFirstKey(true);
                                }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "var(--surface-hi)", border: "none", color: C.text }}>
                                    戻る
                                </button>
                                {chainWizardStep === 7 ? (
                                    <button className="b" onClick={handleChainWizardSingleEnd} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>
                                        記録完了
                                    </button>
                                ) : chainWizardStep === 8 ? (
                                    <button className="b" onClick={() => {
                                        const value = Number(chainWizardData.finalRealBalls) || 0;
                                        const edited = value !== chainWizardInitialFinalBalls;
                                        handleChainWizardComplete(true, { value, edited });
                                    }} style={{ padding: "14px 0", borderRadius: 10, fontWeight: 700, fontSize: 15, background: "#16a34a", border: "none", color: "#fff" }}>
                                        結果を保存
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
                                        const field = chainWizardStep === 1 ? "lastOutBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "displayBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : chainWizardStep === 8 ? "finalRealBalls" : "finalBallsAfterJitan";
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
                                    const field = chainWizardStep === 1 ? "lastOutBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "displayBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : chainWizardStep === 8 ? "finalRealBalls" : "finalBallsAfterJitan";
                                    setChainWizardData(d => ({ ...d, [field]: "" }));
                                    setChainWizardFirstKey(false);
                                }} style={{ padding: "18px 0", borderRadius: 12, fontWeight: 700, fontSize: 15, background: "rgba(239,68,68,0.25)", border: "none", color: C.red, minHeight: 56 }}>
                                    消去
                                </button>
                                <button className="b" onClick={() => {
                                    const field = chainWizardStep === 1 ? "lastOutBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "displayBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : chainWizardStep === 8 ? "finalRealBalls" : "finalBallsAfterJitan";
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
                                    const field = chainWizardStep === 1 ? "lastOutBalls" : chainWizardStep === 2 ? "elecSapoRot" : chainWizardStep === 3 ? "displayBalls" : chainWizardStep === 4 ? "nextTimingBalls" : chainWizardStep === 6 ? "jitanSpins" : chainWizardStep === 8 ? "finalRealBalls" : "finalBallsAfterJitan";
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
                    background: "var(--bg)",
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
                        background: "var(--bg)"
                    }}>
                        <button className="b" onClick={() => setDirectSingleEndOpen(false)} style={{ background: "transparent", border: "none", color: C.red, fontSize: 14, fontWeight: 600, padding: 8 }}>キャンセル</button>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>単発終了</span>
                        <div style={{ width: 70 }} />
                    </div>

                    {/* コンテンツエリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 20px", background: "var(--bg)" }}>
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
                        background: "var(--bg)",
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
                                消去
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
export function CalendarTab({ S, onReset, initialDate = null, focusMode = false, initialArchiveId = null, onDone = null, onOpenMachine = null }) {
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
    const [editMachineNum, setEditMachineNum] = useState("");
    const [editInvest, setEditInvest] = useState("");
    const [editRecovery, setEditRecovery] = useState("");
    const [editChodama, setEditChodama] = useState(""); // 貯玉残高（店舗の現在残高を編集）
    const [editPlayHours, setEditPlayHours] = useState(""); // 遊技時間（時間・手入力。実践記録が無い記録の稼働時間/時給に使用）
    const [showEditStoreDD, setShowEditStoreDD] = useState(false);
    // Swipe delete state
    const [swipedId, setSwipedId] = useState(null);
    const swipeRef = useRef({ startX: 0, id: null });
    // focusMode: この日の記録カード（機種情報）タップで回転数データへ自動スクロールするための参照先
    const rotHistoryRef = useRef(null);
    // ランキング・履歴の「すべて見る」展開状態
    const [showAllMachines, setShowAllMachines] = useState(false);
    const [showAllStores, setShowAllStores] = useState(false);
    const [showAllHistory, setShowAllHistory] = useState(false);
    // 過去日への手動記録追加フォーム（記録がない日を選択したときに使用）
    const [addFormOpen, setAddFormOpen] = useState(false);
    const [addStore, setAddStore] = useState("");
    const [addMachineName, setAddMachineName] = useState("");
    const [addMachineNum, setAddMachineNum] = useState("");
    const [addInvest, setAddInvest] = useState("");
    const [addRecovery, setAddRecovery] = useState("");
    const [addChodama, setAddChodama] = useState("");   // 貯玉残高（店舗へ登録・同期）
    const [addPlayHours, setAddPlayHours] = useState(""); // 遊技時間（時間・手入力）
    const [showAddStoreDD, setShowAddStoreDD] = useState(false);

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
                ev += (a.stats?.effectiveWorkAmount ?? a.stats?.workAmount ?? 0);
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
            ev += Number(a.stats?.effectiveWorkAmount ?? a.stats?.workAmount) || 0;
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
            map[d].ev += Number(a.stats?.effectiveWorkAmount ?? a.stats?.workAmount) || 0;
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

    const saveManualArchive = () => {
        const inv = Math.max(0, Math.round(Number(addInvest) || 0));
        const rec = Math.max(0, Math.round(Number(addRecovery) || 0));
        if (!selectedDate || (inv <= 0 && rec <= 0)) return;
        const storeName = (addStore || "").trim();
        const storeObj = storeList.find(st => typeof st === "object" && st.name === storeName);
        // 貯玉残高を店舗へ登録・同期し、反映先の店舗 id を記録に紐付ける。
        const resolvedStoreId = syncChodamaToStore({
            storeId: storeObj?.id ?? null, storeName, chodamaStr: addChodama,
        });
        S.setArchives(prev => [...prev, {
            id: Date.now(),
            date: selectedDate,
            time: "",
            storeName,
            storeId: resolvedStoreId,
            machineNum: (addMachineNum || "").trim(),
            machineName: (addMachineName || "").trim(),
            investYen: inv,
            recoveryYen: rec,
            playMinutes: playHoursToMinutes(addPlayHours), // 遊技時間（分）。稼働時間/時給の集計に使用
            settings: {},
            stats: {},
            rotRows: [],
            jpLog: [],
            sesLog: [],
            totalTrayBalls: 0,
            startRot: 0,
            isManual: true,
        }]);
        setAddFormOpen(false);
        setShowAddStoreDD(false);
        setAddStore("");
        setAddMachineName("");
        setAddMachineNum("");
        setAddInvest("");
        setAddRecovery("");
        setAddChodama("");
        setAddPlayHours("");
    };

    // ── 記録編集の保存（ArchiveDetail と focusMode 編集シートの共通処理） ──
    //   旧 ArchiveDetail 内 updateArchive を CalendarTab スコープへ持ち上げたもの（処理内容は不変）
    const applyArchiveEdits = (a, doReset) => {
        // 貯玉残高を店舗へ登録・同期（未登録の店舗名なら新規登録）。反映先の店舗 id を記録へ紐付ける。
        const resolvedStoreId = syncChodamaToStore({
            storeId: a.storeId ?? null,
            storeName: editStore || a.storeName,
            chodamaStr: editChodama,
        });
        S.setArchives(prev => prev.map(ar => ar.id !== a.id ? ar : {
            ...ar,
            storeName: editStore,
            storeId: resolvedStoreId,
            machineNum: editMachineNum,
            investYen: Number(editInvest) || 0,
            recoveryYen: Number(editRecovery) || 0,
            playMinutes: playHoursToMinutes(editPlayHours), // 遊技時間（分）。稼働時間/時給に使用
        }));
        if (doReset) onReset();
        // 保存後は詳細ビューを閉じてカレンダー一覧に戻す（視覚的フィードバック）
        setSelectedArchiveId(null);
        setExpandedRot(null);
        setDelConfirm(null);
    };

    // ── Inline summary card for an archive entry (reference app style) ──
    const SummaryCard = ({ a, onClick }) => {
        const st = a.stats || {};
        const invest = a.investYen || 0;
        const recovery = a.recoveryYen || 0;
        // 貯玉消費（確定時に保存済み）: 円換算額と消費玉数。実収支では投資と同じくコストとして差し引く
        //   （analysisSelectors の getActualPL + getChodamaPL と同一の式。保存構造・logic.js は不変）
        const chodamaYen = a.chodamaYen || 0;
        const chodamaConsumedBalls = a.chodamaNetBalls < 0 ? -a.chodamaNetBalls : 0;
        // 実収支 =（回収 − 投資）− 貯玉消費分。現金 or 貯玉いずれかの実データがある時のみ確定
        const hasActual = invest > 0 || recovery > 0 || chodamaYen > 0;
        const realPL = (recovery - invest) - chodamaYen;
        const workAmount = st.effectiveWorkAmount ?? st.workAmount ?? 0;
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
                        <span style={{ fontSize: 11, color: C.yellow, fontWeight: 700 }}>期待値（理論値）</span>
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
                    setEditStore(String(target.storeName || ""));
                    setEditMachineNum(String(target.machineNum || ""));
                    // 投資額は実践記録（回転数データ）から算出した値を初期表示する。
                    // makeArchive が保存した stats.rawInvest = deriveFromRows の現金投資累計。
                    // 台移動で持ち込んだ持ち玉コスト（carriedInYen）は投資の内数なので加算する。
                    // 算出値が無い古いアーカイブは従来の保存値 investYen をフォールバック表示。
                    const carriedIn = Math.round(target.carriedInYen || 0);
                    const derivedInvest = Math.round(target.stats?.rawInvest || 0) + carriedIn;
                    setEditInvest(derivedInvest > 0 ? derivedInvest : (target.investYen || ""));
                    setEditRecovery(target.recoveryYen || "");
                    // 貯玉残高はその店舗の現在残高を初期表示（店舗が特定できる場合のみ）
                    const tStore = (S.stores || []).find(st => typeof st === "object" &&
                        (st.id === target.storeId || st.name === target.storeName));
                    setEditChodama(tStore ? String(Math.round(Number(tStore.chodama) || 0)) : "");
                    // 遊技時間: 保存済み playMinutes（分）を時間表記で初期表示（1桁小数、整数はそのまま）
                    const pm = Number(target.playMinutes) || 0;
                    setEditPlayHours(pm > 0 ? String(Math.round((pm / 60) * 10) / 10) : "");
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
    const renderRotHistory = (a) => (a.rotRows && a.rotRows.length > 0) ? (
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
        const yenFmt = (v) => `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("ja-JP")}`;
        const plCls = (v) => v >= 0 ? "text-[var(--at-pos)]" : "text-[var(--at-neg)]";
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
        return (
            <div className="mx-auto w-full max-w-[430px] px-5 pt-3">
                {sel ? (
                    <div className="space-y-3">
                        {/* この日の記録カード（複数ある日はリスト。タップで編集対象を切替） */}
                        {dateArchives.map(ar => {
                            const inv = Number(ar.investYen) || 0;
                            const rec = Number(ar.recoveryYen) || 0;
                            const cy = Number(ar.chodamaYen) || 0;
                            const hasActual = inv > 0 || rec > 0 || cy > 0;
                            const pl = (rec - inv) - cy;
                            const arSt = ar.stats || {};
                            const ev = Number(arSt.effectiveWorkAmount ?? arSt.workAmount) || 0;
                            const denom = ar.settings?.synthDenom;
                            const name = ar.machineName && ar.machineName !== `1/${denom}` ? ar.machineName : (ar.machineName || `1/${denom || "—"}`);
                            // 分析（MACHINE REPORT）へ飛べる実機種名のみを対象にする（合成分母フォールバックや未入力は除外）。
                            const realMachine = ar.machineName && ar.machineName !== `1/${denom}` ? ar.machineName : "";
                            const canAnalyze = !!(onOpenMachine && realMachine);
                            const active = ar.id === sel.id;
                            return (
                                <div key={ar.id}
                                    className={`${cardCls} flex min-h-[56px] w-full items-stretch overflow-hidden ${active ? "border-[var(--at-cyan)] shadow-[0_0_0_1px_var(--at-cyan)]" : ""}`}>
                                    {/* 主動作: タップで編集対象を選択し、下部の回転数データまで自動スクロール */}
                                    <button type="button" onClick={() => {
                                        setSelectedArchiveId(ar.id);
                                        setDelConfirm(null);
                                        requestAnimationFrame(() => {
                                            rotHistoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                        });
                                    }}
                                        className="flex min-w-0 flex-1 items-center gap-3 p-3.5 text-left transition active:opacity-60">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[14px] font-black text-[var(--at-strong)]">{name}</div>
                                            <div className="mt-0.5 truncate text-[10.5px] font-bold text-[var(--at-mut)]">
                                                {[ar.storeName, ar.machineNum ? `${ar.machineNum}番台` : "", ev !== 0 ? `期待値 ${yenFmt(ev)}円` : ""].filter(Boolean).join(" / ") || "詳細未入力"}
                                            </div>
                                        </div>
                                        <div className={`shrink-0 font-mono text-[16px] font-black tabular-nums ${hasActual ? plCls(pl) : "text-[var(--at-faint)]"}`}>
                                            {hasActual ? `${yenFmt(pl)}円` : "—"}
                                        </div>
                                    </button>
                                    {/* この機種の分析（MACHINE REPORT）へ直行。分析画面までの動線を短縮する導線 */}
                                    {canAnalyze && (
                                        <button type="button" onClick={() => onOpenMachine(realMachine)} aria-label="この機種の分析を見る"
                                            className="flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-[var(--at-ln-md)] text-[var(--at-cyan)] transition active:opacity-60">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" /><rect x="13" y="7" width="3" height="10" /></svg>
                                            <span className="text-[8px] font-black leading-none">分析</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {/* 編集フォーム（項目は既存の記録エディタと同一） */}
                        <div className={`${cardCls} p-4`}>
                            <div className="flex items-center gap-2 text-[12px] font-black text-[var(--at-subtle-hi)]">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--at-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                                記録の編集
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
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
                                    <div className={labelCls}>台番号</div>
                                    <input {...numProps} value={editMachineNum} onChange={e => setEditMachineNum(e.target.value)} placeholder="台番号" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>投資額（円）</div>
                                    <input {...numProps} value={editInvest} onChange={e => setEditInvest(e.target.value)} placeholder="10000" className={inputCls} />
                                    {Math.round(sel.carriedInYen || 0) > 0 ? (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">引き継ぎ玉 ¥{Math.round(sel.carriedInYen || 0).toLocaleString()} を含む</div>
                                    ) : Math.round(sel.stats?.rawInvest || 0) > 0 && (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">実践記録から自動反映</div>
                                    )}
                                </div>
                                <div>
                                    <div className={labelCls}>回収額（円）</div>
                                    <input {...numProps} value={editRecovery} onChange={e => setEditRecovery(e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                                <div>
                                    <div className={labelCls}>遊技時間（時間）</div>
                                    <input {...decProps} value={editPlayHours} onChange={e => setEditPlayHours(e.target.value)} placeholder="例 3.5" className={inputCls} />
                                    {(Number(sel.stats?.netRot) || 0) > 0 && (Number(sel.settings?.rotPerHour) || 0) > 0 && (
                                        <div className="mt-1 text-[9px] text-[var(--at-mut)]">実践記録の回転数から自動算出中</div>
                                    )}
                                </div>
                                <div>
                                    <div className={labelCls}>貯玉残高（玉）</div>
                                    <input {...numProps} value={editChodama} onChange={e => setEditChodama(e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                            </div>
                            <div className="mt-2 text-[9px] text-[var(--at-mut)]">
                                貯玉残高は{selHasChodamaStore ? `「${sel.storeName || ""}」の現在残高に同期されます` : "店舗の現在残高として登録されます（未登録の店舗は自動で追加）"}
                            </div>
                        </div>

                        {/* EV詳細（既存 ArchiveDetail と同じ値の表示） */}
                        {(sst.start1K > 0 || sst.ev1K || sst.wage) ? (
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

                        {/* 回転数データ・大当たり履歴（既存表示を残置）。上部の記録カードタップの自動スクロール先 */}
                        <div ref={rotHistoryRef}>
                            {renderRotHistory(sel)}
                            {renderJpHistory(sel)}
                        </div>

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
                            <div className="text-[12px] font-bold text-[var(--at-mut)]">この日のデータはありません</div>
                            <div className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--at-faint2)]">そのまま入力して、後からこの日の収支を記録できます</div>
                        </div>
                        <div className={`${cardCls} p-4`}>
                            <div className="flex items-center gap-2 text-[12px] font-black text-[var(--at-subtle-hi)]">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--at-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                                この日の記録を追加
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2.5">
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
                                <div>
                                    <div className={labelCls}>貯玉残高（玉）</div>
                                    <input {...numProps} value={addChodama} onChange={e => setAddChodama(e.target.value)} placeholder="0" className={inputCls} />
                                </div>
                            </div>
                            <div className="mt-2 text-[9px] text-[var(--at-mut)]">投資・回収のどちらかを入力すると追加できます。貯玉残高は店舗の現在残高として登録されます（未登録の店舗は自動で追加）。</div>
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
        // 期待値（仕事量）は上皿補正後を優先し、旧アーカイブは workAmount にフォールバック
        const stWork = st.effectiveWorkAmount ?? st.workAmount;
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
                                { label: "仕事量", val: stWork != null && stWork !== 0 ? f(Math.round(stWork)) : "—", col: stWork ? sc(stWork) : C.subHi },
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

                    {a.yutimeDecision && (
                        <Card style={{ padding: 14, marginBottom: 8, borderColor: `${C.blue}66` }}>
                            <SecLabel label="遊タイム判断（通常期待値とは別保存）" />
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
                                        開始 {a.yutimeDecision.currentLowSpins ?? "—"}回 ・ 想定1K {a.yutimeDecision.assumedStart1K ?? "—"}回/K ・ {a.yutimeDecision.spec?.source === "master" ? "自動機種データ" : "手動設定"}
                                    </div>
                                </>
                            ) : (
                                <div style={{ fontSize: 11, color: C.sub }}>期待出玉などの入力が不足していたため、開始時の条件だけを保存しています。</div>
                            )}
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
                        ev += Number(a.stats?.effectiveWorkAmount ?? a.stats?.workAmount) || 0;
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

/* ================================================================
   SettingsTab — 設定 + 機種検索（統合）
================================================================ */
export function SettingsTab({ s, onReset, onOpenStoreDetail }) {
    const [confirming, setConfirming] = useState(false);
    const [showMachineSearch, setShowMachineSearch] = useState(false);
    const [query, setQuery] = useState("");
    const [machineFilter, setMachineFilter] = useState("all");
    const [machineMakerFilter, setMachineMakerFilter] = useState("all");
    const [machineProbabilityFilter, setMachineProbabilityFilter] = useState("all");
    const [machineSort, setMachineSort] = useState("default");
    const [showMachineDetails, setShowMachineDetails] = useState(false);
    const [selected, setSelected] = useState(null);
    const [editingMachine, setEditingMachine] = useState(null);
    const [showMachineForm, setShowMachineForm] = useState(false);
    const [showEvidenceMachineUi, setShowEvidenceMachineUi] = useState(false);
    const allResults = searchMachines(query, s.customMachines);
    const makerOptions = useMemo(() => {
        const counts = new Map();
        searchMachines("", s.customMachines).forEach((machine) => {
            const maker = getMachineMakerKey(machine);
            counts.set(maker, (counts.get(maker) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([id, count]) => ({ id, label: id, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));
    }, [s.customMachines]);
    const quickMakerOptions = ["SANKYO", "京楽", "三洋", "サミー"]
        .map((id) => makerOptions.find((option) => option.id === id))
        .filter(Boolean);
    const visibleQuickMakerOptions = machineMakerFilter === "all"
        || quickMakerOptions.some((option) => option.id === machineMakerFilter)
        ? quickMakerOptions
        : [makerOptions.find((option) => option.id === machineMakerFilter), ...quickMakerOptions].filter(Boolean);
    const filteredResults = filterMachines(allResults, {
        type: machineFilter,
        maker: machineMakerFilter,
        probability: machineProbabilityFilter,
    });
    const results = sortMachines(filteredResults, machineSort);
    const activeMachineFilterCount = Number(machineMakerFilter !== "all")
        + Number(machineProbabilityFilter !== "all");
    const updateManualYutime = (key, value) => {
        const number = Math.max(0, Number(value) || 0);
        if (key === "triggerLowSpins") s.setCeilingRot(number);
        if (key === "expectedNetBalls") s.setYutimePayout(number);
        if (key === "triggerLowSpins" && number <= 0) {
            s.setYutimeSession(null);
            s.setYutimeDecision(null);
            return;
        }
        s.setYutimeSession((previous) => ({
            machineName: s.machineName || "",
            triggerLowSpins: Number(previous?.triggerLowSpins || s.ceilingRot) || 0,
            durationSpins: Number(previous?.durationSpins) || 0,
            expectedNetBalls: previous?.expectedNetBalls ?? (Number(s.yutimePayout) > 0 ? Number(s.yutimePayout) : null),
            assumedStart1K: Number(previous?.assumedStart1K || s.border) || 0,
            sourceUrl: previous?.sourceUrl || "",
            verifiedAt: previous?.verifiedAt || "",
            ...previous,
            [key]: key === "expectedNetBalls" && value === "" ? null : number,
            source: "manual",
        }));
        s.setYutimeDecision(null);
    };

    // 店舗管理用のstate
    const [showStoreSearch, setShowStoreSearch] = useState(false);
    const [storeQuery, setStoreQuery] = useState("");
    const [selectedStore, setSelectedStore] = useState(null);
    const [editingStore, setEditingStore] = useState(null);
    const [showStoreForm, setShowStoreForm] = useState(false);
    // 店舗詳細のインライン編集（会員カード残高 / 貯玉入出金）
    const [cardEditOpen, setCardEditOpen] = useState(false);
    const [cardEditNumber, setCardEditNumber] = useState("");
    const [cardEditChodama, setCardEditChodama] = useState(0);
    const [cardEditDeposit, setCardEditDeposit] = useState(0);
    const [chodamaMoveOpen, setChodamaMoveOpen] = useState(null); // "deposit" | "withdraw" | null
    const [chodamaMoveBalls, setChodamaMoveBalls] = useState("");
    const [chodamaMoveMemo, setChodamaMoveMemo] = useState("");
    const [showChodamaHistory, setShowChodamaHistory] = useState(false);

    // サブ画面ナビゲーション
    const [showAppearanceView, setShowAppearanceView] = useState(false);
    const [showNotificationView, setShowNotificationView] = useState(false);
    const [showAutoLockView, setShowAutoLockView] = useState(false);
    const [showGameSettingsView, setShowGameSettingsView] = useState(false);
    const [showMachineSpecView, setShowMachineSpecView] = useState(false);
    const [showChodamaView, setShowChodamaView] = useState(false);
    const [showChodamaDataView, setShowChodamaDataView] = useState(false);
    // 貯玉データ画面の入出金フォーム
    const [chodamaFormStoreId, setChodamaFormStoreId] = useState("");
    const [chodamaFormType, setChodamaFormType] = useState("deposit"); // deposit | withdraw | adjust
    const [chodamaFormBalls, setChodamaFormBalls] = useState("");
    const [chodamaFormDate, setChodamaFormDate] = useState(() => localDateStr());
    const [chodamaFormMemo, setChodamaFormMemo] = useState("");
    const [showBackupView, setShowBackupView] = useState(false);
    const [showAdvancedView, setShowAdvancedView] = useState(false);
    const [showHallMapView, setShowHallMapView] = useState(false);

    // 削除確認
    const [confirmingDeleteMachine, setConfirmingDeleteMachine] = useState(null);
    const [confirmingDeleteStore, setConfirmingDeleteStore] = useState(null);

    // セキュリ: PIN設定UI
    const [pinSetStep, setPinSetStep] = useState("idle"); // idle | verify-disable | verify-change | enter | confirm
    const [pinCurrent, setPinCurrent] = useState("");
    const [pinDraft, setPinDraft] = useState("");
    const [pinConfirm, setPinConfirm] = useState("");
    const [pinSetError, setPinSetError] = useState(false);

    const validatePositive = (raw) => validateSettingNumber(raw);
    const validateNonNegative = (raw) => validateSettingNumber(raw, { allowZero: true });
    const validateFinite = (raw) => validateSettingNumber(raw, { allowZero: true, allowNegative: true });

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

    // 会員カードの初期値（created=作成済み有無 / number=カード番号 / deposit=入金残高円）
    const emptyMemberCard = { created: false, number: "", deposit: 0 };
    const normalizeMemberCard = (mc) => ({ ...emptyMemberCard, ...(mc || {}) });

    // 店舗フォームの初期値（rentBalls/exRateはフォーム内では面値=玉/100円で扱う）
    // lastVisit=最終来店(表示用テキスト) / replayBalls=店内再プレイ玉数 / todaySettle=本日精算予定玉数（いずれも任意・既定0/空）
    const emptyStore = { name: "", address: "", closingTime: "", rentBalls: 25, exRate: 25, memo: "", chodama: 0, chodamaMax: 0, lastVisit: "", replayBalls: 0, todaySettle: 0, memberCard: { ...emptyMemberCard } };
    const [storeFormData, setStoreFormData] = useState(emptyStore);
    const [storeFormErrors, setStoreFormErrors] = useState({});
    const validateStoreNumberField = (field, value) => validateSettingNumber(value, {
        allowZero: !["rentBalls", "exRate"].includes(field),
    });
    const setStoreNumberValue = (field, value) => {
        setStoreFormData((prev) => ({ ...prev, [field]: value }));
        setStoreFormErrors((prev) => ({ ...prev, [field]: "" }));
    };
    const validateStoreNumberOnBlur = (field) => {
        setStoreFormErrors((prev) => ({
            ...prev,
            [field]: validateStoreNumberField(field, storeFormData[field]),
        }));
    };
    const StoreFieldError = ({ field }) => storeFormErrors[field]
        ? <div role="alert" style={{ color: C.red, fontSize: 10, marginTop: 4 }}>{storeFormErrors[field]}</div>
        : null;

    // 店舗データの正規化（旧形式の文字列配列を新形式のオブジェクト配列に変換）+ chodama/会員カードフィールドの補完
    const normalizedStores = (s.stores || []).map(st =>
        typeof st === "string"
            ? { id: Date.now() + Math.random(), name: st, address: "", closingTime: "", rentBalls: 250, exRate: 250, memo: "", chodama: 0, chodamaMax: 0, lastVisit: "", replayBalls: 0, todaySettle: 0, memberCard: { ...emptyMemberCard } }
            : { ...st, closingTime: st.closingTime || "", chodama: st.chodama || 0, chodamaMax: st.chodamaMax || 0, lastVisit: st.lastVisit || "", replayBalls: st.replayBalls || 0, todaySettle: st.todaySettle || 0, memberCard: normalizeMemberCard(st.memberCard) }
    );

    // 島マップ管理（設定）用: 編集対象店舗 → 選択中の店舗 → 無ければ先頭。
    // 島配置は App.jsx の pt_hallMaps（s.hallMaps / s.setHallMaps）に一元保存する。
    const hallMapStore = normalizedStores.find((st) => st.id === s.selectedStoreId) || normalizedStores[0] || null;
    const hallMapStoreId = hallMapStore?.id ?? null;
    const hallMapIslands = getStoreIslands(s.hallMaps, hallMapStoreId);
    const handleChangeHallMapIslands = (nextIslands) => {
        if (hallMapStoreId == null || typeof s.setHallMaps !== "function") return;
        s.setHallMaps((prev) => setStoreIslands(prev, hallMapStoreId, nextIslands));
    };
    const handleChangeHallMapStore = (nextStoreId) => {
        if (typeof s.setSelectedStoreId === "function") s.setSelectedStoreId(nextStoreId);
    };

    // 店舗検索
    const storeResults = storeQuery.trim()
        ? normalizedStores.filter(st =>
            st.name.toLowerCase().includes(storeQuery.toLowerCase()) ||
            (st.address && st.address.toLowerCase().includes(storeQuery.toLowerCase()))
        )
        : normalizedStores;

    // 店舗フィールドの部分更新（一覧と選択中の詳細を同時に反映）
    const patchStore = (id, patch) => {
        const applyPatch = (st) => ({ ...st, ...(typeof patch === "function" ? patch(st) : patch) });
        s.setStores(prev => prev.map(st => (typeof st === "object" && st.id === id) ? applyPatch(st) : st));
        setSelectedStore(prev => (prev && prev.id === id) ? applyPatch(prev) : prev);
    };

    // 会員カードフィールドの部分更新
    const patchMemberCard = (store, patch) => {
        patchStore(store.id, (st) => ({ memberCard: { ...normalizeMemberCard(st.memberCard), ...patch } }));
    };

    // 貯玉の入出金（残高の真実源は store.chodama、履歴は chodamaLog に追記）
    // type: "deposit"(預入/+) | "withdraw"(引出/−) | "adjust"(調整/=)
    const adjustStoreChodama = (store, type, balls, memo = "") => {
        const amount = Math.max(0, Math.round(Number(balls) || 0));
        if (type !== "adjust" && amount <= 0) {
            showToast("玉数を入力してください", "warn");
            return false;
        }
        const before = store.chodama || 0;
        let after;
        if (type === "deposit") after = before + amount;
        else if (type === "withdraw") after = Math.max(0, before - amount);
        else after = amount; // adjust = 絶対値セット
        patchStore(store.id, { chodama: after });
        const entry = {
            id: Date.now() + Math.random(),
            date: localDateStr(),
            storeId: store.id,
            storeName: store.name,
            type,
            balls: amount, // 既存の貯玉データ画面と統一：balls は正の絶対値、符号は type から導出
            balanceBefore: before,
            balanceAfter: after,
            memo,
        };
        s.setChodamaLog(prev => [entry, ...prev]);
        return true;
    };

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

    // 機種スペック画面（MachineSpecWorkspace）の編集結果をカスタム機種として保存する。
    // 同名（または同id）のカスタムがあれば id を保ったまま置換、無ければ追記（重複を作らない）。
    // ビルトイン機種を編集した場合も「同名カスタム」を作ることで searchMachines が先頭で拾い上書きする。
    const persistMachineOverride = (rec) => {
        if (!rec || !rec.name) return;
        s.setCustomMachines(prev => {
            const i = prev.findIndex(m => m.id === rec.id || m.name === rec.name);
            if (i >= 0) {
                const next = [...prev];
                next[i] = { ...rec, id: prev[i].id };
                return next;
            }
            return [...prev, rec];
        });
        showToast(`「${rec.name}」のスペックを保存しました`);
    };

    // 店舗登録フォームを開く
    const openStoreForm = (store = null) => {
        setStoreFormErrors({});
        if (store) {
            setEditingStore(store);
            // 内部値（×10）をフォーム用の面値（÷10）に変換してセット
            setStoreFormData({
                ...emptyStore, ...store,
                rentBalls: Number(store.rentBalls || 250) / 10,
                exRate: Number(store.exRate || 250) / 10,
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
        const numericFields = ["rentBalls", "exRate", "chodama", "chodamaMax", "replayBalls", "todaySettle"];
        const errors = Object.fromEntries(numericFields.map((field) => [field, validateStoreNumberField(field, storeFormData[field])]));
        setStoreFormErrors(errors);
        if (Object.values(errors).some(Boolean)) {
            showToast("数値欄のエラーを修正してください", "error");
            return;
        }
        const storeData = {
            ...storeFormData,
            id: editingStore?.id || Date.now(),
            rentBalls: Math.round(Number(storeFormData.rentBalls) * 10),
            exRate: Math.round(Number(storeFormData.exRate) * 10),
            closingTime: (storeFormData.closingTime || "").trim(),
            chodama: Math.round(Number(storeFormData.chodama)),
            chodamaMax: Math.round(Number(storeFormData.chodamaMax)),
            lastVisit: (storeFormData.lastVisit || "").trim(),
            replayBalls: Math.round(Number(storeFormData.replayBalls)),
            todaySettle: Math.round(Number(storeFormData.todaySettle)),
            memberCard: normalizeMemberCard(storeFormData.memberCard),
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

    // 店舗の設定を反映（複数交換率対応: 玉単価 ballVal も exRate から同期）
    const applyStore = (store) => {
        s.setStoreName(store.name);
        if (store.rentBalls) s.setRentBalls(store.rentBalls);
        if (store.exRate) {
            s.setExRate(store.exRate);
            s.setBallVal(1000 / store.exRate);
        }
        setSelectedStore(null);
        setShowStoreSearch(false);
    };

    // === CSV機能 ===
    // 店舗データをCSVエクスポート
    const exportStoresCSV = () => {
        if (normalizedStores.length === 0) {
            showToast("エクスポートする店舗がありません", "warn");
            return;
        }
        // 日本語ヘッダー・表示値（貸玉/交換は100円あたり玉数の面値）でエクスポート
        const rows = normalizedStores.map(st => toCsvRow([
            st.name || "",
            st.address || "",
            Number(st.rentBalls || 250) / 10,
            Number(st.exRate || 250) / 10,
            st.memo || "",
            st.chodama || 0,
        ]));
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
        document.body.appendChild(a);
        a.click();
        a.remove();
        // \u5373\u6642 revoke \u306F iOS Safari \u3067\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u304C\u4E2D\u65AD\u3055\u308C\u308B\u3053\u3068\u304C\u3042\u308B\u305F\u3081\u9045\u5EF6\u3055\u305B\u308B\uFF08backupAllData \u3068\u540C\u3058\u6271\u3044\uFF09
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // CSVパース関数
    const parseCSV = (text) => {
        const rows = parseCsvRows(text);
        if (rows.length < 2) return [];
        const headers = rows[0].map(h => h.trim());
        return rows.slice(1).map(values => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (values[i] || "").trim(); });
            return obj;
        });
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
            const getRentBalls = d => isJp ? Math.round((parseFloat(d["貸玉"]) || 25) * 10) : (parseFloat(d["rentBalls"]) || 250);
            const getExRate   = d => isJp ? Math.round((parseFloat(d["交換"])  || 25) * 10) : (parseFloat(d["exRate"])    || 250);
            const getChodama  = d => isJp ? (parseInt(d["貯玉"]) || 0) : (parseInt(d["chodama"]) || 0);
            const candidates = data.filter(d => getName(d)).map((d, index) => ({
                id: Date.now() + index,
                name: getName(d) || "",
                address: (isJp ? d["住所"] : d["address"]) || "",
                rentBalls: getRentBalls(d),
                exRate: getExRate(d),
                memo: (isJp ? d["メモ"] : d["memo"]) || "",
                chodama: getChodama(d),
            }));
            const known = new Set(normalizedStores.map(st => `${String(st.name || "").trim().toLowerCase()}|${String(st.address || "").trim().toLowerCase()}`));
            const newStores = candidates.filter((store) => {
                const key = `${store.name.trim().toLowerCase()}|${store.address.trim().toLowerCase()}`;
                if (known.has(key)) return false;
                known.add(key);
                return true;
            });
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
        // 新形式（border1K のみ）の機種も border1K から等価スペックを逆算して反映する
        const spec = deriveSpecForMachine(m);
        if (spec.spec1R != null) s.setSpec1R(spec.spec1R);
        if (spec.specAvgRounds != null) s.setSpecAvgRounds(spec.specAvgRounds);
        if (spec.specSapo != null) s.setSpecSapo(spec.specSapo);
        if (m.name) s.setMachineName(m.name);
        s.setYutimeSession(createYutimeSessionFromMachine(m, { assumedStart1K: m.border1K || s.border }));
        s.setYutimeDecision(null);
        setSelected(null);
        setShowMachineSearch(false);
    };

    // === 全データバックアップ/リストア ===
    const backupAllData = async () => {
        try {
            const data = await createBackup();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `pachi-tracker-backup-${localDateStr()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast("全データのバックアップを保存しました");
        } catch (error) {
            console.error("[backup] export failed:", error);
            showToast("バックアップの保存に失敗しました", "error");
        }
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
            const ok = window.confirm(
                "現在のデータをバックアップファイルの内容に置き換えます。\n\n復元を続けますか？"
            );
            if (!ok) return;
            const result = await restoreBackup(data);
            showToast(`${result.keyCount}項目のデータを復元しました。再読み込みします`);
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error("[backup] restore failed:", error);
            showToast(error?.message || "バックアップファイルの読み込みに失敗しました", "error");
        }
    };

    const archiveKey = (a) => `${a.date}|${a.storeName || ""}|${a.machineNum || ""}|${a.machineName || ""}|${a.investYen || 0}|${a.recoveryYen || 0}`;

    const countDuplicateArchives = () => {
        const keyCount = {};
        (s.archives || []).forEach(a => {
            const key = archiveKey(a);
            keyCount[key] = (keyCount[key] || 0) + 1;
        });
        return Object.values(keyCount).reduce((sum, c) => sum + (c > 1 ? c - 1 : 0), 0);
    };

    const exportArchiveCSV = () => {
        const archives = s.archives || [];
        if (archives.length === 0) {
            showToast("エクスポートする収支データがありません", "warn");
            return;
        }
        const headers = [
            "日付", "時刻", "店舗名", "台番号", "機種名",
            "投資", "回収", "収支", "確率分母", "貸玉数", "換金率",
            "時間回転数", "ボーダー", "玉単価", "仕事量", "期待値/K", "1Kスタート", "総回転",
            "遊タイム期待値", "遊タイム残り回転", "遊タイム到達率", "遊タイム平均投資", "遊タイム到達必要資金",
            "遊タイム開始カウント", "遊タイム想定1K", "遊タイム遊技方法", "遊タイム発動回転",
            "遊タイム回数", "遊タイム平均純増玉", "遊タイムデータ種別", "遊タイム根拠URL"
        ];
        const rows = archives.map(a => {
            const st = a.stats || {};
            const invest = a.investYen || 0;
            const recovery = a.recoveryYen || 0;
            const yd = a.yutimeDecision || {};
            const yr = yd.result || {};
            const ys = yd.spec || {};
            return toCsvRow([
                a.date || "",
                a.time || "",
                a.storeName || "",
                a.machineNum || "",
                a.machineName || "",
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
                Math.round(st.netRot || 0),
                yr.valid ? Math.round(yr.selectedEV || 0) : "",
                yr.valid ? Math.round(yr.remainingSpins || 0) : "",
                yr.valid ? Number(yr.reachProbability || 0).toFixed(8) : "",
                yr.valid ? Math.round(yr.selectedInvestment || 0) : "",
                yr.valid && yr.selectedArrivalInvestment != null ? Math.ceil(yr.selectedArrivalInvestment) : "",
                yd.currentLowSpins ?? "",
                yd.assumedStart1K ?? "",
                yd.playMode || "",
                ys.triggerLowSpins ?? "",
                ys.durationSpins ?? "",
                ys.expectedNetBalls ?? "",
                ys.source || "",
                String(ys.sourceUrl || "")
            ]);
        });
        const csv = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        downloadCSV(csv.replace(/^\uFEFF/, ""), `pachi-tracker-${localDateStr()}.csv`);
    };

    const importArchiveCSV = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                let text = ev.target?.result;
                if (typeof text !== "string") return;
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                const rows = parseCsvRows(text);
                if (rows.length < 2) {
                    showToast("有効なCSVデータがありません", "error");
                    return;
                }
                const headers = rows[0].map(h => h.trim());
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
                for (let i = 1; i < rows.length; i++) {
                    const cols = rows[i].map(c => c.trim());
                    if (cols.length < 3) continue;
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
                    const yutimeTrigger = parseFloat(getCol(cols, ["遊タイム発動回転"], "0")) || 0;
                    const yutimeEvText = getCol(cols, ["遊タイム期待値"], "");
                    const hasYutime = yutimeTrigger > 0 || yutimeEvText !== "";
                    const yutimeDecision = hasYutime ? {
                        version: 2,
                        createdAt: `${date}T${time || "00:00"}:00`,
                        machineName: getCol(cols, ["機種名", "機種"]).replace(/，/g, ","),
                        currentLowSpins: parseFloat(getCol(cols, ["遊タイム開始カウント"], "0")) || 0,
                        assumedStart1K: parseFloat(getCol(cols, ["遊タイム想定1K"], "0")) || 0,
                        rateSource: "assumed",
                        playMode: getCol(cols, ["遊タイム遊技方法"], "cash") || "cash",
                        spec: {
                            triggerLowSpins: yutimeTrigger,
                            durationSpins: parseFloat(getCol(cols, ["遊タイム回数"], "0")) || 0,
                            expectedNetBalls: getCol(cols, ["遊タイム平均純増玉"], "") === "" ? null : parseFloat(getCol(cols, ["遊タイム平均純増玉"], "0")),
                            source: getCol(cols, ["遊タイムデータ種別"], "manual") || "manual",
                            sourceUrl: getCol(cols, ["遊タイム根拠URL"], "").replace(/%2C/g, ","),
                        },
                        result: yutimeEvText === "" ? { valid: false, status: "missing-input" } : {
                            valid: true,
                            selectedEV: parseFloat(yutimeEvText) || 0,
                            remainingSpins: parseFloat(getCol(cols, ["遊タイム残り回転"], "0")) || 0,
                            reachProbability: parseFloat(getCol(cols, ["遊タイム到達率"], "0")) || 0,
                            selectedInvestment: parseFloat(getCol(cols, ["遊タイム平均投資"], "0")) || 0,
                            selectedArrivalInvestment: getCol(cols, ["遊タイム到達必要資金"], "") === "" ? null : (parseFloat(getCol(cols, ["遊タイム到達必要資金"], "0")) || 0),
                        },
                    } : null;

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
                        yutimeDecision,
                    });
                }

                if (newArchives.length === 0) {
                    showToast("インポートできる収支データがありませんでした", "error");
                    return;
                }

                const importedArchives = newArchives.map(a => ({ ...a, isImported: true }));
                const previous = Array.isArray(s.archives) ? s.archives : [];
                const nonImported = previous.filter(a => !a.isImported);
                const existingKeys = new Set(nonImported.map(archiveKey));
                const seenKeys = new Set();
                const dedupedImported = importedArchives.filter(a => {
                    const key = archiveKey(a);
                    if (existingKeys.has(key) || seenKeys.has(key)) return false;
                    seenKeys.add(key);
                    return true;
                });
                s.setArchives([...nonImported, ...dedupedImported]);
                showToast(`${dedupedImported.length}件の収支データをインポートしました`);
            } catch (err) {
                showToast(`CSVの読み込みに失敗しました: ${err.message}`, "error");
            }
        };
        reader.readAsText(file, "UTF-8");
        e.target.value = "";
    };

    const deleteDuplicateArchives = () => {
        const duplicateCount = countDuplicateArchives();
        if (duplicateCount <= 0) return;
        if (!window.confirm(`${duplicateCount}件の重複データを削除しますか？\n（各データは1件だけ残ります）`)) return;
        s.setArchives(prev => {
            const seen = new Set();
            return prev.filter(a => {
                const key = archiveKey(a);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        });
        showToast("重複データを削除しました");
    };

    const deleteImportedArchives = () => {
        if (!window.confirm("CSVでインポートしたデータをすべて削除しますか？\n（手動で記録したデータは残ります）")) return;
        s.setArchives(prev => prev.filter(a => !a.isImported));
        showToast("インポートデータを削除しました");
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
    const allMachinesForBorder = getEffectiveMachineList(s.customMachines);
    const matchedMachine = s.machineName
        ? allMachinesForBorder.find(m => m.name === s.machineName)
        : null;
    const dbBorderForKey = matchedMachine && exRateKey && matchedMachine.border?.[exRateKey];
    const calcBorder = dbBorderForKey != null ? Number(dbBorderForKey) : formulaBorder;
    const borderSource = dbBorderForKey != null ? "db" : "formula";

    // Store detail view
    if (selectedStore) {
        const st = selectedStore;
        const faceRent = Number(st.rentBalls || 250) / 10;
        const faceEx = Number(st.exRate || 250) / 10;
        const yenPerBall = faceRent > 0 ? 100 / faceRent : 0;        // 1玉あたりの貸玉単価（円）
        const rentLabel = `${Number.isInteger(yenPerBall) ? yenPerBall : yenPerBall.toFixed(1)}円パチンコ`;
        const exYenPerBall = faceEx > 0 ? 100 / faceEx : 0;          // 1玉あたりの換金額（円）
        const chodamaBalls = st.chodama || 0;
        const chodamaYen = Math.round(chodamaBalls * exYenPerBall);
        const mc = normalizeMemberCard(st.memberCard);
        const maxBalls = st.chodamaMax || 0;
        const usagePct = maxBalls > 0 ? Math.min(100, Math.round((chodamaBalls / maxBalls) * 100)) : 0;
        const replayBalls = st.replayBalls || 0;
        const todaySettle = st.todaySettle || 0;
        const cardHistory = (s.chodamaLog || []).filter(l => l.storeId === st.id);
        // Bloomberg風スタイル（KPIタイル／情報ボックス／カード枠）
        const tile = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 6px", textAlign: "center" };
        const tileLabel = { fontSize: 10, color: C.sub, marginBottom: 6, fontWeight: 600 };
        const tileBig = { fontSize: 16, fontWeight: 800, fontFamily: mono };
        const tileSub = { fontSize: 9, color: C.sub, marginTop: 4 };
        const infoBox = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" };
        const infoLabel = { fontSize: 9, color: C.sub, marginBottom: 4, fontWeight: 600 };
        const cardSt = { padding: 18, marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 18 };
        const secTitle = { fontSize: 11, fontWeight: 800, color: C.subHi, letterSpacing: 0.8 };
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                {/* ヘッダー操作（戻る / 店舗を登録） */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <button className="b" onClick={() => { setSelectedStore(null); setCardEditOpen(false); setChodamaMoveOpen(null); setShowChodamaHistory(false); }} style={{
                        background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                        color: C.text, fontSize: 12, padding: "9px 14px", minHeight: 44, fontFamily: font, fontWeight: 600
                    }}>← 一覧に戻る</button>
                    <div style={{ flex: 1 }} />
                    <button className="b" onClick={() => { setSelectedStore(null); openStoreForm(); }} style={{
                        background: C.blue, border: "none", borderRadius: 10,
                        color: "#fff", fontSize: 12, padding: "9px 16px", minHeight: 44, fontFamily: font, fontWeight: 800,
                        boxShadow: `0 4px 14px ${C.blue}44`,
                    }}>＋ 店舗を登録</button>
                </div>

                {/* ① 店舗サマリーカード */}
                <Card style={cardSt}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 14, background: `${C.blue}22`, border: `1px solid ${C.blue}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.blue }}>
                            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9 4.5 4h15L21 9" /><path d="M3 9v11h18V9" /><path d="M3 9c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3c0 2 1.5 3 3 3s3-1 3-3" /><path d="M9 20v-6h6v6" />
                            </svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{st.name}</div>
                            {st.address && <div style={{ fontSize: 11, color: C.sub, marginTop: 4 }}>{st.address}</div>}
                        </div>
                        <button className="b" onClick={() => { setSelectedStore(null); openStoreForm(st); }} style={{
                            flexShrink: 0, background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                            color: C.subHi, fontSize: 11, padding: "7px 14px", fontFamily: font, fontWeight: 700
                        }}>編集</button>
                    </div>

                    {/* KPI 3列: 交換率 / 貸玉 / 換金レート */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={tile}>
                            <div style={tileLabel}>交換率</div>
                            <div style={{ ...tileBig, color: C.teal }}>{exYenPerBall ? exYenPerBall.toFixed(2) : "—"}円</div>
                            <div style={tileSub}>{faceEx}玉交換</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>貸玉</div>
                            <div style={{ ...tileBig, color: C.yellow, fontSize: 13 }}>{rentLabel}</div>
                            <div style={tileSub}>{faceRent}玉/100円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>換金レート</div>
                            <div style={{ ...tileBig, color: C.green }}>{faceEx}玉</div>
                            <div style={tileSub}>= 100円</div>
                        </div>
                    </div>

                    {maxBalls > 0 && (
                        <div style={{ ...infoBox, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                                <span style={{ fontSize: 10, color: C.sub, fontWeight: 600 }}>貯玉上限</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(maxBalls)}玉</span>
                            </div>
                            <div style={{ height: 7, borderRadius: 999, background: C.borderHi, overflow: "hidden" }}>
                                <div style={{ width: `${usagePct}%`, height: "100%", background: usagePct >= 90 ? C.red : C.purple, borderRadius: 999 }} />
                            </div>
                            <div style={{ fontSize: 9, color: C.sub, marginTop: 6 }}>上限に対して {usagePct}%（貯玉残高 {f(chodamaBalls)}玉）</div>
                        </div>
                    )}

                    {/* 最終来店 / メモ */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={infoBox}>
                            <div style={infoLabel}>最終来店</div>
                            <div style={{ fontSize: 12, color: st.lastVisit ? C.text : C.sub, fontWeight: 700, fontFamily: mono }}>{st.lastVisit || "—"}</div>
                        </div>
                        <div style={infoBox}>
                            <div style={infoLabel}>メモ</div>
                            <div style={{ fontSize: 12, color: st.memo ? C.text : C.sub, lineHeight: 1.5 }}>{st.memo || "—"}</div>
                        </div>
                    </div>
                </Card>

                {/* ② 会員カード情報 */}
                <Card style={cardSt}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div style={secTitle}>会員カード情報</div>
                        <span style={{
                            fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 999,
                            background: mc.created ? `${C.green}22` : C.surfaceHi,
                            color: mc.created ? C.green : C.sub,
                            border: `1px solid ${mc.created ? `${C.green}55` : C.borderHi}`,
                        }}>{mc.created ? "● 作成済み" : "未作成"}</span>
                    </div>

                    {mc.created ? (
                        <>
                            <div style={{ ...infoBox, marginBottom: 10 }}>
                                <div style={infoLabel}>カード番号</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, fontFamily: mono, letterSpacing: 1.5 }}>{mc.number || "—— —— —— ——"}</div>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                <div style={tile}>
                                    <div style={tileLabel}>貯玉残高</div>
                                    <div style={{ ...tileBig, color: C.purple, fontSize: 15 }}>{f(chodamaBalls)}</div>
                                    <div style={tileSub}>玉</div>
                                </div>
                                <div style={tile}>
                                    <div style={tileLabel}>入金残高</div>
                                    <div style={{ ...tileBig, color: C.teal, fontSize: 15 }}>{f(mc.deposit)}</div>
                                    <div style={tileSub}>円</div>
                                </div>
                            </div>

                            {cardEditOpen ? (
                                <div style={{ background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: 12, marginBottom: 4 }}>
                                    <div style={{ fontSize: 11, color: C.subHi, fontWeight: 700, marginBottom: 10 }}>残高を更新</div>
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>カード番号</div>
                                        <input type="text" value={cardEditNumber} onChange={e => setCardEditNumber(e.target.value)}
                                            placeholder="1234 5678 9012 3456"
                                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 11px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }} />
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>貯玉残高(玉)</div>
                                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={cardEditChodama} onChange={e => setCardEditChodama(e.target.value)}
                                                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 8px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none", textAlign: "right" }} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>入金残高(円)</div>
                                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={cardEditDeposit} onChange={e => setCardEditDeposit(e.target.value)}
                                                style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "9px 8px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none", textAlign: "right" }} />
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <Btn label="保存" small onClick={() => {
                                            patchStore(st.id, (cur) => ({
                                                chodama: parseInt(cardEditChodama) || 0,
                                                memberCard: { ...normalizeMemberCard(cur.memberCard), number: cardEditNumber.trim(), deposit: parseInt(cardEditDeposit) || 0 },
                                            }));
                                            setCardEditOpen(false);
                                            showToast("会員カード残高を更新しました");
                                        }} bg={C.blue} fg="#fff" bd="none" />
                                        <Btn label="キャンセル" small onClick={() => setCardEditOpen(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Btn label="残高を更新" small onClick={() => {
                                        setCardEditNumber(mc.number || "");
                                        setCardEditChodama(chodamaBalls);
                                        setCardEditDeposit(mc.deposit || 0);
                                        setCardEditOpen(true);
                                    }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    <Btn label="履歴を見る" small onClick={() => setShowChodamaHistory(v => !v)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                    <Btn label="カード削除" small onClick={() => {
                                        patchMemberCard(st, { ...emptyMemberCard });
                                        showToast("会員カードを削除しました", "warn");
                                    }} bg="rgba(180,60,60,0.18)" fg={C.red} bd={`${C.red}40`} />
                                </div>
                            )}

                            {showChodamaHistory && (
                                <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                                    <div style={{ fontSize: 11, color: C.subHi, fontWeight: 700, marginBottom: 8 }}>貯玉 入出金履歴</div>
                                    {cardHistory.length === 0 ? (
                                        <div style={{ fontSize: 11, color: C.sub, textAlign: "center", padding: "12px 0" }}>履歴はありません</div>
                                    ) : cardHistory.slice(0, 20).map(l => (
                                        <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                                            <div>
                                                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, marginRight: 8, background: l.type === "deposit" ? `${C.green}22` : l.type === "withdraw" ? `${C.red}22` : `${C.yellow}22`, color: l.type === "deposit" ? C.green : l.type === "withdraw" ? C.red : C.yellow }}>
                                                    {l.type === "deposit" ? "預入" : l.type === "withdraw" ? "引出" : "調整"}
                                                </span>
                                                <span style={{ fontSize: 10, color: C.sub }}>{l.date}</span>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontSize: 13, fontWeight: 800, color: l.type === "deposit" ? C.green : l.type === "withdraw" ? C.red : C.subHi, fontFamily: mono }}>
                                                    {l.type === "adjust" ? "=" : l.type === "withdraw" ? "−" : "+"}{f(l.balls)}玉
                                                </div>
                                                <div style={{ fontSize: 9, color: C.sub }}>残 {f(l.balanceAfter)}玉</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>この店舗の会員カードはまだ作成されていません。作成すると貯玉残高・入金残高を管理できます。</div>
                            <Btn label="会員カードを作成" onClick={() => {
                                patchMemberCard(st, { created: true });
                                setCardEditNumber("");
                                setCardEditChodama(chodamaBalls);
                                setCardEditDeposit(0);
                                setCardEditOpen(true);
                                showToast("会員カードを作成しました");
                            }} bg={C.green} fg="#06120d" bd="none" />
                        </div>
                    )}
                </Card>

                {/* ③ 貯玉・精算管理 */}
                <Card style={cardSt}>
                    <div style={{ ...secTitle, marginBottom: 14 }}>貯玉・精算管理</div>

                    {/* KPI 3列: 店内貯玉 / 店内再プレイ / 本日精算予定 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={tile}>
                            <div style={tileLabel}>店内貯玉</div>
                            <div style={{ ...tileBig, color: C.purple }}>{f(chodamaBalls)}</div>
                            <div style={tileSub}>約{f(chodamaYen)}円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>店内再プレイ</div>
                            <div style={{ ...tileBig, color: C.blue }}>{f(replayBalls)}</div>
                            <div style={tileSub}>玉</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>本日精算予定</div>
                            <div style={{ ...tileBig, color: C.yellow }}>{f(todaySettle)}</div>
                            <div style={tileSub}>玉</div>
                        </div>
                    </div>

                    {chodamaMoveOpen ? (
                        <div style={{ ...infoBox, borderColor: chodamaMoveOpen === "deposit" ? `${C.green}55` : `${C.orange}55`, padding: 14 }}>
                            <div style={{ fontSize: 11, color: chodamaMoveOpen === "deposit" ? C.green : C.orange, fontWeight: 800, marginBottom: 12 }}>{chodamaMoveOpen === "deposit" ? "貯玉に入れる（預入 ＋）" : "貯玉から使う（引出 −）"}</div>
                            <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>玉数</div>
                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={chodamaMoveBalls} onChange={e => setChodamaMoveBalls(e.target.value)}
                                    placeholder="0"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "12px 14px", fontSize: 22, fontWeight: 800, color: C.text, fontFamily: mono, outline: "none", textAlign: "center" }} />
                            </div>
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 5 }}>メモ（任意）</div>
                                <input type="text" value={chodamaMoveMemo} onChange={e => setChodamaMoveMemo(e.target.value)}
                                    placeholder="例: 当日精算分"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: C.text, fontFamily: font, outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <Btn label="キャンセル" small onClick={() => { setChodamaMoveOpen(null); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                <Btn label={chodamaMoveOpen === "deposit" ? "入れる" : "使う"} small onClick={() => {
                                    const ok = adjustStoreChodama(st, chodamaMoveOpen, chodamaMoveBalls, chodamaMoveMemo.trim());
                                    if (ok) { setChodamaMoveOpen(null); setChodamaMoveBalls(""); setChodamaMoveMemo(""); showToast(chodamaMoveOpen === "deposit" ? "貯玉に入れました" : "貯玉から使いました"); }
                                }} bg={chodamaMoveOpen === "deposit" ? C.green : C.orange} fg="#06120d" bd="none" />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                            <Btn label="貯玉に入れる" onClick={() => { setChodamaMoveOpen("deposit"); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.green} fg="#06120d" bd="none" />
                            <Btn label="貯玉から使う" onClick={() => { setChodamaMoveOpen("withdraw"); setChodamaMoveBalls(""); setChodamaMoveMemo(""); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                        </div>
                    )}
                </Card>

                {/* ④ 交換率・貸玉情報 */}
                <Card style={cardSt}>
                    <div style={{ ...secTitle, marginBottom: 14 }}>交換率・貸玉情報</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                        <div style={tile}>
                            <div style={tileLabel}>貸玉単価</div>
                            <div style={{ ...tileBig, color: C.yellow }}>{yenPerBall ? (Number.isInteger(yenPerBall) ? yenPerBall : yenPerBall.toFixed(1)) : "—"}円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>交換率</div>
                            <div style={{ ...tileBig, color: C.teal }}>{faceEx}玉</div>
                            <div style={tileSub}>/100円</div>
                        </div>
                        <div style={tile}>
                            <div style={tileLabel}>玉単価</div>
                            <div style={{ ...tileBig, color: C.green }}>{exYenPerBall ? exYenPerBall.toFixed(2) : "—"}円</div>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <Btn label="この店舗の設定を反映" onClick={() => applyStore(st)} bg={C.blue} fg="#fff" bd="none" />
                        <Btn label="編集" small onClick={() => { setSelectedStore(null); openStoreForm(st); }} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                    </div>
                </Card>

                {/* ⑤ 店舗削除（危険操作・独立カード） */}
                <Card style={{ padding: 16, marginBottom: 12, border: `1px solid ${C.red}33`, borderRadius: 18, background: "rgba(180,60,60,0.06)" }}>
                    <div style={{ fontSize: 11, color: C.red, fontWeight: 800, letterSpacing: 0.8, marginBottom: 6 }}>危険な操作</div>
                    <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5, marginBottom: 12 }}>この店舗の全データ（貯玉残高・会員カード・設定）を削除します。元に戻せません。</div>
                    {confirmingDeleteStore === st.id ? (
                        <div style={{ display: "flex", gap: 10 }}>
                            <Btn label="キャンセル" onClick={() => setConfirmingDeleteStore(null)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                            <Btn label="本当に削除する" onClick={() => deleteStore(st)} bg={C.red} fg="#fff" bd="none" />
                        </div>
                    ) : (
                        <Btn label="この店舗を削除する" onClick={() => setConfirmingDeleteStore(st.id)} bg="rgba(180,60,60,0.14)" fg={C.red} bd={`${C.red}40`} />
                    )}
                </Card>
            </div>
        );
    }

    // Store form view
    if (showStoreForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowStoreForm(false); setEditingStore(null); setStoreFormData(emptyStore); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
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

                    {/* 閉店時刻は稼働計画の「閉店までの仕事量」に使用する。 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>閉店時刻</div>
                        <input
                            aria-label="店舗の閉店時刻"
                            type="time"
                            value={storeFormData.closingTime || ""}
                            onChange={e => setStoreFormData({ ...storeFormData, closingTime: e.target.value })}
                            style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }}
                        />
                        <div style={{ fontSize: 9, color: C.sub, marginTop: 5 }}>登録すると、稼働開始時に自動で入力されます。</div>
                    </div>

                    {/* 貸玉100円 */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貸玉（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                aria-label="店舗の貸玉100円あたりの玉数" aria-invalid={storeFormErrors.rentBalls ? "true" : undefined}
                                value={storeFormData.rentBalls}
                                onChange={e => setStoreNumberValue("rentBalls", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("rentBalls")}
                                placeholder="25"
                                style={{ flex: 1, minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.rentBalls ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.rentBalls) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        <StoreFieldError field="rentBalls" />
                        {/* プリセット（4円/2円/1円/0.5円 を含む複数交換率対応） */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {[{l:"4円等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33},{l:"2円",v:50},{l:"1円",v:100},{l:"0.5円",v:200}].map(({l,v}) => {
                                const active = String(storeFormData.rentBalls) === String(v);
                                return <button key={v} className="b" onClick={() => { setStoreFormData(p => ({...p, rentBalls: v, exRate: v})); setStoreFormErrors(p => ({ ...p, rentBalls: "", exRate: "" })); }} style={{ fontSize: 10, padding: "5px 10px", minHeight: 44, borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                            })}
                        </div>
                    </div>

                    {/* 交換100円 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>交換（玉/100円）</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <input type="text" inputMode="decimal"
                                aria-label="店舗の交換100円あたりの玉数" aria-invalid={storeFormErrors.exRate ? "true" : undefined}
                                value={storeFormData.exRate}
                                onChange={e => setStoreNumberValue("exRate", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("exRate")}
                                placeholder="25"
                                style={{ flex: 1, minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.exRate ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <span style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap" }}>{(100 / (parseFloat(storeFormData.exRate) || 25)).toFixed(2)}円/玉</span>
                        </div>
                        <StoreFieldError field="exRate" />
                        {/* プリセット（貸玉レート別の代表的な交換率: 4円/2円/1円/0.5円） */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {(() => {
                                const rb = parseFloat(storeFormData.rentBalls) || 25;
                                let presets;
                                if (rb >= 180) presets = [{l:"等価",v:200}];
                                else if (rb >= 80) presets = [{l:"等価",v:100},{l:"0.9円",v:111}];
                                else if (rb >= 40) presets = [{l:"等価",v:50},{l:"1.8円",v:56}];
                                else presets = [{l:"等価",v:25},{l:"28玉",v:28},{l:"30玉",v:30},{l:"33玉",v:33}];
                                return presets.map(({l,v}) => {
                                    const active = String(storeFormData.exRate) === String(v);
                                    return <button key={v} className="b" onClick={() => { setStoreNumberValue("exRate", v); }} style={{ fontSize: 10, padding: "5px 10px", minHeight: 44, borderRadius: 6, border: `1px solid ${active ? C.blue : C.borderHi}`, background: active ? `${C.blue}22` : C.surfaceHi, color: active ? C.blue : C.sub, fontFamily: font, fontWeight: active ? 700 : 500, cursor: "pointer" }}>{l}</button>;
                                });
                            })()}
                        </div>
                    </div>

                    {/* 貯玉残高・貯玉上限 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉残高（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の貯玉残高" aria-invalid={storeFormErrors.chodama ? "true" : undefined}
                                value={storeFormData.chodama === "" ? "" : String(storeFormData.chodama || 0)}
                                onChange={e => setStoreNumberValue("chodama", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("chodama")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.chodama ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="chodama" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>貯玉上限（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の貯玉上限" aria-invalid={storeFormErrors.chodamaMax ? "true" : undefined}
                                value={storeFormData.chodamaMax === "" ? "" : String(storeFormData.chodamaMax || 0)}
                                onChange={e => setStoreNumberValue("chodamaMax", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("chodamaMax")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.chodamaMax ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="chodamaMax" />
                        </div>
                    </div>

                    {/* 店内再プレイ・本日精算予定 */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>店内再プレイ（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の再プレイ玉数" aria-invalid={storeFormErrors.replayBalls ? "true" : undefined}
                                value={storeFormData.replayBalls === "" ? "" : String(storeFormData.replayBalls || 0)}
                                onChange={e => setStoreNumberValue("replayBalls", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("replayBalls")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.replayBalls ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="replayBalls" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>本日精算予定（玉）</div>
                            <input type="text" inputMode="numeric" pattern="[0-9]*"
                                aria-label="店舗の本日精算予定玉数" aria-invalid={storeFormErrors.todaySettle ? "true" : undefined}
                                value={storeFormData.todaySettle === "" ? "" : String(storeFormData.todaySettle || 0)}
                                onChange={e => setStoreNumberValue("todaySettle", e.target.value)}
                                onBlur={() => validateStoreNumberOnBlur("todaySettle")}
                                placeholder="0"
                                style={{ width: "100%", minHeight: 44, boxSizing: "border-box", background: C.bg, border: `1px solid ${storeFormErrors.todaySettle ? C.red : C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                            <StoreFieldError field="todaySettle" />
                        </div>
                    </div>

                    {/* 最終来店 */}
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>最終来店（任意）</div>
                        <input type="text" value={storeFormData.lastVisit || ""}
                            onChange={e => setStoreFormData({ ...storeFormData, lastVisit: e.target.value })}
                            placeholder="例: 2025/05/24 22:30"
                            style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: font, outline: "none" }} />
                    </div>

                    {/* 会員カード */}
                    <div style={{ marginBottom: 12, background: "rgba(0,0,0,0.12)", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: (storeFormData.memberCard?.created) ? 10 : 0 }}>
                            <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>会員カードを作成済み</span>
                            <button className="b" type="button" role="switch" aria-label="会員カードを作成済み" aria-checked={!!storeFormData.memberCard?.created}
                                onClick={() => setStoreFormData(p => ({ ...p, memberCard: { ...normalizeMemberCard(p.memberCard), created: !p.memberCard?.created } }))}
                                style={{
                                    width: 51, height: 44, borderRadius: 999, border: "none", cursor: "pointer", position: "relative",
                                    background: "transparent",
                                }}>
                                <span aria-hidden="true" style={{ position: "absolute", top: 6.5, left: 0, width: 51, height: 31, borderRadius: 999, background: storeFormData.memberCard?.created ? C.green : C.borderHi, transition: "background 0.2s" }}>
                                    <span style={{ position: "absolute", top: 2, left: storeFormData.memberCard?.created ? 22 : 2, width: 27, height: 27, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                                </span>
                            </button>
                        </div>
                        {storeFormData.memberCard?.created && (
                            <div>
                                <div style={{ fontSize: 10, color: C.sub, marginBottom: 4 }}>カード番号</div>
                                <input type="text" value={storeFormData.memberCard?.number || ""}
                                    onChange={e => setStoreFormData(p => ({ ...p, memberCard: { ...normalizeMemberCard(p.memberCard), number: e.target.value } }))}
                                    placeholder="1234 5678 9012 3456"
                                    style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, color: C.text, fontFamily: mono, outline: "none" }} />
                                <div style={{ fontSize: 9, color: C.sub, marginTop: 6 }}>入金残高・貯玉残高は登録後、店舗詳細の「残高を更新」から管理できます。</div>
                            </div>
                        )}
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
                        color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600
                    }}>← 設定に戻る</button>
                    <button className="b" onClick={() => openStoreForm()} style={{
                        background: C.blue, border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 700
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
                        <div key={st.id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <button className="b" onClick={() => setSelectedStore(st)} style={{
                                width: "100%", background: "transparent",
                                border: "none", padding: "14px 16px",
                                display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                                textAlign: "left",
                            }}>
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{st.name}</span>
                                        {st.memberCard?.created && <span style={{ fontSize: 9, fontWeight: 800, color: C.green, background: `${C.green}22`, border: `1px solid ${C.green}55`, borderRadius: 6, padding: "1px 6px" }}>会員</span>}
                                    </div>
                                    {st.address && <div style={{ fontSize: 10, color: C.sub }}>{st.address}</div>}
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: C.yellow, fontFamily: mono }}>{Math.round(st.rentBalls || 250) / 10}玉</div>
                                    <div style={{ fontSize: 9, color: C.sub }}>交換 {Math.round(st.exRate || 250) / 10}玉{(st.chodama || 0) > 0 ? ` 💎${f(st.chodama)}` : ""}</div>
                                </div>
                            </button>
                            {/* 店舗詳細（見た目優先プロトタイプ）への導線。既存の編集導線（上のボタン）とは独立。
                                TODO: 現状 StoreDetail 側はダミーデータ固定表示のため、st.id は将来の実データ接続用に渡すのみ。 */}
                            {onOpenStoreDetail && (
                                <button className="b" onClick={() => onOpenStoreDetail(st)} style={{
                                    width: "100%", background: "transparent", border: "none",
                                    padding: "0 16px 12px", display: "flex", alignItems: "center", gap: 4,
                                    cursor: "pointer", textAlign: "left", minHeight: 32,
                                    fontSize: 11, fontWeight: 700, color: C.blue, fontFamily: font,
                                }}>
                                    店舗詳細プレビューを見る ›
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        );
    }

    // Machine detail view
    if (selected) {
        return (
            <MachineSpecWorkspace
                machineData={selected}
                onBack={() => setSelected(null)}
                primaryActionLabel="この機種の確率を設定に反映"
                onPrimaryAction={() => applyMachine(selected)}
                onPersist={persistMachineOverride}
            />
        );
    }

    // Legacy machine detail view
    if (selected) {
        const borderKeys = selected.border ? Object.keys(selected.border).filter(k => selected.border[k] > 0).sort((a, b) => Number(b) - Number(a)) : [];
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => setSelected(null)} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
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

    if (showEvidenceMachineUi) {
        return <MachineSpecWorkspace onBack={() => setShowEvidenceMachineUi(false)} />;
    }

    // Machine form view (新規登録/編集)
    if (showMachineForm) {
        return (
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px calc(80px + env(safe-area-inset-bottom))" }}>
                <button className="b" onClick={() => { setShowMachineForm(false); setEditingMachine(null); setFormData(emptyMachine); }} style={{
                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontSize: 12, padding: "8px 16px", minHeight: 44, fontFamily: font, fontWeight: 600, marginBottom: 12
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
        const settingsTypeColors = {
            "スマパチ": "#f7971e",
            "ハイミドル": "#ef473a",
            "ミドル": "#2f6fed",
            "ライトミドル": "#20e3b2",
            "甘デジ": "#16a34a",
        };
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* ヘッダー + 上部検索 */}
                <div style={{ padding: "12px 14px 10px", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <button className="b" onClick={() => {
                            setShowMachineSearch(false);
                            setQuery("");
                            setMachineFilter("all");
                            setMachineMakerFilter("all");
                            setMachineProbabilityFilter("all");
                            setMachineSort("default");
                            setShowMachineDetails(false);
                            setConfirmingDeleteMachine(null);
                        }} style={{
                            background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 9,
                            color: C.text, fontSize: 12, padding: "8px 13px", minHeight: 40, fontFamily: font, fontWeight: 700
                        }}>← 設定に戻る</button>
                        <span style={{ color: C.sub, fontSize: 11, fontWeight: 700 }}>{results.length}機種</span>
                    </div>
                    <div style={{ fontSize: 20, lineHeight: 1.2, fontWeight: 850, color: C.text, marginBottom: 10 }}>機種を探す</div>
                    <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: C.sub, display: "flex" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.3-4.3" />
                            </svg>
                        </span>
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="機種名・メーカーで検索"
                            style={{
                                width: "100%", minHeight: 44, boxSizing: "border-box",
                                background: "var(--surface-hi)", border: `1px solid ${C.border}`,
                                borderRadius: 12, padding: "11px 38px 11px 39px",
                                fontSize: 13, color: C.text, fontFamily: font, outline: "none",
                            }}
                        />
                        {query && (
                            <button className="b" aria-label="検索文字を消す" onClick={() => setQuery("")} style={{
                                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                                width: 32, height: 32, border: "none", borderRadius: 999,
                                background: "transparent", color: C.sub, fontSize: 17, cursor: "pointer",
                            }}>×</button>
                        )}
                    </div>
                </div>

                {/* タイプ絞り込み */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", padding: "0 14px 9px", scrollbarWidth: "none", flexShrink: 0 }}>
                    <span style={{ width: 48, flex: "0 0 48px", color: C.sub, fontSize: 10, fontWeight: 800 }}>タイプ</span>
                    {[
                        { id: "all", label: "全て" },
                        { id: "スマパチ", label: "スマパチ" },
                        { id: "ハイミドル", label: "ハイミドル" },
                        { id: "ミドル", label: "ミドル" },
                        { id: "ライトミドル", label: "ライト" },
                        { id: "甘デジ", label: "甘デジ" },
                    ].map(chip => {
                        const active = machineFilter === chip.id;
                        return (
                            <button key={chip.id} className="b" onClick={() => setMachineFilter(chip.id)} style={{
                                flexShrink: 0, minHeight: 32, background: active ? C.blue : "var(--surface-hi)",
                                color: active ? "#fff" : C.text, border: "none", borderRadius: 999,
                                padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: font,
                                cursor: "pointer", whiteSpace: "nowrap",
                            }}>{chip.label}</button>
                        );
                    })}
                </div>

                {/* メーカー快捷チップ */}
                <div style={{ display: "flex", alignItems: "center", gap: 7, overflowX: "auto", padding: "0 14px 10px", scrollbarWidth: "none", flexShrink: 0 }}>
                    <span style={{ width: 48, flex: "0 0 48px", color: C.sub, fontSize: 10, fontWeight: 800 }}>メーカー</span>
                    <button className="b" onClick={() => setMachineMakerFilter("all")} style={{
                        flexShrink: 0, minHeight: 32, borderRadius: 999, padding: "6px 11px",
                        background: machineMakerFilter === "all" ? "rgba(31,182,255,0.18)" : "var(--surface-hi)",
                        border: `1px solid ${machineMakerFilter === "all" ? C.blue : C.borderHi}`,
                        color: machineMakerFilter === "all" ? C.blue : C.text,
                        fontSize: 11, fontWeight: 700, fontFamily: font, cursor: "pointer",
                    }}>全て</button>
                    {visibleQuickMakerOptions.map((option) => {
                        const active = machineMakerFilter === option.id;
                        return (
                            <button key={option.id} className="b" onClick={() => setMachineMakerFilter(option.id)} style={{
                                flexShrink: 0, minHeight: 32, borderRadius: 999, padding: "6px 11px",
                                background: active ? "rgba(31,182,255,0.18)" : "var(--surface-hi)",
                                border: `1px solid ${active ? C.blue : C.borderHi}`,
                                color: active ? C.blue : C.text,
                                fontSize: 11, fontWeight: 700, fontFamily: font, cursor: "pointer", whiteSpace: "nowrap",
                            }}>{option.label}</button>
                        );
                    })}
                </div>

                {/* 並び替え + 詳細条件 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px 10px", flexShrink: 0 }}>
                    <select id="settings-machine-sort" aria-label="並び替え" value={machineSort} onChange={(event) => setMachineSort(event.target.value)} style={{
                        flex: 1, minWidth: 0, minHeight: 38, boxSizing: "border-box",
                        background: "var(--surface-hi)", border: `1px solid ${C.borderHi}`,
                        borderRadius: 10, padding: "8px 32px 8px 11px",
                        color: C.text, fontSize: 11, fontWeight: 700, fontFamily: font, outline: "none", cursor: "pointer",
                    }}>
                        {MACHINE_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{`並び替え：${option.label}`}</option>
                        ))}
                    </select>
                    <button className="b" aria-expanded={showMachineDetails} onClick={() => setShowMachineDetails((open) => !open)} style={{
                        minHeight: 38, flexShrink: 0, borderRadius: 10, padding: "7px 10px",
                        background: showMachineDetails ? "rgba(31,182,255,0.14)" : "var(--surface-hi)",
                        border: `1px solid ${showMachineDetails ? C.blue : C.borderHi}`,
                        color: showMachineDetails ? C.blue : C.text, fontSize: 11, fontWeight: 750,
                        fontFamily: font, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    }}>
                        詳細条件
                        {activeMachineFilterCount > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: C.blue, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>{activeMachineFilterCount}</span>}
                        <span style={{ color: C.sub }}>{showMachineDetails ? "⌃" : "⌄"}</span>
                    </button>
                </div>

                {/* 詳細条件パネル */}
                {showMachineDetails && (
                    <div style={{ margin: "0 14px 10px", padding: 12, background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 12, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                            <span style={{ color: C.text, fontSize: 11, fontWeight: 800 }}>大当り確率</span>
                            <button className="b" onClick={() => { setMachineMakerFilter("all"); setMachineProbabilityFilter("all"); }} style={{ background: "transparent", border: "none", color: C.blue, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>条件をリセット</button>
                        </div>
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}>
                            {MACHINE_PROBABILITY_FILTER_OPTIONS.map((option) => {
                                const active = machineProbabilityFilter === option.value;
                                return (
                                    <button key={option.value} className="b" onClick={() => setMachineProbabilityFilter(option.value)} style={{
                                        flexShrink: 0, minHeight: 32, borderRadius: 9, padding: "6px 10px",
                                        background: active ? "rgba(31,182,255,0.16)" : "var(--surface-hi)",
                                        border: `1px solid ${active ? C.blue : C.borderHi}`,
                                        color: active ? C.blue : C.text, fontSize: 10, fontWeight: 700, cursor: "pointer",
                                    }}>{option.label}</button>
                                );
                            })}
                        </div>
                        <div style={{ color: C.text, fontSize: 11, fontWeight: 800, marginBottom: 8 }}>すべてのメーカー</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 92, overflowY: "auto" }}>
                            {makerOptions.map((option) => {
                                const active = machineMakerFilter === option.id;
                                return (
                                    <button key={option.id} className="b" onClick={() => setMachineMakerFilter(option.id)} style={{
                                        minHeight: 30, borderRadius: 8, padding: "5px 9px",
                                        background: active ? "rgba(31,182,255,0.16)" : "var(--surface-hi)",
                                        border: `1px solid ${active ? C.blue : C.border}`,
                                        color: active ? C.blue : C.text, fontSize: 10, fontWeight: 700, cursor: "pointer",
                                    }}>{option.label} <span style={{ color: C.sub }}>{option.count}</span></button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 機種リスト (コンパクト表示) */}
                <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
                    {results.length === 0 ? (
                        <div style={{ textAlign: "center", color: C.sub, padding: "36px 16px", fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>該当する機種がありません</div>
                            条件を減らすか、検索文字を変更してください
                        </div>
                    ) : (
                        results.map((m, i) => {
                            const typeColorKey = ["スマパチ", "ハイミドル", "ライトミドル", "甘デジ", "ミドル"]
                                .find((type) => String(m.type || "").includes(type));
                            const iconColor = settingsTypeColors[typeColorKey] || C.sub;
                            const iconLabel = (m.type || "").slice(0, 2);
                            const probText = m.prob || (m.synthProb ? `1/${m.synthProb}` : "—");
                            return (
                                <div key={m.isCustom ? `custom-${m.id}` : `db-${i}`} style={{
                                    borderBottom: `1px solid ${C.border}`, overflow: "hidden",
                                }}>
                                    {/* カード本体（タップで詳細・適用へ） */}
                                    <button className="b" onClick={() => { setConfirmingDeleteMachine(null); setSelected(m); }} style={{
                                        width: "100%", background: "transparent",
                                        border: "none", padding: "8px 5px",
                                        display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left",
                                        fontFamily: font, minHeight: 68,
                                    }}>
                                        <div style={{
                                            width: 36, height: 36, flexShrink: 0, borderRadius: 9,
                                            background: iconColor,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "#fff", fontSize: 10, fontWeight: 800, fontFamily: font,
                                        }}>{iconLabel}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>
                                                {m.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {m.maker || "メーカー未設定"}{m.type ? ` ・ ${m.type}` : ""}
                                                {m.isCustom ? ` ・ ${m.isOverride ? "編集済み" : "カスタム"}` : ""}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: C.yellow, fontFamily: mono, whiteSpace: "nowrap" }}>{probText}</span>
                                        <span style={{ fontSize: 15, color: C.sub, flexShrink: 0, fontWeight: 500 }}>›</span>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
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
    const IconGrid = () => (<svg {...svgProps}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>);
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
    const IconVibrate = () => (<svg {...svgProps}><rect x="8" y="5" width="8" height="14" rx="1.5"/><path d="M2 10v4"/><path d="M22 10v4"/></svg>);
    const IconExchange = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9"/><path d="M9 13h4.5a2.5 2.5 0 0 1 0 5H9"/><path d="M11 6v12"/><path d="M14 6v12"/></svg>);
    const IconTrending = () => (<svg {...svgProps}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>);
    const IconCoin = () => (<svg {...svgProps}><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>);
    const IconCalculator = () => (<svg {...svgProps}><rect x="4" y="3" width="16" height="18" rx="2.5"/><rect x="7" y="6" width="10" height="3" rx="0.5"/><circle cx="8.5" cy="13" r="0.6" fill="currentColor"/><circle cx="12" cy="13" r="0.6" fill="currentColor"/><circle cx="15.5" cy="13" r="0.6" fill="currentColor"/><circle cx="8.5" cy="17" r="0.6" fill="currentColor"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/><circle cx="15.5" cy="17" r="0.6" fill="currentColor"/></svg>);
    const IconChartBars = () => (<svg {...svgProps}><path d="M4 19V11"/><path d="M10 19V5"/><path d="M16 19v-9"/><path d="M22 19v-5"/></svg>);
    const IconBell = () => (<svg {...svgProps}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>);
    const IconCsv = () => (<svg {...svgProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 14h1.5a1 1 0 1 1 0 2H8v2"/><path d="M16 14a1 1 0 0 0-1 1c0 1 2 1 2 2a1 1 0 0 1-1 1"/><path d="M11 14l1 4 1-4"/></svg>);
    const IconFaceId = () => (<svg {...svgProps}><path d="M5 8V6a1 1 0 0 1 1-1h2"/><path d="M19 8V6a1 1 0 0 0-1-1h-2"/><path d="M5 16v2a1 1 0 0 0 1 1h2"/><path d="M19 16v2a1 1 0 0 1-1 1h-2"/><circle cx="9.5" cy="11" r="0.6" fill="currentColor"/><circle cx="14.5" cy="11" r="0.6" fill="currentColor"/><path d="M12 10v3.5"/><path d="M10 16c0.6 0.7 1.3 1 2 1s1.4-0.3 2-1"/></svg>);
    const IconFingerprint = () => (<svg {...svgProps}><path d="M12 11v3.5a2.5 2.5 0 0 0 5 0"/><path d="M9 8a4 4 0 0 1 7 2.7v3.3"/><path d="M6 13c0-4 2.7-7 6.5-7s6.5 3 6.5 7v2"/><path d="M7 17c-.4-.7-.7-1.6-.8-2.5"/><path d="M14 18c-1.5.7-3 1-4.5 1"/></svg>);

    // ── サブ画面共通ヘッダー ──
    const SubHeader = ({ title, onBack }) => (
        <div style={{
            background: "var(--settings-card)",
            padding: "14px 12px 16px",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            borderBottom: "1px solid var(--settings-line)",
        }}>
            <button className="b" onClick={onBack} aria-label={`${title}から設定トップへ戻る`} style={{
                background: "transparent", border: "none",
                color: "var(--settings-accent)", fontSize: 26, width: 44, height: 44,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0, fontWeight: 400, lineHeight: 1,
            }}>‹</button>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.4 }}>{title}</div>
        </div>
    );

    // ── 共通UIヘルパー ──
    const Toggle = ({ value, onChange, color, label }) => (
        <button className="b" type="button" role="switch" aria-checked={!!value} aria-label={label} onClick={() => onChange(!value)} style={{
            width: 51, height: 44, borderRadius: 22, border: "none", flexShrink: 0,
            background: "transparent", position: "relative", cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
        }}>
            <span aria-hidden="true" style={{
                width: 51, height: 31, borderRadius: 16,
                background: value ? (color || "var(--settings-accent)") : "var(--settings-line)",
                position: "absolute", left: 0, top: 6.5, transition: "background 0.25s ease",
            }}>
                <span style={{
                    width: 27, height: 27, borderRadius: 14, background: "#fff",
                    position: "absolute", top: 2,
                    left: value ? 22 : 2, transition: "left 0.25s ease",
                    boxShadow: "0 1px 1px rgba(0,0,0,0.04), 0 3px 8px rgba(0,0,0,0.12)",
                }} />
            </span>
        </button>
    );

    const ComingSoonBadge = () => (
        <span style={{
            borderRadius: 999, padding: "4px 9px", flexShrink: 0,
            background: "var(--settings-badge)",
            color: "var(--settings-badge-text)", fontSize: 10.5, fontWeight: 700,
        }}>準備中</span>
    );

    // 汎用リスト行（onPressなしはdivでレンダリング → Toggle等の子要素がiOSでも押せる）
    const Row = ({ icon, IconComp, label, sub, right, onPress, danger }) => {
        const Tag = onPress ? "button" : "div";
        const clr = danger ? C.red : "var(--settings-icon-color)";
        return (
            <Tag className="b settings-row settings-list-row" onClick={onPress || undefined} style={{
                width: "100%", background: "transparent", border: "none",
                borderBottom: "1px solid var(--settings-line)", padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
                cursor: onPress ? "pointer" : "default", textAlign: "left",
                WebkitTapHighlightColor: "transparent",
            }}>
                {(IconComp || icon) && (
                    <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: danger ? "rgba(255,59,48,0.12)" : "var(--settings-icon-bg)",
                        border: danger ? "none" : "1px solid var(--settings-icon-line)",
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
            fontSize: 13, fontWeight: 500, color: "var(--sub)",
            letterSpacing: 0, textTransform: "none",
        }}>{label}</div>
    );

    // セクションカード（角丸まとめ）— last-childのborderBottomはCSS側で除去
    const Section = ({ children, danger }) => (
        <div style={{
            background: danger ? "color-mix(in srgb, var(--red) 4%, transparent)" : "var(--settings-card)",
            borderRadius: "var(--settings-radius)",
            border: `1px solid ${danger ? "color-mix(in srgb, var(--red) 18%, transparent)" : "var(--settings-line)"}`,
            overflow: "hidden",
        }}>{children}</div>
    );

    // ── 外観サブビュー ──
    if (showAppearanceView) {
        const atmospheres = [
            {
                id: "deep-night",
                name: "DEEP NIGHT",
                description: "夜のホールでも眩しさを抑える",
                theme: "dark",
                accent: "purple",
                background: "linear-gradient(135deg, #302858, #16182c 68%)",
                text: "#f7f7ff",
                sampleLabel: "本日の期待値",
                sampleValue: "+12,800円",
                sampleSideLabel: "判断",
                sampleSideValue: "続 行",
            },
            {
                id: "focus-green",
                name: "FOCUS GREEN",
                description: "判断と数値の差を見分けやすく",
                theme: "dark",
                accent: "green",
                background: "linear-gradient(135deg, #0c544c, #102a2f 70%)",
                text: "#f1fffb",
                sampleLabel: "回転率",
                sampleValue: "19.8 /K",
                sampleSideLabel: "差",
                sampleSideValue: "+2.1",
            },
            {
                id: "daylight",
                name: "DAYLIGHT",
                description: "昼間・屋外でも読みやすい明るさ",
                theme: "light",
                accent: "teal",
                background: "linear-gradient(135deg, #f6f1e8, #dce9ff)",
                text: "#172033",
                sampleLabel: "今月の収支",
                sampleValue: "+48,500円",
                sampleSideLabel: "勝率",
                sampleSideValue: "66%",
            },
        ];
        const selectedAtmosphere = atmospheres.find(
            (item) => s.theme === item.theme && s.accentColor === item.accent,
        );
        const applyAtmosphere = (item) => {
            s.setTheme(item.theme);
            s.setAccentColor(item.accent);
        };
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="テーマ" onBack={() => setShowAppearanceView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <div style={{ padding: "18px 2px 2px" }}>
                        <div style={{ color: C.blue, fontSize: 10, fontWeight: 900, letterSpacing: ".15em" }}>SELECT YOUR ATMOSPHERE</div>
                        <h2 style={{ margin: "7px 0 5px", color: C.text, fontSize: 24, lineHeight: 1.25, letterSpacing: "-.04em" }}>
                            色ではなく、<br />使う場面で選ぶ。
                        </h2>
                        <p style={{ margin: 0, color: C.sub, fontSize: 11, lineHeight: 1.65 }}>
                            画面全体の明るさと強調色を、使いやすい3つの世界観にまとめました。
                        </p>
                    </div>

                    <div role="group" aria-label="テーマの連動方法" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "16px 0" }}>
                        <button type="button" className="b" aria-pressed={s.theme === "system"} onClick={() => s.setTheme("system")} style={{
                            minHeight: 44, borderRadius: 12, padding: "10px 8px",
                            border: s.theme === "system" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme === "system" ? "color-mix(in srgb, var(--blue) 18%, var(--surface))" : C.surface,
                            color: s.theme === "system" ? C.blue : C.subHi,
                            fontSize: 12, fontWeight: 800,
                        }}>端末に合わせる</button>
                        <button type="button" className="b" aria-pressed={s.theme !== "system"} onClick={() => applyAtmosphere(selectedAtmosphere || atmospheres[0])} style={{
                            minHeight: 44, borderRadius: 12, padding: "10px 8px",
                            border: s.theme !== "system" ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: s.theme !== "system" ? "color-mix(in srgb, var(--blue) 18%, var(--surface))" : C.surface,
                            color: s.theme !== "system" ? C.blue : C.subHi,
                            fontSize: 12, fontWeight: 800,
                        }}>固定する</button>
                    </div>

                    <div role="radiogroup" aria-label="テーマの世界観" style={{ display: "grid", gap: 10 }}>
                        {atmospheres.map((item) => {
                            const active = selectedAtmosphere?.id === item.id && s.theme !== "system";
                            return (
                                <button key={item.id} type="button" className="b" role="radio" aria-checked={active}
                                    aria-label={`${item.name}。${item.description}`} onClick={() => applyAtmosphere(item)} style={{
                                        width: "100%", minHeight: 136, position: "relative", overflow: "hidden",
                                        padding: 15, borderRadius: 22, textAlign: "left", color: item.text,
                                        background: item.background,
                                        border: active ? "2px solid #ffffff" : "1px solid rgba(255,255,255,.12)",
                                        boxShadow: active ? `0 0 0 2px ${C.blue}, inset 0 1px 0 rgba(255,255,255,.14)` : "inset 0 1px 0 rgba(255,255,255,.1)",
                                    }}>
                                    <span aria-hidden="true" style={{
                                        position: "absolute", width: 150, height: 150, right: -45, top: -60,
                                        borderRadius: "50%", background: "rgba(255,255,255,.12)",
                                    }} />
                                    <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span>
                                            <strong style={{ display: "block", fontSize: 16, letterSpacing: ".01em" }}>{item.name}</strong>
                                            <span style={{ display: "block", marginTop: 2, fontSize: 10, opacity: .72 }}>{item.description}</span>
                                        </span>
                                        <span aria-hidden="true" style={{
                                            width: 28, height: 28, borderRadius: "50%", flex: "0 0 auto",
                                            display: "grid", placeItems: "center", fontSize: 13,
                                            border: "1px solid rgba(255,255,255,.4)",
                                            background: active ? "#fff" : "transparent",
                                            color: active ? "#191532" : item.text,
                                        }}>{active ? "✓" : ""}</span>
                                    </span>
                                    <span aria-label="表示見本" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 7, marginTop: 13 }}>
                                        {[
                                            [item.sampleLabel, item.sampleValue],
                                            [item.sampleSideLabel, item.sampleSideValue],
                                        ].map(([label, value]) => (
                                            <span key={label} style={{
                                                minHeight: 40, borderRadius: 10, padding: 8,
                                                background: item.theme === "light" ? "rgba(255,255,255,.54)" : "rgba(10,12,20,.34)",
                                                border: item.theme === "light" ? "1px solid rgba(20,40,80,.1)" : "1px solid rgba(255,255,255,.12)",
                                            }}>
                                                <small style={{ display: "block", fontSize: 8, opacity: .65 }}>{label}</small>
                                                <strong style={{ display: "block", marginTop: 2, fontSize: 12 }}>{value}</strong>
                                            </span>
                                        ))}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {s.theme === "system" && (
                        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, color: C.sub, background: C.surface, border: `1px solid ${C.border}`, fontSize: 10, lineHeight: 1.6 }}>
                            端末に合わせる間は、端末のライト・ダーク設定へ自動で追従します。世界観を選ぶと固定表示へ切り替わります。
                        </div>
                    )}

                    <SectionLabel label="アクセシビリティ" />
                    <Section>
                        <Row IconComp={IconContrast} iconColor={C.subHi} label="ハイコントラストモード" sub="視認性を向上させます"
                            right={<Toggle label="ハイコントラストモード" value={s.highContrast} onChange={s.setHighContrast} />} />
                        <Row IconComp={IconEye} iconColor={C.subHi} label="色覚サポート" sub="色の識別をサポート"
                            right={<Toggle label="色覚サポート" value={s.colorBlind} onChange={s.setColorBlind} />} />
                        <Row IconComp={IconVibrate} iconColor={C.subHi} label="タップ振動フィードバック" sub="ボタン操作時に振動（対応端末のみ）"
                            right={<Toggle label="タップ振動フィードバック" value={s.hapticFeedback} onChange={s.setHapticFeedback} />} />
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 通知設定サブビュー ──
    if (showNotificationView) {
        const prefs = s.notificationPrefs || {};
        const setPref = (key, value) => s.setNotificationPrefs((prev) => ({ ...(prev || {}), [key]: value }));
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SubHeader title="通知設定" onBack={() => setShowNotificationView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="アプリ内通知" />
                    <Section>
                        <Row IconComp={IconBell} iconColor={C.purple} label="レベルアップ" sub="ハンターランクが上がったとき"
                            right={<Toggle label="レベルアップ通知" value={prefs.levelUp !== false} onChange={(v) => setPref("levelUp", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.green} label="連続記録" sub="連続稼働ボーナスを獲得したとき"
                            right={<Toggle label="連続記録通知" value={prefs.streak !== false} onChange={(v) => setPref("streak", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.orange} label="バッジ獲得" sub="新しい実績バッジを獲得したとき"
                            right={<Toggle label="バッジ獲得通知" value={prefs.badge !== false} onChange={(v) => setPref("badge", v)} />} />
                        <Row IconComp={IconBell} iconColor={C.blue} label="判断変化" sub="続行・様子見・ヤメの判断が変わったとき"
                            right={<Toggle label="判断変化通知" value={prefs.verdict !== false} onChange={(v) => setPref("verdict", v)} />} />
                    </Section>
                    <div style={{ padding: "12px 16px", color: C.sub, fontSize: 11, lineHeight: 1.6 }}>
                        ここで切り替えるのはアプリ内の通知履歴です。端末のプッシュ通知は使用していません。
                    </div>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 自動ロック設定サブビュー ──
    if (showAutoLockView) {
        const options = [
            { value: 0, label: "オフ" },
            { value: "background", label: "バックグラウンド移動時" },
            { value: 1, label: "1分後" },
            { value: 5, label: "5分後" },
            { value: 15, label: "15分後" },
            { value: 30, label: "30分後" },
        ];
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SubHeader title="自動ロック" onBack={() => setShowAutoLockView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="ロックするタイミング" />
                    {!s.appPin ? (
                        <Section><div style={{ padding: 16, color: C.sub, fontSize: 12, lineHeight: 1.6 }}>先にアプリロックをオンにして、4桁のPINを設定してください。</div></Section>
                    ) : (
                        <Section>
                            {options.map((option, index) => {
                                const active = String(s.autoLockMinutes ?? 0) === String(option.value);
                                return (
                                    <button key={String(option.value)} type="button" className="b settings-row" aria-pressed={active}
                                        onClick={() => s.setAutoLockMinutes(option.value)} style={{
                                            width: "100%", minHeight: 52, padding: "12px 16px", textAlign: "left",
                                            display: "flex", alignItems: "center", justifyContent: "space-between",
                                            background: "transparent", border: "none",
                                            borderBottom: index < options.length - 1 ? `1px solid ${C.border}` : "none",
                                            color: active ? C.blue : C.text, fontSize: 14, fontWeight: active ? 700 : 500,
                                        }}>
                                        <span>{option.label}</span><span aria-hidden="true">{active ? "✓" : ""}</span>
                                    </button>
                                );
                            })}
                        </Section>
                    )}
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
                                <NI ariaLabel="貸玉100円あたりの玉数" validate={validatePositive} v={Number(s.rentBalls || 250) / 10} set={(v) => s.setRentBalls(Math.round(Number(v) * 10))} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>玉/100円</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>交換100円</div>
                                <div style={{ fontSize: 11, color: C.sub }}>{(100 / ((s.exRate || 250) / 10)).toFixed(2)}円/玉</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI ariaLabel="交換100円あたりの玉数" validate={validatePositive} v={Number(s.exRate || 250) / 10} set={(v) => { const ex = Math.round(Number(v) * 10); s.setExRate(ex); s.setBallVal(1000 / ex); }} w={80} center />
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
                                const isActive = Math.abs(Number(s.exRate || 250) / 10 - balls) < 0.05;
                                return (
                                    <button key={yen} className="b" onClick={() => { s.setExRate(balls * 10); s.setBallVal(1000 / (balls * 10)); }} style={{
                                        background: isActive ? C.blue : C.surfaceHi,
                                        border: isActive ? "none" : `1px solid ${C.border}`,
                                        borderRadius: 999, color: isActive ? "#fff" : C.subHi,
                                        fontSize: 13, padding: "8px 14px", minHeight: 44, fontFamily: font, fontWeight: 600,
                                    }}>{label}</button>
                                );
                            })}
                        </div>
                    </Section>

                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 機種スペックサブビュー（回転・補正を統合）──
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
                                    <NI ariaLabel={lbl} validate={lbl === "サポ増減/初当たり" ? validateFinite : validateNonNegative} v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>

                    <SectionLabel label="合成確率・回転" />
                    <Section>
                        {[
                            { lbl: "合成確率分母", v: s.synthDenom, set: s.setSynthDenom, unit: "1/x" },
                            { lbl: "1h消化回転数", v: s.rotPerHour, set: s.setRotPerHour, unit: "回/h" },
                            { lbl: "ボーダー手動値", v: s.border, set: s.setBorder, unit: "回/K" },
                        ].map(({ lbl, v, set, unit }, i, arr) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI ariaLabel={lbl} validate={validatePositive} v={v} set={set} w={80} center />
                                    <span style={{ fontSize: 11, color: C.sub, minWidth: 40 }}>{unit}</span>
                                </div>
                            </div>
                        ))}
                    </Section>

                    <SectionLabel label="ボーダー（自動計算）" />
                    <Section>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px" }}>
                            <div>
                                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{borderSource === "db" ? "DB標準ボーダー" : "理論ボーダー"}</div>
                                <div style={{ fontSize: 11, color: C.teal, marginTop: 2 }}>{exRateLabel}</div>
                            </div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: mono }}>
                                {calcBorder > 0 ? f(calcBorder, 1) : "—"}
                                <span style={{ fontSize: 11, color: C.sub, marginLeft: 4 }}>回/K</span>
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="遊タイム狙い目分析（任意）" />
                    <Section>
                        {[
                            { key: "triggerLowSpins", lbl: "発動する低確率回転数", sub: "0 で非搭載・未設定", v: s.yutimeSession?.triggerLowSpins ?? s.ceilingRot, unit: "回" },
                            { key: "durationSpins", lbl: "遊タイム回数", sub: "電サポが続く規定回数", v: s.yutimeSession?.durationSpins ?? 0, unit: "回" },
                            { key: "expectedNetBalls", lbl: "スルー込み平均純増玉", sub: "電サポ増減も含む。0玉も有効", v: s.yutimeSession?.expectedNetBalls ?? "", unit: "玉" },
                            { key: "assumedStart1K", lbl: "想定1K回転率", sub: "実測前の暫定計算に使用", v: s.yutimeSession?.assumedStart1K ?? s.border, unit: "回/K" },
                        ].map(({ key, lbl, sub, v, unit }) => (
                            <div key={lbl} className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{lbl}</div>
                                    {sub && <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{sub}</div>}
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <NI ariaLabel={lbl} validate={key === "expectedNetBalls" ? validateFinite : validateNonNegative} v={v} set={(value) => updateManualYutime(key, value)} w={80} center />
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
                            right={<Toggle label="貯玉を収支に含める" value={s.includeChodamaInBalance} onChange={s.setIncludeChodamaInBalance} color="var(--settings-accent)" />} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
                            <div>
                                <div style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>1日の再プレイ上限</div>
                                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>上限到達時に警告を表示します</div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <NI ariaLabel="1日の再プレイ上限" validate={validateNonNegative} v={s.chodamaReplayLimit} set={s.setChodamaReplayLimit} w={80} center />
                                <span style={{ fontSize: 11, color: C.sub, minWidth: 20 }}>玉</span>
                            </div>
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 貯玉データサブビュー（店舗別残高 + 入出金履歴） ──
    if (showChodamaDataView) {
        const storeObjs = (s.stores || []).filter(st => typeof st === "object" && st.name);
        const logEntries = [...(s.chodamaLog || [])].sort(
            (a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || 0) - (a.id || 0)
        );
        const typeLabel = { deposit: "預入", withdraw: "引出", adjust: "調整" };
        const typeColor = { deposit: C.green, withdraw: C.red, adjust: C.blue };
        const fieldStyle = {
            width: "100%", boxSizing: "border-box", background: C.bg,
            border: `1px solid ${C.borderHi}`, borderRadius: 8, padding: "12px",
            fontSize: 16, color: C.text, fontFamily: font, outline: "none", minHeight: 44,
        };

        const recordChodama = () => {
            const store = storeObjs.find(st => String(st.id) === String(chodamaFormStoreId));
            const ballsNum = Math.round(Number(chodamaFormBalls) || 0);
            if (!store) { showToast("店舗を選択してください", "warn"); return; }
            if (ballsNum <= 0) { showToast("玉数を入力してください", "warn"); return; }
            const before = Number(store.chodama) || 0;
            let after = before;
            if (chodamaFormType === "deposit") after = before + ballsNum;
            else if (chodamaFormType === "withdraw") after = Math.max(0, before - ballsNum);
            else after = ballsNum; // adjust = 残高を絶対値でセット
            s.setStores(prev => prev.map(st =>
                (typeof st === "object" && st.id === store.id) ? { ...st, chodama: after } : st
            ));
            const entry = {
                id: Date.now(),
                date: chodamaFormDate || localDateStr(),
                storeId: store.id,
                storeName: store.name,
                type: chodamaFormType,
                balls: ballsNum,
                balanceBefore: before,
                balanceAfter: after,
                memo: chodamaFormMemo || "",
            };
            s.setChodamaLog(prev => [entry, ...(prev || [])]);
            setChodamaFormBalls("");
            setChodamaFormMemo("");
            showToast(`「${store.name}」に記録しました（残高 ${f(after)}玉）`);
        };

        const deleteLog = (id) => {
            s.setChodamaLog(prev => (prev || []).filter(e => e.id !== id));
            showToast("履歴を削除しました（残高は変わりません）", "warn");
        };

        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="貯玉データ" onBack={() => setShowChodamaDataView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>

                    {/* 店舗別 貯玉残高 */}
                    <SectionLabel label="店舗別 貯玉残高" />
                    <Section>
                        {storeObjs.length === 0 ? (
                            <div style={{ padding: "16px", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                                登録された店舗がありません。「データ管理 → 店舗検索・登録」で店舗を追加してください。
                            </div>
                        ) : (
                            storeObjs.map((st) => (
                                <Row
                                    key={st.id}
                                    IconComp={IconDiamond}
                                    iconColor={C.purple}
                                    label={st.name}
                                    sub="タップで下のフォームに選択"
                                    onPress={() => setChodamaFormStoreId(String(st.id))}
                                    right={<span style={{ fontSize: 15, fontWeight: 800, color: C.purple, fontFamily: mono }}>{f(Number(st.chodama) || 0)} 玉</span>}
                                />
                            ))
                        )}
                    </Section>

                    {/* 入出金を記録 */}
                    <SectionLabel label="入出金を記録" />
                    <Section>
                        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>店舗</div>
                                <select value={chodamaFormStoreId} onChange={(e) => setChodamaFormStoreId(e.target.value)} style={fieldStyle}>
                                    <option value="">店舗を選択</option>
                                    {storeObjs.map((st) => (
                                        <option key={st.id} value={String(st.id)}>{st.name}（{f(Number(st.chodama) || 0)}玉）</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>種別</div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {[
                                        { id: "deposit", label: "預入 (+)" },
                                        { id: "withdraw", label: "引出 (−)" },
                                        { id: "adjust", label: "調整 (=)" },
                                    ].map(({ id, label }) => {
                                        const active = chodamaFormType === id;
                                        return (
                                            <button key={id} className="b" onClick={() => setChodamaFormType(id)} style={{
                                                flex: 1, minHeight: 44, borderRadius: 8, cursor: "pointer",
                                                border: active ? `2px solid ${typeColor[id]}` : `1px solid ${C.border}`,
                                                background: active ? `${typeColor[id]}22` : C.surfaceHi,
                                                color: active ? typeColor[id] : C.text, fontSize: 13, fontWeight: active ? 700 : 500,
                                                fontFamily: font, WebkitTapHighlightColor: "transparent",
                                            }}>{label}</button>
                                        );
                                    })}
                                </div>
                                <div style={{ fontSize: 10, color: C.sub, marginTop: 4 }}>
                                    {chodamaFormType === "adjust" ? "調整: 入力した玉数を残高にそのままセットします" : chodamaFormType === "withdraw" ? "引出: 残高から差し引きます" : "預入: 残高に加算します"}
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>玉数</div>
                                    <NI ariaLabel="貯玉データの玉数" validate={validatePositive} v={chodamaFormBalls} set={setChodamaFormBalls} w="100%" center ph="2500" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>日付</div>
                                    <input type="date" value={chodamaFormDate} onChange={(e) => setChodamaFormDate(e.target.value)} style={fieldStyle} />
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 600 }}>メモ（任意）</div>
                                <input type="text" value={chodamaFormMemo} onChange={(e) => setChodamaFormMemo(e.target.value)} placeholder="例: 全部交換 / 持ち越し" style={fieldStyle} />
                            </div>
                            <Btn label="記録する" onClick={recordChodama} primary fs={15} />
                        </div>
                    </Section>

                    {/* 入出金履歴 */}
                    <SectionLabel label="入出金履歴" />
                    <Section>
                        {logEntries.length === 0 ? (
                            <div style={{ padding: "16px", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                                まだ履歴がありません。上のフォームから記録してください。
                            </div>
                        ) : (
                            logEntries.map((e) => (
                                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: typeColor[e.type] || C.subHi, background: `${typeColor[e.type] || C.sub}22`, borderRadius: 4, padding: "2px 6px" }}>{typeLabel[e.type] || e.type}</span>
                                            <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{e.storeName}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: C.sub, marginTop: 3 }}>
                                            {e.date}・残高 {f(e.balanceAfter)}玉{e.memo ? `・${e.memo}` : ""}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: mono, color: typeColor[e.type] || C.text }}>
                                            {e.type === "adjust" ? "=" : e.type === "withdraw" ? "−" : "+"}{f(e.balls)}
                                        </div>
                                    </div>
                                    <button className="b" aria-label={`${e.storeName}の貯玉履歴を削除`} onClick={() => deleteLog(e.id)} style={{
                                        background: "transparent", border: "none", color: C.sub, fontSize: 18,
                                        width: 44, height: 44, cursor: "pointer", flexShrink: 0,
                                    }}>✕</button>
                                </div>
                            ))
                        )}
                        <div style={{ padding: "12px 16px", fontSize: 10, color: C.sub, lineHeight: 1.6 }}>
                            ※ 残高の真実源は店舗ごとの貯玉です。履歴の削除は残高に影響しません。
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── 島マップ管理サブビュー（全面リニューアル：島レイアウト管理画面） ──
    // 旧「島一覧」中心のホールマップ編集を、「この店舗の島構成を俯瞰する」レイアウト管理画面へ再設計。
    // データの実体は App.jsx の pt_hallMaps（s.hallMaps）。戦略マップと同じ世界観で自己完結する。
    if (showHallMapView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <IslandMapManager
                    store={hallMapStore}
                    stores={normalizedStores}
                    onChangeStore={handleChangeHallMapStore}
                    islands={hallMapIslands}
                    onChangeIslands={handleChangeHallMapIslands}
                    onBack={() => setShowHallMapView(false)}
                />
                <ToastPortal />
            </div>
        );
    }

    // ── バックアップサブビュー ──
    if (showBackupView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="データ入出力" onBack={() => setShowBackupView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(84px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="全データバックアップ" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                実践記録・収支・設定・機種・店舗など、端末内の全データを1つのファイルに保存します。アプリを削除する前に実行してください。
                            </div>
                            <div style={{ fontSize: 11, color: C.orange, marginBottom: 14, lineHeight: 1.6 }}>
                                PINとAI APIキーは安全のため含まれません。利用再開時にこの端末で再設定してください。
                            </div>
                            <Btn label="全データをバックアップ" onClick={backupAllData} bg={C.green} fg="#fff" bd="none" />
                        </div>
                    </Section>

                    <SectionLabel label="バックアップから復元" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                保存したバックアップファイル（.json）を選ぶと、実践データを元に戻せます。復元前に確認画面が表示されます。
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

                    <SectionLabel label="収支CSV" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                収支分析に使うアーカイブデータをCSV形式で出力・取り込みできます。
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                <Btn label="CSVエクスポート" onClick={exportArchiveCSV} bg={C.orange} fg="#fff" bd="none" />
                                <label style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    minHeight: 44, boxSizing: "border-box",
                                    background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                    color: C.text, fontSize: 14, padding: "12px 16px", fontFamily: font, fontWeight: 600,
                                    textAlign: "center", cursor: "pointer",
                                }}>
                                    CSVインポート
                                    <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={importArchiveCSV} style={{ display: "none" }} />
                                </label>
                            </div>
                        </div>
                    </Section>

                    <SectionLabel label="収支データ整理" />
                    <Section>
                        <div style={{ padding: "14px 16px" }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.6 }}>
                                重複データとCSVから取り込んだデータを整理できます。
                            </div>
                            <Btn
                                label={countDuplicateArchives() > 0 ? `重複データを削除（${countDuplicateArchives()}件）` : "重複データはありません"}
                                onClick={deleteDuplicateArchives}
                                bg={countDuplicateArchives() > 0 ? C.orange : C.surfaceHi}
                                fg={countDuplicateArchives() > 0 ? "#fff" : C.sub}
                                bd={countDuplicateArchives() > 0 ? "none" : C.border}
                                disabled={countDuplicateArchives() <= 0}
                            />
                            {(s.archives || []).some(a => a.isImported) && (
                                <div style={{ marginTop: 10 }}>
                                    <Btn
                                        label={`CSVインポートデータを削除（${(s.archives || []).filter(a => a.isImported).length}件）`}
                                        onClick={deleteImportedArchives}
                                        bg={C.red}
                                        fg="#fff"
                                        bd="none"
                                    />
                                </div>
                            )}
                        </div>
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }


    // ── セッション初期化サブビュー ──
    if (showAdvancedView) {
        return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <style>{`.settings-row:last-child{border-bottom:none!important}`}</style>
                <SubHeader title="データをリセット" onBack={() => setShowAdvancedView(false)} />
                <div style={{ flex: 1, overflowY: "auto", padding: "0 14px calc(72px + env(safe-area-inset-bottom))" }}>
                    <SectionLabel label="セッションの初期化" />
                    <Section danger>
                        {!confirming ? (
                            <Row IconComp={IconTrash} iconColor={C.red} label="データをリセット" sub="現在のセッション内データだけを消去します" danger onPress={() => setConfirming(true)} />
                        ) : (
                            <div style={{ padding: "16px" }}>
                                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 }}>本当にリセットしますか？</div>
                                <div style={{ fontSize: 12, color: C.sub, marginBottom: 14, lineHeight: 1.6 }}>
                                    現在のセッション内の回転数・獲得出玉・入力履歴が消去されます。保存済み収支・店舗の貯玉・会員カード・設定値は保持されます。この操作は元に戻せません。
                                </div>
                                <div style={{ display: "flex", gap: 10 }}>
                                    <Btn label="本当にリセット" onClick={() => { onReset(); setConfirming(false); }} bg={C.red} fg="#fff" bd="none" />
                                    <Btn label="キャンセル" onClick={() => setConfirming(false)} bg={C.surfaceHi} fg={C.text} bd={C.borderHi} />
                                </div>
                            </div>
                        )}
                    </Section>
                </div>
                <ToastPortal />
            </div>
        );
    }

    // ── メイン設定（分析OS風ダークUI、全1カラム縦リスト） ──
    // 環境プロファイル用の値
    const rateDisplay = `${Number(s.exRate || 250) / 10}玉交換`;
    const exLabelShort = exRateKey === "4.00" ? "等価"
        : exRateKey ? `${exRateKey}円`
        : `${yenPerBall.toFixed(2)}円`;
    const borderShort = calcBorder > 0 ? `${f(calcBorder, 1)}/K` : "—";
    const appVersion = import.meta.env.PACKAGE_VERSION || "0.0.0";
    const autoLockLabel = s.autoLockMinutes === "background"
        ? "バックグラウンド移動時"
        : Number(s.autoLockMinutes) > 0 ? `${Number(s.autoLockMinutes)}分後` : "オフ";
    const verifyingPin = pinSetStep === "verify-disable" || pinSetStep === "verify-change";
    const pinEntryValue = verifyingPin ? pinCurrent : (pinSetStep === "enter" ? pinDraft : pinConfirm);
    const pinStepTitle = pinSetStep === "verify-disable"
        ? "現在のPINを入力してロックを解除"
        : pinSetStep === "verify-change"
            ? "現在のPINを確認"
            : pinSetStep === "enter" ? "新しいPINを入力（4桁）" : "PINを再入力して確認";
    // 「現在の遊技環境」サマリーカード用の値
    const storeCount = (s.stores || []).length;
    // 貯玉残高の合計（店舗オブジェクトの chodama を集計）と「要確認」判定
    const chodamaTotal = (s.stores || []).reduce(
        (a, st) => a + (typeof st === "object" ? Number(st.chodama) || 0 : 0), 0
    );
    const chodamaUnset = chodamaTotal === 0 && (s.chodamaLog || []).length === 0;

    // 情報アイコン（i）。既存に IconInfo が無いため svgProps を流用した極小コンポーネント
    const IconInfo = () => (<svg {...svgProps}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/></svg>);

    // 「要確認」ピル（オレンジ系・小バッジ）
    const WarnPill = () => (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "color-mix(in srgb, var(--orange) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--orange) 34%, transparent)",
            borderRadius: 999, padding: "3px 9px", flexShrink: 0,
            fontSize: 10.5, fontWeight: 700, color: "var(--orange)", whiteSpace: "nowrap",
        }}>⚠ 要確認</span>
    );

    // 設定用アイコン枠。テーマ色に関係なく発光させず、文字の判読を優先する。
    const SettingsIconBox = ({ IconComp, size = 44 }) => (
        <div style={{
            width: size, height: size, borderRadius: size * 0.30,
            background: "var(--settings-icon-bg)",
            border: "1px solid var(--settings-icon-line)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--settings-icon-color)", flexShrink: 0,
        }}>
            {IconComp ? <IconComp /> : null}
        </div>
    );

    // A案（ダーク）/B案（ライト）で共通利用するフラットカード。
    const glassCardStyle = {
        background: "var(--settings-card)",
        border: "1px solid var(--settings-line)",
        borderRadius: "var(--settings-radius)",
        overflow: "hidden",
    };

    // セクション見出し（カード外、左寄せの小ラベル）
    const SectionLabelV2 = ({ label }) => (
        <div style={{
            padding: "4px 6px 8px",
            fontSize: 12.5, fontWeight: 700, color: "var(--sub)",
            letterSpacing: 0.4,
        }}>{label}</div>
    );

    // 縦リストの1行（1カラム共通）
    // - iPhone片手操作のため最小高さ 60px（タップ領域 >= 44px の余裕を確保）
    // - 文字は 1〜2 行で省略、サブテキストは長くても 1 行で …
    const ListRow = ({ IconComp, label, sub, onPress, right, isLast }) => {
        const Tag = onPress ? "button" : "div";
        return (
            <Tag className="b settings-list-row" onClick={onPress || undefined} style={{
                width: "100%", background: "transparent", border: "none",
                display: "flex", alignItems: "center", gap: 12,
                padding: "13px 14px", cursor: onPress ? "pointer" : "default",
                textAlign: "left", WebkitTapHighlightColor: "transparent",
                borderBottom: isLast ? "none" : "1px solid var(--settings-line)",
                minHeight: 60,
            }}>
                {IconComp && <SettingsIconBox IconComp={IconComp} size={40} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 14.5, color: C.text, fontWeight: 600, lineHeight: 1.3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</div>
                    {sub && <div style={{
                        fontSize: 11.5, color: "var(--sub)", marginTop: 3, lineHeight: 1.3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{sub}</div>}
                </div>
                {right !== undefined ? right : (onPress ? <span style={{ fontSize: 16, color: "var(--sub)", flexShrink: 0, fontWeight: 400 }}>›</span> : null)}
            </Tag>
        );
    };

    // セクションカード（縦リストをまとめる）
    const SectionCard = ({ children }) => (
        <div style={{ ...glassCardStyle, marginBottom: 18 }}>{children}</div>
    );

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--settings-bg)" }}>

            {/* ── スクロールコンテンツ（ヘッダーも内側に置き、固定せずスクロール追従させる） ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 14px calc(72px + env(safe-area-inset-bottom))" }}>

                {/* ── タイトル ── */}
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.text, fontFamily: font, letterSpacing: -0.6, lineHeight: 1.05 }}>設定</div>
                    <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 4, fontFamily: font }}>アプリの各種設定を管理します</div>
                    <div style={{ fontSize: 10.5, color: "var(--settings-good)", marginTop: 5, fontFamily: font }}>✓ 変更はこの端末へ自動保存されます</div>
                </div>

                {/* ── 貸玉・交換率（サマリーカード） ── */}
                <button
                    className="b"
                    onClick={() => {
                        setShowGameSettingsView(true);
                    }}
                    style={{
                        ...glassCardStyle,
                        width: "100%", textAlign: "left",
                        borderLeft: "var(--settings-summary-rule)",
                        padding: "14px", marginBottom: 18,
                        cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    }}
                >
                    {/* 上段：見出し + 情報アイコン + chevron */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>貸玉・交換率</span>
                                <span aria-hidden="true" style={{ color: "var(--settings-accent)", display: "inline-flex" }}><IconInfo /></span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 3 }}>収支計算に使う玉数と交換率を確認</div>
                        </div>
                        <span style={{ fontSize: 16, color: "var(--sub)", flexShrink: 0, fontWeight: 400 }}>›</span>
                    </div>
                    {/* 下段：3指標（横スクロール禁止＝flex 等幅） */}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {[
                            { label: "貸玉", value: `${Number(s.rentBalls || 250) / 10}玉`, warn: false },
                            { label: "交換率", value: rateDisplay, warn: false },
                            { label: "玉単価", value: `${yenPerBall.toFixed(2)}円`, warn: false },
                        ].map((m) => (
                            <div key={m.label} style={{
                                flex: 1, minWidth: 0,
                                background: "var(--settings-card-alt)",
                                border: "1px solid var(--settings-line)",
                                borderRadius: 10, padding: "10px 8px", textAlign: "center",
                            }}>
                                <div style={{ fontSize: 10.5, color: "var(--sub)", marginBottom: 4 }}>{m.label}</div>
                                <div style={{
                                    fontSize: 14, fontWeight: 800, lineHeight: 1.2,
                                    color: m.warn ? "var(--orange)" : C.text,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{m.value}</div>
                                {m.warn && <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}><WarnPill /></div>}
                            </div>
                        ))}
                    </div>
                </button>

                {/* ── 1. 最初に設定する（1カラム縦リスト） ── */}
                <SectionLabelV2 label="最初に設定する" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--blue)", icon: IconExchange,   label: "レート・交換率",   sub: `${Number(s.exRate || 250) / 10}玉 / ${exLabelShort}・収支計算に使用`, onPress: () => setShowGameSettingsView(true) },
                            { color: "var(--green)", icon: IconStore,      label: "店舗検索・登録",   sub: `利用可能な店舗データ: ${storeCount}件`,                                       onPress: () => setShowStoreSearch(true) },
                            { color: "var(--teal)", icon: IconMagnifier,  label: "機種検索・登録",   sub: `カスタム機種: ${(s.customMachines || []).length}件`,                          onPress: () => setShowMachineSearch(true) },
                            { color: "var(--orange)", icon: IconCoin,       label: "貯玉設定",         sub: s.includeChodamaInBalance ? "収支に含める / 再プレイ上限あり" : "収支に含めない", onPress: () => setShowChodamaView(true), warn: chodamaUnset },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                                right={it.warn ? (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                        <WarnPill />
                                        <span style={{ fontSize: 16, color: "var(--sub)", fontWeight: 400 }}>›</span>
                                    </span>
                                ) : undefined}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 2. 遊技データ（1カラム縦リスト） ── */}
                <SectionLabelV2 label="遊技データ" />
                <SectionCard>
                    {(() => {
                        const hallMapIslandCount = Array.isArray(hallMapIslands) ? hallMapIslands.length : 0;
                        const items = [
                            { color: "var(--teal)", icon: IconDiamond,     label: "貯玉データ",       sub: "店舗別残高 / 入出金履歴",                                                       onPress: () => setShowChodamaDataView(true) },
                            { color: "var(--teal)", icon: IconGrid,       label: "店舗レイアウト",   sub: hallMapStore ? `${hallMapStore.name || "店舗"} ・ ${hallMapIslandCount}島` : "店舗を登録すると編集できます", onPress: () => setShowHallMapView(true) },
                            { color: "var(--red)", icon: IconTarget,     label: "機種スペック設定", sub: `${s.synthDenom || 319.6} / ${borderShort}`,                                     onPress: () => setShowMachineSpecView(true) },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 3. データ管理（1カラム縦リスト） ── */}
                <SectionLabelV2 label="データ管理" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--blue)", icon: IconCloud,      label: "データの保存・復元", sub: "JSON全体バックアップ",                  onPress: () => setShowBackupView(true) },
                            { color: "var(--purple)", icon: IconCsv,        label: "CSV入出力",         sub: "収支データのインポート / エクスポート",  onPress: () => setShowBackupView(true) },
                            { color: "var(--red)", icon: IconTrash,       label: "データをリセット",   sub: "現在のセッションだけを初期化",            onPress: () => setShowAdvancedView(true) },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 4. 表示・通知（1カラム縦リスト） ── */}
                <SectionLabelV2 label="表示・通知" />
                <SectionCard>
                    {(() => {
                        const items = [
                            { color: "var(--purple)", icon: IconPaint,      label: "テーマ・カラー",     sub: "ダーク / 配色 / アクセシビリティ", onPress: () => setShowAppearanceView(true) },
                            { color: "var(--purple)", icon: IconBell,       label: "通知設定",           sub: "4種類のアプリ内通知", onPress: () => setShowNotificationView(true) },
                            { color: "var(--blue)", icon: IconChartBars,  label: "グラフ・表示設定",   sub: "形式 / 表示項目 / 単位", right: <ComingSoonBadge /> },
                        ];
                        return items.map((it, i) => (
                            <ListRow
                                key={it.label}
                                color={it.color}
                                IconComp={it.icon}
                                label={it.label}
                                sub={it.sub}
                                onPress={it.onPress}
                                isLast={i === items.length - 1}
                                right={it.right}
                            />
                        ));
                    })()}
                </SectionCard>

                {/* ── 5. セキュリティ（1カラム縦リスト・4項目） ── */}
                <SectionLabelV2 label="セキュリティ" />
                <SectionCard>
                    {/* アプリロック（Toggle） */}
                    <ListRow
                        color="var(--blue)"
                        IconComp={IconLock}
                        label="アプリロック"
                        sub={s.appLock ? (s.appPin ? "PIN設定済み" : "PIN未設定") : "オフ"}
                        right={
                            <Toggle
                                label="アプリロック"
                                value={s.appLock}
                                onChange={(v) => {
                                    setPinSetError(false);
                                    setPinCurrent(""); setPinDraft(""); setPinConfirm("");
                                    if (!v && s.appPin) { setPinSetStep("verify-disable"); }
                                    else if (!v) { s.setAppLock(false); setPinSetStep("idle"); }
                                    else if (!s.appPin) { s.setAppLock(true); setPinSetStep("enter"); setPinDraft(""); }
                                    else s.setAppLock(true);
                                }}
                                color="var(--settings-accent)"
                            />
                        }
                    />
                    {/* 自動ロック（chevron） */}
                    <ListRow
                        color="var(--purple)"
                        IconComp={IconFaceId}
                        label="自動ロック"
                        sub={s.appPin ? autoLockLabel : "PIN設定後に利用できます"}
                        onPress={() => setShowAutoLockView(true)}
                    />
                    {s.appPin && (
                        <ListRow
                            color="var(--green)"
                            IconComp={IconKey}
                            label="PINを変更"
                            sub="現在のPINを確認して変更します"
                            onPress={() => {
                                setPinSetError(false); setPinCurrent(""); setPinDraft(""); setPinConfirm("");
                                setPinSetStep("verify-change");
                            }}
                        />
                    )}
                    {/* 生体認証でのロック（chevron） */}
                    <ListRow
                        color="#22d3ee"
                        IconComp={IconFingerprint}
                        label="生体認証でのロック"
                        sub="対応端末向け機能"
                        right={<ComingSoonBadge />}
                        isLast
                    />

                    {/* PIN設定UI（展開時のみ表示） */}
                    {pinSetStep !== "idle" && (
                        <div style={{
                            margin: "0 14px 14px", padding: "14px", borderRadius: 12,
                            background: "var(--settings-card-alt)",
                            border: "1px solid var(--settings-line)",
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                                {pinStepTitle}
                            </div>
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
                                {[0,1,2,3].map(i => {
                                    const val = pinEntryValue;
                                    return (
                                        <div key={i} style={{
                                            width: 14, height: 14, borderRadius: 7,
                                            background: val.length > i ? (pinSetError ? C.red : "var(--settings-accent)") : "rgba(128,128,128,0.3)",
                                            transition: "background 0.15s ease",
                                        }} />
                                    );
                                })}
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input
                                     type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4}
                                    aria-label={pinStepTitle}
                                    value={pinEntryValue}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                                        if (verifyingPin) setPinCurrent(v);
                                        else if (pinSetStep === "enter") setPinDraft(v);
                                        else setPinConfirm(v);
                                        setPinSetError(false);
                                    }}
                                    placeholder="••••"
                                    style={{
                                        flex: 1, background: C.bg,
                                        border: `1.5px solid ${pinSetError ? C.red : C.borderHi}`,
                                        borderRadius: 10, padding: "11px 12px", fontSize: 22, color: C.text,
                                        fontFamily: mono, outline: "none", letterSpacing: 10, textAlign: "center",
                                    }}
                                />
                                <button className="b" onClick={() => {
                                    const val = pinEntryValue;
                                    if (val.length !== 4 || !/^\d{4}$/.test(val)) { setPinSetError(true); return; }
                                    if (verifyingPin) {
                                        if (pinCurrent !== s.appPin) { setPinSetError(true); return; }
                                        if (pinSetStep === "verify-disable") {
                                            if (!window.confirm("アプリロックを解除し、保存済みのPINを削除しますか？")) return;
                                            s.setAppLock(false); s.setAppPin(""); s.setAutoLockMinutes(0); s.setIsLocked(false);
                                            setPinSetStep("idle"); setPinCurrent("");
                                            showToast("アプリロックを解除しました");
                                        } else {
                                            setPinSetStep("enter"); setPinCurrent(""); setPinDraft("");
                                        }
                                    } else if (pinSetStep === "enter") {
                                        setPinSetStep("confirm"); setPinConfirm(""); setPinSetError(false);
                                    } else {
                                        if (pinConfirm !== pinDraft) { setPinSetError(true); return; }
                                        s.setAppPin(pinConfirm); s.setAppLock(true); s.setIsLocked(false);
                                        setPinSetStep("idle"); setPinDraft(""); setPinConfirm("");
                                        showToast("PINを設定しました");
                                    }
                                }} style={{
                                     background: "var(--settings-accent)", border: "none", borderRadius: 10,
                                     color: "#fff", fontSize: 13, padding: "11px 18px", minHeight: 44,
                                    fontFamily: font, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                                }}>{verifyingPin ? "確認" : pinSetStep === "enter" ? "次へ" : "確定"}</button>
                                <button className="b" onClick={() => {
                                    setPinSetStep("idle"); setPinCurrent(""); setPinDraft(""); setPinConfirm(""); setPinSetError(false);
                                    if (!s.appPin) s.setAppLock(false);
                                }} style={{
                                     background: C.surfaceHi, border: `1px solid ${C.borderHi}`, borderRadius: 10,
                                     color: C.text, fontSize: 13, padding: "11px 14px", minHeight: 44,
                                    fontFamily: font, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                                }}>キャンセル</button>
                            </div>
                            {pinSetError && (
                                <div style={{ fontSize: 12, color: C.red, marginTop: 8, textAlign: "center" }}>
                                    {verifyingPin ? "現在のPINが一致しません" : pinSetStep === "enter" ? "4桁の数字を入力してください" : "PINが一致しません。もう一度入力してください"}
                                </div>
                            )}
                            {pinSetStep === "enter" && (
                                <div style={{ fontSize: 11, color: C.orange, marginTop: 10, lineHeight: 1.5 }}>
                                    PINを忘れるとロックを解除できません。忘れない番号を設定してください。
                                </div>
                            )}
                        </div>
                    )}
                </SectionCard>

                {/* ── 6. サポート（1カラム縦リスト） ── */}
                <SectionLabelV2 label="サポート" />
                <SectionCard>
                    <ListRow
                        color="var(--blue)"
                        IconComp={IconChat}
                        label="お問い合わせ"
                        sub="サポート / 不具合報告"
                        right={<ComingSoonBadge />}
                    />
                    <ListRow
                        color="var(--purple)"
                        IconComp={IconDoc}
                        label="利用規約・プライバシー"
                        sub="利用規約 / プライバシーポリシー"
                        right={<ComingSoonBadge />}
                        isLast
                    />
                </SectionCard>

                {/* ── 7. アプリ情報 ── */}
                <SectionLabelV2 label="アプリ情報" />
                <div style={{ ...glassCardStyle, padding: "14px", marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {/* アプリアイコン */}
                        <div style={{
                            width: 56, height: 56, borderRadius: 14,
                            background: "var(--settings-card-alt)",
                            border: "1px solid var(--settings-line)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 28, flexShrink: 0,
                        }}>🎰</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>パチトラッカー</div>
                            <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2, fontFamily: mono }}>Version {appVersion}</div>
                            <div style={{
                                fontSize: 10.5, color: "var(--sub-hi)", marginTop: 4, lineHeight: 1.3,
                                overflow: "hidden", textOverflow: "ellipsis",
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                            }}>パチンコデータをもっと賢く、もっと楽しく。</div>
                        </div>
                    </div>
                    {/* アップデート履歴 */}
                    <div aria-disabled="true" style={{
                        marginTop: 12, width: "100%",
                        background: "var(--settings-card-alt)",
                        border: "1px solid var(--settings-line)",
                        borderRadius: 12, padding: "11px 14px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        boxSizing: "border-box",
                        minHeight: 48,
                    }}>
                        <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>アップデート履歴</div>
                            <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>リリースノート</div>
                        </div>
                        <ComingSoonBadge />
                    </div>
                </div>

                <div style={{ height: 16 }} />
            </div>

            <ToastPortal />
        </div>
    );
}
