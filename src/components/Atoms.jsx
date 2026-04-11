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
                padding: small ? "14px 0" : "16px 0",
                minHeight: 44,
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
            <div style={{ fontSize: 11, color: C.sub, letterSpacing: 1, marginBottom: 4, fontFamily: font }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: col || C.text, fontFamily: mono, lineHeight: 1 }}>{val}</div>
        </div>
    );
}

export function InputGrid({ fields }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${fields.length}, 1fr)`, gap: 8, padding: "12px" }}>
            {fields.map(([lbl, v, s]) => (
                <div key={lbl}>
                    <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, textAlign: "center", fontFamily: font }}>{lbl}</div>
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
                            padding: compact ? "10px 12px" : "10px 16px",
                            minHeight: 44,
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
