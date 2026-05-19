import { useMemo } from "react";
import { C, font, mono } from "../../constants";

const MAX_ITEMS = 5;

// イベントタイプの色とラベル（モックアップの「業務端末感」に準拠）
const EVENT_STYLES = {
    hit: { color: C.orange, icon: "★", label: "大当たり" },
    chainStart: { color: C.orange, icon: "▸", label: "初当たり" },
    chainAdd: { color: C.yellow, icon: "▸", label: "連チャン追加" },
    chainEnd: { color: C.blue, icon: "■", label: "連チャン終了" },
    singleEnd: { color: C.blue, icon: "■", label: "単発終了" },
    rotStart: { color: C.sub, icon: "·", label: "スタート" },
    rotInput: { color: C.sub, icon: "·", label: "回転入力" },
    afterJp: { color: C.teal, icon: "▸", label: "大当たり後" },
    other: { color: C.sub, icon: "·", label: "" },
};

function sesTypeToStyle(type) {
    if (!type) return EVENT_STYLES.other;
    if (type === "初当たり" || type === "初当たり記録") return EVENT_STYLES.chainStart;
    if (type === "連チャン追加") return EVENT_STYLES.chainAdd;
    if (type === "連チャン終了") return EVENT_STYLES.chainEnd;
    if (type === "単発終了") return EVENT_STYLES.singleEnd;
    if (type === "スタート") return EVENT_STYLES.rotStart;
    if (type === "大当たり後スタート") return EVENT_STYLES.afterJp;
    if (type === "data" || type === "data記録") return EVENT_STYLES.rotInput;
    return { ...EVENT_STYLES.other, label: type };
}

// 大当たりラベル組み立て
function hitLabel(hit, chain) {
    const rounds = hit.rounds || hit.rawRounds || 0;
    const mult = hit.mult && hit.mult > 1 ? `×${hit.mult}` : "";
    const ht = chain?.hitType ? `${chain.hitType} ` : "";
    if (rounds > 0) return `${ht}${rounds}R${mult}`.trim();
    return ht.trim() || "大当たり";
}

// sesLog エントリのサブ情報を組み立て
function sesSubText(e) {
    const parts = [];
    if (e.rot != null) parts.push(`${e.rot}回転`);
    if (e.rounds != null && e.rounds > 0) parts.push(`${e.rounds}R`);
    if (e.cash != null && e.cash > 0) parts.push(`-${e.cash}円`);
    return parts.join("・");
}

export function RecentEventList({ jpLog = [], sesLog = [], anchorId }) {
    const events = useMemo(() => {
        const list = [];

        // jpLog 由来：各チェーンの hits[] を「大当たり」イベントとして展開
        (jpLog || []).forEach((chain) => {
            (chain.hits || []).forEach((hit) => {
                list.push({
                    kind: "hit",
                    time: hit.time || chain.time || "",
                    style: EVENT_STYLES.hit,
                    label: hitLabel(hit, chain),
                    sub: chain.hitType === "単発" ? "" : "",
                });
            });
        });

        // sesLog 由来：判断系・終了系のみピックアップ（ノイズ除外）
        (sesLog || []).forEach((e) => {
            if (!e || !e.type) return;
            // "data記録" や生入力は除外し、節目イベントのみ表示
            const skip = e.type === "data" || e.type === "data記録";
            if (skip) return;
            // hit は jpLog 側で表示するので重複防止
            if (e.type === "初当たり") {
                list.push({
                    kind: "ses",
                    time: e.time || "",
                    style: EVENT_STYLES.chainStart,
                    label: e.rot != null ? `初当たり ${e.rot}回転` : "初当たり",
                    sub: "",
                });
                return;
            }
            const style = sesTypeToStyle(e.type);
            list.push({
                kind: "ses",
                time: e.time || "",
                style,
                label: style.label || e.type,
                sub: sesSubText(e),
            });
        });

        // 時系列降順（最新が先頭）
        // time は "HH:MM" 文字列なので辞書順で十分（同日内のみ）
        list.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));
        return list.slice(0, MAX_ITEMS);
    }, [jpLog, sesLog]);

    return (
        <div
            id={anchorId}
            style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "10px 12px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontFamily: font,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.text,
                    letterSpacing: 0.3,
                    marginBottom: 4,
                }}
            >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                    </svg>
                    直近イベント
                </span>
                {events.length > 0 && (
                    <span style={{ fontSize: 10, color: C.sub, fontWeight: 600, fontFamily: mono }}>
                        {events.length}件
                    </span>
                )}
            </div>

            {events.length === 0 ? (
                <div style={{ fontSize: 11, color: C.sub, padding: "10px 4px", textAlign: "center" }}>
                    イベントはまだありません
                </div>
            ) : (
                events.map((e, i) => (
                    <div
                        key={i}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "48px 1fr",
                            alignItems: "center",
                            gap: 10,
                            padding: "6px 6px",
                            borderRadius: 8,
                            background: `color-mix(in srgb, ${e.style.color} 6%, transparent)`,
                            minHeight: 32,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: C.subHi,
                                fontFamily: mono,
                                fontVariantNumeric: "tabular-nums",
                                letterSpacing: 0.5,
                            }}
                        >
                            {e.time || "--:--"}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span
                                aria-hidden="true"
                                style={{
                                    flexShrink: 0,
                                    color: e.style.color,
                                    fontSize: 13,
                                    fontWeight: 800,
                                    width: 14,
                                    textAlign: "center",
                                }}
                            >
                                {e.style.icon}
                            </span>
                            <span
                                style={{
                                    fontSize: 12,
                                    color: C.text,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    minWidth: 0,
                                }}
                            >
                                {e.label}
                                {e.sub && (
                                    <span style={{ color: C.sub, fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
                                        {e.sub}
                                    </span>
                                )}
                            </span>
                        </span>
                    </div>
                ))
            )}
        </div>
    );
}
