/* eslint-disable react-refresh/only-export-components */
import { useRef } from "react";
import { C, sp, font, mono } from "../../constants";
import { isYutimeTargetingSession } from "../yutime/yutimeCalculator";
import { getYutimeCardStage, shouldAutoShowYutimeCard } from "../yutime/yutimeFlow";

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

// 遊タイム状況カード（記録タブ用）
// - 遊タイム非搭載機では描画しない
// - 実戦中に必要な「残り回転・到達必要資金・到達率」だけをコンパクトに表示する
// - カード全体をタップすると、台選び画面と同じ詳細計算シートを開く
function LegacyYutimeEvCard({ result, spec, currentLowSpins = 0, rateSource = "assumed", playMode = "cash", onOpen }) {
    if (!isYutimeTargetingSession(spec)) return null;
    const isHeld = playMode === "mochi" || playMode === "chodama";
    const modeLabel = playMode === "chodama" ? "貯玉" : isHeld ? "持ち玉" : "現金";
    const canCompute = Boolean(result?.valid);
    const canShowArrival = Boolean(result?.arrivalReady && Number.isFinite(result?.selectedArrivalInvestment));
    const missingPayout = result?.missing?.includes("yutimeExpectedNetBalls");
    const statusLabel = rateSource === "measured" ? "実測" : "暫定";
    const fallbackRemaining = Number(spec?.triggerLowSpins) > 0
        ? Math.max(0, Math.round(Number(spec.triggerLowSpins) - Math.max(0, Number(currentLowSpins) || 0)))
        : null;
    const remainingLabel = Number.isFinite(result?.remainingSpins)
        ? result.remainingSpins.toLocaleString("ja-JP")
        : fallbackRemaining == null ? "—" : fallbackRemaining.toLocaleString("ja-JP");
    const arrivalLabel = canShowArrival ? Math.ceil(result.selectedArrivalInvestment - 1e-9).toLocaleString("ja-JP") : "—";
    const reachLabel = canCompute ? `${(result.reachProbability * 100).toFixed(1)}%` : "—";
    const ariaLabel = canShowArrival
        ? `遊タイム詳細。残り${remainingLabel}回、到達必要資金${arrivalLabel}円。${canCompute ? `到達率${reachLabel}` : "期待出玉の入力が必要"}`
        : `遊タイム詳細。残り${remainingLabel}回。${missingPayout ? "期待出玉の入力が必要" : "設定の確認が必要"}`;

    return (
        <button className="b" type="button" onClick={onOpen} aria-label={ariaLabel} style={{
            width: "100%",
            minHeight: 88,
            position: "relative",
            overflow: "hidden",
            textAlign: "left",
            color: C.text,
            background: "linear-gradient(135deg, rgba(245,158,11,0.10), var(--surface) 42%, rgba(15,23,42,0.94))",
            border: "1px solid rgba(245,180,0,0.88)",
            borderRadius: 16,
            padding: "11px 13px 11px 17px",
            boxShadow: "0 5px 18px rgba(0,0,0,0.30), inset 0 0 24px rgba(245,158,11,0.025)",
        }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderRadius: "0 4px 4px 0", background: C.yellow, boxShadow: `0 0 12px ${C.yellow}` }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: C.text, whiteSpace: "nowrap" }}>遊タイム</span>
                    <span style={{ padding: "2px 7px", borderRadius: 999, border: `1px solid ${rateSource === "measured" ? "rgba(56,189,248,0.42)" : "rgba(245,158,11,0.38)"}`, color: rateSource === "measured" ? C.blue : C.yellow, background: rateSource === "measured" ? "rgba(56,189,248,0.09)" : "rgba(245,158,11,0.08)", fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" }}>
                        {statusLabel}
                    </span>
                </div>
                <div style={{ flexShrink: 0, display: "flex", alignItems: "baseline", gap: 4, color: C.yellow }}>
                    <span style={{ fontSize: 10, fontWeight: 800 }}>残り</span>
                    <strong style={{ fontFamily: mono, fontVariantNumeric: "tabular-nums", fontSize: 24, lineHeight: 1, letterSpacing: "-0.02em" }}>{remainingLabel}</strong>
                    <span style={{ fontSize: 11, fontWeight: 800 }}>回</span>
                </div>
            </div>
            {canCompute || canShowArrival ? (
                <>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(64px, .65fr) auto", alignItems: "end", gap: 9, marginTop: 10 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 9, color: C.sub, whiteSpace: "nowrap" }}>到達必要資金（{modeLabel}）</div>
                            <div style={{ marginTop: 2, fontFamily: mono, fontVariantNumeric: "tabular-nums", color: C.text, whiteSpace: "nowrap" }}>
                                <strong style={{ fontSize: 19, lineHeight: 1 }}>{arrivalLabel}</strong><span style={{ marginLeft: 3, fontSize: 10, fontWeight: 800 }}>円</span>
                            </div>
                        </div>
                        <div style={{ minWidth: 0, paddingLeft: 9, borderLeft: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.sub, whiteSpace: "nowrap" }}>{canCompute ? "到達率" : "期待値"}</div>
                            <strong style={{ display: "block", marginTop: 2, fontFamily: mono, fontVariantNumeric: "tabular-nums", color: canCompute ? C.text : C.yellow, fontSize: canCompute ? 16 : 11, lineHeight: 1, whiteSpace: "nowrap" }}>{canCompute ? reachLabel : "未計算"}</strong>
                        </div>
                        <span style={{ alignSelf: "center", color: C.subHi, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>詳細を見る <span aria-hidden="true">›</span></span>
                    </div>
                    {!canCompute && <div style={{ marginTop: 7, color: C.yellow, fontSize: 9, fontWeight: 800 }}>平均獲得玉を入力すると、期待値と到達率も表示します。</div>}
                </>
            ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
                    <span style={{ color: C.yellow, fontSize: 11, fontWeight: 800 }}>{missingPayout ? "期待出玉を設定してください" : "遊タイム条件を確認してください"}</span>
                    <span style={{ color: C.subHi, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>詳細を見る <span aria-hidden="true">›</span></span>
                </div>
            )}
        </button>
    );
}

// 詳細データタブ専用 スタイルヘルパー（分析OS風 ダークUI）
function YutimeEvCard({ result, spec, activeRun, normalEv, currentLowSpins = 0, rateSource = "assumed", playMode = "cash", onOpen }) {
    if (!shouldAutoShowYutimeCard({ spec, result, activeRun })) return null;
    const stage = getYutimeCardStage({ spec, result, activeRun });
    const isActive = stage === "active";
    const isReady = stage === "ready";
    const isHeld = playMode === "mochi" || playMode === "chodama";
    const modeLabel = playMode === "chodama" ? "貯玉" : isHeld ? "持ち玉" : "現金";
    const remaining = Number.isFinite(result?.remainingSpins) ? result.remainingSpins : Math.max(0, Number(spec?.triggerLowSpins || 0) - Number(currentLowSpins || 0));
    const reach = result?.valid ? `${(Number(result.reachProbability || 0) * 100).toFixed(1)}%` : "未計算";
    const arrival = result?.arrivalReady && Number.isFinite(result?.selectedArrivalInvestment) ? `${Math.ceil(result.selectedArrivalInvestment).toLocaleString("ja-JP")}円` : "—";
    const decisionEv = result?.valid ? `${result.selectedEV >= 0 ? "+" : ""}${Math.round(result.selectedEV).toLocaleString("ja-JP")}円` : "期待出玉未確認";
    const measuredStart = Number(normalEv?.effectiveStart1K ?? normalEv?.start1KCorrected ?? normalEv?.start1K) || 0;
    const supportCash = Math.max(0, Number(activeRun?.supportCashYen) || 0);
    const activePlayMode = activeRun?.playMode === "mochi" || activeRun?.playMode === "chodama" ? activeRun.playMode : "cash";
    const activeModeLabel = activePlayMode === "chodama" ? "貯玉" : activePlayMode === "mochi" ? "持ち玉" : "現金";
    const supportSpins = Math.max(0, Math.round(Number(activeRun?.supportSpins) || 0));
    const durationSpins = Math.max(0, Math.round(Number(activeRun?.durationSpins) || Number(spec?.durationSpins) || 0));
    const supportProgress = supportSpins > 0
        ? `${supportSpins.toLocaleString()} / ${durationSpins > 0 ? durationSpins.toLocaleString() : "—"}回`
        : `未入力 / ${durationSpins > 0 ? `${durationSpins.toLocaleString()}回` : "規定未確認"}`;
    const startAsset = activePlayMode === "cash"
        ? "現金遊技"
        : `${Math.max(0, Math.round(Number(activeRun?.startBalls) || 0)).toLocaleString()}玉`;
    const actionStyle = (primary = false) => ({ minHeight: 44, borderRadius: 11, border: `1px solid ${primary ? "rgba(245,180,0,.9)" : C.border}`, background: primary ? "linear-gradient(135deg,#f59e0b,#fbbf24)" : "var(--surface-hi)", color: primary ? "#17120a" : C.text, fontWeight: 900, fontSize: 12, fontFamily: font, padding: "0 10px" });

    return (
        <section aria-label="遊タイム判断" style={{ width: "100%", minHeight: isActive ? 218 : 190, flexShrink: 0, boxSizing: "border-box", position: "relative", overflow: "hidden", color: C.text, background: "linear-gradient(135deg,rgba(245,158,11,.12),var(--surface) 48%,rgba(15,23,42,.96))", border: "1px solid rgba(245,180,0,.78)", borderRadius: 16, padding: "13px 13px 12px 17px", boxShadow: "0 5px 18px rgba(0,0,0,.30)" }}>
            <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 4, borderRadius: "0 4px 4px 0", background: C.yellow }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                <div><div style={{ fontSize: 14, fontWeight: 900, color: C.yellow }}>{isActive ? "遊タイム中" : isReady ? "遊タイム到達" : "遊タイムが近づいています"}</div><div style={{ marginTop: 3, fontSize: 9, color: C.sub }}>{isActive ? `突入時 ${activeRun.entryLowSpins || 0}回・追加投資 ${supportCash.toLocaleString()}円` : `通常打ちを自動監視・${rateSource === "measured" ? "実測" : "暫定"}回転率`}</div></div>
                {!isActive && <div style={{ textAlign: "right", color: C.yellow }}><span style={{ fontSize: 10 }}>残り </span><strong style={{ fontFamily: mono, fontSize: 26 }}>{Math.round(remaining).toLocaleString()}</strong><span style={{ fontSize: 10 }}> 回</span></div>}
            </div>
            {!isActive ? <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 12 }}>{[["現在からの判断EV", decisionEv], ["遊タイム到達率", reach], [`到達必要資金（${modeLabel}）`, arrival]].map(([label, value]) => <div key={label} style={{ minWidth: 0 }}><div style={{ fontSize: 8, color: C.sub }}>{label}</div><div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div></div>)}</div>
                <div style={{ marginTop: 7, fontSize: 9, color: C.sub }}>通常当たり込みの将来判断EVです。累計期待値へ加算します。{measuredStart > 0 ? ` 実測 ${measuredStart.toFixed(1)}回/K。` : ""}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <div style={{ color: isReady ? C.yellow : C.subHi, fontSize: 10, fontWeight: 800, lineHeight: 1.45 }}>
                        {isReady ? "右下の「＋イベント」から突入を記録" : "接近状況を自動更新しています"}
                    </div>
                    <button className="b" type="button" style={actionStyle(false)} onClick={onOpen}>条件・根拠</button>
                </div>
            </> : <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px 12px", marginTop: 14 }}>
                    {[
                        ["消化回転 / 規定", supportProgress],
                        [activePlayMode === "cash" ? "突入時の遊技方法" : `突入時の${activeModeLabel}`, startAsset],
                        ["突入後の追加投資", `${supportCash.toLocaleString()}円`],
                        ["記録方法", "＋イベント"],
                    ].map(([label, value]) => <div key={label} style={{ minWidth: 0 }}><div style={{ fontSize: 8, color: C.sub }}>{label}</div><div style={{ marginTop: 3, fontSize: 13, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div></div>)}
                </div>
                <div style={{ marginTop: 12, padding: "9px 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(15,23,42,.38)", color: C.subHi, fontSize: 10, fontWeight: 700, lineHeight: 1.45 }}>
                    通常回転の集計は停止中です。右下の「＋イベント」から、当たり・スルー・貸玉追加を記録してください。
                </div>
            </>}
        </section>
    );
}

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

export { LineChart, TMONO, twSc, SectionLabel, MultiLineChart, WageRankCard, InfoIcon, PencilIcon, LightbulbIcon, CoinIcon, SwapIcon, StoreIcon, HashIcon, MachinePlaceholder, SectionHeader, SettingPill, hasRotDataRows, EmptySub, UndoControls, jackpotTone, FlowValueCard, FlowChoiceButton, effectiveEv, LegacyYutimeEvCard, YutimeEvCard, dataCardStyle, sessionScheduleErrorMessage, cardHeaderStyle, cardNumDot, cardTitleStyle, subCardStyle, subCardLabel };
