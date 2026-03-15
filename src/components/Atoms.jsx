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

export function Btn({ label, onClick, bg = C.surfaceHi, fg = C.text, bd = C.borderHi, fs = 14, primary = false }) {
    return (
        <button
            className="b"
            onClick={onClick}
            style={{
                background: primary ? "linear-gradient(135deg, #3b82f6, #2563eb)" : bg,
                border: primary ? "none" : `1px solid ${bd}`,
                borderRadius: 12,
                color: primary ? "#fff" : fg,
                fontSize: fs,
                fontWeight: 700,
                padding: "16px 0",
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

export function ModeToggle({ mode, setMode }) {
    return (
        <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: 24, padding: 3, gap: 4 }}>
            {["現金", "持ち玉"].map((m) => (
                <button
                    key={m}
                    className="b"
                    onClick={() => setMode(m)}
                    style={{
                        background: mode === m ? "rgba(255,255,255,0.1)" : "transparent",
                        border: "none",
                        borderRadius: 20,
                        color: mode === m ? C.text : C.sub,
                        fontSize: 12,
                        fontWeight: mode === m ? 700 : 500,
                        padding: "6px 16px",
                        fontFamily: font,
                        boxShadow: mode === m ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                    }}
                >
                    {m}
                </button>
            ))}
        </div>
    );
}
