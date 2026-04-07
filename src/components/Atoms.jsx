import { C, font, mono } from "../constants";

/* ================================================================
   Simple SVG Line Chart component
================================================================ */
export function LineChart({ data, width = 320, height = 140, color = "#3b82f6", showZero = true }) {
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

export function NI({ v, set, w = 80, ph = "0", center = false, big = false, onEnter }) {
    return (
        <input
            type="number"
            inputMode="decimal"
            value={v}
            placeholder={ph}
            onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
            onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
            style={{
                width: w,
                background: C.bg,
                border: `1px solid ${C.borderHi}`,
                borderRadius: 8,
                color: C.text,
                fontFamily: mono,
                fontSize: big ? 22 : 16,
                fontWeight: big ? 700 : 500,
                padding: big ? "12px 14px" : "8px 10px",
                textAlign: center || big ? "center" : "right",
                outline: "none",
                transition: "border-color 0.2s ease",
            }}
            onFocus={(e) => (e.target.style.borderColor = C.blue)}
            onBlur={(e) => (e.target.style.borderColor = C.borderHi)}
        />
    );
}

export function KV({ label, val, unit, col, dim }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: dim ? "rgba(12, 12, 16, 0.5)" : "transparent",
            }}
        >
            <span style={{ fontSize: 12, color: dim ? C.sub + "99" : C.sub, fontFamily: font }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: col || C.text, fontFamily: mono }}>{val}</span>
                {unit && <span style={{ fontSize: 10, color: C.sub, fontFamily: font }}>{unit}</span>}
            </div>
        </div>
    );
}

export function Card({ children, style = {} }) {
    return (
        <div
            className="glass"
            style={{
                borderRadius: 16,
                overflow: "hidden",
                marginBottom: 12,
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                ...style,
            }}
        >
            {children}
        </div>
    );
}

export function SecLabel({ label, color }) {
    return (
        <div
            style={{
                padding: "12px 16px 8px",
                fontSize: 10,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: color || C.sub,
                fontFamily: font,
                fontWeight: 700,
                opacity: 0.8,
            }}
        >
            {label}
        </div>
    );
}

export function Btn({ label, onClick, bg = C.surfaceHi, fg = C.text, bd = C.borderHi, fs = 14, primary = false, small = false }) {
    return (
        <button
            className="b"
            onClick={onClick}
            style={{
                background: primary ? "linear-gradient(135deg, #3b82f6, #2563eb)" : bg,
                border: primary ? "none" : `1px solid ${bd}`,
                borderRadius: small ? 10 : 12,
                color: primary ? "#fff" : fg,
                fontSize: small ? 12 : fs,
                fontWeight: 700,
                padding: small ? "10px 0" : "16px 0",
                width: "100%",
                fontFamily: font,
                boxShadow: primary ? "0 4px 12px rgba(59, 130, 246, 0.3)" : "none",
            }}
        >
            {label}
        </button>
    );
}

export function MiniStat({ label, val, col }) {
    return (
        <div
            style={{
                flex: 1,
                textAlign: "center",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 10,
                padding: "10px 4px",
                border: `1px solid ${C.border}`,
            }}
        >
            <div style={{ fontSize: 9, color: C.sub, letterSpacing: 1, marginBottom: 4, fontFamily: font }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: col || C.text, fontFamily: mono, lineHeight: 1 }}>{val}</div>
        </div>
    );
}

export function InputGrid({ fields }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${fields.length}, 1fr)`, gap: 8, padding: "12px" }}>
            {fields.map(([lbl, v, s]) => (
                <div key={lbl}>
                    <div style={{ fontSize: 9, color: C.sub, marginBottom: 4, textAlign: "center", fontFamily: font }}>{lbl}</div>
                    <NI v={v} set={s} w="100%" center />
                </div>
            ))}
        </div>
    );
}

// モードの値と表示テキストのマッピング
const modeMap = {
    cash: { label: "現", fullLabel: "現金", color: C.blue },
    mochi: { label: "持", fullLabel: "持ち玉", color: C.orange },
    chodama: { label: "貯", fullLabel: "貯玉", color: C.purple },
};

export function ModeToggle({ mode, setMode, showChodama = false, compact = false }) {
    const modes = showChodama ? ["cash", "mochi", "chodama"] : ["cash", "mochi"];
    return (
        <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: 24, padding: 3, gap: 4 }}>
            {modes.map((m) => {
                const isActive = mode === m;
                const { label, fullLabel, color } = modeMap[m];
                return (
                    <button
                        key={m}
                        className="b"
                        onClick={() => setMode(m)}
                        style={{
                            background: isActive ? (color + "30") : "transparent",
                            border: isActive ? `1px solid ${color}50` : "1px solid transparent",
                            borderRadius: 20,
                            color: isActive ? color : C.sub,
                            fontSize: compact ? 11 : 12,
                            fontWeight: isActive ? 700 : 500,
                            padding: compact ? "5px 10px" : "6px 16px",
                            fontFamily: font,
                            boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                        }}
                    >
                        {compact ? label : fullLabel}
                    </button>
                );
            })}
        </div>
    );
}

// モード表示用バッジ（テーブル行用）
export function ModeBadge({ mode }) {
    const { label, color } = modeMap[mode] || modeMap.cash;
    return (
        <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: color,
            background: color + "20",
            borderRadius: 6,
            padding: "3px 7px",
            border: `1px solid ${color}40`,
        }}>
            {label}
        </span>
    );
}
