import { C, font, mono } from "../constants";

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
                background: C.surface,
                border: `1px solid ${C.borderHi}`,
                borderRadius: 10,
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
                padding: "14px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: dim ? C.surfaceHi : "transparent",
            }}
        >
            <span style={{ fontSize: 13, color: dim ? C.sub : C.subHi, fontFamily: font, fontWeight: 500 }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 17, fontWeight: 700, color: col || C.text, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                {unit && <span style={{ fontSize: 11, color: C.sub, fontFamily: font }}>{unit}</span>}
            </div>
        </div>
    );
}

export function Card({ children, style = {} }) {
    return (
        <div
            style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 16,
                overflow: "hidden",
                marginBottom: 12,
                boxShadow: "var(--card-shadow)",
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
                padding: "14px 16px 8px",
                fontSize: 11,
                letterSpacing: 0.5,
                color: color || C.sub,
                fontFamily: font,
                fontWeight: 600,
            }}
        >
            {label}
        </div>
    );
}

export function Btn({ label, onClick, bg, fg = C.text, bd = C.border, fs = 14, primary = false, small = false }) {
    return (
        <button
            className="b"
            onClick={onClick}
            style={{
                background: primary ? C.blue : (bg || C.surfaceHi),
                border: primary ? "none" : `1px solid ${bd}`,
                borderRadius: small ? 10 : 12,
                color: primary ? "#fff" : fg,
                fontSize: small ? 12 : fs,
                fontWeight: 700,
                padding: small ? "10px 0" : "14px 0",
                width: "100%",
                fontFamily: font,
                boxShadow: "none",
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
                background: C.surface,
                borderRadius: 12,
                padding: "10px 4px",
                border: `1px solid ${C.border}`,
            }}
        >
            <div style={{ fontSize: 10, color: C.sub, letterSpacing: 0.5, marginBottom: 4, fontFamily: font, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: col || C.text, fontFamily: mono, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</div>
        </div>
    );
}

export function InputGrid({ fields }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${fields.length}, 1fr)`, gap: 8, padding: "12px" }}>
            {fields.map(([lbl, v, s]) => (
                <div key={lbl}>
                    <div style={{ fontSize: 10, color: C.sub, marginBottom: 4, textAlign: "center", fontFamily: font, fontWeight: 600 }}>{lbl}</div>
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
        <div style={{ display: "flex", background: C.surfaceHi, borderRadius: 999, padding: 3, gap: 2, border: `1px solid ${C.border}` }}>
            {modes.map((m) => {
                const isActive = mode === m;
                const { label, fullLabel, color } = modeMap[m];
                return (
                    <button
                        key={m}
                        className="b"
                        onClick={() => setMode(m)}
                        style={{
                            background: isActive ? C.surface : "transparent",
                            border: "none",
                            borderRadius: 999,
                            color: isActive ? color : C.sub,
                            fontSize: compact ? 11 : 12,
                            fontWeight: isActive ? 700 : 500,
                            padding: compact ? "5px 10px" : "6px 16px",
                            fontFamily: font,
                            boxShadow: isActive ? "0 1px 2px rgba(17,24,39,0.08)" : "none",
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
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
            borderRadius: 6,
            padding: "3px 7px",
            border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        }}>
            {label}
        </span>
    );
}
